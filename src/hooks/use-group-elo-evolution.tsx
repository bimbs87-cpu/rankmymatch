import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerEloLine {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** Sorted by date asc. */
  points: { ts: number; rating: number }[];
}

export interface SeasonOption {
  id: string;
  name: string;
  status: string;
}

export interface GroupEloEvolution {
  series: PlayerEloLine[];
  minTs: number;
  maxTs: number;
  seasons: SeasonOption[];
}

const EMPTY: GroupEloEvolution = { series: [], minTs: 0, maxTs: 0, seasons: [] };

export type SeasonFilter = "all" | "active" | string; // string = season id

export function useGroupEloEvolution(groupId: string | null, filter: SeasonFilter = "all") {
  const [data, setData] = useState<GroupEloEvolution>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setData(EMPTY);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        // Load seasons (for filter UI + active resolution)
        const { data: seasonsRaw } = await supabase
          .from("seasons")
          .select("id, name, status, created_at")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false });
        const seasons: SeasonOption[] = (seasonsRaw || []).map((s) => ({
          id: s.id, name: s.name, status: s.status,
        }));

        // Resolve season filter
        let seasonIdFilter: string | null = null;
        if (filter === "active") {
          seasonIdFilter = seasons.find((s) => s.status === "active")?.id || null;
        } else if (filter !== "all") {
          seasonIdFilter = filter;
        }

        // Rounds in the group (optionally restricted to a season)
        let roundsQuery = supabase
          .from("rounds")
          .select("id, scheduled_date, created_at, season_id")
          .eq("group_id", groupId);
        if (seasonIdFilter) roundsQuery = roundsQuery.eq("season_id", seasonIdFilter);
        const { data: rounds } = await roundsQuery;
        const roundIds = (rounds || []).map((r) => r.id);
        if (!roundIds.length) {
          if (!cancelled) { setData({ ...EMPTY, seasons }); setIsLoading(false); }
          return;
        }
        const dateOf = new Map<string, number>();
        for (const r of rounds || []) {
          const ts = r.scheduled_date
            ? new Date(r.scheduled_date + "T12:00:00").getTime()
            : new Date(r.created_at).getTime();
          dateOf.set(r.id, ts);
        }

        const { data: matches } = await supabase
          .from("matches").select("id, round_id, created_at").in("round_id", roundIds);
        const matchIds = (matches || []).map((m) => m.id);
        if (!matchIds.length) {
          if (!cancelled) { setData({ ...EMPTY, seasons }); setIsLoading(false); }
          return;
        }
        const matchDate = new Map<string, number>();
        for (const m of matches || []) {
          matchDate.set(m.id, dateOf.get(m.round_id) ?? new Date(m.created_at).getTime());
        }

        const { data: events } = await supabase
          .from("rating_events")
          .select("user_id, rating_after, match_id, created_at")
          .in("match_id", matchIds);

        const byUser = new Map<string, { ts: number; rating: number }[]>();
        let minTs = Infinity, maxTs = -Infinity;
        for (const e of events || []) {
          const ts = matchDate.get(e.match_id) ?? new Date(e.created_at).getTime();
          if (ts < minTs) minTs = ts;
          if (ts > maxTs) maxTs = ts;
          const arr = byUser.get(e.user_id) || [];
          arr.push({ ts, rating: Number(e.rating_after) });
          byUser.set(e.user_id, arr);
        }
        for (const arr of byUser.values()) arr.sort((a, b) => a.ts - b.ts);

        const ids = [...byUser.keys()];
        const profileMap = new Map<string, { name: string; nickname: string | null; avatar_url: string | null }>();
        if (ids.length) {
          const { data: profs } = await supabase
            .from("user_profiles").select("user_id, name, nickname, avatar_url").in("user_id", ids);
          for (const p of profs || []) profileMap.set(p.user_id, { name: p.name, nickname: p.nickname, avatar_url: p.avatar_url });
        }
        const series: PlayerEloLine[] = ids.map((uid) => {
          const p = profileMap.get(uid);
          return {
            user_id: uid,
            name: p?.nickname || p?.name || "Jogador",
            avatar_url: p?.avatar_url ?? null,
            points: byUser.get(uid) || [],
          };
        });
        series.sort((a, b) => {
          const ra = a.points[a.points.length - 1]?.rating ?? 0;
          const rb = b.points[b.points.length - 1]?.rating ?? 0;
          return rb - ra;
        });

        if (!cancelled) {
          setData({
            series,
            minTs: isFinite(minTs) ? minTs : 0,
            maxTs: isFinite(maxTs) ? maxTs : 0,
            seasons,
          });
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Erro ao carregar evolução de Elo:", err);
        if (!cancelled) { setData(EMPTY); setIsLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, filter]);

  return { data, isLoading };
}
