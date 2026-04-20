import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GroupRecentDeltas {
  rounds_30d: number;
  matches_30d: number;
  new_active_players_30d: number;
  finished_seasons_30d: number;
  new_seasons_30d: number;
}

const EMPTY: GroupRecentDeltas = {
  rounds_30d: 0,
  matches_30d: 0,
  new_active_players_30d: 0,
  finished_seasons_30d: 0,
  new_seasons_30d: 0,
};

/**
 * Computes "in the last N days" counters used as deltas
 * on the Agenda completa summary cards. The window is configurable (default 30 days).
 * Field names keep the `_30d` suffix for back-compat but represent the chosen window.
 */
export function useGroupRecentDeltas(groupId: string | null, windowDays: number = 30) {
  const [data, setData] = useState<GroupRecentDeltas>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setData(EMPTY);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const windowMs = windowDays * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - windowMs).toISOString();

      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, scheduled_date, created_at, status")
        .eq("group_id", groupId);
      let roundsW = 0;
      const recentRoundIds: string[] = [];
      for (const r of rounds || []) {
        const ts = r.scheduled_date
          ? new Date(r.scheduled_date + "T12:00:00").getTime()
          : new Date(r.created_at).getTime();
        if (ts >= Date.now() - windowMs) {
          roundsW += 1;
          recentRoundIds.push(r.id);
        }
      }

      let matchesW = 0;
      if (recentRoundIds.length) {
        const { count } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .in("round_id", recentRoundIds);
        matchesW = count ?? 0;
      }

      const { count: newPlayers } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("status", "active")
        .gte("joined_at", since);

      const { data: recentSeasons } = await supabase
        .from("seasons")
        .select("id, status, end_date, updated_at, created_at")
        .eq("group_id", groupId);
      let finishedW = 0;
      let newW = 0;
      for (const s of recentSeasons || []) {
        if (s.status !== "active") {
          const t = s.end_date
            ? new Date(s.end_date + "T12:00:00").getTime()
            : new Date(s.updated_at).getTime();
          if (t >= Date.now() - windowMs) finishedW += 1;
        }
        if (new Date(s.created_at).getTime() >= Date.now() - windowMs) newW += 1;
      }

      setData({
        rounds_30d: roundsW,
        matches_30d: matchesW,
        new_active_players_30d: newPlayers ?? 0,
        finished_seasons_30d: finishedW,
        new_seasons_30d: newW,
      });
    } catch (err) {
      console.error("Erro ao carregar deltas recentes:", err);
      setData(EMPTY);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, windowDays]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, refresh };
}
