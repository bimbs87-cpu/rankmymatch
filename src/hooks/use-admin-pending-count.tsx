import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Counts ALL pending admin moderation requests across every group the user
 * administers (creator/admin), summing join requests + player claims.
 * Used by the global notification bell badge so admins never miss a request.
 */
export function useAdminPendingCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [adminGroupIds, setAdminGroupIds] = useState<string[]>([]);
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      setAdminGroupIds([]);
      return;
    }
    try {
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id, role")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("role", ["creator", "admin"]);

      const ids = (memberships || []).map((m) => m.group_id);
      setAdminGroupIds(ids);

      if (!ids.length) {
        setCount(0);
        return;
      }

      const [{ data: reqs }, { data: claims }, { data: matches }] = await Promise.all([
        supabase
          .from("group_join_requests")
          .select("id", { count: "exact" })
          .in("group_id", ids)
          .eq("status", "pending"),
        supabase
          .from("player_claims")
          .select("id", { count: "exact" })
          .in("group_id", ids)
          .eq("status", "pending"),
        // Get all match ids in admin groups so we can scope pending_match_results
        supabase
          .from("matches")
          .select("id, rounds!inner(group_id)")
          .in("rounds.group_id", ids),
      ]);

      const matchIds = (matches || []).map((m: any) => m.id);
      let pendingResults = 0;
      if (matchIds.length) {
        const { data: prs } = await supabase
          .from("pending_match_results")
          .select("id")
          .in("match_id", matchIds)
          .eq("status", "pending");
        pendingResults = prs?.length || 0;
      }

      setCount((reqs?.length || 0) + (claims?.length || 0) + pendingResults);
    } catch (err) {
      console.error("Erro ao contar solicitações admin pendentes:", err);
      setCount(0);
    }
  }, [user]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refresh on relevant changes.
  // Use a unique channel name per mount to avoid "cannot add postgres_changes
  // callbacks after subscribe()" errors in StrictMode / fast remounts where
  // the same channel name gets reused before the previous one is fully removed.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const channelName = `admin-pending-${uid}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(channelName);
    channel
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "group_join_requests" },
        () => refreshRef.current(),
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "player_claims" },
        () => refreshRef.current(),
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "pending_match_results" },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { count, adminGroupIds, refresh };
}
