import { supabase } from "@/integrations/supabase/client";
import { notifyGroupMembers } from "@/hooks/use-notifications";
import { revertMatchElo } from "@/lib/elo-engine";
import { recomputeRoundStatus } from "@/lib/round-status";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

export async function createRound(data: {
  groupId: string;
  seasonId: string;
  roundNumber: number;
  scheduledDate?: string;
  scheduledTime?: string;
  location?: string;
  maxPlayers?: number;
  matchFormat?: string;
  userId: string;
}) {
  const isSingles = data.matchFormat === "singles";

  // Round sizing — derive from group when caller didn't provide:
  // - singles rivalry: 2
  // - singles league/casual: group.max_players (fallback 8)
  // - doubles: simultaneous_courts * 4 (King of the Court when 1 court → 4 players)
  let resolvedMaxPlayers = data.maxPlayers;
  let groupSinglesType: string | null = null;
  const { data: groupRow } = await supabase
    .from("groups")
    .select("singles_group_type, max_players, simultaneous_courts")
    .eq("id", data.groupId)
    .single();
  groupSinglesType = groupRow?.singles_group_type ?? null;
  if (!resolvedMaxPlayers) {
    if (isSingles) {
      if (groupSinglesType === "rivalry") {
        resolvedMaxPlayers = 2;
      } else {
        resolvedMaxPlayers = groupRow?.max_players && groupRow.max_players >= 2
          ? groupRow.max_players
          : 8;
      }
    } else {
      const courts = groupRow?.simultaneous_courts && groupRow.simultaneous_courts >= 1
        ? groupRow.simultaneous_courts
        : 1;
      resolvedMaxPlayers = courts * 4;
    }
  }

  const { data: round, error } = await supabase
    .from("rounds")
    .insert({
      group_id: data.groupId,
      season_id: data.seasonId,
      round_number: data.roundNumber,
      scheduled_date: data.scheduledDate || null,
      scheduled_time: data.scheduledTime || null,
      location: data.location || null,
      max_players: resolvedMaxPlayers || 4,
      match_format: isSingles ? "singles" : "doubles",
      status: "scheduled",
    })
    .select()
    .single();
  if (error) throw error;

  // Rivalry auto-confirm: ONLY when the group is explicitly singles_group_type = 'rivalry'.
  // We no longer infer rivalry from member count or max_players.
  if (isSingles && groupSinglesType === "rivalry") {
    const { data: activeMembers } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", data.groupId)
      .eq("status", "active");

    if (activeMembers && activeMembers.length === 2) {
      const nowIso = new Date().toISOString();
      await supabase.from("round_presence").upsert(
        activeMembers.map((m) => ({
          round_id: round.id,
          user_id: m.user_id,
          status: "confirmed",
          confirmed_at: nowIso,
        })),
        { onConflict: "round_id,user_id" }
      );
    }
  }

  notifyGroupMembers({
    groupId: data.groupId,
    actorId: data.userId,
    type: "round_created",
    title: "Nova rodada agendada!",
    body: `Rodada ${data.roundNumber}${data.scheduledDate ? ` em ${new Date(data.scheduledDate + "T00:00:00").toLocaleDateString("pt-BR")}` : ""} foi criada. Confirme sua presença!`,
    data: { roundId: round.id, seasonId: data.seasonId },
    // Group multiple "nova rodada" pings per group so they collapse on the device.
    tag: `new_round:${data.groupId}`,
  });

  return round;
}

// In-flight guards to make user-triggered actions idempotent against rapid
// double-clicks. Keys are scoped per round+user (or per round) so unrelated
// actions don't block each other. Promises are cleared on settle.
const inFlightConfirm = new Map<string, Promise<void>>();
const inFlightRivalryDraw = new Map<string, Promise<void>>();
const inFlightAutoDraw = new Map<string, Promise<void>>();
const inFlightDrawTeams = new Map<string, Promise<any[]>>();

