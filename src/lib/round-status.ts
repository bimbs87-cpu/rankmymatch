/**
 * Round status computation — single source of truth.
 *
 * Rules:
 * - No matches             → "scheduled"
 * - Any match != completed → "in_progress"
 * - All matches = completed → "completed"
 *
 * Use `recomputeRoundStatus` from CLIENT code (supabase RLS).
 * Use `recomputeRoundStatusWithClient` for SERVER code (pass supabaseAdmin).
 */

import { supabase } from "@/integrations/supabase/client";
import { recomputeRoundStatusServerFn } from "@/lib/round-status.functions";

export type RoundStatus = "scheduled" | "in_progress" | "completed";

/**
 * Pure helper — computes the status from a list of match statuses.
 */
export function deriveRoundStatus(matchStatuses: string[]): RoundStatus {
  if (!matchStatuses.length) return "scheduled";
  const allCompleted = matchStatuses.every((s) => s === "completed");
  if (allCompleted) return "completed";
  return "in_progress";
}

/**
 * Recompute and persist the status of a round.
 * Calls the server function so that admin-only updates always succeed.
 */
export async function recomputeRoundStatus(roundId: string): Promise<RoundStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return recomputeRoundStatusClient(roundId);
  }
  const result = await recomputeRoundStatusServerFn({
    data: { roundId },
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  return result.status as RoundStatus;
}

/**
 * Variant that runs entirely on the client using the user's supabase session.
 * Useful when admin permissions are guaranteed and we want to skip an RPC.
 */
export async function recomputeRoundStatusClient(roundId: string): Promise<RoundStatus> {
  const { data: matches } = await supabase
    .from("matches")
    .select("status")
    .eq("round_id", roundId);

  const status = deriveRoundStatus((matches || []).map((m) => m.status));
  await supabase.from("rounds").update({ status }).eq("id", roundId);
  return status;
}
