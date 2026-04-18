import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useGroupEloEvolution } from "@/hooks/use-group-elo-evolution";

interface Props {
  groupId: string;
}

// Distinct line colors. Cycles if more than 10 players.
const COLORS = [
  "hsl(var(--primary))",
  "#38bdf8", "#f472b6", "#facc15", "#a78bfa",
  "#34d399", "#fb923c", "#60a5fa", "#f87171", "#c084fc",
];

export function GroupEloEvolutionChart({ groupId }: Props) {
  const { data, isLoading } = useGroupEloEvolution(groupId);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const chartData = useMemo(() => {
    // Build a unified set of all timestamps and forward-fill each player's rating.
    const allTs = new Set<number>();
    for (const s of data.series) for (const p of s.points) allTs.add(p.ts);
    const sortedTs = [...allTs].sort((a, b) => a - b);
    const lastValue = new Map<string, number>();
    return sortedTs.map((ts) => {
      const row: Record<string, number | string> = { ts };
      for (const s of data.series) {
        const point = s.points.find((p) => p.ts === ts);
        if (point) lastValue.set(s.user_id, point.rating);
        const v = lastValue.get(s.user_id);
        if (v != null) row[s.user_id] = Math.round(v);
      }
      return row;
    });
  }, [data.series]);

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="h-64 animate-pulse rounded-xl bg-muted/30" />
      </div>
    );
  }
  if (!data.series.length) return null;

  const toggle = (uid: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Evolução de Elo · histórico completo
        </h3>
        <span className="text-[10px] text-muted-foreground">{data.series.length} jogadores</span>
      </div>

      {/* Legend with click-to-toggle */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {data.series.map((s, i) => {
          const color = COLORS[i % COLORS.length];
          const isHidden = hidden.has(s.user_id);
          const last = s.points[s.points.length - 1]?.rating ?? 0;
          return (
            <button
              key={s.user_id}
              onClick={() => toggle(s.user_id)}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-all ${
                isHidden
                  ? "border-border/50 bg-muted/20 text-muted-foreground/50"
                  : "border-border bg-background/50 text-foreground"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: isHidden ? "currentColor" : color }} />
              <span className="truncate max-w-[120px]">{s.name}</span>
              <span className="tabular-nums opacity-70">{Math.round(last)}</span>
            </button>
          );
        })}
      </div>

      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 11,
              }}
              labelFormatter={(v) => fmtDate(Number(v))}
            />
            {data.series.map((s, i) =>
              hidden.has(s.user_id) ? null : (
                <Line
                  key={s.user_id}
                  type="monotone"
                  dataKey={s.user_id}
                  name={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