export async function confirmPresence(roundId: string, userId: string) {
  const key = `${roundId}:${userId}`;
  const existing = inFlightConfirm.get(key);
  if (existing) {
    console.info("[confirmPresence] dedup: reusing in-flight call", { key });
    return existing;
  }

  const run = (async () => {
    console.info("[confirmPresence] start", { roundId, userId });
    const { error } = await supabase.from("round_presence").upsert(
      {
        round_id: roundId,
        user_id: userId,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "round_id,user_id" }
    );
    if (error) {
      const { error: insertError } = await supabase.from("round_presence").insert({
        round_id: roundId,
        user_id: userId,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
    }
    console.info("[confirmPresence] upsert ok (idempotent)", { roundId, userId });
  })();

  inFlightConfirm.set(key, run);
  run.finally(() => inFlightConfirm.delete(key));
  await run;

  // GA4 event — presence confirmed
  try {
    void import("@/lib/analytics").then(({ trackEvent }) =>
      trackEvent("presence_confirmed", { round_id: roundId }),
    );
  } catch {
    /* ignore */
  }

  // Fan-out notification: let other already-confirmed players know someone joined.
  // Best-effort, never blocks UX.
  try {
    void notifyPresenceChange(roundId, userId, "confirmed");
  } catch {
    // ignore
  }

  // Rivalry auto-create match: when a 1v1 (rivalry) round has both members
  // confirmed and no match exists yet, create the match automatically so the
  // next step is just "Lançar resultado" — no manual draw is needed.
  try {
    void autoCreateRivalryMatchIfReady(roundId, userId);
  } catch {
    // ignore — best-effort
  }

  // Auto-draw doubles round when capacity is reached (e.g. King of the Court
  // — 4 players on a single court → 3 matches with the official rotation).
  try {
    void autoDrawDoublesIfFull(roundId, userId);
  } catch {
    // ignore — best-effort
  }
}

async function autoCreateRivalryMatchIfReady(roundId: string, actorId: string): Promise<void> {
  const existing = inFlightRivalryDraw.get(roundId);
  if (existing) {
    console.info("[autoCreateRivalryMatch] dedup: reusing in-flight draw", { roundId });
    return existing;
  }

  const run = (async () => {
    const { data: roundRow } = await supabase
      .from("rounds")
      .select("id, group_id, match_format")
      .eq("id", roundId)
      .single();
    if (!roundRow) return;
    if (roundRow.match_format !== "singles") return;

    const { data: groupRow } = await supabase
      .from("groups")
      .select("singles_group_type")
      .eq("id", roundRow.group_id)
      .single();
    if (groupRow?.singles_group_type !== "rivalry") return;

    // Already has a match? Skip. (Re-checked inside the lock to close TOCTOU.)
    const { count: matchCount } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("round_id", roundId);
    if ((matchCount ?? 0) > 0) {
      console.info("[autoCreateRivalryMatch] skip: match already exists", {
        roundId,
        matchCount,
      });
      return;
    }

    const { data: confirmed } = await supabase
      .from("round_presence")
      .select("user_id")
      .eq("round_id", roundId)
      .eq("status", "confirmed");
    const confirmedIds = (confirmed || []).map((p) => p.user_id);
    if (confirmedIds.length !== 2) return;

    console.info("[autoCreateRivalryMatch] creating match", { roundId, confirmedIds });
    await drawTeams(roundId, confirmedIds, actorId);
  })();

  inFlightRivalryDraw.set(roundId, run);
  run.finally(() => inFlightRivalryDraw.delete(roundId));
  return run;
}

/**
 * Auto-draw a doubles round when capacity is reached. Idempotent — only fires
 * when the round has no matches yet and the count of confirmed players is
 * exactly max_players (4 for 1-court "King of the Court", 8 for 2 courts...).
 * Players ordered by Elo are drawn via `drawTeams`, which also fans out
 * per-player in-app notifications. We then push web notifications too.
 */
async function autoDrawDoublesIfFull(roundId: string, actorId: string): Promise<void> {
  const existing = inFlightAutoDraw.get(roundId);
  if (existing) return existing;

  const run = (async () => {
    const { data: roundRow } = await supabase
      .from("rounds")
      .select("id, group_id, match_format, max_players, status")
      .eq("id", roundId)
      .single();
    if (!roundRow) return;
    if (roundRow.match_format !== "doubles") return;
    if (!["scheduled", "in_progress", "open", "presence_open"].includes(roundRow.status)) return;

    const { count: matchCount } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("round_id", roundId);
    if ((matchCount ?? 0) > 0) return;

    const { data: confirmed } = await supabase
      .from("round_presence")
      .select("user_id, confirmed_at")
      .eq("round_id", roundId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: true });
    const confirmedIds = (confirmed || []).map((p) => p.user_id);
    const target = roundRow.max_players ?? 0;
    if (target < 4) return;
    if (confirmedIds.length < target) return;

    // Take exactly the first `target` confirmed players (FIFO). Anyone beyond
    // is already on the waiting list and won't be drawn.
    const drawnIds = confirmedIds.slice(0, target);
    console.info("[autoDrawDoubles] drawing teams (round full)", {
      roundId,
      target,
      confirmed: confirmedIds.length,
    });
    await drawTeams(roundId, drawnIds, actorId);

    // Fan out a web push so involved players are notified immediately
    // (drawTeams already inserts in-app notifications).
    try {
      const { sendPushFn } = await import("@/lib/push.functions");
      void sendPushFn({
        data: {
          userIds: drawnIds,
          payload: {
            title: "Sorteio realizado! 🎲",
            body: target === 4
              ? "A rodada está completa. Veja os confrontos do Rei da Quadra."
              : "A rodada está completa. Veja seus confrontos.",
            url: `/groups/${roundRow.group_id}`,
            tag: `draw_completed:${roundId}`,
            type: "draw_completed",
            data: { roundId, groupId: roundRow.group_id },
          },
        },
      });
    } catch (err) {
      console.error("[autoDrawDoubles] push failed:", err);
    }
  })();

  inFlightAutoDraw.set(roundId, run);
  run.finally(() => inFlightAutoDraw.delete(roundId));
  return run;
}

/**
 * Notify the OTHER confirmed players in the round that someone changed presence.
 * Used for both confirmar and recusar — keeps the active group aware in real time.
 */
async function notifyPresenceChange(
  roundId: string,
  actorId: string,
  kind: "confirmed" | "declined",
): Promise<void> {
  try {
    const { data: roundRow } = await supabase
      .from("rounds")
      .select("group_id, round_number")
      .eq("id", roundId)
      .single();
    if (!roundRow) return;

    // Recipients = currently-confirmed players in this round, minus the actor
    const { data: confirmed } = await supabase
      .from("round_presence")
      .select("user_id")
      .eq("round_id", roundId)
      .eq("status", "confirmed");
    const recipientIds = Array.from(
      new Set((confirmed || []).map((p) => p.user_id).filter((u) => u && u !== actorId)),
    );
    if (!recipientIds.length) return;

    // Resolve actor name for a friendlier message
    let actorName = "Alguém";
    try {
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("name, nickname")
        .eq("user_id", actorId)
        .maybeSingle();
      actorName = prof?.nickname || prof?.name || "Alguém";
    } catch {
      // ignore
    }

    const roundLabel = roundRow.round_number ? `Rodada ${roundRow.round_number}` : "Próxima rodada";
    const title =
      kind === "confirmed"
        ? `✅ ${actorName} confirmou presença`
        : `❌ ${actorName} desistiu da rodada`;
    const body =
      kind === "confirmed"
        ? `${actorName} entrou na lista da ${roundLabel}.`
        : `${actorName} saiu da lista da ${roundLabel}.`;

    const { notifyUsers } = await import("@/lib/notify");
    await notifyUsers(
      recipientIds,
      {
        groupId: roundRow.group_id,
        actorId,
        type: kind === "confirmed" ? "presence_confirmed" : "presence_declined",
        title,
        body,
        data: { roundId },
        url: `/groups/${roundRow.group_id}`,
        // Group all presence changes for the same round under one OS notification
        // so multiple confirmations don't flood the notification tray.
        tag: `presence_change:${roundId}`,
      },
      `/groups/${roundRow.group_id}`,
    );
  } catch {
    // best-effort
  }
}

export async function cancelPresence(
  roundId: string,
  userId: string,
): Promise<{ promotedUserId: string | null; promotedName: string | null }> {
  // Was the canceller occupying a confirmed slot (within max_players)?
  const { data: roundRow } = await supabase
    .from("rounds")
    .select("id, group_id, max_players, round_number")
    .eq("id", roundId)
    .single();

  let wasInConfirmedSlot = false;
  if (roundRow) {
    const { data: confirmedList } = await supabase
      .from("round_presence")
      .select("user_id, confirmed_at")
      .eq("round_id", roundId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: true });
    const idx = (confirmedList || []).findIndex((p) => p.user_id === userId);
    wasInConfirmedSlot = idx >= 0 && idx < (roundRow.max_players ?? 0);
  }

  await supabase
    .from("round_presence")
    .update({ status: "absent" })
    .eq("round_id", roundId)
    .eq("user_id", userId);

  // Fan-out: notify the remaining confirmed players that someone left.
  try {
    void notifyPresenceChange(roundId, userId, "declined");
  } catch {
    // ignore
  }

  // Auto-promote first waitlist member if a confirmed slot just opened
  let promotedId: string | null = null;
  let promotedName: string | null = null;
  if (wasInConfirmedSlot && roundRow) {
    promotedId = await promoteFirstWaitlist(roundId, roundRow.group_id, roundRow.round_number ?? null);
    if (promotedId) {
      // Resolve the promoted user's display name (best-effort) so callers can toast
      try {
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("name, nickname")
          .eq("user_id", promotedId)
          .maybeSingle();
        promotedName = prof?.nickname || prof?.name || null;
      } catch {
        // ignore
      }
      // Audit log: track auto-promotion (best-effort, non-blocking)
      try {
        const { logAudit } = await import("@/lib/audit-log");
        void logAudit({
          groupId: roundRow.group_id,
          action: "waitlist_auto_promoted",
          entityType: "round",
          entityId: roundId,
          newData: {
            promoted_user_id: promotedId,
            vacated_by_user_id: userId,
            round_number: roundRow.round_number ?? null,
          },
        });
      } catch {
        // ignore
      }
    }
  }
  return { promotedUserId: promotedId, promotedName };
}

