import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Period = "last10" | "season" | "all";

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: "last10", label: "Últimos 10" },
  { id: "season", label: "Temporada" },
  { id: "all", label: "Todos" },
];

interface MatchInfoEntry {
  /** Pre-formatted set scores (e.g. "6-3 • 4-6 • 7-5"). */
  setScores: string;
  /** True if the match counted for the season ranking. */
  isOfficial: boolean;
  /** ISO date string of the round (or created_at fallback). */
  date: string | null;
  /** Per-player Elo change for this match keyed by user_id. */
  changeByUser: Record<string, number>;
}

interface Props {
  playerAId: string;
  playerBId: string;
  playerALabel: string;
  playerBLabel: string;
  /** Optional season to scope; null = all time. */
  seasonId?: string | null;
  /**
   * Optional metadata about each match (keyed by match_id) so the tooltip can
   * show set scores, Δ Elo, and the Oficial/Avulso badge.
   */
  matchInfo?: Record<string, MatchInfoEntry>;
  /** When true, render slightly shorter for visual balance with sparse data. */
  compact?: boolean;
}

interface RawEvent {
  user_id: string;
  rating_after: number;
  rating_change: number;
  created_at: string;
  match_id: string;
  season_id: string | null;
}

interface ChartPoint {
  label: string;
  ts: number;
  idx: number;
  matchId?: string;
  ratingA?: number;
  ratingB?: number;
}

/**
 * Dual Elo evolution chart for the head-to-head duel page.
 * Plots both players' Elo over time on the same axis with a period selector
 * (Últimos 10 / Temporada / Todos).
 */
