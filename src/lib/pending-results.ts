/**
 * Pending match results: lets non-admin players submit a score that admins
 * must approve before it becomes the official result and triggers Elo.
 *
 * Server enforcement:
 *   - RLS allows INSERT only by players of the match (submitted_by = auth.uid()).
 *   - RLS allows UPDATE/DELETE only by group admins.
 *   - Approval calls submitMatchScoreServerFn (admin-only) which finalizes
 *     the match, writes sets, recomputes round status and processes Elo.
 */
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { submitMatchScore } from "@/lib/elo-engine";

export interface PendingResultRow {
  id: string;
  match_id: string;
  submitted_by: string;
  sets: { setNumber: number; scoreA: number; scoreB: number }[];
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitPendingInput {
  matchId: string;
  sets: { setNumber: number; scoreA: number; scoreB: number }[];
}

/** Player submits a pending score awaiting admin approval. */
export async function submitPendingResult(input: SubmitPendingInput): Promise<PendingResultRow> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) throw new Error("Sessão expirada. Faça login novamente.");

  // Replace any existing pending for this match (allow resubmission)
  await supabase
    .from("pending_match_results")
    .delete()
    .eq("match_id", input.matchId)
    .eq("status", "pending");

  const { data, error } = await supabase
    .from("pending_match_results")
    .insert({
      match_id: input.matchId,
      submitted_by: userId,
      sets: input.sets as never,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as PendingResultRow;
}

/** Admin approves: write final sets via server fn, then mark pending approved. */
export async function approvePendingResult(params: {
  pendingId: string;
  matchId: string;
  seasonId: string;
  sets: { setNumber: number; scoreA: number; scoreB: number }[];
}) {
  const { data: u } = await supabase.auth.getUser();
  const adminId = u?.user?.id;
  if (!adminId) throw new Error("Sessão expirada.");

  // Run admin score submission (validates & writes Elo)
  await submitMatchScore(params.matchId, params.seasonId, params.sets);

  // Mark pending row as approved
  const { error } = await supabase
    .from("pending_match_results")
    .update({
      status: "approved",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      sets: params.sets as never,
    })
    .eq("id", params.pendingId);
  if (error) console.warn("Aprovação registrada parcialmente:", error.message);
}

/** Admin rejects a pending submission. */
export async function rejectPendingResult(pendingId: string, note?: string) {
  const { data: u } = await supabase.auth.getUser();
  const adminId = u?.user?.id;
  if (!adminId) throw new Error("Sessão expirada.");
  const { error } = await supabase
    .from("pending_match_results")
    .update({
      status: "rejected",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    })
    .eq("id", pendingId);
  if (error) throw new Error(error.message);
}

/** Hook: returns the active pending submission for a match (if any). */
export function useMatchPendingResult(matchId: string | null | undefined) {
  const [pending, setPending] = useState<PendingResultRow | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!matchId) {
      setPending(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("pending_match_results")
        .select("*")
        .eq("match_id", matchId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPending((data as unknown as PendingResultRow | null) ?? null);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refresh whenever a row for this match changes
  useEffect(() => {
    if (!matchId) return;
    const ch = supabase
      .channel(`pending-result-${matchId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "pending_match_results", filter: `match_id=eq.${matchId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [matchId, refresh]);

  return { pending, loading, refresh };
}

/** Count of pending results across many matches (used for group dashboard badges). */
export async function countPendingResultsForGroup(groupId: string): Promise<number> {
  // Fetch matches in this group, then count pendings.
  const { data: matches } = await supabase
    .from("matches")
    .select("id, rounds!inner(group_id)")
    .eq("rounds.group_id", groupId);
  const ids = (matches || []).map((m) => m.id);
  if (!ids.length) return 0;
  const { count } = await supabase
    .from("pending_match_results")
    .select("id", { count: "exact", head: true })
    .in("match_id", ids)
    .eq("status", "pending");
  return count ?? 0;
}