/**
 * Find the first member on the waiting list (confirmed status, beyond max_players
 * when ordered by confirmed_at ASC) and "promote" them by refreshing their
 * confirmed_at to now — which puts them inside the cutoff. Sends an in-app
 * notification + push: "Você está dentro!".
 *
 * Returns the promoted user_id, or null if nobody to promote.
 */
export async function promoteFirstWaitlist(
  roundId: string,
  groupId: string,
  roundNumber: number | null,
): Promise<string | null> {
  const { data: roundRow } = await supabase
    .from("rounds")
    .select("max_players")
    .eq("id", roundId)
    .single();
  const maxPlayers = roundRow?.max_players ?? 0;
  if (!maxPlayers) return null;

  const { data: confirmedList } = await supabase
    .from("round_presence")
    .select("user_id, confirmed_at")
    .eq("round_id", roundId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true });

  const list = confirmedList || [];
  // First waitlist entry = first index >= maxPlayers
  const promoted = list[maxPlayers];
  if (!promoted) return null;

  // Refresh confirmed_at so they slide into the active slot. Use a timestamp
  // earlier than "now" but later than all existing confirmed entries so we
  // don't displace anyone already in. Easiest: use the displaced person's
  // original confirmed_at (which just got freed) or now() — both place the
  // promoted user inside the cutoff since one slot is now empty.
  const newTs = new Date().toISOString();
  await supabase
    .from("round_presence")
    .update({ confirmed_at: newTs })
    .eq("round_id", roundId)
    .eq("user_id", promoted.user_id);

  // Notify the promoted member
  const title = "🎉 Você está dentro!";
  const body = roundNumber
    ? `Abriu vaga na Rodada ${roundNumber}. Você saiu da lista de espera e está confirmado!`
    : `Abriu vaga na próxima rodada. Você saiu da lista de espera e está confirmado!`;
  try {
    await supabase.from("notifications").insert({
      user_id: promoted.user_id,
      group_id: groupId,
      type: "waitlist_promoted",
      title,
      body,
      data: { roundId },
    });
  } catch {
    // ignore
  }
  try {
    const { sendPushFn } = await import("@/lib/push.functions");
    void sendPushFn({
      headers: await getServerFnAuthHeaders(),
      data: {
        userIds: [promoted.user_id],
        payload: {
          title,
          body,
          url: `/groups/${groupId}`,
          type: "waitlist_promoted",
          tag: `waitlist_promoted:${roundId}`,
          data: { roundId },
        },
      },
    }).catch(() => {});
  } catch {
    // ignore
  }
  return promoted.user_id;
}

