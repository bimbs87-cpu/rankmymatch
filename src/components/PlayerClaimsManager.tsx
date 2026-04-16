import { useState, useEffect } from "react";
import { Check, X, Link2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface Claim {
  id: string;
  placeholder_user_id: string;
  claimer_user_id: string;
  status: string;
  created_at: string;
  placeholderName: string;
  claimerName: string;
  claimerAvatarUrl: string | null;
}

interface Props {
  groupId: string;
  onResolved: () => void;
}

export function PlayerClaimsManager({ groupId, onResolved }: Props) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadClaims();
  }, [groupId]);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const { data: rawClaims } = await supabase
        .from("player_claims")
        .select("*")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (!rawClaims?.length) {
        setClaims([]);
        setLoading(false);
        return;
      }

      // Gather all user_ids we need profiles for
      const allIds = rawClaims.flatMap((c) => [c.placeholder_user_id, c.claimer_user_id]);
      const uniqueIds = [...new Set(allIds)];

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, name, avatar_url")
        .in("user_id", uniqueIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      setClaims(
        rawClaims.map((c) => ({
          ...c,
          placeholderName: profileMap.get(c.placeholder_user_id)?.name || "Jogador",
          claimerName: profileMap.get(c.claimer_user_id)?.name || "Usuário",
          claimerAvatarUrl: profileMap.get(c.claimer_user_id)?.avatar_url || null,
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (claim: Claim) => {
    setProcessingId(claim.id);
    try {
      const { error } = await supabase.rpc("merge_placeholder_player", {
        _placeholder_user_id: claim.placeholder_user_id,
        _real_user_id: claim.claimer_user_id,
        _group_id: groupId,
      });

      if (error) throw error;

      toast.success(`${claim.claimerName} vinculado a ${claim.placeholderName}!`);
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
      onResolved();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao aprovar vínculo");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (claim: Claim) => {
    setProcessingId(claim.id);
    try {
      const { error } = await supabase
        .from("player_claims")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", claim.id);

      if (error) throw error;

      toast.success("Reivindicação rejeitada");
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao rejeitar");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return null;
  if (claims.length === 0) return null;

  return (
    <div className="rounded-3xl border border-warning/30 bg-warning/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-bold text-foreground">Vínculos pendentes</h3>
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning">
          {claims.length}
        </span>
      </div>

      <div className="space-y-2">
        {claims.map((claim) => (
          <div
            key={claim.id}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <PlayerAvatar avatarUrl={claim.claimerAvatarUrl} name={claim.claimerName} size="md" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {claim.claimerName}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  quer vincular a <strong>{claim.placeholderName}</strong>
                </p>
              </div>
            </div>

            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => handleApprove(claim)}
                disabled={processingId === claim.id}
                className="rounded-lg bg-success/10 p-2 text-success disabled:opacity-50"
                title="Aprovar vínculo"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleReject(claim)}
                disabled={processingId === claim.id}
                className="rounded-lg bg-destructive/10 p-2 text-destructive disabled:opacity-50"
                title="Rejeitar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
