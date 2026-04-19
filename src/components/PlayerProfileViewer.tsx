/**
 * Global player profile viewer:
 *  - <PlayerProfileViewerProvider> wraps the app
 *  - useViewPlayerProfile() returns openProfile(userId)
 *  - Renders a global Drawer with quick stats + "Ver perfil completo" deep link
 *
 * UX rule (locked with the user):
 *  - Avatar is ALWAYS clickable (use <PlayerAvatarLink>)
 *  - Name is clickable only where it doesn't conflict with another action
 *    (use <PlayerNameLink>); inside expand-rows etc., wrap only the avatar.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Flame,
  AtSign,
  ExternalLink,
  Users,
  Swords,
} from "lucide-react";
import { abbreviateName } from "@/lib/utils";
import { loadH2HBetween, type H2HResult } from "@/lib/h2h";

type ViewerContextValue = {
  openProfile: (userId: string) => void;
};

const ViewerContext = createContext<ViewerContextValue>({
  openProfile: () => {},
});

interface QuickProfile {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  instagram_handle: string | null;
  privacy: PrivacySettings;
}

export interface PrivacySettings {
  show_personal: boolean;
  show_stats: boolean;
  show_groups: boolean;
  show_achievements: boolean;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  show_personal: true,
  show_stats: true,
  show_groups: true,
  show_achievements: true,
};

export function parsePrivacy(raw: unknown): PrivacySettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PRIVACY };
  const r = raw as Record<string, unknown>;
  return {
    show_personal: r.show_personal !== false,
    show_stats: r.show_stats !== false,
    show_groups: r.show_groups !== false,
    show_achievements: r.show_achievements !== false,
  };
}

interface QuickStats {
  currentElo: number | null;
  bestPosition: { pos: number; group: string } | null;
  matches: number;
  wins: number;
  trend: number; // delta over last ~10 events
  last5: string[]; // 'W' | 'L'
  sharedGroups: number;
}

export function PlayerProfileViewerProvider({ children }: { children: ReactNode }) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const openProfile = useCallback((userId: string) => {
    if (!userId) return;
    setOpenUserId(userId);
  }, []);

  const ctx = useMemo(() => ({ openProfile }), [openProfile]);

  return (
    <ViewerContext.Provider value={ctx}>
      {children}
      <PlayerProfileDrawer
        userId={openUserId}
        onClose={() => setOpenUserId(null)}
      />
    </ViewerContext.Provider>
  );
}

export function useViewPlayerProfile() {
  return useContext(ViewerContext).openProfile;
}

// ---------- Drawer ----------

function PlayerProfileDrawer({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<QuickProfile | null>(null);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setProfile(null);
      setStats(null);
      return;
    }
    setLoading(true);

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!cancelled) setMeId(auth.user?.id ?? null);

      // Profile
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url, instagram_handle, privacy_settings")
        .eq("user_id", userId)
        .maybeSingle();

      if (!cancelled && prof) {
        setProfile({
          user_id: prof.user_id,
          name: prof.name,
          nickname: prof.nickname,
          avatar_url: prof.avatar_url,
          instagram_handle: prof.instagram_handle,
          privacy: parsePrivacy(prof.privacy_settings),
        });
      }

      // Quick stats — best snapshot, current rating, last 5
      const [snapsRes, eventsRes, mySharedRes] = await Promise.all([
        supabase
          .from("ranking_snapshots")
          .select("rating, position, season_id")
          .eq("user_id", userId)
          .order("snapshot_date", { ascending: false })
          .limit(50),
        supabase
          .from("rating_events")
          .select("rating_after, rating_change, actual_score, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(15),
        auth.user?.id
          ? supabase
              .from("group_members")
              .select("group_id")
              .eq("user_id", auth.user.id)
              .eq("status", "active")
          : Promise.resolve({ data: [] as { group_id: string }[] }),
      ]);

      const snaps = snapsRes.data ?? [];
      const events = (eventsRes.data ?? []).slice().reverse(); // oldest -> newest
      const currentElo = events.length
        ? events[events.length - 1].rating_after
        : (snaps[0]?.rating ?? null);

      // Best position across snapshots
      let best: { pos: number; group: string } | null = null;
      const snapWithPos = snaps.filter((s) => s.position && s.position > 0);
      if (snapWithPos.length) {
        const seasonIds = Array.from(new Set(snapWithPos.map((s) => s.season_id)));
        const { data: seasonRows } = await supabase
          .from("seasons")
          .select("id, name, group_id, groups:group_id(name)")
          .in("id", seasonIds);
        const seasonMap = new Map<string, string>();
        for (const s of seasonRows ?? []) {
          const grpName = (s as any).groups?.name ?? "Grupo";
          seasonMap.set(s.id, grpName);
        }
        const topSnap = snapWithPos.reduce((acc, cur) =>
          (cur.position! < acc.position!) ? cur : acc,
        );
        best = {
          pos: topSnap.position!,
          group: seasonMap.get(topSnap.season_id) ?? "Grupo",
        };
      }

      // Trend = last 10 events delta
      const recent = events.slice(-10);
      const trend = recent.reduce((acc, e) => acc + (e.rating_change ?? 0), 0);
      const last5 = events
        .slice(-5)
        .reverse()
        .map((e) => ((e.actual_score ?? 0) >= 0.5 ? "W" : "L"));

      // matches / wins from latest snapshot row aggregated
      const { data: agg } = await supabase
        .from("ranking_snapshots")
        .select("matches_played, matches_won")
        .eq("user_id", userId);
      const matches = (agg ?? []).reduce((a, r) => a + (r.matches_played ?? 0), 0);
      const wins = (agg ?? []).reduce((a, r) => a + (r.matches_won ?? 0), 0);

      // Shared groups (only if we know who I am)
      let sharedGroups = 0;
      const myGroupIds = (mySharedRes.data ?? []).map((r) => r.group_id);
      if (myGroupIds.length && auth.user?.id && auth.user.id !== userId) {
        const { data: theirs } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .in("group_id", myGroupIds);
        sharedGroups = theirs?.length ?? 0;
      }

      if (!cancelled) {
        setStats({
          currentElo,
          bestPosition: best,
          matches,
          wins,
          trend: Math.round(trend),
          last5,
          sharedGroups,
        });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isMe = meId && userId && meId === userId;
  const open = !!userId;

  const handleViewFull = () => {
    if (!userId) return;
    onClose();
    if (isMe) {
      navigate({ to: "/profile" });
    } else {
      navigate({ to: "/players/$userId", params: { userId } });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-border bg-background"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="sr-only">Perfil do jogador</SheetTitle>
        </SheetHeader>

        {loading && !profile ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : profile ? (
          <DrawerBody
            profile={profile}
            stats={stats}
            isMe={!!isMe}
            onViewFull={handleViewFull}
          />
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Perfil não encontrado.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  profile,
  stats,
  isMe,
  onViewFull,
}: {
  profile: QuickProfile;
  stats: QuickStats | null;
  isMe: boolean;
  onViewFull: () => void;
}) {
  const trendIcon =
    !stats || stats.trend === 0 ? (
      <Minus className="h-3.5 w-3.5" />
    ) : stats.trend > 0 ? (
      <TrendingUp className="h-3.5 w-3.5" />
    ) : (
      <TrendingDown className="h-3.5 w-3.5" />
    );
  const trendColor =
    !stats || stats.trend === 0
      ? "text-muted-foreground bg-muted/40"
      : stats.trend > 0
      ? "text-primary bg-primary/10"
      : "text-destructive bg-destructive/10";

  const winRate =
    stats && stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : null;

  return (
    <div className="space-y-5 pb-2 pt-2">
      {/* Identity */}
      <div className="flex items-center gap-4">
        <PlayerAvatar
          avatarUrl={profile.avatar_url}
          name={profile.name}
          size="xl"
          className="border border-border"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold leading-tight text-foreground">
            {abbreviateName(profile.name)}
          </h3>
          {profile.nickname ? (
            <p className="text-sm text-muted-foreground">@{profile.nickname}</p>
          ) : null}
          {profile.privacy.show_personal && profile.instagram_handle ? (
            <a
              href={`https://instagram.com/${profile.instagram_handle}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <AtSign className="h-3 w-3" />
              {profile.instagram_handle}
            </a>
          ) : null}
        </div>
      </div>

      {/* Hero stat: current Elo (always visible — privacy doesn't hide ranking) */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Elo atual
            </p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums text-foreground">
              {stats?.currentElo != null ? Math.round(stats.currentElo) : "—"}
            </p>
          </div>
          <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${trendColor}`}>
            {trendIcon}
            {stats ? (stats.trend > 0 ? `+${stats.trend}` : stats.trend) : "0"}
          </div>
        </div>

        {/* Form (last 5) */}
        {stats?.last5.length ? (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos
            </span>
            <div className="flex gap-1">
              {stats.last5.map((r, i) => (
                <span
                  key={i}
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    r === "W"
                      ? "bg-primary/20 text-primary"
                      : "bg-destructive/20 text-destructive"
                  }`}
                >
                  {r === "W" ? "V" : "D"}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Mini KPI row */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Partidas" value={stats ? String(stats.matches) : "—"} />
        <KpiCard label="Win rate" value={winRate != null ? `${winRate}%` : "—"} />
        <KpiCard
          label="Grupos juntos"
          value={stats ? String(stats.sharedGroups) : "—"}
          icon={<Users className="h-3 w-3" />}
        />
      </div>

      {/* Best position */}
      {stats?.bestPosition ? (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Melhor posição
            </p>
            <p className="truncate text-sm font-bold text-foreground">
              #{stats.bestPosition.pos}
              <span className="ml-1 font-normal text-muted-foreground">em {stats.bestPosition.group}</span>
            </p>
          </div>
        </div>
      ) : null}

      {/* CTA full profile */}
      <button
        onClick={onViewFull}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <ExternalLink className="h-4 w-4" />
        {isMe ? "Ir para meu perfil" : "Ver perfil completo"}
      </button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-2.5">
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="mt-1 font-display text-sm font-bold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

// ---------- Click helpers ----------

interface NameLinkProps {
  userId: string | null | undefined;
  /** When true (e.g. placeholder users), do NOT make name clickable */
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Wrap a player name. Avoid using inside elements that are already clickable
 * (e.g. an expandable card row): in those cases use <PlayerAvatarLink>
 * around the avatar only.
 */
export function PlayerNameLink({ userId, disabled, className, children }: NameLinkProps) {
  const open = useViewPlayerProfile();
  if (!userId || disabled) {
    return <span className={className}>{children}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(userId);
      }}
      className={`text-left transition-colors hover:text-primary cursor-pointer ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

interface AvatarLinkProps {
  userId: string | null | undefined;
  disabled?: boolean;
  children: ReactNode;
  /** Optional aria label for accessibility */
  ariaLabel?: string;
}

/**
 * Wrap a PlayerAvatar (or any avatar JSX) so a click opens the profile.
 * Safe to use inside expand-rows because we stopPropagation.
 */
export function PlayerAvatarLink({ userId, disabled, children, ariaLabel }: AvatarLinkProps) {
  const open = useViewPlayerProfile();
  if (!userId || disabled) {
    return <>{children}</>;
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? "Ver perfil"}
      onClick={(e) => {
        e.stopPropagation();
        open(userId);
      }}
      className="rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}
