import { Link } from "@tanstack/react-router";
import {
  Calendar, Clock, MapPin, Trophy, ChevronRight, Users, MessageSquare, Lock,
  CheckCircle2, XCircle, Flame, TrendingUp, Award, Zap, Target, Crown, Sparkles, Activity,
  HelpCircle, Share2,
} from "lucide-react";
import { useGroupDashboard } from "@/hooks/use-group-dashboard";
import { useGroupGlobalStats, type RecordHolder } from "@/hooks/use-group-stats";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { GroupRivalriesPanel } from "./GroupRivalriesPanel";
import { GroupEloEvolutionChart } from "./GroupEloEvolutionChart";
import { ShareGroupDialog } from "@/components/ShareGroupDialog";
import { confirmPresence, cancelPresence } from "@/lib/round-actions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { notifyUrgentPendingMembers } from "@/lib/urgency-notify";
import { useTopSharer } from "@/hooks/use-top-sharer";
import { AdminPendingBadges } from "./AdminPendingBadges";

interface Props {
  groupId: string;
  groupName: string;
  groupImage: string | null;
  description: string | null;
  isAdmin?: boolean;
  onGotoMembers: () => void;
  onGotoResults: () => void;
  /** Open the embedded compare with these two player ids pre-selected. */
  onCompare?: (userIdA: string, userIdB: string) => void;
}

