import { supabase } from "@/integrations/supabase/client";

// Elo rating constants
const BASE_K = 28;
const INITIAL_RATING = 1000;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function marginMultiplier(setsWon: number, setsLost: number, gamesWon: number, gamesLost: number): number {
  const setDiff = setsWon - setsLost;
  const gameDiff = gamesWon - gamesLost;
  // Bigger wins get a small bonus (1.0 to 1.5)
  return 1 + (setDiff * 0.1) + (Math.max(0, gameDiff) * 0.02);
}

export function kFactor(matchesPlayed: number): number {
  // New players have higher K for faster calibration
  if (matchesPlayed < 10) return 40;
  if (matchesPlayed < 30) return 32;
  return BASE_K;
}

/**
 * Pure preview of Elo deltas for a single match. Mirrors the logic of
 * processMatchElo but without any database writes — used to show the user
 * the expected rating change before the score is saved.
 *
 * Each player record provides their current rating and how many matches they
 * have played (used to derive the K-factor). Ratings default to 1000 and
 * matchesPlayed defaults to 0 when not provided.
 */
export interface PlayerEloInput {
  userId: string;
  rating?: number;
  matchesPlayed?: number;
}

export function previewMatchEloChanges(params: {
  teamA: PlayerEloInput[];
  teamB: PlayerEloInput[];
  setsTeamA: number;
  setsTeamB: number;
  gamesTeamA: number;
  gamesTeamB: number;
}): Record<string, number> {
  const { teamA, teamB, setsTeamA, setsTeamB, gamesTeamA, gamesTeamB } = params;
  const winnerTeam: "A" | "B" | null =
    setsTeamA > setsTeamB ? "A" : setsTeamB > setsTeamA ? "B" :
    gamesTeamA > gamesTeamB ? "A" : gamesTeamB > gamesTeamA ? "B" : null;

  const result: Record<string, number> = {};
  if (!winnerTeam) {
    for (const p of [...teamA, ...teamB]) result[p.userId] = 0;
    return result;
  }

  const ratingOf = (p: PlayerEloInput) => p.rating ?? INITIAL_RATING;
  const avgA = teamA.reduce((s, p) => s + ratingOf(p), 0) / Math.max(teamA.length, 1);
  const avgB = teamB.reduce((s, p) => s + ratingOf(p), 0) / Math.max(teamB.length, 1);

  const expectedA = expectedScore(avgA, avgB);
  const expectedB = 1 - expectedA;

  const mm = marginMultiplier(
    winnerTeam === "A" ? setsTeamA : setsTeamB,
    winnerTeam === "A" ? setsTeamB : setsTeamA,
    winnerTeam === "A" ? gamesTeamA : gamesTeamB,
    winnerTeam === "A" ? gamesTeamB : gamesTeamA,
  );

  const compute = (p: PlayerEloInput, isTeamA: boolean) => {
    const expected = isTeamA ? expectedA : expectedB;
    const actual = (isTeamA && winnerTeam === "A") || (!isTeamA && winnerTeam === "B") ? 1 : 0;
    const k = kFactor(p.matchesPlayed ?? 0);
    return Math.round(k * mm * (actual - expected) * 100) / 100;
  };

  for (const p of teamA) result[p.userId] = compute(p, true);
  for (const p of teamB) result[p.userId] = compute(p, false);
  return result;
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
  await Promise.all(
    snapshotUpserts.map((snap) => {
      if (snap.id) {
        const { id, ...updateData } = snap;
        return supabase.from("ranking_snapshots").update(updateData).eq("id", id);
      } else {
        const { id, ...insertData } = snap;
        return supabase.from("ranking_snapshots").insert(insertData);
      }
    }),
  );

  // Update positions
  const { data: allSnapshots } = await supabase
    .from("ranking_snapshots")
    .select("id, rating")
    .eq("season_id", result.seasonId)
    .eq("is_eligible", true)
    .order("rating", { ascending: false });

  if (allSnapshots) {
    await Promise.all(
      allSnapshots.map((snap, i) =>
        supabase.from("ranking_snapshots").update({ position: i + 1 }).eq("id", snap.id),
      ),
    );
  }
}

