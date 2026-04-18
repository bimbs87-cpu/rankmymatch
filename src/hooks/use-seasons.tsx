import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notifyGroupMembers } from "@/hooks/use-notifications";
import { revertMatchElo } from "@/lib/elo-engine";
import { recomputeRoundStatus } from "@/lib/round-status";
import type { Tables } from "@/integrations/supabase/types";

type Season = Tables<"seasons">;
type Round = Tables<"rounds">;
type RoundPresence = Tables<"round_presence">;

export function useGroupSeasons(groupId: string) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("seasons")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    setSeasons(data || []);
    setIsLoading(false);
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { seasons, isLoading, refresh };
}

export function useSeasonRounds(seasonId: string) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("rounds")
      .select("*")
      .eq("season_id", seasonId)
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

    // Presences
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

    // Matches with players
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

function normalizeSeasonMatchFormat(format?: string) {
  return format === "singles" || format === "1v1" ? "1v1" : "2v2";
}

export async function createSeason(data: {
  groupId: string;
  name: string;
  userId: string;
  matchFormat?: string;
  totalRounds?: number;
}) {
  const { data: season, error } = await supabase
    .from("seasons")
    .insert({
      group_id: data.groupId,
      name: data.name,
      created_by: data.userId,
      match_format: normalizeSeasonMatchFormat(data.matchFormat),
      total_rounds: data.totalRounds || null,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;
  return season;
}

export async function createRound(data: {
  groupId: string;
  seasonId: string;
  roundNumber: number;
  scheduledDate?: string;
  scheduledTime?: string;
  location?: string;
  maxPlayers?: number;
  matchFormat?: string;
  userId: string;
}) {
  const isSingles = data.matchFormat === "singles";
  const { data: round, error } = await supabase
    .from("rounds")
    .insert({
      group_id: data.groupId,
      season_id: data.seasonId,
      round_number: data.roundNumber,
      scheduled_date: data.scheduledDate || null,
      scheduled_time: data.scheduledTime || null,
      location: data.location || null,
      max_players: data.maxPlayers || (isSingles ? 2 : 8),
      match_format: isSingles ? "singles" : "doubles",
      status: "scheduled",
    })
    .select()
    .single();
  if (error) throw error;

  // Notify group members
  notifyGroupMembers({
    groupId: data.groupId,
    actorId: data.userId,
    type: "round_created",
    title: "Nova rodada agendada!",
    body: `Rodada ${data.roundNumber}${data.scheduledDate ? ` em ${new Date(data.scheduledDate + "T00:00:00").toLocaleDateString("pt-BR")}` : ""} foi criada. Confirme sua presença!`,
    data: { roundId: round.id, seasonId: data.seasonId },
  });

  return round;
}

export async function confirmPresence(roundId: string, userId: string) {
  const { error } = await supabase.from("round_presence").upsert(
    {
      round_id: roundId,
      user_id: userId,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: "round_id,user_id" }
  );
  if (error) {
    // fallback: try insert
    const { error: insertError } = await supabase.from("round_presence").insert({
      round_id: roundId,
      user_id: userId,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
  }
}

export async function cancelPresence(roundId: string, userId: string) {
  await supabase
    .from("round_presence")
    .update({ status: "absent" })
    .eq("round_id", roundId)
    .eq("user_id", userId);
}

// Build singles pairings ordered by Elo.
// 4 players: round 1 = 1v4/2v3, round 2 = 1v3/2v4, round 3 = 1v2/3v4 (King of the Court).
// 6+ players (even): classic round-robin (circle method) ordered by Elo, returns round 1 only.
function buildSinglesPairs(orderedIds: string[]): Array<[string, string]> {
  const n = orderedIds.length;
  if (n < 2 || n % 2 !== 0) return [];

  if (n === 4) {
    const [p1, p2, p3, p4] = orderedIds;
    return [[p1, p4], [p2, p3]];
  }

  // Round-robin circle method, first round (anchor + reversed tail vs head)
  const pairs: Array<[string, string]> = [];
  const half = n / 2;
  const left = orderedIds.slice(0, half);
  const right = orderedIds.slice(half).reverse();
  for (let i = 0; i < half; i++) {
    pairs.push([left[i], right[i]]);
  }
  return pairs;
}

// Shuffle and draw teams for 2v2 padel matches; for singles, pair by Elo (King of the Court).
export async function drawTeams(roundId: string, confirmedPlayerIds: string[], actorId?: string) {
  // Get round info for notification and format
  const { data: roundData } = await supabase
    .from("rounds")
    .select("round_number, group_id, match_format, season_id")
    .eq("id", roundId)
    .single();

  const isSingles = roundData?.match_format === "singles";
  const playersPerMatch = isSingles ? 2 : 4;

  let pairings: Array<string[]> = [];

  if (isSingles && roundData?.season_id && confirmedPlayerIds.length >= 2 && confirmedPlayerIds.length % 2 === 0) {
    // Fetch latest ratings for these players in this season
    const { data: snapshots } = await supabase
      .from("ranking_snapshots")
      .select("user_id, rating, snapshot_date")
      .eq("season_id", roundData.season_id)
      .in("user_id", confirmedPlayerIds)
      .order("snapshot_date", { ascending: false });

    const ratingMap = new Map<string, number>();
    (snapshots || []).forEach((s) => {
      if (!ratingMap.has(s.user_id)) ratingMap.set(s.user_id, Number(s.rating));
    });

    // Order players by rating desc (default 1000); tie-break random
    const ordered = [...confirmedPlayerIds]
      .map((id) => ({ id, rating: ratingMap.get(id) ?? 1000, r: Math.random() }))
      .sort((a, b) => (b.rating - a.rating) || (a.r - b.r))
      .map((x) => x.id);

    const pairs = buildSinglesPairs(ordered);
    pairings = pairs.map(([a, b]) => [a, b]);
  } else {
    // Default: shuffle and chunk
    const shuffled = [...confirmedPlayerIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const matchCount = Math.floor(shuffled.length / playersPerMatch);
    for (let i = 0; i < matchCount; i++) {
      pairings.push(shuffled.slice(i * playersPerMatch, (i + 1) * playersPerMatch));
    }
  }

  const matchCount = pairings.length;
  const createdMatches = [];

  for (let i = 0; i < matchCount; i++) {
    const group = pairings[i];
    const teamA = isSingles ? [group[0]] : group.slice(0, 2);
    const teamB = isSingles ? [group[1]] : group.slice(2, 4);

    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        round_id: roundId,
        match_number: i + 1,
        status: "scheduled",
        match_format: isSingles ? "singles" : "doubles",
      })
      .select()
      .single();

    if (error) throw error;

    const players = [
      ...teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: "A" })),
      ...teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: "B" })),
    ];

    await supabase.from("match_players").insert(players);
    createdMatches.push(match);
  }

  // Recompute round status (will become "in_progress" if matches exist)
  await recomputeRoundStatus(roundId);

  // Notify group members about the draw
  if (roundData && actorId) {
    notifyGroupMembers({
      groupId: roundData.group_id,
      actorId,
      type: "draw_completed",
      title: isSingles ? "Confrontos definidos! 🎲" : "Times sorteados! 🎲",
      body: isSingles
        ? `Os confrontos da Rodada ${roundData.round_number} foram definidos. ${matchCount} confronto${matchCount !== 1 ? "s" : ""} criado${matchCount !== 1 ? "s" : ""}!`
        : `Os times da Rodada ${roundData.round_number} foram sorteados. ${matchCount} partida${matchCount !== 1 ? "s" : ""} criada${matchCount !== 1 ? "s" : ""}!`,
      data: { roundId },
    });
  }

  return createdMatches;
}

export async function deleteMatch(matchId: string) {
  // Get round_id before deleting
  const { data: matchData } = await supabase
    .from("matches")
    .select("round_id")
    .eq("id", matchId)
    .single();

  // Revert Elo/ranking impact before deleting the match
  await revertMatchElo(matchId);

  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) throw new Error(error.message);

  // Recompute round status based on remaining matches (single source of truth)
  if (matchData?.round_id) {
    await recomputeRoundStatus(matchData.round_id);
  }
}

export async function deleteRound(roundId: string) {
  // Revert Elo for every match in this round before deletion
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("round_id", roundId);
  if (matches?.length) {
    await Promise.all(matches.map((m) => revertMatchElo(m.id)));
  }
  // Delete all matches of this round first (cascade will handle match_players, match_sets, etc.)
  await supabase.from("matches").delete().eq("round_id", roundId);
  // Delete presences
  await supabase.from("round_presence").delete().eq("round_id", roundId);
  // Delete the round
  const { error } = await supabase.from("rounds").delete().eq("id", roundId);
  if (error) throw new Error(error.message);
}
