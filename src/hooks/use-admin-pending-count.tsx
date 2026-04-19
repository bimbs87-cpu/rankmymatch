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

      const [{ data: reqs }, { data: claims }] = await Promise.all([
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
      ]);

      setCount((reqs?.length || 0) + (claims?.length || 0));
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

  // Realtime: refresh on relevant changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`admin-pending-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_join_requests" },
        () => refreshRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_claims" },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { count, adminGroupIds, refresh };
}
