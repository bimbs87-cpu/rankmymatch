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
  Home,
  User as UserIcon,
  Crown,
} from "lucide-react";

const DESKTOP_NAV = [
  { to: "/" as const, icon: Home, label: "Início" },
  { to: "/profile" as const, icon: UserIcon, label: "Perfil" },
  { to: "/ranking" as const, icon: Crown, label: "Ranking" },
  { to: "/groups" as const, icon: Users, label: "Grupos" },
  { to: "/notifications" as const, icon: Bell, label: "Alertas" },
];

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
  opponent_names: string[];
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
  // History per season for the desktop charts
  const [historyBySeason, setHistoryBySeason] = useState<Map<string, { date: string; rating: number; position: number | null }[]>>(new Map());
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
  const [groupStats, setGroupStats] = useState<Map<string, { seasons: number; rounds_completed: number; rounds_total: number }>>(new Map());
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

  // Load per-group stats: seasons count, rounds completed/total
  useEffect(() => {
    if (!myGroups.length) {
      setGroupStats(new Map());
      return;
    }
    const ids = myGroups.map((g) => g.id);
    (async () => {
      const [seasonsRes, roundsRes] = await Promise.all([
        supabase.from("seasons").select("id, group_id").in("group_id", ids),
        supabase.from("rounds").select("group_id, status").in("group_id", ids),
      ]);
      const stats = new Map<string, { seasons: number; rounds_completed: number; rounds_total: number }>();
      for (const id of ids) stats.set(id, { seasons: 0, rounds_completed: 0, rounds_total: 0 });
      for (const s of seasonsRes.data || []) {
        const cur = stats.get(s.group_id)!;
        cur.seasons += 1;
      }
      for (const r of roundsRes.data || []) {
        const cur = stats.get(r.group_id)!;
        cur.rounds_total += 1;
        if (r.status === "completed") cur.rounds_completed += 1;
      }
      setGroupStats(stats);
    })();
  }, [myGroups]);

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
      .limit(8);

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
      .limit(8);

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

      // Load partner + opponent profiles
      const otherPlayerIds = new Set<string>();
      for (const e of events) {
        const others = (playersRes.data || []).filter((p: any) => p.match_id === e.match_id && p.user_id !== user.id);
        for (const o of others) otherPlayerIds.add(o.user_id);
      }
      const { data: otherProfiles } = otherPlayerIds.size > 0
        ? await supabase.from("user_profiles").select("user_id, name, nickname").in("user_id", [...otherPlayerIds])
        : { data: [] as any[] };
      const profileMap = new Map((otherProfiles || []).map((p: any) => [p.user_id, p]));
      const shortName = (p: any) => p?.nickname || p?.name?.split(" ")[0] || null;

      const roundMap = new Map((roundsRes.data || []).map((r: any) => [r.id, r]));

      setRecentMatches(
        events.map((e: any) => {
          const match = e.matches as any;
          const matchPlayers = (playersRes.data || []).filter((p: any) => p.match_id === e.match_id);
          const myPlayer = matchPlayers.find((p: any) => p.user_id === user.id);
          const partner = matchPlayers.find((p: any) => p.team === myPlayer?.team && p.user_id !== user.id);
          const opponents = matchPlayers.filter((p: any) => p.team !== myPlayer?.team);
          const partnerProfile = partner ? profileMap.get(partner.user_id) : null;
          const opponentNames = opponents
            .map((o: any) => shortName(profileMap.get(o.user_id)))
            .filter((n: any): n is string => Boolean(n));
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
            partner_name: shortName(partnerProfile),
            opponent_names: opponentNames,
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

      // Fetch sets + user's team for the last up to 3 matches (per season) of the user
      const recentMatchIds = new Set<string>();
      for (const arr of eventsBySeason.values()) {
        for (const ev of arr.slice(0, 3)) recentMatchIds.add(ev.match_id);
      }
      let setsByMatch = new Map<string, { score_team_a: number; score_team_b: number; set_number: number }[]>();
      let teamByMatch = new Map<string, string>();
      if (recentMatchIds.size) {
        const matchIdsArr = [...recentMatchIds];
        const [setsRes, playersRes] = await Promise.all([
          supabase
            .from("match_sets")
            .select("match_id, score_team_a, score_team_b, set_number")
            .in("match_id", matchIdsArr)
            .order("set_number"),
          supabase
            .from("match_players")
            .select("match_id, team")
            .in("match_id", matchIdsArr)
            .eq("user_id", user.id),
        ]);
        for (const s of setsRes.data || []) {
          const arr = setsByMatch.get(s.match_id) || [];
          arr.push(s as any);
          setsByMatch.set(s.match_id, arr);
        }
        for (const p of playersRes.data || []) {
          teamByMatch.set(p.match_id, p.team);
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
            const myTeam = teamByMatch.get(ev.match_id);
            for (const s of sets) {
              const myGames = myTeam === "B" ? (s.score_team_b || 0) : (s.score_team_a || 0);
              allSets.push(myGames);
            }
          }
          // allSets is currently newest match -> oldest match (within match it's set_number asc).
          // Reverse to chronological order (oldest first), then take last 3.
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

      // Load historical snapshots for charts (desktop)
      const { data: histSnaps } = await supabase
        .from("ranking_snapshots")
        .select("season_id, snapshot_date, rating, position")
        .in("season_id", seasonIds)
        .eq("user_id", user.id)
        .order("snapshot_date", { ascending: true });
      const hist = new Map<string, { date: string; rating: number; position: number | null }[]>();
      for (const h of histSnaps || []) {
        const arr = hist.get(h.season_id) || [];
        arr.push({ date: h.snapshot_date, rating: Number(h.rating), position: h.position });
        hist.set(h.season_id, arr);
      }
      setHistoryBySeason(hist);
    } else {
      setRankings([]);
      setSelectedSeasonId(null);
      setHistoryBySeason(new Map());
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

  // Tall bar chart anchored at the bottom: user's games in the last up to 3 sets, with value labels above each bar
  const renderGamesBars = (games: number[], height: number = 110) => {
    if (!games || games.length === 0) return null;
    const n = games.length;
    const barW = 18;
    const gap = 6;
    const w = n * barW + (n - 1) * gap;
    const h = height;
    const labelSpace = 14;
    const maxVal = Math.max(...games, 6); // baseline scale so single-digit values look meaningful
    const colorFor = (g: number) => {
      if (g >= 6) return "#84cc16"; // win — vivid green
      if (g === 5) return "#bef264"; // yellow-green
      if (g >= 3) return "#facc15"; // yellow
      return "#f9a8d4"; // 0-2 light pink
    };
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {games.map((g, i) => {
          const barH = Math.max(4, (g / maxVal) * (h - labelSpace));
          const x = i * (barW + gap);
          const y = h - barH;
          const isWin = g >= 6;
          const color = colorFor(g);
          return (
            <g key={i}>
              {isWin && (
                <rect
                  x={x - 1.5}
                  y={y - 1.5}
                  width={barW + 3}
                  height={barH + 1.5}
                  rx={4}
                  fill={color}
                  opacity={0.25}
                />
              )}
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={3}
                fill={color}
              />
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="var(--foreground)"
              >
                {g}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // Simple responsive line chart for desktop charts card
  const renderLineChart = (
    points: { label: string; value: number }[],
    opts: { color: string; invertY?: boolean; height?: number; yLabel?: string }
  ) => {
    const w = 520;
    const h = opts.height ?? 160;
    const padL = 32;
    const padR = 12;
    const padT = 12;
    const padB = 22;
    if (!points.length) {
      return (
        <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
          Sem histórico ainda
        </div>
      );
    }
    const values = points.map((p) => p.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = Math.max(1, maxV - minV);
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const xFor = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const yFor = (v: number) => {
      const t = (v - minV) / range;
      const norm = opts.invertY ? t : 1 - t;
      return padT + norm * innerH;
    };
    const pathD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.value)}`)
      .join(" ");
    const areaD =
      `${pathD} L ${xFor(points.length - 1)} ${padT + innerH} L ${xFor(0)} ${padT + innerH} Z`;
    // Y axis ticks (3 lines)
    const yTicks = [0, 0.5, 1].map((t) => {
      const val = opts.invertY ? minV + t * range : maxV - t * range;
      const yPx = padT + t * innerH;
      return { val, yPx };
    });
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={t.yPx} y2={t.yPx} stroke="var(--border)" strokeDasharray="2 3" opacity="0.5" />
            <text x={padL - 4} y={t.yPx + 3} textAnchor="end" fontSize="9" fill="var(--muted-foreground)">
              {opts.invertY ? `${Math.round(t.val)}º` : Math.round(t.val)}
            </text>
          </g>
        ))}
        <defs>
          <linearGradient id={`grad-${opts.color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={opts.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={opts.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${opts.color.replace("#", "")})`} />
        <path d={pathD} fill="none" stroke={opts.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={xFor(i)} cy={yFor(p.value)} r="2.5" fill={opts.color} />
        ))}
      </svg>
    );
  };

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-background pb-28 lg:pb-8 overflow-y-auto"
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
        <div className="flex items-center justify-between gap-6">
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

          {/* Desktop horizontal nav (only lg+) */}
          <nav className="hidden lg:flex flex-1 items-center justify-center">
            <div className="flex items-center gap-1 rounded-full border border-border bg-card/80 px-2 py-1.5 backdrop-blur-xl">
              {DESKTOP_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-primary/15 [&.active]:text-primary"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

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

      <div className="space-y-5 px-5 pt-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0">
        {/* Season switcher button — above the ranking card */}
        {!dataLoading && currentRanking && rankings.length > 1 && (
          <div className="relative flex animate-fade-in lg:col-span-12">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRankingPicker((v) => !v); }}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
              aria-label="Trocar ranking de grupo/temporada"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="truncate max-w-[200px]">
                Ranking: {currentRanking.season_name}
                {currentRanking.group_name ? ` · ${currentRanking.group_name}` : ""}
              </span>
              <ChevronRight className={`h-3 w-3 transition-transform ${showRankingPicker ? "-rotate-90" : "rotate-90"}`} />
            </button>

            {showRankingPicker && (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-56 min-w-[260px] max-w-[340px] overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-lg">
                {rankings.map((r) => (
                  <button
                    key={r.season_id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedSeasonId(r.season_id);
                      setShowRankingPicker(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] ${
                      r.season_id === currentRanking.season_id ? "bg-primary/15 text-primary" : "hover:bg-accent/50 text-foreground"
                    }`}
                  >
                    <span className="truncate">
                      {r.season_name}
                      {r.group_name ? ` · ${r.group_name}` : ""}
                    </span>
                    <span className="shrink-0 font-semibold">{ordinalSuffix(r.position)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ranking card + Quick action */}
        <section className="grid grid-cols-2 gap-3 animate-fade-in lg:col-span-4 lg:row-start-2 lg:self-start">
          {dataLoading ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-5 min-h-[140px] lg:min-h-0">
              <CardSpinner label="Carregando ranking" />
            </div>
          ) : currentRanking ? (
            <div className="relative flex flex-col rounded-3xl border border-primary/20 bg-primary/5 p-3 min-h-[140px] lg:min-h-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Seu Ranking</p>

              <Link
                to="/ranking"
                className="flex flex-1 flex-col"
              >
                {/* Top row: stats on the left, bar chart on the right */}
                <div className="mt-1 flex flex-1 items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    {/* Position */}
                    <span className="font-display text-3xl font-bold leading-none text-primary">
                      {ordinalSuffix(currentRanking.position)}
                    </span>

                    {/* Elo */}
                    <p className="mt-1.5 font-display text-sm font-bold text-foreground leading-none">{Math.round(currentRanking.rating)} Elo</p>

                    {/* V-D % ELO */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span className="font-semibold whitespace-nowrap">{currentRanking.matches_won}V {currentRanking.matches_played - currentRanking.matches_won}D</span>
                      <span className="whitespace-nowrap">{winRate}%</span>
                      {currentRanking.last_change !== null && (
                        <span className={`flex items-center gap-0.5 font-semibold whitespace-nowrap ${currentRanking.last_change > 0 ? "text-success" : currentRanking.last_change < 0 ? "text-destructive" : ""}`}>
                          {currentRanking.last_change > 0 ? <TrendingUp className="h-3 w-3" /> : currentRanking.last_change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {currentRanking.last_change > 0 ? "+" : ""}{Math.round(currentRanking.last_change)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Games bar chart — fixed width column */}
                  {currentRanking.last_set_games.length > 0 && (
                    <div className="flex shrink-0 flex-col items-end pointer-events-none">
                      <span className="mb-1 text-[8px] uppercase tracking-wider text-muted-foreground/70 leading-none text-right">
                        Últ. {currentRanking.last_set_games.length} set{currentRanking.last_set_games.length > 1 ? "s" : ""}
                      </span>
                      {renderGamesBars(currentRanking.last_set_games, 70)}
                    </div>
                  )}
                </div>

                <p className="mt-2 text-[9px] text-muted-foreground/60 truncate">
                  {currentRanking.group_name || ""}
                  {currentRanking.rounds_total > 0 ? `, ${currentRanking.rounds_completed}/${currentRanking.rounds_total}` : ""}
                  {currentRanking.season_name ? ` · ${currentRanking.season_name}` : ""}
                </p>
              </Link>
            </div>
          ) : (
            <Link to="/ranking" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-border bg-card p-5 text-foreground min-h-[140px] lg:min-h-0">
              <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-muted-foreground">Seu Ranking</span>
              <span className="text-[10px] text-muted-foreground/60">Jogue para aparecer</span>
            </Link>
          )}
          <Link to="/groups" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-primary p-5 lg:p-3 text-primary-foreground transition-transform active:scale-[0.97]">
            <Plus className="h-7 w-7 lg:h-5 lg:w-5" strokeWidth={2.5} />
            <span className="text-sm font-semibold">Criar / Entrar</span>
            <span className="text-[10px] opacity-70">em um grupo</span>
          </Link>
        </section>

        {/* Próximo confronto pendente */}
        {pendingMatch && (
          <section className="animate-fade-in lg:col-span-6">
            <PendingMatchCard
              match={pendingMatch}
              onScoreSaved={() => { refreshPending(); loadDashboard(); }}
              showGroupName={true}
              isAdmin={adminGroupIds.has(pendingMatch.group_id)}
            />
          </section>
        )}

        {/* DESKTOP-ONLY: Últimos Resultados em formato de lista (col direita topo) */}
        <section className="hidden lg:block lg:col-span-8 lg:order-2">
          <div className="flex h-full flex-col rounded-3xl border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Swords className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Últimos Resultados
                  </h2>
                  {!dataLoading && recentMatches.length > 0 && (() => {
                    const wins = recentMatches.filter(m => m.winner_team === m.my_team).length;
                    const losses = recentMatches.length - wins;
                    const eloSum = recentMatches.reduce((s, m) => s + (m.rating_change || 0), 0);
                    return (
                      <p className="text-[10px] text-muted-foreground">
                        <span className="text-success font-semibold">{wins}V</span>
                        <span className="mx-1">·</span>
                        <span className="text-destructive font-semibold">{losses}D</span>
                        <span className="mx-1">·</span>
                        <span className={`font-semibold ${eloSum > 0 ? "text-success" : eloSum < 0 ? "text-destructive" : ""}`}>
                          {eloSum > 0 ? "+" : ""}{Math.round(eloSum)} Elo
                        </span>
                      </p>
                    );
                  })()}
                </div>
              </div>
              <Link to="/history" className="flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary/80">
                Histórico <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {dataLoading ? (
              <div className="flex flex-col items-center justify-center p-6 min-h-[120px]">
                <CardSpinner label="Carregando resultados" />
              </div>
            ) : recentMatches.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Swords className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma partida ainda</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentMatches.slice(0, 8).map((m) => {
                  const won = m.winner_team === m.my_team;
                  const dateStr = new Date(m.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  });
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-accent/30"
                    >
                      {/* V/D pill */}
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                        won ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                      }`}>
                        {won ? "V" : "D"}
                      </div>

                      {/* Score + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-display text-sm font-bold text-foreground tabular-nums">
                            {m.score_display}
                          </p>
                          {m.match_number != null && (
                            <span className="rounded-md bg-muted px-1 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              Set {m.match_number}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2 text-[10px] text-muted-foreground truncate">
                          {m.partner_name && <span className="truncate">c/ <span className="text-foreground/80 font-medium">{m.partner_name}</span></span>}
                          {m.opponent_names.length > 0 && (
                            <span className="truncate">vs <span className="text-foreground/80 font-medium">{m.opponent_names.join(" & ")}</span></span>
                          )}
                        </div>
                      </div>

                      {/* Group + date */}
                      <div className="hidden xl:block shrink-0 text-right max-w-[100px]">
                        {m.group_name && (
                          <p className="text-[10px] font-medium text-foreground/70 truncate">{m.group_name}</p>
                        )}
                        <p className="text-[9px] text-muted-foreground">{dateStr}</p>
                      </div>

                      {/* Elo delta */}
                      {m.rating_change !== null && (
                        <div className="shrink-0 text-right min-w-[44px]">
                          <p className={`font-display text-sm font-bold tabular-nums ${
                            m.rating_change > 0 ? "text-success" : m.rating_change < 0 ? "text-destructive" : "text-muted-foreground"
                          }`}>
                            {m.rating_change > 0 ? "+" : ""}{Math.round(m.rating_change)}
                          </p>
                          <p className="text-[9px] text-muted-foreground/70 leading-none">Elo</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* DESKTOP-ONLY: Card de Gráficos — Posição no Ranking + Elo (col esquerda, abaixo do Ranking+CTA) */}
        <section className="hidden lg:block lg:col-span-4 lg:order-3">
          {(() => {
            const history = currentRanking ? historyBySeason.get(currentRanking.season_id) || [] : [];
            const ratingPoints = history
              .filter((h) => h.rating != null)
              .map((h) => ({ label: h.date, value: h.rating }));
            const positionPoints = history
              .filter((h) => h.position != null)
              .map((h) => ({ label: h.date, value: h.position as number }));
            const firstRating = ratingPoints[0]?.value;
            const lastRating = ratingPoints[ratingPoints.length - 1]?.value;
            const ratingDelta = firstRating != null && lastRating != null ? lastRating - firstRating : null;
            const firstPos = positionPoints[0]?.value;
            const lastPos = positionPoints[positionPoints.length - 1]?.value;
            const posDelta = firstPos != null && lastPos != null ? firstPos - lastPos : null; // positive = subiu
            return (
              <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Evolução
                    </h2>
                    {currentRanking && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70 truncate">
                        {currentRanking.group_name} · {currentRanking.season_name}
                      </p>
                    )}
                  </div>
                  <Link to="/ranking" className="flex items-center gap-0.5 text-xs font-medium text-primary">
                    Detalhes <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3">
                  {/* Position chart */}
                  <div className="flex flex-1 flex-col">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Posição</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-base font-bold text-foreground">
                          {lastPos != null ? `${lastPos}º` : "—"}
                        </span>
                        {posDelta != null && posDelta !== 0 && (
                          <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${posDelta > 0 ? "text-success" : "text-destructive"}`}>
                            {posDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {posDelta > 0 ? "+" : ""}{posDelta}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="min-h-[80px] flex-1 rounded-xl bg-muted/20 p-2">
                      {renderLineChart(positionPoints, { color: "#84cc16", invertY: true })}
                    </div>
                  </div>

                  {/* Elo chart */}
                  <div className="flex flex-1 flex-col">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Elo Points</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-base font-bold text-foreground">
                          {lastRating != null ? Math.round(lastRating) : "—"}
                        </span>
                        {ratingDelta != null && Math.abs(ratingDelta) >= 1 && (
                          <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${ratingDelta > 0 ? "text-success" : "text-destructive"}`}>
                            {ratingDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {ratingDelta > 0 ? "+" : ""}{Math.round(ratingDelta)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="min-h-[80px] flex-1 rounded-xl bg-muted/20 p-2">
                      {renderLineChart(ratingPoints, { color: "#3b82f6" })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* Próximas Rodadas */}
        <section className="lg:col-span-8 lg:order-4">
          {/* Mobile/tablet header */}
          <div className="mb-3 flex items-center justify-between lg:hidden">
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
            <>
              {/* Mobile/tablet: lista solta sem container */}
              <div className="space-y-1.5 lg:hidden">
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
                            : r.status === "scheduled" && r.scheduled_date && r.scheduled_date <= today
                            ? "pending_result"
                            : "scheduled";
                          const label = smartStatus === "in_progress" ? "Em andamento" : smartStatus === "pending_result" ? "Aguardando resultado" : "Agendada";
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

              {/* DESKTOP: card unificado com header e lista densa */}
              <div className="hidden lg:flex h-full flex-col rounded-3xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        Próximas Rodadas
                      </h2>
                      {(() => {
                        const totalConfirmedMine = upcomingRounds.filter(r => r.my_status === "confirmed").length;
                        const inProgress = upcomingRounds.filter(r => r.status === "in_progress").length;
                        return (
                          <p className="text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground/80">{upcomingRounds.length}</span> agendadas
                            <span className="mx-1">·</span>
                            <span className="text-success font-semibold">{totalConfirmedMine} confirmada{totalConfirmedMine !== 1 ? "s" : ""}</span>
                            {inProgress > 0 && (
                              <>
                                <span className="mx-1">·</span>
                                <span className="text-warning font-semibold">{inProgress} em andamento</span>
                              </>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <Link to="/seasons" className="flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary/80">
                    Ver todas <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border/50">
                  {upcomingRounds.slice(0, 8).map((r) => {
                    const today = new Date().toISOString().split("T")[0];
                    const smartStatus = r.status === "in_progress"
                      ? "in_progress"
                      : r.status === "scheduled" && r.scheduled_date && r.scheduled_date <= today
                      ? "pending_result"
                      : "scheduled";
                    const statusLabel = smartStatus === "in_progress" ? "Em andamento" : smartStatus === "pending_result" ? "Aguardando" : "Agendada";
                    const statusCls = smartStatus === "in_progress" ? "bg-warning/15 text-warning" : smartStatus === "pending_result" ? "bg-warning/15 text-warning" : "bg-info/15 text-info";
                    const fillPct = r.max_players > 0 ? Math.min(100, (r.confirmed_count / r.max_players) * 100) : 0;
                    return (
                      <Link
                        key={r.id}
                        to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                        params={{ groupId: r.group_id, seasonId: r.season_id || "", roundId: r.id }}
                        className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-accent/30"
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          r.status === "in_progress" ? "bg-warning/15" : "bg-primary/10"
                        }`}>
                          {r.status === "in_progress" ? (
                            <Swords className="h-3.5 w-3.5 text-warning" />
                          ) : (
                            <span className="font-display text-[11px] font-bold text-primary tabular-nums">
                              {r.round_number ?? "—"}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {r.group_name}
                            </p>
                            <span className={`rounded-md px-1 py-0.5 text-[9px] font-semibold ${statusCls}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-x-2 text-[10px] text-muted-foreground">
                            <span>Rodada {r.round_number}</span>
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
                            {r.location && (
                              <span className="hidden xl:flex items-center gap-0.5 truncate max-w-[110px]">
                                <MapPin className="h-2.5 w-2.5" />
                                <span className="truncate">{r.location}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Presence progress bar + count */}
                        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[68px]">
                          <p className="font-display text-xs font-bold text-foreground tabular-nums">
                            {r.confirmed_count}/{r.max_players}
                          </p>
                          <div className="h-1 w-14 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${fillPct >= 100 ? "bg-success" : fillPct >= 50 ? "bg-primary" : "bg-warning"}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          {r.my_status === "confirmed" ? (
                            <p className="text-[9px] font-semibold text-success leading-none">✓ Confirmado</p>
                          ) : (
                            <p className="text-[9px] text-muted-foreground leading-none">Pendente</p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Últimos Resultados (mobile/tablet only — 3 cards horizontais) */}
        <section className="lg:hidden">
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
            <div className="grid grid-cols-3 gap-2">
              {recentMatches.slice(0, 3).map((m) => {
                const won = m.winner_team === m.my_team;
                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                        won ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      }`}>
                        {won ? "V" : "D"}
                      </div>
                      {m.rating_change !== null && (
                        <span className={`text-[11px] font-bold ${
                          m.rating_change > 0 ? "text-success" : m.rating_change < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}>
                          {m.rating_change > 0 ? "+" : ""}{Math.round(m.rating_change)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
                      {m.score_display}
                    </p>
                    <p className="text-[9px] text-muted-foreground truncate leading-tight">
                      {m.group_name ? `${m.group_name} · ` : ""}Set {m.match_number}
                    </p>
                    {m.partner_name && (
                      <p className="text-[9px] text-muted-foreground/80 truncate leading-tight">
                        c/ {m.partner_name}
                      </p>
                    )}
                    {m.opponent_names.length > 0 && (
                      <p className="text-[9px] text-muted-foreground/80 truncate leading-tight">
                        vs {m.opponent_names.join(" & ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Meus Grupos */}
        <section className="lg:col-span-12 lg:order-5">
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
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {myGroups.slice(0, 4).map((g) => {
                const stats = groupStats.get(g.id) || { seasons: 0, rounds_completed: 0, rounds_total: 0 };
                const remaining = Math.max(0, stats.rounds_total - stats.rounds_completed);
                return (
                  <Link
                    key={g.id}
                    to="/groups/$groupId"
                    params={{ groupId: g.id }}
                    className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-card transition-transform active:scale-[0.98]"
                  >
                    {/* Background image */}
                    {g.image_url ? (
                      <img
                        src={g.image_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-muted" />
                    )}
                    {/* Contrast overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />

                    {/* Top: privacy badge */}
                    <div className="absolute right-2 top-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                        {g.is_public ? (
                          <Globe className="h-3 w-3 text-white" />
                        ) : (
                          <Lock className="h-3 w-3 text-white" />
                        )}
                      </span>
                    </div>

                    {/* Bottom: info */}
                    <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                      <h3 className="font-display text-sm font-bold leading-tight drop-shadow-md line-clamp-2">
                        {g.name}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-white/90">
                        <span className="flex items-center gap-0.5">
                          <Users className="h-2.5 w-2.5" />
                          {g.member_count}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Trophy className="h-2.5 w-2.5" />
                          {stats.seasons}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {stats.rounds_completed}/{stats.rounds_total}
                        </span>
                      </div>
                      {remaining > 0 && (
                        <p className="mt-0.5 text-[9px] text-white/70">
                          {remaining} rodada{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
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
