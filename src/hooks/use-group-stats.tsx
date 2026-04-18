import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RecordHolder {
  user_id: string;
  name: string;
  avatar_url: string | null;
  value: number;
  detail?: string;
}

export interface TopPair {
  user_a: string;
  user_b: string;
  name_a: string;
  name_b: string;
  avatar_a: string | null;
  avatar_b: string | null;
  matches: number;
  wins: number;
  win_rate: number;
}

export interface HotPlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
  rating_change: number;
  matches: number;
}

export interface GroupGlobalStats {
  total_seasons: number;
  finished_seasons: number;
  total_rounds: number;
  total_matches: number;
  total_active_players: number;
  highest_elo_ever: RecordHolder | null;
  biggest_elo_swing: RecordHolder | null;
  longest_win_streak: RecordHolder | null;
  most_frequent_player: RecordHolder | null;
  most_wins_player: RecordHolder | null;
  best_win_rate_player: RecordHolder | null;
  top_pairs: TopPair[];
  hot_player_30d: HotPlayer | null;
}

const EMPTY: GroupGlobalStats = {
  total_seasons: 0,
  finished_seasons: 0,
  total_rounds: 0,
  total_matches: 0,
  total_active_players: 0,
  highest_elo_ever: null,
  biggest_elo_swing: null,
  longest_win_streak: null,
  most_frequent_player: null,
  most_wins_player: null,
  best_win_rate_player: null,
  top_pairs: [],
  hot_player_30d: null,
};

