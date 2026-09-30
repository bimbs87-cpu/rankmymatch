import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const getPublicBugVoteCounts = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ ids: z.array(z.string().uuid()).max(20) }).parse(data))
  .handler(async ({ data }) => {
    if (!data.ids.length) return {} as Record<string, number>;
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: reports } = await sb.from("bug_reports").select("id").eq("is_public", true).in("id", data.ids);
    const publicIds = (reports ?? []).map((r) => r.id);
    if (!publicIds.length) return {} as Record<string, number>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: votes, error } = await supabaseAdmin.from("bug_report_votes").select("bug_report_id").in("bug_report_id", publicIds);
    if (error) throw new Error("Failed to load votes");
    const counts: Record<string, number> = {};
    for (const vote of votes ?? []) counts[vote.bug_report_id] = (counts[vote.bug_report_id] ?? 0) + 1;
    return counts;
  });