import { useState, useEffect } from "react";
import { Link2, X, Clock, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface ClaimablePlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
  kind: "placeholder" | "former";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  claimerUserId: string;
  onClaimed: () => void;
}

export function ClaimPlayerDialog({ open, onOpenChange, groupId, claimerUserId, onClaimed }: Props) {
  const [placeholders, setPlaceholders] = useState<ClaimablePlayer[]>([]);
  const [formerMembers, setFormerMembers] = useState<ClaimablePlayer[]>([]);
  const [pendingClaims, setPendingClaims] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, groupId, claimerUserId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // All members in this group (active + removed/left)
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id, status")
        .eq("group_id", groupId);

      if (!members?.length) {
        setPlaceholders([]);
        setFormerMembers([]);
        setLoading(false);
        return;
      }

      const activeIds = members.filter((m) => m.status === "active").map((m) => m.user_id);
      const formerIds = members
        .filter((m) => m.status === "removed" || m.status === "left")
        .map((m) => m.user_id)
        .filter((id) => id !== claimerUserId);

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, avatar_url, is_placeholder")
        .in("user_id", [...activeIds, ...formerIds]);

      const placeholderList: ClaimablePlayer[] = (profiles || [])
        .filter((p) => p.is_placeholder && activeIds.includes(p.user_id))
        .map((p) => ({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, kind: "placeholder" }));

      const formerList: ClaimablePlayer[] = (profiles || [])
        .filter((p) => !p.is_placeholder && formerIds.includes(p.user_id))
        .map((p) => ({ user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, kind: "former" }));

      setPlaceholders(placeholderList);
      setFormerMembers(formerList);

      const { data: claims } = await supabase
        .from("player_claims")
        .select("placeholder_user_id")
        .eq("claimer_user_id", claimerUserId)
        .eq("group_id", groupId)
        .eq("status", "pending");

      setPendingClaims((claims || []).map((c) => c.placeholder_user_id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (placeholderUserId: string) => {
    setClaimingId(placeholderUserId);
    try {
      const { data: insertedClaim, error } = await supabase
        .from("player_claims")
        .insert({
          placeholder_user_id: placeholderUserId,
          claimer_user_id: claimerUserId,
          group_id: groupId,
          status: "pending",
        })
        .select("id")
        .maybeSingle();

      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Você já reivindicou este jogador");
        } else {
          throw error;
        }
        return;
      }

      // Notify admins (in-app + push). Best-effort, never blocks UX.
      try {
        const target =
          placeholders.find((p) => p.user_id === placeholderUserId) ||
          formerMembers.find((p) => p.user_id === placeholderUserId);
        const { data: claimerProfile } = await supabase
          .from("user_profiles")
          .select("name, nickname")
          .eq("user_id", claimerUserId)
          .maybeSingle();
        const claimerName = claimerProfile?.nickname || claimerProfile?.name || "Alguém";
        const targetName = target?.name || "um jogador";
        const { notifyGroupAdmins } = await import("@/hooks/use-notifications");
        void notifyGroupAdmins({
          groupId,
          actorId: claimerUserId,
          type: "player_claim",
          title: "Novo pedido de vínculo",
          body: `${claimerName} quer vincular sua conta a ${targetName}.`,
          url: `/admin/inbox`,
          data: {
            kind: "claim",
            claimId: insertedClaim?.id || null,
            placeholder_user_id: placeholderUserId,
          },
        });
      } catch (notifyErr) {
        console.warn("notifyGroupAdmins (claim) falhou:", notifyErr);
      }

      toast.success("Reivindicação enviada! Aguarde aprovação do admin.");
      setPendingClaims((prev) => [...prev, placeholderUserId]);
      onClaimed();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao reivindicar");
    } finally {
      setClaimingId(null);
    }
  };

  if (!open) return null;

  const renderRow = (p: ClaimablePlayer) => {
    const isPending = pendingClaims.includes(p.user_id);
    const dimmed = p.kind === "former";
    return (
      <div
        key={p.user_id}
        className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="lg" dimmed={dimmed} />
          <span className={`text-sm font-medium ${dimmed ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {p.name}
          </span>
        </div>
        {isPending ? (
          <span className="flex items-center gap-1 text-xs text-warning">
            <Clock className="h-3 w-3" />
            Pendente
          </span>
        ) : (
          <button
            onClick={() => handleClaim(p.user_id)}
            disabled={claimingId === p.user_id}
            className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
          >
            {claimingId === p.user_id ? "..." : "Sou eu"}
          </button>
        )}
      </div>
    );
  };

  const hasAny = placeholders.length > 0 || formerMembers.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative max-h-[90vh] w-[90%] max-w-sm overflow-y-auto rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Link2 className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-display text-base font-bold text-foreground">Vincular minha conta</h3>
          <p className="text-center text-xs text-muted-foreground">
            Selecione seu nome para vincular sua conta e herdar o histórico do jogador.
          </p>

          {loading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : !hasAny ? (
            <p className="text-sm text-muted-foreground">Nenhum jogador disponível para vincular</p>
          ) : (
            <div className="w-full space-y-4">
              {placeholders.length > 0 && (
                <div className="space-y-2">
                  {placeholders.map(renderRow)}
                </div>
              )}

              {formerMembers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pt-2">
                    <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Ex-membros
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Estes jogadores saíram do grupo. Reivindique apenas se este nome for você.
                  </p>
                  {formerMembers.map(renderRow)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