/**
 * Admin-triggered: manually promote a specific waitlist user into a confirmed
 * slot. Pushes the last confirmed person into the waiting list by swapping
 * their confirmed_at timestamps.
 */
export async function adminPromoteFromWaitlist(
  roundId: string,
  groupId: string,
  waitlistUserId: string,
  roundNumber: number | null,
): Promise<void> {
  const { data: roundRow } = await supabase
    .from("rounds")
    .select("max_players")
    .eq("id", roundId)
    .single();
  const maxPlayers = roundRow?.max_players ?? 0;
  if (!maxPlayers) throw new Error("Rodada sem capacidade definida");

  const { data: confirmedList } = await supabase
    .from("round_presence")
    .select("user_id, confirmed_at")
    .eq("round_id", roundId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true });

  const list = confirmedList || [];
  const lastConfirmed = list[maxPlayers - 1];
  const target = list.find((p) => p.user_id === waitlistUserId);
  if (!target) throw new Error("Jogador não está confirmado nesta rodada");
  if (!lastConfirmed) throw new Error("Nenhum confirmado para deslocar");
  if (lastConfirmed.user_id === waitlistUserId) {
    // Already inside the cutoff
    return;
  }

  // Swap timestamps: waitlist user gets last-confirmed's timestamp (slides in),
  // last-confirmed user gets a fresh "now" timestamp (slides out to waitlist).
  const lastTs = lastConfirmed.confirmed_at || new Date(Date.now() - 1000).toISOString();
  const nowTs = new Date().toISOString();
  await supabase
    .from("round_presence")
    .update({ confirmed_at: lastTs })
    .eq("round_id", roundId)
    .eq("user_id", waitlistUserId);
  await supabase
    .from("round_presence")
    .update({ confirmed_at: nowTs })
    .eq("round_id", roundId)
    .eq("user_id", lastConfirmed.user_id);

  // Notify promoted user
  const title = "🎉 Você está dentro!";
  const body = roundNumber
    ? `Um admin te promoveu da lista de espera para a Rodada ${roundNumber}. Você está confirmado!`
    : `Um admin te promoveu da lista de espera. Você está confirmado!`;
  try {
    await supabase.from("notifications").insert({
      user_id: waitlistUserId,
      group_id: groupId,
      type: "waitlist_promoted",
      title,
      body,
      data: { roundId },
    });
  } catch {
    // ignore
  }
  try {
    const { sendPushFn } = await import("@/lib/push.functions");
    void sendPushFn({
      headers: await getServerFnAuthHeaders(),
      data: {
        userIds: [waitlistUserId],
        payload: {
          title,
          body,
          url: `/groups/${groupId}`,
          type: "waitlist_promoted",
          tag: `waitlist_promoted:${roundId}`,
          data: { roundId },
        },
      },
    }).catch(() => {});
  } catch {
    // ignore
  }

  // Audit log for manual promotion (mirrors waitlist_auto_promoted)
  try {
    const { logAudit } = await import("@/lib/audit-log");
    void logAudit({
      groupId,
      action: "waitlist_manual_promoted",
      entityType: "round",
      entityId: roundId,
      newData: {
        promoted_user_id: waitlistUserId,
        displaced_user_id: lastConfirmed.user_id,
        round_number: roundNumber,
      },
    });
  } catch {
    // ignore
  }
}

