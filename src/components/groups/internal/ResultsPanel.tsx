import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useGroupSeasons, useSeasonRounds } from "@/hooks/use-seasons";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { buildDisplayNames } from "@/lib/name-disambiguation";
import {
  Calendar, Clock, MapPin, ChevronDown, ChevronRight, Trophy, BarChart3,
  Filter, List, Activity, Users,
} from "lucide-react";

interface Props {
  groupId: string;
  isAdmin: boolean;
}

type ViewMode = "list" | "timeline";
type Period = "all" | "30d" | "90d" | "season";

export function ResultsPanel({ groupId, isAdmin }: Props) {
  const { seasons, isLoading: seasonsLoading } = useGroupSeasons(groupId);
  const [seasonId, setSeasonId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("season");
  const [format, setFormat] = useState<"all" | "doubles" | "singles">("all");
  const [playerFilter, setPlayerFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const activeSeason = seasons.find((s) => s.status === "active");
  useEffect(() => {
    if (!seasonId && activeSeason) setSeasonId(activeSeason.id);
  }, [activeSeason, seasonId]);

  const { rounds, isLoading: roundsLoading } = useSeasonRounds(seasonId);
  const [matchesByRound, setMatchesByRound] = useState<Record<string, any[]>>({});
  const [profileMap, setProfileMap] = useState<Map<string, any>>(new Map());
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Load all matches for the season at once
  useEffect(() => {
    if (!rounds.length) { setMatchesByRound({}); return; }
    let cancelled = false;
    (async () => {
      setLoadingMatches(true);
      const ids = rounds.map((r) => r.id);
      const { data: matches } = await supabase
        .from("matches")
        .select("*, match_players(*), match_sets(*)")
        .in("round_id", ids)
        .order("match_number", { ascending: true });
      if (cancelled) return;

      const userIds = [...new Set((matches || []).flatMap((m: any) => (m.match_players || []).map((mp: any) => mp.user_id)))];
      let pmap = new Map<string, any>();
      if (userIds.length) {
        const { data: profs } = await supabase.from("user_profiles").select("user_id, name, nickname").in("user_id", userIds);
        pmap = new Map((profs || []).map((p: any) => [p.user_id, p]));
      }
      const grouped: Record<string, any[]> = {};
      for (const m of matches || []) {
        const enriched = {
          ...m,
          match_players: (m.match_players || []).map((mp: any) => ({ ...mp, profile: pmap.get(mp.user_id) })),
        };
        (grouped[m.round_id] = grouped[m.round_id] || []).push(enriched);
      }
      setMatchesByRound(grouped);
      setProfileMap(pmap);
      setLoadingMatches(false);
    })();
    return () => { cancelled = true; };
  }, [rounds]);

  const allPlayers = useMemo(() => {
    const set = new Set<string>();
    Object.values(matchesByRound).flat().forEach((m: any) => {
      (m.match_players || []).forEach((mp: any) => set.add(mp.user_id));
    });
    return [...set].map((id) => ({ id, name: profileMap.get(id)?.nickname || profileMap.get(id)?.name || "?" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matchesByRound, profileMap]);

  // Apply filters
  const filteredRounds = useMemo(() => {
    const cutoff = (() => {
      if (period === "30d") { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
      if (period === "90d") { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); }
      return null;
    })();
    return rounds.filter((r) => {
      if (cutoff && (r.scheduled_date || "") < cutoff) return false;
      const rmatches = matchesByRound[r.id] || [];
      // format filter
      if (format !== "all") {
        const isF = rmatches.some((m: any) => format === "doubles" ? (m.match_format || "").includes("doubles") || m.match_format === "2v2" : (m.match_format || "").includes("singles") || m.match_format === "1v1");
        if (rmatches.length && !isF) return false;
      }
      // player filter
      if (playerFilter) {
        const has = rmatches.some((m: any) => (m.match_players || []).some((mp: any) => mp.user_id === playerFilter));
        if (!has) return false;
      }
      return true;
    });
  }, [rounds, matchesByRound, period, format, playerFilter]);

  // Stats
  const stats = useMemo(() => {
    const all = filteredRounds.flatMap((r) => matchesByRound[r.id] || []);
    const completed = all.filter((m: any) => m.status === "completed");
    const totalMatches = completed.length;
    let games = 0;
    for (const m of completed) {
      for (const s of m.match_sets || []) games += (s.score_team_a || 0) + (s.score_team_b || 0);
    }
    // top duos
    const duoMap = new Map<string, { count: number; wins: number; names: string }>();
    for (const m of completed) {
      const a = (m.match_players || []).filter((mp: any) => mp.team === "A").map((mp: any) => mp.user_id).sort();
      const b = (m.match_players || []).filter((mp: any) => mp.team === "B").map((mp: any) => mp.user_id).sort();
      [["A", a], ["B", b]].forEach(([team, ids]: any) => {
        if (ids.length < 2) return;
        const key = ids.join("-");
        const cur = duoMap.get(key) || { count: 0, wins: 0, names: ids.map((i: string) => profileMap.get(i)?.nickname || profileMap.get(i)?.name || "?").join(" / ") };
        cur.count += 1;
        if (m.winner_team === team) cur.wins += 1;
        duoMap.set(key, cur);
      });
    }
    const topDuos = [...duoMap.values()]
      .filter((d) => d.count >= 2)
      .sort((a, b) => (b.wins / b.count) - (a.wins / a.count) || b.wins - a.wins)
      .slice(0, 3);
    const winRate = totalMatches > 0 ? Math.round((completed.filter((m: any) => m.winner_team).length / totalMatches) * 100) : 0;
    return { rounds: filteredRounds.length, matches: totalMatches, games, topDuos, winRate };
  }, [filteredRounds, matchesByRound, profileMap]);

  if (seasonsLoading) return <TrophyLoadingBar fullScreen={false} compact />;

  if (!seasons.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
        <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <h3 className="font-display text-base font-bold text-foreground">Nenhuma temporada</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Crie a primeira temporada para começar." : "Aguarde o admin iniciar uma temporada."}
        </p>
      </div>
    );
  }

  const formatDate = (d: string | null) => {
    if (!d) return "Sem data";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3 rounded-3xl border border-border bg-card/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none">
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "active" ? " · Ativa" : ""}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none">
            <option value="season">Temporada toda</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value as any)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none">
            <option value="all">Todos os formatos</option>
            <option value="doubles">Duplas</option>
            <option value="singles">Simples</option>
          </select>
          <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none">
            <option value="">Todos os jogadores</option>
            {allPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="ml-auto flex gap-1 rounded-full border border-border bg-background p-1">
            <button onClick={() => setViewMode("list")} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              <List className="h-3 w-3" />Lista
            </button>
            <button onClick={() => setViewMode("timeline")} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${viewMode === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              <Activity className="h-3 w-3" />Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Calendar} label="Rodadas" value={stats.rounds} />
        <StatCard icon={BarChart3} label="Partidas" value={stats.matches} />
        <StatCard icon={Trophy} label="Games jogados" value={stats.games} />
        <StatCard icon={Users} label="Top duplas" value={stats.topDuos.length} />
      </div>

      {/* Top duos panel */}
      {stats.topDuos.length > 0 && (
        <div className="rounded-3xl border border-border bg-card/40 p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Duplas mais bem-sucedidas</h3>
          <ul className="divide-y divide-border">
            {stats.topDuos.map((d, idx) => (
              <li key={idx} className="flex items-center gap-3 py-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                <span className="flex-1 truncate text-sm font-medium text-foreground">{d.names}</span>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">{d.wins}/{d.count} ({Math.round((d.wins / d.count) * 100)}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* List or timeline */}
      {roundsLoading || loadingMatches ? (
        <TrophyLoadingBar fullScreen={false} compact />
      ) : filteredRounds.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          Nenhuma rodada nesse filtro.
        </div>
      ) : viewMode === "list" ? (
        <RoundsListView
          rounds={filteredRounds}
          matchesByRound={matchesByRound}
          profileMap={profileMap}
          formatDate={formatDate}
          groupId={groupId}
          seasonId={seasonId}
        />
      ) : (
        <TimelineView
          rounds={filteredRounds}
          matchesByRound={matchesByRound}
          formatDate={formatDate}
          groupId={groupId}
          seasonId={seasonId}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-1 font-display text-xl font-black text-foreground">{value}</p>
    </div>
  );
}

function RoundsListView({ rounds, matchesByRound, profileMap, formatDate, groupId, seasonId }: any) {
  // Group by status
  const completed = rounds.filter((r: any) => r.status === "completed").sort((a: any, b: any) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));
  const upcoming = rounds.filter((r: any) => r.status !== "completed" && r.status !== "cancelled").sort((a: any, b: any) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
  const cancelled = rounds.filter((r: any) => r.status === "cancelled");

  return (
    <div className="space-y-4">
      {completed.length > 0 && <Section title="Recentes" count={completed.length}><div className="space-y-2">{completed.map((r: any, i: number) => <RoundRow key={r.id} r={r} matches={matchesByRound[r.id] || []} profileMap={profileMap} formatDate={formatDate} groupId={groupId} seasonId={seasonId} defaultOpen={i === 0} />)}</div></Section>}
      {upcoming.length > 0 && <Section title="Próximas" count={upcoming.length}><div className="space-y-2">{upcoming.map((r: any) => <RoundRow key={r.id} r={r} matches={matchesByRound[r.id] || []} profileMap={profileMap} formatDate={formatDate} groupId={groupId} seasonId={seasonId} defaultOpen={false} />)}</div></Section>}
      {cancelled.length > 0 && <Section title="Canceladas" count={cancelled.length}><div className="space-y-2">{cancelled.map((r: any) => <RoundRow key={r.id} r={r} matches={matchesByRound[r.id] || []} profileMap={profileMap} formatDate={formatDate} groupId={groupId} seasonId={seasonId} defaultOpen={false} />)}</div></Section>}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <span className="text-[10px] text-muted-foreground/60">({count})</span>
      </div>
      {children}
    </div>
  );
}

function RoundRow({ r, matches, formatDate, groupId, seasonId, defaultOpen }: any) {
  const [open, setOpen] = useState(defaultOpen);
  const isCancelled = r.status === "cancelled";
  const isCompleted = r.status === "completed";

  const totalGames = matches.reduce((sum: number, m: any) => sum + (m.match_sets || []).reduce((s: number, x: any) => s + (x.score_team_a || 0) + (x.score_team_b || 0), 0), 0);

  const displayNames = useMemo(() => {
    const seen = new Map<string, any>();
    for (const m of matches) {
      for (const mp of m.match_players || []) {
        if (!seen.has(mp.user_id)) seen.set(mp.user_id, { id: mp.user_id, name: mp.profile?.name || "Jogador", nickname: mp.profile?.nickname || null });
      }
    }
    return buildDisplayNames([...seen.values()]);
  }, [matches]);

  const teamPlayers = (m: any, team: "A" | "B") =>
    (m.match_players || []).filter((mp: any) => mp.team === team)
      .map((mp: any) => displayNames.get(mp.user_id) || mp.profile?.nickname || mp.profile?.name || "?").join(" / ");

  const statusLabel = isCancelled ? "Cancelada" : isCompleted ? "Encerrada" : r.status === "in_progress" ? "Em jogo" : "Agendada";
  const statusClass = isCancelled ? "bg-destructive/10 text-destructive" : isCompleted ? "bg-success/10 text-success" : r.status === "in_progress" ? "bg-warning/10 text-warning" : "bg-info/10 text-info";

  return (
    <div className={`rounded-2xl border border-border bg-card/50 ${isCancelled ? "opacity-50" : ""}`}>
      <button onClick={() => !isCancelled && setOpen((v: boolean) => !v)} disabled={isCancelled} className="flex w-full items-center justify-between p-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isCancelled ? "bg-muted" : "bg-primary/10"}`}>
            <span className={`font-display text-sm font-bold ${isCancelled ? "text-muted-foreground" : "text-primary"}`}>R{r.round_number || "?"}</span>
          </div>
          <div className="min-w-0">
            <span className={`text-sm font-semibold ${isCancelled ? "line-through text-muted-foreground" : "text-foreground"}`}>Rodada {r.round_number}</span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(r.scheduled_date)}</span>
              {r.scheduled_time && !isCancelled && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.scheduled_time.slice(0, 5)}</span>}
              {r.location && !isCancelled && <span className="flex items-center gap-1 truncate max-w-[12rem]"><MapPin className="h-3 w-3" />{r.location}</span>}
              {isCompleted && totalGames > 0 && <span className="font-semibold text-primary">{totalGames} games</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span>
          {!isCancelled && <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />}
        </div>
      </button>
      {open && !isCancelled && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {matches.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nenhuma partida registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m: any) => {
                const sets = (m.match_sets || []).sort((a: any, b: any) => a.set_number - b.set_number);
                const winA = m.winner_team === "A";
                const winB = m.winner_team === "B";
                return (
                  <div key={m.id} className="rounded-xl border border-border bg-background/50 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`flex-1 truncate font-medium ${winA ? "text-success" : "text-foreground"}`}>{teamPlayers(m, "A") || "—"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {sets.length > 0 ? sets.map((s: any) => `${s.score_team_a}-${s.score_team_b}`).join("  ") : m.status === "completed" ? "vs" : "agendada"}
                      </span>
                      <span className={`flex-1 truncate text-right font-medium ${winB ? "text-success" : "text-foreground"}`}>{teamPlayers(m, "B") || "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link to="/groups/$groupId/seasons/$seasonId/rounds/$roundId" params={{ groupId, seasonId, roundId: r.id }} className="mt-3 flex items-center justify-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground">
            Ver detalhes <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function TimelineView({ rounds, matchesByRound, formatDate, groupId, seasonId }: any) {
  const sorted = [...rounds].sort((a: any, b: any) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));
  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
      <ul className="space-y-4">
        {sorted.map((r: any) => {
          const matches = matchesByRound[r.id] || [];
          const completed = matches.filter((m: any) => m.status === "completed").length;
          const isCompleted = r.status === "completed";
          return (
            <li key={r.id} className="relative">
              <span className={`absolute -left-4 top-2 h-3 w-3 rounded-full ring-4 ring-background ${isCompleted ? "bg-success" : r.status === "cancelled" ? "bg-destructive" : "bg-primary"}`} />
              <Link
                to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                params={{ groupId, seasonId, roundId: r.id }}
                className="block rounded-2xl border border-border bg-card/50 p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide">{formatDate(r.scheduled_date)}</span>
                  <span>{matches.length} partida{matches.length !== 1 ? "s" : ""} · {completed} concluída{completed !== 1 ? "s" : ""}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-foreground">Rodada {r.round_number}</p>
                {r.location && <p className="text-[11px] text-muted-foreground">{r.location}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
