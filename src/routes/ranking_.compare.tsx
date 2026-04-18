import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Trophy, Activity, Swords, Users, TrendingUp, Share2, ArrowLeftRight, Image as ImageIcon, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { abbreviateName } from "@/lib/utils";

const GROUP_AVG_ID = "__group_avg__";

const searchSchema = z.object({
  a: fallback(z.string(), "").default(""),
  b: fallback(z.string(), "").default(""),
  c: fallback(z.string(), "").default(""),
  d: fallback(z.string(), "").default(""),
  groupId: fallback(z.string(), "").default(""),
  tab: fallback(z.enum(["career", "season"]), "career").default("career"),
  seasonId: fallback(z.string(), "").default(""),
  embed: fallback(z.string(), "").default(""),
  backTo: fallback(z.string(), "").default(""),
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
    /** Other players in the match besides A and B, with their team. */
    others: { user_id: string; team: "A" | "B"; name: string }[];
  }[];
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function ComparePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { a: userA, b: userB, c: userC, d: userD, groupId, tab, embed, backTo } = search;
  const isEmbed = embed === "1";
  const safeBackTo = backTo && backTo.startsWith("/") && !backTo.startsWith("//") ? backTo : "";
  const userIds = useMemo(
    () => [userA, userB, userC, userD].filter((id): id is string => !!id && id.length > 0),
    [userA, userB, userC, userD],
  );
  const N = userIds.length;

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Carregando comparativo...");
  const [groupName, setGroupName] = useState<string>("");
  const [players, setPlayers] = useState<PlayerAggregate[]>([]);
  const [h2h, setH2H] = useState<H2HData | null>(null);
  const [opponentElos, setOpponentElos] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  // Backwards-compat aliases for the rich 2-player view
  const playerA = players[0] ?? null;
  const playerB = players[1] ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (userIds.length < 2 || !groupId) {
        setError("Selecione pelo menos 2 jogadores");
        setLoading(false);
        return;
      }
      const uniqueIds = Array.from(new Set(userIds));
      if (uniqueIds.length !== userIds.length) {
        setError("Jogadores duplicados na comparação");
        setLoading(false);
        return;
      }
      // Real player ids (exclude the sentinel "group avg")
      const realIds = userIds.filter((id) => id !== GROUP_AVG_ID);
      const hasGroupAvg = userIds.includes(GROUP_AVG_ID);
      setLoading(true);
      setProgress(10);
      setLabel("Buscando jogadores...");

      try {
        // Group + seasons + profiles
        const [groupRes, seasonsRes, profilesRes] = await Promise.all([
          supabase.from("groups").select("name").eq("id", groupId).single(),
          supabase
            .from("seasons")
            .select("id, name, group_id, status, created_at")
            .eq("group_id", groupId)
            .in("status", ["active", "finished"])
            .order("created_at", { ascending: false }),
          realIds.length
            ? supabase
                .from("user_profiles")
                .select("user_id, name, nickname, avatar_url")
                .in("user_id", realIds)
            : Promise.resolve({ data: [], error: null } as any),
        ]);
        if (cancelled) return;
        if (groupRes.error) throw groupRes.error;
        if (seasonsRes.error) throw seasonsRes.error;
        if (profilesRes.error) throw profilesRes.error;

        setGroupName(groupRes.data?.name || "");
        const seasons = seasonsRes.data || [];
        const seasonIds = seasons.map((s: any) => s.id);
        const seasonNameMap = new Map(seasons.map((s: any) => [s.id, s.name]));

        const profilesMap = new Map<string, Profile>();
        for (const p of profilesRes.data || []) {
          profilesMap.set(p.user_id, p as Profile);
        }
        for (const id of realIds) {
          if (!profilesMap.has(id)) {
            setError("Jogador não encontrado");
            setLoading(false);
            return;
          }
        }

        setProgress(30);
        setLabel("Carregando estatísticas...");

        // Snapshots, rating events, rounds, presence — scoped to this group
        const snapshotFilterIds = hasGroupAvg ? null : realIds;
        const [snapsRes, eventsRes, roundsRes, presenceRes] = await Promise.all([
          seasonIds.length
            ? (snapshotFilterIds
                ? supabase
                    .from("ranking_snapshots")
                    .select("*")
                    .in("season_id", seasonIds)
                    .in("user_id", snapshotFilterIds)
                : supabase
                    .from("ranking_snapshots")
                    .select("*")
                    .in("season_id", seasonIds))
            : Promise.resolve({ data: [], error: null } as any),
          seasonIds.length
            ? (snapshotFilterIds
                ? supabase
                    .from("rating_events")
                    .select("user_id, rating_after, rating_before, rating_change, created_at, match_id, season_id")
                    .in("season_id", seasonIds)
                    .in("user_id", snapshotFilterIds)
                    .order("created_at", { ascending: true })
                : supabase
                    .from("rating_events")
                    .select("user_id, rating_after, rating_before, rating_change, created_at, match_id, season_id")
                    .in("season_id", seasonIds)
                    .order("created_at", { ascending: true }))
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("rounds")
            .select("id, status")
            .eq("group_id", groupId),
          (snapshotFilterIds
            ? supabase
                .from("round_presence")
                .select("round_id, user_id, status")
                .in("user_id", snapshotFilterIds)
            : supabase
                .from("round_presence")
                .select("round_id, user_id, status")),
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

        // Match player rows (rating-driven — used for player aggregates)
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

        // Full H2H pool (all completed group matches involving both players)
        let h2hMatchPlayers: any[] = matchPlayers;
        let h2hMatchesMeta: any[] = matchesMeta;
        let h2hSetsByMatch = new Map<string, { set_number: number; score_team_a: number; score_team_b: number }[]>();
        if (realIds.length === 2 && !hasGroupAvg && groupRoundIds.size > 0) {
          const groupRoundIdsArr = Array.from(groupRoundIds) as string[];
          const { data: allGroupMatches, error: gmErr } = await supabase
            .from("matches")
            .select("id, round_id, winner_team, status, created_at")
            .in("round_id", groupRoundIdsArr)
            .eq("status", "completed");
          if (gmErr) throw gmErr;
          const groupMatchIds = (allGroupMatches || []).map((m: any) => m.id);
          if (groupMatchIds.length) {
            const { data: gmpData, error: gmpErr } = await supabase
              .from("match_players")
              .select("match_id, user_id, team")
              .in("match_id", groupMatchIds);
            if (gmpErr) throw gmpErr;
            const byMatch = new Map<string, any[]>();
            for (const mp of gmpData || []) {
              const arr = byMatch.get(mp.match_id) || [];
              arr.push(mp);
              byMatch.set(mp.match_id, arr);
            }
            const sharedIds: string[] = [];
            for (const [mid, ps] of byMatch.entries()) {
              const hasA = ps.some((p) => p.user_id === realIds[0]);
              const hasB = ps.some((p) => p.user_id === realIds[1]);
              if (hasA && hasB) sharedIds.push(mid);
            }
            h2hMatchPlayers = (gmpData || []).filter((mp: any) => sharedIds.includes(mp.match_id));
            h2hMatchesMeta = (allGroupMatches || []).filter((m: any) => sharedIds.includes(m.id));
            if (sharedIds.length) {
              const { data: setsData, error: setsErr } = await supabase
                .from("match_sets")
                .select("match_id, set_number, score_team_a, score_team_b")
                .in("match_id", sharedIds)
                .order("set_number", { ascending: true });
              if (setsErr) throw setsErr;
              for (const s of setsData || []) {
                const arr = h2hSetsByMatch.get(s.match_id) || [];
                arr.push({ set_number: s.set_number, score_team_a: s.score_team_a, score_team_b: s.score_team_b });
                h2hSetsByMatch.set(s.match_id, arr);
              }
            }
          }
        }

        setProgress(80);
        setLabel("Montando comparativo...");

        const matchMetaMap = new Map(matchesMeta.map((m: any) => [m.id, m]));
        const setsByMatch = new Map<string, { set_number: number; score_team_a: number; score_team_b: number }[]>();
        for (const s of matchSets) {
          const arr = setsByMatch.get(s.match_id) || [];
          arr.push({ set_number: s.set_number, score_team_a: s.score_team_a, score_team_b: s.score_team_b });
          setsByMatch.set(s.match_id, arr);
        }

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
          let cur = 0;
          for (const e of userEvents) {
            if (Number(e.rating_change) > 0) {
              cur += 1;
              if (cur > streakMax) streakMax = cur;
            } else {
              cur = 0;
            }
          }
          // Current streak = trailing same-sign run (positive=wins, negative=losses)
          let streakCurrent = 0;
          let streakSign: 1 | -1 | 0 = 0;
          for (let i = userEvents.length - 1; i >= 0; i--) {
            const change = Number(userEvents[i].rating_change);
            const sign: 1 | -1 = change >= 0 ? 1 : -1;
            if (streakSign === 0) streakSign = sign;
            if (sign === streakSign) streakCurrent += 1;
            else break;
          }
          const streakCurrentSigned = streakCurrent * (streakSign || 1);

          // Frequency
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
            streakCurrent: streakCurrentSigned,
            roundsPresent,
            roundsTotal,
          };
        };

        // Build group-average aggregate (synthetic player)
        const buildGroupAverage = (): PlayerAggregate => {
          // Group all snapshots by user
          const byUser = new Map<string, any[]>();
          for (const s of snaps) {
            const arr = byUser.get(s.user_id) || [];
            arr.push(s);
            byUser.set(s.user_id, arr);
          }
          const userIdsAll = Array.from(byUser.keys());
          if (userIdsAll.length === 0) {
            return {
              profile: { user_id: GROUP_AVG_ID, name: "Média do grupo", nickname: "Média do grupo", avatar_url: null },
              seasons: [],
              career: { matches_played: 0, matches_won: 0, sets_won: 0, sets_lost: 0, games_won: 0, games_lost: 0, seasons_played: 0, titles: 0, podiums: 0, best_position: null },
              eloSeries: [],
              eloPeak: 1000, eloLow: 1000, eloCurrent: 1000,
              streakMax: 0, streakCurrent: 0,
              roundsPresent: 0, roundsTotal: completedRoundIds.size,
            };
          }

          // Per-season averages (over ALL players that have a snapshot in that season)
          const bySeason = new Map<string, any[]>();
          for (const s of snaps) {
            const arr = bySeason.get(s.season_id) || [];
            arr.push(s);
            bySeason.set(s.season_id, arr);
          }
          const avgSeasons: SeasonStat[] = [];
          for (const [sid, arr] of bySeason.entries()) {
            const n = arr.length;
            const avgOf = (key: string) => arr.reduce((a, x) => a + Number(x[key] || 0), 0) / n;
            avgSeasons.push({
              season_id: sid,
              season_name: seasonNameMap.get(sid) || "—",
              rating: avgOf("rating"),
              matches_played: Math.round(avgOf("matches_played")),
              matches_won: Math.round(avgOf("matches_won")),
              sets_won: Math.round(avgOf("sets_won")),
              sets_lost: Math.round(avgOf("sets_lost")),
              games_won: Math.round(avgOf("games_won")),
              games_lost: Math.round(avgOf("games_lost")),
              position: null,
              is_eligible: false,
            });
          }

          // Career = average across players of (sum across their seasons)
          const careerByUser = userIdsAll.map((uid) => {
            const userSnaps = byUser.get(uid)!;
            return userSnaps.reduce(
              (acc, s) => {
                acc.matches_played += s.matches_played || 0;
                acc.matches_won += s.matches_won || 0;
                acc.sets_won += s.sets_won || 0;
                acc.sets_lost += s.sets_lost || 0;
                acc.games_won += s.games_won || 0;
                acc.games_lost += s.games_lost || 0;
                if ((s.matches_played || 0) > 0) acc.seasons_played += 1;
                return acc;
              },
              { matches_played: 0, matches_won: 0, sets_won: 0, sets_lost: 0, games_won: 0, games_lost: 0, seasons_played: 0 },
            );
          });
          const Nu = careerByUser.length || 1;
          const avgCareer = {
            matches_played: Math.round(careerByUser.reduce((a, c) => a + c.matches_played, 0) / Nu),
            matches_won: Math.round(careerByUser.reduce((a, c) => a + c.matches_won, 0) / Nu),
            sets_won: Math.round(careerByUser.reduce((a, c) => a + c.sets_won, 0) / Nu),
            sets_lost: Math.round(careerByUser.reduce((a, c) => a + c.sets_lost, 0) / Nu),
            games_won: Math.round(careerByUser.reduce((a, c) => a + c.games_won, 0) / Nu),
            games_lost: Math.round(careerByUser.reduce((a, c) => a + c.games_lost, 0) / Nu),
            seasons_played: Math.round(careerByUser.reduce((a, c) => a + c.seasons_played, 0) / Nu),
            titles: 0,
            podiums: 0,
            best_position: null as number | null,
          };

          // Average current Elo
          const currentEloByUser: number[] = [];
          for (const uid of userIdsAll) {
            const userEvts = events.filter((e: any) => e.user_id === uid);
            if (userEvts.length) currentEloByUser.push(Number(userEvts[userEvts.length - 1].rating_after));
            else {
              const sn = byUser.get(uid)!;
              if (sn.length) currentEloByUser.push(Number(sn[0].rating));
            }
          }
          const eloCurrent = currentEloByUser.length
            ? currentEloByUser.reduce((a, x) => a + x, 0) / currentEloByUser.length
            : 1000;

          // Avg presence rate
          const presenceByUser = new Map<string, Set<string>>();
          for (const p of presence) {
            if (!completedRoundIds.has(p.round_id)) continue;
            if (p.status !== "confirmed" && p.status !== "present") continue;
            const set = presenceByUser.get(p.user_id) || new Set<string>();
            set.add(p.round_id);
            presenceByUser.set(p.user_id, set);
          }
          const presenceCount = userIdsAll.length
            ? Math.round(
                userIdsAll.reduce((a, uid) => a + (presenceByUser.get(uid)?.size || 0), 0) / userIdsAll.length,
              )
            : 0;

          return {
            profile: { user_id: GROUP_AVG_ID, name: "Média do grupo", nickname: "Média do grupo", avatar_url: null },
            seasons: avgSeasons,
            career: avgCareer,
            eloSeries: [],
            eloPeak: Math.round(eloCurrent),
            eloLow: Math.round(eloCurrent),
            eloCurrent,
            streakMax: 0,
            streakCurrent: 0,
            roundsPresent: presenceCount,
            roundsTotal: completedRoundIds.size,
          };
        };

        const aggregates: PlayerAggregate[] = userIds.map((uid) =>
          uid === GROUP_AVG_ID ? buildGroupAverage() : buildAggregate(uid, profilesMap.get(uid)!),
        );

        // H2H computation only makes sense for exactly 2 real players
        let h2hData: H2HData | null = null;
        if (realIds.length === 2 && !hasGroupAvg) {
          const [uA, uB] = realIds;
          const h2hMetaMap = new Map(h2hMatchesMeta.map((m: any) => [m.id, m]));
          const matchToPlayers = new Map<string, any[]>();
          for (const mp of h2hMatchPlayers) {
            const arr = matchToPlayers.get(mp.match_id) || [];
            arr.push(mp);
            matchToPlayers.set(mp.match_id, arr);
          }

          const sharedMatchIds = Array.from(matchToPlayers.keys()).filter((mid) => {
            const ps = matchToPlayers.get(mid)!;
            return ps.some((p) => p.user_id === uA) && ps.some((p) => p.user_id === uB);
          });

          const othersByMatch = new Map<string, { user_id: string; team: "A" | "B" }[]>();
          const extraProfileMap = new Map<string, string>();
          if (sharedMatchIds.length) {
            const otherUserIds = new Set<string>();
            for (const mp of h2hMatchPlayers) {
              if (!sharedMatchIds.includes(mp.match_id)) continue;
              if (mp.user_id === uA || mp.user_id === uB) continue;
              const arr = othersByMatch.get(mp.match_id) || [];
              arr.push({ user_id: mp.user_id, team: mp.team as "A" | "B" });
              othersByMatch.set(mp.match_id, arr);
              otherUserIds.add(mp.user_id);
            }
            if (otherUserIds.size) {
              const { data: extraProfs, error: epErr } = await supabase
                .from("user_profiles")
                .select("user_id, name, nickname")
                .in("user_id", Array.from(otherUserIds));
              if (epErr) throw epErr;
              for (const p of extraProfs || []) {
                const display = (p.nickname?.trim() as string) || abbreviateName(p.name);
                extraProfileMap.set(p.user_id, display);
              }
            }
          }

          const meetings: H2HData["recentMeetings"] = [];
          let asPartnersPlayed = 0;
          let asPartnersWon = 0;
          let asOppPlayed = 0;
          let aWon = 0;
          let bWon = 0;

          for (const matchId of sharedMatchIds) {
            const ps = matchToPlayers.get(matchId)!;
            const a = ps.find((p) => p.user_id === uA);
            const b = ps.find((p) => p.user_id === uB);
            if (!a || !b) continue;
            const meta = h2hMetaMap.get(matchId);
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

            const evt = events.find((e: any) => e.match_id === matchId);
            const others = (othersByMatch.get(matchId) || []).map((o) => ({
              user_id: o.user_id,
              team: o.team,
              name: extraProfileMap.get(o.user_id) || "Jogador",
            }));
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
              sets: h2hSetsByMatch.get(matchId) || [],
              others,
            });
          }

          meetings.sort((x, y) => y.created_at.localeCompare(x.created_at));

          h2hData = {
            asPartners: { played: asPartnersPlayed, won: asPartnersWon },
            asOpponents: { played: asOppPlayed, aWon, bWon },
            recentMeetings: meetings, // keep ALL meetings; UI handles slicing
          };
        }

        // Fetch current Elo for opponents seen in H2H meetings (used in "best partner" stat)
        const oppElosMap = new Map<string, number>();
        if (h2hData && h2hData.recentMeetings.length > 0) {
          const oppIds = new Set<string>();
          for (const m of h2hData.recentMeetings) {
            for (const o of m.others) oppIds.add(o.user_id);
          }
          if (oppIds.size > 0 && seasonIds.length > 0) {
            const { data: oppEvts } = await supabase
              .from("rating_events")
              .select("user_id, rating_after, created_at")
              .in("season_id", seasonIds)
              .in("user_id", Array.from(oppIds))
              .order("created_at", { ascending: false });
            const seen = new Set<string>();
            for (const e of oppEvts || []) {
              if (seen.has(e.user_id)) continue;
              seen.add(e.user_id);
              oppElosMap.set(e.user_id, e.rating_after);
            }
          }
        }

        if (!cancelled) {
          setPlayers(aggregates);
          setH2H(h2hData);
          setOpponentElos(oppElosMap);
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
  }, [userIds, groupId]);

  const swap = () => {
    navigate({
      to: "/ranking/compare",
      search: (prev: any) => ({ ...prev, a: prev.b, b: prev.a }),
      resetScroll: false,
    });
  };

  const setTab = (next: "career" | "season") => {
    navigate({
      to: "/ranking/compare",
      search: (prev: any) => ({ ...prev, tab: next }),
      resetScroll: false,
    });
  };

  const heroRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [heroScope, setHeroScope] = useState<"career" | "season">("career");

  const toggleGroupAvg = () => {
    const isOn = userIds.includes(GROUP_AVG_ID);
    if (isOn) {
      // remove the avg slot, keep first real id as A and pick next real as B if present
      navigate({
        to: "/ranking/compare",
        search: (prev: any) => {
          const real = [prev.a, prev.b, prev.c, prev.d].filter((x: string) => x && x !== GROUP_AVG_ID);
          return { ...prev, a: real[0] || "", b: real[1] || "", c: "", d: "" };
        },
        resetScroll: false,
      });
    } else {
      // require at least 1 real player; replace B with avg
      navigate({
        to: "/ranking/compare",
        search: (prev: any) => ({ ...prev, b: GROUP_AVG_ID, c: "", d: "" }),
        resetScroll: false,
      });
    }
  };

  const exportPng = async () => {
    if (!heroRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(heroRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background")
          ? `oklch(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
          : "#0a0a0a",
      });
      // Try to share as file (mobile)
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `comparativo-${Date.now()}.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: "Comparativo", text: "Comparativo de jogadores" });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          // fall through to download
        }
      }
      // Fallback: download
      const link = document.createElement("a");
      link.download = file.name;
      link.href = dataUrl;
      link.click();
      toast.success("Imagem baixada");
    } catch (e) {
      console.error("Export PNG failed:", e);
      toast.error("Não foi possível gerar a imagem");
    } finally {
      setExporting(false);
    }
  };

  const share = async () => {
    const url = window.location.href;
    const title =
      players.length >= 2
        ? `Comparativo: ${players.map((p) => displayName(p)).join(" vs ")}`
        : "Comparativo";
    const text = title;
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado para a área de transferência");
        return;
      }
    } catch { /* ignore */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível compartilhar");
    }
  };

  // Latest season (by snapshots) shown in "Temporada" tab
  const latestSeasonId = useMemo(() => {
    if (players.length === 0) return null;
    for (const p of players) {
      if (p.seasons[0]) return p.seasons[0].season_id;
    }
    return null;
  }, [players]);

  // Compute "advantage" indicator (only for 2-player view)
  const advantage = useMemo(() => {
    if (players.length !== 2 || !h2h) return null;
    return computeAdvantage(players[0], players[1], h2h);
  }, [players, h2h]);

  // Season-scoped versions of playerA/B and h2h for the hero card
  const heroPlayerA = useMemo(
    () => (heroScope === "season" && playerA && latestSeasonId ? scopePlayerToSeason(playerA, latestSeasonId) : playerA),
    [playerA, heroScope, latestSeasonId],
  );
  const heroPlayerB = useMemo(
    () => (heroScope === "season" && playerB && latestSeasonId ? scopePlayerToSeason(playerB, latestSeasonId) : playerB),
    [playerB, heroScope, latestSeasonId],
  );
  const heroH2H = useMemo(
    () => (heroScope === "season" && h2h && latestSeasonId ? scopeH2HToSeason(h2h, latestSeasonId) : h2h),
    [h2h, heroScope, latestSeasonId],
  );
  const heroSeasonName = useMemo(() => {
    if (heroScope !== "season" || !latestSeasonId) return "";
    return (
      playerA?.seasons.find((s) => s.season_id === latestSeasonId)?.season_name ||
      playerB?.seasons.find((s) => s.season_id === latestSeasonId)?.season_name ||
      ""
    );
  }, [heroScope, latestSeasonId, playerA, playerB]);

  // Best partner stat: average Elo of opponents the duo defeated together
  const bestPartnerStat = useMemo(() => {
    if (!heroH2H) return null;
    const wins = heroH2H.recentMeetings.filter(
      (m) => m.asPartners && m.winner !== null && m.others.length > 0 && (
        // partners are on the same team; opponents are on the OPPOSITE team
        m.aTeam === m.winner
      ),
    );
    if (wins.length === 0) return null;
    const ratings: number[] = [];
    for (const m of wins) {
      for (const o of m.others) {
        if (o.team !== m.aTeam) {
          const r = opponentElos.get(o.user_id);
          if (typeof r === "number") ratings.push(r);
        }
      }
    }
    if (ratings.length === 0) return null;
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
    return { avg: Math.round(avg), defeatedCount: ratings.length, winCount: wins.length };
  }, [heroH2H, opponentElos]);

  return (
    <div className={`bg-background ${isEmbed ? "" : "min-h-screen pb-28 lg:pb-8"}`}>
      {!isEmbed && (
        <header className="sticky top-0 z-10 border-b border-border/50 bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 lg:px-0">
            {safeBackTo ? (
              <a
                href={safeBackTo}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </a>
            ) : (
              <Link
                to="/ranking"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Ranking
              </Link>
            )}
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate font-display text-sm font-bold text-foreground lg:text-base">Comparativo</p>
              {groupName && <p className="truncate text-[10px] text-muted-foreground lg:text-xs">{groupName}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={exportPng}
                disabled={exporting || N >= 3}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-50"
                aria-label="Exportar como imagem"
                title="Exportar como imagem PNG"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{exporting ? "Gerando..." : "Imagem"}</span>
              </button>
              <button
                onClick={share}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
                aria-label="Compartilhar"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
            </div>
          </div>
        </header>
      )}

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
        ) : players.length < 2 ? null : N >= 3 ? (
          <MultiCompareTable players={players} latestSeasonId={latestSeasonId} groupId={groupId} />
        ) : !playerA || !playerB ? null : (
          <>
            {/* Quick action: compare with group average */}
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={toggleGroupAvg}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  userIds.includes(GROUP_AVG_ID)
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card/60 text-foreground hover:bg-accent"
                }`}
                title="Compara com a média de todos jogadores elegíveis do grupo"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                {userIds.includes(GROUP_AVG_ID) ? "Comparando com média do grupo" : "Comparar com média do grupo"}
              </button>
            </div>

            {/* HERO: head to head */}
            <section ref={heroRef} className="rounded-3xl border border-border bg-card/40 p-4 lg:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <Trophy className="h-3 w-3" />
                  {heroScope === "season" && heroSeasonName
                    ? `Temporada ${heroSeasonName}`
                    : "Carreira no grupo · todas as temporadas"}
                </span>
                {latestSeasonId && (
                  <div className="inline-flex rounded-full border border-border bg-background/50 p-0.5">
                    <button
                      onClick={() => setHeroScope("career")}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${
                        heroScope === "career" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Carreira
                    </button>
                    <button
                      onClick={() => setHeroScope("season")}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${
                        heroScope === "season" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Temporada atual
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 lg:gap-6">
                <PlayerHero player={heroPlayerA!} side="left" />
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    VS
                  </div>
                  {!userIds.includes(GROUP_AVG_ID) && (
                    <button
                      onClick={swap}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent"
                      title="Inverter posições"
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      Inverter
                    </button>
                  )}
                </div>
                <PlayerHero player={heroPlayerB!} side="right" />
              </div>

              {/* Advantage indicator */}
              {advantage && advantage.leader !== "tie" && (
                <div className="mt-4 flex items-center justify-center">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                      advantage.leader === "A"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-rank-silver/40 bg-rank-silver/10 text-foreground"
                    }`}
                    title={`H2H ${advantage.h2hScoreA.toFixed(0)}–${advantage.h2hScoreB.toFixed(0)} · Elo ${Math.round(playerA.eloCurrent)}–${Math.round(playerB.eloCurrent)} · Forma ${advantage.formA}V${5 - advantage.formA}D vs ${advantage.formB}V${5 - advantage.formB}D`}
                  >
                    <Trophy className="h-3 w-3" />
                    Vantagem: {displayName(advantage.leader === "A" ? playerA : playerB)}
                    <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[9px] font-semibold">
                      {advantage.confidence}%
                    </span>
                  </div>
                </div>
              )}
              {advantage && advantage.leader === "tie" && (
                <div className="mt-4 flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                    Equilibrado — sem favorito claro
                  </div>
                </div>
              )}

              {/* H2H summary */}
              {heroH2H && (heroH2H.asOpponents.played > 0 || heroH2H.asPartners.played > 0) && (
                <div className="mt-4 grid grid-cols-2 gap-2 lg:gap-3">
                  {/* Adversários */}
                  <div className="rounded-2xl border border-border/60 bg-background/40 px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Swords className="h-3 w-3 text-destructive" />
                      Adversários
                      {heroH2H.asOpponents.played > 0 && (
                        <span className="ml-1 rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-bold text-foreground/80">
                          {heroH2H.asOpponents.played}
                        </span>
                      )}
                    </div>
                    {heroH2H.asOpponents.played > 0 ? (
                      <div className="mt-1.5 grid grid-cols-2 items-end gap-2">
                        <div className="text-center">
                          <p className="font-display text-2xl font-bold leading-none text-foreground">
                            {heroH2H.asOpponents.aWon}<span className="ml-0.5 text-sm font-bold text-success">V</span>
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {pct(heroH2H.asOpponents.aWon, heroH2H.asOpponents.played)}%
                          </p>
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">{abbreviateName(playerA.profile.name)}</p>
                        </div>
                        <div className="text-center">
                          <p className="font-display text-2xl font-bold leading-none text-foreground">
                            {heroH2H.asOpponents.bWon}<span className="ml-0.5 text-sm font-bold text-success">V</span>
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {pct(heroH2H.asOpponents.bWon, heroH2H.asOpponents.played)}%
                          </p>
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">{abbreviateName(playerB.profile.name)}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-muted-foreground">Nunca se enfrentaram</p>
                    )}
                  </div>
                  {/* Parceiros */}
                  <div className="rounded-2xl border border-border/60 bg-background/40 px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Users className="h-3 w-3 text-primary" />
                      Parceiros
                      {heroH2H.asPartners.played > 0 && (
                        <span className="ml-1 rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-bold text-foreground/80">
                          {heroH2H.asPartners.played}
                        </span>
                      )}
                    </div>
                    {heroH2H.asPartners.played > 0 ? (
                      <>
                        <div className="mt-1.5 grid grid-cols-2 items-end gap-2">
                          <div className="text-center">
                            <p className="font-display text-2xl font-bold leading-none text-success">{heroH2H.asPartners.won}<span className="ml-0.5 text-sm">V</span></p>
                            <p className="mt-1 text-[10px] text-muted-foreground">{heroH2H.asPartners.played - heroH2H.asPartners.won}D</p>
                          </div>
                          <div className="text-center">
                            <p className="font-display text-2xl font-bold leading-none text-foreground">{pct(heroH2H.asPartners.won, heroH2H.asPartners.played)}<span className="ml-0.5 text-sm">%</span></p>
                            <p className="mt-1 text-[10px] text-muted-foreground">aproveitamento</p>
                          </div>
                        </div>
                        {bestPartnerStat && (
                          <div
                            className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground"
                            title={`Elo médio dos adversários derrotados em ${bestPartnerStat.winCount} vitórias juntos`}
                          >
                            <Trophy className="h-3 w-3 text-warning" />
                            <span>Elo médio dos vencidos:</span>
                            <span className="font-display text-[11px] font-bold text-foreground">{bestPartnerStat.avg}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-muted-foreground">Nunca jogaram juntos</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {h2h && h2h.recentMeetings.length > 0 && (
              <RecentMeetings h2h={h2h} groupId={groupId} a={playerA} b={playerB} />
            )}

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

function formatMeetingDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return ""; }
}

type MeetingFilter = "last10" | "opponents" | "partners" | "all";

function RecentMeetings({
  h2h, groupId, a, b,
}: {
  h2h: H2HData;
  groupId: string;
  a: PlayerAggregate;
  b: PlayerAggregate;
}) {
  const nameA = displayName(a);
  const nameB = displayName(b);
  const [filter, setFilter] = useState<MeetingFilter>("last10");
  const [allSub, setAllSub] = useState<"none" | "opponents" | "partners">("none");

  const filtered = useMemo(() => {
    if (filter === "last10") return h2h.recentMeetings.slice(0, 10);
    if (filter === "opponents") return h2h.recentMeetings.filter((m) => !m.asPartners);
    if (filter === "partners") return h2h.recentMeetings.filter((m) => m.asPartners);
    if (allSub === "opponents") return h2h.recentMeetings.filter((m) => !m.asPartners);
    if (allSub === "partners") return h2h.recentMeetings.filter((m) => m.asPartners);
    return h2h.recentMeetings;
  }, [filter, allSub, h2h.recentMeetings]);

  const counts = useMemo(() => ({
    last10: Math.min(10, h2h.recentMeetings.length),
    opponents: h2h.recentMeetings.filter((m) => !m.asPartners).length,
    partners: h2h.recentMeetings.filter((m) => m.asPartners).length,
    all: h2h.recentMeetings.length,
  }), [h2h.recentMeetings]);

  const filterOptions: { id: MeetingFilter; label: string; count: number; desc: string }[] = [
    { id: "last10", label: "10 últimos", count: counts.last10, desc: "Confrontos mais recentes" },
    { id: "opponents", label: "Adversários", count: counts.opponents, desc: "Quando jogaram em times opostos" },
    { id: "partners", label: "Parceiros", count: counts.partners, desc: "Quando formaram dupla" },
    { id: "all", label: "Todos", count: counts.all, desc: "Histórico completo no grupo" },
  ];

  return (
    <section className="mt-3 rounded-3xl border border-border bg-card/40 p-4 lg:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Swords className="h-4 w-4 text-destructive" />
        <h2 className="font-display text-sm font-bold text-foreground">Confrontos</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">{filtered.length} jogo{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
        <aside className="flex flex-col gap-1 rounded-2xl border border-border/40 bg-background/30 p-2">
          {filterOptions.map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setFilter(opt.id); setAllSub("none"); }}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
                title={opt.desc}
              >
                <span className="truncate">{opt.label}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${active ? "bg-primary-foreground/20" : "bg-muted/50"}`}>
                  {opt.count}
                </span>
              </button>
            );
          })}

          {filter === "all" && (
            <div className="mt-1 border-t border-border/40 pt-2">
              <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Filtrar</p>
              {([
                { id: "none", label: "Tudo" },
                { id: "opponents", label: "Adversários" },
                { id: "partners", label: "Parceiros" },
              ] as const).map((s) => {
                const active = allSub === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setAllSub(s.id)}
                    className={`block w-full rounded-lg px-3 py-1 text-left text-[10px] font-semibold transition ${
                      active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div>
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-border/40 bg-background/30 py-8 text-center text-xs text-muted-foreground">
              Nenhum confronto neste filtro.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-2xl border border-border/40 bg-background/30">
              {filtered.map((m) => {
                const aWonMatch = m.winner === m.aTeam;
                const bWonMatch = m.winner === m.bTeam;
                const sameTeam = m.asPartners;
                const scoreLine = m.sets.length
                  ? m.sets
                      .map((s) => {
                        if (sameTeam) {
                          const own = m.aTeam === "A" ? s.score_team_a : s.score_team_b;
                          const opp = m.aTeam === "A" ? s.score_team_b : s.score_team_a;
                          return `${own}-${opp}`;
                        }
                        const aScore = m.aTeam === "A" ? s.score_team_a : s.score_team_b;
                        const bScore = m.bTeam === "A" ? s.score_team_a : s.score_team_b;
                        return `${aScore}-${bScore}`;
                      })
                      .join(" ")
                  : "—";
                const canLink = !!m.season_id;

                let othersLine: React.ReactNode = null;
                if (m.others.length > 0) {
                  if (sameTeam) {
                    const oppTeam = m.aTeam === "A" ? "B" : "A";
                    const opponents = m.others.filter((o) => o.team === oppTeam).map((o) => o.name);
                    if (opponents.length) {
                      othersLine = <>vs <span className="text-foreground/80">{opponents.join(" & ")}</span></>;
                    }
                  } else {
                    const aPartner = m.others.find((o) => o.team === m.aTeam);
                    const bPartner = m.others.find((o) => o.team === m.bTeam);
                    if (aPartner || bPartner) {
                      othersLine = (
                        <>
                          <span className="text-foreground/80">{aPartner?.name ?? "—"}</span>
                          <span className="mx-1 opacity-60">/</span>
                          <span className="text-foreground/80">{bPartner?.name ?? "—"}</span>
                        </>
                      );
                    }
                  }
                }

                const winLabel = sameTeam
                  ? (m.winner ? (m.winner === m.aTeam ? "V" : "D") : "—")
                  : null;
                const winLabelClass = sameTeam
                  ? (m.winner ? (m.winner === m.aTeam ? "text-success" : "text-destructive") : "text-muted-foreground")
                  : "";

                const inner = (
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ring-1 ${
                        sameTeam
                          ? "bg-primary/15 text-primary ring-primary/30"
                          : "bg-destructive/10 text-destructive ring-destructive/25"
                      }`}
                      title={sameTeam ? "Parceiros" : "Adversários"}
                    >
                      {sameTeam ? "DUPLA" : "VS"}
                    </span>

                    <div className="min-w-0 flex-1">
                      {sameTeam ? (
                        <p className="truncate text-[12px] font-semibold leading-tight text-foreground">
                          {nameA} & {nameB}
                        </p>
                      ) : (
                        <p className="truncate text-[12px] font-semibold leading-tight">
                          <span className={aWonMatch ? "text-success" : "text-foreground"}>{nameA}</span>
                          <span className="mx-1 text-muted-foreground">vs</span>
                          <span className={bWonMatch ? "text-success" : "text-foreground"}>{nameB}</span>
                        </p>
                      )}
                      {othersLine && (
                        <p className="truncate text-[10px] text-muted-foreground leading-tight">
                          {othersLine}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                      {winLabel && (
                        <span className={`font-display text-[10px] font-bold ${winLabelClass}`}>{winLabel}</span>
                      )}
                      <span className="font-display text-[12px] font-bold tabular-nums text-foreground">
                        {scoreLine}
                      </span>
                    </div>

                    <p className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/80 leading-tight tabular-nums w-[68px] text-right">
                      {formatMeetingDate(m.created_at)}
                    </p>
                  </div>
                );
                return (
                  <li key={m.match_id} className="bg-background/0 transition hover:bg-background/40">
                    {canLink ? (
                      <Link
                        to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                        params={{ groupId, seasonId: m.season_id, roundId: m.round_id }}
                        className="block transition active:bg-accent/40 hover:bg-accent/20"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function scopePlayerToSeason(p: PlayerAggregate, seasonId: string): PlayerAggregate {
  const series = p.eloSeries.filter((e) => e.season_id === seasonId);
  const ratings = series.map((e) => e.rating);
  const seasonStat = p.seasons.find((s) => s.season_id === seasonId);
  const eloCurrent = ratings.length ? ratings[ratings.length - 1] : seasonStat?.rating ?? p.eloCurrent;
  const eloPeak = ratings.length ? Math.max(...ratings) : eloCurrent;
  const eloLow = ratings.length ? Math.min(...ratings) : eloCurrent;
  // streaks within the season
  let streakMax = 0;
  let streakCurrent = 0;
  for (let i = 1; i < series.length; i++) {
    const win = series[i].rating > series[i - 1].rating;
    if (win) {
      streakCurrent = streakCurrent >= 0 ? streakCurrent + 1 : 1;
    } else {
      streakCurrent = streakCurrent <= 0 ? streakCurrent - 1 : -1;
    }
    if (streakCurrent > streakMax) streakMax = streakCurrent;
  }
  return {
    ...p,
    eloSeries: series,
    eloCurrent,
    eloPeak,
    eloLow,
    streakMax,
    streakCurrent,
  };
}

function scopeH2HToSeason(h2h: H2HData, seasonId: string): H2HData {
  const meetings = h2h.recentMeetings.filter((m) => m.season_id === seasonId);
  let asPartnersPlayed = 0;
  let asPartnersWon = 0;
  let asOppPlayed = 0;
  let aWon = 0;
  let bWon = 0;
  for (const m of meetings) {
    if (m.asPartners) {
      asPartnersPlayed += 1;
      if (m.winner && m.winner === m.aTeam) asPartnersWon += 1;
    } else {
      asOppPlayed += 1;
      if (m.winner === m.aTeam) aWon += 1;
      else if (m.winner === m.bTeam) bWon += 1;
    }
  }
  return {
    asPartners: { played: asPartnersPlayed, won: asPartnersWon },
    asOpponents: { played: asOppPlayed, aWon, bWon },
    recentMeetings: meetings,
  };
}

function displayName(p: PlayerAggregate) {
  return p.profile.nickname?.trim() || abbreviateName(p.profile.name);
}

function PlayerHero({ player, side }: { player: PlayerAggregate; side: "left" | "right" }) {
  const last10 = player.eloSeries.slice(-10).map((p) => p.rating);
  const trend = last10.length >= 2 ? last10[last10.length - 1] - last10[0] : 0;
  return (
    <div className={`flex flex-col items-center gap-2 ${side === "right" ? "" : ""}`}>
      <PlayerAvatar avatarUrl={player.profile.avatar_url} name={player.profile.name} size="lg" className="!h-16 !w-16 lg:!h-20 lg:!w-20 border-2 border-primary/30" />
      <p className="text-center font-display text-sm font-bold text-foreground lg:text-base truncate max-w-full">
        {displayName(player)}
      </p>
      {last10.length >= 2 && (
        <MiniSparkline values={last10} trendPositive={trend >= 0} />
      )}
      <p className="font-display text-2xl font-bold text-primary lg:text-3xl">{Math.round(player.eloCurrent)}</p>
      <p className="text-[10px] text-muted-foreground">Pico {Math.round(player.eloPeak)} · Mín {Math.round(player.eloLow)}</p>
    </div>
  );
}

function MiniSparkline({ values, trendPositive }: { values: number[]; trendPositive: boolean }) {
  const W = 80;
  const H = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? W / 2 : (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = trendPositive ? "var(--success)" : "var(--destructive)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-5 w-20" preserveAspectRatio="none" aria-label="Últimos 10 jogos">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts.join(" ")} />
    </svg>
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

function SectionCard({
  title,
  icon,
  children,
  className = "",
  a,
  b,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  a?: PlayerAggregate;
  b?: PlayerAggregate;
}) {
  return (
    <section className={`mt-3 rounded-3xl border border-border bg-card/40 p-4 lg:p-5 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-sm font-bold text-foreground">{title}</h2>
      </div>
      {a && b && (
        <div className="sticky top-0 z-[1] -mx-4 mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/40 bg-card/80 px-4 py-1.5 backdrop-blur lg:-mx-5 lg:px-5">
          <div className="flex items-center justify-end gap-1.5">
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-primary">{displayName(a)}</span>
            <PlayerAvatar avatarUrl={a.profile.avatar_url} name={a.profile.name} size="sm" className="!h-5 !w-5 ring-1 ring-primary/40" />
          </div>
          <span className="text-[9px] font-semibold text-muted-foreground">vs</span>
          <div className="flex items-center justify-start gap-1.5">
            <PlayerAvatar avatarUrl={b.profile.avatar_url} name={b.profile.name} size="sm" className="!h-5 !w-5 ring-1 ring-rank-silver/40" />
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-foreground">{displayName(b)}</span>
          </div>
        </div>
      )}
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
      {/* Row 1: Elo + Aproveitamento */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <SectionCard title="Elo (carreira no grupo)" icon={<Activity className="h-4 w-4 text-primary" />} className="mt-0 h-full" a={a} b={b}>
          <StatRow label="Elo atual" a={a.eloCurrent} b={b.eloCurrent} format={(v) => Math.round(v).toString()} />
          <StatRow label="Pico histórico" a={a.eloPeak} b={b.eloPeak} format={(v) => Math.round(v).toString()} />
          <StatRow label="Pior histórico" a={a.eloLow} b={b.eloLow} format={(v) => Math.round(v).toString()} higherIsBetter={true} />
          <EloSparkline a={a} b={b} />
        </SectionCard>

        <SectionCard title="Aproveitamento total" icon={<Trophy className="h-4 w-4 text-primary" />} className="mt-0 h-full" a={a} b={b}>
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
      </div>

      {/* Row 2: Conquistas + Sequências/Frequência */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <SectionCard title="Conquistas" icon={<Trophy className="h-4 w-4 text-warning" />} className="mt-0 h-full" a={a} b={b}>
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

        <SectionCard title="Sequências e frequência" icon={<TrendingUp className="h-4 w-4 text-success" />} className="mt-0 h-full" a={a} b={b}>
          <StatRow label="Maior sequência V" a={a.streakMax} b={b.streakMax} />
          <StatRow
            label="Sequência atual"
            a={a.streakCurrent}
            b={b.streakCurrent}
            format={(v) => (v === 0 ? "—" : v > 0 ? `${v}V` : `${Math.abs(v)}D`)}
            higherIsBetter={true}
          />
          <StatRow
            label="Presença"
            a={pct(a.roundsPresent, a.roundsTotal)}
            b={pct(b.roundsPresent, b.roundsTotal)}
            format={(v) => `${v}%`}
          />
          <StatRow label="Rodadas presentes" a={a.roundsPresent} b={b.roundsPresent} />
        </SectionCard>
      </div>
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

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <SectionCard title={`Posição — ${seasonName}`} icon={<Trophy className="h-4 w-4 text-primary" />} className="mt-0 h-full" a={a} b={b}>
          <StatRow
            label="Posição"
            a={A.position ?? 999}
            b={B.position ?? 999}
            format={(v) => (v === 999 ? "—" : `${v}º`)}
            higherIsBetter={false}
          />
          <StatRow label="Elo da temporada" a={A.rating} b={B.rating} format={(v) => Math.round(v).toString()} />
        </SectionCard>

        <SectionCard title={`Aproveitamento — ${seasonName}`} icon={<Activity className="h-4 w-4 text-primary" />} className="mt-0 h-full" a={a} b={b}>
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
      </div>
    </>
  );
}

// ===== Advantage indicator (H2H direto + Elo atual + forma recente) =====
function computeAdvantage(
  a: PlayerAggregate,
  b: PlayerAggregate,
  h2h: H2HData,
): {
  leader: "A" | "B" | "tie";
  confidence: number;
  h2hScoreA: number;
  h2hScoreB: number;
  formA: number;
  formB: number;
} {
  const totalH2H = h2h.asOpponents.played;
  let h2hA = 50;
  let h2hB = 50;
  if (totalH2H > 0) {
    h2hA = (h2h.asOpponents.aWon / totalH2H) * 100;
    h2hB = (h2h.asOpponents.bWon / totalH2H) * 100;
  }
  const eloDiff = a.eloCurrent - b.eloCurrent;
  const expA = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const eloA = expA * 100;
  const eloB = (1 - expA) * 100;
  const lastN = (p: PlayerAggregate, n: number) => {
    const events = p.eloSeries.slice(-n - 1);
    let wins = 0;
    let total = 0;
    for (let i = 1; i < events.length; i++) {
      total += 1;
      if (events[i].rating > events[i - 1].rating) wins += 1;
    }
    if (events.length === 1) {
      total = 0;
    }
    return { wins, total };
  };
  const fA = lastN(a, 5);
  const fB = lastN(b, 5);
  const formA = fA.total > 0 ? (fA.wins / fA.total) * 100 : 50;
  const formB = fB.total > 0 ? (fB.wins / fB.total) * 100 : 50;
  const scoreA = h2hA * 0.5 + eloA * 0.3 + formA * 0.2;
  const scoreB = h2hB * 0.5 + eloB * 0.3 + formB * 0.2;
  const diff = scoreA - scoreB;
  const leader: "A" | "B" | "tie" = Math.abs(diff) < 4 ? "tie" : diff > 0 ? "A" : "B";
  const confidence = Math.min(99, Math.max(50, Math.round(50 + Math.abs(diff))));
  return { leader, confidence, h2hScoreA: h2hA, h2hScoreB: h2hB, formA: fA.wins, formB: fB.wins };
}

// ===== Multi-player comparison table (3-4 players) =====
function MultiCompareTable({
  players,
  latestSeasonId,
}: {
  players: PlayerAggregate[];
  latestSeasonId: string | null;
  groupId: string;
}) {
  const [scope, setScope] = useState<"career" | "season">("season");
  const allSeasonIds: string[] = [];
  const seenIds = new Set<string>();
  for (const p of players) {
    for (const s of p.seasons) {
      if (!seenIds.has(s.season_id)) {
        seenIds.add(s.season_id);
        allSeasonIds.push(s.season_id);
      }
    }
  }
  const initial = latestSeasonId && allSeasonIds.includes(latestSeasonId) ? latestSeasonId : allSeasonIds[0] || "";
  const [seasonId, setSeasonId] = useState<string>(initial);
  useEffect(() => {
    if (initial && !seasonId) setSeasonId(initial);
  }, [initial, seasonId]);

  const seasonName =
    players.flatMap((p) => p.seasons).find((s) => s.season_id === seasonId)?.season_name || "—";

  const seasonStats = (p: PlayerAggregate) =>
    p.seasons.find((s) => s.season_id === seasonId) || {
      rating: 1000,
      matches_played: 0,
      matches_won: 0,
      sets_won: 0,
      sets_lost: 0,
      games_won: 0,
      games_lost: 0,
      position: null as number | null,
      is_eligible: false,
    };

  type Cell = { value: number; format?: (v: number) => string };
  type Row = { label: string; cells: Cell[]; higherIsBetter?: boolean };

  const careerRows: Row[] = [
    { label: "Elo atual", cells: players.map((p) => ({ value: p.eloCurrent, format: (v) => Math.round(v).toString() })) },
    { label: "Pico Elo", cells: players.map((p) => ({ value: p.eloPeak, format: (v) => Math.round(v).toString() })) },
    { label: "Partidas", cells: players.map((p) => ({ value: p.career.matches_played })) },
    { label: "Vitórias", cells: players.map((p) => ({ value: p.career.matches_won })) },
    { label: "Aproveitamento", cells: players.map((p) => ({ value: pct(p.career.matches_won, p.career.matches_played), format: (v) => `${v}%` })) },
    { label: "Saldo sets", cells: players.map((p) => ({ value: p.career.sets_won - p.career.sets_lost, format: (v) => (v > 0 ? `+${v}` : `${v}`) })) },
    { label: "Saldo games", cells: players.map((p) => ({ value: p.career.games_won - p.career.games_lost, format: (v) => (v > 0 ? `+${v}` : `${v}`) })) },
    { label: "Títulos", cells: players.map((p) => ({ value: p.career.titles })) },
    { label: "Pódios", cells: players.map((p) => ({ value: p.career.podiums })) },
    { label: "Melhor pos.", cells: players.map((p) => ({ value: p.career.best_position ?? 999, format: (v) => (v === 999 ? "—" : `${v}º`) })), higherIsBetter: false },
    { label: "Maior seq. V", cells: players.map((p) => ({ value: p.streakMax })) },
    { label: "Sequência atual", cells: players.map((p) => ({ value: p.streakCurrent, format: (v) => (v === 0 ? "—" : v > 0 ? `${v}V` : `${Math.abs(v)}D`) })) },
    { label: "Presença", cells: players.map((p) => ({ value: pct(p.roundsPresent, p.roundsTotal), format: (v) => `${v}%` })) },
  ];

  const seasonRows: Row[] = [
    { label: "Posição", cells: players.map((p) => ({ value: seasonStats(p).position ?? 999, format: (v) => (v === 999 ? "—" : `${v}º`) })), higherIsBetter: false },
    { label: "Elo temporada", cells: players.map((p) => ({ value: seasonStats(p).rating, format: (v) => Math.round(v).toString() })) },
    { label: "Partidas", cells: players.map((p) => ({ value: seasonStats(p).matches_played })) },
    { label: "Vitórias", cells: players.map((p) => ({ value: seasonStats(p).matches_won })) },
    { label: "Aproveitamento", cells: players.map((p) => ({ value: pct(seasonStats(p).matches_won, seasonStats(p).matches_played), format: (v) => `${v}%` })) },
    { label: "Sets ganhos", cells: players.map((p) => ({ value: seasonStats(p).sets_won })) },
    { label: "Saldo sets", cells: players.map((p) => ({ value: seasonStats(p).sets_won - seasonStats(p).sets_lost, format: (v) => (v > 0 ? `+${v}` : `${v}`) })) },
    { label: "Saldo games", cells: players.map((p) => ({ value: seasonStats(p).games_won - seasonStats(p).games_lost, format: (v) => (v > 0 ? `+${v}` : `${v}`) })) },
  ];

  const rows = scope === "career" ? careerRows : seasonRows;

  return (
    <>
      <section className="rounded-3xl border border-border bg-card/40 p-4 lg:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold text-foreground">
            Comparando {players.length} jogadores
          </h2>
        </div>
        <div className={`grid gap-2 ${players.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          {players.map((p) => (
            <div
              key={p.profile.user_id}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-background/40 p-3"
            >
              <PlayerAvatar
                avatarUrl={p.profile.avatar_url}
                name={p.profile.name}
                size="md"
                className="!h-12 !w-12 border-2 border-primary/30"
              />
              <p className="text-center font-display text-xs font-bold text-foreground truncate max-w-full">
                {displayName(p)}
              </p>
              <p className="font-display text-lg font-bold text-primary">{Math.round(p.eloCurrent)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 inline-flex rounded-full border border-border bg-card/60 p-1">
        <TabBtn active={scope === "season"} onClick={() => setScope("season")}>Temporada</TabBtn>
        <TabBtn active={scope === "career"} onClick={() => setScope("career")}>Carreira no grupo</TabBtn>
      </div>

      {scope === "season" && allSeasonIds.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allSeasonIds.map((id) => {
            const name = players.flatMap((p) => p.seasons).find((s) => s.season_id === id)?.season_name || "—";
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

      <section className="mt-3 overflow-hidden rounded-3xl border border-border bg-card/40">
        {scope === "season" && (
          <div className="border-b border-border/40 bg-background/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {seasonName}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-background/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Métrica</th>
                {players.map((p) => (
                  <th key={p.profile.user_id} className="px-2 py-2 text-center min-w-[80px]">
                    <span className="block truncate max-w-[100px] mx-auto" title={displayName(p)}>
                      {displayName(p)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const higherIsBetter = row.higherIsBetter !== false;
                const values = row.cells.map((c) => c.value);
                const best = higherIsBetter ? Math.max(...values) : Math.min(...values);
                const worst = higherIsBetter ? Math.min(...values) : Math.max(...values);
                const allSame = best === worst;
                return (
                  <tr key={row.label} className={ri % 2 === 0 ? "bg-background/20" : ""}>
                    <td className="px-3 py-2 font-semibold text-muted-foreground">{row.label}</td>
                    {row.cells.map((c, ci) => {
                      const isBest = !allSame && c.value === best;
                      const isWorst = !allSame && c.value === worst && players.length > 2;
                      return (
                        <td
                          key={ci}
                          className={`px-2 py-2 text-center font-display tabular-nums ${
                            isBest ? "font-bold text-success" : isWorst ? "text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {(c.format || ((v: number) => `${v}`))(c.value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-3 px-1 text-center text-[10px] text-muted-foreground">
        <span className="text-success font-bold">Verde</span> = melhor da métrica.
        Use a página com 2 jogadores para ver confrontos diretos detalhados.
      </p>
    </>
  );
}
