/**
 * Daily reminder cron — fires once a day via pg_cron.
 *
 * For every admin (creator/admin) of a group with pending join requests
 * or pending player claims, send a single push reminder. Dedup via
 * `admin_pending_reminder_log` so no admin gets pinged more than once
 * every 24h, even if the cron runs multiple times in a day.
 *
 * Escalated alerts: if any pending item is 7+ days old it is flagged
 * as "critical" — a separate critical push is sent and bypasses the
 * 24h cooldown so the admin gets one extra ping per day for criticals.
 *
 * Manual trigger: passing header `X-Force-Send: 1` (or body `{force:true}`)
 * bypasses the 24h cooldown for the regular reminder. Useful for testing
 * and for admins to force a reminder from the inbox UI.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendPushToUserIds } from "@/lib/web-push.server";

const CRITICAL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

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

        // Force flag bypasses 24h cooldown (manual trigger from UI / tests)
        let force = request.headers.get("x-force-send") === "1";
        try {
          const body = await request.clone().json().catch(() => ({}));
          if (body && typeof body === "object" && (body as any).force === true) {
            force = true;
          }
        } catch {
          /* ignore */
        }

        const sb = getAdmin();
        const now = Date.now();

        // Pull all pending join requests + claims with their group_id + created_at.
        const [reqsRes, claimsRes] = await Promise.all([
          sb
            .from("group_join_requests")
            .select("group_id, created_at")
            .eq("status", "pending"),
          sb
            .from("player_claims")
            .select("group_id, created_at")
            .eq("status", "pending"),
        ]);

        // Per-group total + critical (7+ days) counts
        const totalByGroup = new Map<string, number>();
        const criticalByGroup = new Map<string, number>();
        const bump = (g: string, m: Map<string, number>) =>
          m.set(g, (m.get(g) || 0) + 1);

        for (const r of reqsRes.data || []) {
          bump(r.group_id, totalByGroup);
          if (
            r.created_at &&
            now - new Date(r.created_at).getTime() >= CRITICAL_THRESHOLD_MS
          ) {
            bump(r.group_id, criticalByGroup);
          }
        }
        for (const c of claimsRes.data || []) {
          bump(c.group_id, totalByGroup);
          if (
            c.created_at &&
            now - new Date(c.created_at).getTime() >= CRITICAL_THRESHOLD_MS
          ) {
            bump(c.group_id, criticalByGroup);
          }
        }

        if (totalByGroup.size === 0) {
          return Response.json({ ok: true, processed: 0, sent: 0 });
        }

        const groupIds = [...totalByGroup.keys()];

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

        // Aggregate per admin: total + critical + sample group name
        const perAdmin = new Map<
          string,
          { total: number; critical: number; groups: Set<string> }
        >();
        for (const a of adminsRes.data || []) {
          const cnt = totalByGroup.get(a.group_id) || 0;
          if (!cnt) continue;
          const cur = perAdmin.get(a.user_id) || {
            total: 0,
            critical: 0,
            groups: new Set<string>(),
          };
          cur.total += cnt;
          cur.critical += criticalByGroup.get(a.group_id) || 0;
          cur.groups.add(a.group_id);
          perAdmin.set(a.user_id, cur);
        }

        if (perAdmin.size === 0) {
          return Response.json({ ok: true, processed: 0, sent: 0 });
        }

        const adminIds = [...perAdmin.keys()];

        // Dedup standard reminder: skip admins reminded in last 24h
        // (force=true OR critical items bypass this for that admin)
        const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        const { data: logRows } = await sb
          .from("admin_pending_reminder_log")
          .select("user_id, last_reminded_at")
          .in("user_id", adminIds);
        const recentlyReminded = new Set(
          (logRows || [])
            .filter((r) => r.last_reminded_at && r.last_reminded_at > cutoff)
            .map((r) => r.user_id),
        );

        let totalSent = 0;
        let processed = 0;
        let skipped = 0;
        let criticalSent = 0;

        for (const adminId of adminIds) {
          const info = perAdmin.get(adminId)!;
          const total = info.total;
          const critical = info.critical;
          const groupCount = info.groups.size;
          const firstGroupName =
            groupNames.get([...info.groups][0]) || "seu grupo";

          const cooldownActive = recentlyReminded.has(adminId);
          const sendStandard = force || !cooldownActive;
          const sendCritical = critical > 0; // criticals bypass cooldown

          if (!sendStandard && !sendCritical) {
            skipped++;
            continue;
          }
          processed++;

          // ----- Standard reminder -----
          if (sendStandard) {
            const title = `📥 ${total} solicitação${total > 1 ? "ões" : ""} pendente${total > 1 ? "s" : ""}`;
            const body =
              groupCount > 1
                ? `Você tem solicitações em ${groupCount} grupos. Toque para revisar.`
                : `Solicitação aguardando em ${firstGroupName}.`;

            await sb.from("notifications").insert({
              user_id: adminId,
              type: "admin_pending_reminder",
              title,
              body,
              data: { total, groupCount, critical },
            });

            const result = await sendPushToUserIds([adminId], {
              title,
              body,
              url: "/admin/inbox",
              type: "admin_pending_reminder",
              tag: "admin_pending_reminder",
              data: { total, groupCount, critical },
            });
            totalSent += result.sent;

            await sb
              .from("admin_pending_reminder_log")
              .upsert(
                { user_id: adminId, last_reminded_at: new Date().toISOString() },
                { onConflict: "user_id" },
              );
          }

          // ----- Critical escalation (extra push, bypasses cooldown) -----
          if (sendCritical) {
            const cTitle = `🚨 ${critical} solicitação${critical > 1 ? "ões" : ""} crítica${critical > 1 ? "s" : ""} (7+ dias)`;
            const cBody =
              critical > 1
                ? `${critical} pedidos parados há mais de 7 dias precisam da sua atenção.`
                : `Um pedido está parado há mais de 7 dias em ${firstGroupName}.`;

            await sb.from("notifications").insert({
              user_id: adminId,
              type: "admin_pending_critical",
              title: cTitle,
              body: cBody,
              data: { critical, total, groupCount },
            });

            const cResult = await sendPushToUserIds([adminId], {
              title: cTitle,
              body: cBody,
              url: "/admin/inbox",
              type: "admin_pending_critical",
              tag: "admin_pending_critical",
              data: { critical, total, groupCount },
            });
            criticalSent += cResult.sent;
          }
        }

        return Response.json({
          ok: true,
          processed,
          sent: totalSent,
          criticalSent,
          skipped,
          forced: force,
        });
      },
    },
  },
});
