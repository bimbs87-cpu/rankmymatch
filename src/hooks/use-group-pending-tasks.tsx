/**
 * Aggregates all pending admin tasks for a single group:
 *   - Join requests (group_join_requests)
 *   - Player claims (player_claims)
 *   - Pending match results (pending_match_results)
 *
 * Used by the admin "Pendências" badges on the group overview.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sharedFetch } from "@/lib/shared-fetch";

export interface GroupPendingTasks {
  joinRequests: number;
  playerClaims: number;
  matchResults: number;
  total: number;
}

const ZERO: GroupPendingTasks = { joinRequests: 0, playerClaims: 0, matchResults: 0, total: 0 };

export function useGroupPendingTasks(groupId: string | null | undefined, enabled = true) {
  const [counts, setCounts] = useState<GroupPendingTasks>(ZERO);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!groupId || !enabled) {
      setCounts(ZERO);
      return;
    }
    setLoading(true);
    try {
      // Deduped across simultaneous instances and realtime-triggered refreshes.
      const next = await sharedFetch(`group-pending:${groupId}`, 5_000, async () => {
        const [joinRequestsCount, claimsCount, matchesRes] = await Promise.all([
          getCount("group_join_requests", { group_id: groupId, status: "pending" }),
          getCount("player_claims", { group_id: groupId, status: "pending" }),
          // Match ids in this group (needed to scope pending_match_results)
          supabase
            .from("matches")
            .select("id, rounds!inner(group_id)")
            .eq("rounds.group_id", groupId),
        ]);

        const matchIds = (matchesRes.data || []).map((m: any) => m.id);
        let matchResultsCount = 0;
        if (matchIds.length) {
          const { count } = await supabase
            .from("pending_match_results")
            .select("id", { count: "exact", head: true })
            .in("match_id", matchIds)
            .eq("status", "pending");
          matchResultsCount = count ?? 0;
        }

        return {
          joinRequests: joinRequestsCount,
          playerClaims: claimsCount,
          matchResults: matchResultsCount,
          total: joinRequestsCount + claimsCount + matchResultsCount,
        };
      });
      setCounts(next);
    } finally {
      setLoading(false);
    }
  }, [groupId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refresh on changes to any of the 3 sources
  useEffect(() => {
    if (!groupId || !enabled) return;
    const suffix = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`group-pending-${groupId}-${suffix}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "group_join_requests", filter: `group_id=eq.${groupId}` }, () => void refresh())
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "player_claims", filter: `group_id=eq.${groupId}` }, () => void refresh())
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "pending_match_results" }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [groupId, enabled, refresh]);

  return { counts, loading, refresh };
}

async function getCount(table: "group_join_requests" | "player_claims", filters: Record<string, string>): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}
