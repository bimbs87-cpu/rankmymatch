import { useEffect, useState } from "react";
import { Crown, Medal, Trophy, Zap, TrendingUp, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useSeasonExtras, type RecordHolder } from "@/hooks/use-group-stats";

interface RankingRow {
  user_id: string;
  rating: number;
  matches_played: number;
  matches_won: number;
  position: number | null;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  avatar_type: string | null;
}

export function SeasonFinalRanking({ seasonId, isActive = false }: { seasonId: string; isActive?: boolean }) {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: extras } = useSeasonExtras(seasonId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: snaps } = await supabase
        .from("ranking_snapshots")
        .select("user_id, rating, matches_played, matches_won, position")
        .eq("season_id", seasonId)
        .order("rating", { ascending: false });

      if (!snaps?.length) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }

      const userIds = snaps.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url, avatar_type")
        .in("user_id", userIds);

      const merged: RankingRow[] = snaps.map((s, i) => {
        const p = profiles?.find((p) => p.user_id === s.user_id);
        return {
          user_id: s.user_id,
          rating: Number(s.rating),
          matches_played: s.matches_played || 0,
          matches_won: s.matches_won || 0,
          position: s.position ?? i + 1,
          name: p?.name || "Jogador",
          nickname: p?.nickname || null,
          avatar_url: p?.avatar_url || null,
          avatar_type: p?.avatar_type || null,
        };
      });
      if (!cancelled) { setRows(merged); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [seasonId]);

  if (loading) return <div className="p-4 text-xs text-muted-foreground">Carregando ranking…</div>;
  if (!rows.length) return null;

  const podium = rows.slice(0, 3);
  const [first, second, third] = [podium[0], podium[1], podium[2]];
  const wr = (r: RankingRow) => r.matches_played ? Math.round((r.matches_won / r.matches_played) * 100) : 0;
  const totalMatches = rows.reduce((s, r) => s + r.matches_played, 0) / 2; // each match counted per player; doubles=4, singles=2 — approx

  return (
    <div className="space-y-3 p-3">
      {(extras.longest_streak || extras.biggest_swing || extras.most_frequent) && (
        <div className="grid gap-2 sm:grid-cols-3">
          <ExtraCard icon={<Zap className="h-3.5 w-3.5" />} label="Maior sequência" rec={extras.longest_streak} tone="primary" />
          <ExtraCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Maior virada de Elo" rec={extras.biggest_swing} tone="success" prefix="+" />
          <ExtraCard icon={<Target className="h-3.5 w-3.5" />} label="Mais frequente" rec={extras.most_frequent} tone="info" />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
      {/* Pódio */}
      <div className="rounded-2xl border border-border bg-card/40 p-4">
        <div className="mb-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Pódio Final
        </div>
        <div className="flex items-end justify-center gap-2">
          {/* 2º */}
          {second && (
            <PodiumColumn row={second} place={2} height="h-20" color="from-zinc-400/30 to-zinc-500/10" labelColor="text-zinc-300" />
          )}
          {/* 1º */}
          {first && (
            <PodiumColumn row={first} place={1} height="h-28" color="from-warning/40 to-warning/10" labelColor="text-warning" crown />
          )}
          {/* 3º */}
          {third && (
            <PodiumColumn row={third} place={3} height="h-16" color="from-amber-700/30 to-amber-700/10" labelColor="text-amber-600" />
          )}
        </div>
      </div>

      {/* Ranking + stats */}
      <div className="rounded-2xl border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Classificação</div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Trophy className="h-3 w-3" />{rows.length} jogadores</span>
            <span>·</span>
            <span>{Math.round(totalMatches)} partidas</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.user_id}
              className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5"
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                r.position === 1 ? "bg-warning/20 text-warning" :
                r.position === 2 ? "bg-zinc-400/20 text-zinc-300" :
                r.position === 3 ? "bg-amber-700/20 text-amber-600" :
                "bg-muted/40 text-muted-foreground"
              }`}>
                {r.position}
              </span>
              <PlayerAvatar
                name={r.nickname || r.name}
                avatarUrl={r.avatar_url}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-foreground">{r.nickname || r.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.matches_won}V/{r.matches_played - r.matches_won}D · {wr(r)}% WR
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-sm font-bold text-primary">{Math.round(r.rating)}</div>
                <div className="text-[9px] uppercase text-muted-foreground">Elo</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

function ExtraCard({ icon, label, rec, tone, prefix = "" }: {
  icon: React.ReactNode; label: string; rec: RecordHolder | null; tone: "primary" | "success" | "info"; prefix?: string;
}) {
  const toneClass = { primary: "text-primary", success: "text-success", info: "text-info" }[tone];
  if (!rec) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/10 p-2.5">
        <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${toneClass}`}>{icon}{label}</div>
        <p className="mt-1 text-[10px] text-muted-foreground">—</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card/40 p-2.5">
      <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${toneClass}`}>{icon}{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <PlayerAvatar avatarUrl={rec.avatar_url} name={rec.name} size="xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-foreground">{rec.name}</p>
          {rec.detail && <p className="truncate text-[9px] text-muted-foreground">{rec.detail}</p>}
        </div>
        <span className={`font-display text-sm font-black ${toneClass}`}>{prefix}{rec.value}</span>
      </div>
    </div>
  );
}

function PodiumColumn({
  row, place, height, color, labelColor, crown,
}: {
  row: RankingRow; place: number; height: string; color: string; labelColor: string; crown?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="relative">
        {crown && <Crown className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 text-warning" />}
        <PlayerAvatar
          name={row.nickname || row.name}
          avatarUrl={row.avatar_url}
          size="md"
        />
      </div>
      <div className="text-center">
        <div className="truncate text-[11px] font-semibold text-foreground max-w-[80px]">
          {row.nickname || row.name}
        </div>
        <div className={`font-display text-sm font-bold ${labelColor}`}>{Math.round(row.rating)}</div>
        <div className="text-[9px] text-muted-foreground">
          {row.matches_played ? Math.round((row.matches_won / row.matches_played) * 100) : 0}% WR
        </div>
      </div>
      <div className={`flex w-full items-center justify-center rounded-t-lg bg-gradient-to-t ${color} ${height}`}>
        <div className="flex items-center gap-1 text-xs font-bold text-foreground">
          {place === 1 && <Medal className="h-3 w-3" />}
          {place}º
        </div>
      </div>
    </div>
  );
}
