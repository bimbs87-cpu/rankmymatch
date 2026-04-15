import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notifyGroupMembers } from "@/hooks/use-notifications";
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
      match_format: data.matchFormat || "2v2",
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
  userId: string;
}) {
  const { data: round, error } = await supabase
    .from("rounds")
    .insert({
      group_id: data.groupId,
      season_id: data.seasonId,
      round_number: data.roundNumber,
      scheduled_date: data.scheduledDate || null,
      scheduled_time: data.scheduledTime || null,
      location: data.location || null,
      max_players: data.maxPlayers || 8,
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

// Shuffle and draw teams for 2v2 padel matches
export async function drawTeams(roundId: string, confirmedPlayerIds: string[], actorId?: string) {
  // Shuffle players
  const shuffled = [...confirmedPlayerIds].sort(() => Math.random() - 0.5);

  // Get round info for notification
  const { data: roundData } = await supabase
    .from("rounds")
    .select("round_number, group_id")
    .eq("id", roundId)
    .single();

  // Create matches of 4 players each (2v2)
  const matchCount = Math.floor(shuffled.length / 4);
  const createdMatches = [];

  for (let i = 0; i < matchCount; i++) {
    const teamA = shuffled.slice(i * 4, i * 4 + 2);
    const teamB = shuffled.slice(i * 4 + 2, i * 4 + 4);

    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        round_id: roundId,
        match_number: i + 1,
        status: "scheduled",
      })
      .select()
      .single();

    if (error) throw error;

    // Add players
    const players = [
      ...teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: "A" })),
      ...teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: "B" })),
    ];

    await supabase.from("match_players").insert(players);
    createdMatches.push(match);
  }

  // Update round status
  await supabase.from("rounds").update({ status: "in_progress" }).eq("id", roundId);

  // Notify group members about the draw
  if (roundData && actorId) {
    notifyGroupMembers({
      groupId: roundData.group_id,
      actorId,
      type: "draw_completed",
      title: "Times sorteados! 🎲",
      body: `Os times da Rodada ${roundData.round_number} foram sorteados. ${matchCount} partida${matchCount !== 1 ? "s" : ""} criada${matchCount !== 1 ? "s" : ""}!`,
      data: { roundId },
    });
  }

  return createdMatches;
}
