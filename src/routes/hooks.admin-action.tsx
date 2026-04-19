/**
 * Inline admin moderation endpoint, called by the service worker when the
 * admin taps "Aprovar" or "Recusar" directly on a push notification banner.
 *
 * Auth: relies on the session cookie that the user already has (credentials:
 * "include" from the SW). We use the user's auth token to call Supabase so
 * RLS enforces "is_group_admin" exactly like the regular UI does.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PROJECT_REF = "oeizpqyvnmickosoynrr";
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

function readSupabaseAccessToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  // Supabase splits long cookies into <name>.0, <name>.1, ...
  const chunks: Record<number, string> = {};
  let single: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq);
    const value = decodeURIComponent(part.slice(eq + 1));
    if (name === COOKIE_NAME) single = value;
    else if (name.startsWith(`${COOKIE_NAME}.`)) {
      const idx = Number(name.slice(COOKIE_NAME.length + 1));
      if (!Number.isNaN(idx)) chunks[idx] = value;
    }
  }
  let raw = single;
  if (!raw && Object.keys(chunks).length) {
    raw = Object.keys(chunks)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => chunks[k])
      .join("");
  }
  if (!raw) return null;
  try {
    // Supabase stores cookies as `base64-<...>` or raw JSON.
    let json = raw;
    if (raw.startsWith("base64-")) {
      json = atob(raw.slice("base64-".length));
    }
    const parsed = JSON.parse(json);
    return parsed?.access_token || null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/hooks/admin-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { kind?: string; id?: string; action?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const { kind, id, action } = body;
        if (
          !id ||
          (kind !== "join_request" && kind !== "claim") ||
          (action !== "approve" && action !== "reject")
        ) {
          return new Response("Invalid params", { status: 400 });
        }

        const accessToken = readSupabaseAccessToken(
          request.headers.get("cookie"),
        );
        if (!accessToken) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const anon =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !anon) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const sb = createClient<Database>(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });

        const userRes = await sb.auth.getUser(accessToken);
        const userId = userRes.data.user?.id;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        try {
          if (kind === "join_request") {
            const { data: req, error: reqErr } = await sb
              .from("group_join_requests")
              .select("id, group_id, user_id, status")
              .eq("id", id)
              .maybeSingle();
            if (reqErr || !req)
              return new Response("Not found", { status: 404 });
            if (req.status !== "pending")
              return Response.json({ ok: true, alreadyResolved: true });

            if (action === "approve") {
              const { error: upErr } = await sb
                .from("group_members")
                .upsert(
                  {
                    group_id: req.group_id,
                    user_id: req.user_id,
                    status: "active",
                    role: "member",
                  },
                  { onConflict: "group_id,user_id" },
                );
              if (upErr) throw upErr;
            }

            const { error: resErr } = await sb
              .from("group_join_requests")
              .update({
                status: action === "approve" ? "approved" : "rejected",
                resolved_at: new Date().toISOString(),
                resolved_by: userId,
              })
              .eq("id", id);
            if (resErr) throw resErr;
          } else {
            // claim
            const { data: claim, error: claimErr } = await sb
              .from("player_claims")
              .select(
                "id, group_id, claimer_user_id, placeholder_user_id, status",
              )
              .eq("id", id)
              .maybeSingle();
            if (claimErr || !claim)
              return new Response("Not found", { status: 404 });
            if (claim.status !== "pending")
              return Response.json({ ok: true, alreadyResolved: true });

            if (action === "approve") {
              const { error: rpcErr } = await sb.rpc(
                "merge_placeholder_player",
                {
                  _placeholder_user_id: claim.placeholder_user_id,
                  _real_user_id: claim.claimer_user_id,
                  _group_id: claim.group_id,
                },
              );
              if (rpcErr) throw rpcErr;
            } else {
              const { error: updErr } = await sb
                .from("player_claims")
                .update({
                  status: "rejected",
                  resolved_at: new Date().toISOString(),
                  resolved_by: userId,
                })
                .eq("id", id);
              if (updErr) throw updErr;
            }
          }

          return Response.json({ ok: true, action });
        } catch (err) {
          console.error("admin-action failed:", err);
          return new Response("Action failed", { status: 500 });
        }
      },
    },
  },
});
