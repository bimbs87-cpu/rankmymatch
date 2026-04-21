import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Permanently deletes the authenticated user's account.
 *
 * Strategy (LGPD-compliant):
 * - Anonymizes the user_profile (name → "Usuário removido", clears personal
 *   fields, marks is_placeholder=true). This preserves match history and
 *   ranking integrity for the groups where the user played.
 * - Deletes all personal/transient data: notifications, push subscriptions,
 *   compare favorites, comments, bug reports, sales leads, sessions, etc.
 * - Removes the user from all groups (group_members rows).
 * - Finally, deletes the auth.users row via the admin API. The user is logged
 *   out on next request.
 */
export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // 1. Anonymize the public profile so historical references stay intact
    //    but no personal data remains visible.
    const { error: anonErr } = await supabaseAdmin
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
      })
      .eq("user_id", userId);

    if (anonErr) {
      console.error("[delete-account] anonymize profile failed:", anonErr);
      throw new Error("Não foi possível anonimizar o perfil");
    }

    // 2. Delete personal/transient data. Errors here are logged but not fatal —
    //    we want auth.users deletion to succeed regardless.
    const cleanupOps: Array<{ table: string; promise: PromiseLike<unknown> }> = [
      { table: "notifications", promise: supabaseAdmin.from("notifications").delete().eq("user_id", userId) },
      { table: "push_subscriptions", promise: supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId) },
      { table: "push_notification_preferences", promise: supabaseAdmin.from("push_notification_preferences").delete().eq("user_id", userId) },
      { table: "compare_favorites", promise: supabaseAdmin.from("compare_favorites").delete().eq("user_id", userId) },
      { table: "comments", promise: supabaseAdmin.from("comments").delete().eq("user_id", userId) },
      { table: "comment_reactions", promise: supabaseAdmin.from("comment_reactions").delete().eq("user_id", userId) },
      { table: "bug_report_votes", promise: supabaseAdmin.from("bug_report_votes").delete().eq("user_id", userId) },
      { table: "user_sessions", promise: supabaseAdmin.from("user_sessions").delete().eq("user_id", userId) },
      { table: "user_acquisition", promise: supabaseAdmin.from("user_acquisition").delete().eq("user_id", userId) },
      { table: "admin_pending_reminder_log", promise: supabaseAdmin.from("admin_pending_reminder_log").delete().eq("user_id", userId) },
      { table: "group_members", promise: supabaseAdmin.from("group_members").delete().eq("user_id", userId) },
      { table: "group_join_requests", promise: supabaseAdmin.from("group_join_requests").delete().eq("user_id", userId) },
      { table: "group_admin_permissions", promise: supabaseAdmin.from("group_admin_permissions").delete().eq("user_id", userId) },
      { table: "round_presence", promise: supabaseAdmin.from("round_presence").delete().eq("user_id", userId) },
    ];

    for (const op of cleanupOps) {
      const result = (await op.promise) as { error?: { message: string } | null };
      if (result?.error) {
        console.warn(`[delete-account] cleanup ${op.table} warning:`, result.error.message);
      }
    }

    // 3. Mark bug reports as anonymous (preserve content for triage)
    await supabaseAdmin
      .from("bug_reports")
      .update({ user_id: null })
      .eq("user_id", userId);

    // 4. Finally: remove the auth user. After this the JWT becomes invalid.
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error("[delete-account] auth deleteUser failed:", deleteErr);
      throw new Error("Não foi possível excluir a conta. Tente novamente.");
    }

    return { success: true };
  });