export function GroupOverviewPanel({ groupId, groupName, groupImage, description, isAdmin = false, onGotoMembers, onGotoResults, onCompare }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/groups/${groupId}`
    : `https://rankmymatch.app/groups/${groupId}`;
  const { user } = useAuth();
  const { data, isLoading, refresh } = useGroupDashboard(groupId);
  const { data: stats, isLoading: statsLoading } = useGroupGlobalStats(groupId);
  const { data: topSharer } = useTopSharer(groupId);
  const isTopSharer = !!user && !!topSharer && topSharer.user_id === user.id && topSharer.count >= 2;
  const [busy, setBusy] = useState(false);

  const handlePresence = async (status: "confirmed" | "declined") => {
    if (!user || !data.next_round) return;
    setBusy(true);
    try {
      if (status === "confirmed") {
        await confirmPresence(data.next_round.id, user.id);
        toast.success("Presença confirmada");
      } else {
        const result = await cancelPresence(data.next_round.id, user.id);
        toast.success("Ausência registrada");
        if (result.promotedUserId) {
          const who = result.promotedName || "alguém da lista de espera";
          toast(`Sua vaga foi para ${who}`, { description: "Auto-promoção da lista de espera" });
        }
      }
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold text-foreground">{groupName}</h1>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              onClick={() => setShareOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 text-[11px] font-semibold text-foreground backdrop-blur transition hover:bg-accent"
              aria-label="Compartilhar grupo"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>
          </div>
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
            {isTopSharer && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400/20 to-amber-500/10 px-2.5 py-1 font-semibold text-amber-500 ring-1 ring-amber-400/40 animate-in fade-in slide-in-from-bottom-1"
                title={`Você fez ${topSharer!.count} compartilhamento${topSharer!.count === 1 ? "" : "s"} esta semana`}
              >
                🥇 Top divulgador da semana
              </span>
            )}
          </div>
        </div>
      </div>

      <ShareGroupDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        groupName={groupName}
        groupId={groupId}
        isAdmin={isAdmin}
      />

      {isAdmin && <AdminPendingBadges groupId={groupId} onGotoResults={onGotoResults} />}

      {/* Linha compacta: 2 KPIs combinados + Próxima rodada + Sua posição (sempre 4 colunas) */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <DualKpiCard
          a={{ icon: <Trophy className="h-3 w-3" />, label: "Temporadas", value: stats.total_seasons, sub: stats.finished_seasons ? `${stats.finished_seasons} encerr.` : undefined }}
          b={{ icon: <Activity className="h-3 w-3" />, label: "Partidas", value: stats.total_matches }}
          loading={statsLoading}
        />
        <DualKpiCard
          a={{ icon: <Calendar className="h-3 w-3" />, label: "Rodadas", value: stats.total_rounds }}
          b={{ icon: <Users className="h-3 w-3" />, label: "Jogadores", value: stats.total_active_players }}
          loading={statsLoading}
        />

        {/* Próxima rodada */}
        <NextRoundCard data={data} isLoading={isLoading} groupId={groupId} busy={busy} onPresence={handlePresence} />

        {/* Sua posição */}
        <div className="rounded-3xl border border-border bg-card p-3">
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sua posição</h3>
          {isLoading ? (
            <div className="h-14 animate-pulse rounded-xl bg-muted/30" />
          ) : data.my_position ? (
            <button onClick={onGotoMembers} className="flex w-full items-center gap-2 text-left">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <span className="font-display text-base font-black text-primary">#{data.my_position}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-bold text-foreground leading-tight">{Math.round(data.my_rating || 0)}</p>
                <p className="text-[10px] text-muted-foreground truncate">de {data.total_ranked} ranqueados</p>
              </div>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 py-3 text-center text-[10px] text-muted-foreground">
              Jogue para entrar no ranking
            </div>
          )}
        </div>
      </div>

      {/* Grid secundário: top 3 + atividade */}
      <div className="grid gap-4 lg:grid-cols-2">

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
      {/* Mobile floating share FAB — one-tap access on phones */}
      <button
        onClick={() => setShareOpen(true)}
        aria-label="Compartilhar grupo"
        className="lg:hidden fixed bottom-24 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.55)] transition-transform active:scale-95 hover:scale-105"
      >
        <Share2 className="h-5 w-5" />
      </button>
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

interface KpiSlot { icon: React.ReactNode; label: string; value: number; sub?: string }

function DualKpiCard({ a, b, loading }: { a: KpiSlot; b: KpiSlot; loading?: boolean }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        {[a, b].map((slot, i) => (
          <div key={i} className={i === 0 ? "border-r border-border/60 pr-2" : "pl-1"}>
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {slot.icon}
              <span className="truncate">{slot.label}</span>
            </div>
            {loading ? (
              <div className="mt-1 h-6 w-12 animate-pulse rounded bg-muted/40" />
            ) : (
              <p className="mt-0.5 font-display text-xl font-black leading-tight text-foreground">{slot.value}</p>
            )}
            {slot.sub && <p className="text-[9px] text-muted-foreground truncate">{slot.sub}</p>}
          </div>
        ))}
      </div>
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

interface NextRoundCardProps {
  data: ReturnType<typeof useGroupDashboard>["data"];
  isLoading: boolean;
  groupId: string;
  busy: boolean;
  onPresence: (status: "confirmed" | "declined") => void;
}

function NextRoundCard({ data, isLoading, groupId, busy, onPresence }: NextRoundCardProps) {
  const presenceButtonsRef = useRef<HTMLDivElement | null>(null);
  const handleScrollToButtons = () => {
    const el = presenceButtonsRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Brief highlight pulse for visual feedback
    el.classList.add("ring-2", "ring-warning", "ring-offset-2", "ring-offset-card", "rounded-full");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-warning", "ring-offset-2", "ring-offset-card", "rounded-full");
    }, 1200);
  };
  const urgency = useMemo(() => {
    const r = data.next_round;
    if (!r || !r.scheduled_date) return null;
    const dateStr = r.scheduled_time ? `${r.scheduled_date}T${r.scheduled_time}` : `${r.scheduled_date}T20:00:00`;
    const ts = new Date(dateStr).getTime();
    const diffMs = ts - Date.now();
    const slotsLeft = (r.max_players ?? 0) - (r.confirmed_count ?? 0);
    if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000 && slotsLeft > 0) {
      const hours = Math.max(1, Math.round(diffMs / 3600000));
      return { hours, slotsLeft };
    }
    return null;
  }, [data.next_round]);

  // Fire-and-forget in-app notifications to pending members when urgency kicks in.
  // Idempotent per-round via localStorage cooldown inside the helper.
  useEffect(() => {
    const r = data.next_round;
    if (!urgency || !r || !r.presence_is_open) return;
    const pendingIds = (r.pending_all || []).map((p) => p.user_id);
    if (!pendingIds.length) return;
    void notifyUrgentPendingMembers({
      roundId: r.id,
      groupId,
      pendingUserIds: pendingIds,
      hoursLeft: urgency.hours,
      slotsLeft: urgency.slotsLeft,
      roundNumber: r.round_number,
    });
  }, [urgency, data.next_round, groupId]);

  return (
    <div className="rounded-3xl border border-border bg-card p-3 relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          Próxima rodada
          {urgency && (
            <span
              className="relative flex h-2 w-2"
              title={`Faltam ~${urgency.hours}h e ${urgency.slotsLeft} vaga${urgency.slotsLeft > 1 ? "s" : ""} aberta${urgency.slotsLeft > 1 ? "s" : ""}`}
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
          )}
        </h3>
        {data.next_round && (
          <Link
            to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
            params={{ groupId, seasonId: data.current_season?.id || "", roundId: data.next_round.id }}
            className="text-[10px] font-semibold text-primary"
          >
            Abrir →
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="h-14 animate-pulse rounded-xl bg-muted/30" />
      ) : data.next_round ? (
        <>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Calendar className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">
              Rodada {data.next_round.round_number}
              {data.next_round.scheduled_date && (
                <span className="text-muted-foreground font-normal">
                  {" "}· {new Date(data.next_round.scheduled_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </span>
              )}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            {data.next_round.scheduled_time && (
              <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{data.next_round.scheduled_time.slice(0, 5)}</span>
            )}
            <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{data.next_round.confirmed_count}/{data.next_round.max_players}</span>
            {urgency && (
              <span className="font-bold text-warning">⏱ ~{urgency.hours}h</span>
            )}
          </div>

          {data.next_round.confirmed_avatars.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="mt-1.5 flex items-center gap-1.5 rounded-md hover:bg-muted/30 -mx-1 px-1 py-0.5 transition-colors" title="Ver confirmados">
                  <div className="flex -space-x-1.5">
                    {data.next_round.confirmed_avatars.map((p) => (
                      <div key={p.user_id} className="ring-2 ring-card rounded-full">
                        <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="xs" />
                      </div>
                    ))}
                  </div>
                  {data.next_round.confirmed_count > data.next_round.confirmed_avatars.length && (
                    <span className="text-[9px] text-muted-foreground">
                      +{data.next_round.confirmed_count - data.next_round.confirmed_avatars.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <Tabs defaultValue="confirmed" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 rounded-none rounded-t-md h-9">
                    <TabsTrigger value="confirmed" className="text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{data.next_round.confirmed_all.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="text-[10px] gap-1">
                      <HelpCircle className="h-3 w-3" />
                      <span>{data.next_round.pending_all.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="declined" className="text-[10px] gap-1">
                      <XCircle className="h-3 w-3" />
                      <span>{data.next_round.declined_all.length}</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="confirmed" className="mt-0">
                    <PresenceList
                      empty="Ninguém confirmou ainda"
                      items={data.next_round.confirmed_all.map((p) => ({
                        ...p,
                        meta: p.confirmed_at
                          ? new Date(p.confirmed_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : null,
                      }))}
                    />
                  </TabsContent>
                  <TabsContent value="pending" className="mt-0">
                    <PresenceList
                      empty="Todos já responderam"
                      items={data.next_round.pending_all.map((p) => ({ ...p, meta: "Sem resposta" }))}
                    />
                  </TabsContent>
                  <TabsContent value="declined" className="mt-0">
                    <PresenceList
                      empty="Ninguém recusou"
                      items={data.next_round.declined_all.map((p) => ({
                        ...p,
                        meta: p.confirmed_at
                          ? new Date(p.confirmed_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : null,
                      }))}
                    />
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>
          )}

          {/* Aviso "Você ainda não respondeu" — destaca no mobile quando lista aberta + pendente */}
          {data.next_round.presence_is_open && data.next_round.presence_status === "pending" && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] font-bold text-warning animate-in fade-in">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
              </span>
              <span className="flex-1 truncate">
                Você ainda não respondeu
                {urgency && <span className="ml-1 opacity-90">· faltam ~{urgency.hours}h</span>}
              </span>
              <button
                type="button"
                onClick={handleScrollToButtons}
                className="shrink-0 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground transition hover:scale-[1.03] active:scale-95"
              >
                Responder agora
              </button>
            </div>
          )}

          <div className="mt-2" ref={presenceButtonsRef}>
            {data.next_round.presence_is_open ? (
              <div className="flex gap-1.5">
                <button
                  disabled={busy}
                  onClick={() => onPresence("confirmed")}
                  aria-label="Confirmar presença"
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 active:scale-95 ${
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
                  onClick={() => onPresence("declined")}
                  aria-label="Recusar presença"
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 active:scale-95 ${
                    data.next_round.presence_status === "declined"
                      ? "bg-destructive text-destructive-foreground"
                      : "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  }`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {data.next_round.presence_status === "declined" ? "Recusado" : "Não vou"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/20 py-1 text-[10px] text-muted-foreground">
                <Lock className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  {data.next_round.presence_opens_at
                    ? `Abre ${new Date(data.next_round.presence_opens_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : "Não aberta"}
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 py-3 text-center text-[10px] text-muted-foreground">
          Sem rodada agendada
        </div>
      )}
    </div>
  );
}

interface PresenceListItem {
  user_id: string;
  name: string;
  avatar_url: string | null;
  meta?: string | null;
}

function PresenceList({ items, empty }: { items: PresenceListItem[]; empty: string }) {
  if (!items.length) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <ul className="max-h-64 overflow-y-auto divide-y divide-border/60">
      {items.map((p) => (
        <li key={p.user_id} className="flex items-center gap-2 px-3 py-1.5">
          <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">{p.name}</p>
            {p.meta && <p className="truncate text-[10px] text-muted-foreground">{p.meta}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
