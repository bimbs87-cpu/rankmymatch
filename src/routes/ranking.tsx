import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups } from "@/hooks/use-groups";
import { BarChart3, Info, TrendingUp, TrendingDown, Minus, ChevronDown, ArrowUp, ArrowDown, Calendar, Layers, Timer } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";

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
  positionChange?: number; // positive = subiu, negative = caiu
  hasSnapshot: boolean; // true if has ranking_snapshot
}

function winRate(won: number, played: number) {
  if (played === 0) return 0;
  return Math.round((won / played) * 100);
}

/** Abbreviate compound names: "Marco Drummond" -> "Marco D.", "Diego Cardoso Silva" -> "Diego C." */
function abbreviateName(name: string): string {
  if (!name) return "Jogador";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}

function RankingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { groups } = useMyGroups();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialReady, setInitialReady] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [totalRounds, setTotalRounds] = useState(0);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [totalSets, setTotalSets] = useState(0);

  // Load seasons from user's groups, auto-select based on last match
  useEffect(() => {
    if (authLoading) return;
    if (!groups.length || !user?.id) {
      setLoading(false);
      setInitialReady(true);
      return;
    }
    const loadSeasons = async () => {
      const groupIds = groups.map((g) => g.id);
      const { data } = await supabase
        .from("seasons")
        .select("*, groups(name)")
        .in("group_id", groupIds)
        .in("status", ["active", "finished"])
        .order("created_at", { ascending: false });
      setSeasons(data || []);

      if (!data?.length) {
        setLoading(false);
        setInitialReady(true);
        return;
      }

      if (!selectedSeasonId) {
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
  }, [groups, user?.id, authLoading]);

  // Load rankings for selected season
  useEffect(() => {
    if (!selectedSeasonId) return;
    const loadRankings = async () => {
      setLoading(true);

      const selectedSeason = seasons.find((s: any) => s.id === selectedSeasonId);
      const groupId = selectedSeason?.group_id;

      // Fetch snapshots, group members, rounds, match_sets in parallel
      const [snapshotsRes, membersRes, roundsRes, setsRes] = await Promise.all([
        supabase
          .from("ranking_snapshots")
          .select("*")
          .eq("season_id", selectedSeasonId)
          .order("rating", { ascending: false }),
        groupId
          ? supabase
              .from("group_members")
              .select("user_id")
              .eq("group_id", groupId)
              .eq("status", "active")
          : Promise.resolve({ data: [] }),
        supabase
          .from("rounds")
          .select("id, status")
          .eq("season_id", selectedSeasonId),
        supabase
          .from("match_sets")
          .select("id, match_id, matches!inner(round_id, rounds!inner(season_id))")
          .eq("matches.rounds.season_id", selectedSeasonId),
      ]);

      const snapshots = snapshotsRes.data || [];
      const members = (membersRes.data || []) as { user_id: string }[];
      const rounds = roundsRes.data || [];

      // Count rounds
      const totalR = rounds.length;
      const completedR = rounds.filter((r: any) => r.status === "completed").length;
      setTotalRounds(selectedSeason?.total_rounds || totalR);
      setCompletedRounds(completedR);

      // Count total sets
      const setsCount = setsRes.data?.length || 0;
      setTotalSets(setsCount);

      // Get all user IDs (members + snapshot users)
      const snapshotUserIds = new Set(snapshots.map((s) => s.user_id));
      const allUserIds = [...new Set([...members.map((m) => m.user_id), ...snapshotUserIds])];

      if (!allUserIds.length) {
        setRankings([]);
        setLoading(false);
        setInitialReady(true);
        return;
      }

      // Fetch profiles and rating events in parallel
      const [profilesRes, eventsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("user_id, name, nickname, avatar_url")
          .in("user_id", allUserIds),
        supabase
          .from("rating_events")
          .select("user_id, rating_change, match_id, created_at")
          .eq("season_id", selectedSeasonId)
          .in("user_id", allUserIds)
          .order("created_at", { ascending: false }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));

      // Get last change per user (total from last round)
      // Group events by match_id to find the latest round's matches
      const events = eventsRes.data || [];
      const lastChangeMap = new Map<string, number>();

      // Find events from the last round (latest match_id group)
      if (events.length > 0) {
        // Get unique round_ids from matches to determine last round
        const matchIds = [...new Set(events.map((e) => e.match_id))];

        // Get round info for these matches
        const { data: matchRounds } = await supabase
          .from("matches")
          .select("id, round_id")
          .in("id", matchIds);

        const matchToRound = new Map((matchRounds || []).map((m) => [m.id, m.round_id]));

        // Find latest round among these
        const { data: roundDates } = await supabase
          .from("rounds")
          .select("id, scheduled_date, created_at")
          .eq("season_id", selectedSeasonId)
          .order("scheduled_date", { ascending: false });

        const roundOrder = (roundDates || []).map((r) => r.id);
        const lastRoundId = roundOrder[0];
        const previousRoundId = roundOrder[1];

        // Sum rating changes from last round for each user
        for (const e of events) {
          const roundId = matchToRound.get(e.match_id);
          if (roundId === lastRoundId) {
            lastChangeMap.set(e.user_id, (lastChangeMap.get(e.user_id) || 0) + Number(e.rating_change));
          }
        }

        // Compute position changes: compare current position vs what it was before last round
        // We compute the "previous position" from rating_before of last round events
      }

      // Compute eligibility threshold: ceil(30% of completed rounds)
      const eligibilityThreshold = Math.ceil(completedR * 0.3);

      // Build ranking entries
      const snapshotMap = new Map(snapshots.map((s) => [s.user_id, s]));

      const entries: RankingEntry[] = allUserIds.map((uid) => {
        const snap = snapshotMap.get(uid);
        const profile = profileMap.get(uid);

        if (snap) {
          // Eligibility based on matches_played >= eligibilityThreshold
          const isEligible = snap.matches_played >= eligibilityThreshold && eligibilityThreshold > 0;
          return {
            user_id: uid,
            rating: Number(snap.rating),
            position: snap.position,
            matches_played: snap.matches_played,
            matches_won: snap.matches_won,
            sets_won: snap.sets_won,
            sets_lost: snap.sets_lost,
            games_won: snap.games_won,
            games_lost: snap.games_lost,
            is_eligible: isEligible,
            last_5_results: (snap.last_5_results as string[]) || [],
            profile: profile || undefined,
            lastChange: lastChangeMap.get(uid),
            hasSnapshot: true,
          };
        }

        // Member without snapshot - hasn't played
        return {
          user_id: uid,
          rating: 1000,
          position: null,
          matches_played: 0,
          matches_won: 0,
          sets_won: 0,
          sets_lost: 0,
          games_won: 0,
          games_lost: 0,
          is_eligible: false,
          last_5_results: [],
          profile: profile || undefined,
          lastChange: undefined,
          hasSnapshot: false,
        };
      });

      // Sort: eligible first by rating desc, then ineligible by rating desc, then no-snapshot
      entries.sort((a, b) => {
        if (a.is_eligible && !b.is_eligible) return -1;
        if (!a.is_eligible && b.is_eligible) return 1;
        if (a.hasSnapshot && !b.hasSnapshot) return -1;
        if (!a.hasSnapshot && b.hasSnapshot) return 1;
        return b.rating - a.rating;
      });

      // Assign positions to eligible players
      let pos = 1;
      for (const e of entries) {
        if (e.is_eligible) {
          e.position = pos++;
        }
      }

      setRankings(entries);
      setLoading(false);
    };
    loadRankings();
  }, [selectedSeasonId, seasons]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const myRanking = rankings.find((r) => r.user_id === user?.id);
  const selectedSeason = seasons.find((s: any) => s.id === selectedSeasonId);
  const remainingRounds = Math.max(0, (selectedSeason?.total_rounds || totalRounds) - completedRounds);

  // Separate eligible (podium candidates) from rest
  const eligibleRankings = rankings.filter((r) => r.is_eligible);

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

      <div className="space-y-3 px-5 pt-3">
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
            {/* My position + stats combined card */}
            {myRanking && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <span className="font-display text-xl font-bold text-primary">
                      {myRanking.position ? `#${myRanking.position}` : "—"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">Sua posição</p>
                      {myRanking.positionChange !== undefined && myRanking.positionChange !== 0 && (
                        <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          myRanking.positionChange > 0
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                        }`}>
                          {myRanking.positionChange > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                          {Math.abs(myRanking.positionChange)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-muted-foreground">
                      <span className="font-display font-bold text-primary">{Math.round(myRanking.rating)} Elo</span>
                      <span>{myRanking.matches_won}V {myRanking.matches_played - myRanking.matches_won}D</span>
                      <span>🏆 {winRate(myRanking.matches_won, myRanking.matches_played)}%</span>
                      {myRanking.lastChange !== undefined && (
                        <span className={`flex items-center gap-0.5 font-bold ${
                          myRanking.lastChange > 0 ? "text-success" : myRanking.lastChange < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}>
                          {myRanking.lastChange > 0 ? "+" : ""}{Math.round(myRanking.lastChange)} pts
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Inline stats bar */}
                <div className="flex border-t border-primary/10">
                  <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-center">
                    <Layers className="h-3 w-3 text-primary/70" />
                    <span className="font-display text-sm font-bold text-foreground">{totalSets}</span>
                    <span className="text-[9px] text-muted-foreground">sets</span>
                  </div>
                  <div className="w-px bg-primary/10" />
                  <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-center">
                    <Calendar className="h-3 w-3 text-primary/70" />
                    <span className="font-display text-sm font-bold text-foreground">{completedRounds}</span>
                    <span className="text-[9px] text-muted-foreground">rodadas</span>
                  </div>
                  <div className="w-px bg-primary/10" />
                  <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-center">
                    <Timer className="h-3 w-3 text-primary/70" />
                    <span className="font-display text-sm font-bold text-foreground">{remainingRounds}</span>
                    <span className="text-[9px] text-muted-foreground">restantes</span>
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
                {/* Podium (top 3 eligible) */}
                {eligibleRankings.length >= 3 && (
                  <div className="mb-3 flex items-end justify-center gap-3 pt-2">
                    {[1, 0, 2].map((idx) => {
                      const entry = eligibleRankings[idx];
                      if (!entry) return null;
                      const pos = idx + 1;
                      const isCenter = idx === 0;
                      const displayName = entry.profile?.nickname || abbreviateName(entry.profile?.name || "Jogador");
                      return (
                        <div key={entry.user_id} className="flex flex-col items-center">
                          <div className="relative">
                            <PlayerAvatar
                              avatarUrl={entry.profile?.avatar_url}
                              name={entry.profile?.name || "?"}
                              size={isCenter ? "lg" : "md"}
                              className={`border-2 ${isCenter ? "border-primary !h-14 !w-14" : "border-border !h-11 !w-11"}`}
                            />
                            <div
                              className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[9px] font-bold"
                              style={{
                                backgroundColor: pos === 1 ? "var(--rank-gold)" : pos === 2 ? "var(--rank-silver)" : "var(--rank-bronze)",
                                color: "var(--background)",
                              }}
                            >
                              {pos}
                            </div>
                          </div>
                          <p className="mt-2.5 text-center text-[11px] font-semibold text-foreground leading-tight">
                            {displayName}
                          </p>
                          <p className="font-display text-xs font-bold text-primary">{Math.round(entry.rating)}</p>
                          <p className="text-[9px] text-muted-foreground">{winRate(entry.matches_won, entry.matches_played)}% WR</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Full list */}
                <div className="rounded-2xl border border-border overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center border-b border-border bg-muted/30 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="w-7 text-center">#</span>
                    <span className="flex-1 pl-1">Jogador</span>
                    <span className="w-11 text-center">Elo</span>
                    <span className="w-20 text-center">V/D · WR%</span>
                    <span className="w-14 text-center">Últimas</span>
                  </div>

                  {rankings.map((entry) => {
                    const isMe = entry.user_id === user?.id;
                    const pos = entry.position || "—";
                    const wr = winRate(entry.matches_won, entry.matches_played);
                    const isDimmed = !entry.is_eligible;
                    const displayName = entry.profile?.nickname || abbreviateName(entry.profile?.name || "Jogador");

                    return (
                      <div
                        key={entry.user_id}
                        className={`flex items-center border-b border-border/50 px-2 py-2 last:border-b-0 transition-opacity ${
                          isMe ? "bg-primary/5" : ""
                        } ${isDimmed ? "opacity-40" : ""}`}
                      >
                        {/* Position + change */}
                        <div className="w-7 shrink-0 text-center">
                          <div
                            className="mx-auto flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold"
                            style={{
                              backgroundColor:
                                typeof pos === "number" && pos === 1 ? "var(--rank-gold)"
                                : typeof pos === "number" && pos === 2 ? "var(--rank-silver)"
                                : typeof pos === "number" && pos === 3 ? "var(--rank-bronze)"
                                : "transparent",
                              color: typeof pos === "number" && pos <= 3 ? "var(--background)" : "var(--muted-foreground)",
                            }}
                          >
                            {pos}
                          </div>
                          {entry.positionChange !== undefined && entry.positionChange !== 0 && (
                            <div className={`mt-0.5 text-[8px] font-bold leading-none ${
                              entry.positionChange > 0 ? "text-success" : "text-destructive"
                            }`}>
                              {entry.positionChange > 0 ? "▲" : "▼"}{Math.abs(entry.positionChange)}
                            </div>
                          )}
                        </div>

                        {/* Avatar + Name */}
                        <div className="flex flex-1 items-center gap-1.5 min-w-0 pl-1">
                          <PlayerAvatar avatarUrl={entry.profile?.avatar_url} name={entry.profile?.name || "?"} size="sm" className="border border-border !h-7 !w-7" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-foreground leading-tight">
                              {displayName}
                              {isMe && <span className="ml-0.5 text-primary text-[9px]">(você)</span>}
                            </p>
                            {isDimmed && !entry.hasSnapshot && (
                              <p className="text-[8px] text-muted-foreground leading-none">Sem partidas</p>
                            )}
                          </div>
                        </div>

                        {/* Elo + change */}
                        <div className="w-11 text-center">
                          <p className="font-display text-[11px] font-bold text-foreground leading-tight">{Math.round(entry.rating)}</p>
                          {entry.lastChange !== undefined && (
                            <p className={`text-[8px] font-semibold leading-none ${entry.lastChange > 0 ? "text-success" : entry.lastChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                              {entry.lastChange > 0 ? "+" : ""}{Math.round(entry.lastChange)}
                            </p>
                          )}
                        </div>

                        {/* V/D · WR% combined */}
                        <div className="w-20 text-center">
                          <span className="text-[10px] text-muted-foreground">
                            <span className="text-success">{entry.matches_won}</span>
                            /
                            <span className="text-destructive">{entry.matches_played - entry.matches_won}</span>
                          </span>
                          <span className="mx-1 text-[8px] text-border">·</span>
                          <span className={`text-[10px] font-semibold ${wr >= 60 ? "text-success" : wr >= 40 ? "text-foreground" : "text-destructive"}`}>
                            {entry.matches_played > 0 ? `${wr}%` : "—"}
                          </span>
                        </div>

                        {/* Last 5 results */}
                        <div className="flex w-14 justify-center gap-0.5">
                          {entry.last_5_results.length > 0 ? (
                            entry.last_5_results.slice(0, 5).map((r, i) => (
                              <div
                                key={i}
                                className={`h-2.5 w-2.5 rounded-full ${
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
    </div>
  );
}
