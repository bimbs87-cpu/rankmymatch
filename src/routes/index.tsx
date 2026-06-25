import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";
import { OnboardingNoGroupScreen } from "@/components/onboarding/OnboardingNoGroupScreen";
import { useMyPendingJoinRequests } from "@/hooks/use-groups";
import { abbreviateName } from "@/lib/utils";
import logoHorizontalDark from "@/assets/logo-horizontal-dark.png";
import logoHorizontalLight from "@/assets/logo-horizontal-light.png";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useMyGroups } from "@/hooks/use-groups";
import { formatCountdown, countdownTone } from "@/lib/countdown";
import { useNotifications } from "@/hooks/use-notifications";
import { usePendingMatch } from "@/hooks/use-pending-matches";
import { PendingMatchCard } from "@/components/PendingMatchCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { InstallBanner } from "@/components/InstallBanner";

import { NotificationsPopover } from "@/components/NotificationsPopover";
import { GroupSwitcherPopover } from "@/components/GroupSwitcherPopover";

import { PushOptInBanner } from "@/components/PushOptInBanner";
import { EloEvolutionChart } from "@/components/EloEvolutionChart";
import { supabase } from "@/integrations/supabase/client";
import { isPresenceOpen, getPresenceOpenDate, formatPresenceOpenDate } from "@/lib/presence-schedule";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Trophy,
  Users,
  Calendar,
  ChevronRight,
  ChevronDown,
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
  HelpCircle,
  History,
  Settings,
  CalendarPlus,
  ListChecks,
  Medal,
  Check,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";
import { confirmPresence, cancelPresence } from "@/lib/round-actions";
import { CancelRoundDialog } from "@/components/CancelRoundDialog";
import { CasualMatchDialog } from "@/components/CasualMatchDialog";

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
  head: () => ({
    meta: [
      { title: "RankMyMatch — Ranking Elo, temporada e estatísticas para seu grupo" },
      {
        name: "description",
        content:
          "Registre seu grupo em um só lugar. Ranking Elo dinâmico, rodadas automáticas e estatísticas avançadas para padel, tênis, beach tennis e mais. Entre com Google em 1 clique.",
      },
      { property: "og:title", content: "RankMyMatch — Ranking, temporadas e estatísticas" },
      {
        property: "og:description",
        content:
          "Pare de anotar resultado em planilha do WhatsApp. Ranking Elo, rodadas e estatísticas para seu grupo em 1 clique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "RankMyMatch — Ranking para seu grupo" },
      {
        name: "twitter:description",
        content: "Ranking Elo, rodadas e estatísticas em 1 clique. Entre com Google.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rankmymatch.app/" }],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <TrophyLoadingBar />;
  if (!isAuthenticated) return <LandingPage />;
  return <DashboardOrOnboarding />;
}

const ONBOARDING_SKIP_KEY = "rmm-onboarding-skipped";

function DashboardOrOnboarding() {
  const { groups: myGroups, isLoading: groupsLoading } = useMyGroups();
  const { groups: pending, isLoading: pendingLoading } = useMyPendingJoinRequests();
  const [skipped, setSkipped] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ONBOARDING_SKIP_KEY) === "1";
  });

  if (groupsLoading || pendingLoading) return <TrophyLoadingBar />;

  const hasGroup = myGroups.length > 0;
  const hasPending = pending.some((p) => p.request_status === "pending");
  if (!hasGroup && !hasPending && !skipped) {
    return (
      <OnboardingNoGroupScreen
        onSkip={() => {
          try {
            window.sessionStorage.setItem(ONBOARDING_SKIP_KEY, "1");
          } catch {
            // ignore
          }
          setSkipped(true);
        }}
      />
    );
  }
  return <DashboardPage />;
}

interface UpcomingRound {
  id: string;
  round_number: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  status: string;
  season_id: string | null;
  season_name: string | null;
  group_id: string;
  group_name: string;
  confirmed_count: number;
  pending_count: number;
  declined_count: number;
  waiting_count: number;
  max_players: number;
  my_status: string | null;
  presence_open_mode: string;
  presence_open_time: string;
}

interface NextMatchInfo {
  round_id: string;
  group_id: string;
  group_name: string;
  season_id: string | null;
  season_name: string | null;
  round_number: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  /** Match record exists & user is paired */
  has_pairing: boolean;
  /** When has_pairing: the partner display name (doubles only) */
  partner_name: string | null;
  /** When has_pairing: the opponent display names */
  opponent_names: string[];
  /** When has_pairing: the user's match id (for "Registrar resultado") */
  match_id: string | null;
  /** Match status when paired */
  match_status: string | null;
  /** User's presence status in this round (confirmed | pending | declined | null) */
  my_presence_status: string | null;
  /** Group format: 'doubles' | 'singles' */
  match_format: string;
  /** When singles: 'rivalry' | 'league' | 'casual' | null */
  singles_group_type: string | null;
  /** True if the group is rivalry mode (singles + singles_group_type='rivalry') */
  is_rivalry: boolean;
  /** True if there's at least one completed match in this rivalry group */
  has_any_completed_match: boolean;
  /** Group's presence-window opening config */
  presence_open_mode: string;
  presence_open_time: string;
  /** Computed: true if presence list is currently open for confirmation */
  presence_is_open: boolean;
  /** Computed: ISO date string for when presence opens (only when not open yet) */
  presence_opens_at: string | null;
}

interface RecentMatch {
  id: string;
  match_number: number | null;
  winner_team: string | null;
  my_team: string;
  round_id: string | null;
  round_number: number | null;
  group_id: string | null;
  group_name: string;
  season_id: string | null;
  score_display: string;
  rating_change: number | null;
  created_at: string;
  match_date: string;
  partner_name: string | null;
  opponent_names: string[];
  is_casual?: boolean;
}

interface RankingOption {
  season_id: string;
  season_name: string;
  group_id: string;
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
  // Total games (a + b) for each of the user's last up to 5 sets, oldest -> newest
  last_set_games: number[];
  // Aggregate-only flag
  is_aggregate?: boolean;
}

const ALL_RANKINGS_ID = "__all__";

