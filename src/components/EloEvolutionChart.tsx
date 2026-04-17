import { useMemo, useState, useRef } from "react";

export type EloPoint = { date: string; rating: number };
export type ChartPeriod = "last10" | "season" | "all";

interface Props {
  /** Full chronological history (oldest -> newest) */
  points: EloPoint[];
  color?: string;
  height?: number;
  /** Initial period filter */
  defaultPeriod?: ChartPeriod;
}

const PERIOD_LABELS: { id: ChartPeriod; label: string }[] = [
  { id: "last10", label: "Últimos 10" },
  { id: "season", label: "Temporada" },
  { id: "all", label: "Todos" },
];

export function EloEvolutionChart({
  points,
  color = "#84cc16",
  height = 240,
  defaultPeriod = "season",
}: Props) {
  const [period, setPeriod] = useState<ChartPeriod>(defaultPeriod);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const filtered = useMemo(() => {
    if (!points.length) return [];
    if (period === "last10") return points.slice(-10);
    // "season" === all events of the loaded season (same as all in this dataset).
    // "all" === every event we have. Since history is already per-season, both behave identically here.
    return points;
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

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!filtered.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * w;
    // Find nearest data point index
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
  };

  const handleLeave = () => setHoverIdx(null);

  const hovered = hoverIdx != null ? filtered[hoverIdx] : null;
  const tooltipX = hovered != null && hoverIdx != null ? xFor(hoverIdx) : 0;
  const tooltipY = hovered != null ? yFor(hovered.rating) : 0;
  // Position tooltip box: shift left if near the right edge
  const tooltipBoxW = 120;
  const tooltipBoxH = 38;
  const tooltipLeft = Math.max(
    4,
    Math.min(w - tooltipBoxW - 4, tooltipX - tooltipBoxW / 2)
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

  return (
    <div className="flex h-full flex-col">
      {/* Period selector */}
      <div className="mb-2 flex items-center justify-end gap-1">
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

      <div className="relative flex-1 rounded-xl bg-muted/10 p-2">
        {!filtered.length ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Sem histórico ainda
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${w} ${h}`}
              className="h-full w-full"
              preserveAspectRatio="none"
              onMouseMove={handleMove}
              onMouseLeave={handleLeave}
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

              <defs>
                <linearGradient
                  id="elo-grad"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
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

            {/* Tooltip box */}
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
          </>
        )}
      </div>
    </div>
  );
}
