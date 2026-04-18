import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isPresenceOpen } from "@/lib/presence-schedule";

export interface GroupAlert {
  pendingPresence: boolean; // upcoming round (with list ALREADY open) where user hasn't answered
  pendingAdminRequests: number; // join requests waiting (admins only)
}

export function useGroupAlerts(groupIds: string[], adminGroupIds: string[]) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Record<string, GroupAlert>>({});

  const key = groupIds.slice().sort().join(",") + "|" + adminGroupIds.slice().sort().join(",");
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (!user || groupIds.length === 0) {
      setAlerts({});
      return;
    }
    try {
      // Group presence config (to know whether the list is actually open)
      const { data: groupCfgs } = await supabase
        .from("groups")
        .select("id, presence_open_mode, presence_open_time")
        .in("id", groupIds);
      const cfgMap = new Map(
        (groupCfgs || []).map((g) => [
          g.id,
          { presence_open_mode: g.presence_open_mode, presence_open_time: g.presence_open_time },
        ]),
      );

      // Upcoming rounds for these groups
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, group_id, scheduled_date, scheduled_time, status")
        .in("group_id", groupIds)
        .in("status", ["scheduled", "open", "in_progress", "presence_open"]);

      // Only consider rounds whose presence list is currently open
      const openRounds = (rounds || []).filter((r) => {
        const cfg = cfgMap.get(r.group_id);
        if (!cfg) return false;
        return isPresenceOpen(cfg, r.scheduled_date, r.scheduled_time, r.id);
      });

      const roundIds = openRounds.map((r) => r.id);
      const roundToGroup = new Map(openRounds.map((r) => [r.id, r.group_id]));

      const pendingByGroup = new Set<string>();
      if (roundIds.length) {
        const { data: pres } = await supabase
          .from("round_presence")
          .select("round_id, status")
          .in("round_id", roundIds)
          .eq("user_id", user.id);
        const answered = new Set(
          (pres || [])
            .filter((p) => ["confirmed", "absent", "declined"].includes(p.status))
            .map((p) => p.round_id),
        );
        for (const rid of roundIds) {
          if (!answered.has(rid)) {
            const gid = roundToGroup.get(rid);
            if (gid) pendingByGroup.add(gid);
          }
        }
      }

      // Admin: pending join requests
      const adminCounts = new Map<string, number>();
      if (adminGroupIds.length) {
        const { data: reqs } = await supabase
          .from("group_join_requests")
          .select("group_id")
          .in("group_id", adminGroupIds)
          .eq("status", "pending");
        for (const r of reqs || []) {
          adminCounts.set(r.group_id, (adminCounts.get(r.group_id) || 0) + 1);
        }
      }

      const result: Record<string, GroupAlert> = {};
      for (const gid of groupIds) {
        result[gid] = {
          pendingPresence: pendingByGroup.has(gid),
          pendingAdminRequests: adminCounts.get(gid) || 0,
        };
      }
      setAlerts(result);
    } catch (err) {
      console.error("Erro ao carregar alertas dos grupos:", err);
      setAlerts({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh on relevant changes
  useEffect(() => {
    if (!user || groupIds.length === 0) return;
    const channel = supabase
      .channel(`group-alerts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_join_requests" },
        () => refreshRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_presence", filter: `user_id=eq.${user.id}` },
        () => refreshRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds" },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, key, groupIds.length]);

  return { alerts, refresh };
}
