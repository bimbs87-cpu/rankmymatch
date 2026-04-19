import { useEffect, useState, useMemo, useRef, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type Period = "last10" | "season" | "all";

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: "last10", label: "Últimos 10" },
  { id: "season", label: "Temporada" },
  { id: "all", label: "Todos" },
];

interface MatchInfoEntry {
  setScores: string;
  isOfficial: boolean;
  date: string | null;
  changeByUser: Record<string, number>;
}

interface Props {
  playerAId: string;
  playerBId: string;
  playerALabel: string;
  playerBLabel: string;
  seasonId?: string | null;
  matchInfo?: Record<string, MatchInfoEntry>;
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
  matchId?: string;
  ratingA: number;
  ratingB: number;
}

/**
 * Pixel-accurate dual-Elo chart for the head-to-head duel.
 * Uses ResizeObserver to drive a 1:1 viewBox so geometry/text never stretch.
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const baseHeight = compact ? 176 : 208;
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: baseHeight });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(220, Math.floor(rect.width - 16));
      const h = Math.max(140, Math.floor(rect.height - 16));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
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
    let scoped = events;
    if (period === "season" && seasonId) {
      scoped = events.filter((e) => e.season_id === seasonId);
    }
    if (!scoped.length) return [];

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
        ratingA: Math.round(startA),
        ratingB: Math.round(startB),
      },
    ];

    for (const key of sortedKeys) {
      const tickEvents = byTime.get(key)!;
      const tickMatchId = tickEvents[0]?.match_id;
      for (const ev of tickEvents) {
        if (ev.user_id === playerAId) curA = ev.rating_after;
        if (ev.user_id === playerBId) curB = ev.rating_after;
      }
      const d = new Date(key);
      points.push({
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        ts: d.getTime(),
        matchId: tickMatchId,
        ratingA: Math.round(curA),
        ratingB: Math.round(curB),
      });
    }

    if (period === "last10" && points.length > 11) {
      return [points[0], ...points.slice(-10)];
    }
    return points;
  }, [events, playerAId, playerBId, period, seasonId]);

  // Reset hover on data/period change
  useEffect(() => {
    setHoverIdx(null);
  }, [period, data.length]);

  const allRatings = data.flatMap((p) => [p.ratingA, p.ratingB]);
  const minR = allRatings.length ? Math.min(...allRatings) - 15 : 985;
  const maxR = allRatings.length ? Math.max(...allRatings) + 15 : 1015;
  const range = Math.max(1, maxR - minR);

  const w = size.w;
  const h = size.h;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const innerW = Math.max(1, w - padL - padR);
  const innerH = Math.max(1, h - padT - padB);

  const xFor = (i: number) =>
    padL + (data.length === 1 ? innerW / 2 : (i / Math.max(1, data.length - 1)) * innerW);
  const yFor = (v: number) => padT + (1 - (v - minR) / range) * innerH;

  const buildPath = (key: "ratingA" | "ratingB") =>
    data
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(p[key]).toFixed(2)}`,
      )
      .join(" ");

  const pathA = buildPath("ratingA");
  const pathB = buildPath("ratingB");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: maxR - t * range,
    yPx: padT + t * innerH,
  }));

  // X ticks: show 3-5 evenly spaced labels
  const xTicks = useMemo(() => {
    if (data.length < 2) return [];
    const targetCount = Math.min(5, Math.max(3, Math.floor(innerW / 80)));
    const step = (data.length - 1) / (targetCount - 1);
    const seen = new Set<number>();
    const out: { i: number; label: string }[] = [];
    for (let k = 0; k < targetCount; k++) {
      const i = Math.round(k * step);
      if (seen.has(i)) continue;
      seen.add(i);
      out.push({ i, label: data[i].label });
    }
    return out;
  }, [data, innerW]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!data.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * w;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const dx = Math.abs(xFor(i) - xPx);
      if (dx < bestDist) {
        bestDist = dx;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  const hoveredInfo = hovered?.matchId ? matchInfo?.[hovered.matchId] : null;
  const tooltipX = hovered != null && hoverIdx != null ? xFor(hoverIdx) : 0;
  const tooltipBoxW = Math.min(180, Math.max(140, w - 16));
  const tooltipBoxH = 88;
  const tooltipLeft = Math.max(4, Math.min(w - tooltipBoxW - 4, tooltipX - tooltipBoxW / 2));
  const tooltipTop = 8;

  const dateLabel = hoveredInfo?.date
    ? new Date(hoveredInfo.date + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : hovered
      ? new Date(hovered.ts).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "";

  const fmtDelta = (v?: number) =>
    typeof v === "number" && Math.abs(v) >= 0.5 ? `${v > 0 ? "+" : ""}${Math.round(v)}` : null;
  const dA = fmtDelta(hoveredInfo?.changeByUser?.[playerAId]);
  const dB = fmtDelta(hoveredInfo?.changeByUser?.[playerBId]);

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
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl bg-muted/10 p-2"
          style={{ height: baseHeight }}
        >
          <svg
            ref={svgRef}
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="xMidYMid meet"
            className="block h-full w-full"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
            key={`${period}-${w}-${h}`}
          >
            {/* Y grid + labels */}
            {yTicks.map((t, i) => (
              <g key={`y-${i}`}>
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={t.yPx}
                  y2={t.yPx}
                  stroke="var(--border)"
                  strokeDasharray="2 4"
                  opacity="0.4"
                />
                <text
                  x={padL - 6}
                  y={t.yPx + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--muted-foreground)"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {Math.round(t.val)}
                </text>
              </g>
            ))}

            {/* X axis ticks */}
            {xTicks.map((t) => (
              <text
                key={`x-${t.i}`}
                x={xFor(t.i)}
                y={h - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--muted-foreground)"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {t.label}
              </text>
            ))}

            {/* Lines */}
            <path
              d={pathA}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={pathB}
              fill="none"
              stroke="var(--info)"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Hover guide + dots */}
            {hovered != null && hoverIdx != null && (
              <>
                <line
                  x1={tooltipX}
                  x2={tooltipX}
                  y1={padT}
                  y2={padT + innerH}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={tooltipX}
                  cy={yFor(hovered.ratingA)}
                  r={4}
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth={2}
                />
                <circle
                  cx={tooltipX}
                  cy={yFor(hovered.ratingB)}
                  r={4}
                  fill="var(--info)"
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              </>
            )}
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
              style={{
                left: `${(tooltipLeft / w) * 100}%`,
                top: `${(tooltipTop / h) * 100}%`,
                width: `${(tooltipBoxW / w) * 100}%`,
                minHeight: tooltipBoxH,
              }}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {dateLabel}
                </span>
                {hoveredInfo && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      hoveredInfo.isOfficial
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {hoveredInfo.isOfficial ? "Oficial" : "Avulso"}
                  </span>
                )}
              </div>
              {hoveredInfo?.setScores && (
                <p className="mb-1 font-display text-xs font-semibold tabular-nums">
                  {hoveredInfo.setScores}
                </p>
              )}
              <div className="space-y-0.5 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span className="truncate font-semibold text-foreground">{playerALabel}</span>
                  </span>
                  <span className="font-display tabular-nums">
                    <span className="text-foreground">{hovered.ratingA}</span>
                    {dA && (
                      <span
                        className={`ml-1.5 text-[10px] font-semibold ${
                          (hoveredInfo?.changeByUser?.[playerAId] ?? 0) > 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {dA}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-info" />
                    <span className="truncate font-semibold text-foreground">{playerBLabel}</span>
                  </span>
                  <span className="font-display tabular-nums">
                    <span className="text-foreground">{hovered.ratingB}</span>
                    {dB && (
                      <span
                        className={`ml-1.5 text-[10px] font-semibold ${
                          (hoveredInfo?.changeByUser?.[playerBId] ?? 0) > 0
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {dB}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
