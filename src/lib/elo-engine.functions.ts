import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recomputeRoundStatusInternal } from "@/lib/round-status.server";
import { processMatchEloServer } from "@/lib/elo-engine.server";

export { processMatchEloServer } from "@/lib/elo-engine.server";

// ============================================================================
// Elo math (duplicated server-side; keep in sync with src/lib/elo-engine.ts)
// ============================================================================
const BASE_K = 28;
const INITIAL_RATING = 1000;

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function marginMultiplier(setsWon: number, setsLost: number, gamesWon: number, gamesLost: number): number {
  const setDiff = setsWon - setsLost;
  const gameDiff = gamesWon - gamesLost;
  return 1 + setDiff * 0.1 + Math.max(0, gameDiff) * 0.02;
}

function kFactor(matchesPlayed: number): number {
  if (matchesPlayed < 10) return 40;
  if (matchesPlayed < 30) return 32;
  return BASE_K;
}

function isValidSetScore(a: number, b: number): { valid: boolean; reason?: string } {
  if (a === b) return { valid: false, reason: "Empate não é permitido" };
  if (a === 0 && b === 0) return { valid: false, reason: "Placar vazio" };
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner === 6 && loser <= 4) return { valid: true };
  if (winner === 7 && (loser === 5 || loser === 6)) return { valid: true };
  if (winner > 7) return { valid: false, reason: "Placar máximo é 7" };
  if (winner < 6) return { valid: false, reason: "Mínimo 6 games para vencer" };
  return { valid: false, reason: "Placar inválido" };
}

// ============================================================================
// Input schema
// ============================================================================
const SubmitMatchScoreInput = z.object({
  matchId: z.string().uuid(),
  seasonId: z.string().uuid(),
  sets: z
    .array(
      z.object({
        setNumber: z.number().int().min(1).max(99),
        scoreA: z.number().int().min(0).max(99),
        scoreB: z.number().int().min(0).max(99),
      }),
    )
    .min(1)
    .max(99),
});

// ============================================================================
// Server function
// ============================================================================
export const submitMatchScoreServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitMatchScoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const { matchId, seasonId, sets } = data;
    const { userId } = context;

    // ---- 1. Load match + round + group, validate authorization & status ----
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("id, status, round_id, rounds:rounds!inner(group_id)")
      .eq("id", matchId)
      .maybeSingle();

    if (matchErr) throw new Error(matchErr.message);
    if (!match) throw new Error("Partida não encontrada");
    if (match.status !== "scheduled") {
      throw new Error("Esta partida já foi finalizada");
    }

    const groupId = (match.rounds as unknown as { group_id: string } | null)?.group_id;
    if (!groupId) throw new Error("Grupo da rodada não encontrado");

    const { data: isAdmin, error: adminErr } = await supabaseAdmin.rpc("is_group_admin", {
      _user_id: userId,
      _group_id: groupId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Apenas administradores do grupo podem registrar resultados");

    // ---- 2. Validate each set score ----
    for (const s of sets) {
      const v = isValidSetScore(s.scoreA, s.scoreB);
      if (!v.valid) {
        throw new Error(`Set ${s.setNumber} inválido: ${v.reason}`);
      }
    }

    // ---- 3. Load match players ----
    const { data: players, error: playersErr } = await supabaseAdmin
      .from("match_players")
      .select("user_id, team")
      .eq("match_id", matchId);
    if (playersErr) throw new Error(playersErr.message);
    if (!players?.length) throw new Error("Nenhum jogador encontrado");

    const teamA = players.filter((p) => p.team === "A").map((p) => p.user_id);
    const teamB = players.filter((p) => p.team === "B").map((p) => p.user_id);
    if (!teamA.length || !teamB.length) throw new Error("Times incompletos");

    // ---- 4. Replace sets ----
    await supabaseAdmin.from("match_sets").delete().eq("match_id", matchId);
    await supabaseAdmin.from("match_sets").insert(
      sets.map((s) => ({
        match_id: matchId,
        set_number: s.setNumber,
        score_team_a: s.scoreA,
        score_team_b: s.scoreB,
        is_tiebreak: s.setNumber === sets.length && sets.length >= 3,
      })),
    );

    // ---- 5. Determine winner ----
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const s of sets) {
      gamesA += s.scoreA;
      gamesB += s.scoreB;
      if (s.scoreA > s.scoreB) setsA++;
      else if (s.scoreB > s.scoreA) setsB++;
    }
    const winnerTeam: "A" | "B" | null = setsA > setsB ? "A" : setsB > setsA ? "B" : null;
    if (!winnerTeam) throw new Error("Empate em sets — adicione o tiebreak");

    // ---- 6. Update match ----
    await supabaseAdmin
      .from("matches")
      .update({
        status: "completed",
        winner_team: winnerTeam,
        result_type: sets.length === 1 ? "single_set" : sets.length === 2 ? "straight" : "tiebreak",
      })
      .eq("id", matchId);

    // ---- 7. Auto-confirm presence + recompute round status ----
    if (match.round_id) {
      const allPlayerIds = [...teamA, ...teamB];
      const nowIso = new Date().toISOString();
      await Promise.all(
        allPlayerIds.map((uid) =>
          supabaseAdmin.from("round_presence").upsert(
            {
              round_id: match.round_id,
              user_id: uid,
              status: "confirmed",
              confirmed_at: nowIso,
            },
            { onConflict: "round_id,user_id" },
          ),
        ),
      );

      // Single source of truth for round status (Parte 2 / Parte 5)
      await recomputeRoundStatusInternal(match.round_id);
    }

    // ---- 8. Process Elo ----
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

    return { winnerTeam, setsA, setsB };
  });

