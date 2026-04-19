/**
 * Aggregates a player's profile across all groups they participate in.
 * Used by:
 *  - /players/$userId (public profile)
 *  - /profile (own profile)
 *
 * Privacy rule: ranking + current Elo are ALWAYS public (cannot be hidden).
 * Other sections respect privacy_settings on user_profiles.
 */
import { supabase } from "@/integrations/supabase/client";
import { parsePrivacy, type PrivacySettings } from "@/components/PlayerProfileViewer";

export type FormState = "rising" | "falling" | "stable";

export interface AggregatedProfile {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  dominant_hand: string | null;
  preferred_position: string | null;
  killer_shot: string | null;
  worst_shot: string | null;
  instagram_handle: string | null;
  privacy: PrivacySettings;
}

export interface AggregatedSummary {
  // Headline
  weightedElo: number | null;
  trend30d: number;
  formState: FormState;
  last10: ("W" | "L")[];

  // Career
  bestPosition: { pos: number; group: string; season: string } | null;
  totalMatches: number;
  totalWins: number;
  winRate: number; // 0..100
  maxWinStreak: number;
  totalSetsWon: number;
  totalGamesWon: number;

  // Social
  groups: { id: string; name: string; image_url: string | null; matches: number; rating: number | null }[];
  rival: { user_id: string; name: string; avatar_url: string | null; faced: number; lost: number } | null;
  bestVictim: { user_id: string; name: string; avatar_url: string | null; faced: number; won: number } | null;
}

export async function loadAggregatedProfile(userId: string): Promise<AggregatedProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "user_id, name, nickname, avatar_url, birth_date, dominant_hand, preferred_position, killer_shot, worst_shot, instagram_handle, privacy_settings",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    user_id: data.user_id,
    name: data.name,
    nickname: data.nickname,
    avatar_url: data.avatar_url,
    birth_date: data.birth_date,
    dominant_hand: data.dominant_hand,
    preferred_position: data.preferred_position,
    killer_shot: data.killer_shot,
    worst_shot: data.worst_shot,
    instagram_handle: data.instagram_handle,
    privacy: parsePrivacy(data.privacy_settings),
  };
}

