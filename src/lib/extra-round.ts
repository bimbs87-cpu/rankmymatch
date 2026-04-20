/**
 * Extra round helpers.
 *
 * - createExtraRound: inserts a new round flagged as `is_extra`, then renumbers
 *   all rounds in the season chronologically by `scheduled_date` so the extra
 *   slot lands in its correct calendar position. Sends a push notification to
 *   group members so they can open the presence list.
 * - renumberSeasonRounds: re-sequences round_number based on scheduled_date.
 */
import { supabase } from "@/integrations/supabase/client";
import { notifyGroupMembers } from "@/lib/notify";

export async function renumberSeasonRounds(seasonId: string) {
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, scheduled_date, status, round_number, created_at")
    .eq("season_id", seasonId);

  if (!rounds || rounds.length === 0) return;

  // Sort: cancelled stays at end keeping relative order; non-cancelled by date asc,
  // tie-breaking by created_at to keep stable order for same-date rounds.
  const ordered = [...rounds].sort((a, b) => {
    if (a.status === "cancelled" && b.status !== "cancelled") return 1;
    if (b.status === "cancelled" && a.status !== "cancelled") return -1;
    const da = a.scheduled_date || "9999-12-31";
    const db = b.scheduled_date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Update only rows whose number changed
  const updates = ordered
    .map((r, idx) => ({ id: r.id, newNumber: idx + 1, oldNumber: r.round_number }))
    .filter((u) => u.newNumber !== u.oldNumber);

  await Promise.all(
    updates.map((u) =>
      supabase.from("rounds").update({ round_number: u.newNumber }).eq("id", u.id),
    ),
  );
}

export async function createExtraRound(params: {
  groupId: string;
  seasonId: string;
  actorId: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  location?: string | null;
}) {
  const { groupId, seasonId, actorId, scheduledDate, scheduledTime, location } = params;

  // Fetch group defaults
  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("name, match_format, max_players")
    .eq("id", groupId)
    .single();
  if (gErr || !group) throw new Error("Erro ao carregar grupo");

  // Insert as last for now; renumber afterwards.
  const { data: existing } = await supabase
    .from("rounds")
    .select("round_number")
    .eq("season_id", seasonId);
  const tempNumber = (existing || []).reduce((m, r) => Math.max(m, r.round_number || 0), 0) + 1;

  const insertPayload = {
    group_id: groupId,
    season_id: seasonId,
    round_number: tempNumber,
    scheduled_date: scheduledDate,
    status: "scheduled" as const,
    match_format: group.match_format,
    max_players: group.max_players,
    is_extra: true,
    ...(scheduledTime ? { scheduled_time: scheduledTime } : {}),
    ...(location && location.trim() ? { location: location.trim() } : {}),
  };

  const { data: created, error } = await supabase
    .from("rounds")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error || !created) throw error || new Error("Erro ao criar rodada");

  // Re-sequence so the extra round lands in its chronological position
  await renumberSeasonRounds(seasonId);

  // Best-effort push notification
  try {
    const formatted = new Date(scheduledDate + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const timeText = scheduledTime ? ` às ${scheduledTime.slice(0, 5)}` : "";
    await notifyGroupMembers({
      groupId,
      actorId,
      type: "extra_round_created",
      title: `Rodada extra em ${group.name}`,
      body: `Nova rodada extra ${formatted}${timeText}. Confirme presença!`,
      url: `/groups/${groupId}/seasons/${seasonId}/rounds/${created.id}`,
      data: { roundId: created.id, seasonId, groupId },
      tag: `extra_round:${created.id}`,
    });
  } catch {
    /* push is optional */
  }

  return created.id;
}
