import { createFileRoute, Link } from "@tanstack/react-router";
import logoSymbolNeon from "@/assets/logo-symbol-neon.png";
import logoSymbolBlack from "@/assets/logo-symbol-black.png";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLight from "@/assets/logo-horizontal-light.png";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useMyGroups } from "@/hooks/use-groups";
import { useNotifications } from "@/hooks/use-notifications";
import { usePendingMatch } from "@/hooks/use-pending-matches";
import { PendingMatchCard } from "@/components/PendingMatchCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { InstallBanner } from "@/components/InstallBanner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Trophy,
  Users,
  Calendar,
  ChevronRight,
  Bell,
  BarChart3,
  Plus,
  Globe,
  Lock,
  Clock,
  MapPin,
  Swords,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

interface UpcomingRound {
  id: string;
  round_number: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  status: string;
  season_id: string | null;
  group_id: string;
  group_name: string;
  confirmed_count: number;
  max_players: number;
  my_status: string | null;
}

interface RecentMatch {
  id: string;
  match_number: number | null;
  winner_team: string | null;
  my_team: string;
  round_number: number | null;
  group_name: string;
  score_display: string;
  rating_change: number | null;
  created_at: string;
  partner_name: string | null;
}

interface MyRanking {
  rating: number;
  position: number | null;
  matches_played: number;
  matches_won: number;
  season_name: string;
  last_change: number | null;
}

