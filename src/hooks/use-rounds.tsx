import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Round = Tables<"rounds">;
type RoundPresence = Tables<"round_presence">;

export function useSeasonRounds(seasonId: string) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!seasonId) {
      setRounds([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data } = await supabase
      .from("rounds")
      .select("*")
      .eq("season_id", seasonId)
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("round_number", { ascending: true });
    setRounds(data || []);
    setIsLoading(false);
  }, [seasonId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { rounds, isLoading, refresh };
}

export function useRoundDetail(roundId: string) {
  const { user } = useAuth();
  const [round, setRound] = useState<Round | null>(null);
  const [presences, setPresences] = useState<(RoundPresence & { profile?: Tables<"user_profiles"> })[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [myPresence, setMyPresence] = useState<RoundPresence | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    const { data: r } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .single();
    setRound(r);

    if (!r) { setIsLoading(false); return; }

    const { data: pres } = await supabase
      .from("round_presence")
      .select("*")
      .eq("round_id", roundId)
      .order("confirmed_at", { ascending: true });

    if (pres?.length) {
      const userIds = pres.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("*")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const enriched = pres.map((p) => ({ ...p, profile: profileMap.get(p.user_id) }));
      setPresences(enriched);
      if (user) setMyPresence(enriched.find((p) => p.user_id === user.id) || null);
    } else {
      setPresences([]);
      setMyPresence(null);
    }

    const { data: matchesData } = await supabase
      .from("matches")
      .select("*, match_players(*), match_sets(*)")
      .eq("round_id", roundId)
      .order("match_number", { ascending: true });

    if (matchesData?.length) {
      const playerUserIds = matchesData.flatMap((m: any) =>
        (m.match_players || []).map((mp: any) => mp.user_id)
      );
      const uniqueIds = [...new Set(playerUserIds)];
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("*")
        .in("user_id", uniqueIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      setMatches(
        matchesData.map((m: any) => ({
          ...m,
          match_players: (m.match_players || []).map((mp: any) => ({
            ...mp,
            profile: profileMap.get(mp.user_id),
          })),
        }))
      );
    } else {
      setMatches([]);
    }

    setIsLoading(false);
  }, [roundId, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const confirmedCount = presences.filter((p) => p.status === "confirmed").length;

  return { round, presences, matches, myPresence, confirmedCount, isLoading, refresh };
}
