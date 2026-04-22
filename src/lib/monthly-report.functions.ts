// Wrapper de server function — seguro para importar do cliente
// (o build substitui o handler por um stub RPC no bundle do cliente).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendMonthlyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { month?: "current" | "previous" } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { ensureAppAdmin, runMonthlyReportForMode } = await import(
      "@/lib/monthly-report.server"
    );
    await ensureAppAdmin(context.userId);
    return runMonthlyReportForMode(data?.month);
  });