export function useGroupGlobalStats(groupId: string | null) {
  const [data, setData] = useState<GroupGlobalStats>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setData(EMPTY);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Seasons
      const { data: seasons } = await supabase
        .from("seasons").select("id, status").eq("group_id", groupId);
      const totalSeasons = seasons?.length || 0;
      const finishedSeasons = (seasons || []).filter((s) => s.status !== "active").length;

      // Rounds
      const { data: rounds } = await supabase
        .from("rounds").select("id").eq("group_id", groupId);
      const roundIds = (rounds || []).map((r) => r.id);
      const totalRounds = roundIds.length;

      // Matches + map round->scheduled_date
      let totalMatches = 0;
      let matchIds: string[] = [];
      const matchDateMap = new Map<string, number>(); // match_id -> ms
      if (roundIds.length) {
        const { data: roundsFull } = await supabase
          .from("rounds").select("id, scheduled_date, created_at").in("id", roundIds);
        const roundDateMap = new Map<string, number>();
        for (const r of roundsFull || []) {
          const ts = r.scheduled_date
            ? new Date(r.scheduled_date + "T12:00:00").getTime()
            : new Date(r.created_at).getTime();
          roundDateMap.set(r.id, ts);
        }
        const { data: matches } = await supabase
          .from("matches").select("id, winner_team, round_id, created_at").in("round_id", roundIds);
        totalMatches = matches?.length || 0;
        matchIds = (matches || []).map((m) => m.id);
        for (const m of matches || []) {
          const ts = roundDateMap.get(m.round_id) ?? new Date(m.created_at).getTime();
          matchDateMap.set(m.id, ts);
        }
      }

      // Active players
      const { count: activeCount } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("status", "active");

      // Profiles cache (we'll fetch as needed)
      const profileCache = new Map<string, { name: string; nickname: string | null; avatar_url: string | null }>();
      const fetchProfiles = async (ids: string[]) => {
        const missing = ids.filter((i) => !profileCache.has(i));
        if (!missing.length) return;
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", missing);
        for (const p of profs || []) {
          profileCache.set(p.user_id, { name: p.name, nickname: p.nickname, avatar_url: p.avatar_url });
        }
      };
      const displayName = (id: string) => {
        const p = profileCache.get(id);
        return p?.nickname || p?.name || "Jogador";
      };
      const avatarOf = (id: string) => profileCache.get(id)?.avatar_url ?? null;

      // Rating events for swing + highest elo + hot player
      let highestElo: RecordHolder | null = null;
      let biggestSwing: RecordHolder | null = null;
      let hotPlayer: HotPlayer | null = null;

      if (matchIds.length) {
        const { data: events } = await supabase
          .from("rating_events")
          .select("user_id, rating_after, rating_before, rating_change, created_at")
          .in("match_id", matchIds)
          .order("created_at", { ascending: true });

        const allUserIds = [...new Set((events || []).map((e) => e.user_id))];
        await fetchProfiles(allUserIds);

        // Highest Elo ever (max rating_after)
        let maxElo = -Infinity;
        let maxEloUser = "";
        // Biggest single positive swing (max rating_change)
        let maxSwing = -Infinity;
        let maxSwingUser = "";

        // Hot player last 30d (sum of rating_change)
        const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const swing30d = new Map<string, { delta: number; matches: number }>();

        for (const e of events || []) {
          const after = Number(e.rating_after);
          const change = Number(e.rating_change);
          if (after > maxElo) { maxElo = after; maxEloUser = e.user_id; }
          if (change > maxSwing) { maxSwing = change; maxSwingUser = e.user_id; }
          if (new Date(e.created_at).getTime() >= since) {
            const cur = swing30d.get(e.user_id) || { delta: 0, matches: 0 };
            cur.delta += change;
            cur.matches += 1;
            swing30d.set(e.user_id, cur);
          }
        }

        if (maxEloUser) {
          highestElo = {
            user_id: maxEloUser, name: displayName(maxEloUser),
            avatar_url: avatarOf(maxEloUser), value: Math.round(maxElo),
          };
        }
        if (maxSwingUser && maxSwing > 0) {
          biggestSwing = {
            user_id: maxSwingUser, name: displayName(maxSwingUser),
            avatar_url: avatarOf(maxSwingUser), value: Math.round(maxSwing),
            detail: "ganho em uma partida",
          };
        }
        if (swing30d.size) {
          let bestId = "";
          let bestDelta = -Infinity;
          let bestMatches = 0;
          for (const [uid, v] of swing30d.entries()) {
            if (v.delta > bestDelta) { bestDelta = v.delta; bestId = uid; bestMatches = v.matches; }
          }
          if (bestId && bestDelta > 0) {
            hotPlayer = {
              user_id: bestId, name: displayName(bestId),
              avatar_url: avatarOf(bestId), rating_change: Math.round(bestDelta), matches: bestMatches,
            };
          }
        }
      }

      // Match players for win-streaks, frequency, top pairs
      let longestStreak: RecordHolder | null = null;
      let mostFrequent: RecordHolder | null = null;
      let mostWins: RecordHolder | null = null;
      let bestWR: RecordHolder | null = null;
      let topPairs: TopPair[] = [];

      if (matchIds.length) {
        const { data: matches } = await supabase
          .from("matches").select("id, winner_team, created_at").in("id", matchIds);
        const matchMap = new Map((matches || []).map((m) => [m.id, m]));

        const { data: mps } = await supabase
          .from("match_players").select("match_id, user_id, team").in("match_id", matchIds);

        // Group by match
        const byMatch = new Map<string, { team: string; user_id: string }[]>();
        for (const mp of mps || []) {
          const arr = byMatch.get(mp.match_id) || [];
          arr.push({ team: mp.team, user_id: mp.user_id });
          byMatch.set(mp.match_id, arr);
        }

        // Per-player aggregate
        const playerAgg = new Map<string, { played: number; won: number }>();
        // Pair aggregate
        const pairAgg = new Map<string, { a: string; b: string; matches: number; wins: number }>();
        // Streak: ordered by match created_at
        const orderedMatches = (matches || []).slice().sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const streakCurrent = new Map<string, number>();
        const streakMax = new Map<string, number>();

        for (const m of orderedMatches) {
          const players = byMatch.get(m.id) || [];
          const winner = m.winner_team; // "a" | "b" | null
          const teamA = players.filter((p) => p.team === "a" || p.team === "A").map((p) => p.user_id);
          const teamB = players.filter((p) => p.team === "b" || p.team === "B").map((p) => p.user_id);

          const updatePlayer = (uid: string, won: boolean) => {
            const cur = playerAgg.get(uid) || { played: 0, won: 0 };
            cur.played += 1; if (won) cur.won += 1;
            playerAgg.set(uid, cur);
            if (winner) {
              if (won) {
                const cs = (streakCurrent.get(uid) || 0) + 1;
                streakCurrent.set(uid, cs);
                if (cs > (streakMax.get(uid) || 0)) streakMax.set(uid, cs);
              } else {
                streakCurrent.set(uid, 0);
              }
            }
          };
          for (const uid of teamA) updatePlayer(uid, winner === "a" || winner === "A");
          for (const uid of teamB) updatePlayer(uid, winner === "b" || winner === "B");

          const recordPair = (team: string[], won: boolean) => {
            if (team.length !== 2) return;
            const [a, b] = [...team].sort();
            const key = `${a}::${b}`;
            const cur = pairAgg.get(key) || { a, b, matches: 0, wins: 0 };
            cur.matches += 1; if (won) cur.wins += 1;
            pairAgg.set(key, cur);
          };
          if (winner) {
            recordPair(teamA, winner === "a" || winner === "A");
            recordPair(teamB, winner === "b" || winner === "B");
          }
        }

        const allIds = [...new Set([...playerAgg.keys()])];
        await fetchProfiles(allIds);

        // Most frequent
        let mf: { id: string; played: number } | null = null;
        let mw: { id: string; won: number } | null = null;
        let bw: { id: string; wr: number; played: number } | null = null;
        for (const [uid, v] of playerAgg.entries()) {
          if (!mf || v.played > mf.played) mf = { id: uid, played: v.played };
          if (!mw || v.won > mw.won) mw = { id: uid, won: v.won };
          if (v.played >= 5) {
            const wr = v.won / v.played;
            if (!bw || wr > bw.wr) bw = { id: uid, wr, played: v.played };
          }
        }
        if (mf) {
          mostFrequent = { user_id: mf.id, name: displayName(mf.id), avatar_url: avatarOf(mf.id), value: mf.played, detail: "partidas" };
        }
        if (mw) {
          mostWins = { user_id: mw.id, name: displayName(mw.id), avatar_url: avatarOf(mw.id), value: mw.won, detail: "vitórias" };
        }
        if (bw) {
          bestWR = { user_id: bw.id, name: displayName(bw.id), avatar_url: avatarOf(bw.id), value: Math.round(bw.wr * 100), detail: `${bw.played} partidas` };
        }

        // Longest streak
        let bestStreak: { id: string; n: number } | null = null;
        for (const [uid, n] of streakMax.entries()) {
          if (!bestStreak || n > bestStreak.n) bestStreak = { id: uid, n };
        }
        if (bestStreak && bestStreak.n >= 2) {
          longestStreak = {
            user_id: bestStreak.id, name: displayName(bestStreak.id),
            avatar_url: avatarOf(bestStreak.id), value: bestStreak.n, detail: "vitórias seguidas",
          };
        }

        // Top pairs (min 3 matches together)
        const pairList = [...pairAgg.values()]
          .filter((p) => p.matches >= 3)
          .sort((a, b) => (b.wins / b.matches) - (a.wins / a.matches) || b.matches - a.matches)
          .slice(0, 3);
        await fetchProfiles(pairList.flatMap((p) => [p.a, p.b]));
        topPairs = pairList.map((p) => ({
          user_a: p.a, user_b: p.b,
          name_a: displayName(p.a), name_b: displayName(p.b),
          avatar_a: avatarOf(p.a), avatar_b: avatarOf(p.b),
          matches: p.matches, wins: p.wins,
          win_rate: Math.round((p.wins / p.matches) * 100),
        }));
      }

      setData({
        total_seasons: totalSeasons,
        finished_seasons: finishedSeasons,
        total_rounds: totalRounds,
        total_matches: totalMatches,
        total_active_players: activeCount || 0,
        highest_elo_ever: highestElo,
        biggest_elo_swing: biggestSwing,
        longest_win_streak: longestStreak,
        most_frequent_player: mostFrequent,
        most_wins_player: mostWins,
        best_win_rate_player: bestWR,
        top_pairs: topPairs,
        hot_player_30d: hotPlayer,
      });
    } catch (err) {
      console.error("Erro ao carregar stats globais:", err);
      setData(EMPTY);
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, isLoading, refresh };
}

