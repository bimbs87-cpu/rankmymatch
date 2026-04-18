import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({ roundId: z.string().uuid() });

export type RoundStatus = "scheduled" | "in_progress" | "completed";

function derive(statuses: string[]): RoundStatus {
  if (!statuses.length) return "scheduled";
  if (statuses.every((s) => s === "completed")) return "completed";
  return "in_progress";
}

/**
 * Recomputes a round's status server-side and persists it.
 * Authorization: any authenticated group member can trigger it; the round
 * status is derived purely from existing match statuses, so this is safe.
 */
export const recomputeRoundStatusServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { roundId } = data;
    const { userId } = context;

    // Verify the user is a member of the round's group (any role).
    const { data: round, error: rErr } = await supabaseAdmin
      .from("rounds")
      .select("id, group_id, status")
      .eq("id", roundId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!round) throw new Error("Rodada não encontrada");

    const { data: isMember } = await supabaseAdmin.rpc("is_group_member", {
      _user_id: userId,
      _group_id: round.group_id,
    });
    if (!isMember) throw new Error("Você não é membro deste grupo");

    const { data: matches, error: mErr } = await supabaseAdmin
      .from("matches")
      .select("status")
      .eq("round_id", roundId);
    if (mErr) throw new Error(mErr.message);

    const status = derive((matches || []).map((m) => m.status));

    if (status !== round.status) {
      await supabaseAdmin.from("rounds").update({ status }).eq("id", roundId);
    }

    return { status, previousStatus: round.status };
  });

/**
 * Server-internal helper (no auth check) — call this from other server
 * functions that have already validated authorization.
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
