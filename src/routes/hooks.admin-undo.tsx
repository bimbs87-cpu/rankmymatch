/**
 * Endpoint para desfazer uma ação recente do admin (últimas 24h).
 *
 * Suporta:
 *  - join_request: reverter approved/rejected -> pending. Se foi approved e o
 *    usuário virou membro, remove do group_members (apenas se não jogou partida).
 *  - claim rejected -> pending. Claims approved são irreversíveis (merge já mesclou dados).
 *
 * Usa o token de sessão do admin via cookie para garantir RLS (is_group_admin).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PROJECT_REF = "oeizpqyvnmickosoynrr";
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

function readSupabaseAccessToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((c) => c.trim());
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
    let json = raw;
    if (raw.startsWith("base64-")) json = atob(raw.slice("base64-".length));
    const parsed = JSON.parse(json);
    return parsed?.access_token || null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/hooks/admin-undo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { kind?: string; id?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const { kind, id } = body;
        if (!id || (kind !== "join_request" && kind !== "claim")) {
          return new Response("Invalid params", { status: 400 });
        }

        const accessToken = readSupabaseAccessToken(
          request.headers.get("cookie"),
        );
        if (!accessToken) return new Response("Unauthorized", { status: 401 });

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
              .select("id, group_id, user_id, status, resolved_at")
              .eq("id", id)
              .maybeSingle();
            if (reqErr || !req)
              return new Response("Not found", { status: 404 });
            if (req.status === "pending") {
              return Response.json({ ok: true, alreadyPending: true });
            }
            if (
              !req.resolved_at ||
              Date.now() - new Date(req.resolved_at).getTime() > UNDO_WINDOW_MS
            ) {
              return new Response(
                JSON.stringify({
                  error: "Janela de 24h para desfazer expirou",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }

            // Se foi aprovado, verificar se o usuário já jogou alguma partida
            // no grupo. Se sim, não pode desfazer.
            if (req.status === "approved") {
              const { data: played } = await sb
                .from("match_players")
                .select("id, matches!inner(round_id, rounds!inner(group_id))")
                .eq("user_id", req.user_id)
                .eq("matches.rounds.group_id", req.group_id)
                .limit(1);
              if (played && played.length > 0) {
                return new Response(
                  JSON.stringify({
                    error:
                      "Usuário já jogou partidas neste grupo, não é possível desfazer",
                  }),
                  {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }
              // Remover do group_members (RLS exige is_group_admin)
              const { error: delErr } = await sb
                .from("group_members")
                .delete()
                .eq("group_id", req.group_id)
                .eq("user_id", req.user_id);
              if (delErr) throw delErr;
            }

            const { error: updErr } = await sb
              .from("group_join_requests")
              .update({
                status: "pending",
                resolved_at: null,
                resolved_by: null,
              })
              .eq("id", id);
            if (updErr) throw updErr;
          } else {
            // claim
            const { data: claim, error: claimErr } = await sb
              .from("player_claims")
              .select("id, group_id, status, resolved_at")
              .eq("id", id)
              .maybeSingle();
            if (claimErr || !claim)
              return new Response("Not found", { status: 404 });
            if (claim.status === "pending") {
              return Response.json({ ok: true, alreadyPending: true });
            }
            if (claim.status === "approved") {
              return new Response(
                JSON.stringify({
                  error:
                    "Vínculos aprovados são irreversíveis (dados já foram mesclados)",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            if (
              !claim.resolved_at ||
              Date.now() - new Date(claim.resolved_at).getTime() >
                UNDO_WINDOW_MS
            ) {
              return new Response(
                JSON.stringify({
                  error: "Janela de 24h para desfazer expirou",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            const { error: updErr } = await sb
              .from("player_claims")
              .update({
                status: "pending",
                resolved_at: null,
                resolved_by: null,
              })
              .eq("id", id);
            if (updErr) throw updErr;
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error("admin-undo failed:", err);
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Action failed",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
