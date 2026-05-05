import { useEffect, useState } from "react";
import { Ban, AlertTriangle, Users, Trophy, Calendar, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  roundNumber?: number | null;
  scheduledDate?: string | null;
  groupName?: string | null;
  onCancelled?: () => void;
}

interface RoundStats {
  confirmedCount: number;
  declinedCount: number;
  matchesCount: number;
  matchesCompleted: number;
  seasonName: string | null;
  seasonRoundsCompleted: number;
  seasonRoundsCancelled: number;
  seasonRoundsTotal: number | null;
}

/**
 * Strong confirmation dialog for cancelling a round.
 * Shows what will be lost (confirmations, matches, ELO impact) and
 * group/season stats so the admin understands the consequences before acting.
 */
export function CancelRoundDialog({
  open,
  onOpenChange,
  roundId,
  roundNumber,
  scheduledDate,
  groupName,
  onCancelled,
}: Props) {
  const [stats, setStats] = useState<RoundStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: round } = await supabase
        .from("rounds")
        .select("season_id")
        .eq("id", roundId)
        .maybeSingle();
      const seasonId = round?.season_id || null;

      const [{ data: pres }, { data: matches }, season, seasonRounds] = await Promise.all([
        supabase.from("round_presence").select("status").eq("round_id", roundId),
        supabase.from("matches").select("id, status").eq("round_id", roundId),
        seasonId
          ? supabase.from("seasons").select("name, total_rounds").eq("id", seasonId).maybeSingle()
          : Promise.resolve({ data: null } as any),
        seasonId
          ? supabase.from("rounds").select("status").eq("season_id", seasonId)
          : Promise.resolve({ data: [] } as any),
      ]);
      if (cancelled) return;

      const confirmedCount = (pres || []).filter((p) => p.status === "confirmed").length;
      const declinedCount = (pres || []).filter((p) => p.status === "declined" || p.status === "absent").length;
      const matchesCount = (matches || []).length;
      const matchesCompleted = (matches || []).filter((m) => m.status === "completed").length;
      const seasonRoundsCompleted = ((seasonRounds as any).data || []).filter((r: any) => r.status === "completed").length;
      const seasonRoundsCancelled = ((seasonRounds as any).data || []).filter((r: any) => r.status === "cancelled").length;

      setStats({
        confirmedCount,
        declinedCount,
        matchesCount,
        matchesCompleted,
        seasonName: (season as any)?.data?.name ?? null,
        seasonRoundsCompleted,
        seasonRoundsCancelled,
        seasonRoundsTotal: (season as any)?.data?.total_rounds ?? null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, roundId]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("rounds")
        .update({ status: "cancelled" })
        .eq("id", roundId);
      if (error) throw error;
      toast.success("Rodada cancelada");
      onOpenChange(false);
      onCancelled?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar rodada");
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = scheduledDate
    ? new Date(scheduledDate + "T00:00:00").toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
    : null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <AlertDialogTitle className="text-base">
              Cancelar Rodada {roundNumber ?? ""}?
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                {groupName ? <strong>{groupName}</strong> : "Esta rodada"}
                {dateLabel ? <> · {dateLabel}</> : null} será marcada como cancelada
                e <strong>não contará</strong> para o ranking.
              </p>

              {loading && (
                <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando impacto…
                </div>
              )}

              {!loading && stats && (
                <>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-destructive">
                      O que será afetado
                    </p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        {stats.confirmedCount} confirmação{stats.confirmedCount === 1 ? "" : "ões"} de presença
                        {stats.declinedCount > 0 && <> · {stats.declinedCount} recusa{stats.declinedCount === 1 ? "" : "s"}</>}
                      </li>
                      <li className="flex items-center gap-2">
                        <Trophy className="h-3 w-3 text-muted-foreground" />
                        {stats.matchesCount} partida{stats.matchesCount === 1 ? "" : "s"} sorteada{stats.matchesCount === 1 ? "" : "s"}
                        {stats.matchesCompleted > 0 && (
                          <span className="text-warning">
                            · {stats.matchesCompleted} já concluída{stats.matchesCompleted === 1 ? "" : "s"}
                          </span>
                        )}
                      </li>
                      {stats.matchesCompleted > 0 && (
                        <li className="pt-1 text-[11px] font-medium text-warning">
                          ⚠ Resultados já lançados continuam no histórico, mas a rodada constará como cancelada.
                        </li>
                      )}
                    </ul>
                  </div>

                  {stats.seasonName && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Impacto na temporada
                      </p>
                      <p className="flex items-center gap-2 text-xs">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="font-semibold text-foreground">{stats.seasonName}</span>
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {stats.seasonRoundsCompleted} concluída{stats.seasonRoundsCompleted === 1 ? "" : "s"}
                        {" · "}
                        <span className="text-destructive">{stats.seasonRoundsCancelled + 1} cancelada{stats.seasonRoundsCancelled + 1 === 1 ? "" : "s"}</span>
                        {stats.seasonRoundsTotal != null && <> de {stats.seasonRoundsTotal}</>}
                        {" após este cancelamento"}
                      </p>
                    </div>
                  )}
                </>
              )}

              <p className="text-[11px] text-muted-foreground">
                Você poderá reabrir a rodada depois alterando o status manualmente, mas as confirmações precisarão ser refeitas.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || loading}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            {busy ? "Cancelando…" : "Cancelar rodada"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
