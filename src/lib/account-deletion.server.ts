import type { SupabaseClient } from "@supabase/supabase-js";
import { processDeletionRequest, type DeletionOps, type DeletionStep } from "./account-deletion-runner";

/**
 * Data decisions on account deletion:
 * - Deleted: notifications, push devices/preferences, favorites, reactions, votes,
 *   sessions, acquisition data, onboarding/render events, join requests, admin
 *   permissions, reminder deliveries, waiting lists, personal contacts, own casual matches.
 * - Anonymized: profile (name → "Usuário removido", personal fields cleared),
 *   comments text, bug report authorship, page visits, links in other users' contacts.
 * - Retained (sports history of other players, tied only to the anonymized profile):
 *   matches, sets, participations, presence, Elo events, rankings, season stats,
 *   confirmations, audit logs and the deletion request record itself.
 * - Group memberships become "left" so rankings keep their history.
 */
const DELETE_BY_USER = [
  "notifications",
  "push_subscriptions",
  "push_notification_preferences",
  "compare_favorites",
  "comment_reactions",
  "bug_report_votes",
  "user_sessions",
  "user_acquisition",
  "admin_pending_reminder_log",
  "group_join_requests",
  "group_admin_permissions",
  "onboarding_events",
  "og_render_events",
  "round_reminder_deliveries",
  "waiting_list",
] as const;

type Admin = SupabaseClient<any>;

async function check(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p;
  if (error) throw error;
}

async function runStep(db: Admin, step: DeletionStep, userId: string) {
  if (step === "personal_data") {
    for (const table of DELETE_BY_USER) await check(db.from(table).delete().eq("user_id", userId));
    await check(db.from("player_claims").delete().eq("claimer_user_id", userId));
    await check(db.from("casual_matches").delete().eq("owner_user_id", userId));
    await check(db.from("personal_contacts").delete().eq("owner_user_id", userId));
    await check(db.from("personal_contacts").update({ linked_user_id: null }).eq("linked_user_id", userId));
    await check(db.from("casual_match_participants").update({ linked_user_id: null }).eq("linked_user_id", userId));
    await check(db.from("comments").update({ content: "[comentário removido]" }).eq("user_id", userId));
    await check(db.from("bug_reports").update({ user_id: null }).eq("user_id", userId));
    await check(db.from("page_visits").update({ user_id: null }).eq("user_id", userId));
    await check(db.from("group_members").update({ status: "left" }).eq("user_id", userId).eq("status", "active"));
    return;
  }
  if (step === "profile") {
    await check(
      db
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
          privacy_settings: { show_personal: false, show_stats: false, show_groups: false, show_achievements: false },
          deletion_requested_at: null,
          deletion_scheduled_for: null,
        })
        .eq("user_id", userId),
    );
    return;
  }
  if (step === "auth_identity") {
    const { error } = await db.auth.admin.deleteUser(userId);
    // Already gone counts as done (idempotent retry).
    if (error && (error as { status?: number }).status !== 404) throw error;
    return;
  }
  // verify_identity
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (data?.user) throw Object.assign(new Error("identity_still_exists"), { code: "identity_still_exists" });
  if (error && (error as { status?: number }).status !== 404) throw error;
}

export function createDeletionOps(db: Admin): DeletionOps {
  return {
    runStep: (step, userId) => runStep(db, step, userId),
    recordStep: (id, steps) => check(db.from("account_deletion_requests").update({ completed_steps: steps }).eq("id", id)),
    markExecuted: (id) =>
      check(
        db
          .from("account_deletion_requests")
          .update({ status: "executed", executed_at: new Date().toISOString(), last_error: null })
          .eq("id", id)
          .eq("status", "processing"),
      ),
    markFailed: (id, code) =>
      check(db.from("account_deletion_requests").update({ status: "failed", last_error: code }).eq("id", id)),
  };
}

/** Processes due requests one claim at a time. Returns counts only (no identifiers). */
export async function runDueDeletions(db: Admin, maxPerRun = 20) {
  const ops = createDeletionOps(db);
  let executed = 0;
  let failed = 0;
  for (let i = 0; i < maxPerRun; i++) {
    const { data, error } = await db.rpc("claim_next_account_deletion");
    if (error) throw error;
    const req = (data as Array<{ id: string; user_id: string; completed_steps: string[] }> | null)?.[0];
    if (!req) break;
    const outcome = await processDeletionRequest(req, ops);
    if (outcome.status === "executed") executed++;
    else {
      failed++;
      console.error("[account-deletion] request failed", { step: outcome.step, code: outcome.code });
    }
  }
  return { executed, failed };
}
