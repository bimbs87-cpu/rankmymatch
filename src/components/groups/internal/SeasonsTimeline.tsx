import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
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

interface EventMarker {
  ts: number;
  left: number;
  type: "round" | "season_finished";
  status?: RoundStatus;
  label: string;
  detail: string;
  // For round: link to the round page
  roundId?: string;
  roundNumber?: number | null;
  matches?: number;
  seasonId?: string | null;
  // For season_finished
  seasonNameForLink?: string;
  groupId?: string;
}

interface RoundRow {
  ts: number;
  status: RoundStatus;
  matches: number;
  roundId: string;
  roundNumber: number | null;
  seasonId: string | null;
}

/**
 * Mini horizontal timeline of seasons with markers for every round
 * (concluída/agendada/cancelada). Tooltip per marker; click opens podium/details.
 */
export function SeasonsTimeline({ seasons, onSelect }: Props) {
  const groupId = seasons[0]?.group_id;

  const [allRounds, setAllRounds] = useState<RoundRow[]>([]);

  const [selectedMarker, setSelectedMarker] = useState<EventMarker | null>(null);
  const [podium, setPodium] = useState<{ userId: string; name: string; avatarUrl: string | null; value: number; subtitle?: string; eloDelta?: number | null }[] | null>(null);
  const [podiumLoading, setPodiumLoading] = useState(false);
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
    return () => { cancelled = true; };
  }, [groupId]);

  // Load top-3 podium when a marker is selected
  useEffect(() => {
    let cancelled = false;
    setPodium(null);
    if (!selectedMarker) return;
    (async () => {
      setPodiumLoading(true);
      try {
        if (selectedMarker.type === "round" && selectedMarker.status === "completed" && selectedMarker.roundId) {
          const { data: ms } = await supabase
            .from("matches")
            .select("id, winner_team")
            .eq("round_id", selectedMarker.roundId);
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
            if (w && w === mp.team) {
              wins.set(mp.user_id, (wins.get(mp.user_id) || 0) + 1);
            }
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
          // Sum Elo deltas of this round's matches for the top-3 users.
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
              value: v,
              subtitle: `${v} vitória${v !== 1 ? "s" : ""}`,
              eloDelta: eloMap.has(uid) ? eloMap.get(uid)! : null,
            })),
          );
        } else if (selectedMarker.type === "season_finished" && selectedMarker.seasonId) {
          const { data: snaps } = await supabase
            .from("ranking_snapshots")
            .select("user_id, rating, position, snapshot_date")
            .eq("season_id", selectedMarker.seasonId)
            .order("snapshot_date", { ascending: false })
            .limit(200);
          if (!snaps?.length) return;
          // Take latest snapshot date
          const latestDate = snaps[0].snapshot_date;
          const latest = snaps.filter((s) => s.snapshot_date === latestDate);
          const top = [...latest]
            .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || b.rating - a.rating)
            .slice(0, 3);
          const ids = top.map((s) => s.user_id);
          const { data: profs } = await supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", ids);
          const profMap = new Map(
            (profs || []).map((p) => [p.user_id, { name: p.nickname || p.name || "Jogador", avatarUrl: p.avatar_url ?? null }]),
          );
          if (cancelled) return;
          setPodium(
            top.map((s) => ({
              userId: s.user_id,
              name: profMap.get(s.user_id)?.name || "Jogador",
              avatarUrl: profMap.get(s.user_id)?.avatarUrl ?? null,
              value: Math.round(s.rating),
              subtitle: `${Math.round(s.rating)} pts`,
            })),
          );
        }
      } finally {
        if (!cancelled) setPodiumLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMarker]);

  const { bars, ticks, rangeLabel, markers } = useMemo(() => {
    if (!seasons.length) return { bars: [], ticks: [], rangeLabel: "", markers: [] as EventMarker[] };

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

    const markers: EventMarker[] = [];
    for (const i of items) {
      if (!i.isActive && i.season.end_date) {
        const ts = new Date(i.season.end_date + "T12:00:00").getTime();
        if (ts >= min && ts <= max) {
          markers.push({
            ts,
            left: ((ts - min) / span) * 100,
            type: "season_finished",
            label: `Temporada encerrada`,
            detail: `${i.season.name} encerrada em ${new Date(ts).toLocaleDateString("pt-BR")}`,
            seasonId: i.season.id,
            seasonNameForLink: i.season.name,
            groupId: i.season.group_id,
          });
        }
      }
    }
    for (const r of allRounds) {
      if (r.ts < min || r.ts > max) continue;
      const dateStr = new Date(r.ts).toLocaleDateString("pt-BR");
      const numLabel = r.roundNumber ? `Rodada #${r.roundNumber}` : "Rodada";
      let label: string;
      let detail: string;
      switch (r.status) {
        case "completed":
          label = "Rodada concluída";
          detail = `${numLabel} · ${r.matches} partida${r.matches !== 1 ? "s" : ""} em ${dateStr}`;
          break;
        case "cancelled":
          label = "Rodada cancelada";
          detail = `${numLabel} cancelada (${dateStr})`;
          break;
        case "in_progress":
          label = "Rodada em andamento";
          detail = `${numLabel} em andamento (${dateStr})`;
          break;
        default:
          label = "Rodada agendada";
          detail = `${numLabel} agendada para ${dateStr}`;
      }
      markers.push({
        ts: r.ts,
        left: ((r.ts - min) / span) * 100,
        type: "round",
        status: r.status,
        label,
        detail,
        roundId: r.roundId,
        roundNumber: r.roundNumber,
        matches: r.matches,
        seasonId: r.seasonId,
        groupId,
      });
    }

    const rangeLabel = `${new Date(min).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} → hoje`;

    return { bars, ticks, rangeLabel, markers };
  }, [seasons, allRounds, groupId]);

  if (!bars.length) return null;

  const rowHeight = 14;
  const markerRowHeight = 12;
  const totalHeight = bars.length * (rowHeight + 4) + markerRowHeight + 22;
  const markersTop = bars.length * (rowHeight + 4) + 2;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Linha do tempo
        </p>
        <p className="text-[10px] tabular-nums text-muted-foreground">{rangeLabel}</p>
      </div>

      {/* Compact summary of round counts by status */}
      {(() => {
        const c = { completed: 0, scheduled: 0, cancelled: 0, in_progress: 0 } as Record<RoundStatus, number>;
        for (const r of allRounds) c[r.status] = (c[r.status] || 0) + 1;
        return (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/80">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-success" />
              {c.completed} concluída{c.completed !== 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60" />
              {c.scheduled + c.in_progress} agendada{c.scheduled + c.in_progress !== 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
              {c.cancelled} cancelada{c.cancelled !== 1 ? "s" : ""}
            </span>
          </div>
        );
      })()}

      <div className="relative w-full overflow-hidden" style={{ height: totalHeight }}>
        {ticks.map((t) => (
          <div
            key={t.year}
            className="absolute top-0 w-px bg-border/50"
            style={{ left: `${t.left}%`, bottom: 20 }}
          />
        ))}
        <div className="absolute top-0 w-px bg-primary/60" style={{ left: "100%", bottom: 20 }}>
          <span className="absolute -top-0.5 -translate-x-full -translate-y-full text-[9px] font-bold text-primary">
            hoje
          </span>
        </div>

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

        {markers.map((m, i) => (
          <button
            key={`${m.type}-${m.ts}-${i}`}
            type="button"
            onClick={() => setSelectedMarker(m)}
            className="absolute -translate-x-1/2 cursor-pointer transition-transform hover:scale-150"
            style={{ left: `${m.left}%`, top: markersTop }}
            title={m.detail}
            aria-label={m.label}
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                m.type === "season_finished"
                  ? "bg-foreground/70"
                  : m.status === "completed"
                    ? "bg-success"
                    : m.status === "cancelled"
                      ? "bg-destructive"
                      : "bg-muted-foreground/70"
              }`}
            />
          </button>
        ))}

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
          <span className="inline-block h-2 w-2 rounded-sm bg-success/70" /> Temporada ativa
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40" /> Temporada encerrada
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-success" /> Concluída
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/70" /> Agendada
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-destructive" /> Cancelada
        </span>
      </div>

      {/* Detail popover for selected marker */}
      {selectedMarker && (() => {
        const isScheduledLike =
          selectedMarker.type === "round" &&
          (selectedMarker.status === "scheduled" || selectedMarker.status === "in_progress");

        // Mini-popover for scheduled/in-progress rounds: no podium, just essentials.
        if (isScheduledLike) {
          const dateStr = new Date(selectedMarker.ts).toLocaleDateString("pt-BR", {
            weekday: "short",
            day: "2-digit",
            month: "short",
          });
          return (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-background/40 p-4 backdrop-blur-sm sm:items-center"
              onClick={() => setSelectedMarker(null)}
            >
              <div
                className="w-full max-w-xs rounded-2xl border border-border bg-card p-3 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        selectedMarker.status === "in_progress" ? "bg-warning" : "bg-muted-foreground/70"
                      }`}
                    />
                    <h4 className="text-xs font-bold text-foreground">
                      {selectedMarker.status === "in_progress" ? "Rodada em andamento" : "Rodada agendada"}
                    </h4>
                  </div>
                  <button
                    onClick={() => setSelectedMarker(null)}
                    className="rounded-md p-0.5 text-muted-foreground hover:bg-accent"
                    aria-label="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mb-3 text-[11px] tabular-nums text-muted-foreground">
                  {selectedMarker.roundNumber != null && (
                    <span className="font-bold text-foreground">Rodada #{selectedMarker.roundNumber}</span>
                  )}
                  {selectedMarker.roundNumber != null && " · "}
                  {dateStr}
                </p>
                {selectedMarker.groupId && selectedMarker.seasonId && selectedMarker.roundId && (
                  <Link
                    to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                    params={{
                      groupId: selectedMarker.groupId,
                      seasonId: selectedMarker.seasonId,
                      roundId: selectedMarker.roundId,
                    }}
                    onClick={() => setSelectedMarker(null)}
                    className="block w-full rounded-lg bg-primary py-1.5 text-center text-[11px] font-bold text-primary-foreground hover:opacity-90"
                  >
                    Abrir rodada
                  </Link>
                )}
              </div>
            </div>
          );
        }

        // Rich modal for completed rounds + finished seasons (with podium).
        return (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSelectedMarker(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${
                    selectedMarker.type === "season_finished"
                      ? "bg-foreground/70"
                      : selectedMarker.status === "completed"
                        ? "bg-success"
                        : selectedMarker.status === "cancelled"
                          ? "bg-destructive"
                          : "bg-muted-foreground/70"
                  }`}
                />
                <h4 className="font-display text-sm font-bold text-foreground">
                  {selectedMarker.type === "season_finished"
                    ? "🏁 Temporada encerrada"
                    : selectedMarker.status === "completed"
                      ? "✅ Rodada concluída"
                      : selectedMarker.status === "cancelled"
                        ? "🚫 Rodada cancelada"
                        : "📅 Rodada agendada"}
                </h4>
              </div>
              <button
                onClick={() => setSelectedMarker(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{selectedMarker.detail}</p>
            {selectedMarker.type === "round" && selectedMarker.roundNumber != null && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                <span className="text-foreground font-bold">Rodada #{selectedMarker.roundNumber}</span>
                {selectedMarker.matches != null && selectedMarker.status === "completed" && ` · ${selectedMarker.matches} partidas`}
              </p>
            )}

            {/* Podium only meaningful for completed rounds & finished seasons */}
            {(selectedMarker.type === "season_finished" ||
              (selectedMarker.type === "round" && selectedMarker.status === "completed")) && (
            <div className="mt-3 rounded-xl border border-border bg-muted/10 p-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {selectedMarker.type === "round" ? "🏆 Top 3 da rodada" : "🏆 Top 3 da temporada"}
              </p>
              {podiumLoading ? (
                <p className="text-center text-[10px] text-muted-foreground">Carregando…</p>
              ) : !podium || podium.length === 0 ? (
                <p className="text-center text-[10px] text-muted-foreground">
                  {selectedMarker.type === "round"
                    ? "Sem placar registrado"
                    : "Sem ranking final disponível"}
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
            <div className="mt-3 flex items-center justify-end gap-2">
              {selectedMarker.type === "round" &&
                selectedMarker.groupId &&
                selectedMarker.seasonId &&
                selectedMarker.roundId && (
                  <Link
                    to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                    params={{
                      groupId: selectedMarker.groupId,
                      seasonId: selectedMarker.seasonId,
                      roundId: selectedMarker.roundId,
                    }}
                    onClick={() => setSelectedMarker(null)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90"
                  >
                    Abrir rodada
                  </Link>
                )}
              {selectedMarker.type === "season_finished" && selectedMarker.seasonId && (
                <button
                  type="button"
                  onClick={() => {
                    onSelect?.(selectedMarker.seasonId!);
                    setSelectedMarker(null);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90"
                >
                  Ir para temporada
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
