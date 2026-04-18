import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { useMyGroups } from "@/hooks/use-groups";
import { BarChart3, Info, ChevronDown, ArrowUp, ArrowDown, Calendar, Layers, Timer, Crown, AlertTriangle, ChevronRight, GitCompareArrows, X, Check } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { RankingPlayerDetails } from "@/components/RankingPlayerDetails";
import { isRivalryGroup } from "@/lib/rivalry";
import { buildDisplayNames, getCollidingFirstNames } from "@/lib/name-disambiguation";
import { abbreviateName } from "@/lib/utils";

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
  positionChange?: number;
  hasSnapshot: boolean;
  isFormerMember?: boolean;
}

function winRate(won: number, played: number) {
  if (played === 0) return 0;
  return Math.round((won / played) * 100);
}


function LoadingBar({ progress, label }: { progress: number; label: string }) {
  return <TrophyLoadingBar progress={progress} label={label} />;
}

function RankingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [authLoading, isAuthenticated, navigate]);
  const { groups, isLoading: groupsLoading } = useMyGroups();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadLabel, setLoadLabel] = useState("Carregando ranking...");
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [totalRounds, setTotalRounds] = useState(0);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [totalSets, setTotalSets] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadRankingData = async () => {
      if (authLoading || groupsLoading) return;

      if (!isAuthenticated || !user?.id) {
        if (!cancelled) {
          setSeasons([]);
          setRankings([]);
          setSelectedSeasonId(null);
          setLoading(false);
        }
        return;
      }

      if (!groups.length) {
        if (!cancelled) {
          setSeasons([]);
          setRankings([]);
          setSelectedSeasonId(null);
          setTotalRounds(0);
          setCompletedRounds(0);
          setTotalSets(0);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setLoadProgress(8);
        setLoadLabel("Buscando temporadas...");
      }

      try {
        const groupIds = groups.map((group) => group.id);
        const { data: seasonsData, error: seasonsError } = await supabase
          .from("seasons")
          .select("*, groups(name)")
          .in("group_id", groupIds)
          .in("status", ["active", "finished"])
          .order("created_at", { ascending: false });

        if (seasonsError) throw seasonsError;
        if (cancelled) return;

        const availableSeasons = seasonsData || [];
        setSeasons(availableSeasons);

        if (!availableSeasons.length) {
          setSelectedSeasonId(null);
          setRankings([]);
          setTotalRounds(0);
          setCompletedRounds(0);
          setTotalSets(0);
          return;
        }

        setLoadProgress(22);
        setLoadLabel("Selecionando temporada...");

        let nextSeasonId = selectedSeasonId;
        if (!nextSeasonId || !availableSeasons.some((season: any) => season.id === nextSeasonId)) {
          const { data: lastEvent, error: lastEventError } = await supabase
            .from("rating_events")
            .select("season_id")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (lastEventError) throw lastEventError;
          if (cancelled) return;

          const lastSeasonId = lastEvent?.[0]?.season_id;
          const matchedSeason = lastSeasonId ? availableSeasons.find((season: any) => season.id === lastSeasonId) : null;
          const activeSeason = availableSeasons.find((season: any) => season.status === "active");
          nextSeasonId = matchedSeason?.id || activeSeason?.id || availableSeasons[0].id;
          setSelectedSeasonId(nextSeasonId);
        }

        const selectedSeason = availableSeasons.find((season: any) => season.id === nextSeasonId) || availableSeasons[0];
        if (!selectedSeason) {
          setRankings([]);
          return;
        }

        const effectiveSeasonId = selectedSeason.id;
        const effectiveGroupId = selectedSeason.group_id;

        setLoadProgress(38);
        setLoadLabel("Buscando dados do ranking...");

        const [snapshotsRes, membersRes, roundsRes] = await Promise.all([
          supabase
            .from("ranking_snapshots")
            .select("*")
            .eq("season_id", effectiveSeasonId)
            .order("rating", { ascending: false }),
          supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", effectiveGroupId)
            .eq("status", "active"),
          supabase
            .from("rounds")
            .select("id, status, scheduled_date, created_at")
            .eq("season_id", effectiveSeasonId),
        ]);

        if (snapshotsRes.error) throw snapshotsRes.error;
        if (membersRes.error) throw membersRes.error;
        if (roundsRes.error) throw roundsRes.error;
        if (cancelled) return;

        const snapshots = snapshotsRes.data || [];
        const members = (membersRes.data || []) as { user_id: string }[];
        const rounds = roundsRes.data || [];
        const roundIds = rounds.map((round) => round.id);

        const totalR = rounds.length;
        const completedR = rounds.filter((round: any) => round.status === "completed").length;
        setTotalRounds(selectedSeason.total_rounds || totalR);
        setCompletedRounds(completedR);

        let matchIds: string[] = [];
        if (roundIds.length > 0) {
          const { data: matchesData, error: matchesError } = await supabase
            .from("matches")
            .select("id, round_id")
            .in("round_id", roundIds);

          if (matchesError) throw matchesError;
          matchIds = (matchesData || []).map((match) => match.id);
        }

        if (matchIds.length > 0) {
          const { data: setsData, error: setsError } = await supabase
            .from("match_sets")
            .select("id")
            .in("match_id", matchIds);

          if (setsError) throw setsError;
          setTotalSets(setsData?.length || 0);
        } else {
          setTotalSets(0);
        }

        const snapshotUserIds = new Set(snapshots.map((snapshot) => snapshot.user_id));
        const allUserIds = [...new Set([...members.map((member) => member.user_id), ...snapshotUserIds])];

        if (!allUserIds.length) {
          setRankings([]);
          return;
        }

        setLoadProgress(58);
        setLoadLabel("Carregando perfis...");

        const [profilesRes, eventsRes] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", allUserIds),
          supabase
            .from("rating_events")
            .select("user_id, rating_change, match_id, created_at")
            .eq("season_id", effectiveSeasonId)
            .in("user_id", allUserIds)
            .order("created_at", { ascending: false }),
        ]);

        if (profilesRes.error) throw profilesRes.error;
        if (eventsRes.error) throw eventsRes.error;
        if (cancelled) return;

        const profileMap = new Map((profilesRes.data || []).map((profile) => [profile.user_id, profile]));
        const events = eventsRes.data || [];

        setLoadProgress(76);
        setLoadLabel("Calculando ranking...");

        const userResultsMap = new Map<string, string[]>();
        for (const event of events) {
          const results = userResultsMap.get(event.user_id) || [];
          if (results.length < 5) {
            results.push(Number(event.rating_change) >= 0 ? "W" : "L");
            userResultsMap.set(event.user_id, results);
          }
        }

        const lastChangeMap = new Map<string, number>();
        let previousPositionMap = new Map<string, number>();

        if (events.length > 0 && matchIds.length > 0) {
          const { data: matchRounds, error: matchRoundsError } = await supabase
            .from("matches")
            .select("id, round_id")
            .in("id", matchIds);

          if (matchRoundsError) throw matchRoundsError;

          const matchToRound = new Map((matchRounds || []).map((match) => [match.id, match.round_id]));
          const completedRoundOrder = [...rounds]
            .filter((round: any) => round.status === "completed")
            .sort((a: any, b: any) => {
              const aDate = `${a.scheduled_date || ""}${a.created_at || ""}`;
              const bDate = `${b.scheduled_date || ""}${b.created_at || ""}`;
              return bDate.localeCompare(aDate);
            })
            .map((round: any) => round.id);

          const lastRoundId = completedRoundOrder[0];

          for (const event of events) {
            const roundId = matchToRound.get(event.match_id);
            if (roundId === lastRoundId) {
              lastChangeMap.set(event.user_id, (lastChangeMap.get(event.user_id) || 0) + Number(event.rating_change));
            }
          }

          if (lastRoundId) {
            const previousRatings = snapshots.map((snapshot) => ({
              user_id: snapshot.user_id,
              rating: Number(snapshot.rating) - (lastChangeMap.get(snapshot.user_id) || 0),
            }));

            const previousEligible = previousRatings
              .filter((entry) => {
                const snapshot = snapshots.find((item) => item.user_id === entry.user_id);
                return snapshot ? snapshot.matches_played >= Math.ceil(completedR * 0.3) && Math.ceil(completedR * 0.3) > 0 : false;
              })
              .sort((a, b) => b.rating - a.rating);

            previousPositionMap = new Map(previousEligible.map((entry, index) => [entry.user_id, index + 1]));
          }
        }

        const eligibilityThreshold = Math.ceil(completedR * 0.3);
        const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.user_id, snapshot]));

        const activeMemberIdsSet = new Set(members.map((m) => m.user_id));

        const entries: RankingEntry[] = allUserIds.map((userId) => {
          const snapshot = snapshotMap.get(userId);
          const profile = profileMap.get(userId);
          const computedResults = userResultsMap.get(userId) || [];
          const isFormerMember = !activeMemberIdsSet.has(userId);

          if (snapshot) {
            const isEligible = snapshot.matches_played >= eligibilityThreshold && eligibilityThreshold > 0;
            const snapshotResults = (snapshot.last_5_results as string[]) || [];
            return {
              user_id: userId,
              rating: Number(snapshot.rating),
              position: snapshot.position,
              matches_played: snapshot.matches_played,
              matches_won: snapshot.matches_won,
              sets_won: snapshot.sets_won,
              sets_lost: snapshot.sets_lost,
              games_won: snapshot.games_won,
              games_lost: snapshot.games_lost,
              is_eligible: isEligible,
              last_5_results: snapshotResults.length > 0 ? snapshotResults : computedResults,
              profile: profile || undefined,
              lastChange: lastChangeMap.get(userId),
              hasSnapshot: true,
              isFormerMember,
            };
          }

          return {
            user_id: userId,
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
            isFormerMember,
          };
        });

        entries.sort((a, b) => {
          if (a.is_eligible && !b.is_eligible) return -1;
          if (!a.is_eligible && b.is_eligible) return 1;
          if (a.hasSnapshot && !b.hasSnapshot) return -1;
          if (!a.hasSnapshot && b.hasSnapshot) return 1;
          return b.rating - a.rating;
        });

        let position = 1;
        for (const entry of entries) {
          if (entry.is_eligible) {
            entry.position = position;
            const previousPosition = previousPositionMap.get(entry.user_id);
            if (previousPosition !== undefined) {
              entry.positionChange = previousPosition - position;
            }
            position += 1;
          }
        }

        if (!cancelled) {
          setLoadProgress(100);
          setLoadLabel("Finalizando...");
          setRankings(entries);
        }
      } catch (error) {
        console.error("Erro ao carregar ranking:", error);
        if (!cancelled) {
          setRankings([]);
          setTotalRounds(0);
          setCompletedRounds(0);
          setTotalSets(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadRankingData();

    return () => {
      cancelled = true;
    };
  }, [authLoading, groupsLoading, isAuthenticated, user?.id, groups, selectedSeasonId]);

  useEffect(() => {
    setExpandedUserId(null);
  }, [selectedSeasonId]);

  const isPageLoading = authLoading || groupsLoading || (loading && isAuthenticated);

  const myRanking = rankings.find((r) => r.user_id === user?.id);
  const selectedSeason = seasons.find((s: any) => s.id === selectedSeasonId);
  const remainingRounds = Math.max(0, (selectedSeason?.total_rounds || totalRounds) - completedRounds);
  const eligibleRankings = rankings.filter((r) => r.is_eligible);

  const displayNameMap = useMemo(() => {
    return buildDisplayNames(
      rankings.map((r) => ({
        id: r.user_id,
        name: r.profile?.name || "Jogador",
        nickname: r.profile?.nickname || null,
      })),
    );
  }, [rankings]);

  const collidingFirstNames = useMemo(() => {
    return getCollidingFirstNames(
      rankings.map((r) => ({
        id: r.user_id,
        name: r.profile?.name || "Jogador",
        nickname: r.profile?.nickname || null,
      })),
    );
  }, [rankings]);

  const myFirstName = (myRanking?.profile?.name || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
  const myNameCollides =
    !!myRanking && !myRanking.profile?.nickname && collidingFirstNames.has(myFirstName);

  const getDisplayName = (entry: RankingEntry) =>
    displayNameMap.get(entry.user_id) || entry.profile?.nickname || abbreviateName(entry.profile?.name || "Jogador");

  const rivalryGroup = groups.find((g: any) => isRivalryGroup(g));
  const onlyRivalryGroups = groups.length > 0 && groups.every((g: any) => isRivalryGroup(g));

  // When a rivalry group is selected (or it's the user's only group type),
  // redirect the central "Ranking" tab to its dedicated premium /duel page.
  useEffect(() => {
    if (!rivalryGroup || isPageLoading) return;
    const selected = seasons.find((s: any) => s.id === selectedSeasonId);
    const selectedIsRivalry = selected ? selected.group_id === rivalryGroup.id : false;
    if (onlyRivalryGroups || selectedIsRivalry || !selectedSeasonId) {
      navigate({ to: "/groups/$groupId/duel", params: { groupId: rivalryGroup.id }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivalryGroup?.id, onlyRivalryGroups, selectedSeasonId, seasons, isPageLoading]);

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-8">
      <header className="flex items-center justify-between px-5 pt-6 pb-2 lg:px-0 lg:pt-4">
        <div>
          <h1 className="font-display text-xl lg:text-2xl font-bold text-foreground">Ranking</h1>
          {selectedSeason && (
            <p className="hidden lg:block mt-0.5 text-xs text-muted-foreground">
              {(selectedSeason as any).groups?.name} • {selectedSeason.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedSeason && seasons.length > 1 && (
            <div className="hidden lg:block relative">
              <button
                onClick={() => setShowSwitcher(!showSwitcher)}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-[220px] truncate">{(selectedSeason as any).groups?.name} • {selectedSeason.name}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showSwitcher ? "rotate-180" : ""}`} />
              </button>
              {showSwitcher && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border bg-card/95 backdrop-blur-xl overflow-hidden shadow-xl z-20">
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
                      {selectedSeasonId === s.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedSeason && rankings.length >= 2 && (
            <button
              onClick={() => {
                setCompareMode((m) => {
                  const next = !m;
                  if (next) {
                    setExpandedUserId(null);
                    // Pre-select the current user if they are in the ranking
                    setCompareSelection(user?.id && rankings.some((r) => r.user_id === user.id) ? [user.id] : []);
                  } else {
                    setCompareSelection([]);
                  }
                  return next;
                });
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                compareMode
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-foreground hover:bg-accent"
              }`}
              aria-pressed={compareMode}
              title="Comparar jogadores"
            >
              {compareMode ? <X className="h-3.5 w-3.5" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
              {compareMode ? "Cancelar" : "Comparar"}
            </button>
          )}
          <Link to="/ranking-info" className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent" aria-label="Entenda a pontuação" title="Entenda a pontuação">
            <Info className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </header>

      {/* MOBILE-only season switcher */}
      {selectedSeason && seasons.length > 1 ? (
        <div className="px-5 mt-1 lg:hidden">
          <button
            onClick={() => setShowSwitcher(!showSwitcher)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/80 backdrop-blur-sm px-4 py-2.5 transition-colors hover:bg-accent"
          >
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold text-foreground">{(selectedSeason as any).groups?.name} • {selectedSeason.name}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showSwitcher ? "rotate-180" : ""}`} />
          </button>
        </div>
      ) : selectedSeason ? (
        <div className="px-5 mt-1 lg:hidden">
          <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/80 px-4 py-2.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold text-foreground">{(selectedSeason as any).groups?.name} • {selectedSeason.name}</span>
          </div>
        </div>
      ) : null}

      {showSwitcher && seasons.length > 1 && (
        <div className="mx-5 mt-2 rounded-2xl border border-border bg-card/95 backdrop-blur-xl overflow-hidden shadow-lg lg:hidden">
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
              {selectedSeasonId === s.id && <div className="h-2 w-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3 px-5 pt-3 lg:px-0 lg:pt-4 lg:space-y-0">
        {!isAuthenticated ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Faça login para ver rankings</p>
            <Link to="/login" className="mt-3 inline-block">
              <button className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground">Entrar</button>
            </Link>
          </div>
        ) : isPageLoading ? (
          <div className="py-8">
            <LoadingBar progress={loadProgress} label={loadLabel} />
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
          <div className="space-y-3 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-5 lg:items-start lg:space-y-0">
            {/* ============ LEFT (desktop sidebar) / TOP (mobile) ============ */}
            <aside className="space-y-3 lg:sticky lg:top-4">
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
                            myRanking.positionChange > 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
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
                  <div className="flex border-t border-primary/10">
                    <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
                      <Layers className="h-3 w-3 text-primary/70" />
                      <span className="font-display text-sm font-bold text-foreground">{totalSets}</span>
                      <span className="text-[9px] text-muted-foreground">sets</span>
                    </div>
                    <div className="w-px bg-primary/10" />
                    <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
                      <Calendar className="h-3 w-3 text-primary/70" />
                      <span className="font-display text-sm font-bold text-foreground">{completedRounds}</span>
                      <span className="text-[9px] text-muted-foreground">rodadas</span>
                    </div>
                    <div className="w-px bg-primary/10" />
                    <div className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
                      <Timer className="h-3 w-3 text-primary/70" />
                      <span className="font-display text-sm font-bold text-foreground">{remainingRounds}</span>
                      <span className="text-[9px] text-muted-foreground">restantes</span>
                    </div>
                  </div>
                </div>
              )}

              {eligibleRankings.length >= 3 && (() => {
                const podiumOrder = [
                  { entry: eligibleRankings[1], pos: 2, height: "h-16", color: "var(--rank-silver)" },
                  { entry: eligibleRankings[0], pos: 1, height: "h-24", color: "var(--rank-gold)" },
                  { entry: eligibleRankings[2], pos: 3, height: "h-12", color: "var(--rank-bronze)" },
                ];
                return (
                  <div className="rounded-2xl border border-border bg-card/50 px-3 pt-4 pb-2">
                    <p className="hidden lg:block mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pódio</p>
                    <div className="flex items-end justify-center gap-2">
                      {podiumOrder.map(({ entry, pos, height, color }) => {
                        if (!entry) return null;
                        const displayName = getDisplayName(entry);
                        const wr = winRate(entry.matches_won, entry.matches_played);
                        const isCenter = pos === 1;
                        return (
                          <div key={entry.user_id} className="flex flex-col items-center" style={{ width: isCenter ? 100 : 88 }}>
                            {pos === 1 && (
                              <Crown className="mb-1 h-5 w-5" style={{ color: "var(--rank-gold)" }} fill="var(--rank-gold)" />
                            )}
                            <div className="rounded-full p-[2px]" style={{ backgroundColor: color }}>
                              <PlayerAvatar
                                avatarUrl={entry.profile?.avatar_url}
                                name={entry.profile?.name || "?"}
                                size={isCenter ? "lg" : "md"}
                                dimmed={entry.isFormerMember}
                                className={`${isCenter ? "!h-14 !w-14" : "!h-11 !w-11"} border-2 border-background`}
                              />
                            </div>
                            <p className={`mt-1.5 text-center text-[11px] font-semibold leading-tight truncate w-full ${entry.isFormerMember ? "text-muted-foreground line-through" : "text-foreground"}`}>{displayName}</p>
                            <p className="font-display text-sm font-bold text-primary">{Math.round(entry.rating).toLocaleString("pt-BR")}</p>
                            <p className="text-[9px] text-muted-foreground">{wr}% WR</p>
                            <div
                              className={`mt-1.5 w-full rounded-t-lg ${height} flex items-center justify-center`}
                              style={{ backgroundColor: `color-mix(in oklab, ${color} 25%, transparent)`, borderTop: `2px solid ${color}` }}
                            >
                              <span className="font-display text-lg font-bold" style={{ color }}>{pos}º</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {myNameCollides && (
                <Link
                  to="/profile"
                  className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2.5 transition hover:bg-warning/15"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">Nome em comum no ranking</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Existem jogadores com o mesmo primeiro nome. Adicione um apelido no seu perfil para evitar confusão.
                    </p>
                  </div>
                </Link>
              )}
            </aside>

            {/* ============ RIGHT: Ranking table ============ */}
            <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
              {/* Desktop header */}
              <div className="hidden lg:grid lg:grid-cols-[60px_minmax(0,1fr)_90px_100px_140px_120px] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="text-center">Pos.</span>
                <span>Jogador</span>
                <span className="text-center">Elo</span>
                <span className="text-center">V / D</span>
                <span className="text-center">Aproveitamento</span>
                <span className="text-center">Últimos 5</span>
              </div>
              {/* Mobile header */}
              <div className="flex lg:hidden items-center border-b border-border bg-muted/30 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="w-8 text-center">#</span>
                <span className="flex-1 pl-1">Jogador</span>
                <span className="w-11 text-center">Elo</span>
                <span className="w-[72px] text-center">V/D (WR%)</span>
                <span className="w-16 text-center">Últimas</span>
              </div>

              {rankings.map((entry, idx) => {
                const isMe = entry.user_id === user?.id;
                const pos = entry.position || "—";
                const wr = winRate(entry.matches_won, entry.matches_played);
                const isInactive = !entry.is_eligible;
                const isFormer = !!entry.isFormerMember;
                const displayName = getDisplayName(entry);
                const losses = entry.matches_played - entry.matches_won;
                const isEven = idx % 2 === 0;
                const isExpanded = expandedUserId === entry.user_id;
                const canExpand = entry.matches_played > 0 && !isFormer;

                const posBg =
                  typeof pos === "number" && pos === 1 ? "var(--rank-gold)"
                  : typeof pos === "number" && pos === 2 ? "var(--rank-silver)"
                  : typeof pos === "number" && pos === 3 ? "var(--rank-bronze)"
                  : "transparent";
                const posColor = typeof pos === "number" && pos <= 3 ? "var(--background)" : "var(--muted-foreground)";

                const isSelected = compareSelection.includes(entry.user_id);
                const canSelect = canExpand; // same eligibility — needs matches
                const handleRowAction = () => {
                  if (compareMode) {
                    if (!canSelect) return;
                    setCompareSelection((sel) => {
                      if (sel.includes(entry.user_id)) return sel.filter((id) => id !== entry.user_id);
                      if (sel.length >= 2) return [sel[1], entry.user_id]; // keep last + new
                      return [...sel, entry.user_id];
                    });
                  } else if (canExpand) {
                    setExpandedUserId(isExpanded ? null : entry.user_id);
                  }
                };
                const interactive = compareMode ? canSelect : canExpand;

                return (
                  <div key={entry.user_id} className={idx > 0 ? "border-t border-border/40" : ""}>
                    <div
                      role={interactive ? "button" : undefined}
                      tabIndex={interactive ? 0 : undefined}
                      aria-expanded={!compareMode && canExpand ? isExpanded : undefined}
                      aria-pressed={compareMode && canSelect ? isSelected : undefined}
                      onClick={handleRowAction}
                      onKeyDown={(e) => {
                        if (!interactive) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowAction();
                        }
                      }}
                      className={`
                        group flex lg:grid lg:grid-cols-[60px_minmax(0,1fr)_90px_100px_140px_120px] lg:gap-3 items-center
                        px-2 py-2 lg:px-4 lg:py-2 transition-colors
                        ${isMe ? "bg-primary/5 lg:bg-primary/10" : isEven ? "bg-muted/10" : ""}
                        ${isExpanded && !compareMode ? "bg-primary/10 lg:bg-primary/15" : ""}
                        ${compareMode && isSelected ? "bg-primary/15 ring-1 ring-inset ring-primary/40" : ""}
                        ${(isInactive || isFormer) && !compareMode ? "opacity-60" : ""}
                        ${compareMode && !canSelect ? "opacity-40" : ""}
                        ${interactive ? "cursor-pointer lg:hover:bg-accent/30 focus:outline-none focus:ring-1 focus:ring-primary/40" : ""}
                      `}
                    >
                      {compareMode && (
                        <div className="mr-1 flex w-5 shrink-0 items-center justify-center lg:mr-0 lg:w-6">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border transition lg:h-5 lg:w-5 ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : canSelect
                                ? "border-border bg-background"
                                : "border-border/40 bg-muted/30"
                            }`}
                            aria-hidden="true"
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 lg:h-3 lg:w-3" strokeWidth={3} />}
                          </span>
                        </div>
                      )}
                      {/* Position */}
                      <div className="w-8 lg:w-auto shrink-0 text-center">
                        <div className="flex items-center justify-center">
                          <div
                            className="flex h-5 w-5 lg:h-7 lg:w-9 items-center justify-center rounded-md text-[10px] lg:text-xs font-bold"
                            style={{ backgroundColor: posBg, color: posColor }}
                          >
                            {pos}
                          </div>
                        </div>
                        {entry.positionChange !== undefined && entry.positionChange !== 0 && (
                          <div className={`mt-0.5 flex items-center justify-center gap-px text-[8px] lg:text-[10px] font-bold leading-none ${
                            entry.positionChange > 0 ? "text-success" : "text-destructive"
                          }`}>
                            {entry.positionChange > 0 ? "▲" : "▼"}{Math.abs(entry.positionChange)}
                          </div>
                        )}
                      </div>

                      {/* Avatar + Name */}
                      <div className="flex flex-1 lg:flex-none items-center gap-1.5 lg:gap-2.5 min-w-0 pl-1 lg:pl-0">
                        <PlayerAvatar avatarUrl={entry.profile?.avatar_url} name={entry.profile?.name || "?"} size="sm" dimmed={isFormer} className="border border-border !h-7 !w-7 lg:!h-9 lg:!w-9" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-[11px] lg:text-sm font-semibold leading-tight truncate ${isFormer ? "text-muted-foreground line-through" : "text-foreground"}`}>
                              {displayName}
                              {isMe && <span className="ml-1 text-primary text-[9px] lg:text-[10px] font-bold">(você)</span>}
                            </p>
                            {canExpand && (
                              <span
                                className={`inline-flex items-center justify-center h-4 w-4 lg:h-5 lg:w-5 shrink-0 rounded-full border transition-all ${
                                  isExpanded
                                    ? "bg-primary/20 border-primary/50 text-primary"
                                    : "bg-muted/40 border-border text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/40"
                                }`}
                                aria-hidden="true"
                                title={isExpanded ? "Recolher detalhes" : "Ver detalhes"}
                              >
                                <ChevronDown
                                  className={`h-2.5 w-2.5 lg:h-3 lg:w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </span>
                            )}
                          </div>
                          {isFormer ? (
                            <p className="text-[8px] lg:text-[10px] uppercase tracking-wide text-muted-foreground leading-none mt-0.5">Ex-membro</p>
                          ) : isInactive && !entry.hasSnapshot ? (
                            <p className="text-[8px] lg:text-[10px] text-muted-foreground leading-none mt-0.5">Sem partidas</p>
                          ) : isInactive ? (
                            <p className="hidden lg:block text-[10px] text-muted-foreground leading-none mt-0.5">Não elegível</p>
                          ) : null}
                        </div>
                      </div>

                      {/* Elo */}
                      <div className="w-11 lg:w-auto text-center">
                        <p className="font-display text-[11px] lg:text-base font-bold text-foreground leading-tight">{Math.round(entry.rating)}</p>
                        {entry.lastChange !== undefined && (
                          <p className={`text-[8px] lg:text-[10px] font-semibold leading-none ${entry.lastChange > 0 ? "text-success" : entry.lastChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {entry.lastChange > 0 ? "+" : ""}{Math.round(entry.lastChange)}
                          </p>
                        )}
                      </div>

                      {/* MOBILE V/D (WR%) */}
                      <div className="w-[72px] text-center lg:hidden">
                        {entry.matches_played > 0 ? (
                          <span className="text-[10px]">
                            <span className="text-foreground">{entry.matches_won}/{losses}</span>
                            <span className={`ml-1 font-semibold ${wr >= 60 ? "text-success" : wr >= 40 ? "text-foreground" : "text-destructive"}`}>
                              ({wr}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">0/0</span>
                        )}
                      </div>

                      {/* DESKTOP V / D split */}
                      <div className="hidden lg:block text-center text-sm tabular-nums">
                        {entry.matches_played > 0 ? (
                          <span>
                            <span className="font-semibold text-success">{entry.matches_won}</span>
                            <span className="mx-1 text-muted-foreground">/</span>
                            <span className="font-semibold text-destructive">{losses}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* DESKTOP Win rate with bar */}
                      <div className="hidden lg:flex flex-col items-center gap-1">
                        {entry.matches_played > 0 ? (
                          <>
                            <span className={`text-xs font-semibold tabular-nums ${wr >= 60 ? "text-success" : wr >= 40 ? "text-foreground" : "text-destructive"}`}>
                              {wr}%
                            </span>
                            <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${wr >= 60 ? "bg-success" : wr >= 40 ? "bg-primary" : "bg-destructive"}`}
                                style={{ width: `${wr}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Last 5 results */}
                      <div className="flex w-16 lg:w-auto justify-center gap-0.5 lg:gap-1">
                        {entry.last_5_results.length > 0 ? (
                          entry.last_5_results.slice(0, 5).map((r, i) => (
                            <div
                              key={i}
                              className={`h-2.5 w-2.5 lg:h-3 lg:w-3 rounded-full ${
                                r === "W" ? "bg-success" : r === "L" ? "bg-destructive" : "bg-muted"
                              }`}
                              title={r === "W" ? "Vitória" : r === "L" ? "Derrota" : ""}
                            />
                          ))
                        ) : (
                          <span className="text-[9px] lg:text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && canExpand && selectedSeason && (
                      <RankingPlayerDetails
                        userId={entry.user_id}
                        seasonId={selectedSeason.id}
                        groupId={(selectedSeason as any).group_id}
                        rating={entry.rating}
                        matchesPlayed={entry.matches_played}
                        matchesWon={entry.matches_won}
                        setsWon={entry.sets_won}
                        setsLost={entry.sets_lost}
                        gamesWon={entry.games_won}
                        gamesLost={entry.games_lost}
                        position={entry.position}
                        isEligible={entry.is_eligible}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
