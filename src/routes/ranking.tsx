import { createFileRoute, Link } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups } from "@/hooks/use-groups";
import { BarChart3, Info, Trophy, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
  is_eligible: boolean;
  profile?: {
    name: string;
    nickname: string | null;
    avatar_url: string | null;
  };
  lastChange?: number;
}

function RankingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { groups } = useMyGroups();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Load seasons from user's groups
  useEffect(() => {
    if (!groups.length) return;
    const loadSeasons = async () => {
      const groupIds = groups.map((g) => g.id);
      const { data } = await supabase
        .from("seasons")
        .select("*, groups(name)")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false });
      setSeasons(data || []);
      if (data?.length && !selectedSeasonId) {
        const active = data.find((s: any) => s.status === "active");
        setSelectedSeasonId(active?.id || data[0].id);
      }
    };
    loadSeasons();
  }, [groups]);

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

      // Get last rating change
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
          is_eligible: s.is_eligible,
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

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="font-display text-xl font-bold text-foreground">Ranking</h1>
        <Link to="/ranking-info" className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent">
          <Info className="h-4 w-4 text-muted-foreground" />
        </Link>
      </header>

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
            {/* Season selector */}
            {seasons.length > 0 && (
              <div className="scrollbar-none flex gap-2 overflow-x-auto">
                {seasons.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSeasonId(s.id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedSeasonId === s.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

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
                {rankings.map((entry, idx) => {
                  const isMe = entry.user_id === user?.id;
                  const pos = entry.position || idx + 1;
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                        isMe
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-card/50"
                      }`}
                    >
                      {/* Position */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
                        style={{
                          backgroundColor: pos === 1 ? "var(--rank-gold)" : pos === 2 ? "var(--rank-silver)" : pos === 3 ? "var(--rank-bronze)" : "var(--muted)",
                          color: pos <= 3 ? "var(--background)" : "var(--foreground)",
                        }}
                      >
                        {pos}
                      </div>

                      {/* Avatar */}
                      {entry.profile?.avatar_url ? (
                        <img src={entry.profile.avatar_url} alt="" className="h-9 w-9 rounded-full border border-border object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                          {(entry.profile?.name || "?").charAt(0)}
                        </div>
                      )}

                      {/* Name & stats */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {entry.profile?.nickname || entry.profile?.name || "Jogador"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {entry.matches_won}V {entry.matches_played - entry.matches_won}D • S {entry.sets_won}-{entry.sets_lost}
                        </p>
                      </div>

                      {/* Rating */}
                      <div className="text-right">
                        <p className="font-display text-sm font-bold text-foreground">{Math.round(entry.rating)}</p>
                        {entry.lastChange !== undefined && (
                          <p className={`text-[10px] font-semibold ${entry.lastChange > 0 ? "text-success" : entry.lastChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {entry.lastChange > 0 ? "+" : ""}{Math.round(entry.lastChange)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