export async function loadAggregatedSummary(userId: string): Promise<AggregatedSummary> {
  // Pull rating events (full history) — used for Elo, trend, last10, partner/opponent stats
  const [eventsRes, snapsRes, statsRes, membershipRes] = await Promise.all([
    supabase
      .from("rating_events")
      .select("id, match_id, rating_after, rating_change, actual_score, created_at, season_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("ranking_snapshots")
      .select(
        "rating, position, season_id, matches_played, matches_won, sets_won, sets_lost, games_won, games_lost",
      )
      .eq("user_id", userId),
    supabase
      .from("player_stats_by_season")
      .select("win_streak_max, season_id")
      .eq("user_id", userId),
    supabase
      .from("group_members")
      .select("group_id, groups:group_id(id, name, image_url)")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const events = eventsRes.data ?? [];
  const snaps = snapsRes.data ?? [];
  const seasonStats = statsRes.data ?? [];
  const memberships = membershipRes.data ?? [];

  // ---- weighted Elo (avg of latest snapshot per group, weighted by matches) ----
  const seasonsBySeasonId = new Map<string, { rating: number; matches: number; group?: string }>();
  for (const s of snaps) {
    seasonsBySeasonId.set(s.season_id, {
      rating: s.rating,
      matches: s.matches_played ?? 0,
    });
  }

  // Resolve season -> group for snaps
  const seasonIds = Array.from(seasonsBySeasonId.keys());
  let seasonRows: { id: string; name: string; group_id: string; groups: { id: string; name: string } | null }[] = [];
  if (seasonIds.length) {
    const { data } = await supabase
      .from("seasons")
      .select("id, name, group_id, groups:group_id(id, name)")
      .in("id", seasonIds);
    seasonRows = (data ?? []) as any;
  }
  const seasonInfo = new Map(seasonRows.map((s) => [s.id, s]));

  // weighted Elo = sum(rating * matches) / sum(matches); fallback simple average
  let totalW = 0;
  let weightedSum = 0;
  let plainSum = 0;
  let plainCount = 0;
  for (const [, s] of seasonsBySeasonId) {
    plainSum += s.rating;
    plainCount += 1;
    if (s.matches > 0) {
      weightedSum += s.rating * s.matches;
      totalW += s.matches;
    }
  }
  const weightedElo =
    totalW > 0 ? Math.round(weightedSum / totalW) : plainCount > 0 ? Math.round(plainSum / plainCount) : null;

  // ---- trend 30d ----
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trend30d = Math.round(
    events
      .filter((e) => new Date(e.created_at).getTime() >= cutoff)
      .reduce((acc, e) => acc + (e.rating_change ?? 0), 0),
  );

  // ---- last10 + form state ----
  const last10Events = events.slice(-10);
  const last10: ("W" | "L")[] = last10Events.map((e) =>
    (e.actual_score ?? 0) >= 0.5 ? "W" : "L",
  );
  const last10Delta = last10Events.reduce((acc, e) => acc + (e.rating_change ?? 0), 0);
  const formState: FormState =
    last10Delta > 15 ? "rising" : last10Delta < -15 ? "falling" : "stable";

  // ---- best position ----
  let bestPosition: AggregatedSummary["bestPosition"] = null;
  const snapsWithPos = snaps.filter((s) => s.position && s.position > 0);
  if (snapsWithPos.length) {
    const top = snapsWithPos.reduce((a, b) => (b.position! < a.position! ? b : a));
    const sInfo = seasonInfo.get(top.season_id);
    bestPosition = {
      pos: top.position!,
      group: sInfo?.groups?.name ?? "Grupo",
      season: sInfo?.name ?? "",
    };
  }

  // ---- career totals ----
  const totalMatches = snaps.reduce((a, s) => a + (s.matches_played ?? 0), 0);
  const totalWins = snaps.reduce((a, s) => a + (s.matches_won ?? 0), 0);
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
  const totalSetsWon = snaps.reduce((a, s) => a + (s.sets_won ?? 0), 0);
  const totalGamesWon = snaps.reduce((a, s) => a + (s.games_won ?? 0), 0);
  const maxWinStreak = seasonStats.reduce((a, s) => Math.max(a, s.win_streak_max ?? 0), 0);

  // ---- groups list with rating per group ----
  const ratingByGroup = new Map<string, number>();
  const matchesByGroup = new Map<string, number>();
  for (const s of snaps) {
    const sInfo = seasonInfo.get(s.season_id);
    const gid = sInfo?.groups?.id;
    if (!gid) continue;
    // last snapshot wins (snaps may be multiple per group across seasons; just keep highest rating row)
    if (!ratingByGroup.has(gid) || s.rating > (ratingByGroup.get(gid) ?? -Infinity)) {
      ratingByGroup.set(gid, s.rating);
    }
    matchesByGroup.set(gid, (matchesByGroup.get(gid) ?? 0) + (s.matches_played ?? 0));
  }
  const groups = memberships
    .filter((m) => m.groups)
    .map((m) => ({
      id: (m.groups as any).id,
      name: (m.groups as any).name,
      image_url: (m.groups as any).image_url,
      matches: matchesByGroup.get((m.groups as any).id) ?? 0,
      rating: ratingByGroup.get((m.groups as any).id) ?? null,
    }))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  // ---- rival / nemesis: opponents faced most + win/loss against them ----
  let rival: AggregatedSummary["rival"] = null;
  let bestVictim: AggregatedSummary["bestVictim"] = null;
  if (events.length) {
    const matchIds = Array.from(new Set(events.map((e) => e.match_id)));
    if (matchIds.length) {
      const [allPlayersRes] = await Promise.all([
        supabase
          .from("match_players")
          .select("match_id, user_id, team")
          .in("match_id", matchIds),
      ]);
      const allPlayers = allPlayersRes.data ?? [];

      // Build my team per match
      const myTeamByMatch = new Map<string, string>();
      for (const p of allPlayers) {
        if (p.user_id === userId) myTeamByMatch.set(p.match_id, p.team);
      }

      // For each event find opponents (other team) and W/L
      const counter = new Map<string, { faced: number; lost: number; won: number }>();
      const eventByMatch = new Map(events.map((e) => [e.match_id, e]));
      for (const p of allPlayers) {
        if (p.user_id === userId) continue;
        const myTeam = myTeamByMatch.get(p.match_id);
        if (!myTeam || p.team === myTeam) continue; // teammates skipped
        const e = eventByMatch.get(p.match_id);
        if (!e) continue;
        const cur = counter.get(p.user_id) ?? { faced: 0, lost: 0, won: 0 };
        cur.faced += 1;
        if ((e.actual_score ?? 0) >= 0.5) cur.won += 1;
        else cur.lost += 1;
        counter.set(p.user_id, cur);
      }

      // Pick rival = opponent who beat me the most (min 2 faced); nemesis I beat the most
      let rivalPick: { uid: string; faced: number; lost: number } | null = null;
      let victimPick: { uid: string; faced: number; won: number } | null = null;
      for (const [uid, c] of counter) {
        if (c.faced < 2) continue;
        if (!rivalPick || c.lost > rivalPick.lost || (c.lost === rivalPick.lost && c.faced > rivalPick.faced)) {
          rivalPick = { uid, faced: c.faced, lost: c.lost };
        }
        if (!victimPick || c.won > victimPick.won || (c.won === victimPick.won && c.faced > victimPick.faced)) {
          victimPick = { uid, faced: c.faced, won: c.won };
        }
      }

      const lookupIds = [rivalPick?.uid, victimPick?.uid].filter(Boolean) as string[];
      let nameMap = new Map<string, { name: string; avatar_url: string | null }>();
      if (lookupIds.length) {
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", lookupIds);
        for (const p of profs ?? []) {
          nameMap.set(p.user_id, { name: p.name, avatar_url: p.avatar_url });
        }
      }
      if (rivalPick && rivalPick.lost > 0) {
        const info = nameMap.get(rivalPick.uid);
        rival = {
          user_id: rivalPick.uid,
          name: info?.name ?? "Jogador",
          avatar_url: info?.avatar_url ?? null,
          faced: rivalPick.faced,
          lost: rivalPick.lost,
        };
      }
      if (victimPick && victimPick.won > 0 && victimPick.uid !== rivalPick?.uid) {
        const info = nameMap.get(victimPick.uid);
        bestVictim = {
          user_id: victimPick.uid,
          name: info?.name ?? "Jogador",
          avatar_url: info?.avatar_url ?? null,
          faced: victimPick.faced,
          won: victimPick.won,
        };
      } else if (victimPick && victimPick.won > 0 && victimPick.uid === rivalPick?.uid) {
        // same person — still useful, expose as bestVictim only if they beat us less than we beat them
        if (victimPick.won > (rival?.lost ?? 0)) {
          const info = nameMap.get(victimPick.uid);
          bestVictim = {
            user_id: victimPick.uid,
            name: info?.name ?? "Jogador",
            avatar_url: info?.avatar_url ?? null,
            faced: victimPick.faced,
            won: victimPick.won,
          };
          rival = null;
        }
      }
    }
  }

  return {
    weightedElo,
    trend30d,
    formState,
    last10,
    bestPosition,
    totalMatches,
    totalWins,
    winRate,
    maxWinStreak,
    totalSetsWon,
    totalGamesWon,
    groups,
    rival,
    bestVictim,
  };
}

/**
 * Build chronological elo series from rating_events for the chart.
 */
export async function loadEloHistory(userId: string): Promise<{ date: string; rating: number }[]> {
  const { data } = await supabase
    .from("rating_events")
    .select("rating_after, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((e) => ({ date: e.created_at, rating: e.rating_after }));
}
