import { supabase } from "@/integrations/supabase/client";

// Elo rating constants
const BASE_K = 28;
const INITIAL_RATING = 1000;

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function marginMultiplier(setsWon: number, setsLost: number, gamesWon: number, gamesLost: number): number {
  const setDiff = setsWon - setsLost;
  const gameDiff = gamesWon - gamesLost;
  // Bigger wins get a small bonus (1.0 to 1.5)
  return 1 + (setDiff * 0.1) + (Math.max(0, gameDiff) * 0.02);
}

function kFactor(matchesPlayed: number): number {
  // New players have higher K for faster calibration
  if (matchesPlayed < 10) return 40;
  if (matchesPlayed < 30) return 32;
  return BASE_K;
}

interface MatchResult {
  matchId: string;
  seasonId: string;
  teamA: string[]; // user_ids
  teamB: string[];
  winnerTeam: "A" | "B";
  setsTeamA: number;
  setsTeamB: number;
  gamesTeamA: number;
  gamesTeamB: number;
}

export async function processMatchElo(result: MatchResult) {
  const allPlayerIds = [...result.teamA, ...result.teamB];

  // Get current ratings from ranking_snapshots
  const { data: snapshots } = await supabase
    .from("ranking_snapshots")
    .select("*")
    .eq("season_id", result.seasonId)
    .in("user_id", allPlayerIds);

  const ratingMap = new Map<string, { rating: number; matchesPlayed: number; matchesWon: number; setsWon: number; setsLost: number; gamesWon: number; gamesLost: number; snapshotId: string | null }>();

  for (const pid of allPlayerIds) {
    const snap = snapshots?.find((s) => s.user_id === pid);
    ratingMap.set(pid, {
      rating: snap ? Number(snap.rating) : INITIAL_RATING,
      matchesPlayed: snap?.matches_played || 0,
      matchesWon: snap?.matches_won || 0,
      setsWon: snap?.sets_won || 0,
      setsLost: snap?.sets_lost || 0,
      gamesWon: snap?.games_won || 0,
      gamesLost: snap?.games_lost || 0,
      snapshotId: snap?.id || null,
    });
  }

  // Calculate average team ratings
  const avgRatingA = result.teamA.reduce((sum, id) => sum + (ratingMap.get(id)?.rating || INITIAL_RATING), 0) / result.teamA.length;
  const avgRatingB = result.teamB.reduce((sum, id) => sum + (ratingMap.get(id)?.rating || INITIAL_RATING), 0) / result.teamB.length;

  const expectedA = expectedScore(avgRatingA, avgRatingB);
  const expectedB = 1 - expectedA;

  const actualA = result.winnerTeam === "A" ? 1 : 0;
  const actualB = 1 - actualA;

  const mm = marginMultiplier(
    result.winnerTeam === "A" ? result.setsTeamA : result.setsTeamB,
    result.winnerTeam === "A" ? result.setsTeamB : result.setsTeamA,
    result.winnerTeam === "A" ? result.gamesTeamA : result.gamesTeamB,
    result.winnerTeam === "A" ? result.gamesTeamB : result.gamesTeamA,
  );

  const ratingEvents = [];
  const snapshotUpserts = [];

  for (const pid of allPlayerIds) {
    const current = ratingMap.get(pid)!;
    const isTeamA = result.teamA.includes(pid);
    const expected = isTeamA ? expectedA : expectedB;
    const actual = isTeamA ? actualA : actualB;
    const k = kFactor(current.matchesPlayed);
    const change = Math.round(k * mm * (actual - expected) * 100) / 100;
    const newRating = current.rating + change;
    const isWinner = (isTeamA && result.winnerTeam === "A") || (!isTeamA && result.winnerTeam === "B");

    ratingEvents.push({
      user_id: pid,
      match_id: result.matchId,
      season_id: result.seasonId,
      rating_before: current.rating,
      rating_after: newRating,
      rating_change: change,
      k_factor: k,
      expected_score: expected,
      actual_score: actual,
      margin_multiplier: mm,
    });

    const newSetsWon = current.setsWon + (isTeamA ? result.setsTeamA : result.setsTeamB);
    const newSetsLost = current.setsLost + (isTeamA ? result.setsTeamB : result.setsTeamA);
    const newGamesWon = current.gamesWon + (isTeamA ? result.gamesTeamA : result.gamesTeamB);
    const newGamesLost = current.gamesLost + (isTeamA ? result.gamesTeamB : result.gamesTeamA);

    snapshotUpserts.push({
      id: current.snapshotId,
      user_id: pid,
      season_id: result.seasonId,
      rating: newRating,
      matches_played: current.matchesPlayed + 1,
      matches_won: current.matchesWon + (isWinner ? 1 : 0),
      sets_won: newSetsWon,
      sets_lost: newSetsLost,
      games_won: newGamesWon,
      games_lost: newGamesLost,
      is_eligible: (current.matchesPlayed + 1) >= 3,
      snapshot_date: new Date().toISOString().split("T")[0],
    });
  }

  // Insert rating events
  await supabase.from("rating_events").insert(ratingEvents);

  // Upsert ranking snapshots
  for (const snap of snapshotUpserts) {
    if (snap.id) {
      const { id, ...updateData } = snap;
      await supabase.from("ranking_snapshots").update(updateData).eq("id", id);
    } else {
      const { id, ...insertData } = snap;
      await supabase.from("ranking_snapshots").insert(insertData);
    }
  }

  // Update positions
  const { data: allSnapshots } = await supabase
    .from("ranking_snapshots")
    .select("id, rating")
    .eq("season_id", result.seasonId)
    .eq("is_eligible", true)
    .order("rating", { ascending: false });

  if (allSnapshots) {
    for (let i = 0; i < allSnapshots.length; i++) {
      await supabase
        .from("ranking_snapshots")
        .update({ position: i + 1 })
        .eq("id", allSnapshots[i].id);
    }
  }
}

