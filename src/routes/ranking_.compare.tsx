import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trophy, Activity, Swords, Users, TrendingUp, Share2, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { abbreviateName } from "@/lib/utils";

const searchSchema = z.object({
  a: fallback(z.string(), "").default(""),
  b: fallback(z.string(), "").default(""),
  groupId: fallback(z.string(), "").default(""),
  tab: fallback(z.enum(["career", "season"]), "season").default("season"),
  seasonId: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/ranking_/compare")({
  validateSearch: zodValidator(searchSchema),
  component: ComparePage,
});

interface Profile {
  user_id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
}

interface SeasonStat {
  season_id: string;
  season_name: string;
  rating: number;
  matches_played: number;
  matches_won: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  position: number | null;
  is_eligible: boolean;
}

interface PlayerAggregate {
  profile: Profile;
  // Per-season snapshots (current rating)
  seasons: SeasonStat[];
  // Career totals (sum across snapshots)
  career: {
    matches_played: number;
    matches_won: number;
    sets_won: number;
    sets_lost: number;
    games_won: number;
    games_lost: number;
    seasons_played: number;
    titles: number; // # of seasons with position == 1 (eligible)
    podiums: number; // # of seasons with position 1-3 (eligible)
    best_position: number | null;
  };
  // Elo evolution from rating_events (chronological)
  eloSeries: { x: number; rating: number; created_at: string; season_id: string }[];
  eloPeak: number;
  eloLow: number;
  eloCurrent: number;
  // Streaks computed from rating_events sign
  streakMax: number;
  streakCurrent: number;
  // Frequency: rounds present / total rounds in group
  roundsPresent: number;
  roundsTotal: number;
}

