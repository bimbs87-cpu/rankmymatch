import { createServerFn } from "@tanstack/react-start";
import { sendPushToUserIds, type PushPayload } from "@/lib/web-push.server";

/**
 * Best-effort push delivery. Always called fire-and-forget from the client;
 * never blocks the in-app notification insert.
 *
 * Server-side validation: only allow targeting users that share at least one
 * group with the caller (or the caller themselves) to prevent abuse. We use
 * the admin client for the actual send, but gate the request via a quick
 * authenticated query.
 */

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface SendPushInput {
  userIds: string[];
  payload: PushPayload;
}

export const sendPushFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendPushInput) => {
    if (!input || !Array.isArray(input.userIds)) {
      throw new Error("userIds must be an array");
    }
    const userIds = input.userIds.filter((u) => typeof u === "string").slice(0, 200);
    const p = input.payload || ({} as PushPayload);
    const payload: PushPayload = {
      title: String(p.title || "RankMyMatch").slice(0, 120),
      body: p.body ? String(p.body).slice(0, 300) : undefined,
      url: p.url ? String(p.url).slice(0, 500) : undefined,
      type: p.type ? String(p.type).slice(0, 60) : undefined,
      tag: p.tag ? String(p.tag).slice(0, 60) : undefined,
      data: p.data && typeof p.data === "object" ? p.data : undefined,
    };
    return { userIds, payload };
  })
  .handler(async ({ data, context }) => {
    const { userIds, payload } = data;
    const callerId = context.userId;
    if (!userIds.length) return { sent: 0, failed: 0 };

    // Allow targeting only users in groups the caller belongs to (or self).
    const { data: callerMemberships } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("user_id", callerId)
      .eq("status", "active");
    const groupIds = (callerMemberships || []).map((g) => g.group_id);

    let allowed: string[] = [callerId];
    if (groupIds.length) {
      const { data: peers } = await supabaseAdmin
        .from("group_members")
        .select("user_id")
        .in("group_id", groupIds)
        .eq("status", "active");
      const peerSet = new Set<string>([callerId, ...(peers || []).map((p) => p.user_id)]);
      allowed = userIds.filter((u) => peerSet.has(u));
    } else {
      allowed = userIds.filter((u) => u === callerId);
    }

    if (!allowed.length) return { sent: 0, failed: 0 };
    try {
      return await sendPushToUserIds(allowed, payload);
    } catch (err) {
      console.error("[sendPushFn] delivery failed:", err);
      return { sent: 0, failed: allowed.length, error: "push_failed" };
    }
  });
