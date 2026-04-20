import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  MapPin,
  Trophy,
  TrendingUp,
  Users,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Sparkles,
  MessageSquare,
  Crown,
  Medal,
  Award,
  Settings,
  Shield,
  Globe,
  Lock,
  LogOut,
  Check,
  X as XIcon,
  Inbox,
  Link2,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useViewPlayerProfile } from "@/components/PlayerProfileViewer";
import { useGroupDashboard } from "@/hooks/use-group-dashboard";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { confirmPresence, cancelPresence } from "@/lib/round-actions";
import { leaveGroup, approveJoinRequest, rejectJoinRequest } from "@/hooks/use-groups";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Tables } from "@/integrations/supabase/types";
import { playRoundAlert } from "@/lib/round-alert-sound";
import { sendPushFn } from "@/lib/push.functions";
import { Bell as BellIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Group = Tables<"groups"> & {
  member_count?: number;
  my_role?: string | null;
};

interface Props {
  group: Group;
  onLeft?: () => void;
  onPresenceChanged?: () => void;
}

const POSITION_COLORS = [
  "text-rank-gold",
  "text-rank-silver",
  "text-rank-bronze",
];

const POSITION_ICONS = [Crown, Medal, Award];

function formatDate(dateStr: string | null, timeStr: string | null) {
  if (!dateStr) return "Data a definir";
  const d = new Date(`${dateStr}T${timeStr || "00:00"}`);
  const day = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const time = timeStr ? ` · ${timeStr.slice(0, 5)}` : "";
  return `${day}${time}`;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatOpensAt(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `hoje ${time}`;
  if (isTomorrow) return `amanhã ${time}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ${time}`;
}

export function GroupDashboardPanel({ group, onLeft, onPresenceChanged }: Props) {
  const { user } = useAuth();
  const { data, isLoading, refresh } = useGroupDashboard(group.id);
  const isAdmin = group.my_role === "admin" || group.my_role === "creator";
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resolvingReq, setResolvingReq] = useState<string | null>(null);
  const [resolvingClaim, setResolvingClaim] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);
  const [nudgeCooldownUntil, setNudgeCooldownUntil] = useState<number | null>(null);
  const [nudgeNowTs, setNudgeNowTs] = useState(Date.now());
  const [nudgePopoverOpen, setNudgePopoverOpen] = useState(false);
  const openProfile = useViewPlayerProfile();

  const NUDGE_COOLDOWN_MS = 60 * 60 * 1000; // 1h

  // Load cooldown from localStorage when round changes
  useEffect(() => {
    const rid = data.next_round?.id;
    if (!rid || typeof localStorage === "undefined") {
      setNudgeCooldownUntil(null);
      return;
    }
    const raw = localStorage.getItem(`rmm.nudge.cooldown.${rid}`);
    const ts = raw ? Number(raw) : 0;
    setNudgeCooldownUntil(ts && ts > Date.now() ? ts : null);
  }, [data.next_round?.id]);

  // Tick every 30s while a cooldown is active so the label updates
  useEffect(() => {
    if (!nudgeCooldownUntil) return;
    const id = setInterval(() => setNudgeNowTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [nudgeCooldownUntil]);

  const cooldownRemainingMs = nudgeCooldownUntil ? nudgeCooldownUntil - nudgeNowTs : 0;
  const nudgeOnCooldown = cooldownRemainingMs > 0;
  const cooldownLabel = (() => {
    if (!nudgeOnCooldown) return null;
    const mins = Math.ceil(cooldownRemainingMs / 60000);
    return mins >= 60 ? "1h" : `${mins}min`;
  })();

  async function handleNudgePending(includeDeclined: boolean) {
    if (!data.next_round) return;
    const pendingIds = data.next_round.pending_all?.map((p) => p.user_id) ?? [];
    const declinedIds = includeDeclined
      ? data.next_round.declined_all?.map((p) => p.user_id) ?? []
      : [];
    const targetIds = [...new Set([...pendingIds, ...declinedIds])];
    if (!targetIds.length) {
      toast.info("Ninguém para cutucar");
      return;
    }
    setNudgePopoverOpen(false);
    setNudging(true);
    try {
      const roundLabel = data.next_round.round_number
        ? `Rodada ${data.next_round.round_number}`
        : "Próxima rodada";
      const title = `📣 ${roundLabel}: confirme presença!`;
      const body = includeDeclined
        ? `Tem vaga abrindo? Reconsidere a presença na lista. Toque para responder.`
        : `Faltam ${targetIds.length} resposta${targetIds.length > 1 ? "s" : ""} para a lista. Toque para responder.`;

      // In-app notifications (members → RLS allows when group_id matches)
      const rows = targetIds.map((uid) => ({
        user_id: uid,
        group_id: group.id,
        type: "round_nudge",
        title,
        body,
        data: { roundId: data.next_round!.id },
      }));
      await supabase.from("notifications").insert(rows);

      // Push (best-effort, gated server-side by shared-group rule)
      void sendPushFn({
        data: {
          userIds: targetIds,
          payload: {
            title,
            body,
            url: `/groups/${group.id}`,
            type: "round_nudge",
            tag: `round_nudge:${data.next_round.id}`,
            data: { roundId: data.next_round.id },
          },
        },
      }).catch(() => {});

      // Save cooldown per round
      const until = Date.now() + NUDGE_COOLDOWN_MS;
      try {
        localStorage.setItem(`rmm.nudge.cooldown.${data.next_round.id}`, String(until));
      } catch {
        // ignore
      }
      setNudgeCooldownUntil(until);
      setNudgeNowTs(Date.now());

      toast.success(
        `Cutucada enviada para ${targetIds.length} membro${targetIds.length > 1 ? "s" : ""}`
      );
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível cutucar agora");
    } finally {
      setNudging(false);
    }
  }


  async function handleApproveClaim(claim: typeof data.pending_claims[number]) {
    if (!user) return;
    setResolvingClaim(claim.id);
    try {
      const { error } = await supabase.rpc("merge_placeholder_player", {
        _placeholder_user_id: claim.placeholder_user_id,
        _real_user_id: claim.claimer_user_id,
        _group_id: group.id,
      });
      if (error) throw error;
      toast.success(`${claim.claimer_name} vinculado a ${claim.placeholder_name}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao aprovar vínculo");
    } finally {
      setResolvingClaim(null);
    }
  }

  async function handleRejectClaim(claim: typeof data.pending_claims[number]) {
    if (!user) return;
    setResolvingClaim(claim.id);
    try {
      const { error } = await supabase
        .from("player_claims")
        .update({ status: "rejected", resolved_at: new Date().toISOString(), resolved_by: user.id })
        .eq("id", claim.id);
      if (error) throw error;
      toast.success("Vínculo recusado");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao recusar");
    } finally {
      setResolvingClaim(null);
    }
  }

  async function handleApprove(req: typeof data.pending_join_requests[number]) {
    if (!user) return;
    setResolvingReq(req.id);
    try {
      await approveJoinRequest(req.id, group.id, req.user_id, user.id);
      toast.success(`${req.user_name} entrou no grupo`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível aprovar");
    } finally {
      setResolvingReq(null);
    }
  }

  async function handleReject(req: typeof data.pending_join_requests[number]) {
    if (!user) return;
    setResolvingReq(req.id);
    try {
      await rejectJoinRequest(req.id, user.id);
      toast.success("Solicitação recusada");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível recusar");
    } finally {
      setResolvingReq(null);
    }
  }

  async function handleConfirm() {
    if (!user || !data.next_round) return;
    setPresenceLoading(true);
    try {
      await confirmPresence(data.next_round.id, user.id);
      toast.success("Presença confirmada!");
      await refresh();
      onPresenceChanged?.();
    } catch (e) {
      toast.error("Não foi possível confirmar");
    } finally {
      setPresenceLoading(false);
    }
  }

  async function handleDecline() {
    if (!user || !data.next_round) return;
    setPresenceLoading(true);
    try {
      await cancelPresence(data.next_round.id, user.id);
      toast.success("Presença recusada");
      await refresh();
      onPresenceChanged?.();
    } catch (e) {
      toast.error("Não foi possível recusar");
    } finally {
      setPresenceLoading(false);
    }
  }

  async function handleToggleForceOpen() {
    if (!data.next_round) return;
    const isCurrentlyForceOpen =
      !!data.next_round.presence_force_open_at &&
      new Date(data.next_round.presence_force_open_at) <= new Date();
    setPresenceLoading(true);
    try {
      const patch = isCurrentlyForceOpen
        ? { presence_force_open_at: null }
        : { presence_force_open_at: new Date().toISOString() };
      const { error } = await supabase
        .from("rounds")
        .update(patch as any)
        .eq("id", data.next_round.id);
      if (error) throw error;
      toast.success(isCurrentlyForceOpen ? "Lista de presença fechada" : "Lista de presença aberta");
      await refresh();
      onPresenceChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível alterar");
    } finally {
      setPresenceLoading(false);
    }
  }

  async function handleLeave() {
    if (!user) return;
    setLeaving(true);
    try {
      const { data: row, error } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", group.id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Membro não encontrado");
      await leaveGroup(row.id);
      toast.success("Você saiu do grupo");
      setShowLeave(false);
      onLeft?.();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível sair do grupo");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Cover / Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
        <div
          className="h-32 w-full bg-gradient-to-br from-primary/30 via-primary/10 to-card sm:h-40"
          style={
            group.image_url
              ? { backgroundImage: `url(${group.image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          {group.image_url && <div className="h-full w-full bg-gradient-to-t from-card via-card/50 to-transparent" />}
        </div>
        <div className="relative -mt-8 px-5 pb-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-primary/15 ring-1 ring-primary/30">
                {group.image_url ? (
                  <img src={group.image_url} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <Users className="h-7 w-7 text-primary" />
                )}
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">{group.name}</h1>
                  {group.is_public ? (
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {isAdmin && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                      <Shield className="h-2.5 w-2.5" />
                      {group.my_role === "creator" ? "Criador" : "Admin"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data.member_count} membros · {group.match_format === "singles" ? "Singles" : "Doubles"}
                </p>
              </div>
            </div>
            <div className="hidden gap-2 pb-1 sm:flex">
              <Link
                to="/groups/$groupId"
                params={{ groupId: group.id }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40"
              >
                Abrir grupo
                <ArrowRight className="h-3 w-3" />
              </Link>
              {isAdmin ? (
                <Link
                  to="/groups/$groupId"
                  params={{ groupId: group.id }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  title="Ajustes"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <button
                  onClick={() => setShowLeave(true)}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                  title="Sair do grupo"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick action mobile */}
      <div className="flex gap-2 sm:hidden">
        <Link
          to="/groups/$groupId"
          params={{ groupId: group.id }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
        >
          Abrir grupo
          <ArrowRight className="h-4 w-4" />
        </Link>
        {!isAdmin && (
          <button
            onClick={() => setShowLeave(true)}
            className="flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        )}
      </div>

      {/* Pending join requests (admin only) */}
      {isAdmin && data.pending_join_requests.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warning">
              <Inbox className="h-3 w-3" /> Solicitações pendentes
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-bold text-warning-foreground">
                {data.pending_join_requests.length}
              </span>
            </p>
            <Link
              to="/groups/$groupId"
              params={{ groupId: group.id }}
              className="text-[10px] font-bold text-warning hover:underline"
            >
              Gerenciar →
            </Link>
          </div>
          <ul className="space-y-2">
            {data.pending_join_requests.slice(0, 5).map((req) => (
              <li
                key={req.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
              >
                <PlayerAvatar avatarUrl={req.user_avatar} name={req.user_name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">{req.user_name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {req.claimed_player_name ? (
                      <>Quer assumir <span className="text-foreground">{req.claimed_player_name}</span></>
                    ) : req.message ? (
                      req.message
                    ) : (
                      <>há {timeAgo(req.created_at)}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleApprove(req)}
                    disabled={resolvingReq === req.id}
                    className="flex h-7 items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 text-[10px] font-bold text-success hover:bg-success/20 disabled:opacity-50"
                    title="Aprovar"
                  >
                    <Check className="h-3 w-3" />
                    Aceitar
                  </button>
                  <button
                    onClick={() => handleReject(req)}
                    disabled={resolvingReq === req.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/40 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    title="Recusar"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {data.pending_join_requests.length > 5 && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              +{data.pending_join_requests.length - 5} mais
            </p>
          )}
        </div>
      )}

      {/* Pending player claims (admin only) */}
      {isAdmin && data.pending_claims.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warning">
              <Link2 className="h-3 w-3" /> Vínculos pendentes
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-bold text-warning-foreground">
                {data.pending_claims.length}
              </span>
            </p>
          </div>
          <ul className="space-y-2">
            {data.pending_claims.slice(0, 5).map((claim) => (
              <li
                key={claim.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
              >
                <PlayerAvatar avatarUrl={claim.claimer_avatar} name={claim.claimer_name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">{claim.claimer_name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    Quer vincular a <span className="text-foreground">{claim.placeholder_name}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleApproveClaim(claim)}
                    disabled={resolvingClaim === claim.id}
                    className="flex h-7 items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 text-[10px] font-bold text-success hover:bg-success/20 disabled:opacity-50"
                    title="Aprovar vínculo"
                  >
                    <Check className="h-3 w-3" />
                    Vincular
                  </button>
                  <button
                    onClick={() => handleRejectClaim(claim)}
                    disabled={resolvingClaim === claim.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/40 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    title="Recusar"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {data.pending_claims.length > 5 && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              +{data.pending_claims.length - 5} mais
            </p>
          )}
        </div>
      )}

      {/* Top row: Next round + My position */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Next round */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3 w-3 text-primary" /> Próxima rodada
            </p>
            {data.next_round && (
              <Link
                to="/groups/$groupId/seasons/$seasonId/rounds/$roundId"
                params={{
                  groupId: group.id,
                  seasonId: data.current_season?.id || "",
                  roundId: data.next_round.id,
                }}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                Ver rodada →
              </Link>
            )}
          </div>
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ) : data.next_round ? (
            <div className="space-y-3">
              <div>
                <p className="font-display text-base font-bold text-foreground">
                  Rodada {data.next_round.round_number ?? "—"}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(data.next_round.scheduled_date, data.next_round.scheduled_time)}
                  </p>
                  {data.next_round.presence_is_open && (
                    <MatchStartCountdown
                      scheduledDate={data.next_round.scheduled_date}
                      scheduledTime={data.next_round.scheduled_time}
                    />
                  )}
                </div>
                {data.next_round.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {data.next_round.location}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span className="font-semibold text-foreground tabular-nums">
                    {data.next_round.confirmed_count}
                  </span>
                  /{data.next_round.max_players} confirmados
                </div>
                {data.next_round.confirmed_avatars && data.next_round.confirmed_avatars.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {data.next_round.confirmed_avatars.slice(0, 5).map((p) => (
                      <button
                        key={p.user_id}
                        type="button"
                        onClick={() => openProfile(p.user_id)}
                        title={p.name}
                        className="rounded-full ring-2 ring-card transition-transform hover:z-10 hover:scale-110"
                      >
                        <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="sm" />
                      </button>
                    ))}
                    {data.next_round.confirmed_count > 5 && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-card">
                        +{data.next_round.confirmed_count - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Response rate progress bar — % of active members who responded */}
              <ResponseProgressBar
                confirmed={data.next_round.confirmed_all?.length ?? data.next_round.confirmed_count}
                declined={data.next_round.declined_all?.length ?? 0}
                pending={data.next_round.pending_all?.length ?? 0}
                memberCount={data.member_count}
              />
              {/* Pending row — members who haven't responded yet, in a dimmed tone */}
              {data.next_round.pending_all && data.next_round.pending_all.length > 0 && (
                <div className="flex items-center gap-2 opacity-60">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Pendentes
                  </span>
                  <div className="flex -space-x-1.5">
                    {data.next_round.pending_all.slice(0, 5).map((p) => (
                      <button
                        key={p.user_id}
                        type="button"
                        onClick={() => openProfile(p.user_id)}
                        title={`${p.name} (sem resposta)`}
                        className="grayscale rounded-full ring-2 ring-card transition-transform hover:z-10 hover:scale-110 hover:grayscale-0 hover:opacity-100"
                      >
                        <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="sm" />
                      </button>
                    ))}
                    {data.next_round.pending_all.length > 5 && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-card">
                        +{data.next_round.pending_all.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">

                {data.next_round.presence_is_open ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleConfirm}
                      disabled={presenceLoading}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        data.next_round.presence_status === "confirmed"
                          ? "bg-success text-success-foreground"
                          : "border border-success/40 bg-success/10 text-success hover:bg-success/20"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {data.next_round.presence_status === "confirmed" ? "Confirmado" : "Vou"}
                    </button>
                    <button
                      onClick={handleDecline}
                      disabled={presenceLoading}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        data.next_round.presence_status === "declined" ||
                        (data.next_round.presence_status as string) === "absent"
                          ? "bg-destructive text-destructive-foreground"
                          : "border border-border bg-background/40 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                      }`}
                    >
                      <XCircle className="h-3 w-3" />
                      Não vou
                    </button>
                  </div>
                ) : (
                  <PresenceCountdown opensAt={data.next_round.presence_opens_at} />
                )}
              </div>
              {isAdmin && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border/60 bg-background/30 px-2.5 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Admin
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {data.next_round.presence_is_open &&
                      data.next_round.pending_all &&
                      data.next_round.pending_all.length > 0 && (
                        <button
                          onClick={handleNudgePending}
                          disabled={nudging}
                          className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[10px] font-bold text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
                          title={`Cutucar ${data.next_round.pending_all.length} membro(s) sem resposta`}
                        >
                          <BellIcon className="h-3 w-3" />
                          {nudging
                            ? "Cutucando…"
                            : `Cutucar pendentes (${data.next_round.pending_all.length})`}
                        </button>
                      )}
                    <button
                      onClick={handleToggleForceOpen}
                      disabled={presenceLoading}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        data.next_round.presence_force_open_at &&
                        new Date(data.next_round.presence_force_open_at) <= new Date()
                          ? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                          : "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                      }`}
                      title={
                        data.next_round.presence_force_open_at
                          ? "Fechar lista manualmente"
                          : "Abrir lista agora (antes do prazo)"
                      }
                    >
                      {data.next_round.presence_force_open_at &&
                      new Date(data.next_round.presence_force_open_at) <= new Date()
                        ? "Fechar lista"
                        : "Abrir lista agora"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <CalendarDays className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Nenhuma rodada agendada</p>
            </div>
          )}
        </div>

        {/* My position */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" /> Sua posição
            </p>
            {data.current_season && (
              <span className="text-[10px] text-muted-foreground">{data.current_season.name}</span>
            )}
          </div>
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ) : data.my_position ? (
            <div className="flex items-end gap-3">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-primary tabular-nums">
                    {data.my_position}º
                  </span>
                  <span className="text-xs text-muted-foreground">/ {data.total_ranked}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Elo <span className="font-bold text-foreground tabular-nums">{Math.round(data.my_rating || 0)}</span>
                </p>
              </div>
              <Link
                to="/ranking"
                className="ml-auto flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1.5 text-[10px] font-bold text-foreground hover:border-primary/40"
              >
                Ranking <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="py-4 text-center">
              <TrendingUp className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Você ainda não tem ranking aqui</p>
            </div>
          )}
        </div>
      </div>

      {/* Top 3 + Activity */}
      <div className="grid gap-3 lg:grid-cols-5">
        {/* Top 3 */}
        <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-3 w-3 text-primary" /> Top 3 do grupo
            </p>
          </div>
          {isLoading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
          ) : data.podium.length === 0 ? (
            <div className="py-4 text-center">
              <Trophy className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Sem ranking ainda</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.podium.map((p) => {
                const Icon = POSITION_ICONS[p.position - 1] || Trophy;
                const color = POSITION_COLORS[p.position - 1] || "text-muted-foreground";
                return (
                  <li
                    key={p.user_id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
                    <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">Elo {p.rating}</p>
                    </div>
                    <span className={`font-display text-sm font-bold tabular-nums ${color}`}>{p.position}º</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Activity */}
        <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" /> Atividade recente
            </p>
            <Link
              to="/groups/$groupId/feed"
              params={{ groupId: group.id }}
              className="text-[10px] font-bold text-primary hover:underline"
            >
              Feed →
            </Link>
          </div>
          {isLoading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
          ) : data.recent_activity.length === 0 ? (
            <div className="py-4 text-center">
              <MessageSquare className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Nenhuma atividade ainda</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.recent_activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <div className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    {a.kind === "comment" ? (
                      <MessageSquare className="h-2.5 w-2.5 text-primary" />
                    ) : (
                      <Trophy className="h-2.5 w-2.5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-tight text-foreground/90">{a.text}</p>
                    <p className="text-[9px] text-muted-foreground">há {timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Season stats */}
      {data.current_season && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-3 w-3 text-primary" /> Temporada atual
            </p>
            <Link
              to="/groups/$groupId/seasons/$seasonId"
              params={{ groupId: group.id, seasonId: data.current_season.id }}
              className="text-[10px] font-bold text-primary hover:underline"
            >
              Ver temporada →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SeasonStat
              label="Temporada"
              value={data.current_season.name}
              truncate
            />
            <SeasonStat
              label="Rodadas"
              value={`${data.current_season.rounds_done}${
                data.current_season.rounds_total ? `/${data.current_season.rounds_total}` : ""
              }`}
            />
            <SeasonStat
              label="Formato"
              value={data.current_season.match_format === "singles" ? "Singles" : "Doubles"}
            />
          </div>
        </div>
      )}

      <AlertDialog open={showLeave} onOpenChange={setShowLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Você não receberá mais notificações nem poderá ver as próximas rodadas de{" "}
              <span className="font-semibold text-foreground">{group.name}</span>. Seu histórico será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleLeave();
              }}
              disabled={leaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaving ? "Saindo…" : "Sair do grupo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeasonStat({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-sm font-bold text-foreground ${truncate ? "truncate" : "tabular-nums"}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Discrete countdown to the moment the presence list opens.
 * Updates every 30s. <2h → warning tone; <10min → pulsing warning.
 */
function PresenceCountdown({ opensAt }: { opensAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!opensAt) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-border bg-background/40 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
        <Lock className="h-3 w-3" />
        Lista fechada
      </span>
    );
  }

  const target = new Date(opensAt).getTime();
  const diffMs = target - now;
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  const isWarning = diffMs > 0 && diffMs <= 2 * 60 * 60 * 1000;
  const isImminent = diffMs > 0 && diffMs <= 10 * 60 * 1000;

  let label: string;
  if (diffMin < 1) label = "abre em instantes";
  else if (diffMin < 60) label = `abre em ${diffMin}min`;
  else if (diffMin < 60 * 24) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    label = m > 0 ? `abre em ${h}h${String(m).padStart(2, "0")}` : `abre em ${h}h`;
  } else {
    label = `abre ${formatOpensAt(opensAt)}`;
  }

  const tone = isImminent
    ? "border-warning/60 bg-warning/15 text-warning animate-pulse"
    : isWarning
    ? "border-warning/40 bg-warning/10 text-warning"
    : "border-border bg-background/40 text-muted-foreground";

  return (
    <span
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}
      title={`Lista abre em ${new Date(opensAt).toLocaleString("pt-BR")}`}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * Discrete countdown to the start of the match itself, shown alongside the
 * formatted date once the presence list is already open.
 * Updates every 30s. <2h → warning tone; <10min → pulsing warning.
 * Hides itself when the match is in the past or further than 7 days away.
 */
function MatchStartCountdown({
  scheduledDate,
  scheduledTime,
}: {
  scheduledDate: string | null;
  scheduledTime: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const alertedRef = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const target = scheduledDate
    ? new Date(`${scheduledDate}T${scheduledTime || "00:00"}`).getTime()
    : NaN;
  const diffMs = Number.isNaN(target) ? Number.POSITIVE_INFINITY : target - now;
  const isImminent =
    !Number.isNaN(target) && diffMs > -60 * 1000 && diffMs <= 10 * 60 * 1000;

  // Discrete alert (sound + vibration) once per session when entering the
  // imminent state, so users with the tab open on mobile get a gentle nudge.
  // The sound can be disabled in Profile → Push preferences (saved to
  // localStorage); vibration always fires when supported.
  useEffect(() => {
    if (!isImminent || alertedRef.current) return;
    alertedRef.current = true;
    playRoundAlert();
  }, [isImminent]);

  if (!scheduledDate || Number.isNaN(target)) return null;
  // Hide if past or > 7 days away
  if (diffMs <= -60 * 60 * 1000) return null;
  if (diffMs > 7 * 24 * 60 * 60 * 1000) return null;

  let label: string;
  if (diffMs <= 0) label = "começa agora";
  else {
    const totalMin = Math.round(diffMs / 60000);
    if (totalMin < 60) label = `em ${totalMin}min`;
    else if (totalMin < 60 * 24) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      label = m > 0 ? `em ${h}h${String(m).padStart(2, "0")}` : `em ${h}h`;
    } else {
      const days = Math.round(totalMin / (60 * 24));
      label = days === 1 ? "amanhã" : `em ${days} dias`;
    }
  }

  const isWarning = diffMs > 0 && diffMs <= 2 * 60 * 60 * 1000;
  const tone = isImminent
    ? "border-warning/60 bg-warning/15 text-warning animate-pulse"
    : isWarning
    ? "border-warning/40 bg-warning/10 text-warning"
    : "border-primary/30 bg-primary/10 text-primary";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
      title={`Início da rodada: ${new Date(target).toLocaleString("pt-BR")}`}
    >
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

/**
 * Visual response-rate bar for the next round: % of active members who have
 * responded (confirmed or declined) out of the total. Confirmed shows in
 * success tone, declined in muted destructive — pending is the empty space.
 */
function ResponseProgressBar({
  confirmed,
  declined,
  pending,
  memberCount,
}: {
  confirmed: number;
  declined: number;
  pending: number;
  memberCount: number;
}) {
  const total = Math.max(memberCount, confirmed + declined + pending);
  if (total <= 0) return null;
  const responded = confirmed + declined;
  const pct = Math.round((responded / total) * 100);
  const confirmedPct = (confirmed / total) * 100;
  const declinedPct = (declined / total) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          <span className="font-bold text-foreground tabular-nums">{responded}</span>
          /{total} responderam
        </span>
        <span className="font-bold tabular-nums text-foreground">{pct}%</span>
      </div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% de membros responderam`}
        title={`✓ ${confirmed} confirmados · ✗ ${declined} recusaram · ${pending} pendentes`}
      >
        <div
          className="h-full bg-success transition-all"
          style={{ width: `${confirmedPct}%` }}
        />
        <div
          className="h-full bg-destructive/50 transition-all"
          style={{ width: `${declinedPct}%` }}
        />
      </div>
    </div>
  );
}
