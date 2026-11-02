import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Daily scheduler entry point. Rejects any caller without the server-held token.
export const Route = createFileRoute("/api/public/hooks/process-deletions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-deletion-token");
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return Response.json({ error: "not_configured" }, { status: 503 });
        if (!token || token.length !== 72) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const publicClient = createClient(url, key, {
          auth: { persistSession: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (key.startsWith("sb_")) headers.delete("Authorization");
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            },
          },
        });
        const { data: valid, error } = await publicClient.rpc("verify_deletion_scheduler_token", { _token: token });
        if (error || !valid) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runDueDeletions } = await import("@/lib/account-deletion.server");
          const result = await runDueDeletions(supabaseAdmin);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[process-deletions] failed", (err as { code?: string })?.code ?? "error");
          return Response.json({ ok: false, error: "processing_failed" }, { status: 500 });
        }
      },
    },
  },
});
