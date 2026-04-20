import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Season {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  group_id?: string;
}

interface Props {
  seasons: Season[];
  onSelect?: (seasonId: string) => void;
}

interface EventMarker {
  ts: number;
  left: number;
  type: "big_round" | "season_finished";
  label: string;
}

const BIG_ROUND_MIN_MATCHES = 4;

/**
 * Mini horizontal timeline of seasons with event markers (big rounds, season closures).
 */
export function SeasonsTimeline({ seasons, onSelect }: Props) {
  const groupId = seasons[0]?.group_id;
  const [bigRounds, setBigRounds] = useState<{ ts: number; matches: number }[]>([]);

  // Load rounds with their match counts to highlight "big rounds"
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupId) return;
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, scheduled_date, created_at, status")
        .eq("group_id", groupId)
        .eq("status", "completed");
      if (!rounds?.length) {
        if (!cancelled) setBigRounds([]);
        return;
      }
      const ids = rounds.map((r) => r.id);
      const { data: matches } = await supabase
        .from("matches")
        .select("round_id")
        .in("round_id", ids);
      const counts = new Map<string, number>();
      for (const m of matches || []) {
        counts.set(m.round_id, (counts.get(m.round_id) || 0) + 1);
      }
      const out: { ts: number; matches: number }[] = [];
      for (const r of rounds) {
        const n = counts.get(r.id) || 0;
        if (n >= BIG_ROUND_MIN_MATCHES) {
          const ts = r.scheduled_date
            ? new Date(r.scheduled_date + "T12:00:00").getTime()
            : new Date(r.created_at).getTime();
          out.push({ ts, matches: n });
        }
      }
      if (!cancelled) setBigRounds(out);
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const { bars, ticks, rangeLabel, markers, min, max } = useMemo(() => {
    if (!seasons.length) return { bars: [], ticks: [], rangeLabel: "", markers: [], min: 0, max: 0 };

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

    const startYear = new Date(min).getFullYear();
    const endYear = new Date(max).getFullYear();
    const ticks: { year: number; left: number }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const t = new Date(y, 0, 1).getTime();
      if (t < min || t > max) continue;
      ticks.push({ year: y, left: ((t - min) / span) * 100 });
    }

    // Build event markers
    const markers: EventMarker[] = [];
    // Season closure markers
    for (const i of items) {
      if (!i.isActive && i.season.end_date) {
        const ts = new Date(i.season.end_date + "T12:00:00").getTime();
        if (ts >= min && ts <= max) {
          markers.push({
            ts,
            left: ((ts - min) / span) * 100,
            type: "season_finished",
            label: `🏁 ${i.season.name} encerrada em ${new Date(ts).toLocaleDateString("pt-BR")}`,
          });
        }
      }
    }
    // Big-round markers
    for (const r of bigRounds) {
      if (r.ts >= min && r.ts <= max) {
        markers.push({
          ts: r.ts,
          left: ((r.ts - min) / span) * 100,
          type: "big_round",
          label: `🔥 Rodada com ${r.matches} partidas em ${new Date(r.ts).toLocaleDateString("pt-BR")}`,
        });
      }
    }

    const rangeLabel = `${new Date(min).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} → hoje`;

    return { bars, ticks, rangeLabel, markers, min, max };
  }, [seasons, bigRounds]);

  if (!bars.length) return null;

  const rowHeight = 14;
  const markerRowHeight = 12;
  const totalHeight = bars.length * (rowHeight + 4) + markerRowHeight + 22;
  const markersTop = bars.length * (rowHeight + 4) + 2;

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
            className="absolute top-0 w-px bg-border/50"
            style={{ left: `${t.left}%`, bottom: 20 }}
          />
        ))}
        {/* "Today" marker */}
        <div className="absolute top-0 w-px bg-primary/60" style={{ left: "100%", bottom: 20 }}>
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

        {/* Event markers row */}
        {markers.map((m, i) => (
          <div
            key={`${m.type}-${m.ts}-${i}`}
            className="absolute -translate-x-1/2"
            style={{ left: `${m.left}%`, top: markersTop }}
            title={m.label}
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                m.type === "big_round" ? "bg-warning" : "bg-destructive/80"
              }`}
            />
          </div>
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-success/70" /> Em andamento
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40" /> Encerrada
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-warning" /> Rodada cheia (≥{BIG_ROUND_MIN_MATCHES} partidas)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-destructive/80" /> Temporada encerrada
        </span>
      </div>
    </div>
  );
}
