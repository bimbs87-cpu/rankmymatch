import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PendingMatch {
  id: string;
  match_number: number | null;
  match_format: string;
  round_id: string;
  round_number: number | null;
  season_id: string;
  group_id: string;
  group_name: string;
  group_match_format: string;
  sets_per_match: number;
  teamA: { user_id: string; name: string; nickname: string | null; avatar_url: string | null }[];
  teamB: { user_id: string; name: string; nickname: string | null; avatar_url: string | null }[];
  existingSets: { setNumber: number; scoreA: number; scoreB: number }[];
}

/**
 * Fetches the next pending (scheduled) match across all user's groups,
 * or for a specific group if groupId is provided.
 */
export function usePendingMatch(groupId?: string) {
  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get user's groups
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPendingMatch(null); setIsLoading(false); return; }

      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!memberships?.length) { setPendingMatch(null); setIsLoading(false); return; }

      const groupIds = groupId ? [groupId] : memberships.map((m) => m.group_id);

      // Find rounds with pending matches
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, round_number, season_id, group_id, match_format")
        .in("group_id", groupIds)
        .in("status", ["in_progress", "scheduled"])
        .order("scheduled_date", { ascending: true })
        .limit(10);

      if (!rounds?.length) { setPendingMatch(null); setIsLoading(false); return; }

      const roundIds = rounds.map((r) => r.id);

      // Find first scheduled match
      const { data: matches } = await supabase
        .from("matches")
        .select("id, match_number, match_format, round_id, status")
        .in("round_id", roundIds)
        .eq("status", "scheduled")
        .order("match_number", { ascending: true })
        .limit(1);

      if (!matches?.length) { setPendingMatch(null); setIsLoading(false); return; }

      const match = matches[0];
      const round = rounds.find((r) => r.id === match.round_id)!;

      // Load group info, season info, players, sets in parallel
      const [groupRes, seasonRes, playersRes, setsRes] = await Promise.all([
        supabase.from("groups").select("name, match_format").eq("id", round.group_id).single(),
        round.season_id
          ? supabase.from("seasons").select("sets_per_match").eq("id", round.season_id).single()
          : Promise.resolve({ data: null }),
        supabase.from("match_players").select("user_id, team").eq("match_id", match.id),
        supabase.from("match_sets").select("set_number, score_team_a, score_team_b").eq("match_id", match.id).order("set_number"),
      ]);

      const playerIds = (playersRes.data || []).map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url")
        .in("user_id", playerIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      const buildTeam = (team: string) =>
        (playersRes.data || [])
          .filter((p) => p.team === team)
          .map((p) => {
            const prof = profileMap.get(p.user_id);
            return {
              user_id: p.user_id,
              name: prof?.name || "Jogador",
              nickname: prof?.nickname || null,
              avatar_url: prof?.avatar_url || null,
            };
          });

      setPendingMatch({
        id: match.id,
        match_number: match.match_number,
        match_format: match.match_format,
        round_id: match.round_id,
        round_number: round.round_number,
        season_id: round.season_id || "",
        group_id: round.group_id,
        group_name: groupRes.data?.name || "Grupo",
        group_match_format: groupRes.data?.match_format || "doubles",
        sets_per_match: seasonRes.data?.sets_per_match || 3,
        teamA: buildTeam("A"),
        teamB: buildTeam("B"),
        existingSets: (setsRes.data || []).map((s) => ({
          setNumber: s.set_number,
          scoreA: s.score_team_a,
          scoreB: s.score_team_b,
        })),
      });
    } catch (err) {
      console.error("Error loading pending match:", err);
      setPendingMatch(null);
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { pendingMatch, isLoading, refresh };
}
