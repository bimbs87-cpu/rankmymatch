import { useState } from "react";
import { Calendar, BarChart3, Trophy, Users, Activity, TrendingUp } from "lucide-react";
import { useGroupGlobalStats } from "@/hooks/use-group-stats";
import { useGroupRecentDeltas } from "@/hooks/use-group-recent-deltas";

interface Props {
  groupId: string;
}

type WindowOpt = 7 | 30 | 90 | "all";

const WINDOW_LABEL: Record<Exclude<WindowOpt, "all">, string> = {
  7: "nos últimos 7d",
  30: "nos últimos 30d",
  90: "nos últimos 90d",
};

const SHORT_WINDOW: Record<Exclude<WindowOpt, "all">, string> = {
  7: "em 7d",
  30: "em 30d",
  90: "em 90d",
};

const NEW_WINDOW: Record<Exclude<WindowOpt, "all">, string> = {
  7: "novos em 7d",
  30: "novos em 30d",
  90: "novos em 90d",
};

// "All-time" uses ~50 years worth of days — effectively the entire group history.
const ALL_TIME_DAYS = 365 * 50;

/**
 * Compact summary of group-wide totals — shown at the top of "Agenda completa".
 * Each card also shows a small delta vs a configurable time window (7/30/90d/Tudo).
 */
export function GroupSummaryCards({ groupId }: Props) {
  const { data, isLoading } = useGroupGlobalStats(groupId);
  const [windowOpt, setWindowOpt] = useState<WindowOpt>(30);
  const effectiveDays = windowOpt === "all" ? ALL_TIME_DAYS : windowOpt;
  const { data: deltas, isLoading: dLoading } = useGroupRecentDeltas(groupId, effectiveDays);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    );
  }

  const longLabel =
    windowOpt === "all" ? "no histórico" : WINDOW_LABEL[windowOpt];
  const shortLabel =
    windowOpt === "all" ? "histórico" : SHORT_WINDOW[windowOpt];
  const newLabel =
    windowOpt === "all" ? "no histórico" : NEW_WINDOW[windowOpt];

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
      deltaLabel: windowOpt === "all" ? "no histórico" : "novas",
    },
    {
      icon: Calendar,
      label: "Rodadas",
      value: data.total_rounds,
      tone: "text-info",
      delta: deltas.rounds_30d,
      deltaLabel: longLabel,
    },
    {
      icon: BarChart3,
      label: "Partidas",
      value: data.total_matches,
      tone: "text-warning",
      delta: deltas.matches_30d,
      deltaLabel: longLabel,
    },
    {
      icon: Users,
      label: "Jogadores ativos",
      value: data.total_active_players,
      tone: "text-success",
      delta: deltas.new_active_players_30d,
      deltaLabel: newLabel,
    },
    {
      icon: Activity,
      label: "Encerradas",
      value: data.finished_seasons,
      tone: "text-muted-foreground",
      delta: deltas.finished_seasons_30d,
      deltaLabel: shortLabel,
    },
  ];

  const windowOptions: { key: WindowOpt; label: string }[] = [
    { key: 7, label: "7d" },
    { key: 30, label: "30d" },
    { key: 90, label: "90d" },
    { key: "all", label: "Tudo" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1">
          Janela
        </span>
        {windowOptions.map((opt) => {
          const isOn = opt.key === windowOpt;
          return (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setWindowOpt(opt.key)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums transition-all ${
                isOn
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
              }`}
              title={opt.key === "all" ? "Desde o início do grupo" : `Últimos ${opt.label}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

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
    </div>
  );
}
