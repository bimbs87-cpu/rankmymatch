import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "urgency-notify-sent:";
// Cooldown: 6h — avoid spamming if dashboard is reloaded multiple times.
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Notify pending members (in-app notifications) that a round starts soon and
 * still has open slots. Best-effort, idempotent per (round, hours-bucket) via
 * localStorage. Safe to call from any client; RLS permits members to insert.
 */
export async function notifyUrgentPendingMembers(opts: {
  roundId: string;
  groupId: string;
  pendingUserIds: string[];
  hoursLeft: number;
  slotsLeft: number;
  roundNumber?: number | null;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (!opts.pendingUserIds.length) return;

  const key = `${STORAGE_PREFIX}${opts.roundId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < COOLDOWN_MS) return;
    }
  } catch {
    // ignore storage errors
  }

  const title = `⏱ Rodada${opts.roundNumber ? ` ${opts.roundNumber}` : ""} em ~${opts.hoursLeft}h`;
  const body = `Ainda há ${opts.slotsLeft} vaga${opts.slotsLeft > 1 ? "s" : ""} aberta${opts.slotsLeft > 1 ? "s" : ""}. Confirme presença!`;

  const rows = opts.pendingUserIds.map((uid) => ({
    user_id: uid,
    group_id: opts.groupId,
    type: "round_urgent",
    title,
    body,
    data: { roundId: opts.roundId, hoursLeft: opts.hoursLeft, slotsLeft: opts.slotsLeft },
  }));

  try {
    await supabase.from("notifications").insert(rows);
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // best-effort
  }
}
