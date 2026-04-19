import { useMemo, useState, useRef } from "react";

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

  const filtered = useMemo(() => {
    if (!points.length) return [];
    if (period === "all") return points;
    const days = period === "30d" ? 30 : 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const inRange = points.filter((p) => new Date(p.date).getTime() >= cutoff);
    // Always keep at least 2 points for a visible chart
    return inRange.length >= 2 ? inRange : points.slice(-Math.min(points.length, 10));
  }, [points, period]);

  const w = 520;
  const h = height;
  const padL = 36;
  const padR = 14;
  const padT = 14;
  const padB = 24;

  const values = filtered.map((p) => p.rating);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, maxV - minV);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const xFor = (i: number) =>
    padL +
    (filtered.length === 1 ? innerW / 2 : (i / (filtered.length - 1)) * innerW);
  const yFor = (v: number) => padT + (1 - (v - minV) / range) * innerH;

  const pathD = filtered
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.rating)}`)
    .join(" ");
  const areaD =
    filtered.length > 0
      ? `${pathD} L ${xFor(filtered.length - 1)} ${padT + innerH} L ${xFor(0)} ${padT + innerH} Z`
      : "";

  const yTicks = [0, 0.5, 1].map((t) => ({
    val: maxV - t * range,
    yPx: padT + t * innerH,
  }));

  // ─── Markers (computed over the FILTERED window so they make sense per period) ───
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
  const tooltipBoxH = 38;
  const tooltipLeft = Math.max(
    4,
    Math.min(w - tooltipBoxW - 4, tooltipX - tooltipBoxW / 2),
  );
  const tooltipTop = Math.max(4, tooltipY - tooltipBoxH - 10);

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
      {/* Period selector */}
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* Marker legend */}
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

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-muted/10 p-2">
        {!filtered.length ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Sem histórico ainda
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${w} ${h}`}
              className="block h-full w-full transition-opacity duration-300"
              preserveAspectRatio="none"
              onMouseMove={handleMove}
              onMouseLeave={handleLeave}
              key={period /* re-mounts on period change so the area animates in */}
            >
              {/* Y grid + labels */}
              {yTicks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={t.yPx}
                    y2={t.yPx}
                    stroke="var(--border)"
                    strokeDasharray="2 3"
                    opacity="0.5"
                  />
                  <text
                    x={padL - 4}
                    y={t.yPx + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--muted-foreground)"
                  >
                    {Math.round(t.val)}
                  </text>
                </g>
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
                    strokeOpacity={hoverMarker === m.kind ? 0.8 : 0.4}
                    strokeDasharray="4 4"
                    strokeWidth={hoverMarker === m.kind ? 1.5 : 1}
                    className="transition-opacity"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => { setHoverMarker(m.kind); setHoverIdx(null); }}
                    onMouseLeave={() => setHoverMarker(null)}
                  />
                  {/* invisible thicker hover hit area */}
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={yFor(m.rating)}
                    y2={yFor(m.rating)}
                    stroke="transparent"
                    strokeWidth="10"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => { setHoverMarker(m.kind); setHoverIdx(null); }}
                    onMouseLeave={() => setHoverMarker(null)}
                  />
                  <text
                    x={w - padR - 2}
                    y={yFor(m.rating) - 3}
                    textAnchor="end"
                    fontSize="8"
                    fontWeight="700"
                    fill={m.color}
                    style={{ pointerEvents: "none" }}
                  >
                    {m.label.toUpperCase()} · {Math.round(m.rating)}
                  </text>
                </g>
              ))}

              <defs>
                <linearGradient id="elo-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d={areaD} fill="url(#elo-grad)" />
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* All points */}
              {filtered.map((p, i) => (
                <circle
                  key={i}
                  cx={xFor(i)}
                  cy={yFor(p.rating)}
                  r={hoverIdx === i ? 4 : 2.5}
                  fill={color}
                  stroke={hoverIdx === i ? "var(--background)" : "none"}
                  strokeWidth={hoverIdx === i ? 2 : 0}
                />
              ))}

              {/* Hover guide line */}
              {hovered != null && hoverIdx != null && (
                <line
                  x1={tooltipX}
                  x2={tooltipX}
                  y1={padT}
                  y2={padT + innerH}
                  stroke={color}
                  strokeOpacity="0.4"
                  strokeDasharray="3 3"
                />
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
                  {Math.round(hovered.rating)} <span className="text-[10px] font-normal text-muted-foreground">Elo</span>
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
