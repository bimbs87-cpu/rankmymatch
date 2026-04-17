import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Swords } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { buildDisplayNames, type NameInput } from "@/lib/name-disambiguation";

interface PlayerRef {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface MatchHistory {
  id: string;
  matchId: string;
  date: string;
  matchNumber: number | null;
  winnerTeam: string | null;
  myTeam: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  teammates: PlayerRef[];
  opponents: PlayerRef[];
  sets: { scoreA: number; scoreB: number }[];
  seasonName: string;
  groupId: string | null;
  groupName: string;
}

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [matches, setMatches] = useState<MatchHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [selected, setSelected] = useState<MatchHistory | null>(null);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setIsLoading(true);

      // Get all rating events for user
      const { data: events } = await supabase
        .from("rating_events")
        .select("match_id, rating_before, rating_after, rating_change, season_id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (!events?.length) {
        setMatches([]);
        setIsLoading(false);
        return;
      }

      const matchIds = events.map((e) => e.match_id);
      const seasonIds = [...new Set(events.map((e) => e.season_id).filter(Boolean))] as string[];

      // Fetch matches, players, sets, seasons in parallel
      const [matchesRes, playersRes, setsRes, seasonsRes] = await Promise.all([
        supabase.from("matches").select("id, match_number, winner_team, created_at, round_id").in("id", matchIds),
        supabase.from("match_players").select("match_id, user_id, team").in("match_id", matchIds),
        supabase.from("match_sets").select("match_id, set_number, score_team_a, score_team_b").in("match_id", matchIds).order("set_number", { ascending: true }),
        seasonIds.length ? supabase.from("seasons").select("id, name, group_id").in("id", seasonIds) : Promise.resolve({ data: [] }),
      ]);

      // Fetch rounds to map matches → group when no season + get scheduled date
      const roundIds = [...new Set((matchesRes.data || []).map((m: any) => m.round_id).filter(Boolean))];
      const { data: roundsData } = roundIds.length
        ? await supabase.from("rounds").select("id, group_id, scheduled_date, created_at").in("id", roundIds)
        : { data: [] as any[] };
      const roundMap = new Map((roundsData || []).map((r: any) => [r.id, r.group_id]));
      const roundDateMap = new Map((roundsData || []).map((r: any) => [r.id, r.scheduled_date || r.created_at]));

      // Fetch group names
      const groupIds = [
        ...new Set([
          ...((seasonsRes.data || []).map((s: any) => s.group_id)),
          ...((roundsData || []).map((r: any) => r.group_id)),
        ].filter(Boolean)),
      ] as string[];
      const { data: groupsData } = groupIds.length
        ? await supabase.from("groups").select("id, name").in("id", groupIds)
        : { data: [] as any[] };
      const groupMap = new Map((groupsData || []).map((g: any) => [g.id, g.name]));

