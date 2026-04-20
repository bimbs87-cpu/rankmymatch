/**
 * Inline pending-result widget shown on the round detail screen.
 * - Players see "You submitted — awaiting admin" with the score they sent.
 * - Admin sees the score + Approve/Reject buttons (no dialog needed).
 *   Reject opens a tiny prompt for an optional reason.
 *
 * Also exports PendingAwareSubmitButton: a context-aware "register score"
 * button that flips its label/style when there is already a pending result.
 */
import { useState, useEffect } from "react";
import { Clock, Check, X, Loader2, Eye, Edit3 } from "lucide-react";
import { toast } from "sonner";
import {
  useMatchPendingResult,
  approvePendingResult,
  rejectPendingResult,
} from "@/lib/pending-results";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useMatchPendingResult,
  approvePendingResult,
  rejectPendingResult,
} from "@/lib/pending-results";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface Props {
  matchId: string;
  seasonId: string;
  isAdmin: boolean;
  onResolved?: () => void;
  /** Compact mode: hide submitter name row */
  compact?: boolean;
}

export function MatchPendingApproval({ matchId, seasonId, isAdmin, onResolved, compact = false }: Props) {
  const { user } = useAuth();
  const { pending, refresh } = useMatchPendingResult(matchId);
  const [busy, setBusy] = useState(false);
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!pending?.submitted_by) { setSubmitterName(null); return; }
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("name, nickname")
      .eq("user_id", pending.submitted_by)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSubmitterName(data?.nickname || data?.name || null);
      });
    return () => { cancelled = true; };
  }, [pending?.submitted_by]);

  if (!pending) return null;

  const sets = (pending.sets || []).slice().sort((a, b) => a.setNumber - b.setNumber);
  const isOwn = user?.id === pending.submitted_by;

  const handleApprove = async () => {
    if (!confirm("Aprovar este placar e atualizar o ranking?")) return;
    setBusy(true);
    try {
      await approvePendingResult({
        pendingId: pending.id,
        matchId,
        seasonId,
        sets,
      });
      toast.success("Resultado aprovado!");
      refresh();
      onResolved?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao aprovar");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await rejectPendingResult(pending.id, reason.trim() || undefined);
      toast.success("Resultado rejeitado");
      setShowReject(false);
      setReason("");
      refresh();
      onResolved?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao rejeitar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-info/30 bg-info/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-bold text-info">
          <Clock className="h-3 w-3" />
          Aguardando aprovação
        </span>
        {!compact && submitterName && (
          <span className="text-[10px] text-muted-foreground">
            enviado por <span className="font-semibold text-foreground">{submitterName}</span>
          </span>
        )}
      </div>

      {/* Score preview */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Placar enviado:</span>
        {sets.map((s, i) => (
          <span
            key={i}
            className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-foreground"
          >
            {s.scoreA}–{s.scoreB}
          </span>
        ))}
      </div>

      {isAdmin ? (
        <>
          {!showReject ? (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success py-2 text-xs font-bold text-success-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Aprovar
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Rejeitar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (opcional)"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Confirmar rejeição
                </button>
                <button
                  onClick={() => { setShowReject(false); setReason(""); }}
                  disabled={busy}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          {isOwn ? (
            <>
              <Eye className="mr-1 inline h-3 w-3" />
              Você enviou este placar — aguardando o admin aprovar.
            </>
          ) : (
            <>Um jogador enviou o placar. O admin precisa aprovar para contar no ranking.</>
          )}
        </div>
      )}
    </div>
  );
}