export async function submitMatchScore(
  matchId: string,
  seasonId: string,
  sets: { setNumber: number; scoreA: number; scoreB: number }[]
) {
  // Get match players
  const { data: players } = await supabase
    .from("match_players")
    .select("user_id, team")
    .eq("match_id", matchId);

  if (!players?.length) throw new Error("Nenhum jogador encontrado");

  const teamA = players.filter((p) => p.team === "A").map((p) => p.user_id);
  const teamB = players.filter((p) => p.team === "B").map((p) => p.user_id);

  // Delete existing sets
  await supabase.from("match_sets").delete().eq("match_id", matchId);

  // Insert new sets
  await supabase.from("match_sets").insert(
    sets.map((s) => ({
      match_id: matchId,
      set_number: s.setNumber,
      score_team_a: s.scoreA,
      score_team_b: s.scoreB,
      is_tiebreak: s.setNumber === 3,
    }))
  );

  // Calculate winner
  let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
  for (const s of sets) {
    gamesA += s.scoreA;
    gamesB += s.scoreB;
    if (s.scoreA > s.scoreB) setsA++;
    else if (s.scoreB > s.scoreA) setsB++;
  }

  const winnerTeam = setsA > setsB ? "A" : setsB > setsA ? "B" : null;

  if (!winnerTeam) throw new Error("Empate em sets — adicione o tiebreak");

  // Get round info for auto-confirming presence
  const { data: matchData } = await supabase
    .from("matches")
    .select("round_id")
    .eq("id", matchId)
    .single();

  // Update match
  await supabase
    .from("matches")
    .update({
      status: "completed",
      winner_team: winnerTeam,
      result_type: sets.length === 1 ? "single_set" : sets.length === 2 ? "straight" : "tiebreak",
    })
    .eq("id", matchId);

  // Auto-confirm presence for match players and update round status
  if (matchData?.round_id) {
    const allPlayerIds = [...teamA, ...teamB];
    for (const uid of allPlayerIds) {
      await supabase.from("round_presence").upsert(
        {
          round_id: matchData.round_id,
          user_id: uid,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "round_id,user_id" }
      );
    }

    // Check if all matches in the round are completed — if so, mark round as completed
    const { data: roundMatches } = await supabase
      .from("matches")
      .select("id, status")
      .eq("round_id", matchData.round_id);

    const allCompleted = roundMatches && roundMatches.length > 0 &&
      roundMatches.every((m) => m.id === matchId ? true : m.status === "completed");

    if (allCompleted) {
      await supabase.from("rounds").update({ status: "completed" }).eq("id", matchData.round_id);
    }
  }

  // Process Elo
  await processMatchElo({
    matchId,
    seasonId,
    teamA,
    teamB,
    winnerTeam,
    setsTeamA: setsA,
    setsTeamB: setsB,
    gamesTeamA: gamesA,
    gamesTeamB: gamesB,
  });

  return { winnerTeam, setsA, setsB };
}