      // Fetch all player profiles
      const allPlayerIds = [...new Set((playersRes.data || []).map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url")
        .in("user_id", allPlayerIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const matchMap = new Map((matchesRes.data || []).map((m) => [m.id, m]));
      const seasonMap = new Map((seasonsRes.data || []).map((s) => [s.id, s]));

      const playersByMatch = new Map<string, typeof playersRes.data>();
      (playersRes.data || []).forEach((p) => {
        if (!playersByMatch.has(p.match_id)) playersByMatch.set(p.match_id, []);
        playersByMatch.get(p.match_id)!.push(p);
      });

      const setsByMatch = new Map<string, typeof setsRes.data>();
      (setsRes.data || []).forEach((s) => {
        if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, []);
        setsByMatch.get(s.match_id)!.push(s);
      });

      const result: MatchHistory[] = events.map((event) => {
        const match = matchMap.get(event.match_id);
        const players = playersByMatch.get(event.match_id) || [];
        const sets = setsByMatch.get(event.match_id) || [];
        const season = event.season_id ? seasonMap.get(event.season_id) : null;

        const myPlayer = players.find((p) => p.user_id === user!.id);
        const myTeam = myPlayer?.team || "A";

        const teammates: PlayerRef[] = players
          .filter((p) => p.team === myTeam && p.user_id !== user!.id)
          .map((p) => {
            const prof = profileMap.get(p.user_id);
            return {
              user_id: p.user_id,
              name: prof?.name || "Jogador",
              nickname: prof?.nickname || null,
              avatar_url: prof?.avatar_url || null,
            };
          });

        const opponents: PlayerRef[] = players
          .filter((p) => p.team !== myTeam)
          .map((p) => {
            const prof = profileMap.get(p.user_id);
            return {
              user_id: p.user_id,
              name: prof?.name || "Jogador",
              nickname: prof?.nickname || null,
              avatar_url: prof?.avatar_url || null,
            };
          });

        const groupId =
          (season as any)?.group_id ||
          (match?.round_id ? roundMap.get(match.round_id) : null) ||
          null;
        const groupName = groupId ? (groupMap.get(groupId) || "Grupo") : "Sem grupo";

        const matchDate =
          (match?.round_id ? (roundDateMap.get(match.round_id) as string | undefined) : undefined) ||
          match?.created_at ||
          event.created_at;

        return {
          id: event.match_id + event.created_at,
          matchId: event.match_id,
          date: matchDate,
          matchNumber: match?.match_number || null,
          winnerTeam: match?.winner_team || null,
          myTeam,
          ratingBefore: Number(event.rating_before),
          ratingAfter: Number(event.rating_after),
          ratingChange: Number(event.rating_change),
          teammates,
          opponents,
          sets: sets.map((s) => ({ scoreA: s.score_team_a, scoreB: s.score_team_b })),
          seasonName: season?.name || "Temporada",
          groupId,
          groupName,
        };
      });

      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setMatches(result);
      setIsLoading(false);
    }

    load();
  }, [user]);

  // Build a per-group display-name map. We collect every player ever seen in a
  // match for a given group, then disambiguate within that group only.
  const displayNameByGroup = useMemo(() => {
    const byGroup = new Map<string, Map<string, NameInput>>();
    for (const m of matches) {
      const key = m.groupId || "__none__";
      if (!byGroup.has(key)) byGroup.set(key, new Map());
      const bucket = byGroup.get(key)!;
      for (const p of [...m.teammates, ...m.opponents]) {
        if (!bucket.has(p.user_id)) {
          bucket.set(p.user_id, { id: p.user_id, name: p.name, nickname: p.nickname });
        }
      }
    }
    const out = new Map<string, Map<string, string>>();
    for (const [groupKey, bucket] of byGroup) {
      out.set(groupKey, buildDisplayNames([...bucket.values()]));
    }
    return out;
  }, [matches]);

  if (authLoading || isLoading) {
    return <TrophyLoadingBar />;
  }

  const labelFor = (groupId: string | null, player: PlayerRef): string => {
    const key = groupId || "__none__";
    return displayNameByGroup.get(key)?.get(player.user_id) || player.nickname || player.name;
  };

  const groupsList = Array.from(
    new Map(matches.filter((m) => m.groupId).map((m) => [m.groupId!, m.groupName])).entries()
  ).map(([id, name]) => ({ id, name }));

  // Helper: derive winner from set scores when winner_team is missing.
  // Mirrors the same logic used per-card so summary numbers stay in sync.
  const resolveWinner = (m: MatchHistory): string | null => {
    if (m.winnerTeam) return m.winnerTeam;
    if (m.sets.length === 0) return null;
    const a = m.sets.reduce((s, x) => s + x.scoreA, 0);
    const b = m.sets.reduce((s, x) => s + x.scoreB, 0);
    if (a === b) return null;
    return a > b ? "A" : "B";
  };

  const filteredMatches =
    groupFilter === "all" ? matches : matches.filter((m) => m.groupId === groupFilter);

  const wins = filteredMatches.filter((m) => resolveWinner(m) === m.myTeam).length;
  const losses = filteredMatches.filter((m) => {
    const w = resolveWinner(m);
    return w != null && w !== m.myTeam;
  }).length;
  const pending = filteredMatches.length - wins - losses;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;
  const totalElo = filteredMatches.reduce((sum, m) => sum + m.ratingChange, 0);

  const groupedByMonth = (() => {
    const groups = new Map<string, MatchHistory[]>();
    for (const m of filteredMatches) {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return [...groups.entries()].map(([key, items]) => {
      const [year, month] = key.split("-").map(Number);
      const label = new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { key, label, items };
    });
  })();

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header with subtle gradient for depth */}
      <header className="relative overflow-hidden px-5 pb-5 pt-6">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative flex items-center gap-3">
          <Link
            to="/profile"
            aria-label="Voltar"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Histórico</h1>
            <p className="text-[11px] text-muted-foreground">
              {filteredMatches.length} {filteredMatches.length === 1 ? "partida" : "partidas"}
              {filteredMatches.length > 0 && (
                <>
                  {" · "}
                  <span
                    className={
                      totalElo > 0 ? "text-success" : totalElo < 0 ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {totalElo > 0 ? "+" : ""}
                    {Math.round(totalElo)} Elo
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </header>

      {/* Group filter tabs */}
      {groupsList.length > 1 && (
        <div className="mb-3 px-5">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setGroupFilter("all")}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${
                groupFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {groupsList.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(g.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${
                  groupFilter === g.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary — professional split bar with precise W/L/pending breakdown */}
      {filteredMatches.length > 0 && (
        <div className="mx-5 mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold leading-none text-foreground tabular-nums">
                {winRate}
                <span className="text-lg text-muted-foreground">%</span>
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Win Rate
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {decided} {decided === 1 ? "decidida" : "decididas"}
                  {pending > 0 ? ` · ${pending} pend.` : ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {wins}V
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-bold text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {losses}D
              </span>
            </div>
          </div>
          {/* Track with segments proportional to total matches.
              Pending matches reserve space in muted gray for honesty. */}
          <div className="relative">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {wins > 0 && (
                <div
                  className="bg-gradient-to-r from-success/80 to-success transition-[width] duration-500 ease-out"
                  style={{ width: `${(wins / filteredMatches.length) * 100}%` }}
                />
              )}
              {losses > 0 && (
                <div
                  className="bg-gradient-to-r from-destructive to-destructive/80 transition-[width] duration-500 ease-out"
                  style={{ width: `${(losses / filteredMatches.length) * 100}%` }}
                />
              )}
              {pending > 0 && (
                <div
                  className="bg-muted-foreground/30 transition-[width] duration-500 ease-out"
                  style={{ width: `${(pending / filteredMatches.length) * 100}%` }}
                  title="Sem resultado registrado"
                />
              )}
            </div>
            {/* 50% midpoint marker — quick visual reference */}
            <div
              className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-background/60"
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      <div className="px-5">
        {filteredMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
              <Swords className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-display text-base font-bold text-foreground">Nenhuma partida ainda</h3>
            <p className="mt-1 text-sm text-muted-foreground">Suas partidas aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedByMonth.map(({ key, label, items }) => (
              <section key={key}>
                {/* Month label — small, sticky-feel chunking */}
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {label}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  {items.map((match, idx) => {
                    // Derive winner from set scores when winner_team is missing
                    // (some matches store sets without ever flipping winner_team).
                    const gamesA = match.sets.reduce((s, x) => s + x.scoreA, 0);
                    const gamesB = match.sets.reduce((s, x) => s + x.scoreB, 0);
                    const derivedWinner =
                      match.winnerTeam ??
                      (match.sets.length > 0 && gamesA !== gamesB
                        ? gamesA > gamesB
                          ? "A"
                          : "B"
                        : null);
                    const won = derivedWinner === match.myTeam;
                    const lost = derivedWinner != null && derivedWinner !== match.myTeam;
                    const d = new Date(match.date);
                    const dayStr = String(d.getDate()).padStart(2, "0");
                    const monthAbbr = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                    const partnerStr = match.teammates.length
                      ? match.teammates.map((t) => labelFor(match.groupId, t)).join(" & ")
                      : "Solo";
                    const oppStr = match.opponents.length
                      ? match.opponents.map((o) => labelFor(match.groupId, o)).join(" & ")
                      : "—";
                    // Aggregate games across sets from my perspective
                    const myGames = match.sets.reduce(
                      (sum, s) => sum + (match.myTeam === "A" ? s.scoreA : s.scoreB),
                      0,
                    );
                    const oppGames = match.sets.reduce(
                      (sum, s) => sum + (match.myTeam === "A" ? s.scoreB : s.scoreA),
                      0,
                    );
                    const hasScore = match.sets.length > 0;

                    // Color accent for left border (visual anchor)
                    const accent = won
                      ? "before:bg-success"
                      : lost
                      ? "before:bg-destructive"
                      : "before:bg-muted-foreground/40";

                    return (
                      <button
                        key={match.id}
                        onClick={() => setSelected(match)}
                        className={`relative flex w-full items-stretch gap-2.5 py-2 pl-3 pr-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/60 before:absolute before:left-0 before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full ${accent} ${
                          idx > 0 ? "border-t border-border/60" : ""
                        }`}
                      >
                        {/* Date stack — calendar-style for quick scan */}
                        <div className="flex w-8 flex-shrink-0 flex-col items-center justify-center leading-none">
                          <span className="font-display text-sm font-bold tabular-nums text-foreground">
                            {dayStr}
                          </span>
                          <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {monthAbbr}
                          </span>
                        </div>

                        {/* Match info — centered: partner [score pill] opponents */}
                        <div className="flex min-w-0 flex-1 items-center justify-center">
                          <div className="flex min-w-0 items-center justify-center gap-2 text-[12px] font-semibold text-foreground">
                            <span className="truncate text-right">{partnerStr}</span>
                            {hasScore ? (
                              <span
                                className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums leading-none ${
                                  won
                                    ? "border-success/30 bg-success/10 text-success"
                                    : lost
                                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                                    : "border-border bg-muted text-muted-foreground"
                                }`}
                              >
                                <span>{myGames}</span>
                                <span className="text-foreground/40">·</span>
                                <span>{oppGames}</span>
                              </span>
                            ) : (
                              <span className="flex-shrink-0 text-[10px] font-normal text-muted-foreground/70">
                                vs
                              </span>
                            )}
                            <span className="truncate text-left">{oppStr}</span>
                          </div>
                        </div>

                        {/* Elo delta — pill for emphasis */}
                        <div
                          className={`flex flex-shrink-0 self-center items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-bold tabular-nums ${
                            match.ratingChange > 0
                              ? "bg-success/10 text-success"
                              : match.ratingChange < 0
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {match.ratingChange > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : match.ratingChange < 0 ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {match.ratingChange > 0 ? "+" : ""}
                          {Math.round(match.ratingChange)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Match details drawer */}
      <Drawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DrawerContent>
          {selected && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="font-display text-base">
                  {selected.seasonName}
                  {selected.matchNumber ? ` · Partida ${selected.matchNumber}` : ""}
                </DrawerTitle>
                <p className="text-xs text-muted-foreground">
                  {selected.groupName} ·{" "}
                  {new Date(selected.date).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </DrawerHeader>
              <div className="space-y-4 px-4 pb-8">
                {/* Result + rating change */}
                <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${
                        selected.winnerTeam === selected.myTeam
                          ? "bg-success/10 text-success"
                          : selected.winnerTeam && selected.winnerTeam !== selected.myTeam
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {selected.winnerTeam === selected.myTeam
                        ? "V"
                        : selected.winnerTeam && selected.winnerTeam !== selected.myTeam
                        ? "D"
                        : "—"}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {selected.winnerTeam === selected.myTeam
                          ? "Vitória"
                          : selected.winnerTeam
                          ? "Derrota"
                          : "Sem resultado"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {Math.round(selected.ratingBefore)} → {Math.round(selected.ratingAfter)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                      selected.ratingChange > 0
                        ? "bg-success/10 text-success"
                        : selected.ratingChange < 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {selected.ratingChange > 0 ? "+" : ""}
                    {Math.round(selected.ratingChange)}
                  </span>
                </div>

                {/* Sets */}
                {selected.sets.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sets
                    </span>
                    <div className="flex gap-1.5">
                      {selected.sets.map((s, i) => {
                        const myScore = selected.myTeam === "A" ? s.scoreA : s.scoreB;
                        const oppScore = selected.myTeam === "A" ? s.scoreB : s.scoreA;
                        const setWon = myScore > oppScore;
                        return (
                          <div
                            key={i}
                            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
                              setWon ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {myScore}-{oppScore}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Teams */}
                <div className="space-y-2">
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sua equipe
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.teammates.length === 0 && (
                        <span className="text-xs text-muted-foreground">Solo</span>
                      )}
                      {selected.teammates.map((t, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <PlayerAvatar avatarUrl={t.avatar_url || null} name={t.name} size="xs" />
                          <span className="text-xs text-foreground">{t.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Adversários
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.opponents.map((o, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <PlayerAvatar avatarUrl={o.avatar_url || null} name={o.name} size="xs" />
                          <span className="text-xs text-foreground">{o.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
