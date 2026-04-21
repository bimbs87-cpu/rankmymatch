import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  requestAccountDeletionFn,
  cancelAccountDeletionFn,
  getDeletionStatusFn,
} from "@/lib/delete-account.functions";
import { useAuth } from "@/hooks/use-auth";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

const CONFIRM_WORD = "EXCLUIR";
const SUPPORT_EMAIL = "suporte@rankmymatch.app";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingUntil, setPendingUntil] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const requestFn = useServerFn(requestAccountDeletionFn);
  const cancelFn = useServerFn(cancelAccountDeletionFn);
  const statusFn = useServerFn(getDeletionStatusFn);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoadingStatus(true);
    setConfirmText("");
    (async () => {
      try {
        const headers = await getServerFnAuthHeaders();
        const status = await statusFn({ headers } as Parameters<typeof statusFn>[0]);
        setPendingUntil(status.scheduledFor);
      } catch {
        setPendingUntil(null);
      } finally {
        setLoadingStatus(false);
      }
    })();
  }, [open, statusFn]);

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD && !busy;

  const handleRequest = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await requestFn({ headers } as Parameters<typeof requestFn>[0]);
      toast.success("Exclusão agendada. Você tem 7 dias para cancelar.");
      setPendingUntil(result.scheduledFor);
      try {
        await signOut();
      } catch {
        /* ignore */
      }
      navigate({ to: "/login" });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao agendar exclusão");
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await cancelFn({ headers } as Parameters<typeof cancelFn>[0]);
      toast.success("Exclusão cancelada");
      setPendingUntil(null);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) setConfirmText("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        {loadingStatus ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendingUntil ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <CalendarClock className="h-5 w-5 text-amber-500" />
              </div>
              <DialogTitle>Exclusão agendada</DialogTitle>
              <DialogDescription className="pt-2 text-sm">
                Sua conta será excluída definitivamente em{" "}
                <strong className="text-foreground">
                  {new Date(pendingUntil).toLocaleString("pt-BR", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </strong>
                . Você ainda pode cancelar até essa data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Manter agendamento
              </Button>
              <Button onClick={handleCancel} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  "Cancelar exclusão"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle>Excluir minha conta</DialogTitle>
              <DialogDescription className="space-y-2 pt-2 text-sm">
                <span className="block">
                  Sua conta entrará em <strong className="text-foreground">período de carência de 7 dias</strong>.
                  Durante esse período você pode cancelar e voltar normalmente. Após isso a exclusão é{" "}
                  <strong className="text-foreground">permanente</strong>.
                </span>
                <span className="block">O que acontece após os 7 dias:</span>
              </DialogDescription>
            </DialogHeader>

            <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
              <li>Seus dados pessoais (nome, foto, contatos) são removidos.</li>
              <li>Você é removido de todos os grupos.</li>
              <li>
                Suas partidas anteriores ficam anonimizadas como "Usuário removido"
                para preservar o histórico dos grupos.
              </li>
              <li>Notificações, assinaturas push e configurações são apagadas.</li>
              <li>Você precisará criar nova conta caso queira voltar.</li>
            </ul>

            <p className="text-xs text-muted-foreground">
              Dúvidas? Fale com o suporte:{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-medium text-foreground">
                Para confirmar, digite{" "}
                <span className="font-mono text-destructive">{CONFIRM_WORD}</span>
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                disabled={busy}
                autoComplete="off"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleRequest} disabled={!canConfirm}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Agendando...
                  </>
                ) : (
                  "Agendar exclusão (7 dias)"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
