import { Link } from "@tanstack/react-router";
import {
  Calendar, Clock, MapPin, Trophy, ChevronRight, Users, MessageSquare, Lock,
  CheckCircle2, XCircle, Flame, TrendingUp, Award, Zap, Target, Crown, Sparkles, Activity,
} from "lucide-react";
import { useGroupDashboard } from "@/hooks/use-group-dashboard";
import { useGroupGlobalStats, type RecordHolder } from "@/hooks/use-group-stats";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GroupRivalriesPanel } from "./GroupRivalriesPanel";
import { GroupEloEvolutionChart } from "./GroupEloEvolutionChart";
import { confirmPresence, cancelPresence } from "@/lib/round-actions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useState } from "react";

interface Props {
  groupId: string;
  groupName: string;
  groupImage: string | null;
  description: string | null;
  onGotoMembers: () => void;
  onGotoResults: () => void;
  /** Open the embedded compare with these two player ids pre-selected. */
  onCompare?: (userIdA: string, userIdB: string) => void;
}

export function GroupOverviewPanel({ groupId, groupName, groupImage, description, onGotoMembers, onGotoResults, onCompare }: Props) {
  const { user } = useAuth();
  const { data, isLoading, refresh } = useGroupDashboard(groupId);
  const { data: stats, isLoading: statsLoading } = useGroupGlobalStats(groupId);
  const [busy, setBusy] = useState(false);

  const handlePresence = async (status: "confirmed" | "declined") => {
    if (!user || !data.next_round) return;
    setBusy(true);
    try {
      if (status === "confirmed") await confirmPresence(data.next_round.id, user.id);
      else await cancelPresence(data.next_round.id, user.id);
      toast.success(status === "confirmed" ? "Presença confirmada" : "Ausência registrada");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        {groupImage ? (
          <div className="relative h-32 sm:h-40">
            <img src={groupImage} alt={groupName} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="px-5 pb-5 -mt-4 relative">
          <h1 className="font-display text-xl font-bold text-foreground">{groupName}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
              {data.member_count} membros
            </span>
            {data.current_season && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                {data.current_season.name}
              </span>
            )}
            {data.current_season?.rounds_total != null && (
              <span className="rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
                Rodada {data.current_season.rounds_done}/{data.current_season.rounds_total}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPIs globais */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard icon={<Trophy className="h-4 w-4" />} label="Temporadas" value={stats.total_seasons} sub={`${stats.finished_seasons} encerradas`} loading={statsLoading} />
        <KpiCard icon={<Calendar className="h-4 w-4" />} label="Rodadas" value={stats.total_rounds} loading={statsLoading} />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Partidas" value={stats.total_matches} loading={statsLoading} />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Jogadores" value={stats.total_active_players} loading={statsLoading} />
      </div>

      {/* Grid principal: próxima rodada, sua posição, top 3, atividade */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Próxima rodada */}
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Próxima rodada</h3>
            {data.next_round && (
              <Link
                to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                params={{ groupId, seasonId: data.current_season?.id || "", roundId: data.next_round.id }}
                className="text-[11px] font-semibold text-primary"
              >
                Abrir →
              </Link>
            )}
          </div>
          {isLoading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
          ) : data.next_round ? (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                Rodada {data.next_round.round_number}
                {data.next_round.scheduled_date && (
                  <span className="text-muted-foreground font-normal">
                    · {new Date(data.next_round.scheduled_date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {data.next_round.scheduled_time && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{data.next_round.scheduled_time.slice(0, 5)}</span>
                )}
                {data.next_round.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{data.next_round.location}</span>
                )}
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{data.next_round.confirmed_count}/{data.next_round.max_players}</span>
              </div>
              <div className="mt-3">
                {data.next_round.presence_is_open ? (
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handlePresence("confirmed")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                        data.next_round.presence_status === "confirmed"
                          ? "bg-success text-success-foreground"
                          : "border border-success/40 bg-success/10 text-success hover:bg-success/20"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {data.next_round.presence_status === "confirmed" ? "Confirmado" : "Vou"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handlePresence("declined")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                        data.next_round.presence_status === "declined"
                          ? "bg-destructive text-destructive-foreground"
                          : "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                      }`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {data.next_round.presence_status === "declined" ? "Não vou" : "Não vou"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 py-2.5 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {data.next_round.presence_opens_at
                      ? `Lista abre ${new Date(data.next_round.presence_opens_at).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                      : "Lista ainda não aberta"}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 py-6 text-center text-xs text-muted-foreground">
              Nenhuma rodada agendada
            </div>
          )}
        </div>

        {/* Sua posição */}
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Sua posição</h3>
          {isLoading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
          ) : data.my_position ? (
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <span className="font-display text-2xl font-black text-primary">#{data.my_position}</span>
              </div>
              <div className="flex-1">
                <p className="font-display text-2xl font-bold text-foreground">{Math.round(data.my_rating || 0)}</p>
                <p className="text-xs text-muted-foreground">de {data.total_ranked} jogadores ranqueados</p>
              </div>
              <button
                onClick={onGotoMembers}
                className="rounded-full border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 py-6 text-center text-xs text-muted-foreground">
              Jogue partidas para entrar no ranking
            </div>
          )}
        </div>

        {/* Pódio */}
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Top 3</h3>
            <button onClick={onGotoMembers} className="text-[11px] font-semibold text-primary">Ver todos →</button>
          </div>
          {data.podium.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 py-6 text-center text-xs text-muted-foreground">
              Sem ranking ainda
            </div>
          ) : (
            <ul className="space-y-2">
              {data.podium.map((p) => (
                <li key={p.user_id} className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                    p.position === 1 ? "bg-rank-gold/20 text-rank-gold" :
                    p.position === 2 ? "bg-muted-foreground/20 text-muted-foreground" :
                    "bg-orange-500/20 text-orange-500"
                  }`}>{p.position}</span>
                  <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="font-display text-sm font-bold text-primary">{p.rating}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Atividade */}
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Atividade recente</h3>
          {data.recent_activity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 py-6 text-center text-xs text-muted-foreground">
              Sem atividade
            </div>
          ) : (
            <ul className="space-y-2">
              {data.recent_activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-xs">
                  {a.kind === "comment" ? (
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  <span className="text-foreground/80">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onGotoResults} className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border border-border bg-card py-2 text-[11px] font-semibold text-foreground">
            Ver resultados <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Jogador em alta (últimos 30 dias) */}
      {stats.hot_player_30d && (
        <div className="rounded-3xl border border-warning/30 bg-gradient-to-br from-warning/10 to-warning/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-warning">
            <Flame className="h-3.5 w-3.5" /> Em alta · últimos 30 dias
          </div>
          <div className="flex items-center gap-3">
            <PlayerAvatar avatarUrl={stats.hot_player_30d.avatar_url} name={stats.hot_player_30d.name} size="md" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-display text-lg font-bold text-foreground">{stats.hot_player_30d.name}</p>
              <p className="text-xs text-muted-foreground">{stats.hot_player_30d.matches} partidas no período</p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-black text-warning">+{stats.hot_player_30d.rating_change}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Elo</p>
            </div>
          </div>
        </div>
      )}

      {/* Recordes lifetime */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Award className="h-3.5 w-3.5" /> Recordes do grupo
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <RecordCard icon={<Crown className="h-4 w-4" />} label="Maior Elo de todos os tempos" rec={stats.highest_elo_ever} suffix="" tone="warning" />
          <RecordCard icon={<TrendingUp className="h-4 w-4" />} label="Maior virada de Elo" rec={stats.biggest_elo_swing} suffix="" prefix="+" tone="success" />
          <RecordCard icon={<Zap className="h-4 w-4" />} label="Maior sequência de vitórias" rec={stats.longest_win_streak} suffix="" tone="primary" />
          <RecordCard icon={<Target className="h-4 w-4" />} label="Mais partidas jogadas" rec={stats.most_frequent_player} suffix="" tone="info" />
          <RecordCard icon={<Trophy className="h-4 w-4" />} label="Mais vitórias" rec={stats.most_wins_player} suffix="" tone="primary" />
          <RecordCard icon={<Sparkles className="h-4 w-4" />} label="Melhor aproveitamento" rec={stats.best_win_rate_player} suffix="%" tone="success" />
        </div>
      </div>

      {/* Confrontos clássicos, duplas frequentes e próximos confrontos */}
      <GroupRivalriesPanel groupId={groupId} onPickPair={onCompare} />

      {/* Evolução de Elo */}
      <GroupEloEvolutionChart groupId={groupId} />

      {/* Top duplas (melhor aproveitamento) */}
      {stats.top_pairs.length > 0 && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Melhores duplas (mín. 3 partidas juntas)
          </h3>
          <ul className="space-y-2">
            {stats.top_pairs.map((p, i) => (
              <li key={`${p.user_a}-${p.user_b}`} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 p-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{i + 1}</span>
                <div className="flex -space-x-2">
                  <PlayerAvatar avatarUrl={p.avatar_a} name={p.name_a} size="sm" />
                  <PlayerAvatar avatarUrl={p.avatar_b} name={p.name_b} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{p.name_a} & {p.name_b}</p>
                  <p className="text-[11px] text-muted-foreground">{p.wins}V/{p.matches - p.wins}D em {p.matches} partidas</p>
                </div>
                <span className="font-display text-sm font-bold text-success">{p.win_rate}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, loading }: { icon: React.ReactNode; label: string; value: number; sub?: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      {loading ? (
        <div className="mt-1 h-7 w-16 animate-pulse rounded bg-muted/40" />
      ) : (
        <p className="mt-0.5 font-display text-2xl font-black text-foreground">{value}</p>
      )}
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RecordCard({
  icon, label, rec, suffix = "", prefix = "", tone,
}: { icon: React.ReactNode; label: string; rec: RecordHolder | null; suffix?: string; prefix?: string; tone: "warning" | "success" | "primary" | "info" }) {
  const toneClass = {
    warning: "text-warning",
    success: "text-success",
    primary: "text-primary",
    info: "text-info",
  }[tone];

  if (!rec) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-3">
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${toneClass}`}>
          {icon} {label}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">—</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${toneClass}`}>
        {icon} {label}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <PlayerAvatar avatarUrl={rec.avatar_url} name={rec.name} size="xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{rec.name}</p>
          {rec.detail && <p className="truncate text-[10px] text-muted-foreground">{rec.detail}</p>}
        </div>
        <span className={`font-display text-base font-black ${toneClass}`}>{prefix}{rec.value}{suffix}</span>
      </div>
    </div>
  );
}