/**
 * Reverts the Elo/ranking impact of a single match. Call BEFORE deleting the
 * match row. Uses simple reversal (subtract rating_change, decrement counters).
 * Note: if matches were played AFTER this one, their ratings were calculated
 * on top of this match's effect — those won't be retroactively recalculated.
 */
export async function revertMatchElo(matchId: string) {
  // 1. Load rating events for this match
  const { data: events } = await supabase
    .from("rating_events")
    .select("user_id, season_id, rating_change")
    .eq("match_id", matchId);

  if (!events?.length) return;

  // 2. Load match context: winner team, players (team), sets
  const [matchRes, playersRes, setsRes] = await Promise.all([
    supabase.from("matches").select("winner_team").eq("id", matchId).maybeSingle(),
    supabase.from("match_players").select("user_id, team").eq("match_id", matchId),
    supabase.from("match_sets").select("score_team_a, score_team_b").eq("match_id", matchId),
  ]);

  const winnerTeam = matchRes.data?.winner_team as "A" | "B" | null;
  const teamByUser = new Map<string, string>();
  for (const p of playersRes.data || []) teamByUser.set(p.user_id, p.team);

  let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
  for (const s of setsRes.data || []) {
    gamesA += s.score_team_a;
    gamesB += s.score_team_b;
    if (s.score_team_a > s.score_team_b) setsA++;
    else if (s.score_team_b > s.score_team_a) setsB++;
  }

  // 3. For each event, reverse-update the snapshot
  const seasonIds = new Set<string>();
  await Promise.all(
    events.map(async (ev) => {
      if (!ev.season_id) return;
      seasonIds.add(ev.season_id);

      const team = teamByUser.get(ev.user_id);
      const playerWon = !!winnerTeam && team === winnerTeam;
      const playerSetsWon = team === "A" ? setsA : setsB;
      const playerSetsLost = team === "A" ? setsB : setsA;
      const playerGamesWon = team === "A" ? gamesA : gamesB;
      const playerGamesLost = team === "A" ? gamesB : gamesA;

      const { data: snap } = await supabase
        .from("ranking_snapshots")
        .select("*")
        .eq("season_id", ev.season_id)
        .eq("user_id", ev.user_id)
        .maybeSingle();

      if (!snap) return;

      const newMatchesPlayed = Math.max(0, snap.matches_played - 1);

      if (newMatchesPlayed === 0) {
        await supabase.from("ranking_snapshots").delete().eq("id", snap.id);
        return;
      }

      await supabase
        .from("ranking_snapshots")
        .update({
          rating: Number(snap.rating) - Number(ev.rating_change),
          matches_played: newMatchesPlayed,
          matches_won: Math.max(0, snap.matches_won - (playerWon ? 1 : 0)),
          sets_won: Math.max(0, snap.sets_won - playerSetsWon),
          sets_lost: Math.max(0, snap.sets_lost - playerSetsLost),
          games_won: Math.max(0, snap.games_won - playerGamesWon),
          games_lost: Math.max(0, snap.games_lost - playerGamesLost),
          is_eligible: newMatchesPlayed >= 3,
        })
        .eq("id", snap.id);
    }),
  );

  // 4. Delete rating events for this match
  await supabase.from("rating_events").delete().eq("match_id", matchId);

  // 5. Recalculate positions for each affected season
  await Promise.all(
    [...seasonIds].map(async (seasonId) => {
      const { data: snaps } = await supabase
        .from("ranking_snapshots")
        .select("id, rating")
        .eq("season_id", seasonId)
        .eq("is_eligible", true)
        .order("rating", { ascending: false });
      if (!snaps) return;
      await Promise.all(
        snaps.map((s, i) =>
          supabase.from("ranking_snapshots").update({ position: i + 1 }).eq("id", s.id),
        ),
      );
    }),
  );
}

import { submitMatchScoreServerFn } from "./elo-engine.functions";

/**
 * Submits a match score. All scoring + Elo logic runs server-side via
 * `submitMatchScoreServerFn` (TanStack Start server function with admin
 * validation), so the client cannot bypass authorization or tamper with
 * rating updates via DevTools.
 */
export async function submitMatchScore(
  matchId: string,
  seasonId: string,
  sets: { setNumber: number; scoreA: number; scoreB: number }[],
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return submitMatchScoreServerFn({
    data: { matchId, seasonId, sets },
    headers: { authorization: `Bearer ${session.access_token}` },
  });
}
