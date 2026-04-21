import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { deleteAccountFn } from "@/lib/delete-account.functions";
import { useAuth } from "@/hooks/use-auth";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

const CONFIRM_WORD = "EXCLUIR";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const deleteFn = useServerFn(deleteAccountFn);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD && !busy;

  const handleDelete = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await deleteFn({ headers: await getServerFnAuthHeaders() } as Parameters<typeof deleteFn>[0]);
      toast.success("Conta excluída com sucesso");
      try {
        await signOut();
      } catch {
        /* ignore */
      }
      navigate({ to: "/login" });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao excluir conta");
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
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <DialogTitle>Excluir minha conta</DialogTitle>
          <DialogDescription className="space-y-2 pt-2 text-sm">
            <span className="block">
              Esta ação é <strong className="text-foreground">permanente</strong> e
              não pode ser desfeita.
            </span>
            <span className="block">O que acontece:</span>
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
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canConfirm}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir definitivamente"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
