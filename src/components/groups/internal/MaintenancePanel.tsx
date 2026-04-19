import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wrench, CheckCircle2, RefreshCw, Unlock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  detectDesyncedMatchesServerFn,
  finalizeDesyncedMatchesServerFn,
  reopenMatchServerFn,
} from "@/lib/match-maintenance.functions";

interface Props {
  groupId: string;
}

interface DesyncedMatch {
  matchId: string;
  roundId: string;
  roundNumber: number | null;
  scheduledDate: string | null;
  matchNumber: number | null;
  setsCount: number;
  setsA: number;
  setsB: number;
  winner: "A" | "B" | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return d;
  }
}

export function MaintenancePanel({ groupId }: Props) {
  const detectFn = useServerFn(detectDesyncedMatchesServerFn);
  const finalizeFn = useServerFn(finalizeDesyncedMatchesServerFn);
  const reopenFn = useServerFn(reopenMatchServerFn);

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [desynced, setDesynced] = useState<DesyncedMatch[]>([]);
  const [finalizingAll, setFinalizingAll] = useState(false);
  const [finalizingOne, setFinalizingOne] = useState<string | null>(null);

  // Reopen by ID
  const [reopenId, setReopenId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);

  const scan = async (showToast = false) => {
    setScanning(true);
    try {
      const res = await detectFn({ data: { groupId } });
      setDesynced(res.desynced);
      if (showToast) {
        toast.success(
          res.desynced.length === 0
            ? "Nenhuma partida dessincronizada"
            : `${res.desynced.length} partida(s) precisa(m) de atenção`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao escanear");
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    scan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const finalizeAll = async () => {
    const eligible = desynced.filter((d) => d.winner != null);
    if (eligible.length === 0) {
      toast.error("Nenhuma partida elegível (todas têm empate em sets)");
      return;
    }
    setFinalizingAll(true);
    try {
      const res = await finalizeFn({
        data: { groupId, matchIds: eligible.map((d) => d.matchId) },
      });
      toast.success(`${res.okCount} finalizada(s)${res.failCount ? `, ${res.failCount} falha(s)` : ""}`);
      await scan(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao finalizar");
    } finally {
      setFinalizingAll(false);
    }
  };

  const finalizeOne = async (matchId: string) => {
    setFinalizingOne(matchId);
    try {
      const res = await finalizeFn({ data: { groupId, matchIds: [matchId] } });
      const r = res.results[0];
      if (r?.ok) toast.success("Partida finalizada");
      else toast.error(r?.reason || "Falha");
      await scan(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setFinalizingOne(null);
    }
  };

  const reopen = async () => {
    const id = reopenId.trim();
    if (!id) {
      toast.error("Cole o ID da partida");
      return;
    }
    setReopening(true);
    try {
      await reopenFn({ data: { matchId: id, reason: reopenReason.trim() || undefined } });
      toast.success("Partida reaberta. Regrave o placar normalmente.");
      setReopenId("");
      setReopenReason("");
      await scan(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao reabrir");
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <Wrench className="h-4 w-4" /> Manutenção
          </h3>
          <p className="text-xs text-muted-foreground">
            Detecte e corrija partidas com placar gravado mas status incorreto, ou reabra partidas dessincronizadas.
          </p>
        </div>
        <button
          onClick={() => scan(true)}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Escanear
        </button>
      </div>

      {/* === Detected matches === */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Partidas dessincronizadas
            {!loading && desynced.length > 0 && (
              <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] text-warning">{desynced.length}</span>
            )}
          </h4>
          {desynced.length > 0 && (
            <button
              onClick={finalizeAll}
              disabled={finalizingAll}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {finalizingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Finalizar automaticamente
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : desynced.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-success/30 bg-success/5 p-3 text-xs text-success">
            <CheckCircle2 className="h-4 w-4" />
            Tudo certo. Nenhuma partida com sets gravados aguardando finalização.
          </div>
        ) : (
          <ul className="space-y-2">
            {desynced.map((d) => {
              const noWinner = d.winner == null;
              return (
                <li
                  key={d.matchId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground">
                      Rodada {d.roundNumber ?? "?"} · Partida {d.matchNumber ?? "?"} · {fmtDate(d.scheduledDate)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {d.setsCount} set(s) · Placar:{" "}
                      <span className="font-mono text-foreground">
                        {d.setsA} × {d.setsB}
                      </span>{" "}
                      {noWinner ? (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-warning">
                          <AlertTriangle className="h-3 w-3" /> empate em sets
                        </span>
                      ) : (
                        <span className="ml-1 text-success">Vencedor: time {d.winner}</span>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{d.matchId}</p>
                  </div>
                  <button
                    onClick={() => finalizeOne(d.matchId)}
                    disabled={noWinner || finalizingOne === d.matchId}
                    className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                    title={noWinner ? "Resolva o empate manualmente reabrindo a partida" : "Finalizar esta partida"}
                  >
                    {finalizingOne === d.matchId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Finalizar"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* === Reopen by ID === */}
      <section className="space-y-3 rounded-2xl border border-border bg-muted/10 p-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Unlock className="h-4 w-4" /> Reabrir partida
          </h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Use quando o status ficar dessincronizado e você precisar regravar o placar. Apaga sets e eventos de Elo dessa partida — o ranking é recomputado quando você salvar de novo.
          </p>
        </div>
        <div className="space-y-2">
          <input
            value={reopenId}
            onChange={(e) => setReopenId(e.target.value)}
            placeholder="ID da partida (uuid)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Motivo (opcional, registrado em auditoria)"
            maxLength={300}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={reopen}
            disabled={reopening || !reopenId.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] font-bold text-warning hover:bg-warning/20 disabled:opacity-50"
          >
            {reopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            Reabrir partida
          </button>
        </div>
      </section>
    </div>
  );
}
