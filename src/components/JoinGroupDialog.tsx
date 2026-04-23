import { useEffect, useState } from "react";
import { UserPlus, X, Loader2, UserMinus, Ghost, Link2, Users, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { toast } from "sonner";

interface ClaimablePlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
  kind: "placeholder" | "former";
}

interface CapacityInfo {
  memberCount: number;
  memberLimit: number | null;
  isFull: boolean;
  waitlistCount: number;
  /** Predicted waitlist position if this user submits now (1-based). */
  nextPosition: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  isPublicGroup: boolean;
  userId: string;
  onJoined: () => void;
}

/**
 * Dialog shown when a user clicks "Entrar" / "Solicitar entrada".
 * Lets them optionally identify themselves as an existing placeholder OR ex-member,
 * so the admin can approve and merge the historical data.
 *
 * - Public group + no claim → joins directly as a new member.
 * - Public group + claim → creates a join request (admin must approve to merge).
 * - Private group → always creates a join request.
 */
export function JoinGroupDialog({
  open,
  onOpenChange,
  groupId,
  isPublicGroup,
  userId,
  onJoined,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placeholders, setPlaceholders] = useState<ClaimablePlayer[]>([]);
  const [formers, setFormers] = useState<ClaimablePlayer[]>([]);
  const [selected, setSelected] = useState<ClaimablePlayer | null>(null);
  const [message, setMessage] = useState("");
  const [capacity, setCapacity] = useState<CapacityInfo | null>(null);

  // Refresh capacity (member count + waitlist) — used on open + realtime updates.
  const refreshCapacity = async () => {
    try {
      const [{ data: g }, { data: cnt }, { count: wlCount }] = await Promise.all([
        supabase.from("groups").select("member_limit").eq("id", groupId).maybeSingle(),
        supabase.rpc("get_group_member_count", { _group_id: groupId }),
        supabase
          .from("group_join_requests")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("status", "pending")
          .eq("is_waitlisted", true),
      ]);
      const memberLimit = (g as any)?.member_limit ?? null;
      const memberCount = (cnt as number | null) ?? 0;
      const waitlistCount = wlCount ?? 0;
      const isFull = memberLimit != null && memberCount >= memberLimit;
      setCapacity({
        memberCount,
        memberLimit,
        isFull,
        waitlistCount,
        nextPosition: waitlistCount + 1,
      });
    } catch (e) {
      console.warn("[JoinGroupDialog] refreshCapacity failed", e);
    }
  };

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setMessage("");
      return;
    }
    let cancelled = false;
    void refreshCapacity();
    (async () => {
      setLoading(true);
      try {
        const { data: members } = await supabase
          .from("group_members")
          .select("user_id, status")
          .eq("group_id", groupId);

        if (!members?.length) {
          if (!cancelled) {
            setPlaceholders([]);
            setFormers([]);
          }
          return;
        }

        const activeIds = members.filter((m) => m.status === "active").map((m) => m.user_id);
        const formerIds = members
          .filter((m) => m.status === "removed" || m.status === "left")
          .map((m) => m.user_id)
          .filter((id) => id !== userId);

        const allIds = [...activeIds, ...formerIds];
        if (!allIds.length) {
          if (!cancelled) {
            setPlaceholders([]);
            setFormers([]);
          }
          return;
        }

        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, name, avatar_url, is_placeholder")
          .in("user_id", allIds);

        if (cancelled) return;

        const phs: ClaimablePlayer[] = (profiles || [])
          .filter((p) => p.is_placeholder && activeIds.includes(p.user_id))
          .map((p) => ({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, kind: "placeholder" }));

        const fms: ClaimablePlayer[] = (profiles || [])
          .filter((p) => !p.is_placeholder && formerIds.includes(p.user_id))
          .map((p) => ({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, kind: "former" }));

        setPlaceholders(phs);
        setFormers(fms);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Realtime: keep capacity + waitlist position fresh while dialog is open
    const channel = supabase
      .channel(`join-dialog-capacity-${groupId}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        () => { void refreshCapacity(); },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "group_join_requests", filter: `group_id=eq.${groupId}` },
        () => { void refreshCapacity(); },
      )
      .subscribe();

    const onFocus = () => { void refreshCapacity(); };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [open, groupId, userId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // All joins now go through admin approval (regardless of public/private).
      const insertData: any = {
        group_id: groupId,
        user_id: userId,
        status: "pending",
        message: message.trim() || (selected ? `Eu sou ${selected.name}` : ""),
      };
      if (selected) {
        insertData.claimed_player_id = selected.user_id;
        insertData.claimed_player_kind = selected.kind;
      }

      const { data: insertedReq, error } = await supabase
        .from("group_join_requests")
        .insert(insertData)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Você já é membro ou já solicitou.");
        } else {
          throw error;
        }
        return;
      }

      // Notify admins (in-app + push). Best-effort.
      try {
        const { data: requesterProfile } = await supabase
          .from("user_profiles")
          .select("name, nickname")
          .eq("user_id", userId)
          .maybeSingle();
        const requesterName =
          requesterProfile?.nickname || requesterProfile?.name || "Alguém";
        const body = selected
          ? `${requesterName} quer entrar e vincular a ${selected.name}.`
          : `${requesterName} quer entrar no grupo.`;
        const { notifyGroupAdmins } = await import("@/hooks/use-notifications");
        void notifyGroupAdmins({
          groupId,
          actorId: userId,
          type: "join_request",
          title: "Nova solicitação de entrada",
          body,
          url: `/admin/inbox`,
          data: {
            kind: "join_request",
            requestId: insertedReq?.id || null,
            ...(selected ? { claimed_player_id: selected.user_id } : {}),
          },
        });
      } catch (notifyErr) {
        console.warn("notifyGroupAdmins (join) falhou:", notifyErr);
      }

      const isWaitlisted = capacity?.isFull ?? false;
      const positionMsg = isWaitlisted
        ? ` Você está na posição #${capacity?.nextPosition ?? "?"} da lista de espera.`
        : "";
      toast.success(
        (selected
          ? "Solicitação enviada! O admin vai aprovar e vincular seu histórico."
          : "Solicitação enviada! O admin vai revisar.") + positionMsg,
        { duration: isWaitlisted ? 7000 : 4000 },
      );
      onJoined();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao enviar solicitação");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const hasClaimables = placeholders.length > 0 || formers.length > 0;

  const renderRow = (p: ClaimablePlayer) => {
    const isSelected = selected?.user_id === p.user_id;
    return (
      <button
        key={p.user_id}
        type="button"
        onClick={() => setSelected(isSelected ? null : p)}
        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors ${
          isSelected ? "border-primary bg-primary/10" : "border-border bg-muted/20"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <PlayerAvatar
            avatarUrl={p.kind === "former" ? null : p.avatar_url}
            name={p.kind === "former" ? "?" : p.name}
            size="md"
            dimmed={p.kind === "former"}
            className="border border-border"
          />
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${p.kind === "former" ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {p.name}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              {p.kind === "placeholder" ? (
                <>
                  <Ghost className="h-2.5 w-2.5" /> Sem conta
                </>
              ) : (
                <>
                  <UserMinus className="h-2.5 w-2.5" /> Ex-membro
                </>
              )}
            </p>
          </div>
        </div>
        {isSelected && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            Selecionado
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-[92%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <UserPlus className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">
            {capacity?.isFull ? "Entrar na lista de espera" : "Solicitar entrada"}
          </h3>
          <p className="text-center text-xs text-muted-foreground">
            {hasClaimables
              ? "Você já joga aqui? Selecione seu nome para vincular o histórico ao aprovar."
              : "Envie uma solicitação ao admin para entrar no grupo."}
          </p>

          {capacity && capacity.memberLimit != null && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                  capacity.isFull
                    ? "bg-destructive/10 text-destructive ring-destructive/30"
                    : "bg-primary/10 text-primary ring-primary/20"
                }`}
              >
                <Users className="h-2.5 w-2.5" />
                {capacity.memberCount}/{capacity.memberLimit} vagas
              </span>
              {capacity.isFull && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  Você ficará em #{capacity.nextPosition}
                </span>
              )}
            </div>
          )}
          {capacity?.isFull && (
            <p className="mt-1 text-center text-[10px] text-muted-foreground leading-snug">
              Grupo cheio. Quando alguém sair, o admin será avisado para aprovar o próximo da fila.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {placeholders.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Link2 className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Sou um destes jogadores
                    </span>
                  </div>
                  {placeholders.map(renderRow)}
                </div>
              )}

              {formers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 pt-2">
                    <UserMinus className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Ex-membros
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Estes jogadores saíram do grupo. Selecione apenas se este nome for você.
                  </p>
                  {formers.map(renderRow)}
                </div>
              )}

              <div className="pt-1">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Mensagem para o admin (opcional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder="Ex: Sou amigo do João..."
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {selected ? "Pedir vinculação" : "Enviar solicitação"}
        </button>
      </div>
    </div>
  );
}
