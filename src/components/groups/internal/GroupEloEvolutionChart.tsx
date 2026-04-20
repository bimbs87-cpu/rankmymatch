import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { useGroupEloEvolution, type SeasonFilter } from "@/hooks/use-group-elo-evolution";

interface Props {
  groupId: string;
  defaultFilter?: SeasonFilter;
}

const COLORS = [
  "var(--primary)",
  "#38bdf8", "#f472b6", "#facc15", "#a78bfa",
  "#34d399", "#fb923c", "#60a5fa", "#f87171", "#c084fc",
];

interface Row {
  ts: number;
  values: Record<string, number | undefined>;
}

/**
 * Pixel-accurate group Elo evolution chart.
 * Uses ResizeObserver + 1:1 viewBox so geometry/text never stretch,
 * mirroring the EloEvolutionChart pattern.
 */
export function GroupEloEvolutionChart({ groupId, defaultFilter = "all" }: Props) {
  const [filter, setFilter] = useState<SeasonFilter>(defaultFilter);
  const { data, isLoading } = useGroupEloEvolution(groupId, filter);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: 256 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(240, Math.floor(rect.width - 16));
      const h = Math.max(180, Math.floor(rect.height - 16));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartData: Row[] = useMemo(() => {
    const allTs = new Set<number>();
    for (const s of data.series) for (const p of s.points) allTs.add(p.ts);
    const sortedTs = [...allTs].sort((a, b) => a - b);
    const lastValue = new Map<string, number>();
    return sortedTs.map((ts) => {
      const values: Record<string, number | undefined> = {};
      for (const s of data.series) {
        const point = s.points.find((p) => p.ts === ts);
        if (point) lastValue.set(s.user_id, point.rating);
        const v = lastValue.get(s.user_id);
        if (v != null) values[s.user_id] = Math.round(v);
      }
      return { ts, values };
    });
  }, [data.series]);

  const visibleSeries = useMemo(
    () => data.series.filter((s) => !hidden.has(s.user_id)),
    [data.series, hidden],
  );

  const allRatings = useMemo(() => {
    const out: number[] = [];
    for (const row of chartData) {
      for (const s of visibleSeries) {
        const v = row.values[s.user_id];
        if (v != null) out.push(v);
      }
    }
    return out;
  }, [chartData, visibleSeries]);

  const minV = allRatings.length ? Math.min(...allRatings) : 950;
  const maxV = allRatings.length ? Math.max(...allRatings) : 1050;
  const padding = Math.max(10, (maxV - minV) * 0.08);
  const yMin = minV - padding;
  const yMax = maxV + padding;
  const range = Math.max(1, yMax - yMin);

  const w = size.w;
  const h = size.h;
  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = Math.max(1, w - padL - padR);
  const innerH = Math.max(1, h - padT - padB);

  const tsMin = chartData[0]?.ts ?? 0;
  const tsMax = chartData[chartData.length - 1]?.ts ?? 1;
  const tsRange = Math.max(1, tsMax - tsMin);

  const xForTs = (ts: number) =>
    padL + (chartData.length <= 1 ? innerW / 2 : ((ts - tsMin) / tsRange) * innerW);
  const yFor = (v: number) => padT + (1 - (v - yMin) / range) * innerH;

  const buildPath = (userId: string) => {
    let d = "";
    let started = false;
    for (let i = 0; i < chartData.length; i++) {
      const v = chartData[i].values[userId];
      if (v == null) continue;
      const x = xForTs(chartData[i].ts).toFixed(2);
      const y = yFor(v).toFixed(2);
      d += started ? ` L ${x} ${y}` : `M ${x} ${y}`;
      started = true;
    }
    return d;
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: yMax - t * range,
    yPx: padT + t * innerH,
  }));

  const xTicks = useMemo(() => {
    if (chartData.length < 2) return [];
    const targetCount = Math.min(5, Math.max(3, Math.floor(innerW / 110)));
    const step = (chartData.length - 1) / (targetCount - 1);
    const seen = new Set<number>();
    const out: { i: number; label: string }[] = [];
    for (let k = 0; k < targetCount; k++) {
      const i = Math.round(k * step);
      if (seen.has(i)) continue;
      seen.add(i);
      out.push({
        i,
        label: new Date(chartData[i].ts).toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        }),
      });
    }
    return out;
  }, [chartData, innerW]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartData.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * w;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chartData.length; i++) {
      const dx = Math.abs(xForTs(chartData[i].ts) - xPx);
      if (dx < bestDist) {
        bestDist = dx;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="h-64 animate-pulse rounded-xl bg-muted/30" />
      </div>
    );
  }

  const toggle = (uid: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const hovered = hoverIdx != null ? chartData[hoverIdx] : null;
  const tooltipX = hovered ? xForTs(hovered.ts) : 0;
  const sortedHover = hovered
    ? visibleSeries
        .map((s, i) => ({
          uid: s.user_id,
          name: s.name,
          color: COLORS[data.series.indexOf(s) % COLORS.length] || COLORS[i % COLORS.length],
          v: hovered.values[s.user_id],
        }))
        .filter((r) => r.v != null)
        .sort((a, b) => (b.v as number) - (a.v as number))
        .slice(0, 6)
    : [];

  const tooltipBoxW = Math.min(180, Math.max(140, w - 16));
  const tooltipLeft = Math.max(4, Math.min(w - tooltipBoxW - 4, tooltipX - tooltipBoxW / 2));

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Evolução de Elo
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value as SeasonFilter); setHidden(new Set()); }}
            className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Todas as temporadas</option>
            <option value="active">Apenas ativa</option>
            {data.seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="text-[10px] text-muted-foreground">{data.series.length} jogadores</span>
        </div>
      </div>

      {data.series.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 py-10 text-center text-xs text-muted-foreground">
          Sem dados para o filtro selecionado.
        </div>
      ) : (
        <>
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

          <div
            ref={containerRef}
            className="relative h-64 overflow-hidden rounded-xl bg-muted/10 p-2 sm:h-80"
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
              key={`${filter}-${w}-${h}`}
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
                  x={xForTs(chartData[t.i].ts)}
                  y={h - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--muted-foreground)"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {t.label}
                </text>
              ))}

              {/* Season boundary markers (only when viewing all seasons) */}
              {filter === "all" &&
                data.seasonBoundaries.length > 1 &&
                (() => {
                  const labelH = 14;
                  const gap = 3;
                  const placed: { x: number; y: number; w: number }[] = [];
                  return data.seasonBoundaries.slice(1).map((b) => {
                    const x = xForTs(b.ts);
                    if (x < padL || x > w - padR) return null;
                    const labelText =
                      b.seasonName.length > 12 ? b.seasonName.slice(0, 11) + "…" : b.seasonName;
                    const labelW = Math.min(100, labelText.length * 5.5 + 10);
                    // Prefer placing label to the right of the boundary, clamped to chart bounds
                    const labelX = Math.max(
                      padL,
                      Math.min(w - padR - labelW - 2, x + 3),
                    );
                    // Find a y row with no horizontal collision against ALL placed labels
                    let row = 0;
                    const maxRows = 6;
                    while (row < maxRows) {
                      const candidateY = padT + 2 + row * (labelH + gap);
                      const collides = placed.some(
                        (p) =>
                          p.y === candidateY &&
                          labelX < p.x + p.w + 4 &&
                          labelX + labelW + 4 > p.x,
                      );
                      if (!collides) break;
                      row++;
                    }
                    const labelY = padT + 2 + row * (labelH + gap);
                    placed.push({ x: labelX, y: labelY, w: labelW });
                    return (
                      <g key={`sb-${b.seasonId}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={padT}
                          y2={padT + innerH}
                          stroke="var(--primary)"
                          strokeOpacity="0.45"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <rect
                          x={labelX}
                          y={labelY}
                          width={labelW}
                          height={labelH}
                          rx={3}
                          fill="var(--primary)"
                          fillOpacity="0.18"
                          stroke="var(--primary)"
                          strokeOpacity="0.4"
                        />
                        <text
                          x={labelX + 5}
                          y={labelY + 10}
                          fontSize="9"
                          fill="var(--primary)"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                          fontWeight={600}
                        >
                          {labelText}
                        </text>
                      </g>
                    );
                  });
                })()}

              {/* Lines */}
              {visibleSeries.map((s) => {
                const color = COLORS[data.series.indexOf(s) % COLORS.length];
                return (
                  <path
                    key={s.user_id}
                    d={buildPath(s.user_id)}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                );
              })}

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
                  {visibleSeries.map((s) => {
                    const v = hovered.values[s.user_id];
                    if (v == null) return null;
                    const color = COLORS[data.series.indexOf(s) % COLORS.length];
                    return (
                      <circle
                        key={s.user_id}
                        cx={tooltipX}
                        cy={yFor(v)}
                        r={3.5}
                        fill={color}
                        stroke="var(--background)"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </>
              )}
            </svg>

            {hovered && sortedHover.length > 0 && (
              <div
                className="pointer-events-none absolute rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg animate-fade-in"
                style={{
                  left: `${(tooltipLeft / w) * 100}%`,
                  top: `8px`,
                  width: `${(tooltipBoxW / w) * 100}%`,
                }}
              >
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {fmtDate(hovered.ts)}
                </p>
                <ul className="space-y-0.5 text-[11px]">
                  {sortedHover.map((row) => (
                    <li key={row.uid} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: row.color }}
                        />
                        <span className="truncate font-medium text-foreground">{row.name}</span>
                      </span>
                      <span className="font-display tabular-nums text-foreground">{row.v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
