/**
 * Lightweight client-side helper for inserting rows into `audit_logs`.
 *
 * RLS allows admins to view audit logs (SELECT), and INSERT is currently open
 * to authenticated users (no policy blocks it). We always pass the current
 * `auth.uid()` as user_id and the relevant group_id so the AuditPanel can
 * scope queries with `is_group_admin` checks.
 *
 * Failures are swallowed (best-effort logging — we never block the main
 * action because audit insert failed).
 */
import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "presence_force_open"
  | "presence_force_open_undo"
  | "member_removed"
  | "member_promoted"
  | "season_created"
  | "season_finished"
  | "round_created"
  | "round_deleted"
  | "match_score_edited";

export interface LogAuditOptions {
  groupId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

export async function logAudit(opts: LogAuditOptions): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return;
    await supabase.from("audit_logs").insert({
      user_id: userId,
      group_id: opts.groupId,
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId ?? null,
      reason: opts.reason ?? null,
      old_data: (opts.oldData as never) ?? null,
      new_data: (opts.newData as never) ?? null,
    });
  } catch {
    // Best-effort: never throw from audit logging
  }
}
