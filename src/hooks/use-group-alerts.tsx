import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface GroupAlert {
  pendingPresence: boolean; // upcoming round where user hasn't confirmed/declined
  pendingAdminRequests: number; // join requests waiting (admins only)
}

export function useGroupAlerts(groupIds: string[], adminGroupIds: string[]) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Record<string, GroupAlert>>({});

  const key = groupIds.slice().sort().join(",") + "|" + adminGroupIds.slice().sort().join(",");

  const refresh = useCallback(async () => {
    if (!user || groupIds.length === 0) {
      setAlerts({});
      return;
    }
    try {
      // Fetch upcoming rounds for these groups
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, group_id")
        .in("group_id", groupIds)
        .in("status", ["scheduled", "open", "in_progress", "presence_open"]);

      const roundIds = (rounds || []).map((r) => r.id);
      const roundToGroup = new Map((rounds || []).map((r) => [r.id, r.group_id]));

      let pendingByGroup = new Set<string>();
      if (roundIds.length) {
        // Find user's presence rows for these rounds
        const { data: pres } = await supabase
          .from("round_presence")
          .select("round_id, status")
          .in("round_id", roundIds)
          .eq("user_id", user.id);
        const answeredRoundIds = new Set(
          (pres || [])
            .filter((p) => p.status === "confirmed" || p.status === "absent" || p.status === "declined")
            .map((p) => p.round_id),
        );
        for (const rid of roundIds) {
          if (!answeredRoundIds.has(rid)) {
            const gid = roundToGroup.get(rid);
            if (gid) pendingByGroup.add(gid);
          }
        }
      }

      // Admin pending join requests
      let adminCounts = new Map<string, number>();
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
    refresh();
  }, [refresh]);

  return { alerts, refresh };
}
