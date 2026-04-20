import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, ChevronDown, ChevronUp, CalendarCheck2, CalendarClock, CalendarX2, PlayCircle } from "lucide-react";
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

const STATUS_META: Record<RoundStatus, { label: string; cls: string; dot: string; Icon: typeof CalendarCheck2 }> = {
  completed: { label: "Concluída", cls: "bg-success/15 text-success ring-success/30", dot: "bg-success", Icon: CalendarCheck2 },
  scheduled: { label: "Agendada", cls: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground/70", Icon: CalendarClock },
  in_progress: { label: "Em andamento", cls: "bg-warning/15 text-warning ring-warning/30", dot: "bg-warning", Icon: PlayCircle },
  cancelled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive ring-destructive/30", dot: "bg-destructive", Icon: CalendarX2 },
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
 */
export function SeasonsTimeline({ seasons, onSelect }: Props) {
  const groupId = seasons[0]?.group_id;
  const [allRounds, setAllRounds] = useState<RoundRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<SelectedRound | null>(null);
  const [podium, setPodium] = useState<{ userId: string; name: string; avatarUrl: string | null; subtitle: string; eloDelta?: number | null }[] | null>(null);
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

  // Group rounds by season id
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

  // Sort seasons newest first
  const orderedSeasons = useMemo(() => {
    return [...seasons].sort((a, b) => {
      const aTs = a.start_date ? new Date(a.start_date).getTime() : new Date(a.created_at).getTime();
      const bTs = b.start_date ? new Date(b.start_date).getTime() : new Date(b.created_at).getTime();
      return bTs - aTs;
    });
  }, [seasons]);

  // Load podium when a completed round is selected
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
          (profs || []).map((p) => [p.user_id, { name: p.nickname || p.name || "Jogador", avatarUrl: p.avatar_url ?? null }]),
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

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Linha do tempo
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            {totalCounts.completed} concl.
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
            {totalCounts.scheduled + totalCounts.in_progress} próx.
          </span>
          {totalCounts.cancelled > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
              {totalCounts.cancelled} canc.
            </span>
          )}
        </div>
      </div>

      {/* Status filter */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {([
          { id: "all", label: `Todas (${totalCounts.completed + totalCounts.scheduled + totalCounts.in_progress + totalCounts.cancelled})` },
          { id: "completed", label: `Só concluídas (${totalCounts.completed})` },
          { id: "upcoming", label: `Só próximas (${totalCounts.scheduled + totalCounts.in_progress})` },
        ] as const).map((opt) => {
          const active = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 transition-colors ${
                active
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-background/40 text-muted-foreground ring-border hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <ul className="relative space-y-2.5 pl-4">
        {/* Vertical spine */}
        <span className="absolute left-1.5 top-1.5 bottom-1.5 w-px bg-border" aria-hidden />

        {orderedSeasons.map((s) => {
          const allSeasonRounds = roundsBySeason.get(s.id) || [];
          const rounds = allSeasonRounds.filter((r) => matchesFilter(r.status));
          // Hide season entirely when filter is active and there's nothing to show
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
          const isOpen = expanded[s.id] ?? (isActive || filter !== "all");

          return (
            <li key={s.id} className="relative">
              <span
                className={`absolute -left-[10px] top-2 inline-block h-3 w-3 rounded-full ring-2 ring-card ${
                  isActive ? "bg-success" : "bg-muted-foreground/60"
                }`}
                aria-hidden
              />

              <div className="rounded-xl border border-border bg-background/40 p-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [s.id]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-foreground">{s.name}</p>
                      {isActive && (
                        <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                          Ativa
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {counts.completed > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold text-success">
                        ✓{counts.completed}
                      </span>
                    )}
                    {counts.scheduled + counts.in_progress > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        ⏳{counts.scheduled + counts.in_progress}
                      </span>
                    )}
                    {counts.cancelled > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold text-destructive">
                        ✗{counts.cancelled}
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isOpen && rounds.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
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
                          className={`group inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ring-1 transition-all hover:scale-105 ${meta.cls}`}
                          title={`${meta.label} · ${fmtDate(r.ts)}${r.roundNumber ? ` · #${r.roundNumber}` : ""}`}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          <span>
                            {r.roundNumber ? `#${r.roundNumber}` : fmtDate(r.ts)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isOpen && rounds.length === 0 && (
                  <p className="mt-2 text-[10px] italic text-muted-foreground">
                    Nenhuma rodada nesta temporada ainda.
                  </p>
                )}

                {!isActive && onSelect && (
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="mt-2 text-[10px] font-bold text-primary hover:underline"
                  >
                    Ver detalhes da temporada →
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Detail modal */}
      {selected && (() => {
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 p-4 backdrop-blur-sm sm:items-center"
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
                    Rodada {selected.roundNumber != null ? `#${selected.roundNumber}` : ""} — {meta.label}
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
                    <p className="text-center text-[10px] text-muted-foreground">Sem placar registrado</p>
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
                              <PlayerAvatar avatarUrl={p.avatarUrl} name={p.name} size="xs" className="shrink-0" />
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
                  to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                  params={{
                    groupId: selected.groupId,
                    seasonId: selected.seasonId,
                    roundId: selected.roundId,
                  }}
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
