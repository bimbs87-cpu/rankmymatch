import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";

export type EloPoint = { date: string; rating: number };
export type ChartPeriod = "30d" | "90d" | "all";

interface Props {
  /** Full chronological history (oldest -> newest) */
  points: EloPoint[];
  color?: string;
  height?: number;
  /** Initial period filter */
  defaultPeriod?: ChartPeriod;
}

const PERIOD_LABELS: { id: ChartPeriod; label: string }[] = [
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "Tudo" },
];

type MarkerKind = "peak" | "valley" | "start";
interface Marker {
  kind: MarkerKind;
  rating: number;
  date: string;
  label: string;
  desc: string;
  color: string;
}

/**
 * Pixel-accurate Elo evolution chart.
 *
 * Uses a ResizeObserver to drive the SVG viewBox to the actual container
 * pixel dimensions, so geometry, dots, lines and text all render at 1:1
 * scale with no stretching distortion. The chart re-runs its layout math
 * on resize, so it stays crisp at any width/height.
 */
export function EloEvolutionChart({
  points,
  color = "#84cc16",
  height = 240,
  defaultPeriod = "all",
}: Props) {
  const [period, setPeriod] = useState<ChartPeriod>(defaultPeriod);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverMarker, setHoverMarker] = useState<MarkerKind | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Measured container size (drives viewBox and layout math)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: height });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // Subtract padding (p-2 → 8px each side)
      const w = Math.max(200, Math.floor(rect.width - 16));
      const h = Math.max(120, Math.floor(rect.height - 16));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    if (!points.length) return [];
    if (period === "all") return points;
    const days = period === "30d" ? 30 : 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const inRange = points.filter((p) => new Date(p.date).getTime() >= cutoff);
    return inRange.length >= 2 ? inRange : points.slice(-Math.min(points.length, 10));
  }, [points, period]);

  // Reset hover state when filter or data change
  useEffect(() => {
    setHoverIdx(null);
    setHoverMarker(null);
  }, [period, points]);

  const w = size.w;
  const h = size.h;
  // Responsive padding — generous on left for Y labels, room on right for marker labels
  const padL = 44;
  const padR = 56;
  const padT = 20;
  const padB = 26;

  const values = filtered.map((p) => p.rating);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, maxV - minV);
  const innerW = Math.max(1, w - padL - padR);
  const innerH = Math.max(1, h - padT - padB);

  const xFor = (i: number) =>
    padL + (filtered.length === 1 ? innerW / 2 : (i / (filtered.length - 1)) * innerW);
  const yFor = (v: number) => padT + (1 - (v - minV) / range) * innerH;

  const pathD = filtered
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(p.rating).toFixed(2)}`)
    .join(" ");
  const areaD =
    filtered.length > 0
      ? `${pathD} L ${xFor(filtered.length - 1).toFixed(2)} ${(padT + innerH).toFixed(2)} L ${xFor(0).toFixed(2)} ${(padT + innerH).toFixed(2)} Z`
      : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: maxV - t * range,
    yPx: padT + t * innerH,
  }));

  // X-axis date ticks — show 3-5 evenly spaced dates
  const xTicks = useMemo(() => {
    if (filtered.length < 2) return [];
    const targetCount = Math.min(5, Math.max(3, Math.floor(innerW / 110)));
    const step = (filtered.length - 1) / (targetCount - 1);
    const out: { i: number; label: string }[] = [];
    const seen = new Set<number>();
    for (let k = 0; k < targetCount; k++) {
      const i = Math.round(k * step);
      if (seen.has(i)) continue;
      seen.add(i);
      const d = new Date(filtered[i].date);
      out.push({
        i,
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      });
    }
    return out;
  }, [filtered, innerW]);

  // ─── Markers (over filtered window) ───
  const markers = useMemo<Marker[]>(() => {
    if (filtered.length < 2) return [];
    let peakIdx = 0;
    let valleyIdx = 0;
    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i].rating > filtered[peakIdx].rating) peakIdx = i;
      if (filtered[i].rating < filtered[valleyIdx].rating) valleyIdx = i;
    }
    const startPt = filtered[0];
    const peakPt = filtered[peakIdx];
    const valleyPt = filtered[valleyIdx];
    const out: Marker[] = [
      {
        kind: "start",
        rating: startPt.rating,
        date: startPt.date,
        label: "Inicial",
        desc: "Elo no início do período",
        color: "var(--muted-foreground)",
      },
    ];
    if (peakIdx !== 0 || valleyIdx !== 0) {
      out.push({
        kind: "peak",
        rating: peakPt.rating,
        date: peakPt.date,
        label: "Pico",
        desc: "Maior Elo no período",
        color: "var(--primary)",
      });
      out.push({
        kind: "valley",
        rating: valleyPt.rating,
        date: valleyPt.date,
        label: "Vale",
        desc: "Menor Elo no período",
        color: "var(--destructive)",
      });
    }
    return out;
  }, [filtered]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!filtered.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * w;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < filtered.length; i++) {
      const dx = Math.abs(xFor(i) - xPx);
      if (dx < bestDist) {
        bestDist = dx;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
    setHoverMarker(null);
  };

  const handleLeave = () => {
    setHoverIdx(null);
    setHoverMarker(null);
  };

  const hovered = hoverIdx != null ? filtered[hoverIdx] : null;
  const tooltipX = hovered != null && hoverIdx != null ? xFor(hoverIdx) : 0;
  const tooltipY = hovered != null ? yFor(hovered.rating) : 0;
  const tooltipBoxW = 130;
  const tooltipBoxH = 44;
  const tooltipLeft = Math.max(4, Math.min(w - tooltipBoxW - 4, tooltipX - tooltipBoxW / 2));
  const tooltipTop = Math.max(4, tooltipY - tooltipBoxH - 12);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const activeMarker = hoverMarker ? markers.find((m) => m.kind === hoverMarker) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Period selector + legend */}
      <div className="mb-2 flex items-center justify-between gap-2">
        {markers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {markers.map((m) => (
              <span
                key={m.kind}
                title={`${m.desc} — ${Math.round(m.rating)} Elo · ${formatDate(m.date)}`}
                className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                {m.label}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                period === p.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {points.length > 0 && (
        <p className="mb-1 text-[10px] text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "partida" : "partidas"}
          {period === "all"
            ? " no histórico completo"
            : ` nos últimos ${period === "30d" ? 30 : 90} dias`}
        </p>
      )}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-muted/10 p-2"
      >
        {!filtered.length ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Sem histórico ainda
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              className="block h-full w-full"
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleMove}
              onMouseLeave={handleLeave}
              key={`${period}-${w}-${h}`}
            >
              <defs>
                <linearGradient id="elo-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>

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
                    opacity="0.45"
                  />
                  <text
                    x={padL - 8}
                    y={t.yPx + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--muted-foreground)"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {Math.round(t.val)}
                  </text>
                </g>
              ))}

              {/* X axis date ticks */}
              {xTicks.map((t) => (
                <text
                  key={`x-${t.i}`}
                  x={xFor(t.i)}
                  y={h - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--muted-foreground)"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {t.label}
                </text>
              ))}

              {/* Marker horizontal lines */}
              {markers.map((m) => (
                <g key={m.kind}>
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={yFor(m.rating)}
                    y2={yFor(m.rating)}
                    stroke={m.color}
                    strokeOpacity={hoverMarker === m.kind ? 0.85 : 0.4}
                    strokeDasharray="4 4"
                    strokeWidth={hoverMarker === m.kind ? 1.5 : 1}
                    className="transition-opacity"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => {
                      setHoverMarker(m.kind);
                      setHoverIdx(null);
                    }}
                    onMouseLeave={() => setHoverMarker(null)}
                  />
                  {/* invisible thicker hit area */}
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={yFor(m.rating)}
                    y2={yFor(m.rating)}
                    stroke="transparent"
                    strokeWidth="10"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => {
                      setHoverMarker(m.kind);
                      setHoverIdx(null);
                    }}
                    onMouseLeave={() => setHoverMarker(null)}
                  />
                  <text
                    x={w - padR + 4}
                    y={yFor(m.rating) + 3}
                    textAnchor="start"
                    fontSize="9"
                    fontWeight="700"
                    fill={m.color}
                    style={{ pointerEvents: "none" }}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {m.label.toUpperCase()}
                  </text>
                  <text
                    x={w - padR + 4}
                    y={yFor(m.rating) + 14}
                    textAnchor="start"
                    fontSize="9"
                    fontWeight="600"
                    fill={m.color}
                    fillOpacity="0.75"
                    style={{ pointerEvents: "none" }}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {Math.round(m.rating)}
                  </text>
                </g>
              ))}

              {/* Area fill + line */}
              <path d={areaD} fill="url(#elo-grad)" />
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Data points (only render dots when there are few enough to keep clean) */}
              {filtered.length <= 60 &&
                filtered.map((p, i) => (
                  <circle
                    key={i}
                    cx={xFor(i)}
                    cy={yFor(p.rating)}
                    r={hoverIdx === i ? 4 : 2.25}
                    fill={color}
                    stroke={hoverIdx === i ? "var(--background)" : "none"}
                    strokeWidth={hoverIdx === i ? 2 : 0}
                  />
                ))}

              {/* Hover guide line + accent dot when many points */}
              {hovered != null && hoverIdx != null && (
                <>
                  <line
                    x1={tooltipX}
                    x2={tooltipX}
                    y1={padT}
                    y2={padT + innerH}
                    stroke={color}
                    strokeOpacity="0.45"
                    strokeDasharray="3 3"
                  />
                  {filtered.length > 60 && (
                    <circle
                      cx={tooltipX}
                      cy={tooltipY}
                      r={4}
                      fill={color}
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                  )}
                </>
              )}
            </svg>

            {/* Tooltip box for point hover */}
            {hovered != null && (
              <div
                className="pointer-events-none absolute rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg"
                style={{
                  left: `${(tooltipLeft / w) * 100}%`,
                  top: `${(tooltipTop / h) * 100}%`,
                  width: `${(tooltipBoxW / w) * 100}%`,
                }}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDate(hovered.date)}
                </p>
                <p className="font-display text-sm font-bold text-foreground tabular-nums">
                  {Math.round(hovered.rating)}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">Elo</span>
                </p>
              </div>
            )}

            {/* Tooltip box for marker hover */}
            {activeMarker && (
              <div
                className="pointer-events-none absolute left-2 top-2 max-w-[60%] rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg"
                style={{ borderColor: activeMarker.color, color: activeMarker.color }}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider">
                  {activeMarker.label} · {Math.round(activeMarker.rating)} Elo
                </p>
                <p className="text-[10px] font-normal text-foreground/80">
                  {activeMarker.desc} · {formatDate(activeMarker.date)}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
