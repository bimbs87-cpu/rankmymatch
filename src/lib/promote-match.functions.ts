import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processMatchEloServer } from "@/lib/elo-engine.server";

const Input = z.object({
  matchId: z.string().uuid(),
});

/**
 * Promote a casual / non-ranking match to a ranking-counting match.
 * - Marks `counts_for_ranking = true`
 * - Recomputes Elo retroactively (creates rating_events + updates ranking_snapshots)
 * - Notifies all players of the match
 *
 * Idempotent: if the match already has rating_events, Elo is NOT recomputed
 * (avoids double-counting). Only the flag flip + notifications happen.
 */
export const promoteMatchToRankingServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { matchId } = data;
    const { userId } = context;

    // 1. Load match + round + group
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("id, status, round_id, counts_for_ranking, winner_team, rounds:rounds!inner(group_id, season_id)")
      .eq("id", matchId)
      .maybeSingle();

    if (matchErr) throw new Error(matchErr.message);
    if (!match) throw new Error("Partida não encontrada");
    if (match.status !== "completed") {
      throw new Error("Apenas partidas finalizadas podem ser promovidas");
    }
    if (match.counts_for_ranking) {
      throw new Error("Esta partida já conta para o ranking");
    }
    if (!match.winner_team) {
      throw new Error("Partida sem time vencedor definido");
    }

    const round = match.rounds as unknown as { group_id: string; season_id: string | null } | null;
    const groupId = round?.group_id;
    const seasonId = round?.season_id;
    if (!groupId) throw new Error("Grupo da partida não encontrado");

    // 2. Authorization — must be group admin
    const { data: isAdmin, error: adminErr } = await supabaseAdmin.rpc("is_group_admin", {
      _user_id: userId,
      _group_id: groupId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem promover partidas");

    // 3. Load players + sets
    const [playersRes, setsRes] = await Promise.all([
      supabaseAdmin.from("match_players").select("user_id, team").eq("match_id", matchId),
      supabaseAdmin.from("match_sets").select("score_team_a, score_team_b").eq("match_id", matchId),
    ]);
    if (playersRes.error) throw new Error(playersRes.error.message);
    if (setsRes.error) throw new Error(setsRes.error.message);

    const players = playersRes.data || [];
    const sets = setsRes.data || [];
    const teamA = players.filter((p) => p.team === "A").map((p) => p.user_id);
    const teamB = players.filter((p) => p.team === "B").map((p) => p.user_id);
    if (!teamA.length || !teamB.length) throw new Error("Times incompletos");

    // 4. Tally
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const s of sets) {
      gamesA += s.score_team_a;
      gamesB += s.score_team_b;
      if (s.score_team_a > s.score_team_b) setsA++;
      else if (s.score_team_b > s.score_team_a) setsB++;
    }
    const winnerTeam = match.winner_team as "A" | "B";

    // 5. Flip the flag
    const { error: updErr } = await supabaseAdmin
      .from("matches")
      .update({ counts_for_ranking: true })
      .eq("id", matchId);
    if (updErr) throw new Error(updErr.message);

    // 6. Recompute Elo retroactively (only if no prior rating_events exist & we have a season)
    let recomputedElo = false;
    if (seasonId) {
      const { data: existingEvents } = await supabaseAdmin
        .from("rating_events")
        .select("id")
        .eq("match_id", matchId)
        .limit(1);
      if (!existingEvents?.length) {
        await processMatchEloServer({
          matchId,
          seasonId,
          teamA,
          teamB,
          winnerTeam,
          setsTeamA: setsA,
          setsTeamB: setsB,
          gamesTeamA: gamesA,
          gamesTeamB: gamesB,
        });
        recomputedElo = true;
      }
    }

    // 7. Notify all players (in-app + best-effort push grouped by match)
    const allPlayerIds = [...teamA, ...teamB];
    const promotedTitle = "Confronto promovido para o ranking";
    const promotedBody = recomputedElo
      ? "Um admin promoveu uma partida e o Elo foi recalculado."
      : "Um admin promoveu uma partida para contar no ranking.";
    const notifRows = allPlayerIds.map((uid) => ({
      user_id: uid,
      group_id: groupId,
      type: "match_promoted",
      title: promotedTitle,
      body: promotedBody,
      data: { match_id: matchId, season_id: seasonId, promoted_by: userId },
    }));
    await supabaseAdmin.from("notifications").insert(notifRows);

    // Best-effort push, grouped by match so multiple promotions don't flood.
    try {
      const { sendPushToUserIds } = await import("@/lib/web-push.server");
      void sendPushToUserIds(
        allPlayerIds.filter((u) => u !== userId),
        {
          title: promotedTitle,
          body: promotedBody,
          url: `/groups/${groupId}`,
          type: "match_promoted",
          tag: `match_promoted:${matchId}`,
          data: { groupId, matchId, seasonId },
        },
      ).catch(() => {});
    } catch {
      /* push optional */
    }


    // 8. Audit log — capture per-player Elo deltas if recomputed
    let eloDeltas: Record<string, { before: number; after: number; change: number }> = {};
    if (recomputedElo && seasonId) {
      const { data: evs } = await supabaseAdmin
        .from("rating_events")
        .select("user_id, rating_before, rating_after, rating_change")
        .eq("match_id", matchId);
      for (const ev of evs || []) {
        eloDeltas[ev.user_id] = {
          before: Number(ev.rating_before),
          after: Number(ev.rating_after),
          change: Number(ev.rating_change),
        };
      }
    }
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      group_id: groupId,
      action: "match_promoted",
      entity_type: "match",
      entity_id: matchId,
      reason: recomputedElo ? "Promoção com recálculo de Elo" : "Promoção sem recálculo (sem temporada)",
      new_data: {
        counts_for_ranking: true,
        season_id: seasonId,
        winner_team: winnerTeam,
        team_a: teamA,
        team_b: teamB,
        sets_a: setsA,
        sets_b: setsB,
        games_a: gamesA,
        games_b: gamesB,
        recomputed_elo: recomputedElo,
        elo_deltas: eloDeltas,
      },
      old_data: { counts_for_ranking: false },
    });

    return { success: true, recomputedElo };
  });

