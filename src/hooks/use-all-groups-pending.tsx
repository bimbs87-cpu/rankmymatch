/**
 * Aggregates total admin pending tasks across ALL of the user's groups so the
 * BottomNav/DesktopNav "Grupos" badge reflects every group where the admin is
 * waited on, not just the primary one.
 *
 * Returns a single number = sum of (joinRequests + playerClaims + matchResults)
 * for every group id passed in.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_TTL_MS = 30_000;
const CACHE_PREFIX = "rmm:allGroupsPending:";

function readCache(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: number; ts: number };
    if (!parsed || typeof parsed.value !== "number") return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    // quota exceeded — ignore
  }
}

export function useAllGroupsPending(groupIds: string[]) {
  const key = groupIds.slice().sort().join(",");
  // Hydrate from sessionStorage so the badge doesn't flicker '0/skeleton'
  // every time the user navigates between pages.
  const cached = readCache(key);
  const [total, setTotal] = useState<number>(cached ?? 0);
  const [loading, setLoading] = useState(groupIds.length > 0 && cached === null);

  const refresh = useCallback(async () => {
    if (groupIds.length === 0) {
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [jr, pc, matches] = await Promise.all([
        supabase
          .from("group_join_requests")
          .select("id", { count: "exact", head: true })
          .in("group_id", groupIds)
          .eq("status", "pending"),
        supabase
          .from("player_claims")
          .select("id", { count: "exact", head: true })
          .in("group_id", groupIds)
          .eq("status", "pending"),
        supabase
          .from("matches")
          .select("id, rounds!inner(group_id)")
          .in("rounds.group_id", groupIds),
      ]);

      let matchResultsCount = 0;
      const matchIds = (matches.data || []).map((m: any) => m.id);
      if (matchIds.length) {
        const { count } = await supabase
          .from("pending_match_results")
          .select("id", { count: "exact", head: true })
          .in("match_id", matchIds)
          .eq("status", "pending");
        matchResultsCount = count ?? 0;
      }

      const next = (jr.count ?? 0) + (pc.count ?? 0) + matchResultsCount;
      setTotal(next);
      writeCache(key, next);
    } catch {
      // ignore — keep last value
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refetch on changes to any of the source tables.
  // Use a unique per-mount channel name to avoid StrictMode collisions
  // ("cannot add postgres_changes callbacks ... after subscribe()").
  useEffect(() => {
    if (groupIds.length === 0) return;
    const channelName = `all-groups-pending-${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase
      .channel(channelName)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "group_join_requests" }, () => void refresh())
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "player_claims" }, () => void refresh())
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "pending_match_results" }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);

  return { total, loading };
}
