/**
 * Scheduled task — fires every 5 min via pg_cron.
 *
 * For each upcoming round whose presence window has just opened (and we
 * haven't pushed yet), notifies all members of that group with a "lista
 * aberta" push. Idempotent via round_presence_push_log.
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

interface GroupRow {
  presence_open_mode: string;
  presence_open_time: string | null;
  name: string;
}

interface RoundRow {
  id: string;
  group_id: string;
  round_number: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  presence_force_open_at: string | null;
  status: string;
  groups: GroupRow | null;
}

/** Compute presence-open Date the same way the client does. */
function computeOpenDate(round: RoundRow): Date | null {
  const g = round.groups;
  if (!g || !round.scheduled_date) return null;
  if (g.presence_open_mode === "always") return null;

  const time = round.scheduled_time ? round.scheduled_time.slice(0, 5) : "00:00";
  const gameDate = new Date(`${round.scheduled_date}T${time}:00`);
  if (Number.isNaN(gameDate.getTime())) return null;

  if (g.presence_open_mode === "random") {
    let hash = 0;
    for (let i = 0; i < round.id.length; i++) {
      hash = ((hash << 5) - hash) + round.id.charCodeAt(i);
      hash |= 0;
    }
    const minM = 24 * 60;
    const maxM = 36 * 60;
    const offsetM = minM + (Math.abs(hash) % (maxM - minM));
    return new Date(gameDate.getTime() - offsetM * 60_000);
  }

  let daysBefore = 1;
  if (g.presence_open_mode === "same_day") daysBefore = 0;
  else if (g.presence_open_mode === "1_day_before") daysBefore = 1;
  else if (g.presence_open_mode === "2_days_before") daysBefore = 2;

  const openTime = (g.presence_open_time || "10:00:00").slice(0, 5);
  const openDate = new Date(`${round.scheduled_date}T${openTime}:00`);
  openDate.setDate(openDate.getDate() - daysBefore);
  return openDate;
}

export const Route = createFileRoute("/hooks/presence-window-opened")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Light auth: require Bearer token = anon key (set in cron)
        const auth = request.headers.get("authorization") || "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const sb = getAdmin();
        const now = new Date();
        // Look at rounds in the next 5 days that aren't completed
        const horizon = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const { data: rounds, error } = await sb
          .from("rounds")
          .select(
            "id, group_id, round_number, scheduled_date, scheduled_time, presence_force_open_at, status, groups(presence_open_mode, presence_open_time, name)",
          )
          .in("status", ["scheduled", "in_progress"])
          .gte("scheduled_date", now.toISOString().slice(0, 10))
          .lte("scheduled_date", horizon);

        if (error) {
          console.error("[presence-window cron] query failed", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const candidates: RoundRow[] = [];
        for (const r of (rounds || []) as unknown as RoundRow[]) {
          const openDate = computeOpenDate(r);
          // Force-open overrides
          const effectiveOpen = r.presence_force_open_at
            ? new Date(r.presence_force_open_at)
            : openDate;
          if (!effectiveOpen) continue;
          // Open in the past 30 min (give wider window so we don't miss late runs)
          const diffMs = now.getTime() - effectiveOpen.getTime();
          if (diffMs >= 0 && diffMs <= 30 * 60 * 1000) {
            candidates.push(r);
          }
        }

        if (!candidates.length) {
          return Response.json({ ok: true, processed: 0, sent: 0 });
        }

        // Filter out rounds we've already pushed for
        const ids = candidates.map((r) => r.id);
        const { data: alreadyPushed } = await sb
          .from("round_presence_push_log")
          .select("round_id")
          .in("round_id", ids);
        const pushedSet = new Set((alreadyPushed || []).map((r) => r.round_id));
        const todo = candidates.filter((r) => !pushedSet.has(r.id));

        let totalSent = 0;
        for (const r of todo) {
          const { data: members } = await sb
            .from("group_members")
            .select("user_id")
            .eq("group_id", r.group_id)
            .eq("status", "active");
          const userIds = (members || []).map((m) => m.user_id);
          if (!userIds.length) {
            // Still log to avoid retrying forever
            await sb
              .from("round_presence_push_log")
              .insert({ round_id: r.id });
            continue;
          }

          // Insert in-app notifications too
          const groupName = r.groups?.name || "Grupo";
          const title = `📣 Lista aberta — ${groupName}`;
          const body = r.round_number
            ? `Confirme presença na rodada ${r.round_number}.`
            : `Confirme sua presença antes que as vagas acabem.`;

          await sb.from("notifications").insert(
            userIds.map((uid) => ({
              user_id: uid,
              group_id: r.group_id,
              type: "round_open",
              title,
              body,
              data: { roundId: r.id, groupId: r.group_id },
            })),
          );

          const result = await sendPushToUserIds(userIds, {
            title,
            body,
            url: `/groups/${r.group_id}`,
            type: "round_open",
            tag: `round_open:${r.id}`,
            data: { roundId: r.id, groupId: r.group_id },
          });
          totalSent += result.sent;

          await sb
            .from("round_presence_push_log")
            .insert({ round_id: r.id });
        }

        return Response.json({
          ok: true,
          processed: todo.length,
          sent: totalSent,
        });
      },
    },
  },
});
