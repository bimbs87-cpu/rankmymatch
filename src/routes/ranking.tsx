import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups } from "@/hooks/use-groups";
import { BarChart3, Info, TrendingUp, TrendingDown, Minus, Medal, Target, Percent, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ranking")({
  component: RankingPage,
});

interface RankingEntry {
  user_id: string;
  rating: number;
  position: number | null;
  matches_played: number;
  matches_won: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  is_eligible: boolean;
  last_5_results: string[];
  profile?: {
    name: string;
    nickname: string | null;
    avatar_url: string | null;
  };
  lastChange?: number;
}

function winRate(won: number, played: number) {
  if (played === 0) return 0;
  return Math.round((won / played) * 100);
}

function RankingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { groups } = useMyGroups();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);

  // Load seasons from user's groups, auto-select based on last match
  useEffect(() => {
    if (!groups.length || !user?.id) return;
    const loadSeasons = async () => {
      const groupIds = groups.map((g) => g.id);
      const { data } = await supabase
        .from("seasons")
        .select("*, groups(name)")
        .in("group_id", groupIds)
        .in("status", ["active", "finished"])
        .order("created_at", { ascending: false });
      setSeasons(data || []);

      if (data?.length && !selectedSeasonId) {
        // Find the season of the user's most recent match
        const { data: lastEvent } = await supabase
          .from("rating_events")
          .select("season_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastSeasonId = lastEvent?.[0]?.season_id;
        const matchedSeason = lastSeasonId ? data.find((s: any) => s.id === lastSeasonId) : null;
        const activeSeason = data.find((s: any) => s.status === "active");
        setSelectedSeasonId(matchedSeason?.id || activeSeason?.id || data[0].id);
      }
    };
    loadSeasons();
  }, [groups, user?.id]);

  // Load rankings for selected season
  useEffect(() => {
    if (!selectedSeasonId) return;
    const loadRankings = async () => {
      setLoading(true);
      const { data: snapshots } = await supabase
        .from("ranking_snapshots")
        .select("*")
        .eq("season_id", selectedSeasonId)
        .order("rating", { ascending: false });

      if (!snapshots?.length) {
        setRankings([]);
        setLoading(false);
        return;
      }

      const userIds = snapshots.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url")
        .in("user_id", userIds);

      // Get last rating change per user
      const { data: events } = await supabase
        .from("rating_events")
        .select("user_id, rating_change")
        .eq("season_id", selectedSeasonId)
        .in("user_id", userIds)
        .order("created_at", { ascending: false });

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const lastChangeMap = new Map<string, number>();
      for (const e of events || []) {
        if (!lastChangeMap.has(e.user_id)) {
          lastChangeMap.set(e.user_id, Number(e.rating_change));
        }
      }

      setRankings(
        snapshots.map((s, i) => ({
          user_id: s.user_id,
          rating: Number(s.rating),
          position: s.position || i + 1,
          matches_played: s.matches_played,
          matches_won: s.matches_won,
          sets_won: s.sets_won,
          sets_lost: s.sets_lost,
          games_won: s.games_won,
          games_lost: s.games_lost,
          is_eligible: s.is_eligible,
          last_5_results: (s.last_5_results as string[]) || [],
          profile: profileMap.get(s.user_id) || undefined,
          lastChange: lastChangeMap.get(s.user_id),
        }))
      );
      setLoading(false);
    };
    loadRankings();
  }, [selectedSeasonId]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const myRanking = rankings.find((r) => r.user_id === user?.id);
  const selectedSeason = seasons.find((s: any) => s.id === selectedSeasonId);

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Ranking</h1>
          {selectedSeason && seasons.length > 1 ? (
            <button
              onClick={() => setShowSwitcher(!showSwitcher)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{(selectedSeason as any).groups?.name} • {selectedSeason.name}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showSwitcher ? "rotate-180" : ""}`} />
            </button>
          ) : selectedSeason ? (
            <p className="text-xs text-muted-foreground">
              {(selectedSeason as any).groups?.name} • {selectedSeason.name}
            </p>
          ) : null}
        </div>
        <Link to="/ranking-info" className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent">
          <Info className="h-4 w-4 text-muted-foreground" />
        </Link>
      </header>

      {/* Ranking switcher dropdown */}
      {showSwitcher && seasons.length > 1 && (
        <div className="mx-5 mt-1 rounded-2xl border border-border bg-card/95 backdrop-blur-xl overflow-hidden shadow-lg">
          {seasons.map((s: any) => (
            <button
              key={s.id}
              onClick={() => { setSelectedSeasonId(s.id); setShowSwitcher(false); }}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors border-b border-border/50 last:border-b-0 ${
                selectedSeasonId === s.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-accent/50"
              }`}
            >
              <div>
                <p className="font-medium">{s.groups?.name}</p>
                <p className="text-[11px] text-muted-foreground">{s.name}</p>
              </div>
              {selectedSeasonId === s.id && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4 px-5 pt-4">
        {!isAuthenticated ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Faça login para ver rankings</p>
            <Link to="/login" className="mt-3 inline-block">
              <button className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground">Entrar</button>
            </Link>
          </div>
        ) : (
          <>

            {/* My position card */}
            {myRanking && (
              <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <span className="font-display text-2xl font-bold text-primary">
                      {myRanking.position ? `#${myRanking.position}` : "—"}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Sua posição</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-display font-bold text-primary">{Math.round(myRanking.rating)} Elo</span>
                      <span>{myRanking.matches_won}V {myRanking.matches_played - myRanking.matches_won}D</span>
                      <span>{winRate(myRanking.matches_won, myRanking.matches_played)}%</span>
                      {myRanking.lastChange !== undefined && (
                        <span className={`flex items-center gap-0.5 font-semibold ${myRanking.lastChange > 0 ? "text-success" : myRanking.lastChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {myRanking.lastChange > 0 ? <TrendingUp className="h-3 w-3" /> : myRanking.lastChange < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {myRanking.lastChange > 0 ? "+" : ""}{Math.round(myRanking.lastChange)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stats summary */}
            {rankings.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                  <Medal className="mx-auto mb-1 h-4 w-4 text-primary" />
                  <p className="font-display text-lg font-bold text-foreground">{rankings.length}</p>
                  <p className="text-[10px] text-muted-foreground">Jogadores</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                  <Target className="mx-auto mb-1 h-4 w-4 text-primary" />
                  <p className="font-display text-lg font-bold text-foreground">
                    {rankings.reduce((sum, r) => sum + r.matches_played, 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Partidas</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/50 p-3 text-center">
                  <Percent className="mx-auto mb-1 h-4 w-4 text-primary" />
                  <p className="font-display text-lg font-bold text-foreground">
                    {rankings.length > 0 ? Math.round(rankings[0].rating) : 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Top Elo</p>
                </div>
              </div>
            )}

            {/* Ranking table */}
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : rankings.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
                  <h3 className="font-display text-base font-bold text-foreground">
                    {seasons.length > 0 ? "Nenhum ranking ainda" : "Nenhuma temporada disponível"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {seasons.length > 0 ? "Jogue partidas para aparecer no ranking." : "Entre em um grupo com temporada ativa."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Podium (top 3) */}
                {rankings.length >= 3 && (
                  <div className="mb-4 flex items-end justify-center gap-3 pt-4">
                    {[1, 0, 2].map((idx) => {
                      const entry = rankings[idx];
                      if (!entry) return null;
                      const pos = idx + 1;
                      const isCenter = idx === 0;
                      return (
                        <div key={entry.user_id} className="flex flex-col items-center">
                          <div className="relative">
                            {entry.profile?.avatar_url ? (
                              <img
                                src={entry.profile.avatar_url}
                                alt=""
                                className={`rounded-full border-2 object-cover ${
                                  isCenter ? "h-16 w-16 border-primary" : "h-12 w-12 border-border"
                                }`}
                              />
                            ) : (
                              <div
                                className={`flex items-center justify-center rounded-full bg-muted font-bold text-foreground ${
                                  isCenter ? "h-16 w-16 text-xl" : "h-12 w-12 text-sm"
                                }`}
                              >
                                {(entry.profile?.name || "?").charAt(0)}
                              </div>
                            )}
                            <div
                              className="absolute -bottom-1.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold"
                              style={{
                                backgroundColor: pos === 1 ? "var(--rank-gold)" : pos === 2 ? "var(--rank-silver)" : "var(--rank-bronze)",
                                color: "var(--background)",
                              }}
                            >
                              {pos}
                            </div>
                          </div>
                          <p className="mt-3 max-w-[80px] truncate text-center text-xs font-semibold text-foreground">
                            {entry.profile?.nickname || entry.profile?.name || "Jogador"}
                          </p>
                          <p className="font-display text-sm font-bold text-primary">{Math.round(entry.rating)}</p>
                          <p className="text-[10px] text-muted-foreground">{winRate(entry.matches_won, entry.matches_played)}% WR</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Full list */}
                <div className="rounded-2xl border border-border overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="w-8 text-center">#</span>
                    <span className="flex-1">Jogador</span>
                    <span className="w-12 text-center">Elo</span>
                    <span className="w-10 text-center">V/D</span>
                    <span className="w-10 text-center">WR%</span>
                    <span className="w-16 text-center">Últimas</span>
                  </div>

                  {rankings.map((entry, idx) => {
                    const isMe = entry.user_id === user?.id;
                    const pos = entry.position || idx + 1;
                    const wr = winRate(entry.matches_won, entry.matches_played);

                    return (
                      <div
                        key={entry.user_id}
                        className={`flex items-center gap-2 border-b border-border/50 px-3 py-2.5 last:border-b-0 ${
                          isMe ? "bg-primary/5" : ""
                        }`}
                      >
                        {/* Position */}
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                          style={{
                            backgroundColor: pos === 1 ? "var(--rank-gold)" : pos === 2 ? "var(--rank-silver)" : pos === 3 ? "var(--rank-bronze)" : "transparent",
                            color: pos <= 3 ? "var(--background)" : "var(--muted-foreground)",
                          }}
                        >
                          {pos}
                        </div>

                        {/* Avatar + Name */}
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          {entry.profile?.avatar_url ? (
                            <img src={entry.profile.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full border border-border object-cover" />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                              {(entry.profile?.name || "?").charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {entry.profile?.nickname || entry.profile?.name || "Jogador"}
                              {isMe && <span className="ml-1 text-primary">(você)</span>}
                            </p>
                            {!entry.is_eligible && (
                              <p className="text-[9px] text-muted-foreground">Mín. não atingido</p>
                            )}
                          </div>
                        </div>

                        {/* Elo */}
                        <div className="w-12 text-center">
                          <p className="font-display text-xs font-bold text-foreground">{Math.round(entry.rating)}</p>
                          {entry.lastChange !== undefined && (
                            <p className={`text-[9px] font-semibold ${entry.lastChange > 0 ? "text-success" : entry.lastChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                              {entry.lastChange > 0 ? "+" : ""}{Math.round(entry.lastChange)}
                            </p>
                          )}
                        </div>

                        {/* W/L */}
                        <div className="w-10 text-center text-[11px] text-muted-foreground">
                          <span className="text-success">{entry.matches_won}</span>
                          /
                          <span className="text-destructive">{entry.matches_played - entry.matches_won}</span>
                        </div>

                        {/* Win Rate */}
                        <div className="w-10 text-center">
                          <span className={`text-[11px] font-semibold ${wr >= 60 ? "text-success" : wr >= 40 ? "text-foreground" : "text-destructive"}`}>
                            {wr}%
                          </span>
                        </div>

                        {/* Last 5 results */}
                        <div className="flex w-16 justify-center gap-0.5">
                          {entry.last_5_results.length > 0 ? (
                            entry.last_5_results.slice(0, 5).map((r, i) => (
                              <div
                                key={i}
                                className={`h-3 w-3 rounded-full ${
                                  r === "W" ? "bg-success" : r === "L" ? "bg-destructive" : "bg-muted"
                                }`}
                              />
                            ))
                          ) : (
                            <span className="text-[9px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
