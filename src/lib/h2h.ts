/**
 * Aggregated head-to-head between two users across ALL groups they share.
 * Used by:
 *  - PlayerProfileViewer drawer ("Confronto comigo" block)
 *  - /players/$userId public profile (same block, when viewer is logged in)
 *
 * Only counts COMPLETED matches with ranking effect. Sets are summed across
 * every match, with team mapping resolved per match.
 */
import { supabase } from "@/integrations/supabase/client";

export interface H2HResult {
  matchesPlayed: number;
  meWins: number;
  themWins: number;
  setsMe: number;
  setsThem: number;
  gamesDiff: number;
  lastMatchDate: string | null;
}

export async function loadH2HBetween(meId: string, themId: string): Promise<H2HResult | null> {
  if (!meId || !themId || meId === themId) return null;

  // 1) Find matches where BOTH users participated.
  // We pull any matches where ME participated, then narrow to those where THEM also did.
  const { data: myRows } = await supabase
    .from("match_players")
    .select("match_id, team")
    .eq("user_id", meId);
  if (!myRows?.length) return null;

  const myMatchIds = Array.from(new Set(myRows.map((r) => r.match_id)));
  if (!myMatchIds.length) return null;

  const { data: theirRows } = await supabase
    .from("match_players")
    .select("match_id, team")
    .eq("user_id", themId)
    .in("match_id", myMatchIds);
  if (!theirRows?.length) return null;

  // Only matches where they're on OPPOSITE teams count as confrontos
  const myTeamByMatch = new Map(myRows.map((r) => [r.match_id, r.team]));
  const opposingMatchIds: string[] = [];
  for (const r of theirRows) {
    const myTeam = myTeamByMatch.get(r.match_id);
    if (myTeam && r.team !== myTeam) opposingMatchIds.push(r.match_id);
  }
  if (!opposingMatchIds.length) return null;

  // 2) Pull match metadata + sets for those matches
  const { data: matches } = await supabase
    .from("matches")
    .select("id, winner_team, status, round_id, match_sets(set_number, score_team_a, score_team_b)")
    .in("id", opposingMatchIds)
    .eq("status", "completed");
  if (!matches?.length) return null;

  // 3) Pull round dates
  const roundIds = Array.from(new Set(matches.map((m) => m.round_id)));
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, scheduled_date")
    .in("id", roundIds);
  const roundDate = new Map((rounds ?? []).map((r) => [r.id, r.scheduled_date]));

  let meWins = 0;
  let themWins = 0;
  let setsMe = 0;
  let setsThem = 0;
  let gamesMe = 0;
  let gamesThem = 0;
  let lastMatchDate: string | null = null;

  for (const m of matches) {
    const myTeam = myTeamByMatch.get(m.id);
    if (!myTeam) continue;

    if (m.winner_team) {
      if (m.winner_team === myTeam) meWins += 1;
      else themWins += 1;
    }

    for (const s of m.match_sets ?? []) {
      const myScore = myTeam === "A" ? s.score_team_a : s.score_team_b;
      const theirScore = myTeam === "A" ? s.score_team_b : s.score_team_a;
      gamesMe += myScore;
      gamesThem += theirScore;
      if (myScore > theirScore) setsMe += 1;
      else if (theirScore > myScore) setsThem += 1;
    }

    const d = roundDate.get(m.round_id);
    if (d && (!lastMatchDate || d > lastMatchDate)) lastMatchDate = d;
  }

  const matchesPlayed = meWins + themWins;
  if (matchesPlayed === 0) return null;

  return {
    matchesPlayed,
    meWins,
    themWins,
    setsMe,
    setsThem,
    gamesDiff: gamesMe - gamesThem,
    lastMatchDate,
  };
}
