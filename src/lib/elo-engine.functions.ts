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
    const isDraw = winnerTeam === null;
    const { data: players, error: playersErr } = await supabaseAdmin
      .from("match_players").select("user_id, team").eq("match_id", matchId);
    if (playersErr) throw new Error(playersErr.message);
    const teamA = (players ?? []).filter((p) => p.team === "A").map((p) => p.user_id);
    const teamB = (players ?? []).filter((p) => p.team === "B").map((p) => p.user_id);

    // A completed result is the source of truth for this fan-out. Do not let
    // notification delivery turn a successfully saved match into a failed save.
    try {
      const playerIds = Array.from(new Set([...teamA, ...teamB]));
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, name, nickname")
        .in("user_id", playerIds);
      const { data: group } = await supabaseAdmin.from("groups").select("name").eq("id", groupId).maybeSingle();
      const names = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname || p.name]));
      const side = (ids: string[]) => ids.map((id) => names.get(id) || "Jogador").join(" / ");
      const score = sets.map((s) => `${s.scoreA}×${s.scoreB}`).join(" · ");
      const round = match.rounds as unknown as { group_id: string; round_number: number | null };
      const title = `${isEdit ? "Resultado atualizado" : "Resultado registrado"} · ${group?.name || "Grupo"}`;
      const body = `Rodada ${round.round_number ?? "—"}, partida ${match.match_number ?? "—"}: ${side(teamA)} x ${side(teamB)} · ${score}${isDraw ? " · Empate" : ""}`;
      const url = `/groups/${groupId}?view=seasons&season=${seasonId}&round=${match.round_id}&match=${matchId}`;
      const data = { groupId, seasonId, roundId: match.round_id, matchId };
      const { error: notificationError } = await supabaseAdmin.from("notifications").insert(
        playerIds.map((id) => ({ user_id: id, group_id: groupId, type: "match_result", title, body, data })),
      );
      if (notificationError) console.error("[submitMatchScore] notification insert failed", notificationError);
      const { sendPushToUserIds } = await import("@/lib/web-push.server");
      const push = await sendPushToUserIds(playerIds, {
        title, body, url, type: "match_result", tag: `match_result:${matchId}`, data,
      });
      if (push.error) console.warn("[submitMatchScore] push delivery", push.error);
    } catch (notificationError) {
      console.error("[submitMatchScore] result notification failed", notificationError);
    }

    console.info("[submitMatchScore] done", { requestId, matchId, winnerTeam, edited: isEdit });
    return { winnerTeam, setsA, setsB, edited: isEdit };
  });

// processMatchEloServer is implemented in ./elo-engine.server.ts and re-exported above.