export function DualEloChart({
  playerAId,
  playerBId,
  playerALabel,
  playerBLabel,
  seasonId = null,
  matchInfo,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [period, setPeriod] = useState<Period>(seasonId ? "season" : "all");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // Always fetch the full timeline; period filtering happens client-side
      // so the user can switch without re-querying.
      const { data } = await supabase
        .from("rating_events")
        .select("user_id, rating_after, rating_change, created_at, match_id, season_id")
        .in("user_id", [playerAId, playerBId])
        .order("created_at", { ascending: true });
      if (!alive) return;
      setEvents(
        (data || []).map((e: any) => ({
          user_id: e.user_id,
          rating_after: Number(e.rating_after),
          rating_change: Number(e.rating_change),
          created_at: e.created_at,
          match_id: e.match_id,
          season_id: e.season_id,
        })),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [playerAId, playerBId]);

  const data: ChartPoint[] = useMemo(() => {
    if (!events.length) return [];

    // Filter by period
    let scoped = events;
    if (period === "season" && seasonId) {
      scoped = events.filter((e) => e.season_id === seasonId);
    }

    if (!scoped.length) return [];

    // Group events by created_at timestamp
    const byTime = new Map<string, RawEvent[]>();
    for (const ev of scoped) {
      const list = byTime.get(ev.created_at) || [];
      list.push(ev);
      byTime.set(ev.created_at, list);
    }
    const sortedKeys = [...byTime.keys()].sort();

    const firstA = scoped.find((e) => e.user_id === playerAId);
    const firstB = scoped.find((e) => e.user_id === playerBId);
    const startA = firstA ? firstA.rating_after - firstA.rating_change : 1000;
    const startB = firstB ? firstB.rating_after - firstB.rating_change : 1000;

    let curA = startA;
    let curB = startB;

    const points: ChartPoint[] = [
      {
        label: "Início",
        ts: sortedKeys[0] ? new Date(sortedKeys[0]).getTime() - 1 : Date.now(),
        idx: 0,
        ratingA: Math.round(startA),
        ratingB: Math.round(startB),
      },
    ];

    let idx = 0;
    for (const key of sortedKeys) {
      const tickEvents = byTime.get(key)!;
      // Pick the dominant match for this tick — most match info is keyed by match_id,
      // and a single timestamp typically corresponds to one match (both players' events).
      const tickMatchId = tickEvents[0]?.match_id;
      for (const ev of tickEvents) {
        if (ev.user_id === playerAId) curA = ev.rating_after;
        if (ev.user_id === playerBId) curB = ev.rating_after;
      }
      idx++;
      const d = new Date(key);
      points.push({
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        ts: d.getTime(),
        idx,
        matchId: tickMatchId,
        ratingA: Math.round(curA),
        ratingB: Math.round(curB),
      });
    }

    // last10 — keep first point as baseline + last 10 events
    if (period === "last10" && points.length > 11) {
      return [points[0], ...points.slice(-10)];
    }

    return points;
  }, [events, playerAId, playerBId, period, seasonId]);

  const allRatings = data.flatMap((p) =>
    [p.ratingA, p.ratingB].filter((v): v is number => typeof v === "number"),
  );
  const minR = allRatings.length ? Math.min(...allRatings) - 15 : 985;
  const maxR = allRatings.length ? Math.max(...allRatings) + 15 : 1015;

  return (
    <div className="rounded-3xl border border-border bg-card/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evolução do Elo
          </h3>
          <p className="text-[10px] text-muted-foreground/70">Comparativo direto entre os dois</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 font-semibold text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" /> {playerALabel}
          </span>
          <span className="flex items-center gap-1 font-semibold text-info">
            <span className="h-2 w-2 rounded-full bg-info" /> {playerBLabel}
          </span>
        </div>
      </div>

      {/* Period selector */}
      <div className="mb-2 flex items-center justify-end gap-1">
        {PERIOD_LABELS.map((p) => {
          const disabled = p.id === "season" && !seasonId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => !disabled && setPeriod(p.id)}
              disabled={disabled}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                period === p.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex h-44 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : data.length < 2 ? (
        <div className="flex h-44 items-center justify-center text-center text-xs text-muted-foreground">
          Joguem ao menos um confronto para ver o gráfico
        </div>
      ) : (
        <div className={compact ? "h-44" : "h-52"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minR, maxR]}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                tickFormatter={(v) => Math.round(v).toString()}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const point = payload[0].payload as ChartPoint;
                  const info = point.matchId ? matchInfo?.[point.matchId] : null;
                  const dateLabel = info?.date
                    ? new Date(info.date + "T00:00:00").toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : new Date(point.ts).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      });
                  const changeA = info?.changeByUser?.[playerAId];
                  const changeB = info?.changeByUser?.[playerBId];
                  const fmtDelta = (v?: number) =>
                    typeof v === "number" && Math.abs(v) >= 0.5
                      ? `${v > 0 ? "+" : ""}${Math.round(v)}`
                      : null;
                  const dA = fmtDelta(changeA);
                  const dB = fmtDelta(changeB);
                  return (
                    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {dateLabel}
                        </span>
                        {info && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              info.isOfficial
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {info.isOfficial ? "Oficial" : "Avulso"}
                          </span>
                        )}
                      </div>
                      {info?.setScores && (
                        <p className="mb-1.5 font-display text-xs font-semibold tabular-nums">
                          {info.setScores}
                        </p>
                      )}
                      <div className="space-y-0.5 text-[11px]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <span className="font-semibold text-foreground">{playerALabel}</span>
                          </span>
                          <span className="font-display tabular-nums">
                            <span className="text-foreground">{point.ratingA}</span>
                            {dA && (
                              <span
                                className={`ml-1.5 text-[10px] font-semibold ${
                                  changeA! > 0 ? "text-success" : "text-destructive"
                                }`}
                              >
                                {dA}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-info" />
                            <span className="font-semibold text-foreground">{playerBLabel}</span>
                          </span>
                          <span className="font-display tabular-nums">
                            <span className="text-foreground">{point.ratingB}</span>
                            {dB && (
                              <span
                                className={`ml-1.5 text-[10px] font-semibold ${
                                  changeB! > 0 ? "text-success" : "text-destructive"
                                }`}
                              >
                                {dB}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ display: "none" }} />
              <Line
                type="monotone"
                dataKey="ratingA"
                name={playerALabel}
                stroke="var(--primary)"
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, fill: "var(--primary)", strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ratingB"
                name={playerBLabel}
                stroke="var(--info)"
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, fill: "var(--info)", strokeWidth: 2, stroke: "var(--background)" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
