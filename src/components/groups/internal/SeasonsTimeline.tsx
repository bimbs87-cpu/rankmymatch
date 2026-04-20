import { useMemo } from "react";

interface Season {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

interface Props {
  seasons: Season[];
  onSelect?: (seasonId: string) => void;
}

/**
 * Mini horizontal timeline of seasons. Each season is rendered as a bar
 * spanning from its start to its end (or "today" when still active).
 * Reinforces the "agenda" metaphor at the top of Agenda completa.
 */
export function SeasonsTimeline({ seasons, onSelect }: Props) {
  const { bars, ticks, rangeLabel } = useMemo(() => {
    if (!seasons.length) return { bars: [], ticks: [], rangeLabel: "" };

    const today = Date.now();
    const items = seasons.map((s) => {
      const start =
        (s.start_date ? new Date(s.start_date + "T12:00:00").getTime() : null) ??
        new Date(s.created_at).getTime();
      const rawEnd = s.end_date ? new Date(s.end_date + "T12:00:00").getTime() : null;
      const isActive = s.status === "active";
      const end = rawEnd ?? (isActive ? today : start);
      return { season: s, start, end: Math.max(end, start), isActive };
    });

    const min = Math.min(...items.map((i) => i.start));
    const max = Math.max(today, ...items.map((i) => i.end));
    const span = Math.max(1, max - min);

    const bars = items
      .sort((a, b) => a.start - b.start)
      .map((i) => {
        const left = ((i.start - min) / span) * 100;
        const width = Math.max(2, ((i.end - i.start) / span) * 100);
        return {
          id: i.season.id,
          name: i.season.name,
          isActive: i.isActive,
          left,
          width,
          startStr: new Date(i.start).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          endStr: new Date(i.end).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        };
      });

    // Year ticks across the timeline
    const startYear = new Date(min).getFullYear();
    const endYear = new Date(max).getFullYear();
    const ticks: { year: number; left: number }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const t = new Date(y, 0, 1).getTime();
      if (t < min || t > max) continue;
      ticks.push({ year: y, left: ((t - min) / span) * 100 });
    }

    const rangeLabel = `${new Date(min).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} → hoje`;

    return { bars, ticks, rangeLabel };
  }, [seasons]);

  if (!bars.length) return null;

  const rowHeight = 14;
  const totalHeight = bars.length * (rowHeight + 4) + 22;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Linha do tempo
        </p>
        <p className="text-[10px] tabular-nums text-muted-foreground">{rangeLabel}</p>
      </div>
      <div className="relative w-full overflow-hidden" style={{ height: totalHeight }}>
        {/* Year tick lines */}
        {ticks.map((t) => (
          <div
            key={t.year}
            className="absolute top-0 bottom-5 w-px bg-border/50"
            style={{ left: `${t.left}%` }}
          />
        ))}
        {/* "Today" marker */}
        <div className="absolute top-0 bottom-5 w-px bg-primary/60" style={{ left: "100%" }}>
          <span className="absolute -top-0.5 -translate-x-full -translate-y-full text-[9px] font-bold text-primary">
            hoje
          </span>
        </div>

        {/* Season bars */}
        {bars.map((b, idx) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect?.(b.id)}
            className={`group absolute rounded-md transition-all hover:brightness-125 ${
              b.isActive ? "bg-success/70" : "bg-muted-foreground/40"
            }`}
            style={{
              top: idx * (rowHeight + 4),
              left: `${b.left}%`,
              width: `${b.width}%`,
              height: rowHeight,
            }}
            title={`${b.name} • ${b.startStr} → ${b.endStr}`}
          >
            <span className="pointer-events-none absolute inset-0 flex items-center px-1.5 text-[9px] font-bold uppercase tracking-tight text-foreground/90 truncate">
              {b.name}
            </span>
          </button>
        ))}

        {/* Year labels */}
        {ticks.map((t) => (
          <span
            key={`lbl-${t.year}`}
            className="absolute bottom-0 -translate-x-1/2 text-[9px] tabular-nums text-muted-foreground"
            style={{ left: `${t.left}%` }}
          >
            {t.year}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-success/70" /> Em andamento
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40" /> Encerrada
        </span>
      </div>
    </div>
  );
}