// ============================================================================
// Server-side Elo processing (mirrors processMatchElo, uses supabaseAdmin)
// ============================================================================
interface MatchResultServer {
  matchId: string;
  seasonId: string;
  teamA: string[];
  teamB: string[];
  winnerTeam: "A" | "B";
  setsTeamA: number;
  setsTeamB: number;
  gamesTeamA: number;
  gamesTeamB: number;
}

export async function processMatchEloServer(result: MatchResultServer) {
  const allPlayerIds = [...result.teamA, ...result.teamB];

  const { data: snapshots } = await supabaseAdmin
    .from("ranking_snapshots")
    .select("*")
    .eq("season_id", result.seasonId)
    .in("user_id", allPlayerIds);

  const ratingMap = new Map<
    string,
    {
      rating: number;
      matchesPlayed: number;
      matchesWon: number;
      setsWon: number;
      setsLost: number;
      gamesWon: number;
      gamesLost: number;
      snapshotId: string | null;
    }
  >();

  for (const pid of allPlayerIds) {
    const snap = snapshots?.find((s) => s.user_id === pid);
    ratingMap.set(pid, {
      rating: snap ? Number(snap.rating) : INITIAL_RATING,
      matchesPlayed: snap?.matches_played || 0,
      matchesWon: snap?.matches_won || 0,
      setsWon: snap?.sets_won || 0,
      setsLost: snap?.sets_lost || 0,
      gamesWon: snap?.games_won || 0,
      gamesLost: snap?.games_lost || 0,
      snapshotId: snap?.id || null,
    });
  }

  const avgRatingA =
    result.teamA.reduce((sum, id) => sum + (ratingMap.get(id)?.rating || INITIAL_RATING), 0) /
    result.teamA.length;
  const avgRatingB =
    result.teamB.reduce((sum, id) => sum + (ratingMap.get(id)?.rating || INITIAL_RATING), 0) /
    result.teamB.length;

  const expectedA = expectedScore(avgRatingA, avgRatingB);
  const expectedB = 1 - expectedA;
  const actualA = result.winnerTeam === "A" ? 1 : 0;
  const actualB = 1 - actualA;

  const mm = marginMultiplier(
    result.winnerTeam === "A" ? result.setsTeamA : result.setsTeamB,
    result.winnerTeam === "A" ? result.setsTeamB : result.setsTeamA,
    result.winnerTeam === "A" ? result.gamesTeamA : result.gamesTeamB,
    result.winnerTeam === "A" ? result.gamesTeamB : result.gamesTeamA,
  );

  const ratingEvents: Array<{
    user_id: string;
    match_id: string;
    season_id: string;
    rating_before: number;
    rating_after: number;
    rating_change: number;
    k_factor: number;
    expected_score: number;
    actual_score: number;
    margin_multiplier: number;
  }> = [];
  const snapshotUpserts: Array<{
    id: string | null;
    user_id: string;
    season_id: string;
    rating: number;
    matches_played: number;
    matches_won: number;
    sets_won: number;
    sets_lost: number;
    games_won: number;
    games_lost: number;
    is_eligible: boolean;
    snapshot_date: string;
  }> = [];

  for (const pid of allPlayerIds) {
    const current = ratingMap.get(pid)!;
    const isTeamA = result.teamA.includes(pid);
    const expected = isTeamA ? expectedA : expectedB;
    const actual = isTeamA ? actualA : actualB;
    const k = kFactor(current.matchesPlayed);
    const change = Math.round(k * mm * (actual - expected) * 100) / 100;
    const newRating = current.rating + change;
    const isWinner =
      (isTeamA && result.winnerTeam === "A") || (!isTeamA && result.winnerTeam === "B");

    ratingEvents.push({
      user_id: pid,
      match_id: result.matchId,
      season_id: result.seasonId,
      rating_before: current.rating,
      rating_after: newRating,
      rating_change: change,
      k_factor: k,
      expected_score: expected,
      actual_score: actual,
      margin_multiplier: mm,
    });

    snapshotUpserts.push({
      id: current.snapshotId,
      user_id: pid,
      season_id: result.seasonId,
      rating: newRating,
      matches_played: current.matchesPlayed + 1,
      matches_won: current.matchesWon + (isWinner ? 1 : 0),
      sets_won: current.setsWon + (isTeamA ? result.setsTeamA : result.setsTeamB),
      sets_lost: current.setsLost + (isTeamA ? result.setsTeamB : result.setsTeamA),
      games_won: current.gamesWon + (isTeamA ? result.gamesTeamA : result.gamesTeamB),
      games_lost: current.gamesLost + (isTeamA ? result.gamesTeamB : result.gamesTeamA),
      is_eligible: current.matchesPlayed + 1 >= 3,
      snapshot_date: new Date().toISOString().split("T")[0],
    });
  }

  await supabaseAdmin.from("rating_events").insert(ratingEvents);

  await Promise.all(
    snapshotUpserts.map((snap) => {
      if (snap.id) {
        const { id, ...updateData } = snap;
        return supabaseAdmin.from("ranking_snapshots").update(updateData).eq("id", id);
      } else {
        const { id: _id, ...insertData } = snap;
        return supabaseAdmin.from("ranking_snapshots").insert(insertData);
      }
    }),
  );

  const { data: allSnapshots } = await supabaseAdmin
    .from("ranking_snapshots")
    .select("id, rating")
    .eq("season_id", result.seasonId)
    .eq("is_eligible", true)
    .order("rating", { ascending: false });

  if (allSnapshots) {
    await Promise.all(
      allSnapshots.map((snap, i) =>
        supabaseAdmin.from("ranking_snapshots").update({ position: i + 1 }).eq("id", snap.id),
      ),
    );
  }
}
