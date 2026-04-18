// Server-only helpers for round status. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RoundStatus = "scheduled" | "in_progress" | "completed";

function derive(statuses: string[]): RoundStatus {
  if (!statuses.length) return "scheduled";
  if (statuses.every((s) => s === "completed")) return "completed";
  return "in_progress";
}

/**
 * Server-internal helper (no auth check) — call from other server functions
 * that have already validated authorization.
 */
export async function recomputeRoundStatusInternal(roundId: string): Promise<RoundStatus> {
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("status")
    .eq("round_id", roundId);
  const status = derive((matches || []).map((m) => m.status));
  await supabaseAdmin.from("rounds").update({ status }).eq("id", roundId);
  return status;
}

export { derive as deriveRoundStatusFromMatches };