// King of the Court — Doubles (4 players exactly).
// Official rotation: every player partners with every other player exactly once
// across 3 matches. Players come ordered by Elo (1 = highest).
//   Match 1 → (1+4) vs (2+3)
//   Match 2 → (1+3) vs (2+4)
//   Match 3 → (1+2) vs (3+4)
function buildDoublesKingOfCourt(orderedIds: string[]): Array<[string[], string[]]> {
  if (orderedIds.length !== 4) return [];
  const [p1, p2, p3, p4] = orderedIds;
  return [
    [[p1, p4], [p2, p3]],
    [[p1, p3], [p2, p4]],
    [[p1, p2], [p3, p4]],
  ];
}

// Build singles pairings ordered by Elo (King of the Court).
// 4 players — official fixed cycle, indexed by round_number (1-based, cycles every 3):
//   round 1 → 1v4 / 2v3
//   round 2 → 1v3 / 2v4
//   round 3 → 1v2 / 3v4
// 6+ players (even): classic round-robin (circle method) ordered by Elo, returns one round.
function buildSinglesPairs(orderedIds: string[], roundNumber = 1): Array<[string, string]> {
  const n = orderedIds.length;
  if (n < 2 || n % 2 !== 0) return [];

  if (n === 4) {
    const [p1, p2, p3, p4] = orderedIds;
    const cycle: Array<Array<[string, string]>> = [
      [[p1, p4], [p2, p3]], // round 1
      [[p1, p3], [p2, p4]], // round 2
      [[p1, p2], [p3, p4]], // round 3
    ];
    const idx = ((Math.max(1, roundNumber) - 1) % 3 + 3) % 3;
    return cycle[idx];
  }

  const pairs: Array<[string, string]> = [];
  const half = n / 2;
  const left = orderedIds.slice(0, half);
  const right = orderedIds.slice(half).reverse();
  for (let i = 0; i < half; i++) {
    pairs.push([left[i], right[i]]);
  }
  return pairs;
}

