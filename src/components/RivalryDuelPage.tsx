import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { DualEloChart } from "@/components/DualEloChart";
import { computeDuelMedals } from "@/lib/duel-medals";
import { buildMedalsTimeline } from "@/lib/duel-medals-timeline";
import { promoteMatchToRankingServerFn, revertMatchPromotionServerFn } from "@/lib/promote-match.functions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Swords,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Share2,
  Target,
  BarChart3,
  Calendar,
  PlusCircle,
  History,
  Medal,
  ArrowUpCircle,
  Undo2,
  Loader2,
} from "lucide-react";

interface DuelPlayer {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  rating: number;
  matches_played: number;
  matches_won: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  last_change: number | null;
  win_streak_current: number;
  win_streak_max: number;
  /** Player's first-known Elo within the active season (or all-time if no season). */
  rating_start: number | null;
  /** All-time peak Elo (max rating_after across all events). */
  rating_peak: number | null;
}

interface DuelMatch {
  id: string;
  date: string | null;
  winner_team: string | null;
  winner_user_id: string | null;
  status: string;
  sets: { scoreA: number; scoreB: number }[];
  counts_for_ranking: boolean;
  round_number: number | null;
  team_a_user_id: string | null;
  /** Per-player Elo change for this specific match (when available). */
  rating_change_by_user: Record<string, number>;
}

interface Props {
  groupId: string;
  groupName: string;
  seasonId: string | null;
  seasonName: string | null;
}

