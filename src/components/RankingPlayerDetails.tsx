import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Trophy, TrendingUp, TrendingDown, Flame, Target, Users, Swords, Activity, Calendar, Percent, BarChart3, Award, Zap } from "lucide-react";

interface Props {
  userId: string;
  seasonId: string;
  groupId: string;
  rating: number;
  matchesPlayed: number;
  matchesWon: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  position: number | null;
  isEligible: boolean;
}

interface Partner {
  user_id: string;
  name: string;
  avatar_url: string | null;
  played: number;
  won: number;
}

interface RatingPoint {
  rating_after: number;
  created_at: string;
  rating_change: number;
}

export function RankingPlayerDetails(props: Props) {
  const { userId, seasonId, groupId, rating, matchesPlayed, matchesWon, setsWon, setsLost, gamesWon, gamesLost, position, isEligible } = props;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    win_streak_current: number;
    win_streak_max: number;
    rounds_present: number;
    rounds_absent: number;
    reliability_score: number;
  } | null>(null);
  const [ratingHistory, setRatingHistory] = useState<RatingPoint[]>([]);
  const [bestPartner, setBestPartner] = useState<Partner | null>(null);
  const [worstPartner, setWorstPartner] = useState<Partner | null>(null);
  const [topRival, setTopRival] = useState<Partner | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // 1) Season player stats (streaks, attendance)
        const statsP = supabase
          .from("player_stats_by_season")
          .select("win_streak_current, win_streak_max, rounds_present, rounds_absent, reliability_score")
          .eq("season_id", seasonId)
          .eq("user_id", userId)
          .maybeSingle();

        // 2) Rating events for sparkline + peak/lowest
        const eventsP = supabase
          .from("rating_events")
          .select("rating_after, rating_change, created_at, match_id")
          .eq("season_id", seasonId)
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        const [statsRes, eventsRes] = await Promise.all([statsP, eventsP]);
        if (cancelled) return;

        if (statsRes.data) {
          setStats({
            win_streak_current: statsRes.data.win_streak_current || 0,
            win_streak_max: statsRes.data.win_streak_max || 0,
            rounds_present: statsRes.data.rounds_present || 0,
            rounds_absent: statsRes.data.rounds_absent || 0,
            reliability_score: Number(statsRes.data.reliability_score || 0),
          });
        }

        const events = (eventsRes.data || []) as any[];
        setRatingHistory(events.map((e) => ({
          rating_after: Number(e.rating_after),
          created_at: e.created_at,
          rating_change: Number(e.rating_change),
        })));

        // 3) Partners & rivals (only if there are matches)
        if (events.length > 0) {
          const matchIds = events.map((e) => e.match_id).filter(Boolean);
          if (matchIds.length === 0) {
            setLoading(false);
            return;
          }

          // Fetch all match_players for these matches + match results
          const [mpRes, mRes] = await Promise.all([
            supabase.from("match_players").select("match_id, user_id, team").in("match_id", matchIds),
            supabase.from("matches").select("id, winner_team").in("id", matchIds),
          ]);

          const allPlayers = (mpRes.data || []) as { match_id: string; user_id: string; team: string }[];
          const matchesData = (mRes.data || []) as { id: string; winner_team: string | null }[];
          const winnerByMatch = new Map(matchesData.map((m) => [m.id, m.winner_team]));

          // Build my-team map per match
          const myTeamByMatch = new Map<string, string>();
          for (const p of allPlayers) {
            if (p.user_id === userId) myTeamByMatch.set(p.match_id, p.team);
          }

          // Aggregate partners (same team) & rivals (other team)
          const partnerAgg = new Map<string, { played: number; won: number }>();
          const rivalAgg = new Map<string, { played: number; won: number }>();

          for (const p of allPlayers) {
            if (p.user_id === userId) continue;
            const myTeam = myTeamByMatch.get(p.match_id);
            if (!myTeam) continue;
            const winner = winnerByMatch.get(p.match_id);
            const myWon = winner != null && winner === myTeam;
            const target = p.team === myTeam ? partnerAgg : rivalAgg;
            const cur = target.get(p.user_id) || { played: 0, won: 0 };
            cur.played += 1;
            if (myWon) cur.won += 1;
            target.set(p.user_id, cur);
          }

          // Need profile names for top entries
          const candidateIds = new Set<string>();
          const pickTopPartner = (m: Map<string, { played: number; won: number }>, mode: "best" | "worst") => {
            const entries = [...m.entries()].filter(([, v]) => v.played >= 2);
            if (entries.length === 0) return null;
            entries.sort((a, b) => {
              const wrA = a[1].won / a[1].played;
              const wrB = b[1].won / b[1].played;
              if (wrA !== wrB) return mode === "best" ? wrB - wrA : wrA - wrB;
              return b[1].played - a[1].played;
            });
            return entries[0];
          };
          const pickTopRival = (m: Map<string, { played: number; won: number }>) => {
            const entries = [...m.entries()].filter(([, v]) => v.played >= 2);
            if (entries.length === 0) return null;
            entries.sort((a, b) => b[1].played - a[1].played || a[1].won / a[1].played - b[1].won / b[1].played);
            return entries[0];
          };

          const bestP = pickTopPartner(partnerAgg, "best");
          const worstP = pickTopPartner(partnerAgg, "worst");
          const rivalP = pickTopRival(rivalAgg);
          [bestP, worstP, rivalP].forEach((x) => x && candidateIds.add(x[0]));

          if (candidateIds.size > 0) {
            const { data: profiles } = await supabase
              .from("user_profiles")
              .select("user_id, name, nickname, avatar_url")
              .in("user_id", [...candidateIds]);
            const pmap = new Map((profiles || []).map((p) => [p.user_id, p]));

            const toPartner = (e: [string, { played: number; won: number }] | null): Partner | null => {
              if (!e) return null;
              const prof = pmap.get(e[0]);
              return {
                user_id: e[0],
                name: prof?.nickname || prof?.name || "Jogador",
                avatar_url: prof?.avatar_url || null,
                played: e[1].played,
                won: e[1].won,
              };
            };
            if (!cancelled) {
              setBestPartner(toPartner(bestP));
              setWorstPartner(toPartner(worstP));
              setTopRival(toPartner(rivalP));
            }
          }
        }
      } catch (err) {
        console.error("Erro carregando detalhes:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId, seasonId, groupId]);

  const losses = matchesPlayed - matchesWon;
  const wr = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0;
  const setsTotal = setsWon + setsLost;
  const setsWr = setsTotal > 0 ? Math.round((setsWon / setsTotal) * 100) : 0;
  const gamesTotal = gamesWon + gamesLost;
  const gamesWr = gamesTotal > 0 ? Math.round((gamesWon / gamesTotal) * 100) : 0;
  const setBalance = setsWon - setsLost;
  const gameBalance = gamesWon - gamesLost;

  const peak = useMemo(() => {
    if (ratingHistory.length === 0) return null;
    return ratingHistory.reduce((max, p) => (p.rating_after > max ? p.rating_after : max), -Infinity);
  }, [ratingHistory]);
  const lowest = useMemo(() => {
    if (ratingHistory.length === 0) return null;
    return ratingHistory.reduce((min, p) => (p.rating_after < min ? p.rating_after : min), Infinity);
  }, [ratingHistory]);
  const startRating = ratingHistory[0]?.rating_after ? ratingHistory[0].rating_after - ratingHistory[0].rating_change : 1000;
  const totalChange = Math.round(rating - startRating);
  const bestGain = useMemo(() => {
    if (ratingHistory.length === 0) return 0;
    return ratingHistory.reduce((m, p) => (p.rating_change > m ? p.rating_change : m), 0);
  }, [ratingHistory]);
  const worstLoss = useMemo(() => {
    if (ratingHistory.length === 0) return 0;
    return ratingHistory.reduce((m, p) => (p.rating_change < m ? p.rating_change : m), 0);
  }, [ratingHistory]);

  // Sparkline data
  const sparkPath = useMemo(() => {
    if (ratingHistory.length < 2) return null;
    const W = 240, H = 56, P = 4;
    const ratings = ratingHistory.map((p) => p.rating_after);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const range = max - min || 1;
    const stepX = (W - P * 2) / (ratings.length - 1);
    const points = ratings.map((r, i) => {
      const x = P + i * stepX;
      const y = P + (H - P * 2) * (1 - (r - min) / range);
      return [x, y] as const;
    });
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${d} L${points[points.length - 1][0].toFixed(1)},${H} L${points[0][0].toFixed(1)},${H} Z`;
    return { d, area, W, H };
  }, [ratingHistory]);

  return (
    <div className="px-3 py-3 lg:px-5 lg:py-4 bg-muted/10 border-t border-border/50">
      {/* Top row: hero stats + sparkline */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-4">
        {/* HERO METRICS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricCard
            icon={<Trophy className="h-3.5 w-3.5" />}
            label="Aproveitamento"
            value={matchesPlayed > 0 ? `${wr}%` : "—"}
            sub={matchesPlayed > 0 ? `${matchesWon}V · ${losses}D` : "Sem partidas"}
            tone={wr >= 60 ? "success" : wr >= 40 ? "neutral" : "danger"}
          />
          <MetricCard
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            label="Sets"
            value={setsTotal > 0 ? `${setsWr}%` : "—"}
            sub={setsTotal > 0 ? `${setsWon}–${setsLost} (${setBalance >= 0 ? "+" : ""}${setBalance})` : "—"}
            tone={setsWr >= 50 ? "success" : "danger"}
          />
          <MetricCard
            icon={<Target className="h-3.5 w-3.5" />}
            label="Games"
            value={gamesTotal > 0 ? `${gamesWr}%` : "—"}
            sub={gamesTotal > 0 ? `${gamesWon}–${gamesLost} (${gameBalance >= 0 ? "+" : ""}${gameBalance})` : "—"}
            tone={gamesWr >= 50 ? "success" : "danger"}
          />
          <MetricCard
            icon={<Award className="h-3.5 w-3.5" />}
            label="Posição"
            value={position ? `#${position}` : "—"}
            sub={isEligible ? "Elegível" : "Não elegível"}
            tone="primary"
          />
        </div>

        {/* SPARKLINE */}
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Evolução do Elo</span>
            <span className={`text-[11px] font-bold tabular-nums ${totalChange > 0 ? "text-success" : totalChange < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {totalChange > 0 ? "+" : ""}{totalChange}
            </span>
          </div>
          {sparkPath ? (
            <svg viewBox={`0 0 ${sparkPath.W} ${sparkPath.H}`} className="w-full h-14" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`spark-${userId}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sparkPath.area} fill={`url(#spark-${userId})`} />
              <path d={sparkPath.d} stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className="h-14 flex items-center justify-center text-[10px] text-muted-foreground">
              {loading ? "Carregando..." : "Sem histórico suficiente"}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-1.5 text-[10px]">
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-success" />
              <span>Pico</span>
              <span className="ml-auto font-bold text-foreground tabular-nums">{peak ? Math.round(peak) : "—"}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingDown className="h-3 w-3 text-destructive" />
              <span>Mín.</span>
              <span className="ml-auto font-bold text-foreground tabular-nums">{lowest && lowest !== Infinity ? Math.round(lowest) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Second row: streaks, attendance, swings */}
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MiniStat
          icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
          label="Sequência atual"
          value={stats ? `${stats.win_streak_current}V` : loading ? "…" : "0V"}
        />
        <MiniStat
          icon={<Zap className="h-3.5 w-3.5 text-amber-400" />}
          label="Maior sequência"
          value={stats ? `${stats.win_streak_max}V` : loading ? "…" : "0V"}
        />
        <MiniStat
          icon={<Calendar className="h-3.5 w-3.5 text-primary" />}
          label="Presença"
          value={stats ? `${stats.rounds_present}/${stats.rounds_present + stats.rounds_absent}` : loading ? "…" : "0/0"}
          sub={stats && stats.rounds_present + stats.rounds_absent > 0
            ? `${Math.round((stats.rounds_present / (stats.rounds_present + stats.rounds_absent)) * 100)}%`
            : undefined}
        />
        <MiniStat
          icon={<Activity className="h-3.5 w-3.5 text-cyan-400" />}
          label="Maior virada"
          value={bestGain > 0 ? `+${Math.round(bestGain)}` : "—"}
          sub={worstLoss < 0 ? `Pior: ${Math.round(worstLoss)}` : undefined}
          subTone="danger"
        />
      </div>

      {/* Third row: partners & rivals */}
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <PartnerCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Melhor parceiro"
          partner={bestPartner}
          loading={loading}
          tone="success"
        />
        <PartnerCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Pior parceiro"
          partner={worstPartner}
          loading={loading}
          tone="danger"
        />
        <PartnerCard
          icon={<Swords className="h-3.5 w-3.5" />}
          label="Maior rival"
          partner={topRival}
          loading={loading}
          tone="primary"
          rivalPerspective
        />
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "success" | "danger" | "neutral" | "primary";
}) {
  const toneClasses = {
    success: "text-success",
    danger: "text-destructive",
    neutral: "text-foreground",
    primary: "text-primary",
  }[tone];
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={toneClasses}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 font-display text-base lg:text-lg font-bold leading-none tabular-nums ${toneClasses}`}>{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground tabular-nums truncate">{sub}</p>
    </div>
  );
}

function MiniStat({ icon, label, value, sub, subTone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subTone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-2.5 py-2 flex items-center gap-2">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-none truncate">{label}</p>
        <p className="mt-0.5 text-xs font-bold text-foreground tabular-nums leading-none">{value}</p>
        {sub && (
          <p className={`mt-0.5 text-[9px] leading-none tabular-nums ${
            subTone === "success" ? "text-success" : subTone === "danger" ? "text-destructive" : "text-muted-foreground"
          }`}>{sub}</p>
        )}
      </div>
    </div>
  );
}

function PartnerCard({ icon, label, partner, loading, tone, rivalPerspective }: {
  icon: React.ReactNode;
  label: string;
  partner: Partner | null;
  loading: boolean;
  tone: "success" | "danger" | "primary";
  rivalPerspective?: boolean;
}) {
  const toneBorder = {
    success: "border-success/25 bg-success/5",
    danger: "border-destructive/25 bg-destructive/5",
    primary: "border-primary/25 bg-primary/5",
  }[tone];
  const toneText = {
    success: "text-success",
    danger: "text-destructive",
    primary: "text-primary",
  }[tone];

  if (loading) {
    return (
      <div className={`rounded-xl border ${toneBorder} px-3 py-2 flex items-center gap-2`}>
        <div className="h-8 w-8 rounded-full bg-muted/50 animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-2 w-20 bg-muted/50 rounded animate-pulse" />
          <div className="h-3 w-24 bg-muted/40 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className={`rounded-xl border border-border/40 bg-card/40 px-3 py-2`}>
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className={toneText}>{icon}</span>
          <span>{label}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Dados insuficientes</p>
      </div>
    );
  }

  const wr = Math.round((partner.won / partner.played) * 100);
  // For rival: show losses (matches against this rival you LOST)
  const losses = partner.played - partner.won;
  return (
    <div className={`rounded-xl border ${toneBorder} px-3 py-2`}>
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={toneText}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <PlayerAvatar avatarUrl={partner.avatar_url} name={partner.name} size="sm" className="!h-8 !w-8 border border-border" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">{partner.name}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
            {rivalPerspective ? (
              <>
                <span>{partner.played} confrontos</span>
                <span className="mx-1">·</span>
                <span>{partner.won}V/{losses}D</span>
              </>
            ) : (
              <>
                <span className={`font-bold ${toneText}`}>{wr}%</span>
                <span className="mx-1">·</span>
                <span>{partner.played} jogos</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
