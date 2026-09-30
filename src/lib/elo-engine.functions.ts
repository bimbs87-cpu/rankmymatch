import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================================
// Input schema
// ============================================================================
const SubmitMatchScoreInput = z.object({
  matchId: z.string().uuid(),
  seasonId: z.string().uuid(),
  deferNotification: z.boolean().optional(),
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

const NotifySavedMatchesInput = z.object({
  matchIds: z.array(z.string().uuid()).min(1).max(50),
  seasonId: z.string().uuid(),
});

/** One result alert per involved player, after all sets in the save have persisted. */
async function notifySavedMatches(matchIds: string[], seasonId: string, userId: string, supabase: typeof supabaseAdmin) {
  const ids = [...new Set(matchIds)];
  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("id, round_id, round:rounds!inner(group_id, season_id), match_players(user_id, team), match_sets(set_number, score_team_a, score_team_b)")
    .in("id", ids);
  if (matchError) throw new Error(matchError.message);
  if (!matches || matches.length !== ids.length) throw new Error("Partidas não encontradas");
  const groupIds = new Set(matches.map((match) => (match.round as unknown as { group_id: string }).group_id));
  const roundIds = new Set(matches.map((match) => match.round_id));
  if (groupIds.size !== 1 || roundIds.size !== 1 || matches.some((match) =>
    (match.round as unknown as { season_id: string | null }).season_id !== seasonId
  )) throw new Error("As partidas devem pertencer à mesma rodada e temporada");
  const groupId = [...groupIds][0];
  const roundId = [...roundIds][0];
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_group_admin", {
    _user_id: userId, _group_id: groupId,
  });
  if (adminError) throw new Error(adminError.message);
  if (!isAdmin) throw new Error("Apenas administradores do grupo podem avisar os jogadores");

  const playerIds = [...new Set(matches.flatMap((match) => match.match_players.map((player) => player.user_id)))];
  if (!playerIds.length) return;
  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles").select("user_id, name, nickname").in("user_id", playerIds);
  if (profileError) throw new Error(profileError.message);
  const firstNames = new Map((profiles ?? []).map((profile) => [
    profile.user_id, (profile.nickname || profile.name).trim().split(/\s+/)[0] || "Jogador",
  ]));
  const messages = new Map<string, string[]>();
  for (const match of matches) {
    const players = [...match.match_players].sort((a, b) => a.team.localeCompare(b.team));
    const names = players.map((player) => firstNames.get(player.user_id) || "Jogador").join(", ");
    const scores = [...match.match_sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((set) => `${set.score_team_a}x${set.score_team_b}`).join(", ");
    if (!scores) continue;
    for (const player of players) {
      const own = messages.get(player.user_id) ?? [];
      own.push(`${names} - ${scores}`);
      messages.set(player.user_id, own);
    }
  }

  const title = "Resultado registrado";
  const url = `/groups/${groupId}?view=seasons&season=${seasonId}&round=${roundId}`;
  const data = { groupId, seasonId, roundId };
  const { sendPushToUserIds } = await import("@/lib/web-push.server");
  for (const [recipient, results] of messages) {
    const body = `${results.join("; ")}. Confira os detalhes`;
    const { error } = await supabase.from("notifications").insert({
      user_id: recipient, group_id: groupId, type: "match_result", title, body, data,
    });
    if (error) console.error("[matchResult] notification insert failed", error);
    const push = await sendPushToUserIds([recipient], {
      title, body, url, type: "match_result", tag: `match_result:${roundId}`, data,
    });
    if (push.error) console.warn("[matchResult] push delivery", push.error);
  }
}

export const notifySavedMatchResultsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NotifySavedMatchesInput.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await notifySavedMatches(data.matchIds, data.seasonId, context.userId, context.supabase as typeof supabaseAdmin);
    } catch (error) {
      console.error("[matchResult] batch notification failed", error);
      throw error;
    }
    return { ok: true };
  });

// ============================================================================
// Server function
// ============================================================================
export const submitMatchScoreServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitMatchScoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const { matchId, seasonId, sets, deferNotification } = data;
    const { userId } = context;
    const requestId = crypto.randomUUID().slice(0, 8);
    console.info("[submitMatchScore] start", { requestId, matchId, seasonId, userId, sets: sets.length });

    // Authorize on the server before invoking the privileged, atomic database operation.
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("id, round_id, match_number, rounds:rounds!inner(group_id, round_number)")
      .eq("id", matchId)
      .maybeSingle();
    if (matchErr) throw new Error(matchErr.message);
    if (!match) throw new Error("Partida não encontrada");
    const groupId = (match.rounds as unknown as { group_id: string } | null)?.group_id;
    if (!groupId) throw new Error("Grupo da rodada não encontrado");
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_group_admin", {
      _user_id: userId,
      _group_id: groupId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Apenas administradores do grupo podem registrar resultados");

    const { data: saved, error: saveErr } = await supabaseAdmin.rpc("save_match_score_consistently", {
      _actor: userId,
      _match_id: matchId,
      _season_id: seasonId,
      _sets: sets,
    });
    if (saveErr) throw new Error(`Falha ao salvar resultado: ${saveErr.message}`);
    const result = saved?.[0];
    if (!result) throw new Error("Resultado não confirmado");
    const { winner_team: winnerTeam, sets_a: setsA, sets_b: setsB, edited: isEdit } = result;
    // A completed result is the source of truth for this fan-out. Do not let
    // notification delivery turn a successfully saved match into a failed save.
    if (!deferNotification) {
      try {
        await notifySavedMatches([matchId], seasonId, userId, supabaseAdmin);
      } catch (notificationError) {
        console.error("[submitMatchScore] result notification failed", notificationError);
      }
    }

    console.info("[submitMatchScore] done", { requestId, matchId, winnerTeam, edited: isEdit });
    return { winnerTeam, setsA, setsB, edited: isEdit };
  });

// processMatchEloServer is implemented in ./elo-engine.server.ts and re-exported above.

