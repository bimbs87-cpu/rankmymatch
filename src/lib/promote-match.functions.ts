import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processMatchEloServer } from "@/lib/elo-engine.functions";

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

    // 7. Notify all players
    const allPlayerIds = [...teamA, ...teamB];
    const notifRows = allPlayerIds.map((uid) => ({
      user_id: uid,
      group_id: groupId,
      type: "match_promoted",
      title: "Confronto promovido para o ranking",
      body: recomputedElo
        ? "Um admin promoveu uma partida e o Elo foi recalculado."
        : "Um admin promoveu uma partida para contar no ranking.",
      data: { match_id: matchId, season_id: seasonId, promoted_by: userId },
    }));
    await supabaseAdmin.from("notifications").insert(notifRows);

    return { success: true, recomputedElo };
  });
