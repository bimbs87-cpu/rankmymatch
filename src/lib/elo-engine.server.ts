// Server-only Elo processing helpers.
// Kept in a .server.ts file so it can safely import the admin Supabase client
// without leaking into the client bundle.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_K = 28;
const INITIAL_RATING = 1000;

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function marginMultiplier(setsWon: number, setsLost: number, gamesWon: number, gamesLost: number): number {
  const setDiff = setsWon - setsLost;
  const gameDiff = gamesWon - gamesLost;
  return 1 + setDiff * 0.1 + Math.max(0, gameDiff) * 0.02;
}

function kFactor(matchesPlayed: number): number {
  if (matchesPlayed < 10) return 40;
  if (matchesPlayed < 30) return 32;
  return BASE_K;
}

export interface MatchResultServer {
  matchId: string;
  seasonId: string;
  teamA: string[];
  teamB: string[];
  winnerTeam: "A" | "B";
  setsTeamA: number;
  setsTeamB: number;
  gamesTeamA: number;
  gamesTeamB: number;
}

export async function processMatchEloServer(result: MatchResultServer) {
  const allPlayerIds = [...result.teamA, ...result.teamB];

  const { data: snapshots } = await supabaseAdmin
    .from("ranking_snapshots")
    .select("*")
    .eq("season_id", result.seasonId)
    .in("user_id", allPlayerIds);

  const ratingMap = new Map<
    string,
    {
      rating: number;
      matchesPlayed: number;
      matchesWon: number;
      setsWon: number;
      setsLost: number;
      gamesWon: number;
      gamesLost: number;
      snapshotId: string | null;
    }
  >();

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

  const avgRatingA =
    result.teamA.reduce((sum, id) => sum + (ratingMap.get(id)?.rating || INITIAL_RATING), 0) /
    result.teamA.length;
  const avgRatingB =
    result.teamB.reduce((sum, id) => sum + (ratingMap.get(id)?.rating || INITIAL_RATING), 0) /
    result.teamB.length;

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

  const ratingEvents: Array<{
    user_id: string;
    match_id: string;
    season_id: string;
    rating_before: number;
    rating_after: number;
    rating_change: number;
    k_factor: number;
    expected_score: number;
    actual_score: number;
    margin_multiplier: number;
  }> = [];
  const snapshotUpserts: Array<{
    id: string | null;
    user_id: string;
    season_id: string;
    rating: number;
    matches_played: number;
    matches_won: number;
    sets_won: number;
    sets_lost: number;
    games_won: number;
    games_lost: number;
    is_eligible: boolean;
    snapshot_date: string;
  }> = [];

  for (const pid of allPlayerIds) {
    const current = ratingMap.get(pid)!;
    const isTeamA = result.teamA.includes(pid);
    const expected = isTeamA ? expectedA : expectedB;
    const actual = isTeamA ? actualA : actualB;
    const k = kFactor(current.matchesPlayed);
    const change = Math.round(k * mm * (actual - expected) * 100) / 100;
    const newRating = current.rating + change;
    const isWinner =
      (isTeamA && result.winnerTeam === "A") || (!isTeamA && result.winnerTeam === "B");

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

    snapshotUpserts.push({
      id: current.snapshotId,
      user_id: pid,
      season_id: result.seasonId,
      rating: newRating,
      matches_played: current.matchesPlayed + 1,
      matches_won: current.matchesWon + (isWinner ? 1 : 0),
      sets_won: current.setsWon + (isTeamA ? result.setsTeamA : result.setsTeamB),
      sets_lost: current.setsLost + (isTeamA ? result.setsTeamB : result.setsTeamA),
      games_won: current.gamesWon + (isTeamA ? result.gamesTeamA : result.gamesTeamB),
      games_lost: current.gamesLost + (isTeamA ? result.gamesTeamB : result.gamesTeamA),
      is_eligible: current.matchesPlayed + 1 >= 3,
      snapshot_date: new Date().toISOString().split("T")[0],
    });
  }

  await supabaseAdmin.from("rating_events").insert(ratingEvents);

  await Promise.all(
    snapshotUpserts.map((snap) => {
      if (snap.id) {
        const { id, ...updateData } = snap;
        return supabaseAdmin.from("ranking_snapshots").update(updateData).eq("id", id);
      } else {
        const { id: _id, ...insertData } = snap;
        return supabaseAdmin.from("ranking_snapshots").insert(insertData);
      }
    }),
  );

  const { data: allSnapshots } = await supabaseAdmin
    .from("ranking_snapshots")
    .select("id, rating")
    .eq("season_id", result.seasonId)
    .eq("is_eligible", true)
    .order("rating", { ascending: false });

  if (allSnapshots) {
    await Promise.all(
      allSnapshots.map((snap, i) =>
        supabaseAdmin.from("ranking_snapshots").update({ position: i + 1 }).eq("id", snap.id),
      ),
    );
  }
}
