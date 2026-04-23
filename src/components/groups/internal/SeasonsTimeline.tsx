import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  X,
  ChevronDown,
  ChevronUp,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  PlayCircle,
  Trophy,
  Sparkles,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useViewPlayerProfile } from "@/components/PlayerProfileViewer";
import { PlayerAvatar } from "@/components/PlayerAvatar";

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

type RoundStatus = "completed" | "scheduled" | "cancelled" | "in_progress";

interface RoundRow {
  ts: number;
  status: RoundStatus;
  matches: number;
  roundId: string;
  roundNumber: number | null;
  seasonId: string | null;
}

interface SelectedRound {
  groupId: string;
  seasonId: string;
  roundId: string;
  roundNumber: number | null;
  status: RoundStatus;
  ts: number;
  matches: number;
}

const STATUS_META: Record<
  RoundStatus,
  { label: string; chip: string; dot: string; Icon: typeof CalendarCheck2 }
> = {
  completed: {
    label: "Concluída",
    chip: "bg-success/15 text-success ring-success/40",
    dot: "bg-success shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_25%,transparent)]",
    Icon: CalendarCheck2,
  },
  scheduled: {
    label: "Agendada",
    chip: "bg-info/10 text-info ring-info/30",
    dot: "bg-info",
    Icon: CalendarClock,
  },
  in_progress: {
    label: "Em andamento",
    chip: "bg-warning/15 text-warning ring-warning/40",
    dot: "bg-warning animate-pulse",
    Icon: PlayCircle,
  },
  cancelled: {
    label: "Cancelada",
    chip: "bg-destructive/10 text-destructive ring-destructive/30",
    dot: "bg-destructive",
    Icon: CalendarX2,
  },
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function fmtMonthYear(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/**
 * Vertical season-by-season timeline. Each season is a card showing its
 * date range, status, and a list of round chips (concluída/agendada/etc.).
 * Click a round to open a detail modal (with podium for completed rounds).
 *
 * Visual: dark, premium "carbon-fiber" treatment with a true vertical spine,
 * pulsing milestone dot for the active season, gradient season headers, and
 * crisp round chips with iconography. Filter chips are pill-shaped and use
 * semantic tokens for status hues.
 */
export function SeasonsTimeline({ seasons, onSelect }: Props) {
  const groupId = seasons[0]?.group_id;
  const [allRounds, setAllRounds] = useState<RoundRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<SelectedRound | null>(null);
  const [podium, setPodium] = useState<
    { userId: string; name: string; avatarUrl: string | null; subtitle: string; eloDelta?: number | null }[] | null
  >(null);
  const [podiumLoading, setPodiumLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "upcoming">("all");
  const openProfile = useViewPlayerProfile();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupId) return;
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, scheduled_date, created_at, status, round_number, season_id")
        .eq("group_id", groupId)
        .in("status", ["completed", "scheduled", "cancelled", "in_progress"]);
      if (!rounds?.length) {
        if (!cancelled) setAllRounds([]);
        return;
      }
      const completedIds = rounds.filter((r) => r.status === "completed").map((r) => r.id);
      const counts = new Map<string, number>();
      if (completedIds.length) {
        const { data: matches } = await supabase
          .from("matches")
          .select("round_id")
          .in("round_id", completedIds);
        for (const m of matches || []) {
          counts.set(m.round_id, (counts.get(m.round_id) || 0) + 1);
        }
      }
      const out: RoundRow[] = rounds.map((r) => ({
        ts: r.scheduled_date
          ? new Date(r.scheduled_date + "T12:00:00").getTime()
          : new Date(r.created_at).getTime(),
        status: r.status as RoundStatus,
        matches: counts.get(r.id) || 0,
        roundId: r.id,
        roundNumber: r.round_number ?? null,
        seasonId: r.season_id ?? null,
      }));
      if (!cancelled) setAllRounds(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const roundsBySeason = useMemo(() => {
    const map = new Map<string, RoundRow[]>();
    for (const r of allRounds) {
      const k = r.seasonId ?? "_orphan";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    for (const list of map.values()) list.sort((a, b) => a.ts - b.ts);
    return map;
  }, [allRounds]);

  const orderedSeasons = useMemo(() => {
    return [...seasons].sort((a, b) => {
      const aTs = a.start_date ? new Date(a.start_date).getTime() : new Date(a.created_at).getTime();
      const bTs = b.start_date ? new Date(b.start_date).getTime() : new Date(b.created_at).getTime();
      return bTs - aTs;
    });
  }, [seasons]);

  useEffect(() => {
    let cancelled = false;
    setPodium(null);
    if (!selected || selected.status !== "completed") return;
    (async () => {
      setPodiumLoading(true);
      try {
        const { data: ms } = await supabase
          .from("matches")
          .select("id, winner_team")
          .eq("round_id", selected.roundId);
        const matchIds = (ms || []).map((m) => m.id);
        if (matchIds.length === 0) return;
        const { data: mps } = await supabase
          .from("match_players")
          .select("user_id, team, match_id")
          .in("match_id", matchIds);
        const wins = new Map<string, number>();
        const winnersByMatch = new Map<string, string | null>(
          (ms || []).map((m) => [m.id, m.winner_team]),
        );
        for (const mp of mps || []) {
          const w = winnersByMatch.get(mp.match_id);
          if (w && w === mp.team) wins.set(mp.user_id, (wins.get(mp.user_id) || 0) + 1);
        }
        const top = [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        if (top.length === 0) return;
        const ids = top.map(([uid]) => uid);
        const { data: profs } = await supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", ids);
        const profMap = new Map(
          (profs || []).map((p) => [
            p.user_id,
            { name: p.nickname || p.name || "Jogador", avatarUrl: p.avatar_url ?? null },
          ]),
        );
        const { data: evs } = await supabase
          .from("rating_events")
          .select("user_id, rating_change")
          .in("match_id", matchIds)
          .in("user_id", ids);
        const eloMap = new Map<string, number>();
        for (const ev of evs || []) {
          eloMap.set(ev.user_id, (eloMap.get(ev.user_id) || 0) + Number(ev.rating_change || 0));
        }
        if (cancelled) return;
        setPodium(
          top.map(([uid, v]) => ({
            userId: uid,
            name: profMap.get(uid)?.name || "Jogador",
            avatarUrl: profMap.get(uid)?.avatarUrl ?? null,
            subtitle: `${v} vitória${v !== 1 ? "s" : ""}`,
            eloDelta: eloMap.has(uid) ? eloMap.get(uid)! : null,
          })),
        );
      } finally {
        if (!cancelled) setPodiumLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!orderedSeasons.length) return null;

  const totalCounts = allRounds.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { completed: 0, scheduled: 0, in_progress: 0, cancelled: 0 } as Record<RoundStatus, number>,
  );

  const matchesFilter = (st: RoundStatus) => {
    if (filter === "all") return true;
    if (filter === "completed") return st === "completed";
    return st === "scheduled" || st === "in_progress";
  };

  const upcomingTotal = totalCounts.scheduled + totalCounts.in_progress;
  const allTotal =
    totalCounts.completed + totalCounts.scheduled + totalCounts.in_progress + totalCounts.cancelled;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card/80 to-card/40 shadow-sm">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
              Linha do tempo
            </p>
            <p className="text-[10px] text-muted-foreground">
              {orderedSeasons.length} temporada{orderedSeasons.length !== 1 ? "s" : ""} ·{" "}
              {allTotal} rodada{allTotal !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <LegendDot tone="success" label={`${totalCounts.completed} concl.`} />
          <LegendDot tone="info" label={`${upcomingTotal} próx.`} />
          {totalCounts.cancelled > 0 && (
            <LegendDot tone="destructive" label={`${totalCounts.cancelled} canc.`} />
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-background/20 px-4 py-2.5">
        {(
          [
            { id: "all", label: "Todas", count: allTotal },
            { id: "completed", label: "Só concluídas", count: totalCounts.completed },
            { id: "upcoming", label: "Só próximas", count: upcomingTotal },
          ] as const
        ).map((opt) => {
          const isOn = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold ring-1 transition-all ${
                isOn
                  ? "bg-primary text-primary-foreground ring-primary shadow-sm"
                  : "bg-card/40 text-muted-foreground ring-border hover:text-foreground hover:ring-primary/40"
              }`}
            >
              {opt.label}
              <span
                className={`tabular-nums ${
                  isOn ? "opacity-90" : "opacity-60"
                }`}
              >
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <ol className="relative space-y-3 px-4 py-4 pl-7">
        {/* Vertical spine */}
        <span
          className="pointer-events-none absolute left-3.5 top-4 bottom-4 w-px bg-gradient-to-b from-primary/40 via-border to-border/40"
          aria-hidden
        />

        {orderedSeasons.map((s, idx) => {
          const allSeasonRounds = roundsBySeason.get(s.id) || [];
          const rounds = allSeasonRounds.filter((r) => matchesFilter(r.status));
          if (filter !== "all" && rounds.length === 0) return null;
          const isActive = s.status === "active";
          const startTs = s.start_date
            ? new Date(s.start_date + "T12:00:00").getTime()
            : new Date(s.created_at).getTime();
          const endTs = s.end_date ? new Date(s.end_date + "T12:00:00").getTime() : null;
          const counts = rounds.reduce(
            (acc, r) => {
              acc[r.status] = (acc[r.status] || 0) + 1;
              return acc;
            },
            { completed: 0, scheduled: 0, in_progress: 0, cancelled: 0 } as Record<RoundStatus, number>,
          );
          const isOpen = expanded[s.id] ?? (isActive || idx === 0 || filter !== "all");

          return (
            <li key={s.id} className="relative">
              {/* Milestone dot on the spine */}
              <span
                className={`absolute -left-[14px] top-3 z-10 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-card ${
                  isActive
                    ? "bg-success shadow-[0_0_0_4px_color-mix(in_oklab,var(--success)_20%,transparent)]"
                    : "bg-muted-foreground/50"
                }`}
                aria-hidden
              >
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-card" />}
              </span>

              <div
                className={`overflow-hidden rounded-2xl border bg-background/60 transition-all ${
                  isActive
                    ? "border-success/40 shadow-[0_0_0_1px_color-mix(in_oklab,var(--success)_15%,transparent)]"
                    : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [s.id]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent/20"
                  aria-expanded={isOpen}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                        isActive
                          ? "bg-success/10 text-success ring-success/30"
                          : "bg-muted/50 text-muted-foreground ring-border"
                      }`}
                    >
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-display text-sm font-bold text-foreground">
                          {s.name}
                        </p>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success ring-1 ring-success/30">
                            <Sparkles className="h-2.5 w-2.5" /> Ativa
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {fmtMonthYear(startTs)}
                        {endTs ? ` → ${fmtMonthYear(endTs)}` : isActive ? " → hoje" : ""}
                        {" · "}
                        {rounds.length} rodada{rounds.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <CountChip
                      tone="success"
                      symbol="✓"
                      value={counts.completed}
                      title="Concluídas"
                    />
                    <CountChip
                      tone="info"
                      symbol="⏳"
                      value={counts.scheduled + counts.in_progress}
                      title="Próximas"
                    />
                    {counts.cancelled > 0 && (
                      <CountChip
                        tone="destructive"
                        symbol="✗"
                        value={counts.cancelled}
                        title="Canceladas"
                      />
                    )}
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isOpen && rounds.length > 0 && (
                  <div className="border-t border-border/60 bg-card/40 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {rounds.map((r) => {
                        const meta = STATUS_META[r.status];
                        const Icon = meta.Icon;
                        return (
                          <button
                            key={r.roundId}
                            type="button"
                            onClick={() =>
                              setSelected({
                                groupId: groupId!,
                                seasonId: s.id,
                                roundId: r.roundId,
                                roundNumber: r.roundNumber,
                                status: r.status,
                                ts: r.ts,
                                matches: r.matches,
                              })
                            }
                            className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 transition-all hover:-translate-y-0.5 hover:shadow-sm ${meta.chip}`}
                            title={`${meta.label} · ${fmtDate(r.ts)}${
                              r.roundNumber ? ` · #${r.roundNumber}` : ""
                            }`}
                          >
                            <Icon className="h-2.5 w-2.5" />
                            <span className="tabular-nums">
                              {r.roundNumber ? `R${r.roundNumber}` : fmtDate(r.ts)}
                            </span>
                            <span className="hidden text-[9px] opacity-70 sm:inline">
                              · {fmtDate(r.ts)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {!isActive && onSelect && (
                      <button
                        type="button"
                        onClick={() => onSelect(s.id)}
                        className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                      >
                        Ver detalhes da temporada →
                      </button>
                    )}
                  </div>
                )}

                {isOpen && rounds.length === 0 && (
                  <div className="border-t border-border/60 bg-card/30 p-3">
                    <p className="text-[10px] italic text-muted-foreground">
                      Nenhuma rodada nesta temporada ainda.
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Detail modal */}
      {selected &&
        (() => {
          const meta = STATUS_META[selected.status];
          const dateStr = new Date(selected.ts).toLocaleDateString("pt-BR", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const isCompleted = selected.status === "completed";

          return (
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-background/60 p-4 pb-28 backdrop-blur-sm sm:items-center sm:pb-4"
              onClick={() => setSelected(null)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    <h4 className="font-display text-sm font-bold text-foreground">
                      Rodada {selected.roundNumber != null ? `#${selected.roundNumber}` : ""} —{" "}
                      {meta.label}
                    </h4>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-md p-0.5 text-muted-foreground hover:bg-accent"
                    aria-label="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {dateStr}
                  {isCompleted && ` · ${selected.matches} partida${selected.matches !== 1 ? "s" : ""}`}
                </p>

                {isCompleted && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/10 p-2.5">
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      🏆 Top 3 da rodada
                    </p>
                    {podiumLoading ? (
                      <p className="text-center text-[10px] text-muted-foreground">Carregando…</p>
                    ) : !podium || podium.length === 0 ? (
                      <p className="text-center text-[10px] text-muted-foreground">
                        Sem placar registrado
                      </p>
                    ) : (
                      <ol className="space-y-1">
                        {podium.map((p, i) => {
                          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
                          return (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 rounded-lg bg-background/40 px-2 py-1"
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openProfile(p.userId);
                                }}
                                className="flex min-w-0 items-center gap-1.5 truncate text-left text-[11px] hover:text-primary"
                                title={`Ver perfil de ${p.name}`}
                              >
                                <span className="shrink-0">{medal}</span>
                                <PlayerAvatar
                                  avatarUrl={p.avatarUrl}
                                  name={p.name}
                                  size="xs"
                                  className="shrink-0"
                                />
                                <span className="truncate font-bold text-foreground hover:text-primary">
                                  {p.name}
                                </span>
                              </button>
                              <span className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
                                <span>{p.subtitle}</span>
                                {typeof p.eloDelta === "number" && (
                                  <span
                                    className={
                                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold " +
                                      (p.eloDelta > 0
                                        ? "bg-success/15 text-success"
                                        : p.eloDelta < 0
                                          ? "bg-destructive/15 text-destructive"
                                          : "bg-muted text-muted-foreground")
                                    }
                                    title="Variação de Elo na rodada"
                                  >
                                    {p.eloDelta > 0 ? "+" : ""}
                                    {Math.round(p.eloDelta)}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: selected.groupId }}
                    search={
                      {
                        view: "seasons",
                        season: selected.seasonId,
                        round: selected.roundId,
                      } as any
                    }
                    onClick={() => setSelected(null)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90"
                  >
                    Abrir rodada
                  </Link>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function LegendDot({
  tone,
  label,
}: {
  tone: "success" | "info" | "destructive";
  label: string;
}) {
  const cls =
    tone === "success"
      ? "bg-success"
      : tone === "info"
        ? "bg-info"
        : "bg-destructive";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

function CountChip({
  tone,
  symbol,
  value,
  title,
}: {
  tone: "success" | "info" | "destructive";
  symbol: string;
  value: number;
  title: string;
}) {
  if (value <= 0) return null;
  const cls =
    tone === "success"
      ? "bg-success/10 text-success ring-success/30"
      : tone === "info"
        ? "bg-info/10 text-info ring-info/30"
        : "bg-destructive/10 text-destructive ring-destructive/30";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ring-1 ${cls}`}
    >
      <span>{symbol}</span>
      <span>{value}</span>
    </span>
  );
}
