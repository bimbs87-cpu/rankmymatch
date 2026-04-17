import { createFileRoute, Link } from "@tanstack/react-router";
import { abbreviateName } from "@/lib/utils";
import logoSymbolNeon from "@/assets/logo-symbol-neon.png";
import logoSymbolBlack from "@/assets/logo-symbol-black.png";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLight from "@/assets/logo-horizontal-light.png";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
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
  Loader2,
} from "lucide-react";

function CardSpinner({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-2">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

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

interface RankingOption {
  season_id: string;
  season_name: string;
  group_name: string;
  rounds_completed: number;
  rounds_total: number;
  rating: number;
  position: number | null;
  matches_played: number;
  matches_won: number;
  last_change: number | null;
  last_events: number[];
  last_event_at: string | null;
  // Total games (a + b) for each of the user's last up to 3 sets, oldest -> newest
  last_set_games: number[];
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
  const [rankings, setRankings] = useState<RankingOption[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [showRankingPicker, setShowRankingPicker] = useState(false);
  const [dashLoading, setDashLoading] = useState(true);
  const dataLoading = dashLoading || groupsLoading;
  const setDataLoading = setDashLoading;
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
    if (!user) {
      setDataLoading(false);
      return;
    }
    if (!myGroups.length) {
      // No groups yet — nothing to load, but only stop spinner once groups query finished
      if (!groupsLoading) setDataLoading(false);
      return;
    }

    setDataLoading(true);
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

    // 3. My rankings — all seasons (active + ended) where the user has a snapshot
    const { data: seasonsList } = await supabase
      .from("seasons")
      .select("id, name, status, updated_at, group_id, total_rounds")
      .in("group_id", groupIds)
      .in("status", ["active", "ended", "completed"]);

    if (seasonsList?.length) {
      const seasonIds = seasonsList.map((s: any) => s.id);
      const [snapsRes, eventsRes, roundsRes] = await Promise.all([
        supabase
          .from("ranking_snapshots")
          .select("season_id, rating, position, matches_played, matches_won")
          .in("season_id", seasonIds)
          .eq("user_id", user.id),
        supabase
          .from("rating_events")
          .select("season_id, match_id, rating_change, created_at")
          .in("season_id", seasonIds)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("rounds")
          .select("season_id, status")
          .in("season_id", seasonIds),
      ]);

      const groupNameMap = new Map(myGroups.map((g: any) => [g.id, g.name]));
      const seasonMap = new Map(seasonsList.map((s: any) => [s.id, s]));
      const eventsBySeason = new Map<string, { rating_change: number; created_at: string; match_id: string }[]>();
      for (const e of eventsRes.data || []) {
        const arr = eventsBySeason.get(e.season_id!) || [];
        arr.push({ rating_change: Number(e.rating_change), created_at: e.created_at, match_id: e.match_id });
        eventsBySeason.set(e.season_id!, arr);
      }
      // rounds: completed count + total count per season
      const roundsBySeason = new Map<string, { completed: number; total: number }>();
      for (const r of roundsRes.data || []) {
        const cur = roundsBySeason.get(r.season_id!) || { completed: 0, total: 0 };
        cur.total += 1;
        if (r.status === "completed") cur.completed += 1;
        roundsBySeason.set(r.season_id!, cur);
      }

      // Fetch sets for the last up to 3 matches (per season) of the user
      const recentMatchIds = new Set<string>();
      for (const arr of eventsBySeason.values()) {
        for (const ev of arr.slice(0, 3)) recentMatchIds.add(ev.match_id);
      }
      let setsByMatch = new Map<string, { score_team_a: number; score_team_b: number; set_number: number }[]>();
      if (recentMatchIds.size) {
        const { data: setsData } = await supabase
          .from("match_sets")
          .select("match_id, score_team_a, score_team_b, set_number")
          .in("match_id", [...recentMatchIds])
          .order("set_number");
        for (const s of setsData || []) {
          const arr = setsByMatch.get(s.match_id) || [];
          arr.push(s as any);
          setsByMatch.set(s.match_id, arr);
        }
      }

      const opts: RankingOption[] = (snapsRes.data || [])
        .map((snap: any) => {
          const season = seasonMap.get(snap.season_id) as any;
          const evs = eventsBySeason.get(snap.season_id) || [];
          const last3 = evs.slice(0, 3).reverse().map((e) => e.rating_change);
          // Last 3 sets: take sets from most recent matches (oldest -> newest)
          const recentMatches = evs.slice(0, 3); // newest first
          const allSets: number[] = [];
          for (const ev of recentMatches) {
            const sets = setsByMatch.get(ev.match_id) || [];
            for (const s of sets) {
              allSets.push((s.score_team_a || 0) + (s.score_team_b || 0));
            }
          }
          // allSets is currently newest match -> oldest match (within match it's set_number asc).
          // Reverse to chronological-ish (oldest first), then take last 3.
          const lastSetGames = allSets.reverse().slice(-3);
          const roundCounts = roundsBySeason.get(snap.season_id) || { completed: 0, total: 0 };
          const plannedTotal = season?.total_rounds ?? roundCounts.total;
          return {
            season_id: snap.season_id,
            season_name: season?.name || "Temporada",
            group_name: groupNameMap.get(season?.group_id) || "",
            rounds_completed: roundCounts.completed,
            rounds_total: Math.max(roundCounts.completed, plannedTotal),
            rating: Number(snap.rating),
            position: snap.position,
            matches_played: snap.matches_played,
            matches_won: snap.matches_won,
            last_change: evs[0] ? evs[0].rating_change : null,
            last_events: last3,
            last_event_at: evs[0]?.created_at || season?.updated_at || null,
            last_set_games: lastSetGames,
          };
        })
        .sort((a, b) => {
          const at = a.last_event_at ? new Date(a.last_event_at).getTime() : 0;
          const bt = b.last_event_at ? new Date(b.last_event_at).getTime() : 0;
          return bt - at;
        });

      setRankings(opts);
      setSelectedSeasonId((prev) => {
        if (prev && opts.some((o) => o.season_id === prev)) return prev;
        return opts[0]?.season_id || null;
      });
    } else {
      setRankings([]);
      setSelectedSeasonId(null);
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
    return <TrophyLoadingBar />;
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

  const headerDisplayName = abbreviateName(displayName);
  const headerAvatarUrl = profileAvatarUrl;

  const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const currentRanking = rankings.find((r) => r.season_id === selectedSeasonId) || rankings[0] || null;
  const winRate = currentRanking && currentRanking.matches_played > 0
    ? Math.round((currentRanking.matches_won / currentRanking.matches_played) * 100)
    : 0;

  const ordinalSuffix = (n: number | null) => {
    if (!n) return "—";
    return `${n}º`;
  };

  // Build a compact sparkline (SVG) showing variation across last 3 events
  const renderSparkline = (events: number[]) => {
    if (!events || events.length === 0) return null;
    // Cumulative deltas anchored at 0
    const cum: number[] = [];
    let acc = 0;
    cum.push(0);
    for (const e of events) {
      acc += e;
      cum.push(acc);
    }
    const w = 70;
    const h = 22;
    const min = Math.min(...cum);
    const max = Math.max(...cum);
    const range = Math.max(1, max - min);
    const stepX = w / Math.max(1, cum.length - 1);
    const points = cum
      .map((v, i) => {
        const x = i * stepX;
        const y = h - ((v - min) / range) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const last = cum[cum.length - 1];
    const stroke = last > 0 ? "var(--success)" : last < 0 ? "var(--destructive)" : "var(--muted-foreground)";
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

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
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-5 min-h-[140px]">
              <CardSpinner label="Carregando ranking" />
            </div>
          ) : currentRanking ? (
            <div className="relative flex flex-col rounded-3xl border border-primary/20 bg-primary/5 p-4 min-h-[140px]">
              {/* Header: title + season switcher */}
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seu Ranking</p>
                {rankings.length > 1 && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRankingPicker((v) => !v); }}
                    className="flex items-center gap-0.5 rounded-full bg-card/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground hover:text-foreground"
                    aria-label="Trocar temporada"
                  >
                    Trocar <ChevronRight className="h-2.5 w-2.5 rotate-90" />
                  </button>
                )}
              </div>

              {/* Ranking picker dropdown */}
              {showRankingPicker && rankings.length > 1 && (
                <div className="absolute left-3 right-3 top-9 z-20 max-h-44 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-lg">
                  {rankings.map((r) => (
                    <button
                      key={r.season_id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedSeasonId(r.season_id);
                        setShowRankingPicker(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-[11px] ${
                        r.season_id === currentRanking.season_id ? "bg-primary/15 text-primary" : "hover:bg-accent/50 text-foreground"
                      }`}
                    >
                      <span className="truncate">{r.season_name}</span>
                      <span className="shrink-0 font-semibold">{ordinalSuffix(r.position)}</span>
                    </button>
                  ))}
                </div>
              )}

              <Link
                to="/ranking"
                className="flex flex-1 flex-col"
              >
                {/* Position + sparkline */}
                <div className="mt-1 flex items-end justify-between gap-2">
                  <span className="font-display text-3xl font-bold leading-none text-primary">
                    {ordinalSuffix(currentRanking.position)}
                  </span>
                  <div className="opacity-90">{renderSparkline(currentRanking.last_events)}</div>
                </div>

                {/* Elo */}
                <p className="mt-1.5 font-display text-sm font-bold text-foreground">{Math.round(currentRanking.rating)} Elo</p>

                {/* V-D % ELO */}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-semibold">{currentRanking.matches_won}V {currentRanking.matches_played - currentRanking.matches_won}D</span>
                  <span>{winRate}%</span>
                  {currentRanking.last_change !== null && (
                    <span className={`flex items-center gap-0.5 font-semibold ${currentRanking.last_change > 0 ? "text-success" : currentRanking.last_change < 0 ? "text-destructive" : ""}`}>
                      {currentRanking.last_change > 0 ? <TrendingUp className="h-3 w-3" /> : currentRanking.last_change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {currentRanking.last_change > 0 ? "+" : ""}{Math.round(currentRanking.last_change)}
                    </span>
                  )}
                </div>

                <p className="mt-auto pt-2 text-[9px] text-muted-foreground/60 truncate">
                  {currentRanking.season_name}
                  {currentRanking.group_name ? ` · ${currentRanking.group_name}` : ""}
                  {currentRanking.rounds_total > 0 ? ` · ${currentRanking.rounds_completed}/${currentRanking.rounds_total}` : ""}
                </p>
              </Link>
            </div>
          ) : (
            <Link to="/ranking" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-border bg-card p-5 text-foreground min-h-[140px]">
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
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-6 min-h-[120px]">
              <CardSpinner label="Carregando rodadas" />
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
                        const smartStatus = r.status === "in_progress"
                          ? "in_progress"
                          : r.status === "completed"
                          ? "completed"
                          : r.status === "scheduled" && r.scheduled_date && r.scheduled_date <= today
                          ? "pending_result"
                          : "scheduled";
                        const label = smartStatus === "completed" ? "Encerrada" : smartStatus === "in_progress" ? "Em andamento" : smartStatus === "pending_result" ? "Aguardando resultado" : "Agendada";
                        const cls = smartStatus === "completed" ? "bg-success/10 text-success" : smartStatus === "in_progress" ? "bg-warning/10 text-warning" : smartStatus === "pending_result" ? "bg-warning/10 text-warning" : "bg-info/10 text-info";
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
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-6 min-h-[120px]">
              <CardSpinner label="Carregando resultados" />
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
          {groupsLoading ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-6 min-h-[120px]">
              <CardSpinner label="Carregando grupos" />
            </div>
          ) : myGroups.length > 0 ? (
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
