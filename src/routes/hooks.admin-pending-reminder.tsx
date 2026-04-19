/**
 * Daily reminder cron — fires once a day via pg_cron.
 *
 * For every admin (creator/admin) of a group with pending join requests
 * or pending player claims, send a single push reminder. Dedup via
 * `admin_pending_reminder_log` so no admin gets pinged more than once
 * every 24h, even if the cron runs multiple times in a day.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendPushToUserIds } from "@/lib/web-push.server";

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server env");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/hooks/admin-pending-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const sb = getAdmin();

        // Pull all pending join requests + claims with their group_id.
        const [reqsRes, claimsRes] = await Promise.all([
          sb
            .from("group_join_requests")
            .select("group_id")
            .eq("status", "pending"),
          sb.from("player_claims").select("group_id").eq("status", "pending"),
        ]);

        // Count per group
        const countByGroup = new Map<string, number>();
        for (const r of reqsRes.data || [])
          countByGroup.set(r.group_id, (countByGroup.get(r.group_id) || 0) + 1);
        for (const c of claimsRes.data || [])
          countByGroup.set(c.group_id, (countByGroup.get(c.group_id) || 0) + 1);

        if (countByGroup.size === 0) {
          return Response.json({ ok: true, processed: 0, sent: 0 });
        }

        const groupIds = [...countByGroup.keys()];

        // Fetch admins of those groups + group names
        const [adminsRes, groupsRes] = await Promise.all([
          sb
            .from("group_members")
            .select("user_id, group_id")
            .in("group_id", groupIds)
            .eq("status", "active")
            .in("role", ["creator", "admin"]),
          sb.from("groups").select("id, name").in("id", groupIds),
        ]);

        const groupNames = new Map(
          (groupsRes.data || []).map((g) => [g.id, g.name as string]),
        );

        // Aggregate per admin: total pending + sample group name
        const perAdmin = new Map<
          string,
          { total: number; groups: Set<string> }
        >();
        for (const a of adminsRes.data || []) {
          const cnt = countByGroup.get(a.group_id) || 0;
          if (!cnt) continue;
          const cur = perAdmin.get(a.user_id) || {
            total: 0,
            groups: new Set<string>(),
          };
          cur.total += cnt;
          cur.groups.add(a.group_id);
          perAdmin.set(a.user_id, cur);
        }

        if (perAdmin.size === 0) {
          return Response.json({ ok: true, processed: 0, sent: 0 });
        }

        const adminIds = [...perAdmin.keys()];

        // Dedup: skip admins reminded in the last 24h
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: logRows } = await sb
          .from("admin_pending_reminder_log")
          .select("user_id, last_reminded_at")
          .in("user_id", adminIds);
        const recentlyReminded = new Set(
          (logRows || [])
            .filter((r) => r.last_reminded_at && r.last_reminded_at > cutoff)
            .map((r) => r.user_id),
        );

        const targets = adminIds.filter((id) => !recentlyReminded.has(id));
        if (!targets.length) {
          return Response.json({ ok: true, processed: 0, sent: 0, skipped: adminIds.length });
        }

        let totalSent = 0;
        for (const adminId of targets) {
          const info = perAdmin.get(adminId)!;
          const total = info.total;
          const groupCount = info.groups.size;
          const firstGroupName =
            groupNames.get([...info.groups][0]) || "seu grupo";

          const title = `📥 ${total} solicitação${total > 1 ? "ões" : ""} pendente${total > 1 ? "s" : ""}`;
          const body =
            groupCount > 1
              ? `Você tem solicitações em ${groupCount} grupos. Toque para revisar.`
              : `Solicitação aguardando em ${firstGroupName}.`;

          // In-app notification
          await sb.from("notifications").insert({
            user_id: adminId,
            type: "admin_pending_reminder",
            title,
            body,
            data: { total, groupCount },
          });

          // Push (best-effort)
          const result = await sendPushToUserIds([adminId], {
            title,
            body,
            url: "/admin/inbox",
            type: "admin_pending_reminder",
            tag: "admin_pending_reminder",
            data: { total, groupCount },
          });
          totalSent += result.sent;

          // Upsert reminder log
          await sb
            .from("admin_pending_reminder_log")
            .upsert(
              { user_id: adminId, last_reminded_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
        }

        return Response.json({
          ok: true,
          processed: targets.length,
          sent: totalSent,
          skipped: adminIds.length - targets.length,
        });
      },
    },
  },
});
