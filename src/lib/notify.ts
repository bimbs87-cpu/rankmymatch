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
};

async function fanout(userIds: string[], params: NotifyParams, defaultUrl: string) {
  if (!userIds.length) return;

  const rows = userIds.map((uid) => ({
    user_id: uid,
    group_id: params.groupId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
  }));

  await supabase.from("notifications").insert(rows);

  // Fire-and-forget push (best-effort, never blocks the in-app notification).
  try {
    const { sendPushFn } = await import("@/lib/push.functions");
    void sendPushFn({
      data: {
        userIds,
        payload: {
          title: params.title,
          body: params.body,
          url: params.url || defaultUrl,
          type: params.type,
          tag: `${params.type}:${params.groupId}`,
          data: { groupId: params.groupId, ...(params.data || {}) },
        },
      },
    }).catch(() => {});
  } catch {
    /* push is optional */
  }
}

/**
 * Notify only the active admins/creators of a group (in-app + best-effort push).
 * Used for moderation events: join requests, player claims, etc.
 */
export async function notifyGroupAdmins(params: NotifyParams) {
  const { data: admins } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", params.groupId)
    .eq("status", "active")
    .in("role", ["creator", "admin"])
    .neq("user_id", params.actorId);

  await fanout((admins || []).map((a) => a.user_id), params, "/admin/inbox");
}

/**
 * Notify all members of a group except the actor (in-app + best-effort push).
 */
export async function notifyGroupMembers(params: NotifyParams) {
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", params.groupId)
    .eq("status", "active")
    .neq("user_id", params.actorId);

  await fanout((members || []).map((m) => m.user_id), params, "/notifications");
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
) {
  const targets = Array.from(new Set(userIds.filter((u) => u && u !== params.actorId)));
  await fanout(targets, params, defaultUrl);
}