// ============== Per-season extras ==============
export interface SeasonExtras {
  longest_streak: RecordHolder | null;
  biggest_swing: RecordHolder | null;
  most_frequent: RecordHolder | null;
}

export function useSeasonExtras(seasonId: string | null) {
  const [data, setData] = useState<SeasonExtras>({ longest_streak: null, biggest_swing: null, most_frequent: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!seasonId) { setIsLoading(false); return; }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        // Rounds in season
        const { data: rounds } = await supabase
          .from("rounds").select("id").eq("season_id", seasonId);
        const roundIds = (rounds || []).map((r) => r.id);
        if (!roundIds.length) {
          if (!cancelled) { setData({ longest_streak: null, biggest_swing: null, most_frequent: null }); setIsLoading(false); }
          return;
        }

        const { data: matches } = await supabase
          .from("matches").select("id, winner_team, created_at").in("round_id", roundIds);
        const matchIds = (matches || []).map((m) => m.id);
        if (!matchIds.length) {
          if (!cancelled) { setData({ longest_streak: null, biggest_swing: null, most_frequent: null }); setIsLoading(false); }
          return;
        }

        const { data: mps } = await supabase
          .from("match_players").select("match_id, user_id, team").in("match_id", matchIds);
        const { data: events } = await supabase
          .from("rating_events").select("user_id, rating_change").in("match_id", matchIds);

        const profileCache = new Map<string, { name: string; nickname: string | null; avatar_url: string | null }>();
        const allUserIds = [...new Set([...(mps || []).map((m) => m.user_id), ...(events || []).map((e) => e.user_id)])];
        if (allUserIds.length) {
          const { data: profs } = await supabase
            .from("user_profiles").select("user_id, name, nickname, avatar_url").in("user_id", allUserIds);
          for (const p of profs || []) profileCache.set(p.user_id, { name: p.name, nickname: p.nickname, avatar_url: p.avatar_url });
        }
        const dn = (id: string) => { const p = profileCache.get(id); return p?.nickname || p?.name || "Jogador"; };
        const av = (id: string) => profileCache.get(id)?.avatar_url ?? null;

        // Frequency
        const freq = new Map<string, number>();
        for (const mp of mps || []) freq.set(mp.user_id, (freq.get(mp.user_id) || 0) + 1);
        let mostFreq: RecordHolder | null = null;
        for (const [uid, n] of freq.entries()) {
          if (!mostFreq || n > mostFreq.value) {
            mostFreq = { user_id: uid, name: dn(uid), avatar_url: av(uid), value: n, detail: "partidas" };
          }
        }

        // Biggest single swing
        let bigSwing: RecordHolder | null = null;
        for (const e of events || []) {
          const c = Number(e.rating_change);
          if (c > 0 && (!bigSwing || c > bigSwing.value)) {
            bigSwing = { user_id: e.user_id, name: dn(e.user_id), avatar_url: av(e.user_id), value: Math.round(c), detail: "ganho em 1 partida" };
          }
        }

        // Streak
        const byMatch = new Map<string, { team: string; user_id: string }[]>();
        for (const mp of mps || []) {
          const arr = byMatch.get(mp.match_id) || [];
          arr.push({ team: mp.team, user_id: mp.user_id });
          byMatch.set(mp.match_id, arr);
        }
        const ordered = (matches || []).slice().sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const cur = new Map<string, number>();
        const max = new Map<string, number>();
        for (const m of ordered) {
          const players = byMatch.get(m.id) || [];
          if (!m.winner_team) continue;
          const teamA = players.filter((p) => p.team === "a" || p.team === "A").map((p) => p.user_id);
          const teamB = players.filter((p) => p.team === "b" || p.team === "B").map((p) => p.user_id);
          const winners = (m.winner_team === "a" || m.winner_team === "A") ? teamA : teamB;
          const losers = (m.winner_team === "a" || m.winner_team === "A") ? teamB : teamA;
          for (const uid of winners) {
            const c = (cur.get(uid) || 0) + 1;
            cur.set(uid, c);
            if (c > (max.get(uid) || 0)) max.set(uid, c);
          }
          for (const uid of losers) cur.set(uid, 0);
        }
        let bestStreak: RecordHolder | null = null;
        for (const [uid, n] of max.entries()) {
          if (!bestStreak || n > bestStreak.value) {
            bestStreak = { user_id: uid, name: dn(uid), avatar_url: av(uid), value: n, detail: "vitórias seguidas" };
          }
        }

        if (!cancelled) {
          setData({
            longest_streak: bestStreak && bestStreak.value >= 2 ? bestStreak : null,
            biggest_swing: bigSwing,
            most_frequent: mostFreq,
          });
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Erro stats season:", err);
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  return { data, isLoading };
}
