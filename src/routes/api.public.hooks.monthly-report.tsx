// Endpoint público para o pg_cron disparar o relatório mensal.
// Autenticado via header `x-cron-secret` que casa com o secret CRON_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { runScheduledMonthlyReport } from "@/lib/monthly-report.server";

export const Route = createFileRoute("/api/public/hooks/monthly-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response(
            JSON.stringify({ error: "CRON_SECRET not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runScheduledMonthlyReport();
          return new Response(
            JSON.stringify({
              ok: true,
              periodLabel: result.periodLabel,
              recipients: result.recipients,
              pdfPath: result.pdfPath,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (e) {
          console.error("[monthly-report cron] failed:", e);
          return new Response(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
