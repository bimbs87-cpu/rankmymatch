import { Calendar, BarChart3, Trophy, Users, Activity } from "lucide-react";
import { useGroupGlobalStats } from "@/hooks/use-group-stats";

interface Props {
  groupId: string;
}

/**
 * Compact summary of group-wide totals — used at the top of the
 * "Agenda completa" page to give context before the per-season list.
 */
export function GroupSummaryCards({ groupId }: Props) {
  const { data, isLoading } = useGroupGlobalStats(groupId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    );
  }

  const items: { icon: any; label: string; value: number; tone?: string }[] = [
    { icon: Trophy, label: "Temporadas", value: data.total_seasons, tone: "text-primary" },
    { icon: Calendar, label: "Rodadas", value: data.total_rounds, tone: "text-info" },
    { icon: BarChart3, label: "Partidas", value: data.total_matches, tone: "text-warning" },
    { icon: Users, label: "Jogadores ativos", value: data.total_active_players, tone: "text-success" },
    { icon: Activity, label: "Encerradas", value: data.finished_seasons, tone: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => {
        const Icon = it.icon;
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
          </div>
        );
      })}
    </div>
  );
}