function DashboardPage() {
  let authData: ReturnType<typeof useAuth>;
  try {
    authData = useAuth();
  } catch (e) {
    console.error("[DashboardPage] useAuth error:", e);
    throw e;
  }
  const { user } = useAuth();

  const navigate = useNavigate();

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
  const [nextMatch, setNextMatch] = useState<NextMatchInfo | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [rankings, setRankings] = useState<RankingOption[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  // Per-match Elo history per season for the desktop chart
  const [historyBySeason, setHistoryBySeason] = useState<Map<string, { date: string; rating: number; matchIndex: number }[]>>(new Map());
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
  const [confirmingRoundId, setConfirmingRoundId] = useState<string | null>(null);
  const [cancelRoundTarget, setCancelRoundTarget] = useState<NextMatchInfo | null>(null);
  const [casualDialogOpen, setCasualDialogOpen] = useState(false);
  const { displayName, nickname, avatarUrl: profileAvatarUrl } = useUserProfile();

  /**
   * Confirms presence for a round inline (no navigation).
   * Updates local state optimistically so the next-match card and shortcuts
   * reflect the confirmation immediately, then shows a success toast.
   */
  const handleConfirmPresence = useCallback(
    async (roundId: string, groupName: string) => {
      if (!user) return;
      if (confirmingRoundId) return;
      setConfirmingRoundId(roundId);
      try {
        await confirmPresence(roundId, user.id);
        // Optimistic local updates
        setNextMatch((prev) =>
          prev && prev.round_id === roundId
            ? { ...prev, my_presence_status: "confirmed" }
            : prev,
        );
        setUpcomingRounds((prev) =>
          prev.map((r) =>
            r.id === roundId
              ? {
                  ...r,
                  my_status: "confirmed",
                  confirmed_count: r.my_status === "confirmed" ? r.confirmed_count : r.confirmed_count + 1,
                  pending_count: r.my_status === "pending" ? Math.max(0, r.pending_count - 1) : r.pending_count,
                  declined_count: r.my_status === "declined" ? Math.max(0, r.declined_count - 1) : r.declined_count,
                }
              : r,
          ),
        );
        toast.success("Presença confirmada", {
          description: `Você confirmou presença em ${groupName}.`,
        });
      } catch (err: any) {
        console.error("[handleConfirmPresence] error", err);
        toast.error("Não foi possível confirmar", {
          description: err?.message || "Tente novamente em instantes.",
        });
      } finally {
        setConfirmingRoundId(null);
      }
    },
    [user, confirmingRoundId],
  );

  /**
   * Marks the user as declined ("Não vou") for a round inline.
   * Works both when no response has been given yet, and when the user
   * had previously confirmed (acts as "Não vou mais").
   */
  const handleDeclinePresence = useCallback(
    async (roundId: string, groupName: string) => {
      if (!user) return;
      if (confirmingRoundId) return;
      setConfirmingRoundId(roundId);
      try {
        await cancelPresence(roundId, user.id);
        setNextMatch((prev) =>
          prev && prev.round_id === roundId
            ? { ...prev, my_presence_status: "declined" }
            : prev,
        );
        setUpcomingRounds((prev) =>
          prev.map((r) =>
            r.id === roundId
              ? {
                  ...r,
                  my_status: "declined",
                  confirmed_count: r.my_status === "confirmed" ? Math.max(0, r.confirmed_count - 1) : r.confirmed_count,
                  pending_count: r.my_status === "pending" ? Math.max(0, r.pending_count - 1) : r.pending_count,
                  declined_count: r.my_status === "declined" ? r.declined_count : r.declined_count + 1,
                }
              : r,
          ),
        );
        toast.success("Resposta registrada", {
          description: `Você marcou que não vai em ${groupName}.`,
        });
      } catch (err: any) {
        console.error("[handleDeclinePresence] error", err);
        toast.error("Não foi possível registrar", {
          description: err?.message || "Tente novamente em instantes.",
        });
      } finally {
        setConfirmingRoundId(null);
      }
    },
    [user, confirmingRoundId],
  );

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
      .select("*, groups(name, slots_per_round, presence_open_mode, presence_open_time, match_format, singles_group_type), seasons(name)")
      .in("group_id", groupIds)
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_date", { ascending: true })
      .limit(8);

    let presences: { round_id: string; status: string; user_id: string }[] = [];
    if (rounds?.length) {
      const roundIds = rounds.map((r) => r.id);
      const [{ data: presencesData }, { data: waiters }] = await Promise.all([
        supabase
          .from("round_presence")
          .select("round_id, status, user_id")
          .in("round_id", roundIds),
        supabase
          .from("waiting_list")
          .select("round_id")
          .in("round_id", roundIds),
      ]);
      presences = presencesData || [];

      setUpcomingRounds(
        rounds.map((r: any) => {
          const roundPresences = presences.filter((p) => p.round_id === r.id);
          return {
            id: r.id,
            round_number: r.round_number,
            scheduled_date: r.scheduled_date,
            scheduled_time: r.scheduled_time,
            location: r.location,
            status: r.status,
            season_id: r.season_id,
            season_name: (r.seasons as any)?.name || null,
            group_id: r.group_id,
            group_name: r.groups?.name || "Grupo",
            confirmed_count: roundPresences.filter((p) => p.status === "confirmed").length,
            pending_count: roundPresences.filter((p) => p.status === "pending").length,
            declined_count: roundPresences.filter((p) => p.status === "declined").length,
            waiting_count: (waiters || []).filter((w) => w.round_id === r.id).length,
            max_players: r.groups?.slots_per_round || r.max_players,
            my_status: roundPresences.find((p) => p.user_id === user.id)?.status || null,
            presence_open_mode: r.groups?.presence_open_mode || "always",
            presence_open_time: r.groups?.presence_open_time || "10:00:00",
          };
        })
      );
    } else {
      setUpcomingRounds([]);
    }

    // 1.5 Next match — find soonest upcoming round and check for paired match
    {
      const orderedRounds = (rounds || []).slice().sort((a: any, b: any) => {
        const dA = a.scheduled_date || "9999-12-31";
        const dB = b.scheduled_date || "9999-12-31";
        if (dA !== dB) return dA < dB ? -1 : 1;
        const tA = a.scheduled_time || "23:59:59";
        const tB = b.scheduled_time || "23:59:59";
        return tA < tB ? -1 : tA > tB ? 1 : 0;
      });
      // Pick the first round where the user has confirmed presence
      const myConfirmedRound = orderedRounds.find((r: any) => {
        return (
          (presences || []).some(
            (p: any) => p.round_id === r.id && p.user_id === user.id && p.status === "confirmed",
          )
        );
      }) || orderedRounds[0];

      if (myConfirmedRound) {
        const groupMeta = myConfirmedRound.groups || {};
        const matchFormat = groupMeta.match_format || "doubles";
        const singlesGroupType = groupMeta.singles_group_type || null;
        const isRivalry = matchFormat === "singles" && singlesGroupType === "rivalry";
        const myPresenceStatus =
          (presences || []).find((p: any) => p.round_id === myConfirmedRound.id && p.user_id === user.id)?.status ||
          null;

        // Check if there's a match with the user paired in this round
        const { data: myMatchPlayers } = await supabase
          .from("match_players")
          .select("match_id, team")
          .eq("user_id", user.id);
        const matchIdsForUser = new Set((myMatchPlayers || []).map((mp: any) => mp.match_id));

        const { data: roundMatches } = await supabase
          .from("matches")
          .select("id, status, winner_team")
          .eq("round_id", myConfirmedRound.id)
          .neq("status", "completed");

        const myMatchInRound = (roundMatches || []).find((m: any) => matchIdsForUser.has(m.id));

        // For rivalry: check if there's any completed match in the group
        let hasAnyCompletedMatch = false;
        if (isRivalry) {
          const { data: groupRounds } = await supabase
            .from("rounds")
            .select("id")
            .eq("group_id", myConfirmedRound.group_id);
          const groupRoundIds = (groupRounds || []).map((r: any) => r.id);
          if (groupRoundIds.length) {
            const { count } = await supabase
              .from("matches")
              .select("id", { count: "exact", head: true })
              .in("round_id", groupRoundIds)
              .eq("status", "completed");
            hasAnyCompletedMatch = (count || 0) > 0;
          }
        }

        const presenceMode = groupMeta.presence_open_mode || "always";
        const presenceTime = groupMeta.presence_open_time || "10:00:00";
        const presenceCfg = { presence_open_mode: presenceMode, presence_open_time: presenceTime };
        const presenceIsOpen = isPresenceOpen(
          presenceCfg,
          myConfirmedRound.scheduled_date,
          myConfirmedRound.scheduled_time,
          myConfirmedRound.id,
        );
        const presenceOpensAtRaw = !presenceIsOpen
          ? getPresenceOpenDate(presenceCfg, myConfirmedRound.scheduled_date, myConfirmedRound.scheduled_time, myConfirmedRound.id)
          : null;

        const baseInfo = {
          round_id: myConfirmedRound.id,
          group_id: myConfirmedRound.group_id,
          group_name: groupMeta.name || "Grupo",
          season_id: myConfirmedRound.season_id,
          season_name: (myConfirmedRound.seasons as any)?.name || null,
          round_number: myConfirmedRound.round_number,
          scheduled_date: myConfirmedRound.scheduled_date,
          scheduled_time: myConfirmedRound.scheduled_time,
          my_presence_status: myPresenceStatus,
          match_format: matchFormat,
          singles_group_type: singlesGroupType,
          is_rivalry: isRivalry,
          has_any_completed_match: hasAnyCompletedMatch,
          presence_open_mode: presenceMode,
          presence_open_time: presenceTime,
          presence_is_open: presenceIsOpen,
          presence_opens_at: presenceOpensAtRaw ? presenceOpensAtRaw.toISOString() : null,
        };

        if (myMatchInRound) {
          // Found pairing — fetch teammates and opponents
          const myTeam = (myMatchPlayers || []).find((mp: any) => mp.match_id === myMatchInRound.id)?.team;
          const { data: allPlayers } = await supabase
            .from("match_players")
            .select("user_id, team")
            .eq("match_id", myMatchInRound.id);
          const otherIds = (allPlayers || [])
            .filter((p: any) => p.user_id !== user.id)
            .map((p: any) => p.user_id);
          const { data: profs } = await supabase
            .from("user_profiles")
            .select("user_id, name, nickname")
            .in("user_id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);
          const nameOf = (uid: string) => {
            const p = (profs || []).find((x: any) => x.user_id === uid);
            return p?.nickname?.trim() || p?.name || "Jogador";
          };
          const partnerId = (allPlayers || []).find(
            (p: any) => p.user_id !== user.id && p.team === myTeam,
          )?.user_id;
          const opponentIds = (allPlayers || [])
            .filter((p: any) => p.team !== myTeam)
            .map((p: any) => p.user_id);

          setNextMatch({
            ...baseInfo,
            has_pairing: true,
            partner_name: partnerId ? nameOf(partnerId) : null,
            opponent_names: opponentIds.map(nameOf),
            match_id: myMatchInRound.id,
            match_status: myMatchInRound.status,
          });
        } else {
          // No pairing yet — show round-only card
          setNextMatch({
            ...baseInfo,
            has_pairing: false,
            partner_name: null,
            opponent_names: [],
            match_id: null,
            match_status: null,
          });
        }
      } else {
        setNextMatch(null);
      }
    }

    // 2. Recent matches: rating_events.created_at is unreliable for ordering
    // (batch recalculations rewrite created_at, masking truly recent matches).
    // PostgREST does not honor ordering on deeply-nested foreignTable paths
    // ("matches.rounds"), so we fetch all completed matches for the user and
    // sort client-side by rounds.scheduled_date desc, then by match_number desc
    // — exactly the same ordering used by the Histórico page.
    const { data: recentPlayerRows } = await supabase
      .from("match_players")
      .select("match_id, team, matches!inner(id, match_number, winner_team, round_id, status, rounds!inner(id, round_number, scheduled_date, group_id, season_id, groups(name)))")
      .eq("user_id", user.id)
      .eq("matches.status", "completed");

    const sortedRows = (recentPlayerRows || [])
      .map((row: any) => {
        const sched = row.matches?.rounds?.scheduled_date as string | null | undefined;
        const ts = sched ? new Date(sched + "T12:00:00").getTime() : 0;
        return { row, ts, mn: row.matches?.match_number ?? 0 };
      })
      .sort((a, b) => (b.ts - a.ts) || (b.mn - a.mn))
      .slice(0, 8)
      .map(({ row }) => row);

    const events = sortedRows.map((row: any) => ({
      match_id: row.match_id,
      matches: {
        match_number: row.matches?.match_number,
        winner_team: row.matches?.winner_team,
        round_id: row.matches?.round_id,
        status: row.matches?.status,
      },
      _round: row.matches?.rounds,
      _my_team: row.team,
      created_at: row.matches?.rounds?.scheduled_date || null,
      rating_change: 0,
    }));

    let combinedRecent: any[] = [];
    if (events?.length) {
      const matchIds = events.map((e: any) => e.match_id);
      const roundIds = events.map((e: any) => (e.matches as any)?.round_id).filter(Boolean);

      const [playersRes, roundsRes, setsRes, ratingRes] = await Promise.all([
        supabase.from("match_players").select("match_id, team, user_id").in("match_id", matchIds),
        roundIds.length
          ? supabase.from("rounds").select("id, round_number, scheduled_date, group_id, season_id, groups(name)").in("id", [...new Set(roundIds)])
          : Promise.resolve({ data: [] }),
        supabase.from("match_sets").select("match_id, score_team_a, score_team_b, set_number").in("match_id", matchIds).order("set_number"),
        supabase.from("rating_events").select("match_id, rating_change").in("match_id", matchIds).eq("user_id", user.id),
      ]);
      const ratingMap = new Map((ratingRes.data || []).map((r: any) => [r.match_id, Number(r.rating_change)]));

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

      const mapped = events.map((e: any) => {
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
          // Use round.scheduled_date when available so ordering matches Histórico.
          const sortDate =
            (round?.scheduled_date ? new Date(round.scheduled_date + "T12:00:00").getTime() : 0)
            || new Date(e.created_at).getTime();
          return {
            id: e.match_id,
            match_number: match?.match_number,
            winner_team: match?.winner_team,
            my_team: myPlayer?.team || "?",
            round_id: match?.round_id ?? null,
            round_number: round?.round_number,
            group_id: round?.group_id ?? null,
            group_name: (round?.groups as any)?.name || "",
            season_id: round?.season_id ?? null,
            score_display: scoreDisplay,
            rating_change: ratingMap.get(e.match_id) ?? 0,
            created_at: e.created_at,
            match_date: round?.scheduled_date || e.created_at,
            partner_name: shortName(partnerProfile),
            opponent_names: opponentNames,
            _sort_date: sortDate,
            _match_number_sort: match?.match_number ?? 0,
          };
        });
      // Sort by round date desc, then by match_number desc as tiebreaker.
      mapped.sort((a: any, b: any) => {
        if (b._sort_date !== a._sort_date) return b._sort_date - a._sort_date;
        return (b._match_number_sort || 0) - (a._match_number_sort || 0);
      });
      combinedRecent = mapped;
    }

    // 2b. Casual (avulsa) matches
    try {
      const { data: cMatches } = await supabase
        .from("casual_matches")
        .select("id, match_format, played_on, location, winner_team")
        .eq("owner_user_id", user.id)
        .order("played_on", { ascending: false })
        .limit(8);
      if (cMatches && cMatches.length > 0) {
        const cIds = cMatches.map((c) => c.id);
        const [{ data: cParts }, { data: cSets }] = await Promise.all([
          supabase
            .from("casual_match_participants")
            .select("match_id, team, display_name, is_owner")
            .in("match_id", cIds),
          supabase
            .from("casual_match_sets")
            .select("match_id, set_number, score_team_a, score_team_b")
            .in("match_id", cIds)
            .order("set_number"),
        ]);
        const casualMapped = cMatches.map((m) => {
          const parts = (cParts || []).filter((p: any) => p.match_id === m.id);
          const owner = parts.find((p: any) => p.is_owner);
          const myTeam = owner?.team || "a";
          const partner = parts.find((p: any) => p.team === myTeam && !p.is_owner);
          const opponents = parts.filter((p: any) => p.team !== myTeam);
          const setsForMatch = (cSets || []).filter((s: any) => s.match_id === m.id);
          const score = setsForMatch.length
            ? setsForMatch.map((s: any) => `${s.score_team_a}-${s.score_team_b}`).join(" / ")
            : "—";
          const ts = new Date(m.played_on + "T12:00:00").getTime();
          return {
            id: m.id,
            match_number: null,
            winner_team: m.winner_team,
            my_team: myTeam,
            round_id: null,
            round_number: null,
            group_id: null,
            group_name: m.location ? `Avulsa · ${m.location}` : "Partida avulsa",
            season_id: null,
            score_display: score,
            rating_change: null,
            created_at: m.played_on,
            match_date: m.played_on,
            partner_name: partner?.display_name?.split(/\s+/)[0] || null,
            opponent_names: opponents.map((o: any) => o.display_name?.split(/\s+/)[0]).filter(Boolean),
            is_casual: true,
            _sort_date: ts,
            _match_number_sort: 0,
          };
        });
        combinedRecent = [...combinedRecent, ...casualMapped];
      }
    } catch (e) {
      console.error("[recent] casual fetch error", e);
    }

    combinedRecent.sort((a: any, b: any) => {
      if (b._sort_date !== a._sort_date) return b._sort_date - a._sort_date;
      return (b._match_number_sort || 0) - (a._match_number_sort || 0);
    });
    setRecentMatches(combinedRecent);

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

      // Collect timestamped events + sets across seasons for the aggregate option
      const aggEvents: { rating_change: number; created_at: string }[] = [];
      const aggSets: { games: number; created_at: string }[] = [];

      const opts: RankingOption[] = (snapsRes.data || [])
        .map((snap: any) => {
          const season = seasonMap.get(snap.season_id) as any;
          const evs = eventsBySeason.get(snap.season_id) || [];
          const last5 = evs.slice(0, 5).reverse().map((e) => e.rating_change);
          // Last 5 sets: take sets from most recent matches (oldest -> newest)
          const recentMatches = evs.slice(0, 5); // newest first
          const allSets: { games: number; created_at: string }[] = [];
          for (const ev of recentMatches) {
            const sets = setsByMatch.get(ev.match_id) || [];
            const myTeam = teamByMatch.get(ev.match_id);
            for (const s of sets) {
              const myGames = myTeam === "B" ? (s.score_team_b || 0) : (s.score_team_a || 0);
              allSets.push({ games: myGames, created_at: ev.created_at });
            }
          }
          // Reverse to chronological order (oldest first), then take last 5.
          const lastSetGames = allSets.reverse().slice(-5).map((s) => s.games);
          // Push all events of this season into aggregate buckets
          for (const ev of evs) {
            aggEvents.push({ rating_change: ev.rating_change, created_at: ev.created_at });
          }
          for (const s of allSets) aggSets.push(s);
          const roundCounts = roundsBySeason.get(snap.season_id) || { completed: 0, total: 0 };
          const plannedTotal = season?.total_rounds ?? roundCounts.total;
          return {
            season_id: snap.season_id,
            season_name: season?.name || "Temporada",
            group_id: season?.group_id || "",
            group_name: groupNameMap.get(season?.group_id) || "",
            rounds_completed: roundCounts.completed,
            rounds_total: Math.max(roundCounts.completed, plannedTotal),
            rating: Number(snap.rating),
            position: snap.position,
            matches_played: snap.matches_played,
            matches_won: snap.matches_won,
            last_change: evs[0] ? evs[0].rating_change : null,
            last_events: last5,
            last_event_at: evs[0]?.created_at || season?.updated_at || null,
            last_set_games: lastSetGames,
          };
        })
        .sort((a, b) => {
          const at = a.last_event_at ? new Date(a.last_event_at).getTime() : 0;
          const bt = b.last_event_at ? new Date(b.last_event_at).getTime() : 0;
          return bt - at;
        });

      // Build aggregate ranking option (across all seasons/groups) when the user
      // has more than one ranking. Elo = matches-weighted average; last events
      // and last sets are taken globally by recency.
      if (opts.length > 1) {
        const totalMatches = opts.reduce((acc, o) => acc + o.matches_played, 0);
        const totalWins = opts.reduce((acc, o) => acc + o.matches_won, 0);
        const weightedRating =
          totalMatches > 0
            ? opts.reduce((acc, o) => acc + o.rating * o.matches_played, 0) / totalMatches
            : opts.reduce((acc, o) => acc + o.rating, 0) / opts.length;
        aggEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        aggSets.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const lastChange = aggEvents[0]?.rating_change ?? null;
        const last3Events = aggEvents.slice(0, 5).reverse().map((e) => e.rating_change);
        const last3Sets = aggSets.slice(-5).map((s) => s.games);
        const aggregate: RankingOption = {
          season_id: ALL_RANKINGS_ID,
          season_name: "Geral",
          group_id: "",
          group_name: `${opts.length} rankings`,
          rounds_completed: 0,
          rounds_total: 0,
          rating: weightedRating,
          position: null,
          matches_played: totalMatches,
          matches_won: totalWins,
          last_change: lastChange,
          last_events: last3Events,
          last_event_at: aggEvents[0]?.created_at || null,
          last_set_games: last3Sets,
          is_aggregate: true,
        };
        opts.unshift(aggregate);
      }

      setRankings(opts);
      setSelectedSeasonId((prev) => {
        if (prev && opts.some((o) => o.season_id === prev)) return prev;
        return opts[0]?.season_id || null;
      });

      // Build per-match Elo history from rating_events (rich per-match data)
      const hist = new Map<string, { date: string; rating: number; matchIndex: number }[]>();
      for (const [sid, evs] of eventsBySeason.entries()) {
        // evs is newest-first; reverse to chronological (oldest -> newest)
        const chrono = [...evs].reverse();
        // We have rating_change per event. To rebuild rating_after we need the base rating.
        // Fetch rating_after directly from rating_events to be exact.
        const arr = chrono.map((e, i) => ({
          date: e.created_at,
          rating: 0, // placeholder, filled below
          matchIndex: i + 1,
        }));
        hist.set(sid, arr);
      }
      // Fetch rating_after for all events of this user (single query)
      const { data: ratingHist } = await supabase
        .from("rating_events")
        .select("season_id, created_at, rating_after")
        .in("season_id", seasonIds)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const histFinal = new Map<string, { date: string; rating: number; matchIndex: number }[]>();
      for (const r of ratingHist || []) {
        if (!r.season_id) continue;
        const arr = histFinal.get(r.season_id) || [];
        arr.push({ date: r.created_at, rating: Number(r.rating_after), matchIndex: arr.length + 1 });
        histFinal.set(r.season_id, arr);
      }
      setHistoryBySeason(histFinal);
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

  const handleQuickConfirm = useCallback(
    async (e: React.MouseEvent, round: UpcomingRound) => {
      e.preventDefault();
      e.stopPropagation();
      if (!user) return;
      const open = isPresenceOpen(
        { presence_open_mode: round.presence_open_mode, presence_open_time: round.presence_open_time },
        round.scheduled_date,
        round.scheduled_time,
        round.id
      );
      if (!open) {
        const openDate = getPresenceOpenDate(
          { presence_open_mode: round.presence_open_mode, presence_open_time: round.presence_open_time },
          round.scheduled_date,
          round.scheduled_time,
          round.id
        );
        toast.error("Lista ainda não aberta", {
          description: openDate ? `Abre em ${formatPresenceOpenDate(openDate)}` : undefined,
        });
        return;
      }
      // Optimistic update
      setUpcomingRounds((prev) =>
        prev.map((r) =>
          r.id === round.id
            ? {
                ...r,
                my_status: "confirmed",
                confirmed_count: r.my_status === "confirmed" ? r.confirmed_count : r.confirmed_count + 1,
                pending_count: r.my_status === "pending" ? Math.max(0, r.pending_count - 1) : r.pending_count,
              }
            : r
        )
      );
      const { error } = await supabase
        .from("round_presence")
        .upsert(
          {
            round_id: round.id,
            user_id: user.id,
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          },
          { onConflict: "round_id,user_id" }
        );
      if (error) {
        toast.error("Erro ao confirmar", { description: error.message });
        loadDashboard();
      } else {
        toast.success("Presença confirmada");
      }
    },
    [user, loadDashboard]
  );

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

  // Auth gating handled by IndexRoute wrapper; DashboardPage is only rendered
  // when the user is authenticated.

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

  // Build the "Seu próximo confronto" card JSX once — used in both mobile and desktop layouts
  const nextMatchCardJSX = (() => {
    if (!nextMatch) return null;
    const isConfirmed = nextMatch.my_presence_status === "confirmed";
    let state: 1 | 2 | 3 | 4 | 5 = 2;
    if (nextMatch.is_rivalry) state = 4;
    else if (nextMatch.has_pairing) state = 1;
    else if (!isConfirmed && !nextMatch.presence_is_open) state = 5;
    else if (!isConfirmed) state = 3;
    else state = 2;

    const formatBadge = (() => {
      if (nextMatch.match_format === "singles") {
        if (nextMatch.singles_group_type === "rivalry") return "Duelo";
        if (nextMatch.singles_group_type === "league") return "Liga";
        if (nextMatch.singles_group_type === "casual") return "Casual";
        return "1x1";
      }
      return "2x2";
    })();

    const headerLabel = state === 4 ? "Duelo" : "Seu próximo confronto";

    let titleNode: React.ReactNode;
    let subStatusNode: React.ReactNode = null;

    if (state === 1) {
      titleNode = (
        <p className="font-display text-base font-bold text-foreground leading-tight">
          <span className="text-primary">Você</span>
          {nextMatch.partner_name ? (
            <> <span className="text-muted-foreground text-xs font-medium">+ {nextMatch.partner_name}</span></>
          ) : null}
          <span className="text-muted-foreground"> vs </span>
          <span className="text-foreground">
            {nextMatch.opponent_names.length > 0 ? nextMatch.opponent_names.join(" & ") : "Adversários"}
          </span>
        </p>
      );
    } else if (state === 4) {
      const rivalryHeadline = nextMatch.has_any_completed_match
        ? "Duelo ativo"
        : "Primeiro confronto do duelo";
      titleNode = (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {rivalryHeadline}
          </p>
          {nextMatch.has_pairing ? (
            <p className="font-display text-base font-bold text-foreground leading-tight mt-0.5">
              <span className="text-primary">Você</span>
              <span className="text-muted-foreground"> vs </span>
              <span className="text-foreground">
                {nextMatch.opponent_names.length > 0 ? nextMatch.opponent_names.join(" & ") : "Adversário"}
              </span>
            </p>
          ) : (
            <p className="font-display text-base font-bold text-foreground leading-tight mt-0.5">
              Rodada {nextMatch.round_number ?? "—"}
            </p>
          )}
        </>
      );
      if (!nextMatch.has_pairing) {
        subStatusNode = (
          <p className="mt-1 text-[11px] font-medium text-warning">
            Aguardando definição do confronto
          </p>
        );
      }
    } else {
      titleNode = (
        <p className="font-display text-base font-bold text-foreground leading-tight">
          Rodada {nextMatch.round_number ?? "—"}
        </p>
      );
      if (state === 2) {
        const presenceRound = upcomingRounds.find((r) => r.id === nextMatch.round_id);
        const confirmed = presenceRound?.confirmed_count ?? 0;
        const maxPlayers = presenceRound?.max_players ?? 0;
        subStatusNode = (
          <div className="mt-1 space-y-0.5">
            <p className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <CheckCircle2 className="h-3 w-3" />
              Você confirmou presença
            </p>
            <p className="text-[11px] text-muted-foreground">
              {maxPlayers > 0
                ? `${confirmed} de ${maxPlayers} confirmados · aguardando organização`
                : `${confirmed} confirmado${confirmed === 1 ? "" : "s"} · aguardando organização`}
            </p>
          </div>
        );
      } else if (state === 3) {
        subStatusNode = (
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] font-medium text-warning">Confirmação aberta</p>
            <p className="text-[11px] text-muted-foreground">Confirme sua presença para participar</p>
          </div>
        );
      } else {
        const opensLabel = nextMatch.presence_opens_at
          ? formatPresenceOpenDate(new Date(nextMatch.presence_opens_at))
          : null;
        subStatusNode = (
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] font-medium text-muted-foreground">Confirmação ainda não aberta</p>
            {opensLabel && (
              <p className="text-[11px] text-muted-foreground">Abre {opensLabel}</p>
            )}
          </div>
        );
      }
    }

    const showRegister = state === 1;

    return (
      <>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {headerLabel}
          </h2>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            {formatBadge}
          </span>
        </div>
        <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
              <Swords className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              {titleNode}
              {subStatusNode}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <span className="font-medium">{nextMatch.group_name}</span>
                {nextMatch.scheduled_date && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-3 w-3" />
                    {formatDate(nextMatch.scheduled_date)}
                  </span>
                )}
                {nextMatch.scheduled_time && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {nextMatch.scheduled_time.slice(0, 5)}
                  </span>
                )}
                {(() => {
                  const cd = formatCountdown(nextMatch.scheduled_date, nextMatch.scheduled_time);
                  if (!cd) return null;
                  const tone = countdownTone(nextMatch.scheduled_date, nextMatch.scheduled_time);
                  const toneCls =
                    tone === "now"
                      ? "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                      : tone === "soon"
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                        : tone === "near"
                          ? "bg-warning/15 text-warning ring-1 ring-warning/30"
                          : "bg-muted text-muted-foreground ring-1 ring-border";
                  return (
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneCls}`}
                    >
                      {cd}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {state === 3 ? (
              <>
                <button
                  type="button"
                  onClick={() => handleConfirmPresence(nextMatch.round_id, nextMatch.group_name)}
                  disabled={confirmingRoundId === nextMatch.round_id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-60"
                >
                  {confirmingRoundId === nextMatch.round_id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Vou
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeclinePresence(nextMatch.round_id, nextMatch.group_name)}
                  disabled={confirmingRoundId === nextMatch.round_id}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors active:bg-destructive/10 disabled:opacity-60"
                  aria-label="Não vou"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Não vou
                </button>
                <Link
                  to="/groups/$groupId"
                  params={{ groupId: nextMatch.group_id }}
                  search={{ view: "seasons", season: nextMatch.season_id || "", round: nextMatch.round_id } as any}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors active:bg-primary/10"
                  aria-label="Ver rodada"
                >
                  <Calendar className="h-3.5 w-3.5" />
                </Link>
                {adminGroupIds.has(nextMatch.group_id) && (
                  <button
                    type="button"
                    onClick={() => setCancelRoundTarget(nextMatch)}
                    className="flex items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive transition-colors active:bg-destructive/10"
                    aria-label="Cancelar rodada"
                    title="Cancelar rodada"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : state === 2 ? (
              <>
                <Link
                  to="/groups/$groupId"
                  params={{ groupId: nextMatch.group_id }}
                  search={{ view: "seasons", season: nextMatch.season_id || "", round: nextMatch.round_id } as any}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors active:bg-primary/10"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Ver rodada
                </Link>
                {nextMatch.presence_is_open && (
                  <button
                    type="button"
                    onClick={() => handleDeclinePresence(nextMatch.round_id, nextMatch.group_name)}
                    disabled={confirmingRoundId === nextMatch.round_id}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors active:bg-destructive/10 disabled:opacity-60"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Não vou mais
                  </button>
                )}
                {adminGroupIds.has(nextMatch.group_id) && (
                  <button
                    type="button"
                    onClick={() => setCancelRoundTarget(nextMatch)}
                    className="flex items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive transition-colors active:bg-destructive/10"
                    aria-label="Cancelar rodada"
                    title="Cancelar rodada"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : (
              <>
                <Link
                  to="/groups/$groupId"
                  params={{ groupId: nextMatch.group_id }}
                  search={{ view: "seasons", season: nextMatch.season_id || "", round: nextMatch.round_id } as any}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                    showRegister
                      ? "bg-primary text-primary-foreground active:bg-primary/90"
                      : "border border-primary/30 bg-primary/5 text-primary active:bg-primary/10"
                  }`}
                >
                  {showRegister ? (
                    <>
                      <Trophy className="h-3.5 w-3.5" />
                      Registrar resultado
                    </>
                  ) : (
                    <>
                      <Calendar className="h-3.5 w-3.5" />
                      Ver rodada
                    </>
                  )}
                </Link>
                {adminGroupIds.has(nextMatch.group_id) && (
                  <button
                    type="button"
                    onClick={() => setCancelRoundTarget(nextMatch)}
                    className="flex items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive transition-colors active:bg-destructive/10"
                    aria-label="Cancelar rodada"
                    title="Cancelar rodada"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </>
    );
  })();

  const isDuplicateOfPendingMatch = Boolean(
    pendingMatch &&
    nextMatch &&
    pendingMatch.group_id === nextMatch.group_id &&
    pendingMatch.round_id === nextMatch.round_id,
  );
  const visibleNextMatchCardJSX = isDuplicateOfPendingMatch ? null : nextMatchCardJSX;

  // Other rounds (across groups) where presence window is open and the user
  // has not yet confirmed — used to render side-by-side action cards when
  // multiple groups have pending presence at the same time.
  const todayIso = new Date().toISOString().slice(0, 10);
  const extraPendingPresenceRounds = upcomingRounds
    .filter((r) => {
      if (nextMatch && r.id === nextMatch.round_id) return false;
      if (r.my_status === "confirmed") return false;
      if (r.scheduled_date && r.scheduled_date < todayIso) return false;
      const cfg = { presence_open_mode: r.presence_open_mode, presence_open_time: r.presence_open_time };
      return isPresenceOpen(cfg, r.scheduled_date, r.scheduled_time, r.id);
    })
    .sort((a, b) => {
      const dA = a.scheduled_date || "9999-12-31";
      const dB = b.scheduled_date || "9999-12-31";
      if (dA !== dB) return dA < dB ? -1 : 1;
      return (a.scheduled_time || "23:59") < (b.scheduled_time || "23:59") ? -1 : 1;
    });

  /** Compact action card for an "extra" pending-presence round. */
  const renderExtraPendingCard = (r: UpcomingRound) => {
    const isConfirming = confirmingRoundId === r.id;
    return (
      <div
        key={r.id}
        className="flex flex-col rounded-3xl border border-warning/30 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent p-4"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
            Confirmação aberta
          </span>
          {r.scheduled_date && (
            <span className="text-[10px] text-muted-foreground">
              {formatDate(r.scheduled_date)}
              {r.scheduled_time ? ` · ${r.scheduled_time.slice(0, 5)}` : ""}
            </span>
          )}
        </div>
        <p className="font-display text-sm font-bold text-foreground leading-tight truncate">
          {r.group_name}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
          Rodada {r.round_number ?? "—"} · {r.confirmed_count}
          {r.max_players ? `/${r.max_players}` : ""} confirmados
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleConfirmPresence(r.id, r.group_name)}
            disabled={isConfirming}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-60"
          >
            {isConfirming ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Vou
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleDeclinePresence(r.id, r.group_name)}
            disabled={isConfirming}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors active:bg-destructive/10 disabled:opacity-60"
          >
            <XCircle className="h-3.5 w-3.5" />
            Não vou
          </button>
        </div>
      </div>
    );
  };

  // Visible extras: at most 1 alongside the main card (so the row stays at 2
  // cards). Anything beyond becomes a "+N mais" link to the rounds list below.
  const extraVisibleCount = visibleNextMatchCardJSX ? 1 : 2;
  const extraVisible = extraPendingPresenceRounds.slice(0, extraVisibleCount);
  const extraOverflowCount = Math.max(0, extraPendingPresenceRounds.length - extraVisibleCount);

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
      {/* Header (mobile/tablet only — desktop uses global DesktopNav) */}
      <header className="lg:hidden px-5 pb-2 pt-6">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Link
              to="/profile"
              aria-label="Abrir perfil"
              className="group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-transform active:scale-95"
            >
              <PlayerAvatar
                avatarUrl={headerAvatarUrl}
                name={headerDisplayName}
                size="lg"
                className="border border-border !h-11 !w-11 transition-all duration-200 group-hover:scale-105 group-hover:border-primary group-hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.18),0_0_18px_hsl(var(--primary)/0.35)]"
              />
            </Link>
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
            {myGroups.length > 0 && (() => {
              const active = myGroups.find((g) => g.id === nextMatch?.group_id) || myGroups[0];
              return (
                <GroupSwitcherPopover
                  groups={myGroups}
                  activeGroupId={active.id}
                  activeGroupName={active.name}
                />
              );
            })()}
            <NotificationsPopover>
              <button
                aria-label={unreadCount > 0 ? `${unreadCount} notificações` : "Notificações"}
                className="relative rounded-full border border-border bg-card p-2.5 transition-colors hover:bg-accent"
              >
                <Bell className="h-4 w-4 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background tabular-nums">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </NotificationsPopover>
          </div>
        </div>
      </header>

      {/* PWA Install Banner */}
      <InstallBanner />

      {/* Push notification opt-in (discreet, dismissible for 7 days) */}
      <div className="px-5 pt-3">
        <PushOptInBanner />
      </div>

      <div className="space-y-5 px-5 pt-5 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr_auto] lg:gap-6 lg:space-y-0">
        {/* Season switcher button — above the ranking card (mobile) / between Ranking and Evolução do Elo (desktop) */}
        {/* MOBILE-ONLY: Season switcher button (above ranking card) — desktop version is integrated into Evolução do Elo header */}
        {!dataLoading && currentRanking && rankings.length > 1 && (
          <div className="relative flex animate-fade-in lg:hidden">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRankingPicker((v) => !v); }}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-all hover:border-primary/40 hover:bg-primary/5"
              aria-label="Trocar ranking de grupo/temporada"
            >
              <BarChart3 className="h-3 w-3 text-primary" />
              <span className="truncate max-w-[200px]">
                <span className="text-muted-foreground">Ranking: </span>
                <span className="font-semibold">{currentRanking.season_name}</span>
                {currentRanking.group_name ? <span className="text-muted-foreground"> · {currentRanking.group_name}</span> : null}
              </span>
              <ChevronRight className={`h-2.5 w-2.5 text-muted-foreground transition-transform ${showRankingPicker ? "-rotate-90" : "rotate-90"}`} />
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
        <section className="grid grid-cols-2 gap-3 animate-fade-in lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:self-start">
          {dataLoading ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-5 min-h-[140px] lg:min-h-0">
              <CardSpinner label="Carregando ranking" />
            </div>
          ) : currentRanking ? (
            <div className="relative flex flex-col rounded-3xl border border-primary/20 bg-primary/5 p-3 min-h-[140px] lg:min-h-0">
              <Link to="/ranking" className="flex flex-1 flex-col gap-2">
                {/* Header: label + last delta chip */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Seu Ranking
                  </p>
                  {currentRanking.last_change !== null && Math.abs(currentRanking.last_change) >= 1 && (
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        currentRanking.last_change > 0
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      }`}
                      title="Variação na última partida"
                    >
                      {currentRanking.last_change > 0 ? (
                        <TrendingUp className="h-2.5 w-2.5" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5" />
                      )}
                      {currentRanking.last_change > 0 ? "+" : ""}
                      {Math.round(currentRanking.last_change)}
                    </span>
                  )}
                </div>

                {/* Hero: Elo + position side by side */}
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-2xl font-extrabold leading-none text-foreground tabular-nums">
                    {Math.round(currentRanking.rating)}
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground">Elo</span>
                  <span className="ml-auto font-display text-base font-bold leading-none text-primary tabular-nums">
                    {ordinalSuffix(currentRanking.position)}
                  </span>
                </div>

                {/* Stats row: win rate + Últ.5 inline */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{winRate}%</span> aprov.
                  </span>
                  {currentRanking.last_events.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      {currentRanking.last_events.slice(0, 5).map((delta, i) => (
                        <span
                          key={i}
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold ${
                            delta > 0
                              ? "bg-success/15 text-success"
                              : delta < 0
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                          title={`${delta > 0 ? "+" : ""}${Math.round(delta)} Elo`}
                        >
                          {delta > 0 ? "V" : delta < 0 ? "D" : "·"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer: group + rounds */}
                {(currentRanking.group_name || currentRanking.rounds_total > 0) && (
                  <p className="mt-auto text-[9px] text-muted-foreground/60 truncate">
                    {currentRanking.group_name || ""}
                    {currentRanking.rounds_total > 0 ? ` · ${currentRanking.rounds_completed}/${currentRanking.rounds_total}` : ""}
                  </p>
                )}
              </Link>
            </div>
          ) : (
            <Link to="/ranking" className="flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-border bg-card p-5 text-foreground min-h-[140px] lg:min-h-0">
              <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-muted-foreground">Seu Ranking</span>
              <span className="text-[10px] text-muted-foreground/60">Jogue para aparecer</span>
            </Link>
          )}
          <div className="flex flex-col gap-2">
            <Link to="/groups" className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground transition-transform active:scale-[0.97]">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="text-xs font-semibold">Criar / Entrar em grupo</span>
            </Link>
            <button
              type="button"
              onClick={() => setCasualDialogOpen(true)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-primary transition-transform active:scale-[0.97]"
            >
              <Swords className="h-4 w-4" strokeWidth={2.5} />
              <span className="text-xs font-semibold">Registrar partida avulsa</span>
            </button>
            <Link to="/partidas-avulsas" className="text-center text-[10px] text-muted-foreground/70 hover:text-foreground">
              Ver minhas partidas avulsas →
            </Link>
          </div>
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

        {/* DESKTOP-ONLY: Right column = Últimos Resultados + Próximas Rodadas stacked */}
        <section className="hidden lg:flex lg:flex-col lg:gap-6 lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:row-span-2">
          {/* Últimos Resultados card */}
          <div className="flex flex-col rounded-3xl border border-border bg-card overflow-hidden">
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
              <div className="flex items-center gap-3">
                <Link
                  to="/ranking-info"
                  aria-label="Entenda a pontuação"
                  title="Entenda a pontuação"
                  className="hidden lg:inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </Link>
                <Link to="/history" className="flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary/80">
                  Histórico <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
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
              <div>
                {recentMatches.slice(0, 5).map((m, idx, arr) => {
                  const won = m.winner_team === m.my_team;
                  const prev = idx > 0 ? arr[idx - 1] : null;
                  const next = idx < arr.length - 1 ? arr[idx + 1] : null;
                  const sameAsPrev = prev && prev.round_id && prev.round_id === m.round_id;
                  const sameAsNext = next && next.round_id && next.round_id === m.round_id;
                  const isFirstOfGroup = !sameAsPrev;
                  const isLastOfGroup = !sameAsNext;
                  // Per-set wins from score string ("6-4 / 7-5"): I am team A unless my_team === "B"
                  const setsRaw = m.score_display === "—" ? [] : m.score_display.split(" / ");
                  const setOutcomes = setsRaw.map((s) => {
                    const [a, b] = s.split("-").map((n) => parseInt(n, 10));
                    if (isNaN(a) || isNaN(b)) return null;
                    const myScore = m.my_team === "B" ? b : a;
                    const oppScore = m.my_team === "B" ? a : b;
                    return myScore > oppScore;
                  });
                  const setsWon = setOutcomes.filter((s) => s === true).length;
                  const setsLost = setOutcomes.filter((s) => s === false).length;

                  const canLink = !!(m.round_id && m.group_id && m.season_id);
                  const RowTag: any = canLink ? Link : "div";
                  const rowProps: any = canLink
                    ? {
                        to: "/groups/$groupId",
                        params: { groupId: m.group_id! },
                        search: { view: "seasons", season: m.season_id!, round: m.round_id! },
                        title: m.round_number != null ? `Abrir rodada ${m.round_number}` : "Abrir rodada",
                      }
                    : {};

                  const myShort = (nickname?.trim() || displayName?.trim() || "Você").split(/\s+/)[0];
                  const myTeamNames = m.partner_name ? `${myShort} & ${m.partner_name}` : myShort;
                  const oppTeamNames = m.opponent_names.join(" & ");
                  const winnerClass = "text-primary [text-shadow:0_0_10px_color-mix(in_oklab,var(--primary)_60%,transparent)]";
                  const loserClass = "text-muted-foreground/60";

                  return (
                    <RowTag
                      key={m.id}
                      {...rowProps}
                      className={`group/row relative grid items-center gap-3 px-4 py-1 transition-colors ${
                        canLink ? "cursor-pointer hover:bg-accent/40" : ""
                      } ${isFirstOfGroup && idx > 0 ? "border-t border-border/50" : ""}`}
                      style={{
                        // Fixed columns so "vs" lands at the exact center of the row.
                        // [date | score | myTeam → vs ← oppTeam | group/round | elo]
                        gridTemplateColumns:
                          "56px 72px minmax(0,1fr) auto minmax(0,1fr) 150px 56px",
                      }}
                    >
                      {/* Same-round connector (left edge) */}
                      {sameAsPrev || sameAsNext ? (
                        <span
                          aria-hidden
                          className={`absolute left-0 w-[2px] bg-primary/25 ${
                            isFirstOfGroup ? "top-1/2 bottom-0" : isLastOfGroup ? "top-0 bottom-1/2" : "inset-y-0"
                          }`}
                        />
                      ) : null}

                      {/* Date with colored bar (V/D indicator) */}
                      <div className="flex items-stretch gap-2 self-stretch">
                        <div
                          className={`w-1 rounded-full ${won ? "bg-success" : "bg-destructive"}`}
                          aria-label={won ? "Vitória" : "Derrota"}
                        />
                        <div className="flex flex-col justify-center min-w-0">
                          {isFirstOfGroup ? (
                            <>
                              <p className="font-display text-base font-bold leading-none text-foreground tabular-nums">
                                {(() => { const d = new Date(m.match_date + (m.match_date.length === 10 ? "T12:00:00" : "")); return d.getDate().toString().padStart(2, "0"); })()}
                              </p>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
                                {(() => { const d = new Date(m.match_date + (m.match_date.length === 10 ? "T12:00:00" : "")); return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); })()}
                              </p>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50 leading-none">↳</span>
                          )}
                        </div>
                      </div>

                      {/* Score + match number */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="font-display text-base font-bold text-foreground tabular-nums">
                          {m.score_display}
                        </p>
                        {m.match_number != null && (
                          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            #{m.match_number}
                          </span>
                        )}
                      </div>

                      {/* My team — right-aligned, abuts the centered "vs" */}
                      <div className="min-w-0 text-right">
                        <p className={`text-sm truncate ${won ? winnerClass : loserClass}`}>
                          {myTeamNames}
                        </p>
                      </div>

                      {/* "vs" — fixed center column */}
                      <div className="px-2 text-sm text-muted-foreground select-none">
                        vs
                      </div>

                      {/* Opponent team — left-aligned, abuts the centered "vs" */}
                      <div className="min-w-0 text-left">
                        <p className={`text-sm truncate ${!won ? winnerClass : loserClass}`}>
                          {oppTeamNames}
                        </p>
                      </div>

                      {/* Group + Round — fixed column so it never displaces "vs" */}
                      <div className="text-right min-w-0">
                        {isFirstOfGroup ? (
                          <>
                            {m.group_name && (
                              <p className="text-[11px] font-semibold text-foreground/80 truncate">{m.group_name}</p>
                            )}
                            {m.round_number != null && (
                              <p className="text-[10px] text-muted-foreground inline-flex items-center justify-end gap-0.5">
                                Rodada {m.round_number}
                                {canLink && (
                                  <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover/row:opacity-100" />
                                )}
                              </p>
                            )}
                          </>
                        ) : null}
                      </div>

                      {/* Elo delta — fixed column */}
                      <div className="text-right min-w-0">
                        {m.rating_change !== null ? (
                          <>
                            <p className={`font-display text-base font-bold tabular-nums leading-none ${
                              m.rating_change > 0 ? "text-success" : m.rating_change < 0 ? "text-destructive" : "text-muted-foreground"
                            }`}>
                              {m.rating_change > 0 ? "+" : ""}{Math.round(m.rating_change)}
                            </p>
                            <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/70 leading-none">Elo</p>
                          </>
                        ) : null}
                      </div>
                    </RowTag>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seu próximo confronto + Atalhos rápidos — desktop, side-by-side on the same row */}
          {(nextMatchCardJSX || true) && (
            <div className="flex flex-row gap-4">
              {visibleNextMatchCardJSX ? (
                <div className="flex-1 min-w-0">{visibleNextMatchCardJSX}</div>
              ) : !isDuplicateOfPendingMatch && extraVisible.length === 0 ? (
                <div className="flex-1 min-w-0 flex items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 p-6">
                  <p className="text-xs text-muted-foreground">Nenhum confronto próximo agendado</p>
                </div>
              ) : (
                null
              )}
              {extraVisible.map((r) => (
                <div key={r.id} className="flex-1 min-w-0">{renderExtraPendingCard(r)}</div>
              ))}
              {extraOverflowCount > 0 && (
                <Link
                  to="/seasons"
                  className="flex w-[120px] shrink-0 flex-col items-center justify-center gap-1 rounded-3xl border border-dashed border-border bg-card/50 p-4 text-center transition-colors hover:bg-accent/30"
                >
                  <Bell className="h-4 w-4 text-warning" />
                  <span className="text-xs font-semibold text-foreground">+{extraOverflowCount} mais</span>
                  <span className="text-[10px] text-muted-foreground">Ver todas</span>
                </Link>
              )}
              <div className="w-[260px] shrink-0">
                <div className="rounded-3xl border border-border bg-card p-4 h-full">
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Atalhos rápidos
                  </h2>
                  <div className="flex flex-col gap-1.5">
                    {(() => {
                      const rivalryGroup = myGroups.find((g: any) => g.singles_group_type === "rivalry");
                      const adminGroup = myGroups.find(
                        (g: any) => g.my_role === "admin" || g.my_role === "creator"
                      );

                      type Shortcut = {
                        key: string;
                        node: React.ReactNode;
                        priority: number; // lower = higher priority
                      };
                      const items: Shortcut[] = [];

                      // 1. Confirmar presença (urgente, contextual) — inline confirm, no navigation
                      if (nextMatch && nextMatch.my_presence_status !== "confirmed" && nextMatch.presence_is_open) {
                        const isConfirming = confirmingRoundId === nextMatch.round_id;
                        items.push({
                          key: "confirm",
                          priority: 1,
                          node: (
                            <button
                              type="button"
                              onClick={() => handleConfirmPresence(nextMatch.round_id, nextMatch.group_name)}
                              disabled={isConfirming}
                              className="flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs font-semibold text-warning transition-colors hover:bg-warning/10 disabled:opacity-60"
                            >
                              {isConfirming ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 shrink-0" />
                              )}
                              <span className="truncate">{isConfirming ? "Confirmando..." : "Confirmar presença"}</span>
                            </button>
                          ),
                        });
                      }

                      // 2. Registrar resultado (urgente)
                      if (nextMatch?.has_pairing || pendingMatch) {
                        items.push({
                          key: "result",
                          priority: 2,
                          node: (
                            <Link
                              to="/groups/$groupId"
                              params={{ groupId: pendingMatch?.group_id || nextMatch!.group_id }}
                              search={{ view: "seasons", season: pendingMatch?.season_id || nextMatch?.season_id || "", round: pendingMatch?.round_id || nextMatch!.round_id } as any}
                              className="flex items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                              <Trophy className="h-4 w-4 shrink-0" />
                              <span className="truncate">Registrar resultado</span>
                            </Link>
                          ),
                        });
                      }

                      // 3. Notificações com badge
                      if (unreadCount > 0) {
                        items.push({
                          key: "notif",
                          priority: 3,
                          node: (
                            <Link
                              to="/notifications"
                              className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <Bell className="h-4 w-4 shrink-0" />
                              <span className="flex-1 truncate text-left">Notificações</span>
                              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground tabular-nums">
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </span>
                            </Link>
                          ),
                        });
                      }

                      // 4. Ver duelo — principal dos atalhos persistentes (destaque sutil)
                      if (rivalryGroup) {
                        items.push({
                          key: "duel",
                          priority: 4,
                          node: (
                            <Link
                              to="/groups/$groupId/duel"
                              params={{ groupId: rivalryGroup.id }}
                              className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                              <Swords className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate">Ver duelo</span>
                            </Link>
                          ),
                        });
                      }

                      // Atalhos de navegação profunda (preenchimento)
                      if (currentRanking) {
                        items.push({
                          key: "ranking",
                          priority: 5,
                          node: (
                            <Link
                              to="/ranking"
                              className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/50"
                            >
                              <Crown className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate">Ranking completo</span>
                            </Link>
                          ),
                        });
                      }

                      if (currentRanking?.season_id && currentRanking.group_id) {
                        items.push({
                          key: "season",
                          priority: 6,
                          node: (
                            <Link
                              to="/groups/$groupId/seasons/$seasonId"
                              params={{
                                groupId: currentRanking.group_id,
                                seasonId: currentRanking.season_id,
                              }}
                              className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/50"
                            >
                              <Medal className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate">Temporada atual</span>
                            </Link>
                          ),
                        });
                      }

                      items.push({
                        key: "history",
                        priority: 7,
                        node: (
                          <Link
                            to="/history"
                            className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/50"
                          >
                            <History className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate">Histórico de partidas</span>
                          </Link>
                        ),
                      });

                      if (adminGroup) {
                        items.push({
                          key: "manage",
                          priority: 8,
                          node: (
                            <Link
                              to="/groups/$groupId"
                              params={{ groupId: adminGroup.id }}
                              className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/50"
                            >
                              <Settings className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate">Gerenciar grupo</span>
                            </Link>
                          ),
                        });
                      }

                      items.push({
                        key: "help",
                        priority: 9,
                        node: (
                          <Link
                            to="/ranking-info"
                            className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/50"
                          >
                            <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">Como funciona o Elo</span>
                          </Link>
                        ),
                      });

                      const visible = items.sort((a, b) => a.priority - b.priority).slice(0, 4);
                      return visible.map((item) => <div key={item.key}>{item.node}</div>);
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Próximas Rodadas card (desktop) */}
          <div className="flex flex-1 flex-col rounded-3xl border border-border bg-card overflow-hidden">
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

            {dataLoading ? (
              <div className="flex flex-col items-center justify-center p-6 min-h-[120px]">
                <CardSpinner label="Carregando rodadas" />
              </div>
            ) : upcomingRounds.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Calendar className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma rodada agendada</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {upcomingRounds.slice(0, 5).map((r) => {
                  const today = new Date().toISOString().split("T")[0];
                  const smartStatus = r.status === "in_progress"
                    ? "in_progress"
                    : r.status === "scheduled" && r.scheduled_date && r.scheduled_date <= today
                    ? "pending_result"
                    : "scheduled";
                  const statusLabel = smartStatus === "in_progress" ? "Em andamento" : smartStatus === "pending_result" ? "Aguardando" : "Agendada";
                  const statusCls = smartStatus === "in_progress" ? "bg-warning/15 text-warning" : smartStatus === "pending_result" ? "bg-warning/15 text-warning" : "bg-info/15 text-info";
                  const fillPct = r.max_players > 0 ? Math.min(100, (r.confirmed_count / r.max_players) * 100) : 0;
                  const isFull = r.confirmed_count >= r.max_players;
                  // Days until round
                  let daysUntil: number | null = null;
                  if (r.scheduled_date) {
                    const todayD = new Date();
                    todayD.setHours(0, 0, 0, 0);
                    const sched = new Date(r.scheduled_date + "T00:00:00");
                    daysUntil = Math.round((sched.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
                  }
                  const dayBadge = daysUntil === 0 ? "Hoje" : daysUntil === 1 ? "Amanhã" : daysUntil != null && daysUntil > 1 ? `em ${daysUntil}d` : null;
                  // Presence list opening
                  const presenceCfg = { presence_open_mode: r.presence_open_mode, presence_open_time: r.presence_open_time };
                  const open = isPresenceOpen(presenceCfg, r.scheduled_date, r.scheduled_time, r.id);
                  const openDate = !open ? getPresenceOpenDate(presenceCfg, r.scheduled_date, r.scheduled_time, r.id) : null;
                  const canQuickConfirm = r.my_status !== "confirmed" && r.status === "scheduled" && open && !isFull;
                  return (
                    <Link
                      key={r.id}
                      to="/groups/$groupId"
                      params={{ groupId: r.group_id }}
                      search={{ view: "seasons", season: r.season_id || "", round: r.id } as any}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                        r.status === "in_progress" ? "bg-warning/15 ring-warning/30" : "bg-primary/10 ring-primary/20"
                      }`}>
                        {r.status === "in_progress" ? (
                          <Swords className="h-4 w-4 text-warning" />
                        ) : (
                          <span className="font-display text-sm font-bold text-primary tabular-nums">
                            {r.round_number ?? "—"}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">
                            {r.group_name}
                          </p>
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusCls}`}>
                            {statusLabel}
                          </span>
                          {dayBadge && (
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                              daysUntil === 0 ? "bg-primary/15 text-primary" : daysUntil === 1 ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
                            }`}>
                              {dayBadge}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-x-2.5 text-[11px] text-muted-foreground">
                          {r.season_name && <span className="truncate max-w-[140px] font-medium text-foreground/70">{r.season_name}</span>}
                          {r.scheduled_date && (
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-3 w-3" />
                              {formatDate(r.scheduled_date)}
                            </span>
                          )}
                          {r.scheduled_time && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {r.scheduled_time.slice(0, 5)}
                            </span>
                          )}
                          {r.location && (
                            <span className="flex items-center gap-0.5 truncate max-w-[140px]">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{r.location}</span>
                            </span>
                          )}
                        </div>
                        {/* Presence breakdown */}
                        <div className="mt-1 flex items-center gap-2 text-[10px]">
                          <span className="flex items-center gap-1 text-success">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                            {r.confirmed_count} conf.
                          </span>
                          {r.pending_count > 0 && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                              {r.pending_count} pend.
                            </span>
                          )}
                          {r.declined_count > 0 && (
                            <span className="flex items-center gap-1 text-destructive/80">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive/60" />
                              {r.declined_count} fora
                            </span>
                          )}
                          {r.waiting_count > 0 && (
                            <span className="flex items-center gap-1 text-warning">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
                              {r.waiting_count} fila
                            </span>
                          )}
                          {!open && openDate && (
                            <span className="text-muted-foreground/70 truncate">
                              · Lista abre {formatPresenceOpenDate(openDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick confirm button */}
                      {canQuickConfirm && (
                        <button
                          onClick={(e) => handleQuickConfirm(e, r)}
                          className="hidden xl:flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
                        >
                          ✓ Confirmar
                        </button>
                      )}

                      <div className="shrink-0 flex flex-col items-end gap-1 min-w-[72px]">
                        <p className="font-display text-sm font-bold text-foreground tabular-nums leading-none">
                          {r.confirmed_count}/{r.max_players}
                        </p>
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${fillPct >= 100 ? "bg-success" : fillPct >= 50 ? "bg-primary" : "bg-warning"}`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        {r.my_status === "confirmed" ? (
                          <p className="text-[10px] font-semibold text-success leading-none">✓ Confirmado</p>
                        ) : r.my_status === "declined" ? (
                          <p className="text-[10px] font-semibold text-destructive/80 leading-none">Não vou</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground leading-none">Pendente</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Atalhos rápidos foi movido para a mesma linha do "Seu próximo confronto" acima */}

        {/* DESKTOP-ONLY: Card de Evolução do Elo (col esquerda, abaixo do seletor de ranking) */}
        <section className="hidden lg:block lg:col-span-4 lg:col-start-1 lg:row-start-2">
          {(() => {
            const history = currentRanking ? historyBySeason.get(currentRanking.season_id) || [] : [];
            const ratingPoints = history.map((h) => ({ label: h.date, value: h.rating }));
            const lastRating = ratingPoints[ratingPoints.length - 1]?.value;
            const firstRating = ratingPoints[0]?.value;
            // Delta = variação acumulada na temporada (atual − inicial)
            const ratingDelta =
              firstRating != null && lastRating != null && ratingPoints.length > 1
                ? lastRating - firstRating
                : null;
            const minRating = ratingPoints.length ? Math.min(...ratingPoints.map((p) => p.value)) : null;
            const maxRating = ratingPoints.length ? Math.max(...ratingPoints.map((p) => p.value)) : null;
            const currentPos = currentRanking?.position ?? null;
            return (
              <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-5">
                {/* Header */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Evolução do Elo
                  </h2>
                  <Link to="/ranking" className="flex items-center gap-0.5 text-xs font-medium text-primary shrink-0 hover:text-primary/80">
                    Detalhes <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Season/Group selector — prominent, clearly interactive */}
                {currentRanking && (
                  <div className="mb-4">
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      Temporada exibida
                    </label>
                    {rankings.length > 1 ? (
                      <div className="relative">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRankingPicker((v) => !v); }}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50"
                          aria-label="Trocar grupo/temporada"
                          aria-expanded={showRankingPicker}
                          aria-haspopup="listbox"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold">{currentRanking.group_name}</span>
                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                            <span className="text-muted-foreground">{currentRanking.season_name}</span>
                          </span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showRankingPicker ? "rotate-180" : ""}`} />
                        </button>
                        {showRankingPicker && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setShowRankingPicker(false)}
                              aria-hidden
                            />
                            <div
                              role="listbox"
                              className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
                            >
                              {rankings.map((r) => {
                                const isActive = r.season_id === currentRanking.season_id;
                                return (
                                  <button
                                    key={r.season_id}
                                    role="option"
                                    aria-selected={isActive}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedSeasonId(r.season_id);
                                      setShowRankingPicker(false);
                                    }}
                                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                                      isActive ? "bg-primary/15 text-primary font-semibold" : "text-foreground hover:bg-accent/50"
                                    }`}
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      <span className="font-medium">{r.group_name}</span>
                                      <span className="mx-1 text-muted-foreground/60">·</span>
                                      <span className={isActive ? "" : "text-muted-foreground"}>{r.season_name}</span>
                                    </span>
                                    <span className="shrink-0 text-[10px] font-semibold tabular-nums">{ordinalSuffix(r.position)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold text-foreground">{currentRanking.group_name}</span>
                          <span className="mx-1.5 text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">{currentRanking.season_name}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* KPIs */}
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Elo Atual
                    </p>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="font-display text-xl font-bold text-foreground">
                        {lastRating != null ? Math.round(lastRating) : "—"}
                      </span>
                      {ratingDelta != null && Math.abs(ratingDelta) >= 1 && (
                        <span
                          title="Variação acumulada na temporada (Elo atual − Elo inicial)"
                          className={`flex items-center gap-0.5 text-[10px] font-semibold ${
                            ratingDelta > 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {ratingDelta > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {ratingDelta > 0 ? "+" : ""}
                          {Math.round(ratingDelta)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[9px] text-muted-foreground/70">
                      vs. início da temporada
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pico
                    </p>
                    <p className="mt-0.5 font-display text-xl font-bold text-foreground">
                      {maxRating != null ? Math.round(maxRating) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Posição
                    </p>
                    <p className="mt-0.5 font-display text-xl font-bold text-foreground">
                      {currentPos != null ? `${currentPos}º` : "—"}
                    </p>
                  </div>
                </div>

                {/* Chart */}
                <div className="flex flex-1 flex-col">
                  {currentRanking?.is_aggregate ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center">
                      <BarChart3 className="mb-2 h-8 w-8 text-muted-foreground/40" />
                      <p className="text-xs font-semibold text-foreground">Visão geral combinada</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Selecione uma temporada específica para ver a evolução do Elo.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{ratingPoints.length > 0 ? `${ratingPoints.length} partidas` : ""}</span>
                        {minRating != null && maxRating != null && (
                          <span className="font-mono">
                            {Math.round(minRating)} – {Math.round(maxRating)}
                          </span>
                        )}
                      </div>
                      <div className="h-[280px] max-h-[360px] flex-1">
                        <EloEvolutionChart
                          points={history.map((h) => ({ date: h.date, rating: h.rating }))}
                          color="#84cc16"
                          height={280}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </section>

        {/* Seu próximo confronto — mobile/tablet only (desktop version is rendered inside the right column above) */}
        {(visibleNextMatchCardJSX || extraVisible.length > 0) && (
          <section className="lg:hidden space-y-3">
            {visibleNextMatchCardJSX}
            {extraVisible.length > 0 && (
              <div className={`grid gap-3 ${extraVisible.length === 1 && !visibleNextMatchCardJSX ? "grid-cols-1" : "grid-cols-2"}`}>
                {extraVisible.map((r) => renderExtraPendingCard(r))}
              </div>
            )}
            {extraOverflowCount > 0 && (
              <Link
                to="/seasons"
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/50 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/30"
              >
                <Bell className="h-3.5 w-3.5 text-warning" />
                +{extraOverflowCount} {extraOverflowCount === 1 ? "outra rodada" : "outras rodadas"} aguardando confirmação
              </Link>
            )}
          </section>
        )}

        {/* Últimos Resultados (mobile/tablet only — denso, vem antes de Próximas Rodadas) */}
        <section className="lg:hidden">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Últimos Resultados
              </h2>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground/70">
                Toque em um resultado para ver a rodada
              </p>
            </div>
            <Link to="/history" className="flex items-center gap-0.5 text-xs font-medium text-primary">
              Histórico <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {dataLoading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-4 min-h-[100px]">
              <CardSpinner label="Carregando resultados" />
            </div>
          ) : recentMatches.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <Swords className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhuma partida ainda</p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border/60 shadow-sm">
              {recentMatches.slice(0, 3).map((m) => {
                const won = m.winner_team === m.my_team;
                const winnerLabel = won
                  ? m.partner_name
                    ? `Você e ${m.partner_name} venceram`
                    : "Você venceu"
                  : m.opponent_names.length >= 2
                    ? `${m.opponent_names[0]} e ${m.opponent_names[1]} venceram`
                    : `${m.opponent_names[0] || "Adversário"} venceu`;
                const canLink = !!(m.round_id && m.group_id && m.season_id);
                const RowTag: any = canLink ? Link : "div";
                const rowProps: any = canLink
                  ? {
                      to: "/groups/$groupId",
                      params: { groupId: m.group_id! },
                      search: { view: "seasons", season: m.season_id!, round: m.round_id! },
                      role: "button",
                      "aria-label": `Ver rodada ${m.round_number ?? ""} — ${winnerLabel}`,
                    }
                  : {};
                return (
                  <RowTag
                    key={m.id}
                    {...rowProps}
                    className={`group relative flex items-stretch gap-2.5 px-2.5 py-2 ${canLink ? "cursor-pointer active:bg-accent/50 transition-colors" : ""}`}
                  >
                    {/* Result accent bar */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r ${
                        won ? "bg-success" : "bg-destructive"
                      }`}
                    />

                    {/* V/D badge */}
                    <div
                      className={`ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ring-1 ${
                        won
                          ? "bg-success/15 text-success ring-success/25"
                          : "bg-destructive/15 text-destructive ring-destructive/25"
                      }`}
                    >
                      {won ? "V" : "D"}
                    </div>

                    <div className="min-w-0 flex-1 self-center">
                      <div className="flex items-baseline gap-1.5">
                        <p className="font-display text-[14px] font-bold text-foreground tabular-nums leading-tight">
                          {m.score_display}
                        </p>
                        <p className={`truncate text-[10.5px] font-semibold leading-tight ${won ? "text-success" : "text-foreground/85"}`}>
                          {winnerLabel}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
                        {m.group_name ? `${m.group_name} · ` : ""}{m.round_number ? `Rodada ${m.round_number}` : `Partida ${m.match_number ?? "?"}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 self-center">
                      {m.rating_change !== null && (
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${
                            m.rating_change > 0
                              ? "bg-success/15 text-success"
                              : m.rating_change < 0
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {m.rating_change > 0 ? (
                            <TrendingUp className="h-2.5 w-2.5" />
                          ) : m.rating_change < 0 ? (
                            <TrendingDown className="h-2.5 w-2.5" />
                          ) : (
                            <Minus className="h-2.5 w-2.5" />
                          )}
                          {m.rating_change > 0 ? "+" : ""}{Math.round(m.rating_change)}
                        </span>
                      )}
                      {canLink && (
                        <ChevronRight
                          aria-hidden
                          className="h-4 w-4 text-muted-foreground/60 transition-transform group-active:translate-x-0.5"
                        />
                      )}
                    </div>
                  </RowTag>
                );
              })}
            </div>
          )}
        </section>

        {/* Próximas Rodadas (mobile/tablet only — desktop version is inside the right column wrapper above) */}
        <section className="lg:hidden">
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
              <div className="space-y-1.5 lg:hidden">
                {upcomingRounds.slice(0, 3).map((r) => (
                  <Link
                    key={r.id}
                    to="/groups/$groupId"
                    params={{ groupId: r.group_id }}
                    search={{ view: "seasons", season: r.season_id || "", round: r.id } as any}
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
            </>
          )}
        </section>

        {/* Meus Grupos */}
        <section className="lg:col-span-12 lg:col-start-1 lg:row-start-3">
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
              {(() => {
                // Build map: group_id → earliest future scheduled round (date+time)
                const nextRoundByGroup = new Map<string, { date: string | null; time: string | null }>();
                for (const r of upcomingRounds) {
                  if (!r.scheduled_date) continue;
                  const cd = formatCountdown(r.scheduled_date, r.scheduled_time);
                  if (!cd) continue; // skip past
                  const existing = nextRoundByGroup.get(r.group_id);
                  if (!existing) {
                    nextRoundByGroup.set(r.group_id, { date: r.scheduled_date, time: r.scheduled_time });
                  }
                }
                return myGroups.slice(0, 4).map((g) => {
                  const stats = groupStats.get(g.id) || { seasons: 0, rounds_completed: 0, rounds_total: 0 };
                  const remaining = Math.max(0, stats.rounds_total - stats.rounds_completed);
                  const nextRound = nextRoundByGroup.get(g.id);
                  const cd = nextRound ? formatCountdown(nextRound.date, nextRound.time) : null;
                  const tone = nextRound ? countdownTone(nextRound.date, nextRound.time) : null;
                  const cdCls =
                    tone === "now"
                      ? "bg-destructive/85 text-destructive-foreground"
                      : tone === "soon"
                        ? "bg-primary/85 text-primary-foreground"
                        : tone === "near"
                          ? "bg-warning/80 text-warning-foreground"
                          : "bg-black/55 text-white/95";
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

                      {/* Top: countdown badge (left) + privacy badge (right) */}
                      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
                        {cd ? (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm ${cdCls}`}
                          >
                            <Clock className="h-2.5 w-2.5" />
                            {cd}
                          </span>
                        ) : (
                          <span />
                        )}
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
                });
              })()}
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

      {cancelRoundTarget && (
        <CancelRoundDialog
          open={!!cancelRoundTarget}
          onOpenChange={(open) => { if (!open) setCancelRoundTarget(null); }}
          roundId={cancelRoundTarget.round_id}
          roundNumber={cancelRoundTarget.round_number}
          scheduledDate={cancelRoundTarget.scheduled_date}
          groupName={cancelRoundTarget.group_name}
          onCancelled={() => {
            setCancelRoundTarget(null);
            loadDashboard();
          }}
        />
      )}

      <CasualMatchDialog
        open={casualDialogOpen}
        onOpenChange={setCasualDialogOpen}
        onSaved={() => loadDashboard()}
      />
    </div>
  );
}
