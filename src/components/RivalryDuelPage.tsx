import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { DualEloChart } from "@/components/DualEloChart";
import {
  Swords,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Share2,
  ChevronRight,
  Flame,
  Target,
  BarChart3,
  Calendar,
  PlusCircle,
  History,
  Medal,
  Lock,
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

      const [profilesRes, snapshotsRes, statsRes, matchesRes, eventsRes] = await Promise.all([
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
        };
      };

      // Put current user first if they're one of the players
      const sorted = user && userIds.includes(user.id)
        ? [user.id, userIds.find((id) => id !== user.id)!]
        : userIds;

      setPlayerA(buildPlayer(sorted[0]));
      setPlayerB(buildPlayer(sorted[1]));
      setMatches(matchesRes);
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

  async function loadDuelMatches(gid: string, userIds: string[]): Promise<DuelMatch[]> {
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

        return {
          id: m.id,
          date: round?.scheduled_date || null,
          winner_team: m.winner_team,
          winner_user_id: winnerUserId,
          status: m.status,
          sets,
          counts_for_ranking: m.counts_for_ranking !== false,
          round_number: round?.round_number || null,
        };
      });
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

  // Dominance indicator
  const dominanceLabel = (() => {
    if (totalMatches === 0) return null;
    const diff = winsA - winsB;
    if (Math.abs(diff) <= 1) return "Equilíbrio total";
    if (Math.abs(diff) <= 3) return `${diff > 0 ? displayNameA : displayNameB} com leve vantagem`;
    return `${diff > 0 ? displayNameA : displayNameB} domina`;
  })();

  const completedMatches = matches.filter((m) => m.status === "completed");
  const recentMatches = completedMatches.slice(0, 10);

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

      {/* Block 2: Overall Score */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
          Placar Geral do Duelo
        </h3>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <span className={`font-display text-4xl font-black ${winsA > winsB ? "text-primary" : winsA === winsB ? "text-foreground" : "text-muted-foreground"}`}>
              {winsA}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-muted-foreground">×</span>
            <span className="text-[10px] text-muted-foreground mt-1">{totalMatches} jogos</span>
          </div>
          <div className="text-center">
            <span className={`font-display text-4xl font-black ${winsB > winsA ? "text-info" : winsB === winsA ? "text-foreground" : "text-muted-foreground"}`}>
              {winsB}
            </span>
          </div>
        </div>

        {/* Win rates */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 text-right">
            <span className="text-xs font-semibold text-primary">{winRateA}%</span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: totalMatches > 0 ? `${winRateA}%` : "50%" }}
            />
            <div
              className="h-full bg-info transition-all duration-500"
              style={{ width: totalMatches > 0 ? `${winRateB}%` : "50%" }}
            />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold text-info">{winRateB}%</span>
          </div>
        </div>

        {dominanceLabel && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground italic">{dominanceLabel}</p>
        )}
      </div>

      {/* Block 3: Elo Comparison */}
      <div className="rounded-3xl border border-border bg-card/50 p-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
          Elo Atual
        </h3>
        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <p className={`font-display text-2xl font-black ${eloLeader === "A" ? "text-primary" : "text-foreground"}`}>
              {Math.round(playerA.rating)}
            </p>
            {playerA.last_change !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                playerA.last_change > 0 ? "text-success" : playerA.last_change < 0 ? "text-destructive" : "text-muted-foreground"
              }`}>
                {playerA.last_change > 0 ? <TrendingUp className="h-3 w-3" /> : playerA.last_change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {playerA.last_change > 0 ? "+" : ""}{Math.round(playerA.last_change)}
              </span>
            )}
          </div>

          <div className="px-4 text-center">
            <div className={`rounded-full px-3 py-1 text-[10px] font-bold ${
              eloDiff > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {eloDiff > 0 ? `Δ ${eloDiff}` : "="}
            </div>
          </div>

          <div className="flex-1 text-center">
            <p className={`font-display text-2xl font-black ${eloLeader === "B" ? "text-info" : "text-foreground"}`}>
              {Math.round(playerB.rating)}
            </p>
            {playerB.last_change !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                playerB.last_change > 0 ? "text-success" : playerB.last_change < 0 ? "text-destructive" : "text-muted-foreground"
              }`}>
                {playerB.last_change > 0 ? <TrendingUp className="h-3 w-3" /> : playerB.last_change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {playerB.last_change > 0 ? "+" : ""}{Math.round(playerB.last_change)}
              </span>
            )}
          </div>
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
          <span className="text-[10px] text-muted-foreground">{completedMatches.length} total</span>
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

      {/*
        Block 8: Medalhas (placeholder estrutural).
        Estrutura preparada para futura implementação:
          - Carrasco: jogador com mais vitórias contra o adversário
          - Invicto: maior sequência sem perder
          - Rei da virada: vitórias após estar perdendo em sets
          - Freguês: jogador com mais derrotas no confronto direto
        Aqui apenas um teaser elegante e bloqueado para manter o layout completo.
      */}
      <div className="rounded-3xl border border-dashed border-border/60 bg-card/30 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Medal className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Medalhas do Duelo
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
            <Lock className="h-2.5 w-2.5" />
            Em breve
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { emoji: "🗡️", label: "Carrasco" },
            { emoji: "🛡️", label: "Invicto" },
            { emoji: "👑", label: "Rei da virada" },
            { emoji: "🎯", label: "Freguês" },
          ].map((m) => (
            <div
              key={m.label}
              className="flex items-center gap-2 rounded-2xl border border-border/50 bg-background/30 px-3 py-2.5 opacity-60"
            >
              <span className="text-lg" aria-hidden>{m.emoji}</span>
              <span className="text-[11px] font-semibold text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
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
