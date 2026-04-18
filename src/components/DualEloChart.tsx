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

interface Props {
  /** Two duel players (order = visual A on primary, B on info). */
  playerAId: string;
  playerBId: string;
  playerALabel: string;
  playerBLabel: string;
  /** Optional season to scope; null = all time. */
  seasonId?: string | null;
}

interface RawEvent {
  user_id: string;
  rating_after: number;
  rating_change: number;
  created_at: string;
  match_id: string;
}

interface ChartPoint {
  /** Display label on the X axis. */
  label: string;
  /** Sortable timestamp. */
  ts: number;
  /** Sequential confronto index (1-based). */
  idx: number;
  ratingA?: number;
  ratingB?: number;
}

/**
 * Dual Elo evolution chart for the head-to-head duel page.
 *
 * Plots both players' Elo over time on the same axis, sampled at the timestamps
 * where AT LEAST ONE of them has a rating event. Missing values for the other
 * player are forward-filled from the last known rating so both lines stay
 * continuous and visually comparable.
 */
export function DualEloChart({
  playerAId,
  playerBId,
  playerALabel,
  playerBLabel,
  seasonId = null,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<RawEvent[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("rating_events")
        .select("user_id, rating_after, rating_change, created_at, match_id")
        .in("user_id", [playerAId, playerBId])
        .order("created_at", { ascending: true });
      if (seasonId) q = q.eq("season_id", seasonId);
      const { data } = await q;
      if (!alive) return;
      setEvents(
        (data || []).map((e: any) => ({
          user_id: e.user_id,
          rating_after: Number(e.rating_after),
          rating_change: Number(e.rating_change),
          created_at: e.created_at,
          match_id: e.match_id,
        })),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [playerAId, playerBId, seasonId]);

  const data: ChartPoint[] = useMemo(() => {
    if (!events.length) return [];

    // Group events by created_at timestamp (so same-match events collapse into one tick)
    const byTime = new Map<string, RawEvent[]>();
    for (const ev of events) {
      const list = byTime.get(ev.created_at) || [];
      list.push(ev);
      byTime.set(ev.created_at, list);
    }
    const sortedKeys = [...byTime.keys()].sort();

    // Initial ratings: derive starting Elo from the FIRST event of each player
    // (rating_after - rating_change). If a player has no events, default to 1000.
    const firstA = events.find((e) => e.user_id === playerAId);
    const firstB = events.find((e) => e.user_id === playerBId);
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
        ratingA: Math.round(curA),
        ratingB: Math.round(curB),
      });
    }

    return points;
  }, [events, playerAId, playerBId]);

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

      {loading ? (
        <div className="flex h-44 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : data.length < 2 ? (
        <div className="flex h-44 items-center justify-center text-center text-xs text-muted-foreground">
          Joguem ao menos um confronto para ver o gráfico
        </div>
      ) : (
        <div className="h-52">
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
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  fontSize: "11px",
                  color: "var(--popover-foreground)",
                }}
                labelStyle={{ fontSize: "10px", color: "var(--muted-foreground)" }}
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
