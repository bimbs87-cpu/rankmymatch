import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useEffect, useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Swords } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
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
  teammates: { name: string; avatar_url: string | null }[];
  opponents: { name: string; avatar_url: string | null }[];
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

        const teammates = players
          .filter((p) => p.team === myTeam && p.user_id !== user!.id)
          .map((p) => {
            const prof = profileMap.get(p.user_id);
            return { name: prof?.nickname || prof?.name || "Jogador", avatar_url: prof?.avatar_url || null };
          });

        const opponents = players
          .filter((p) => p.team !== myTeam)
          .map((p) => {
            const prof = profileMap.get(p.user_id);
            return { name: prof?.nickname || prof?.name || "Jogador", avatar_url: prof?.avatar_url || null };
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

      setMatches(result);
      setIsLoading(false);
    }

    load();
  }, [user]);

  if (authLoading || isLoading) {
    return <TrophyLoadingBar />;
  }

  // Build unique groups list
  const groupsList = Array.from(
    new Map(matches.filter((m) => m.groupId).map((m) => [m.groupId!, m.groupName])).entries()
  ).map(([id, name]) => ({ id, name }));

  const filteredMatches =
    groupFilter === "all" ? matches : matches.filter((m) => m.groupId === groupFilter);

  const wins = filteredMatches.filter((m) => m.winnerTeam === m.myTeam).length;
  const losses = filteredMatches.filter((m) => m.winnerTeam && m.winnerTeam !== m.myTeam).length;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground">Histórico</h1>
            <p className="text-xs text-muted-foreground">{filteredMatches.length} partidas jogadas</p>
          </div>
        </div>
      </header>

      {/* Group filter tabs */}
      {groupsList.length > 1 && (
        <div className="mb-4 px-5">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setGroupFilter("all")}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                groupFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground"
              }`}
            >
              Todos
            </button>
            {groupsList.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(g.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  groupFilter === g.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {filteredMatches.length > 0 && (
        <div className="mx-5 mb-4 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vitórias</span>
            <span className="mt-1 font-display text-lg font-bold text-success">{wins}</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Derrotas</span>
            <span className="mt-1 font-display text-lg font-bold text-destructive">{losses}</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Win Rate</span>
            <span className="mt-1 font-display text-lg font-bold text-foreground">
              {filteredMatches.length > 0 ? Math.round((wins / filteredMatches.length) * 100) : 0}%
            </span>
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
          <div className="overflow-hidden rounded-2xl border border-border bg-card/50">
            {/* Column headers */}
            <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="w-6 flex-shrink-0" />
              <span className="w-9 flex-shrink-0">Data</span>
              <div className="min-w-0 flex-1 text-center">
                Parceiro <span className="opacity-60">vs</span> Adversários
              </div>
              <span className="w-10 flex-shrink-0 text-right">Elo</span>
            </div>
            {filteredMatches.map((match, idx) => {
              const won = match.winnerTeam === match.myTeam;
              const lost = match.winnerTeam && match.winnerTeam !== match.myTeam;
              const dateStr = new Date(match.date).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              });
              const partnerStr = match.teammates.length
                ? match.teammates.map((t) => shortName(t.name)).join(" & ")
                : "Solo";
              const oppStr = match.opponents.length
                ? match.opponents.map((o) => shortName(o.name)).join(" & ")
                : "—";
              return (
                <button
                  key={match.id}
                  onClick={() => setSelected(match)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/30 ${
                    idx > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                      won
                        ? "bg-success/10 text-success"
                        : lost
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {won ? "V" : lost ? "D" : "—"}
                  </span>
                  <span className="w-9 flex-shrink-0 text-[10px] text-muted-foreground">{dateStr}</span>
                  <div className="min-w-0 flex-1 text-center text-[11px] leading-tight text-foreground">
                    <span className="truncate">
                      {partnerStr} <span className="text-muted-foreground">vs</span> {oppStr}
                    </span>
                  </div>
                  {match.sets.length > 0 && (
                    <span className="hidden flex-shrink-0 text-[10px] font-semibold text-muted-foreground xs:inline">
                      {match.sets
                        .map((s) =>
                          match.myTeam === "A" ? `${s.scoreA}-${s.scoreB}` : `${s.scoreB}-${s.scoreA}`,
                        )
                        .join(" ")}
                    </span>
                  )}
                  <span
                    className={`flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      match.ratingChange > 0
                        ? "bg-success/10 text-success"
                        : match.ratingChange < 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {match.ratingChange > 0 ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : match.ratingChange < 0 ? (
                      <TrendingDown className="h-2.5 w-2.5" />
                    ) : (
                      <Minus className="h-2.5 w-2.5" />
                    )}
                    {match.ratingChange > 0 ? "+" : ""}
                    {Math.round(match.ratingChange)}
                  </span>
                </button>
              );
            })}
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
