import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recomputeRoundStatusInternal } from "@/lib/round-status.server";
// Audit logs are written via supabaseAdmin directly below.

/**
 * Match maintenance server functions.
 *
 * - `detectDesyncedMatchesServerFn`: returns matches in a group that have sets
 *   recorded but status='scheduled' (left behind by old builds / interrupted saves).
 * - `finalizeDesyncedMatchesServerFn`: for each desynced match, computes the
 *   winner from existing sets and sets status='completed', and processes Elo if
 *   no rating_events exist yet for the match.
 * - `reopenMatchServerFn`: flips a completed match back to 'scheduled', removes
 *   sets and rating_events so the score can be re-entered cleanly.
 */

// ---------- shared helpers ----------
async function ensureGroupAdmin(userId: string, groupId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_group_admin", {
    _user_id: userId,
    _group_id: groupId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores do grupo podem executar esta ação");
}

function computeWinnerFromSets(
  sets: { score_team_a: number; score_team_b: number }[],
): { winner: "A" | "B" | null; setsA: number; setsB: number; gamesA: number; gamesB: number } {
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
  const winner: "A" | "B" | null = setsA > setsB ? "A" : setsB > setsA ? "B" : null;
  return { winner, setsA, setsB, gamesA, gamesB };
}

// ---------- DETECT ----------
const DetectInput = z.object({ groupId: z.string().uuid() });

export const detectDesyncedMatchesServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DetectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { groupId } = data;
    await ensureGroupAdmin(context.userId, groupId);

    // Pull all scheduled matches in this group with their sets.
    const { data: matches, error } = await supabaseAdmin
      .from("matches")
      .select(
        "id, status, round_id, match_number, rounds!inner(group_id, round_number, scheduled_date), match_sets(score_team_a, score_team_b, set_number)",
      )
      .eq("status", "scheduled")
      .eq("rounds.group_id", groupId);
    if (error) throw new Error(error.message);

    const desynced = (matches || [])
      .filter((m: any) => Array.isArray(m.match_sets) && m.match_sets.length > 0)
      .map((m: any) => {
        const { winner, setsA, setsB } = computeWinnerFromSets(m.match_sets);
        return {
          matchId: m.id as string,
          roundId: m.round_id as string,
          roundNumber: m.rounds?.round_number ?? null,
          scheduledDate: m.rounds?.scheduled_date ?? null,
          matchNumber: m.match_number ?? null,
          setsCount: m.match_sets.length,
          setsA,
          setsB,
          winner,
        };
      });

    return { desynced };
  });

// ---------- FINALIZE ----------
const FinalizeInput = z.object({
  groupId: z.string().uuid(),
  matchIds: z.array(z.string().uuid()).min(1).max(200),
});

export const finalizeDesyncedMatchesServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FinalizeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { groupId, matchIds } = data;
    await ensureGroupAdmin(context.userId, groupId);

    const results: { matchId: string; ok: boolean; reason?: string }[] = [];
    const touchedRounds = new Set<string>();

    // Lazy import to keep .server out of static client trace.
    const { processMatchEloServer } = await import("@/lib/elo-engine.server");

    for (const matchId of matchIds) {
      try {
        const { data: match } = await supabaseAdmin
          .from("matches")
          .select(
            "id, status, round_id, rounds!inner(group_id, season_id), match_sets(set_number, score_team_a, score_team_b), match_players(user_id, team)",
          )
          .eq("id", matchId)
          .maybeSingle();

        if (!match) {
          results.push({ matchId, ok: false, reason: "Partida não encontrada" });
          continue;
        }
        const round = match.rounds as unknown as { group_id: string; season_id: string | null } | null;
        if (round?.group_id !== groupId) {
          results.push({ matchId, ok: false, reason: "Partida fora do grupo" });
          continue;
        }
        if (match.status !== "scheduled") {
          results.push({ matchId, ok: false, reason: "Já finalizada" });
          continue;
        }
        const sets = (match.match_sets || []) as { set_number: number; score_team_a: number; score_team_b: number }[];
        if (sets.length === 0) {
          results.push({ matchId, ok: false, reason: "Sem sets gravados" });
          continue;
        }
        const { winner, setsA, setsB, gamesA, gamesB } = computeWinnerFromSets(sets);
        if (!winner) {
          results.push({ matchId, ok: false, reason: "Empate em sets" });
          continue;
        }

        // Update match -> completed (use 'normal' to satisfy DB CHECK constraint)
        const { error: updErr } = await supabaseAdmin
          .from("matches")
          .update({
            status: "completed",
            winner_team: winner,
            result_type: "normal",
          })
          .eq("id", matchId);
        if (updErr) {
          results.push({ matchId, ok: false, reason: `Falha ao finalizar: ${updErr.message}` });
          continue;
        }

        // Process Elo only if no rating_events exist yet for this match
        const players = (match.match_players || []) as { user_id: string; team: string }[];
        const teamA = players.filter((p) => p.team === "A").map((p) => p.user_id);
        const teamB = players.filter((p) => p.team === "B").map((p) => p.user_id);
        const seasonId = round?.season_id;

        const { data: existingEvents } = await supabaseAdmin
          .from("rating_events")
          .select("id")
          .eq("match_id", matchId)
          .limit(1);

        if (seasonId && teamA.length && teamB.length && !existingEvents?.length) {
          await processMatchEloServer({
            matchId,
            seasonId,
            teamA,
            teamB,
            winnerTeam: winner,
            setsTeamA: setsA,
            setsTeamB: setsB,
            gamesTeamA: gamesA,
            gamesTeamB: gamesB,
          });
        }

        if (match.round_id) touchedRounds.add(match.round_id);
        results.push({ matchId, ok: true });
      } catch (e: any) {
        results.push({ matchId, ok: false, reason: e?.message || "Erro" });
      }
    }

    // Recompute round statuses once per round
    for (const rid of touchedRounds) {
      try {
        await recomputeRoundStatusInternal(rid);
      } catch {
        // best-effort
      }
    }

    // Best-effort audit log (client-side; here we use admin client for fidelity)
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        group_id: groupId,
        action: "match_score_edited",
        entity_type: "match",
        entity_id: null,
        reason: "Manutenção: finalização automática de partidas dessincronizadas",
        new_data: { finalized: results.filter((r) => r.ok).map((r) => r.matchId) } as never,
        old_data: null,
      });
    } catch {
      // ignore
    }

    return {
      results,
      okCount: results.filter((r) => r.ok).length,
      failCount: results.filter((r) => !r.ok).length,
    };
  });

// ---------- REOPEN ----------
const ReopenInput = z.object({
  matchId: z.string().uuid(),
  reason: z.string().max(300).optional(),
});

export const reopenMatchServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReopenInput.parse(input))
  .handler(async ({ data, context }) => {
    const { matchId, reason } = data;

    const { data: match, error } = await supabaseAdmin
      .from("matches")
      .select("id, status, round_id, rounds!inner(group_id), match_sets(set_number, score_team_a, score_team_b)")
      .eq("id", matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Partida não encontrada");

    const groupId = (match.rounds as unknown as { group_id: string } | null)?.group_id;
    if (!groupId) throw new Error("Grupo não encontrado");
    await ensureGroupAdmin(context.userId, groupId);

    const oldSets = match.match_sets;

    // Wipe sets and rating events tied to this match so it can be re-scored cleanly.
    const { error: delEvErr } = await supabaseAdmin.from("rating_events").delete().eq("match_id", matchId);
    if (delEvErr) throw new Error(`Falha ao limpar eventos: ${delEvErr.message}`);
    const { error: delSetsErr } = await supabaseAdmin.from("match_sets").delete().eq("match_id", matchId);
    if (delSetsErr) throw new Error(`Falha ao limpar sets: ${delSetsErr.message}`);

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("matches")
      .update({
        status: "scheduled",
        winner_team: null,
        result_type: null,
      })
      .eq("id", matchId)
      .select("id, status")
      .maybeSingle();
    if (updErr) throw new Error(`Falha ao reabrir partida: ${updErr.message}`);
    if (!updated || updated.status !== "scheduled") {
      throw new Error("Falha ao reabrir partida: nenhum registro atualizado");
    }

    if (match.round_id) {
      try {
        await recomputeRoundStatusInternal(match.round_id);
      } catch {
        // best-effort
      }
    }

    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        group_id: groupId,
        action: "match_score_edited",
        entity_type: "match",
        entity_id: matchId,
        reason: reason || "Partida reaberta para regravar placar",
        old_data: { sets: oldSets, status: match.status } as never,
        new_data: { status: "scheduled", sets: [] } as never,
      });
    } catch {
      // ignore
    }

    return { ok: true };
  });

