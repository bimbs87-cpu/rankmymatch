import { useMemo } from "react";
import { TrendingUp, TrendingDown, Activity, Gamepad2 } from "lucide-react";
import { useGroupEloEvolution } from "@/hooks/use-group-elo-evolution";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerAvatarLink } from "@/components/PlayerProfileViewer";

interface Props {
  groupId: string;
}

interface Highlight {
  user_id: string;
  name: string;
  avatar_url: string | null;
  value: number;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Shows top mover (up), worst drop, and most consistent player
 * over the last 30 days, based on Elo evolution.
 */
export function GroupEloHighlights({ groupId }: Props) {
  const { data, isLoading } = useGroupEloEvolution(groupId, "all");

  const { topUp, topDown, consistent, totalGames } = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS;
    let bestUp: Highlight | null = null;
    let bestDown: Highlight | null = null;
    let bestConsistent: Highlight | null = null;
    let bestConsistentSpread = Infinity;
    // Each rating event = one player-match. A match has multiple players,
    // so total matches ≈ unique match timestamps. We approximate "games"
    // as total rating events in the window divided by 2 (rough avg players per match for singles)
    // — but more meaningful: count distinct match timestamps across all series.
    const matchTimestamps = new Set<number>();

    for (const s of data.series) {
      const pts = s.points.filter((p) => p.ts >= cutoff);
      if (pts.length < 2) {
        for (const p of pts) matchTimestamps.add(p.ts);
        continue;
      }
      for (const p of pts) matchTimestamps.add(p.ts);
      const start = pts[0].rating;
      const end = pts[pts.length - 1].rating;
      const delta = end - start;

      if (!bestUp || delta > bestUp.value) {
        bestUp = { user_id: s.user_id, name: s.name, avatar_url: s.avatar_url, value: delta };
      }
      if (!bestDown || delta < bestDown.value) {
        bestDown = { user_id: s.user_id, name: s.name, avatar_url: s.avatar_url, value: delta };
      }

      // Consistency: smallest peak-to-trough spread, requires ≥3 matches
      if (pts.length >= 3) {
        let min = Infinity;
        let max = -Infinity;
        for (const p of pts) {
          if (p.rating < min) min = p.rating;
          if (p.rating > max) max = p.rating;
        }
        const spread = max - min;
        if (spread < bestConsistentSpread) {
          bestConsistentSpread = spread;
          bestConsistent = { user_id: s.user_id, name: s.name, avatar_url: s.avatar_url, value: spread };
        }
      }
    }

    // Filter out non-meaningful highlights
    if (bestUp && bestUp.value <= 0) bestUp = null;
    if (bestDown && bestDown.value >= 0) bestDown = null;

    return {
      topUp: bestUp,
      topDown: bestDown,
      consistent: bestConsistent,
      totalGames: matchTimestamps.size,
    };
  }, [data.series]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    );
  }

  if (!topUp && !topDown && !consistent && totalGames === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Destaques · últimos 30 dias
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <HighlightCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Maior alta"
          accent="text-rally-green"
          ring="ring-rally-green/30"
          highlight={topUp}
          formatValue={(v) => `+${Math.round(v)}`}
        />
        <HighlightCard
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Maior queda"
          accent="text-destructive"
          ring="ring-destructive/30"
          highlight={topDown}
          formatValue={(v) => `${Math.round(v)}`}
        />
        <HighlightCard
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Mais consistente"
          accent="text-primary"
          ring="ring-primary/30"
          highlight={consistent}
          formatValue={(v) => `±${Math.round(v / 2)}`}
        />
        <StatCard
          icon={<Gamepad2 className="h-3.5 w-3.5" />}
          label="Total de jogos"
          accent="text-accent-foreground"
          ring="ring-border"
          value={totalGames}
        />
      </div>
    </div>
  );
}

interface HighlightCardProps {
  icon: React.ReactNode;
  label: string;
  accent: string;
  ring: string;
  highlight: Highlight | null;
  formatValue: (v: number) => string;
}

function HighlightCard({ icon, label, accent, ring, highlight, formatValue }: HighlightCardProps) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-3 ring-1 ring-inset ${ring}`}>
      <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${accent}`}>
        {icon}
        {label}
      </div>
      {highlight ? (
        <div className="flex items-center gap-2">
          <PlayerAvatarLink userId={highlight.user_id} ariaLabel={`Ver perfil de ${highlight.name}`}>
            <PlayerAvatar name={highlight.name} avatarUrl={highlight.avatar_url} size="sm" />
          </PlayerAvatarLink>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{highlight.name}</p>
            <p className={`font-mono text-xs font-bold ${accent}`}>{formatValue(highlight.value)}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem dados suficientes</p>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  accent: string;
  ring: string;
  value: number;
}

function StatCard({ icon, label, accent, ring, value }: StatCardProps) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-3 ring-1 ring-inset ${ring}`}>
      <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${accent}`}>
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="font-mono text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground">jogos</p>
      </div>
    </div>
  );
}