/**
 * Revert a previously promoted match — undo the Elo events and snapshots,
 * mark counts_for_ranking = false, and notify players.
 *
 * Steps:
 *  1. Validate match + admin authorization
 *  2. Load rating_events for this match
 *  3. For each affected player: subtract aggregate stat deltas from their snapshot
 *     (matches_played, matches_won, sets/games for/against, rating reverts to first event's rating_before)
 *  4. Delete rating_events for this match
 *  5. Recompute is_eligible + position rank for the season
 *  6. Update match: counts_for_ranking = false
 *  7. Notify players
 */
export const revertMatchPromotionServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { matchId } = data;
    const { userId } = context;

    // 1. Load match + round
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("id, status, counts_for_ranking, winner_team, round_id, rounds:rounds!inner(group_id, season_id)")
      .eq("id", matchId)
      .maybeSingle();
    if (matchErr) throw new Error(matchErr.message);
    if (!match) throw new Error("Partida não encontrada");
    if (!match.counts_for_ranking) {
      throw new Error("Esta partida já não conta para o ranking");
    }

    const round = match.rounds as unknown as { group_id: string; season_id: string | null } | null;
    const groupId = round?.group_id;
    const seasonId = round?.season_id;
    if (!groupId) throw new Error("Grupo da partida não encontrado");

    // 2. Auth
    const { data: isAdmin, error: adminErr } = await supabaseAdmin.rpc("is_group_admin", {
      _user_id: userId,
      _group_id: groupId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem reverter promoções");

    // 3. Load match players & sets to compute the stat deltas to subtract
    const [playersRes, setsRes] = await Promise.all([
      supabaseAdmin.from("match_players").select("user_id, team").eq("match_id", matchId),
      supabaseAdmin.from("match_sets").select("score_team_a, score_team_b").eq("match_id", matchId),
    ]);
    if (playersRes.error) throw new Error(playersRes.error.message);
    if (setsRes.error) throw new Error(setsRes.error.message);

    const eventsRes = seasonId
      ? await supabaseAdmin
          .from("rating_events")
          .select("user_id, rating_before, rating_after")
          .eq("match_id", matchId)
      : { data: [] as Array<{ user_id: string; rating_before: number; rating_after: number }>, error: null };

    const players = playersRes.data || [];
    const sets = setsRes.data || [];
    const teamA = players.filter((p) => p.team === "A").map((p) => p.user_id);
    const teamB = players.filter((p) => p.team === "B").map((p) => p.user_id);

    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const s of sets) {
      gamesA += s.score_team_a;
      gamesB += s.score_team_b;
      if (s.score_team_a > s.score_team_b) setsA++;
      else if (s.score_team_b > s.score_team_a) setsB++;
    }
    const winnerTeam = match.winner_team as "A" | "B" | null;

    let revertedElo = false;
    const events = eventsRes?.data || [];

    if (seasonId && events.length) {
      // Build a map of rating_before per user (the value to restore)
      const ratingBeforeMap = new Map<string, number>();
      for (const ev of events) {
        // If multiple events somehow exist, keep the EARLIEST rating_before
        if (!ratingBeforeMap.has(ev.user_id)) {
          ratingBeforeMap.set(ev.user_id, Number(ev.rating_before));
        }
      }

      // Load current snapshots for affected players
      const allPlayerIds = [...teamA, ...teamB];
      const { data: snapshots } = await supabaseAdmin
        .from("ranking_snapshots")
        .select("*")
        .eq("season_id", seasonId)
        .in("user_id", allPlayerIds);

      const updates: Array<PromiseLike<unknown>> = [];
      for (const snap of snapshots || []) {
        const uid = snap.user_id;
        const isTeamA = teamA.includes(uid);
        const isTeamB = teamB.includes(uid);
        if (!isTeamA && !isTeamB) continue;

        const isWinner =
          (isTeamA && winnerTeam === "A") || (isTeamB && winnerTeam === "B");

        const newMatchesPlayed = Math.max(0, (snap.matches_played || 0) - 1);
        const newMatchesWon = Math.max(0, (snap.matches_won || 0) - (isWinner ? 1 : 0));
        const newSetsWon = Math.max(0, (snap.sets_won || 0) - (isTeamA ? setsA : setsB));
        const newSetsLost = Math.max(0, (snap.sets_lost || 0) - (isTeamA ? setsB : setsA));
        const newGamesWon = Math.max(0, (snap.games_won || 0) - (isTeamA ? gamesA : gamesB));
        const newGamesLost = Math.max(0, (snap.games_lost || 0) - (isTeamA ? gamesB : gamesA));
        const newRating = ratingBeforeMap.get(uid) ?? Number(snap.rating);

        updates.push(
          supabaseAdmin
            .from("ranking_snapshots")
            .update({
              rating: newRating,
              matches_played: newMatchesPlayed,
              matches_won: newMatchesWon,
              sets_won: newSetsWon,
              sets_lost: newSetsLost,
              games_won: newGamesWon,
              games_lost: newGamesLost,
              is_eligible: newMatchesPlayed >= 3,
            })
            .eq("id", snap.id),
        );
      }
      await Promise.all(updates);

      // Delete the rating_events for this match
      await supabaseAdmin.from("rating_events").delete().eq("match_id", matchId);

      // Recompute position rank
      const { data: ranked } = await supabaseAdmin
        .from("ranking_snapshots")
        .select("id, rating")
        .eq("season_id", seasonId)
        .eq("is_eligible", true)
        .order("rating", { ascending: false });
      if (ranked) {
        await Promise.all(
          ranked.map((r, i) =>
            supabaseAdmin.from("ranking_snapshots").update({ position: i + 1 }).eq("id", r.id),
          ),
        );
      }
      revertedElo = true;
    }

    // 6. Flip the flag
    const { error: updErr } = await supabaseAdmin
      .from("matches")
      .update({ counts_for_ranking: false })
      .eq("id", matchId);
    if (updErr) throw new Error(updErr.message);

    // 7. Notify players
    const allPlayerIds = [...teamA, ...teamB];
    if (allPlayerIds.length) {
      const notifRows = allPlayerIds.map((uid) => ({
        user_id: uid,
        group_id: groupId,
        type: "match_unpromoted",
        title: "Promoção de confronto revertida",
        body: revertedElo
          ? "Um admin reverteu a promoção e o Elo foi desfeito."
          : "Um admin marcou esta partida como avulsa novamente.",
        data: { match_id: matchId, season_id: seasonId, reverted_by: userId },
      }));
      await supabaseAdmin.from("notifications").insert(notifRows);
    }

    // 8. Audit log — capture per-player Elo deltas that were reverted
    const eloDeltas: Record<string, { before: number; after: number; change: number }> = {};
    for (const ev of events) {
      eloDeltas[ev.user_id] = {
        before: Number(ev.rating_before),
        after: Number(ev.rating_after),
        change: Number(ev.rating_after) - Number(ev.rating_before),
      };
    }
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      group_id: groupId,
      action: "match_promotion_reverted",
      entity_type: "match",
      entity_id: matchId,
      reason: revertedElo ? "Reversão com desfazimento de Elo" : "Reversão sem desfazimento (sem eventos prévios)",
      new_data: {
        counts_for_ranking: false,
        season_id: seasonId,
        winner_team: winnerTeam,
        team_a: teamA,
        team_b: teamB,
        sets_a: setsA,
        sets_b: setsB,
        games_a: gamesA,
        games_b: gamesB,
        reverted_elo: revertedElo,
        elo_deltas_reverted: eloDeltas,
      },
      old_data: { counts_for_ranking: true },
    });

    return { success: true, revertedElo };
  });
