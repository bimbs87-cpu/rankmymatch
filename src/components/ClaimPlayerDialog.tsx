import { useState, useEffect } from "react";
import { Link2, X, Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface PlaceholderPlayer {
  user_id: string;
  name: string;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  claimerUserId: string;
  onClaimed: () => void;
}

export function ClaimPlayerDialog({ open, onOpenChange, groupId, claimerUserId, onClaimed }: Props) {
  const [placeholders, setPlaceholders] = useState<PlaceholderPlayer[]>([]);
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
      // Get placeholder members in this group
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "active");

      if (!members?.length) {
        setPlaceholders([]);
        setLoading(false);
        return;
      }

      const userIds = members.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, avatar_url")
        .in("user_id", userIds)
        .eq("is_placeholder", true);

      setPlaceholders(profiles || []);

      // Check existing claims
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
      const { error } = await supabase.from("player_claims").insert({
        placeholder_user_id: placeholderUserId,
        claimer_user_id: claimerUserId,
        group_id: groupId,
        status: "pending",
      });

      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Você já reivindicou este jogador");
        } else {
          throw error;
        }
        return;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-[90%] max-w-sm rounded-3xl border border-border bg-card p-6 animate-in zoom-in-95 duration-200">
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
          ) : placeholders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum jogador disponível para vincular</p>
          ) : (
            <div className="w-full space-y-2">
              {placeholders.map((p) => {
                const isPending = pendingClaims.includes(p.user_id);
                return (
                  <div
                    key={p.user_id}
                    className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <PlayerAvatar avatarUrl={p.avatar_url} name={p.name} size="lg" />
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
