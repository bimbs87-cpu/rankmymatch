import { Calendar, BarChart3, Trophy, Users, Activity, TrendingUp } from "lucide-react";
import { useGroupGlobalStats } from "@/hooks/use-group-stats";
import { useGroupRecentDeltas } from "@/hooks/use-group-recent-deltas";

interface Props {
  groupId: string;
}

/**
 * Compact summary of group-wide totals — shown at the top of "Agenda completa".
 * Each card also shows a small delta vs the last 30 days for temporal context.
 */
export function GroupSummaryCards({ groupId }: Props) {
  const { data, isLoading } = useGroupGlobalStats(groupId);
  const { data: deltas, isLoading: dLoading } = useGroupRecentDeltas(groupId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    );
  }

  const items: {
    icon: any;
    label: string;
    value: number;
    tone?: string;
    delta?: number;
    deltaLabel?: string;
  }[] = [
    {
      icon: Trophy,
      label: "Temporadas",
      value: data.total_seasons,
      tone: "text-primary",
      delta: deltas.new_seasons_30d,
      deltaLabel: "novas",
    },
    {
      icon: Calendar,
      label: "Rodadas",
      value: data.total_rounds,
      tone: "text-info",
      delta: deltas.rounds_30d,
      deltaLabel: "nos últimos 30d",
    },
    {
      icon: BarChart3,
      label: "Partidas",
      value: data.total_matches,
      tone: "text-warning",
      delta: deltas.matches_30d,
      deltaLabel: "nos últimos 30d",
    },
    {
      icon: Users,
      label: "Jogadores ativos",
      value: data.total_active_players,
      tone: "text-success",
      delta: deltas.new_active_players_30d,
      deltaLabel: "novos em 30d",
    },
    {
      icon: Activity,
      label: "Encerradas",
      value: data.finished_seasons,
      tone: "text-muted-foreground",
      delta: deltas.finished_seasons_30d,
      deltaLabel: "em 30d",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => {
        const Icon = it.icon;
        const showDelta = !dLoading && it.delta !== undefined && it.delta > 0;
        return (
          <div
            key={it.label}
            className="rounded-2xl border border-border bg-card/40 p-3"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Icon className={`h-3 w-3 ${it.tone || ""}`} /> {it.label}
            </div>
            <p className={`mt-1 font-display text-xl font-black tabular-nums ${it.tone || "text-foreground"}`}>
              {it.value}
            </p>
            {showDelta ? (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-success">
                <TrendingUp className="h-2.5 w-2.5" />
                <span className="tabular-nums">+{it.delta}</span>
                <span className="text-muted-foreground font-normal">{it.deltaLabel}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">—</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
