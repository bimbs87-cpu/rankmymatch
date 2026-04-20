/**
 * Notification fan-out helpers.
 *
 * Extracted from use-notifications.tsx to keep the hook lean.
 * Both helpers insert in-app notifications and best-effort push.
 */
import { supabase } from "@/integrations/supabase/client";

type NotifyParams = {
  groupId: string;
  actorId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
  /** URL the push opens when tapped. */
  url?: string;
  /**
   * Custom push notification tag. When multiple pushes share the same tag, the
   * OS collapses them into a single visible notification (no flooding).
   * Defaults to `${type}:${groupId}` when omitted.
   */
  tag?: string;
  /**
   * When true, the actor (admin sending the push) also receives the notification
   * + push. Useful for manual reminders so the admin gets visual confirmation
   * of delivery on their own device. Defaults to false.
   */
  includeActor?: boolean;
};

export type PushResult = { sent: number; failed: number; error?: string; targets: number };

/** Build a human-readable suffix for toasts based on a push result. */
export function describePushResult(push: PushResult | null | undefined): string {
  if (!push) return "Push não enviado";
  if (push.targets === 0) return "Sem destinatários para o push";
  if (push.error) return `Falha no push: ${push.error}`;
  if (push.sent === 0) return "Nenhum push entregue (sem dispositivos inscritos)";
  return `${push.sent} push enviado${push.sent === 1 ? "" : "s"}${push.failed ? ` · ${push.failed} falha${push.failed === 1 ? "" : "s"}` : ""}`;
}

async function fanout(
  userIds: string[],
  params: NotifyParams,
  defaultUrl: string,
): Promise<PushResult> {
  if (!userIds.length) return { sent: 0, failed: 0, targets: 0 };

  const rows = userIds.map((uid) => ({
    user_id: uid,
    group_id: params.groupId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
  }));

  await supabase.from("notifications").insert(rows);

  // Best-effort push — awaited so callers can surface success/failure in toasts.
  try {
    const { sendPushFn } = await import("@/lib/push.functions");
    const res = (await sendPushFn({
      data: {
        userIds,
        payload: {
          title: params.title,
          body: params.body,
          url: params.url || defaultUrl,
          type: params.type,
          tag: params.tag || `${params.type}:${params.groupId}`,
          data: { groupId: params.groupId, ...(params.data || {}) },
        },
      },
    })) as { sent?: number; failed?: number; error?: string };
    return {
      sent: res?.sent ?? 0,
      failed: res?.failed ?? 0,
      error: res?.error,
      targets: userIds.length,
    };
  } catch (err: any) {
    return { sent: 0, failed: userIds.length, error: err?.message || "push_failed", targets: userIds.length };
  }
}

/**
 * Notify only the active admins/creators of a group (in-app + best-effort push).
 * Used for moderation events: join requests, player claims, etc.
 */
export async function notifyGroupAdmins(params: NotifyParams): Promise<PushResult> {
  const { data: admins } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", params.groupId)
    .eq("status", "active")
    .in("role", ["creator", "admin"])
    .neq("user_id", params.actorId);

  return fanout((admins || []).map((a) => a.user_id), params, "/admin/inbox");
}

/**
 * Notify all members of a group except the actor (in-app + best-effort push).
 */
export async function notifyGroupMembers(params: NotifyParams): Promise<PushResult> {
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", params.groupId)
    .eq("status", "active")
    .neq("user_id", params.actorId);

  return fanout((members || []).map((m) => m.user_id), params, "/notifications");
}

/**
 * Notify a specific list of users (in-app + best-effort push), excluding the actor.
 * Used for match-result fan-out where only the involved players should be pinged
 * — not the entire group.
 */
export async function notifyUsers(
  userIds: string[],
  params: NotifyParams,
  defaultUrl = "/notifications",
): Promise<PushResult> {
  const targets = Array.from(new Set(userIds.filter((u) => u && u !== params.actorId)));
  return fanout(targets, params, defaultUrl);
}
