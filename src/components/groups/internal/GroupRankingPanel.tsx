import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Trophy, ExternalLink, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatarLink } from "@/components/PlayerProfileViewer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GroupEloEvolutionChart } from "@/components/groups/internal/GroupEloEvolutionChart";

interface RankingRow {
  user_id: string;
  rating: number;
  position: number | null;
  matches_played: number;
  matches_won: number;
  is_eligible: boolean;
  profile?: {
    name: string;
    nickname: string | null;
    avatar_url: string | null;
  };
}

interface Props {
  groupId: string;
}

export function GroupRankingPanel({ groupId }: Props) {
  const [loading, setLoading] = useState(true);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [rows, setRows] = useState<RankingRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: season } = await supabase
        .from("seasons")
        .select("id, name")
        .eq("group_id", groupId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!season) {
        setRows([]);
        setSeasonName(null);
        setLoading(false);
        return;
      }
      setSeasonName(season.name);
      const { data: snaps } = await supabase
        .from("ranking_snapshots")
        .select("user_id, rating, position, matches_played, matches_won, is_eligible")
        .eq("season_id", season.id);

      const userIds = (snaps || []).map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, nickname, avatar_url")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const profMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      const merged: RankingRow[] = (snaps || []).map((s) => ({
        ...s,
        profile: profMap.get(s.user_id) as RankingRow["profile"],
      }));
      merged.sort((a, b) => {
        if (a.is_eligible !== b.is_eligible) return a.is_eligible ? -1 : 1;
        return b.rating - a.rating;
      });
      if (cancelled) return;
      setRows(merged);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-foreground">Ranking do grupo</h2>
          <p className="truncate text-xs text-muted-foreground">
            {seasonName ? `Temporada: ${seasonName}` : "Sem temporada ativa"}
          </p>
        </div>
        <Link
          to="/ranking"
          search={{ group: groupId }}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          Ver completo
          <ExternalLink className="h-3 w-3" />
        </Link>
      </header>

      <GroupEloEvolutionChart groupId={groupId} defaultFilter="active" />


      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Carregando ranking…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma partida computada ainda nesta temporada.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row, idx) => {
            const name = row.profile?.nickname || row.profile?.name || "Jogador";
            const winRate = row.matches_played > 0
              ? Math.round((row.matches_won / row.matches_played) * 100)
              : 0;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 ${
                  !row.is_eligible ? "opacity-60" : ""
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    idx === 0
                      ? "bg-[var(--rank-gold)]/20 text-[var(--rank-gold)] ring-1 ring-[var(--rank-gold)]/40"
                      : idx === 1
                      ? "bg-[var(--rank-silver,_oklch(0.85_0_0))]/20 text-foreground ring-1 ring-border"
                      : idx === 2
                      ? "bg-[var(--rank-bronze,_oklch(0.6_0.1_50))]/20 text-foreground ring-1 ring-border"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {row.is_eligible ? idx + 1 : "—"}
                </span>
                <PlayerAvatarLink userId={row.user_id} ariaLabel={`Ver perfil de ${name}`}>
                  <PlayerAvatar
                    name={name}
                    avatarUrl={row.profile?.avatar_url ?? null}
                    size="sm"
                  />
                </PlayerAvatarLink>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {row.matches_played} jogos · {winRate}% vitórias
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-primary">
                    {Math.round(row.rating)}
                  </p>
                  {!row.is_eligible && (
                    <p className="text-[9px] uppercase tracking-wider text-warning">
                      inelegível
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="px-1 text-center text-[10px] text-muted-foreground">
          <Trophy className="mr-1 inline h-2.5 w-2.5" />
          Toque em "Ver completo" para gráficos, histórico e mais detalhes.
        </p>
      )}
    </div>
  );
}
