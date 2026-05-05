import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * DEV-ONLY: Hard-deletes a user completely from the system so the same email
 * can be reused for fresh-signup tests. Requires the caller to be in
 * `app_admins`. Wipes profile, memberships, presences, all derived data,
 * and finally the auth user. Idempotent.
 */
export const devHardDeleteUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as { userId?: string };
    if (!d?.userId || typeof d.userId !== "string") {
      throw new Error("userId is required");
    }
    return { userId: d.userId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { userId: callerId } = context;
    const { userId: targetId } = data;

    // Verify caller is app admin
    const { data: admin } = await supabaseAdmin
      .from("app_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();
    if (!admin) {
      throw new Error("Only app admins can hard-delete users");
    }

    const errors: string[] = [];

    // Tables with user_id column — wipe in order.
    const cleanupTables = [
      "notifications",
      "push_subscriptions",
      "push_notification_preferences",
      "compare_favorites",
      "comment_reactions",
      "comments",
      "bug_report_votes",
      "admin_pending_reminder_log",
      "round_presence",
      "match_confirmations",
      "match_players",
      "rating_events",
      "ranking_snapshots",
      "player_stats_by_season",
      "group_admin_permissions",
      "group_join_requests",
      "group_share_events",
      "group_members",
      "player_claims",
      "pending_match_results",
      "exports",
      "onboarding_events",
      "page_visits",
      "audit_logs",
      "account_deletion_requests",
      "user_acquisition",
      "user_sessions",
    ];

    for (const table of cleanupTables) {
      const { error } = await (supabaseAdmin as any).from(table).delete().eq("user_id", targetId);
      if (error && !/relation .* does not exist/i.test(error.message)) {
        errors.push(`${table}: ${error.message}`);
      }
    }

    // Player_claims also has claimer_user_id
    await supabaseAdmin.from("player_claims").delete().eq("claimer_user_id", targetId);

    // Anonymize bug_reports (keep history)
    await supabaseAdmin.from("bug_reports").update({ user_id: null }).eq("user_id", targetId);

    // Delete groups created by this user (will cascade where FKs allow)
    const { data: createdGroups } = await supabaseAdmin
      .from("groups")
      .select("id")
      .eq("created_by", targetId);
    if (createdGroups && createdGroups.length > 0) {
      const ids = createdGroups.map((g) => g.id);
      await supabaseAdmin.from("groups").delete().in("id", ids);
    }

    // Delete profile
    const { error: profErr } = await supabaseAdmin
      .from("user_profiles")
      .delete()
      .eq("user_id", targetId);
    if (profErr) errors.push(`user_profiles: ${profErr.message}`);

    // Finally: delete auth user
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (authErr) errors.push(`auth: ${authErr.message}`);

    return { success: errors.length === 0, errors };
  });