interface H2HData {
  asPartners: { played: number; won: number };
  asOpponents: { played: number; aWon: number; bWon: number };
  recentMeetings: {
    match_id: string;
    round_id: string;
    season_id: string;
    season_name: string;
    asPartners: boolean;
    aTeam: "A" | "B";
    bTeam: "A" | "B";
    winner: "A" | "B" | null;
    created_at: string;
    sets: { set_number: number; score_team_a: number; score_team_b: number }[];
  }[];
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function ComparePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { a: userA, b: userB, groupId, tab } = search;

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Carregando comparativo...");
  const [groupName, setGroupName] = useState<string>("");
  const [playerA, setPlayerA] = useState<PlayerAggregate | null>(null);
  const [playerB, setPlayerB] = useState<PlayerAggregate | null>(null);
  const [h2h, setH2H] = useState<H2HData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userA || !userB || !groupId) {
        setError("Parâmetros inválidos");
        setLoading(false);
        return;
      }
      if (userA === userB) {
        setError("Selecione dois jogadores diferentes");
        setLoading(false);
        return;
      }
      setLoading(true);
      setProgress(10);
      setLabel("Buscando jogadores...");

      try {
        // Group + seasons
        const [groupRes, seasonsRes, profilesRes] = await Promise.all([
          supabase.from("groups").select("name").eq("id", groupId).single(),
          supabase
            .from("seasons")
            .select("id, name, group_id, status, created_at")
            .eq("group_id", groupId)
            .in("status", ["active", "finished"])
            .order("created_at", { ascending: false }),
          supabase
            .from("user_profiles")
            .select("user_id, name, nickname, avatar_url")
            .in("user_id", [userA, userB]),
        ]);
        if (cancelled) return;
        if (groupRes.error) throw groupRes.error;
        if (seasonsRes.error) throw seasonsRes.error;
        if (profilesRes.error) throw profilesRes.error;

        setGroupName(groupRes.data?.name || "");
        const seasons = seasonsRes.data || [];
        const seasonIds = seasons.map((s: any) => s.id);
        const seasonNameMap = new Map(seasons.map((s: any) => [s.id, s.name]));

        const profileA = profilesRes.data?.find((p: any) => p.user_id === userA);
        const profileB = profilesRes.data?.find((p: any) => p.user_id === userB);
        if (!profileA || !profileB) {
          setError("Jogador não encontrado");
          setLoading(false);
          return;
        }

        setProgress(30);
        setLabel("Carregando estatísticas...");

        // Snapshots, rating events, rounds, presence — all scoped to this group
        const [snapsRes, eventsRes, roundsRes, presenceRes] = await Promise.all([
          seasonIds.length
            ? supabase
                .from("ranking_snapshots")
                .select("*")
                .in("season_id", seasonIds)
                .in("user_id", [userA, userB])
            : Promise.resolve({ data: [], error: null } as any),
          seasonIds.length
            ? supabase
                .from("rating_events")
                .select("user_id, rating_after, rating_before, rating_change, created_at, match_id, season_id")
                .in("season_id", seasonIds)
                .in("user_id", [userA, userB])
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("rounds")
            .select("id, status")
            .eq("group_id", groupId),
          supabase
            .from("round_presence")
            .select("round_id, user_id, status")
            .in("user_id", [userA, userB]),
        ]);
        if (cancelled) return;
        if (snapsRes.error) throw snapsRes.error;
        if (eventsRes.error) throw eventsRes.error;
        if (roundsRes.error) throw roundsRes.error;
        if (presenceRes.error) throw presenceRes.error;

        const snaps = snapsRes.data || [];
        const events = eventsRes.data || [];
        const rounds = roundsRes.data || [];
        const groupRoundIds = new Set(rounds.map((r: any) => r.id));
        const completedRoundIds = new Set(rounds.filter((r: any) => r.status === "completed").map((r: any) => r.id));
        const presence = (presenceRes.data || []).filter((p: any) => groupRoundIds.has(p.round_id));

        setProgress(55);
        setLabel("Calculando confrontos...");

        // Match player rows for both users to compute H2H + sets for scores
        const matchIdsFromEvents: string[] = Array.from(new Set(events.map((e: any) => e.match_id as string)));
        let matchPlayers: any[] = [];
        let matchesMeta: any[] = [];
        let matchSets: any[] = [];
        if (matchIdsFromEvents.length) {
          const [mpRes, mRes, setsRes] = await Promise.all([
            supabase
              .from("match_players")
              .select("match_id, user_id, team")
              .in("match_id", matchIdsFromEvents),
            supabase
              .from("matches")
              .select("id, round_id, winner_team, status, created_at")
              .in("id", matchIdsFromEvents),
            supabase
              .from("match_sets")
              .select("match_id, set_number, score_team_a, score_team_b")
              .in("match_id", matchIdsFromEvents)
              .order("set_number", { ascending: true }),
          ]);
          if (mpRes.error) throw mpRes.error;
          if (mRes.error) throw mRes.error;
          if (setsRes.error) throw setsRes.error;
          matchPlayers = mpRes.data || [];
          matchesMeta = mRes.data || [];
          matchSets = setsRes.data || [];
        }

        setProgress(80);
        setLabel("Montando comparativo...");

        const buildAggregate = (uid: string, profile: Profile): PlayerAggregate => {
          const userSnaps = snaps.filter((s: any) => s.user_id === uid);
          const seasonStats: SeasonStat[] = userSnaps.map((s: any) => ({
            season_id: s.season_id,
            season_name: seasonNameMap.get(s.season_id) || "—",
            rating: Number(s.rating),
            matches_played: s.matches_played || 0,
            matches_won: s.matches_won || 0,
            sets_won: s.sets_won || 0,
            sets_lost: s.sets_lost || 0,
            games_won: s.games_won || 0,
            games_lost: s.games_lost || 0,
            position: s.position,
            is_eligible: !!s.is_eligible,
          }));

          const career = seasonStats.reduce(
            (acc, s) => {
              acc.matches_played += s.matches_played;
              acc.matches_won += s.matches_won;
              acc.sets_won += s.sets_won;
              acc.sets_lost += s.sets_lost;
              acc.games_won += s.games_won;
              acc.games_lost += s.games_lost;
              if (s.matches_played > 0) acc.seasons_played += 1;
              if (s.is_eligible && s.position === 1) acc.titles += 1;
              if (s.is_eligible && s.position && s.position <= 3) acc.podiums += 1;
              if (s.is_eligible && s.position) {
                acc.best_position = acc.best_position === null ? s.position : Math.min(acc.best_position, s.position);
              }
              return acc;
            },
            {
              matches_played: 0,
              matches_won: 0,
              sets_won: 0,
              sets_lost: 0,
              games_won: 0,
              games_lost: 0,
              seasons_played: 0,
              titles: 0,
              podiums: 0,
              best_position: null as number | null,
            },
          );

          const userEvents = events.filter((e: any) => e.user_id === uid);
          const eloSeries = userEvents.map((e: any, i: number) => ({
            x: i,
            rating: Number(e.rating_after),
            created_at: e.created_at,
            season_id: e.season_id,
          }));
          const eloRatings: number[] = eloSeries.map((p: { rating: number }) => p.rating);
          const eloCurrent = eloRatings.length ? eloRatings[eloRatings.length - 1] : 1000;
          const eloPeak = eloRatings.length ? Math.max(...eloRatings) : 1000;
          const eloLow = eloRatings.length ? Math.min(...eloRatings) : 1000;

          // Streaks based on rating_change sign
          let streakMax = 0;
          let streakCurrent = 0;
          let cur = 0;
          for (const e of userEvents) {
            if (Number(e.rating_change) > 0) {
              cur += 1;
              if (cur > streakMax) streakMax = cur;
            } else {
              cur = 0;
            }
          }
          // Current streak = trailing positives
          for (let i = userEvents.length - 1; i >= 0; i--) {
            if (Number(userEvents[i].rating_change) > 0) streakCurrent += 1;
            else break;
          }

          // Frequency: a player is "present" in a completed round if they actually
          // played any match in that round (authoritative). Fall back to round_presence
          // (confirmed/present) for rounds where the user didn't play but signaled presence.
          const playedRoundIds = new Set<string>();
          for (const mp of matchPlayers) {
            if (mp.user_id !== uid) continue;
            const meta = matchMetaMap.get(mp.match_id);
            if (!meta) continue;
            if (completedRoundIds.has(meta.round_id)) playedRoundIds.add(meta.round_id);
          }
          const signaledPresent = presence
            .filter((p: any) => p.user_id === uid && completedRoundIds.has(p.round_id) && (p.status === "confirmed" || p.status === "present"))
            .map((p: any) => p.round_id);
          for (const rid of signaledPresent) playedRoundIds.add(rid);
          const roundsPresent = playedRoundIds.size;
          const roundsTotal = completedRoundIds.size;

          return {
            profile,
            seasons: seasonStats,
            career,
            eloSeries,
            eloPeak,
            eloLow,
            eloCurrent,
            streakMax,
            streakCurrent,
            roundsPresent,
            roundsTotal,
          };
        };

        const aggA = buildAggregate(userA, profileA);
        const aggB = buildAggregate(userB, profileB);

        // H2H computation: for each match, both must be present
        const matchToPlayers = new Map<string, any[]>();
        for (const mp of matchPlayers) {
          const arr = matchToPlayers.get(mp.match_id) || [];
          arr.push(mp);
          matchToPlayers.set(mp.match_id, arr);
        }
        const matchMetaMap = new Map(matchesMeta.map((m: any) => [m.id, m]));

        const meetings: H2HData["recentMeetings"] = [];
        let asPartnersPlayed = 0;
        let asPartnersWon = 0;
        let asOppPlayed = 0;
        let aWon = 0;
        let bWon = 0;

        for (const [matchId, players] of matchToPlayers.entries()) {
          const a = players.find((p) => p.user_id === userA);
          const b = players.find((p) => p.user_id === userB);
          if (!a || !b) continue;
          const meta = matchMetaMap.get(matchId);
          if (!meta || meta.status !== "completed") continue;

          const sameTeam = a.team === b.team;
          const winner = (meta.winner_team as "A" | "B" | null) || null;

          if (sameTeam) {
            asPartnersPlayed += 1;
            if (winner && winner === a.team) asPartnersWon += 1;
          } else {
            asOppPlayed += 1;
            if (winner === a.team) aWon += 1;
            else if (winner === b.team) bWon += 1;
          }

          // Get season name from any event for this match
          const evt = events.find((e: any) => e.match_id === matchId);
          meetings.push({
            match_id: matchId,
            round_id: meta.round_id,
            season_id: evt?.season_id || "",
            season_name: evt?.season_id ? (seasonNameMap.get(evt.season_id) || "—") : "—",
            asPartners: sameTeam,
            aTeam: a.team,
            bTeam: b.team,
            winner,
            created_at: meta.created_at,
          });
        }

        meetings.sort((x, y) => y.created_at.localeCompare(x.created_at));

        if (!cancelled) {
          setPlayerA(aggA);
          setPlayerB(aggB);
          setH2H({
            asPartners: { played: asPartnersPlayed, won: asPartnersWon },
            asOpponents: { played: asOppPlayed, aWon, bWon },
            recentMeetings: meetings.slice(0, 10),
          });
          setProgress(100);
          setLoading(false);
        }
      } catch (e: any) {
        console.error("Erro ao carregar comparativo:", e);
        if (!cancelled) {
          setError(e.message || "Erro ao carregar comparativo");
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userA, userB, groupId]);

  const swap = () => {
    navigate({
      to: "/ranking/compare",
      search: (prev: any) => ({ ...prev, a: prev.b, b: prev.a }),
    });
  };

  const setTab = (next: "career" | "season") => {
    navigate({ to: "/ranking/compare", search: (prev: any) => ({ ...prev, tab: next }) });
  };

  const share = async () => {
    const url = window.location.href;
    const title = playerA && playerB ? `Comparativo: ${displayName(playerA)} vs ${displayName(playerB)}` : "Comparativo";
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* ignore */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch { /* ignore */ }
    }
  };

  // Latest season (by snapshots) shown in "Temporada" tab
  const latestSeasonId = useMemo(() => {
    if (!playerA || !playerB) return null;
    const ids = new Set<string>();
    playerA.seasons.forEach((s) => ids.add(s.season_id));
    playerB.seasons.forEach((s) => ids.add(s.season_id));
    // Use first id from either player's seasons array (they came ordered by created_at desc from query)
    return playerA.seasons[0]?.season_id || playerB.seasons[0]?.season_id || null;
  }, [playerA, playerB]);

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-8">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 lg:px-0">
          <Link
            to="/ranking"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Ranking
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-display text-sm font-bold text-foreground lg:text-base">Comparativo</p>
            {groupName && <p className="truncate text-[10px] text-muted-foreground lg:text-xs">{groupName}</p>}
          </div>
          <button
            onClick={share}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
            aria-label="Compartilhar"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compartilhar</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-4 lg:px-0">
        {loading ? (
          <div className="py-12">
            <TrophyLoadingBar progress={progress} label={label} />
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Link to="/ranking" className="mt-3 inline-block text-xs font-semibold text-primary underline">
              Voltar ao ranking
            </Link>
          </div>
        ) : !playerA || !playerB ? null : (
          <>
            {/* HERO: head to head */}
            <section className="rounded-3xl border border-border bg-card/40 p-4 lg:p-6">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 lg:gap-6">
                <PlayerHero player={playerA} side="left" />
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    VS
                  </div>
                  <button
                    onClick={swap}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent"
                    title="Inverter posições"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    Inverter
                  </button>
                </div>
                <PlayerHero player={playerB} side="right" />
              </div>

              {/* H2H summary */}
              {h2h && (h2h.asOpponents.played > 0 || h2h.asPartners.played > 0) && (
                <div className="mt-4 grid grid-cols-2 gap-2 lg:gap-3">
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Swords className="h-3 w-3 text-destructive" />
                      Como adversários
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div>
                        <p className="font-display text-2xl font-bold text-foreground">{h2h.asOpponents.aWon}</p>
                        <p className="text-[10px] text-muted-foreground">{abbreviateName(playerA.profile.name)}</p>
                      </div>
                      <div className="px-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{h2h.asOpponents.played} jogo{h2h.asOpponents.played === 1 ? "" : "s"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl font-bold text-foreground">{h2h.asOpponents.bWon}</p>
                        <p className="text-[10px] text-muted-foreground">{abbreviateName(playerB.profile.name)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Users className="h-3 w-3 text-primary" />
                      Como parceiros
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div>
                        <p className="font-display text-2xl font-bold text-success">{h2h.asPartners.won}V</p>
                        <p className="text-[10px] text-muted-foreground">{h2h.asPartners.played - h2h.asPartners.won}D</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl font-bold text-foreground">{pct(h2h.asPartners.won, h2h.asPartners.played)}%</p>
                        <p className="text-[10px] text-muted-foreground">{h2h.asPartners.played} jogo{h2h.asPartners.played === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Tabs */}
            <div className="mt-4 inline-flex rounded-full border border-border bg-card/60 p-1">
              <TabBtn active={tab === "season"} onClick={() => setTab("season")}>Temporada atual</TabBtn>
              <TabBtn active={tab === "career"} onClick={() => setTab("career")}>Carreira no grupo</TabBtn>
            </div>

            {tab === "season" ? (
              <SeasonTab a={playerA} b={playerB} latestSeasonId={latestSeasonId} />
            ) : (
              <CareerTab a={playerA} b={playerB} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function displayName(p: PlayerAggregate) {
  return p.profile.nickname?.trim() || abbreviateName(p.profile.name);
}

function PlayerHero({ player, side }: { player: PlayerAggregate; side: "left" | "right" }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${side === "right" ? "" : ""}`}>
      <PlayerAvatar avatarUrl={player.profile.avatar_url} name={player.profile.name} size="lg" className="!h-16 !w-16 lg:!h-20 lg:!w-20 border-2 border-primary/30" />
      <p className="text-center font-display text-sm font-bold text-foreground lg:text-base truncate max-w-full">
        {displayName(player)}
      </p>
      <p className="font-display text-2xl font-bold text-primary lg:text-3xl">{Math.round(player.eloCurrent)}</p>
      <p className="text-[10px] text-muted-foreground">Pico {Math.round(player.eloPeak)} · Mín {Math.round(player.eloLow)}</p>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatRow({
  label,
  a,
  b,
  format = (v) => `${v}`,
  higherIsBetter = true,
  icon,
}: {
  label: string;
  a: number;
  b: number;
  format?: (v: number) => string;
  higherIsBetter?: boolean;
  icon?: React.ReactNode;
}) {
  const aBetter = higherIsBetter ? a > b : a < b;
  const bBetter = higherIsBetter ? b > a : b < a;
  const max = Math.max(a, b, 1);
  const aPct = (a / max) * 100;
  const bPct = (b / max) * 100;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5">
      <div className="flex justify-end">
        <div className="flex flex-col items-end">
          <span className={`font-display text-base font-bold tabular-nums lg:text-lg ${aBetter ? "text-success" : "text-foreground"}`}>
            {format(a)}
            {aBetter && <TrendingUp className="ml-1 inline h-3 w-3" />}
          </span>
          <div className="mt-1 h-1 w-20 lg:w-32 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${aBetter ? "bg-success" : "bg-primary/40"} ml-auto`} style={{ width: `${aPct}%` }} />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center px-2">
        {icon}
        <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <div className="flex justify-start">
        <div className="flex flex-col items-start">
          <span className={`font-display text-base font-bold tabular-nums lg:text-lg ${bBetter ? "text-success" : "text-foreground"}`}>
            {bBetter && <TrendingUp className="mr-1 inline h-3 w-3" />}
            {format(b)}
          </span>
          <div className="mt-1 h-1 w-20 lg:w-32 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${bBetter ? "bg-success" : "bg-primary/40"}`} style={{ width: `${bPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-3xl border border-border bg-card/40 p-4 lg:p-5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-sm font-bold text-foreground">{title}</h2>
      </div>
      <div className="divide-y divide-border/40">{children}</div>
    </section>
  );
}

function EloSparkline({ a, b }: { a: PlayerAggregate; b: PlayerAggregate }) {
  const all = [...a.eloSeries.map((p) => p.rating), ...b.eloSeries.map((p) => p.rating)];
  if (!all.length) return null;
  const min = Math.min(...all) - 10;
  const max = Math.max(...all) + 10;
  const W = 320;
  const H = 90;
  const range = max - min || 1;
  const series = (s: PlayerAggregate, color: string) => {
    if (s.eloSeries.length === 0) return null;
    const n = s.eloSeries.length;
    const points = s.eloSeries.map((p, i) => {
      const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
      const y = H - ((p.rating - min) / range) * H;
      return `${x},${y}`;
    });
    return <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points.join(" ")} />;
  };

  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Evolução do Elo</p>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> {displayName(a)}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--rank-silver)" }} /> {displayName(b)}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none">
        {series(a, "var(--primary)")}
        {series(b, "var(--rank-silver)")}
      </svg>
    </div>
  );
}

function CareerTab({ a, b }: { a: PlayerAggregate; b: PlayerAggregate }) {
  return (
    <>
      <SectionCard title="Elo (carreira no grupo)" icon={<Activity className="h-4 w-4 text-primary" />}>
        <StatRow label="Elo atual" a={a.eloCurrent} b={b.eloCurrent} format={(v) => Math.round(v).toString()} />
        <StatRow label="Pico histórico" a={a.eloPeak} b={b.eloPeak} format={(v) => Math.round(v).toString()} />
        <StatRow label="Vale histórico" a={a.eloLow} b={b.eloLow} format={(v) => Math.round(v).toString()} higherIsBetter={false} />
        <EloSparkline a={a} b={b} />
      </SectionCard>

      <SectionCard title="Aproveitamento total" icon={<Trophy className="h-4 w-4 text-primary" />}>
        <StatRow label="Partidas" a={a.career.matches_played} b={b.career.matches_played} />
        <StatRow label="Vitórias" a={a.career.matches_won} b={b.career.matches_won} />
        <StatRow
          label="Aproveitamento"
          a={pct(a.career.matches_won, a.career.matches_played)}
          b={pct(b.career.matches_won, b.career.matches_played)}
          format={(v) => `${v}%`}
        />
        <StatRow label="Sets ganhos" a={a.career.sets_won} b={b.career.sets_won} />
        <StatRow
          label="Saldo de sets"
          a={a.career.sets_won - a.career.sets_lost}
          b={b.career.sets_won - b.career.sets_lost}
          format={(v) => (v > 0 ? `+${v}` : `${v}`)}
        />
        <StatRow
          label="Saldo de games"
          a={a.career.games_won - a.career.games_lost}
          b={b.career.games_won - b.career.games_lost}
          format={(v) => (v > 0 ? `+${v}` : `${v}`)}
        />
      </SectionCard>

      <SectionCard title="Conquistas" icon={<Trophy className="h-4 w-4 text-warning" />}>
        <StatRow label="Temporadas" a={a.career.seasons_played} b={b.career.seasons_played} />
        <StatRow label="Títulos (1º)" a={a.career.titles} b={b.career.titles} />
        <StatRow label="Pódios" a={a.career.podiums} b={b.career.podiums} />
        <StatRow
          label="Melhor posição"
          a={a.career.best_position ?? 999}
          b={b.career.best_position ?? 999}
          format={(v) => (v === 999 ? "—" : `${v}º`)}
          higherIsBetter={false}
        />
      </SectionCard>

      <SectionCard title="Sequências e frequência" icon={<TrendingUp className="h-4 w-4 text-success" />}>
        <StatRow label="Maior sequência V" a={a.streakMax} b={b.streakMax} />
        <StatRow label="Sequência atual" a={a.streakCurrent} b={b.streakCurrent} />
        <StatRow
          label="Presença"
          a={pct(a.roundsPresent, a.roundsTotal)}
          b={pct(b.roundsPresent, b.roundsTotal)}
          format={(v) => `${v}%`}
        />
        <StatRow label="Rodadas presentes" a={a.roundsPresent} b={b.roundsPresent} />
      </SectionCard>
    </>
  );
}

function SeasonTab({ a, b, latestSeasonId }: { a: PlayerAggregate; b: PlayerAggregate; latestSeasonId: string | null }) {
  // Build union of seasonIds, ordered by appearance (already desc by created_at from query)
  const allSeasonIds: string[] = [];
  const seen = new Set<string>();
  for (const s of [...a.seasons, ...b.seasons]) {
    if (!seen.has(s.season_id)) {
      seen.add(s.season_id);
      allSeasonIds.push(s.season_id);
    }
  }

  const initial = latestSeasonId && allSeasonIds.includes(latestSeasonId) ? latestSeasonId : allSeasonIds[0] || "";
  const [seasonId, setSeasonId] = useState<string>(initial);
  useEffect(() => {
    if (initial && !seasonId) setSeasonId(initial);
  }, [initial, seasonId]);

  const sA = a.seasons.find((s) => s.season_id === seasonId);
  const sB = b.seasons.find((s) => s.season_id === seasonId);
  const seasonName =
    a.seasons.find((s) => s.season_id === seasonId)?.season_name ||
    b.seasons.find((s) => s.season_id === seasonId)?.season_name ||
    "—";

  if (!seasonId) {
    return (
      <div className="mt-4 rounded-3xl border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground">
        Nenhuma temporada com dados para esses jogadores.
      </div>
    );
  }

  const stats = (s?: SeasonStat) =>
    s || {
      season_id: seasonId,
      season_name: seasonName,
      rating: 1000,
      matches_played: 0,
      matches_won: 0,
      sets_won: 0,
      sets_lost: 0,
      games_won: 0,
      games_lost: 0,
      position: null,
      is_eligible: false,
    };
  const A = stats(sA);
  const B = stats(sB);

  return (
    <>
      {allSeasonIds.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allSeasonIds.map((id) => {
            const name =
              a.seasons.find((s) => s.season_id === id)?.season_name ||
              b.seasons.find((s) => s.season_id === id)?.season_name ||
              "—";
            const active = id === seasonId;
            return (
              <button
                key={id}
                onClick={() => setSeasonId(id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card/40 text-muted-foreground hover:bg-accent"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      <SectionCard title={`Posição — ${seasonName}`} icon={<Trophy className="h-4 w-4 text-primary" />}>
        <StatRow
          label="Posição"
          a={A.position ?? 999}
          b={B.position ?? 999}
          format={(v) => (v === 999 ? "—" : `${v}º`)}
          higherIsBetter={false}
        />
        <StatRow label="Elo da temporada" a={A.rating} b={B.rating} format={(v) => Math.round(v).toString()} />
      </SectionCard>

      <SectionCard title={`Aproveitamento — ${seasonName}`} icon={<Activity className="h-4 w-4 text-primary" />}>
        <StatRow label="Partidas" a={A.matches_played} b={B.matches_played} />
        <StatRow label="Vitórias" a={A.matches_won} b={B.matches_won} />
        <StatRow
          label="Aproveitamento"
          a={pct(A.matches_won, A.matches_played)}
          b={pct(B.matches_won, B.matches_played)}
          format={(v) => `${v}%`}
        />
        <StatRow label="Sets ganhos" a={A.sets_won} b={B.sets_won} />
        <StatRow
          label="Saldo de sets"
          a={A.sets_won - A.sets_lost}
          b={B.sets_won - B.sets_lost}
          format={(v) => (v > 0 ? `+${v}` : `${v}`)}
        />
        <StatRow
          label="Saldo de games"
          a={A.games_won - A.games_lost}
          b={B.games_won - B.games_lost}
          format={(v) => (v > 0 ? `+${v}` : `${v}`)}
        />
      </SectionCard>
    </>
  );
}