// ---------- INVALID SCHEDULED_DATE ----------
// Rounds whose scheduled_date is unrealistic (e.g. accidental year 0002 from a
// typo in a date input) break chronological sorting in charts. We treat anything
// older than 2010-01-01 as invalid and offer to clear it (fall back to created_at).
const MIN_VALID_DATE = "2010-01-01";

const InvalidDatesInput = z.object({ groupId: z.string().uuid() });

export const detectInvalidRoundDatesServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InvalidDatesInput.parse(input))
  .handler(async ({ data, context }) => {
    const { groupId } = data;
    await ensureGroupAdmin(context.userId, groupId);

    const { data: rounds, error } = await supabaseAdmin
      .from("rounds")
      .select("id, round_number, scheduled_date, created_at")
      .eq("group_id", groupId)
      .lt("scheduled_date", MIN_VALID_DATE)
      .order("scheduled_date", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      rounds: (rounds || []).map((r) => ({
        roundId: r.id as string,
        roundNumber: r.round_number ?? null,
        scheduledDate: r.scheduled_date as string | null,
        createdAt: r.created_at as string,
      })),
    };
  });

const FixInvalidDatesInput = z.object({
  groupId: z.string().uuid(),
  roundIds: z.array(z.string().uuid()).min(1).max(500),
});

export const fixInvalidRoundDatesServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FixInvalidDatesInput.parse(input))
  .handler(async ({ data, context }) => {
    const { groupId, roundIds } = data;
    await ensureGroupAdmin(context.userId, groupId);

    // Fetch the rounds (so we can use created_at as the fallback date) and
    // make sure they all belong to this group.
    const { data: rounds, error } = await supabaseAdmin
      .from("rounds")
      .select("id, group_id, scheduled_date, created_at")
      .in("id", roundIds);
    if (error) throw new Error(error.message);

    const eligible = (rounds || []).filter(
      (r) =>
        r.group_id === groupId &&
        (!r.scheduled_date || r.scheduled_date < MIN_VALID_DATE),
    );

    let okCount = 0;
    const failed: { roundId: string; reason: string }[] = [];
    for (const r of eligible) {
      const fallback = (r.created_at || new Date().toISOString()).slice(0, 10);
      const { error: updErr } = await supabaseAdmin
        .from("rounds")
        .update({ scheduled_date: fallback })
        .eq("id", r.id);
      if (updErr) failed.push({ roundId: r.id, reason: updErr.message });
      else okCount++;
    }

    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        group_id: groupId,
        action: "round_date_fixed",
        entity_type: "round",
        entity_id: null,
        reason: "Manutenção: corrigir scheduled_date inválido (< 2010)",
        new_data: { fixed: eligible.map((r) => r.id), okCount, failCount: failed.length } as never,
        old_data: null,
      });
    } catch {
      // ignore
    }

    return { okCount, failCount: failed.length, failed };
  });
