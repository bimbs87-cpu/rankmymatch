import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recomputeRoundStatusInternal } from "@/lib/round-status.server";
import { processMatchEloServer } from "@/lib/elo-engine.server";


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

// processMatchEloServer is implemented in ./elo-engine.server.ts and re-exported above.

