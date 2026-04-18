import { supabase } from "@/integrations/supabase/client";
import { notifyGroupMembers } from "@/hooks/use-notifications";
import { revertMatchElo } from "@/lib/elo-engine";
import { recomputeRoundStatus } from "@/lib/round-status";

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

  // Singles round sizing — derive from group when caller didn't provide:
  // - rivalry: 2
  // - league/casual: group.max_players (fallback 8)
  let resolvedMaxPlayers = data.maxPlayers;
  let groupSinglesType: string | null = null;
  if (isSingles) {
    const { data: groupRow } = await supabase
      .from("groups")
      .select("singles_group_type, max_players")
      .eq("id", data.groupId)
      .single();
    groupSinglesType = groupRow?.singles_group_type ?? null;
    if (!resolvedMaxPlayers) {
      if (groupSinglesType === "rivalry") {
        resolvedMaxPlayers = 2;
      } else {
        resolvedMaxPlayers = groupRow?.max_players && groupRow.max_players >= 2
          ? groupRow.max_players
          : 8;
      }
    }
  }

  const { data: round, error } = await supabase
    .from("rounds")
    .insert({
      group_id: data.groupId,
      season_id: data.seasonId,
      round_number: data.roundNumber,
      scheduled_date: data.scheduledDate || null,
      scheduled_time: data.scheduledTime || null,
      location: data.location || null,
      max_players: resolvedMaxPlayers || 8,
      match_format: isSingles ? "singles" : "doubles",
      status: "scheduled",
    })
    .select()
    .single();
  if (error) throw error;

  // Rivalry auto-confirm: ONLY when the group is explicitly singles_group_type = 'rivalry'.
  // We no longer infer rivalry from member count or max_players.
  if (isSingles && groupSinglesType === "rivalry") {
    const { data: activeMembers } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", data.groupId)
      .eq("status", "active");

    if (activeMembers && activeMembers.length === 2) {
      const nowIso = new Date().toISOString();
      await supabase.from("round_presence").upsert(
        activeMembers.map((m) => ({
          round_id: round.id,
          user_id: m.user_id,
          status: "confirmed",
          confirmed_at: nowIso,
        })),
        { onConflict: "round_id,user_id" }
      );
    }
  }

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

// Build singles pairings ordered by Elo (King of the Court).
// 4 players — official fixed cycle, indexed by round_number (1-based, cycles every 3):
//   round 1 → 1v4 / 2v3
//   round 2 → 1v3 / 2v4
//   round 3 → 1v2 / 3v4
// 6+ players (even): classic round-robin (circle method) ordered by Elo, returns one round.
function buildSinglesPairs(orderedIds: string[], roundNumber = 1): Array<[string, string]> {
  const n = orderedIds.length;
  if (n < 2 || n % 2 !== 0) return [];

  if (n === 4) {
    const [p1, p2, p3, p4] = orderedIds;
    const cycle: Array<Array<[string, string]>> = [
      [[p1, p4], [p2, p3]], // round 1
      [[p1, p3], [p2, p4]], // round 2
      [[p1, p2], [p3, p4]], // round 3
    ];
    const idx = ((Math.max(1, roundNumber) - 1) % 3 + 3) % 3;
    return cycle[idx];
  }

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
  const { data: roundData } = await supabase
    .from("rounds")
    .select("round_number, group_id, match_format, season_id")
    .eq("id", roundId)
    .single();

  const isSingles = roundData?.match_format === "singles";
  const playersPerMatch = isSingles ? 2 : 4;

  let pairings: Array<string[]> = [];

  if (isSingles && roundData?.season_id && confirmedPlayerIds.length >= 2 && confirmedPlayerIds.length % 2 === 0) {
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

    const ordered = [...confirmedPlayerIds]
      .map((id) => ({ id, rating: ratingMap.get(id) ?? 1000, r: Math.random() }))
      .sort((a, b) => (b.rating - a.rating) || (a.r - b.r))
      .map((x) => x.id);

    const pairs = buildSinglesPairs(ordered, roundData.round_number ?? 1);
    pairings = pairs.map(([a, b]) => [a, b]);
  }

  if (pairings.length === 0) {
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

  await recomputeRoundStatus(roundId);

  if (roundData) {
    // Per-player notification: each player sees their own matchup (partner + opponents)
    const allPlayerIds = Array.from(new Set(pairings.flat()));
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, name, nickname")
      .in("user_id", allPlayerIds);

    const nameOf = (uid: string) => {
      const p = profiles?.find((x) => x.user_id === uid);
      return p?.nickname || p?.name || "Jogador";
    };

    const notifRows: Array<{
      user_id: string;
      group_id: string;
      type: string;
      title: string;
      body: string;
      data: Record<string, string | number | boolean | null>;
    }> = [];

    for (let i = 0; i < pairings.length; i++) {
      const group = pairings[i];
      const teamA = isSingles ? [group[0]] : group.slice(0, 2);
      const teamB = isSingles ? [group[1]] : group.slice(2, 4);
      const matchId = createdMatches[i]?.id ?? null;
      const matchNumber = i + 1;

      for (const uid of group) {
        const inA = teamA.includes(uid);
        const myTeam = inA ? teamA : teamB;
        const oppTeam = inA ? teamB : teamA;
        const partner = isSingles ? null : myTeam.find((id) => id !== uid) ?? null;
        const opponentsLabel = oppTeam.map(nameOf).join(" e ");

        const body = isSingles
          ? `Partida ${matchNumber}: você joga contra ${opponentsLabel}.`
          : `Partida ${matchNumber}: você joga com ${partner ? nameOf(partner) : "—"} contra ${opponentsLabel}.`;

        notifRows.push({
          user_id: uid,
          group_id: roundData.group_id,
          type: "draw_completed",
          title: isSingles
            ? `Seu confronto da Rodada ${roundData.round_number} 🎲`
            : `Seu jogo da Rodada ${roundData.round_number} 🎲`,
          body,
          data: { roundId, matchId, seasonId: roundData.season_id ?? null },
        });
      }
    }

    if (notifRows.length > 0) {
      await supabase.from("notifications").insert(notifRows);
    }
  }

  return createdMatches;
}

export async function deleteMatch(matchId: string) {
  const { data: matchData } = await supabase
    .from("matches")
    .select("round_id")
    .eq("id", matchId)
    .single();

  await revertMatchElo(matchId);

  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) throw new Error(error.message);

  if (matchData?.round_id) {
    await recomputeRoundStatus(matchData.round_id);
  }
}

export async function deleteRound(roundId: string) {
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("round_id", roundId);
  if (matches?.length) {
    await Promise.all(matches.map((m) => revertMatchElo(m.id)));
  }
  await supabase.from("matches").delete().eq("round_id", roundId);
  await supabase.from("round_presence").delete().eq("round_id", roundId);
  const { error } = await supabase.from("rounds").delete().eq("id", roundId);
  if (error) throw new Error(error.message);
}
