import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GroupRecentDeltas {
  // Last 30 days vs previous 30 days
  rounds_30d: number;
  matches_30d: number;
  new_active_players_30d: number;
  finished_seasons_30d: number;
  // Total seasons created in last 30 days (vs nothing — informational only)
  new_seasons_30d: number;
}

const EMPTY: GroupRecentDeltas = {
  rounds_30d: 0,
  matches_30d: 0,
  new_active_players_30d: 0,
  finished_seasons_30d: 0,
  new_seasons_30d: 0,
};

const MS_30D = 30 * 24 * 60 * 60 * 1000;

/**
 * Computes simple "in the last 30 days" counters used as deltas
 * on the Agenda completa summary cards.
 */
export function useGroupRecentDeltas(groupId: string | null) {
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
      const since = new Date(Date.now() - MS_30D).toISOString();
      const sinceDate = since.slice(0, 10);

      // Rounds in last 30d (by scheduled_date if available, else created_at)
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, scheduled_date, created_at, status")
        .eq("group_id", groupId);
      let rounds30 = 0;
      const recentRoundIds: string[] = [];
      for (const r of rounds || []) {
        const ts = r.scheduled_date
          ? new Date(r.scheduled_date + "T12:00:00").getTime()
          : new Date(r.created_at).getTime();
        if (ts >= Date.now() - MS_30D) {
          rounds30 += 1;
          recentRoundIds.push(r.id);
        }
      }

      // Matches in last 30d (matches whose round falls in the window)
      let matches30 = 0;
      if (recentRoundIds.length) {
        const { count } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .in("round_id", recentRoundIds);
        matches30 = count ?? 0;
      }

      // New active members joined in last 30d
      const { count: newPlayers } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("status", "active")
        .gte("joined_at", since);

      // Seasons finished in last 30d (status != active && updated_at recent)
      // Approximation: seasons not active AND updated within window.
      const { data: recentSeasons } = await supabase
        .from("seasons")
        .select("id, status, end_date, updated_at, created_at")
        .eq("group_id", groupId);
      let finished30 = 0;
      let new30 = 0;
      for (const s of recentSeasons || []) {
        if (s.status !== "active") {
          const t = s.end_date
            ? new Date(s.end_date + "T12:00:00").getTime()
            : new Date(s.updated_at).getTime();
          if (t >= Date.now() - MS_30D) finished30 += 1;
        }
        if (new Date(s.created_at).getTime() >= Date.now() - MS_30D) new30 += 1;
      }

      setData({
        rounds_30d: rounds30,
        matches_30d: matches30,
        new_active_players_30d: newPlayers ?? 0,
        finished_seasons_30d: finished30,
        new_seasons_30d: new30,
      });
    } catch (err) {
      console.error("Erro ao carregar deltas recentes:", err);
      setData(EMPTY);
    } finally {
      setIsLoading(false);
    }
    // sinceDate intentionally unused outside (avoid lint warn by referencing)
    void sinceDate;
  }, [groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, refresh };
}