function DashboardPage() {
  let authData: ReturnType<typeof useAuth>;
  try {
    authData = useAuth();
  } catch (e) {
    console.error("[DashboardPage] useAuth error:", e);
    throw e;
  }
  const { user, isAuthenticated, isLoading } = authData;

  let groupsData: ReturnType<typeof useMyGroups>;
  try {
    groupsData = useMyGroups();
  } catch (e) {
    console.error("[DashboardPage] useMyGroups error:", e);
    throw e;
  }
  const { groups: myGroups, isLoading: groupsLoading } = groupsData;

  let notifData: ReturnType<typeof useNotifications>;
  try {
    notifData = useNotifications();
  } catch (e) {
    console.error("[DashboardPage] useNotifications error:", e);
    throw e;
  }
  const { unreadCount } = notifData;

  let themeData: ReturnType<typeof useTheme>;
  try {
    themeData = useTheme();
  } catch (e) {
    console.error("[DashboardPage] useTheme error:", e);
    throw e;
  }
  const { resolved: resolvedTheme } = themeData;
  const [upcomingRounds, setUpcomingRounds] = useState<UpcomingRound[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [myRanking, setMyRanking] = useState<MyRanking | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const { pendingMatch, refresh: refreshPending } = usePendingMatch();
  const [adminGroupIds, setAdminGroupIds] = useState<Set<string>>(new Set());
  const { displayName, nickname, avatarUrl: profileAvatarUrl } = useUserProfile();

  // Check which groups user is admin of
  useEffect(() => {
    if (!user || !myGroups.length) return;
    supabase
      .from("group_members")
      .select("group_id, role")
      .eq("user_id", user.id)
      .in("role", ["creator", "admin"])
      .eq("status", "active")
      .then(({ data }) => {
        setAdminGroupIds(new Set((data || []).map((d) => d.group_id)));
      });
  }, [user, myGroups]);

  const loadDashboard = useCallback(async () => {
    if (!user || !myGroups.length) {
      setDataLoading(false);
      return;
    }

    const groupIds = myGroups.map((g) => g.id);

    // 1. Upcoming rounds
    const { data: rounds } = await supabase
      .from("rounds")
      .select("*, groups(name, slots_per_round)")
      .in("group_id", groupIds)
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_date", { ascending: true })
      .limit(5);

    if (rounds?.length) {
      const roundIds = rounds.map((r) => r.id);
      const { data: presences } = await supabase
        .from("round_presence")
        .select("round_id, status, user_id")
        .in("round_id", roundIds);

      setUpcomingRounds(
        rounds.map((r: any) => {
          const roundPresences = (presences || []).filter((p) => p.round_id === r.id);
          return {
            id: r.id,
            round_number: r.round_number,
            scheduled_date: r.scheduled_date,
            scheduled_time: r.scheduled_time,
            location: r.location,
            status: r.status,
            season_id: r.season_id,
            group_id: r.group_id,
            group_name: r.groups?.name || "Grupo",
            confirmed_count: roundPresences.filter((p) => p.status === "confirmed").length,
            max_players: r.groups?.slots_per_round || r.max_players,
            my_status: roundPresences.find((p) => p.user_id === user.id)?.status || null,
          };
        })
      );
    } else {
      setUpcomingRounds([]);
    }

    // 2. Recent matches (via rating_events)
    const { data: events } = await supabase
      .from("rating_events")
      .select("*, matches(match_number, winner_team, round_id, status)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (events?.length) {
      const matchIds = events.map((e: any) => e.match_id);
      const roundIds = events.map((e: any) => (e.matches as any)?.round_id).filter(Boolean);

      const [playersRes, roundsRes, setsRes] = await Promise.all([
        supabase.from("match_players").select("match_id, team, user_id").in("match_id", matchIds),
        roundIds.length
          ? supabase.from("rounds").select("id, round_number, group_id, groups(name)").in("id", [...new Set(roundIds)])
          : Promise.resolve({ data: [] }),
        supabase.from("match_sets").select("match_id, score_team_a, score_team_b, set_number").in("match_id", matchIds).order("set_number"),
      ]);

      // Load partner profiles
      const partnerIds = new Set<string>();
      for (const e of events) {
        const myPlayer = (playersRes.data || []).find((p: any) => p.match_id === e.match_id && p.user_id === user.id);
        if (myPlayer) {
          const partner = (playersRes.data || []).find((p: any) => p.match_id === e.match_id && p.team === myPlayer.team && p.user_id !== user.id);
          if (partner) partnerIds.add(partner.user_id);
        }
      }
      const { data: partnerProfiles } = partnerIds.size > 0
        ? await supabase.from("user_profiles").select("user_id, name, nickname").in("user_id", [...partnerIds])
        : { data: [] as any[] };
      const partnerMap = new Map((partnerProfiles || []).map((p: any) => [p.user_id, p]));

      const roundMap = new Map((roundsRes.data || []).map((r: any) => [r.id, r]));

      setRecentMatches(
        events.map((e: any) => {
          const match = e.matches as any;
          const myPlayer = (playersRes.data || []).find((p: any) => p.match_id === e.match_id && p.user_id === user.id);
          const partner = (playersRes.data || []).find((p: any) => p.match_id === e.match_id && p.team === myPlayer?.team && p.user_id !== user.id);
          const partnerProfile = partner ? partnerMap.get(partner.user_id) : null;
          const round = roundMap.get(match?.round_id);
          const sets = (setsRes.data || []).filter((s: any) => s.match_id === e.match_id);
          const scoreDisplay = sets.length
            ? sets.map((s: any) => `${s.score_team_a}-${s.score_team_b}`).join(" / ")
            : "—";
          return {
            id: e.match_id,
            match_number: match?.match_number,
            winner_team: match?.winner_team,
            my_team: myPlayer?.team || "?",
            round_number: round?.round_number,
            group_name: (round?.groups as any)?.name || "",
            score_display: scoreDisplay,
            rating_change: Number(e.rating_change),
            created_at: e.created_at,
            partner_name: partnerProfile?.nickname || partnerProfile?.name?.split(" ")[0] || null,
          };
        })
      );
    } else {
      setRecentMatches([]);
    }

    // 3. My ranking (best active season)
    const { data: seasonsList } = await supabase
      .from("seasons")
      .select("id, name")
      .in("group_id", groupIds)
      .eq("status", "active")
      .limit(1);

    if (seasonsList?.length) {
      const season = seasonsList[0];
      const { data: snap } = await supabase
        .from("ranking_snapshots")
        .select("*")
        .eq("season_id", season.id)
        .eq("user_id", user.id)
        .single();

      if (snap) {
        const { data: lastEvent } = await supabase
          .from("rating_events")
          .select("rating_change")
          .eq("user_id", user.id)
          .eq("season_id", season.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setMyRanking({
          rating: Number(snap.rating),
          position: snap.position,
          matches_played: snap.matches_played,
          matches_won: snap.matches_won,
          season_name: season.name,
          last_change: lastEvent ? Number(lastEvent.rating_change) : null,
        });
      }
    }

    setDataLoading(false);
  }, [user, myGroups]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [loadDashboard]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (el && el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.4, 80));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= 60) {
      handleRefresh();
    }
    setPullDistance(0);
  }, [pullDistance, handleRefresh]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const horizontalLogo = resolvedTheme === "light" ? logoHorizontalLight : logoHorizontalDark;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <img src={horizontalLogo} alt="RankMyMatch" className="mb-6 h-24 w-auto" />
        <p className="mt-1 mb-8 text-center text-sm text-muted-foreground">
          Feirinos com rankings, temporadas de padel entre amigos e clubes.
        </p>
        <Link to="/login">
          <button className="rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
            Começar agora
          </button>
        </Link>
      </div>
    );
  }

  const headerDisplayName = displayName;
  const headerAvatarUrl = profileAvatarUrl;

  const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const winRate = myRanking && myRanking.matches_played > 0
    ? Math.round((myRanking.matches_won / myRanking.matches_played) * 100)
    : 0;

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-background pb-28 overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: refreshing ? 48 : pullDistance > 0 ? pullDistance : 0 }}
      >
        <div
          className={`h-5 w-5 rounded-full border-2 border-primary border-t-transparent ${refreshing ? "animate-spin" : ""}`}
          style={{
            opacity: refreshing ? 1 : Math.min(pullDistance / 60, 1),
            transform: refreshing ? undefined : `rotate(${pullDistance * 4}deg)`,
          }}
        />
      </div>
      {/* Header */}
      <header className="px-5 pb-2 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PlayerAvatar avatarUrl={headerAvatarUrl} name={headerDisplayName} size="lg" className="border border-border !h-11 !w-11" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Olá,</p>
              <div className="flex items-center gap-1.5">
                <p className="font-display text-base font-bold text-foreground">{headerDisplayName}</p>
                <Link to="/profile" className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <Pencil className="h-3 w-3" />
                </Link>
              </div>
              {nickname && (
                <p className="text-[10px] text-muted-foreground -mt-0.5">@{nickname}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <img src={resolvedTheme === "light" ? logoSymbolBlack : logoSymbolNeon} alt="RankMyMatch" className="h-7 w-7" />
            <Link to="/notifications" className="relative rounded-full border border-border bg-card p-2.5 transition-colors hover:bg-accent">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* PWA Install Banner */}
      <InstallBanner />

      <div className="space-y-5 px-5 pt-5">
        {/* Ranking card + Quick action */}
        <section className="grid grid-cols-2 gap-3 animate-fade-in">
          {dataLoading ? (
            <div className="flex flex-col rounded-3xl border border-border bg-card p-4 animate-pulse">
              <div className="h-2.5 w-16 rounded bg-muted" />
              <div className="mt-3 h-8 w-12 rounded bg-muted" />
              <div className="mt-2 h-3 w-20 rounded bg-muted" />
              <div className="mt-2 h-2 w-24 rounded bg-muted" />
              <div className="mt-auto pt-3 h-2 w-16 rounded bg-muted" />
            </div>
          ) : myRanking ? (
            <Link to="/ranking" className="flex flex-col rounded-3xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seu Ranking</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-bold text-primary">
                  {myRanking.position ? `#${myRanking.position}` : "—"}
                </span>
              </div>
              <p className="font-display text-sm font-bold text-foreground">{Math.round(myRanking.rating)} Elo</p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{myRanking.matches_won}V {myRanking.matches_played - myRanking.matches_won}D</span>
                <span className="font-semibold">{winRate}%</span>
                {myRanking.last_change !== null && (
                  <span className={`flex items-center gap-0.5 font-semibold ${myRanking.last_change > 0 ? "text-success" : myRanking.last_change < 0 ? "text-destructive" : ""}`}>
                    {myRanking.last_change > 0 ? <TrendingUp className="h-3 w-3" /> : myRanking.last_change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {myRanking.last_change > 0 ? "+" : ""}{Math.round(myRanking.last_change)}
                  </span>
                )}
              </div>
              <p className="mt-auto pt-2 text-[9px] text-muted-foreground/60">{myRanking.season_name}</p>
            </Link>
          ) : (
            <Link to="/ranking" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-border bg-card p-5 text-foreground">
              <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-muted-foreground">Seu Ranking</span>
              <span className="text-[10px] text-muted-foreground/60">Jogue para aparecer</span>
            </Link>
          )}
          <Link to="/groups" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-primary p-5 text-primary-foreground transition-transform active:scale-[0.97]">
            <Plus className="h-7 w-7" strokeWidth={2.5} />
            <span className="text-sm font-semibold">Criar / Entrar</span>
            <span className="text-[10px] opacity-70">em um grupo</span>
          </Link>
        </section>

        {/* Próximo confronto pendente */}
        {pendingMatch && (
          <section className="animate-fade-in">
            <PendingMatchCard
              match={pendingMatch}
              onScoreSaved={() => { refreshPending(); loadDashboard(); }}
              showGroupName={true}
              isAdmin={adminGroupIds.has(pendingMatch.group_id)}
            />
          </section>
        )}

        {/* Próximas Rodadas */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Próximas Rodadas
            </h2>
            <Link to="/seasons" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Ver todas <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {dataLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 animate-pulse">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 rounded bg-muted" />
                    <div className="h-2.5 w-40 rounded bg-muted" />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <div className="ml-auto h-3 w-8 rounded bg-muted" />
                    <div className="ml-auto h-2 w-14 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingRounds.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <Calendar className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma rodada agendada</p>
                <p className="text-xs text-muted-foreground/60">Crie ou entre em um grupo para começar</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {upcomingRounds.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                  params={{ groupId: r.group_id, seasonId: r.season_id || "", roundId: r.id }}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 transition-colors active:bg-accent/30"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    r.status === "in_progress" ? "bg-warning/10" : "bg-primary/10"
                  }`}>
                    {r.status === "in_progress" ? (
                      <Swords className="h-4 w-4 text-warning" />
                    ) : (
                      <Calendar className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        Rodada {r.round_number}
                      </p>
                      {(() => {
                        const today = new Date().toISOString().split("T")[0];
                        const smartStatus = r.status === "scheduled" && r.scheduled_date && r.scheduled_date <= today
                          ? "pending_result"
                          : r.status;
                        const label = smartStatus === "in_progress" ? "Em jogo" : smartStatus === "pending_result" ? "Lançar resultado" : "Agendada";
                        const cls = smartStatus === "in_progress" ? "bg-warning/10 text-warning" : smartStatus === "pending_result" ? "bg-warning/10 text-warning" : "bg-info/10 text-info";
                        return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{label}</span>;
                      })()}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 text-[10px] text-muted-foreground">
                      <span className="font-medium">{r.group_name}</span>
                      {r.scheduled_date && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {formatDate(r.scheduled_date)}
                        </span>
                      )}
                      {r.scheduled_time && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {r.scheduled_time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold text-foreground">{r.confirmed_count}/{r.max_players}</p>
                    {r.my_status === "confirmed" ? (
                      <p className="text-[9px] font-semibold text-success">Confirmado</p>
                    ) : (
                      <p className="text-[9px] text-muted-foreground">Pendente</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Últimos Resultados */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos Resultados
            </h2>
            <Link to="/history" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Histórico <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {dataLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 animate-pulse">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-muted" />
                    <div className="h-2.5 w-24 rounded bg-muted" />
                  </div>
                  <div className="h-3 w-6 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : recentMatches.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <Swords className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma partida ainda</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentMatches.slice(0, 3).map((m) => {
                const won = m.winner_team === m.my_team;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                      won ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    }`}>
                      {won ? "V" : "D"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {m.group_name && `${m.group_name} • `}Set {m.match_number}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {m.score_display}{m.partner_name ? ` · c/ ${m.partner_name}` : ""}
                      </p>
                    </div>
                    {m.rating_change !== null && (
                      <div className={`text-right text-xs font-bold ${
                        m.rating_change > 0 ? "text-success" : m.rating_change < 0 ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {m.rating_change > 0 ? "+" : ""}{Math.round(m.rating_change)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Meus Grupos */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Seus Grupos
            </h2>
            <Link to="/groups" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Explorar <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {myGroups.length > 0 ? (
            <div className="space-y-2">
              {myGroups.slice(0, 3).map((g) => (
                <Link
                  key={g.id}
                  to="/groups/$groupId"
                  params={{ groupId: g.id }}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card p-3.5 transition-colors active:bg-accent/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{g.name}</span>
                        {g.is_public ? <Globe className="h-3 w-3 text-muted-foreground" /> : <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{g.member_count} membros</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <Users className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhum grupo ainda</p>
                <Link to="/groups">
                  <button className="mt-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent">
                    Buscar grupos
                  </button>
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