export function RivalryDuelPage({ groupId, groupName, seasonId, seasonName }: Props) {
  const { user } = useAuth();
  const [playerA, setPlayerA] = useState<DuelPlayer | null>(null);
  const [playerB, setPlayerB] = useState<DuelPlayer | null>(null);
  const [matches, setMatches] = useState<DuelMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<"all" | "official" | "casual">("all");

  useEffect(() => {
    loadDuelData();
  }, [groupId, seasonId]);

  async function loadDuelData() {
    setLoading(true);
    try {
      // Get members
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "active")
        .limit(2);

      if (!members || members.length < 2) {
        setLoading(false);
        return;
      }

      const userIds = members.map((m) => m.user_id);

      // Load profiles, ranking snapshots, stats, recent matches in parallel
      const activeSeasonId = seasonId || await getActiveSeasonId(groupId);

      const [profilesRes, snapshotsRes, statsRes, matchesRes, eventsRes, allEventsRes] = await Promise.all([
        supabase.from("user_profiles").select("user_id, name, nickname, avatar_url").in("user_id", userIds),
        activeSeasonId
          ? supabase.from("ranking_snapshots").select("*").eq("season_id", activeSeasonId).in("user_id", userIds)
          : Promise.resolve({ data: [] }),
        activeSeasonId
          ? supabase.from("player_stats_by_season").select("*").eq("season_id", activeSeasonId).in("user_id", userIds)
          : Promise.resolve({ data: [] }),
        loadDuelMatches(groupId, userIds),
        activeSeasonId
          ? supabase
              .from("rating_events")
              .select("user_id, rating_change")
              .eq("season_id", activeSeasonId)
              .in("user_id", userIds)
              .order("created_at", { ascending: false })
              .limit(4)
          : Promise.resolve({ data: [] }),
        // Full event timeline (scoped to season when available) — used for
        // per-player initial Elo, peak Elo, and per-match Δ for the chart tooltip.
        activeSeasonId
          ? supabase
              .from("rating_events")
              .select("user_id, rating_before, rating_after, rating_change, match_id, created_at")
              .eq("season_id", activeSeasonId)
              .in("user_id", userIds)
              .order("created_at", { ascending: true })
          : supabase
              .from("rating_events")
              .select("user_id, rating_before, rating_after, rating_change, match_id, created_at")
              .in("user_id", userIds)
              .order("created_at", { ascending: true }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const snapshotMap = new Map((snapshotsRes.data || []).map((s: any) => [s.user_id, s]));
      const statsMap = new Map((statsRes.data || []).map((s: any) => [s.user_id, s]));

      // Last change per user
      const lastChangeMap = new Map<string, number>();
      for (const ev of (eventsRes.data || [])) {
        if (!lastChangeMap.has(ev.user_id)) {
          lastChangeMap.set(ev.user_id, Number(ev.rating_change));
        }
      }

      // Per-user starting Elo (rating_before of first event) and peak Elo (max rating_after).
      const startMap = new Map<string, number>();
      const peakMap = new Map<string, number>();
      // Per-match Δ Elo per user, used by the chart tooltip and the recent matches list.
      const changeByMatchUser = new Map<string, Map<string, number>>();
      for (const ev of (allEventsRes.data || [])) {
        const uid = ev.user_id as string;
        if (!startMap.has(uid)) startMap.set(uid, Number(ev.rating_before));
        const after = Number(ev.rating_after);
        const prevPeak = peakMap.get(uid);
        if (prevPeak == null || after > prevPeak) peakMap.set(uid, after);
        const mid = ev.match_id as string;
        const inner = changeByMatchUser.get(mid) || new Map<string, number>();
        inner.set(uid, Number(ev.rating_change));
        changeByMatchUser.set(mid, inner);
      }

      const buildPlayer = (userId: string): DuelPlayer => {
        const profile = profileMap.get(userId);
        const snap = snapshotMap.get(userId);
        const stats = statsMap.get(userId);
        return {
          user_id: userId,
          name: profile?.name || "Jogador",
          nickname: profile?.nickname || null,
          avatar_url: profile?.avatar_url || null,
          rating: snap ? Number(snap.rating) : 1000,
          matches_played: snap?.matches_played || 0,
          matches_won: snap?.matches_won || 0,
          sets_won: snap?.sets_won || 0,
          sets_lost: snap?.sets_lost || 0,
          games_won: snap?.games_won || 0,
          games_lost: snap?.games_lost || 0,
          last_change: lastChangeMap.get(userId) ?? null,
          win_streak_current: stats?.win_streak_current || 0,
          win_streak_max: stats?.win_streak_max || 0,
          rating_start: startMap.get(userId) ?? null,
          rating_peak: peakMap.get(userId) ?? null,
        };
      };

      // Put current user first if they're one of the players
      const sorted = user && userIds.includes(user.id)
        ? [user.id, userIds.find((id) => id !== user.id)!]
        : userIds;

      setPlayerA(buildPlayer(sorted[0]));
      setPlayerB(buildPlayer(sorted[1]));
      // Inject per-match Δ Elo into matches before storing.
      setMatches(
        matchesRes.map((m) => ({
          ...m,
          rating_change_by_user: Object.fromEntries(changeByMatchUser.get(m.id) || []),
        })),
      );
    } catch (err) {
      console.error("Error loading duel data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function getActiveSeasonId(gid: string): Promise<string | null> {
    const { data } = await supabase
      .from("seasons")
      .select("id")
      .eq("group_id", gid)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.id || null;
  }

  async function loadDuelMatches(gid: string, userIds: string[]): Promise<Omit<DuelMatch, "rating_change_by_user">[]> {
    // Get all rounds for this group
    const { data: rounds } = await supabase
      .from("rounds")
      .select("id, round_number, scheduled_date, status")
      .eq("group_id", gid)
      .order("round_number", { ascending: false });

    if (!rounds?.length) return [];

    const roundIds = rounds.map((r) => r.id);
    const roundMap = new Map(rounds.map((r) => [r.id, r]));

    // Get matches from those rounds
    const { data: matchesData } = await supabase
      .from("matches")
      .select("id, round_id, winner_team, status, counts_for_ranking, match_sets(*), match_players(*)")
      .in("round_id", roundIds)
      .order("created_at", { ascending: false });

    if (!matchesData?.length) return [];

    return matchesData
      .filter((m: any) => {
        // Only matches involving both players
        const playerIds = (m.match_players || []).map((mp: any) => mp.user_id);
        return userIds.every((id) => playerIds.includes(id));
      })
      .map((m: any) => {
        const round = roundMap.get(m.round_id);
        const sets = (m.match_sets || [])
          .sort((a: any, b: any) => a.set_number - b.set_number)
          .map((s: any) => ({ scoreA: s.score_team_a, scoreB: s.score_team_b }));

        let winnerUserId: string | null = null;
        if (m.winner_team) {
          const winner = (m.match_players || []).find((mp: any) => mp.team === m.winner_team);
          winnerUserId = winner?.user_id || null;
        }
        const teamAPlayer = (m.match_players || []).find((mp: any) => mp.team === "A");

        return {
          id: m.id,
          date: round?.scheduled_date || null,
          winner_team: m.winner_team,
          winner_user_id: winnerUserId,
          status: m.status,
          sets,
          counts_for_ranking: m.counts_for_ranking !== false,
          round_number: round?.round_number || null,
          team_a_user_id: teamAPlayer?.user_id || null,
        };
      });
  }

  // Check admin status when user/group changes
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase.rpc("is_group_admin", {
        _user_id: user.id,
        _group_id: groupId,
      });
      if (alive) setIsAdmin(!!data);
    })();
    return () => { alive = false; };
  }, [user, groupId]);

  const promoteFn = useServerFn(promoteMatchToRankingServerFn);
  const revertFn = useServerFn(revertMatchPromotionServerFn);

  async function handlePromoteMatch(matchId: string) {
    setPromotingId(matchId);
    try {
      const res = await promoteFn({ data: { matchId } });
      toast.success(
        res?.recomputedElo
          ? "Confronto promovido — Elo recalculado"
          : "Confronto promovido para o ranking",
      );
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, counts_for_ranking: true } : m)),
      );
      // Refresh duel data so updated Elo / stats appear
      void loadDuelData();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao promover confronto");
    } finally {
      setPromotingId(null);
    }
  }

  async function handleRevertMatch(matchId: string) {
    if (!confirm("Reverter promoção? Isso desfaz o Elo e tira a partida do ranking.")) return;
    setRevertingId(matchId);
    try {
      const res = await revertFn({ data: { matchId } });
      toast.success(
        res?.revertedElo
          ? "Promoção revertida — Elo desfeito"
          : "Partida marcada como avulsa novamente",
      );
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, counts_for_ranking: false } : m)),
      );
      void loadDuelData();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao reverter promoção");
    } finally {
      setRevertingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!playerA || !playerB) {
    return (
      <div className="px-5 py-12 text-center">
        <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Aguardando 2 jogadores para iniciar a rivalidade</p>
      </div>
    );
  }

  const totalMatches = matches.filter((m) => m.status === "completed").length;
  const winsA = matches.filter((m) => m.status === "completed" && m.winner_user_id === playerA.user_id).length;
  const winsB = matches.filter((m) => m.status === "completed" && m.winner_user_id === playerB.user_id).length;
  const winRateA = totalMatches > 0 ? Math.round((winsA / totalMatches) * 100) : 0;
  const winRateB = totalMatches > 0 ? Math.round((winsB / totalMatches) * 100) : 0;

  // Compute streaks from match history (most recent first)
  const computeStreak = (userId: string) => {
    let current = 0;
    for (const m of matches) {
      if (m.status !== "completed") continue;
      if (m.winner_user_id === userId) current++;
      else break;
    }
    return current;
  };

  const currentStreakA = computeStreak(playerA.user_id);
  const currentStreakB = computeStreak(playerB.user_id);

  const displayNameA = playerA.nickname || playerA.name.split(" ")[0];
  const displayNameB = playerB.nickname || playerB.name.split(" ")[0];

  const eloLeader = playerA.rating >= playerB.rating ? "A" : "B";
  const eloDiff = Math.abs(Math.round(playerA.rating) - Math.round(playerB.rating));

  const completedMatches = matches.filter((m) => m.status === "completed");
  const filteredMatches = completedMatches.filter((m) => {
    if (matchFilter === "all") return true;
    const isOfficial = !!m.round_number && m.counts_for_ranking;
    return matchFilter === "official" ? isOfficial : !isOfficial;
  });
  const recentMatches = filteredMatches.slice(0, 10);

  // ─── H2H Sets/Games totals (only counting matches between both players) ───
  let h2hSetsA = 0;
  let h2hSetsB = 0;
  let h2hGamesA = 0;
  let h2hGamesB = 0;
  for (const m of completedMatches) {
    // map team A/B to playerA/playerB based on team_a_user_id
    const aIsTeamA = m.team_a_user_id === playerA.user_id;
    for (const s of m.sets) {
      const gA = aIsTeamA ? s.scoreA : s.scoreB;
      const gB = aIsTeamA ? s.scoreB : s.scoreA;
      h2hGamesA += gA;
      h2hGamesB += gB;
      if (gA > gB) h2hSetsA++;
      else if (gB > gA) h2hSetsB++;
    }
  }

  // ─── Dynamic insights (item 2) — up to 3 ranked phrases ───
  const insights = (() => {
    const list: { key: string; text: string; tone: "primary" | "info" | "muted" }[] = [];
    const diff = winsA - winsB;
    const leaderName = diff > 0 ? displayNameA : displayNameB;
    const leaderTone: "primary" | "info" = diff > 0 ? "primary" : "info";

    // Leadership / balance
    if (totalMatches === 0) {
      list.push({ key: "no-data", text: "Ainda sem confrontos diretos — joguem o primeiro!", tone: "muted" });
    } else if (Math.abs(diff) === 0) {
      list.push({ key: "tie", text: `Duelo empatado em ${winsA} a ${winsA}`, tone: "muted" });
    } else if (Math.abs(diff) === 1) {
      list.push({ key: "close", text: `Duelo equilibrado: apenas 1 vitória separa os dois`, tone: "muted" });
    } else {
      list.push({ key: "lead", text: `${leaderName} lidera a rivalidade por ${Math.max(winsA, winsB)} a ${Math.min(winsA, winsB)}`, tone: leaderTone });
    }

    // Last 4 matches
    const last4 = completedMatches.slice(0, 4);
    if (last4.length >= 3) {
      const winsRecentA = last4.filter((m) => m.winner_user_id === playerA.user_id).length;
      const winsRecentB = last4.length - winsRecentA;
      if (winsRecentA >= 3) {
        list.push({ key: "form-a", text: `${displayNameA} venceu ${winsRecentA} dos últimos ${last4.length} confrontos`, tone: "primary" });
      } else if (winsRecentB >= 3) {
        list.push({ key: "form-b", text: `${displayNameB} venceu ${winsRecentB} dos últimos ${last4.length} confrontos`, tone: "info" });
      }
    }

    // Active streak
    if (currentStreakA >= 2 && currentStreakA >= currentStreakB) {
      list.push({ key: "streak-a", text: `${displayNameA} tem ${currentStreakA} vitórias seguidas em jogo`, tone: "primary" });
    } else if (currentStreakB >= 2 && currentStreakB > currentStreakA) {
      list.push({ key: "streak-b", text: `${displayNameB} tem ${currentStreakB} vitórias seguidas em jogo`, tone: "info" });
    }

    // Last winner if no streak insight added
    if (list.length < 3 && completedMatches[0]) {
      const lastWinner = completedMatches[0].winner_user_id;
      if (lastWinner === playerA.user_id) {
        list.push({ key: "last-a", text: `${displayNameA} venceu o último encontro`, tone: "primary" });
      } else if (lastWinner === playerB.user_id) {
        list.push({ key: "last-b", text: `${displayNameB} venceu o último encontro`, tone: "info" });
      }
    }

    return list.slice(0, 3);
  })();

  // ─── Elo deltas vs start of season/duel ───
  const eloDeltaA =
    playerA.rating_start != null ? Math.round(playerA.rating - playerA.rating_start) : null;
  const eloDeltaB =
    playerB.rating_start != null ? Math.round(playerB.rating - playerB.rating_start) : null;

  // ─── matchInfo for the chart tooltip ───
  const matchInfoForChart: Record<
    string,
    {
      setScores: string;
      isOfficial: boolean;
      date: string | null;
      changeByUser: Record<string, number>;
    }
  > = {};
  for (const m of completedMatches) {
    const aIsTeamA = m.team_a_user_id === playerA.user_id;
    const setScoresArr = m.sets.map((s) => {
      const left = aIsTeamA ? s.scoreA : s.scoreB;
      const right = aIsTeamA ? s.scoreB : s.scoreA;
      return `${left}-${right}`;
    });
    matchInfoForChart[m.id] = {
      setScores: setScoresArr.join(" • "),
      isOfficial: !!m.round_number && m.counts_for_ranking,
      date: m.date,
      changeByUser: m.rating_change_by_user || {},
    };
  }

  // Real medal computation from H2H history
  const medals = computeDuelMedals(
    completedMatches.map((m) => ({
      winner_user_id: m.winner_user_id,
      status: m.status,
      sets: m.sets,
      team_a_user_id: m.team_a_user_id,
    })),
    playerA.user_id,
    playerB.user_id,
  );

  // Timeline of medal holder changes (for the "Conquistas do duelo" section)
  const medalsTimeline = buildMedalsTimeline(
    completedMatches.map((m) => ({
      winner_user_id: m.winner_user_id,
      status: m.status,
      sets: m.sets,
      team_a_user_id: m.team_a_user_id,
      date: m.date,
    })),
    playerA.user_id,
    playerB.user_id,
  );

  return (
    <div className="space-y-4 px-5 pb-28 animate-fade-in">
      {/* Block 1: Duel Header */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Rivalidade
              </span>
            </div>
            <h2 className="font-display text-base font-bold text-foreground">{groupName}</h2>
            {seasonName && (
              <p className="text-[10px] text-muted-foreground">{seasonName}</p>
            )}
          </div>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `Duelo: ${displayNameA} vs ${displayNameB}`,
                  text: `${displayNameA} ${winsA} x ${winsB} ${displayNameB} | RankMyMatch`,
                  url: window.location.href,
                });
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Face-off avatars */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2 flex-1">
            <PlayerAvatar
              avatarUrl={playerA.avatar_url}
              name={playerA.name}
              size="xl"
              className="ring-2 ring-primary/40"
            />
            <p className="text-sm font-bold text-foreground truncate max-w-[100px]">{displayNameA}</p>
          </div>

          <div className="flex flex-col items-center gap-1 px-2">
            <Swords className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-semibold">VS</span>
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <PlayerAvatar
              avatarUrl={playerB.avatar_url}
              name={playerB.name}
              size="xl"
              className="ring-2 ring-info/40"
            />
            <p className="text-sm font-bold text-foreground truncate max-w-[100px]">{displayNameB}</p>
          </div>
        </div>
      </div>

      {/* Block 2: Overall Score (Vitórias / Sets / Games) + dynamic insights */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <h3 className="mb-4 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Placar Geral do Duelo
        </h3>

        {/* Names line above the scores */}
        <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[11px] font-semibold">
          <span className="truncate text-right text-primary">{displayNameA}</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">vs</span>
          <span className="truncate text-left text-info">{displayNameB}</span>
        </div>

        {/* Wins — primary big score */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span
            className={`text-right font-display text-5xl font-black tabular-nums ${
              winsA > winsB
                ? "text-primary"
                : winsA === winsB
                  ? "text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {winsA}
          </span>
          <span className="text-xl font-bold text-muted-foreground">×</span>
          <span
            className={`text-left font-display text-5xl font-black tabular-nums ${
              winsB > winsA
                ? "text-info"
                : winsB === winsA
                  ? "text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {winsB}
          </span>
        </div>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          Vitórias · {totalMatches} {totalMatches === 1 ? "jogo" : "jogos"}
        </p>

        {/* Win rate bar */}
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted/40">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: totalMatches > 0 ? `${winRateA}%` : "50%" }}
          />
          <div
            className="h-full bg-info transition-all duration-500"
            style={{ width: totalMatches > 0 ? `${winRateB}%` : "50%" }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] font-semibold">
          <span className="text-primary">{winRateA}%</span>
          <span className="text-info">{winRateB}%</span>
        </div>

        {/* Sets + Games — secondary lines */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <ScoreLine label="Sets" valueA={h2hSetsA} valueB={h2hSetsB} />
          <ScoreLine label="Games" valueA={h2hGamesA} valueB={h2hGamesB} />
        </div>

        {/* Dynamic insights — up to 3 stacked phrases */}
        {insights.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-border/40 pt-3">
            {insights.map((it) => (
              <div
                key={it.key}
                className="flex items-start gap-2 text-[11px] leading-snug text-foreground"
              >
                <span
                  className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    it.tone === "primary"
                      ? "bg-primary"
                      : it.tone === "info"
                        ? "bg-info"
                        : "bg-muted-foreground/60"
                  }`}
                  aria-hidden
                />
                <span>{it.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Block 3: Elo Comparison — current, delta vs start, peak */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Elo Atual
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              eloDiff > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
            title="Diferença atual entre os dois jogadores"
          >
            {eloDiff > 0 ? `Δ ${eloDiff}` : "="}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <EloCard
            name={displayNameA}
            rating={Math.round(playerA.rating)}
            delta={eloDeltaA}
            peak={playerA.rating_peak != null ? Math.round(playerA.rating_peak) : null}
            isLeader={eloLeader === "A"}
            tone="primary"
          />
          <EloCard
            name={displayNameB}
            rating={Math.round(playerB.rating)}
            delta={eloDeltaB}
            peak={playerB.rating_peak != null ? Math.round(playerB.rating_peak) : null}
            isLeader={eloLeader === "B"}
            tone="info"
          />
        </div>
      </div>

      {/* Block 4: Head-to-Head Stats */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <Target className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Estatísticas Head-to-Head
          </h3>
        </div>

        <div className="space-y-2">
          <StatRow label="Vitórias" valueA={winsA} valueB={winsB} />
          <StatRow label="Sequência atual" valueA={currentStreakA} valueB={currentStreakB} suffix="🔥" />
          <StatRow label="Maior sequência" valueA={playerA.win_streak_max} valueB={playerB.win_streak_max} />
          <StatRow label="Sets vencidos" valueA={playerA.sets_won} valueB={playerB.sets_won} />
          <StatRow label="Sets perdidos" valueA={playerA.sets_lost} valueB={playerB.sets_lost} invert />
          <StatRow label="Games vencidos" valueA={playerA.games_won} valueB={playerB.games_won} />
          <StatRow label="Games perdidos" valueA={playerA.games_lost} valueB={playerB.games_lost} invert />
          <StatRow label="Saldo de sets" valueA={playerA.sets_won - playerA.sets_lost} valueB={playerB.sets_won - playerB.sets_lost} signed />
          <StatRow label="Saldo de games" valueA={playerA.games_won - playerA.games_lost} valueB={playerB.games_won - playerB.games_lost} signed />
        </div>
      </div>

      {/* Block 5: Recent Matches */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos Confrontos
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground">{filteredMatches.length} de {completedMatches.length}</span>
        </div>

        {/* Filter pills */}
        <div className="mb-3 flex items-center gap-1.5">
          {[
            { key: "all" as const, label: "Todos" },
            { key: "official" as const, label: "Oficiais" },
            { key: "casual" as const, label: "Avulsos" },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setMatchFilter(f.key)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                matchFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background/50 text-muted-foreground hover:bg-accent/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {recentMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum confronto ainda</p>
        ) : (
          <div className="space-y-1.5">
            {recentMatches.map((m) => {
              const winnerName = m.winner_user_id === playerA.user_id ? displayNameA : displayNameB;
              const isWinnerA = m.winner_user_id === playerA.user_id;
              const setScores = m.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(" • ");
              const dateStr = m.date
                ? new Date(m.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
                : "";
              const isOfficial = !!m.round_number && m.counts_for_ranking;
              const isCasual = !m.round_number;

              return (
                <div key={m.id} className="rounded-xl border border-border/50 bg-background/50 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      isWinnerA ? "bg-primary/15 text-primary" : "bg-info/15 text-info"
                    }`}>
                      🏆
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-semibold text-foreground">{winnerName} venceu</p>
                        {m.round_number && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                            R{m.round_number}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-display text-[11px] font-semibold text-muted-foreground tabular-nums">{setScores}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {dateStr && (
                          <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                        )}
                        {isOfficial && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                            Oficial
                          </span>
                        )}
                        {isCasual && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            Avulso
                          </span>
                        )}
                        {!m.counts_for_ranking && (
                          <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                            Não contou
                          </span>
                        )}
                      </div>
                      {isAdmin && !m.counts_for_ranking && (
                        <button
                          onClick={() => handlePromoteMatch(m.id)}
                          disabled={promotingId === m.id}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                        >
                          {promotingId === m.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="h-3 w-3" />
                          )}
                          Promover para ranking
                        </button>
                      )}
                      {isAdmin && m.counts_for_ranking && !!m.round_number === false && (
                        <button
                          onClick={() => handleRevertMatch(m.id)}
                          disabled={revertingId === m.id}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/5 px-2.5 py-1 text-[10px] font-semibold text-warning transition-colors hover:bg-warning/10 disabled:opacity-50"
                        >
                          {revertingId === m.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Undo2 className="h-3 w-3" />
                          )}
                          Reverter promoção
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Block 6: Dual Elo Chart */}
      <DualEloChart
        playerAId={playerA.user_id}
        playerBId={playerB.user_id}
        playerALabel={displayNameA}
        playerBLabel={displayNameB}
        seasonId={seasonId}
        matchInfo={matchInfoForChart}
      />

      {/* Comparativo Resumido */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparativo Atual
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="text-muted-foreground font-semibold text-right pr-2 space-y-2">
            <p className="font-display text-sm font-bold text-primary">{Math.round(playerA.rating)}</p>
            <p className="font-display text-sm font-bold text-foreground">{playerA.matches_played}</p>
            <p className="font-display text-sm font-bold text-foreground">{winRateA}%</p>
          </div>
          <div className="text-muted-foreground space-y-2">
            <p>Elo</p>
            <p>Jogos</p>
            <p>Aproveitamento</p>
          </div>
          <div className="text-muted-foreground font-semibold text-left pl-2 space-y-2">
            <p className="font-display text-sm font-bold text-info">{Math.round(playerB.rating)}</p>
            <p className="font-display text-sm font-bold text-foreground">{playerB.matches_played}</p>
            <p className="font-display text-sm font-bold text-foreground">{winRateB}%</p>
          </div>
        </div>
      </div>

      {/* Block 7: Quick Actions */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/groups/$groupId"
            params={{ groupId }}
            className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-3 transition-colors active:bg-primary/10"
          >
            <PlusCircle className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Registrar confronto</span>
          </Link>
          <Link
            to="/history"
            className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-3 py-3 transition-colors active:bg-accent/30"
          >
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Histórico</span>
          </Link>
          <Link
            to="/groups/$groupId/seasons"
            params={{ groupId }}
            className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-3 py-3 transition-colors active:bg-accent/30"
          >
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Temporadas</span>
          </Link>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `Duelo: ${displayNameA} vs ${displayNameB}`,
                  text: `${displayNameA} ${winsA} x ${winsB} ${displayNameB} | RankMyMatch`,
                  url: window.location.href,
                });
              }
            }}
            className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-3 py-3 transition-colors active:bg-accent/30"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Compartilhar</span>
          </button>
        </div>
      </div>

      {/* Block 8: Real Duel Medals */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <Medal className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Medalhas do Duelo
          </h3>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                emoji: "🗡️",
                label: "Carrasco",
                subtitle: "mais vitórias totais",
                data: medals.carrasco,
                tip: "Quem tem mais vitórias diretas no histórico de confrontos.",
              },
              {
                emoji: "🛡️",
                label: "Invicto",
                subtitle: "maior sequência sem perder",
                data: medals.invicto,
                tip: "Maior sequência de vitórias consecutivas em confrontos diretos.",
              },
              {
                emoji: "👑",
                label: "Rei da virada",
                subtitle: "viradas após perder o 1º set",
                data: medals.reiDaVirada,
                tip: "Maior número de jogos vencidos depois de perder o primeiro set.",
              },
              {
                emoji: "🎯",
                label: "Freguês",
                subtitle: "mais derrotas no duelo",
                data: medals.fregues,
                tip: "Quem mais perdeu nos confrontos diretos — espelho do Carrasco.",
              },
              {
                emoji: "🎾",
                label: "Mestre dos sets",
                subtitle: "mais sets vencidos",
                data: medals.mestreDosSets,
                tip: "Quem venceu mais sets ao longo do duelo — mesmo nas partidas perdidas.",
              },
              {
                emoji: "🔥",
                label: "Pé quente",
                subtitle: "mais vitórias recentes",
                data: medals.peQuente,
                tip: "Quem ganhou mais nos últimos 5 confrontos diretos.",
              },
            ].map((m) => {
              const holderName =
                m.data.holder === "A" ? displayNameA : m.data.holder === "B" ? displayNameB : null;
              const holderColor =
                m.data.holder === "A" ? "text-primary" : m.data.holder === "B" ? "text-info" : "text-muted-foreground";
              const cardCls = holderName
                ? "border-border bg-background/50"
                : "border-border/50 bg-background/30 opacity-60";
              return (
                <Tooltip key={m.label}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`flex w-full items-start gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors active:bg-accent/30 ${cardCls}`}
                    >
                      <span className="text-lg leading-none mt-0.5" aria-hidden>{m.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {m.label}
                        </p>
                        <p className="text-[9px] text-muted-foreground/70 italic mt-0.5">
                          {m.subtitle}
                        </p>
                        {holderName ? (
                          <>
                            <p className={`truncate text-xs font-bold ${holderColor}`}>{holderName}</p>
                            <p className="text-[10px] text-muted-foreground">{m.data.hint}</p>
                          </>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">{m.data.hint}</p>
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-center">
                    {m.tip}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

      {/* Block 9: Conquistas do Duelo — timeline of medal holder changes */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conquistas do Duelo
          </h3>
        </div>
        {medalsTimeline.events.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Sem trocas de medalhas ainda — joguem mais confrontos para escrever a história!
          </p>
        ) : (
          <ol className="relative space-y-3 pl-4">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" aria-hidden />
            {medalsTimeline.events.slice(0, 30).map((ev, idx) => {
              const newName = ev.newHolder === "A" ? displayNameA : displayNameB;
              const prevName =
                ev.previousHolder === "A"
                  ? displayNameA
                  : ev.previousHolder === "B"
                    ? displayNameB
                    : null;
              const colorCls =
                ev.newHolder === "A" ? "text-primary" : "text-info";
              const dotCls =
                ev.newHolder === "A" ? "bg-primary" : "bg-info";
              const dateStr = ev.date
                ? new Date(ev.date + "T00:00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : `Confronto #${ev.matchIndex}`;
              return (
                <li key={`${ev.medal}-${idx}`} className="relative">
                  <span
                    className={`absolute -left-[11px] top-1 h-2 w-2 rounded-full ring-2 ring-card ${dotCls}`}
                    aria-hidden
                  />
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none" aria-hidden>{ev.medalEmoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        <span className={`font-bold ${colorCls}`}>{newName}</span>
                        <span className="text-muted-foreground"> conquistou </span>
                        <span className="font-semibold text-foreground">{ev.medalLabel}</span>
                        {prevName && (
                          <>
                            <span className="text-muted-foreground"> tirando de </span>
                            <span className="font-semibold text-foreground">{prevName}</span>
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {dateStr} · valor: {ev.value}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function StatRow({
  label,
  valueA,
  valueB,
  invert = false,
  signed = false,
  suffix,
}: {
  label: string;
  valueA: number;
  valueB: number;
  invert?: boolean;
  signed?: boolean;
  suffix?: string;
}) {
  const aWins = invert ? valueA < valueB : valueA > valueB;
  const bWins = invert ? valueB < valueA : valueB > valueA;
  const formatVal = (v: number) => (signed && v > 0 ? `+${v}` : `${v}`);

  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-b-0">
      <span className={`w-12 text-right font-display text-sm font-bold ${aWins ? "text-primary" : "text-foreground"}`}>
        {formatVal(valueA)}{suffix && aWins ? ` ${suffix}` : ""}
      </span>
      <span className="flex-1 text-center text-[10px] text-muted-foreground">{label}</span>
      <span className={`w-12 text-left font-display text-sm font-bold ${bWins ? "text-info" : "text-foreground"}`}>
        {formatVal(valueB)}{suffix && bWins ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}

function ScoreLine({ label, valueA, valueB }: { label: string; valueA: number; valueB: number }) {
  const aWins = valueA > valueB;
  const bWins = valueB > valueA;
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between font-display text-sm font-bold tabular-nums">
        <span className={aWins ? "text-primary" : "text-foreground"}>{valueA}</span>
        <span className="text-muted-foreground/50">×</span>
        <span className={bWins ? "text-info" : "text-foreground"}>{valueB}</span>
      </div>
    </div>
  );
}

function EloCard({
  name,
  rating,
  delta,
  peak,
  isLeader,
  tone,
}: {
  name: string;
  rating: number;
  delta: number | null;
  peak: number | null;
  isLeader: boolean;
  tone: "primary" | "info";
}) {
  const toneColor = tone === "primary" ? "text-primary" : "text-info";
  const ringColor = tone === "primary" ? "ring-primary/30" : "ring-info/30";
  return (
    <div
      className={`rounded-2xl border border-border/40 bg-background/40 p-3 ${
        isLeader ? `ring-1 ${ringColor}` : ""
      }`}
    >
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {name}
      </div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${toneColor}`}>
        {rating}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        {delta != null ? (
          <span
            className={`font-semibold tabular-nums ${
              delta > 0 ? "text-primary" : delta < 0 ? "text-destructive" : "text-muted-foreground"
            }`}
            title="Variação desde o início da temporada"
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
        {peak != null && (
          <span className="text-muted-foreground" title="Pico histórico de Elo">
            ↑ {peak}
          </span>
        )}
      </div>
    </div>
  );
}