// Shuffle and draw teams for 2v2 padel matches; for singles, pair by Elo (King of the Court).
export async function drawTeams(roundId: string, confirmedPlayerIds: string[], actorId?: string) {
  const existingDraw = inFlightDrawTeams.get(roundId);
  if (existingDraw) return existingDraw;

  const run = (async () => {
  const { data: roundData } = await supabase
    .from("rounds")
    .select("round_number, group_id, match_format, season_id")
    .eq("id", roundId)
    .single();

  const { data: groupData } = roundData?.group_id
    ? await supabase
      .from("groups")
      .select("simultaneous_courts")
      .eq("id", roundData.group_id)
      .maybeSingle()
    : { data: null } as any;

  const isSingles = roundData?.match_format === "singles";
  const isOneCourtDoubles = !isSingles && (groupData?.simultaneous_courts ?? 1) === 1;
  const playersPerMatch = isSingles ? 2 : 4;

  const { data: existingMatches } = await supabase
    .from("matches")
    .select("id")
    .eq("round_id", roundId)
    .limit(1);
  if (existingMatches?.length) return existingMatches as any[];

  let eligiblePlayerIds = confirmedPlayerIds;
  if (isOneCourtDoubles) {
    const { data: confirmedRows } = await supabase
      .from("round_presence")
      .select("user_id, confirmed_at")
      .eq("round_id", roundId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: true });
    eligiblePlayerIds = (confirmedRows || []).map((p) => p.user_id).slice(0, 4);
  }

  let pairings: Array<string[]> = [];

  if (isSingles && roundData?.season_id && eligiblePlayerIds.length >= 2 && eligiblePlayerIds.length % 2 === 0) {
    const { data: snapshots } = await supabase
      .from("ranking_snapshots")
      .select("user_id, rating, snapshot_date")
      .eq("season_id", roundData.season_id)
      .in("user_id", eligiblePlayerIds)
      .order("snapshot_date", { ascending: false });

    const ratingMap = new Map<string, number>();
    (snapshots || []).forEach((s) => {
      if (!ratingMap.has(s.user_id)) ratingMap.set(s.user_id, Number(s.rating));
    });

    const ordered = [...eligiblePlayerIds]
      .map((id) => ({ id, rating: ratingMap.get(id) ?? 1000, r: Math.random() }))
      .sort((a, b) => (b.rating - a.rating) || (a.r - b.r))
      .map((x) => x.id);

    const pairs = buildSinglesPairs(ordered, roundData.round_number ?? 1);
    pairings = pairs.map(([a, b]) => [a, b]);
  }

  // Doubles King of the Court: exactly 4 players → 3 matches with fixed
  // partner rotation so every player partners with every other player once.
  if (!isSingles && eligiblePlayerIds.length === 4 && roundData?.season_id) {
    const { data: snapshots } = await supabase
      .from("ranking_snapshots")
      .select("user_id, rating, snapshot_date")
      .eq("season_id", roundData.season_id)
      .in("user_id", eligiblePlayerIds)
      .order("snapshot_date", { ascending: false });

    const ratingMap = new Map<string, number>();
    (snapshots || []).forEach((s) => {
      if (!ratingMap.has(s.user_id)) ratingMap.set(s.user_id, Number(s.rating));
    });

    const ordered = [...eligiblePlayerIds]
      .map((id) => ({ id, rating: ratingMap.get(id) ?? 1000, r: Math.random() }))
      .sort((a, b) => (b.rating - a.rating) || (a.r - b.r))
      .map((x) => x.id);

    const matches = buildDoublesKingOfCourt(ordered);
    pairings = matches.map(([a, b]) => [...a, ...b]);
  }

  if (pairings.length === 0) {
    const shuffled = [...eligiblePlayerIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const matchCount = Math.floor(shuffled.length / playersPerMatch);
    for (let i = 0; i < matchCount; i++) {
      pairings.push(shuffled.slice(i * playersPerMatch, (i + 1) * playersPerMatch));
    }
  }

  const matchCount = pairings.length;
  const createdMatches = [];

  for (let i = 0; i < matchCount; i++) {
    const group = pairings[i];
    const teamA = isSingles ? [group[0]] : group.slice(0, 2);
    const teamB = isSingles ? [group[1]] : group.slice(2, 4);

    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        round_id: roundId,
        match_number: i + 1,
        status: "scheduled",
        match_format: isSingles ? "singles" : "doubles",
      })
      .select()
      .single();

    if (error) throw error;

    const players = [
      ...teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: "A" })),
      ...teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: "B" })),
    ];

    await supabase.from("match_players").insert(players);
    createdMatches.push(match);
  }

  await recomputeRoundStatus(roundId);

  if (roundData) {
    // Per-player notification: each player sees their own matchup (partner + opponents)
    const allPlayerIds = Array.from(new Set(pairings.flat()));
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, name, nickname")
      .in("user_id", allPlayerIds);

    const nameOf = (uid: string) => {
      const p = profiles?.find((x) => x.user_id === uid);
      return p?.nickname || p?.name || "Jogador";
    };

    const notifRows: Array<{
      user_id: string;
      group_id: string;
      type: string;
      title: string;
      body: string;
      data: Record<string, string | number | boolean | null>;
    }> = [];

    for (let i = 0; i < pairings.length; i++) {
      const group = pairings[i];
      const teamA = isSingles ? [group[0]] : group.slice(0, 2);
      const teamB = isSingles ? [group[1]] : group.slice(2, 4);
      const matchId = createdMatches[i]?.id ?? null;
      const matchNumber = i + 1;

      for (const uid of group) {
        const inA = teamA.includes(uid);
        const myTeam = inA ? teamA : teamB;
        const oppTeam = inA ? teamB : teamA;
        const partner = isSingles ? null : myTeam.find((id) => id !== uid) ?? null;
        const opponentsLabel = oppTeam.map(nameOf).join(" e ");

        const body = isSingles
          ? `Partida ${matchNumber}: você joga contra ${opponentsLabel}.`
          : `Partida ${matchNumber}: você joga com ${partner ? nameOf(partner) : "—"} contra ${opponentsLabel}.`;

        notifRows.push({
          user_id: uid,
          group_id: roundData.group_id,
          type: "draw_completed",
          title: isSingles
            ? `Seu confronto da Rodada ${roundData.round_number} 🎲`
            : `Seu jogo da Rodada ${roundData.round_number} 🎲`,
          body,
          data: { roundId, matchId, seasonId: roundData.season_id ?? null },
        });
      }
    }

    if (notifRows.length > 0) {
      await supabase.from("notifications").insert(notifRows);
    }
  }

  return createdMatches;
  })();

  inFlightDrawTeams.set(roundId, run);
  run.finally(() => inFlightDrawTeams.delete(roundId));
  return run;
}

export async function deleteMatch(matchId: string) {
  const { data: matchData } = await supabase
    .from("matches")
    .select("round_id")
    .eq("id", matchId)
    .single();

  await revertMatchElo(matchId);

  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) throw new Error(error.message);

  if (matchData?.round_id) {
    await recomputeRoundStatus(matchData.round_id);
  }
}

export async function deleteRound(roundId: string) {
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("round_id", roundId);
  if (matches?.length) {
    await Promise.all(matches.map((m) => revertMatchElo(m.id)));
  }
  await supabase.from("matches").delete().eq("round_id", roundId);
  await supabase.from("round_presence").delete().eq("round_id", roundId);
  const { error } = await supabase.from("rounds").delete().eq("id", roundId);
  if (error) throw new Error(error.message);
}
