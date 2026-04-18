import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deriveRoundStatusFromMatches } from "@/lib/round-status.server";

const Input = z.object({ roundId: z.string().uuid() });

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

    const status = deriveRoundStatusFromMatches((matches || []).map((m) => m.status));

    if (status !== round.status) {
      await supabaseAdmin.from("rounds").update({ status }).eq("id", roundId);
    }

    return { status, previousStatus: round.status };
  });
