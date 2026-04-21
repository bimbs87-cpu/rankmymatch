// Cron job: processes pending account deletions whose 7-day grace period has ended.
// Should be invoked daily (e.g. via pg_cron or external scheduler).
// SECURITY: gated by CRON_SECRET header.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: due, error: dueErr } = await supabase.rpc("get_due_deletions");
  if (dueErr) {
    console.error("[process-deletions] rpc error:", dueErr);
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ user_id: string; status: string; error?: string }> = [];

  for (const row of (due ?? []) as Array<{ user_id: string }>) {
    const userId = row.user_id;
    try {
      // 1. Anonymize profile
      await supabase
        .from("user_profiles")
        .update({
          name: "Usuário removido",
          nickname: null,
          avatar_url: null,
          avatar_type: null,
          birth_date: null,
          instagram_handle: null,
          dominant_hand: null,
          preferred_position: null,
          killer_shot: null,
          worst_shot: null,
          share_tagline: null,
          share_accent_color: null,
          is_placeholder: true,
          privacy_settings: {},
          deletion_requested_at: null,
          deletion_scheduled_for: null,
        })
        .eq("user_id", userId);

      // 2. Cleanup personal/transient data
      const cleanupTables = [
        "notifications",
        "push_subscriptions",
        "push_notification_preferences",
        "compare_favorites",
        "comments",
        "comment_reactions",
        "bug_report_votes",
        "user_sessions",
        "user_acquisition",
        "admin_pending_reminder_log",
        "group_members",
        "group_join_requests",
        "group_admin_permissions",
        "round_presence",
      ];
      for (const table of cleanupTables) {
        const { error } = await supabase.from(table).delete().eq("user_id", userId);
        if (error) console.warn(`[process-deletions] ${table} cleanup warn:`, error.message);
      }

      // 3. Anonymize bug reports
      await supabase.from("bug_reports").update({ user_id: null }).eq("user_id", userId);

      // 4. Mark deletion request as executed
      await supabase
        .from("account_deletion_requests")
        .update({ status: "executed", executed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("status", "pending");

      // 5. Delete auth user
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error("[process-deletions] auth deleteUser failed:", delErr);
        results.push({ user_id: userId, status: "auth_delete_failed", error: delErr.message });
        continue;
      }

      results.push({ user_id: userId, status: "deleted" });
    } catch (err) {
      console.error("[process-deletions] error processing", userId, err);
      results.push({
        user_id: userId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
