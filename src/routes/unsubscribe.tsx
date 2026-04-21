import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  head: () => ({
    meta: [
      { title: "Cancelar inscrição — RankMyMatch" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Status =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "done" };

function UnsubscribePage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("token");
    if (!t) {
      setStatus({ kind: "invalid", message: "Link inválido." });
      return;
    }
    setToken(t);
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus({ kind: "invalid", message: data?.error ?? "Token inválido." });
          return;
        }
        if (data?.valid === false && data?.reason === "already_unsubscribed") {
          setStatus({ kind: "already" });
          return;
        }
        setStatus({ kind: "valid" });
      })
      .catch(() => setStatus({ kind: "invalid", message: "Erro ao validar o link." }));
  }, []);

  const handleConfirm = async () => {
    if (!token) return;
    setStatus({ kind: "submitting" });
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus({ kind: "invalid", message: data?.error ?? "Erro ao processar." });
        return;
      }
      setStatus({ kind: "done" });
    } catch {
      setStatus({ kind: "invalid", message: "Erro de rede. Tente novamente." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <MailX className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-foreground">RankMyMatch</p>
            <p className="text-xs text-muted-foreground">Preferências de e-mail</p>
          </div>
        </div>

        {status.kind === "loading" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {status.kind === "valid" && (
          <>
            <h1 className="text-xl font-bold text-foreground">Cancelar inscrição</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirme abaixo para parar de receber e-mails do RankMyMatch neste endereço.
              Você ainda receberá e-mails essenciais de segurança da conta.
            </p>
            <div className="mt-6 flex gap-2">
              <Button onClick={handleConfirm} className="flex-1">
                Confirmar cancelamento
              </Button>
              <Button asChild variant="ghost">
                <Link to="/">Voltar</Link>
              </Button>
            </div>
          </>
        )}

        {status.kind === "submitting" && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processando...
          </div>
        )}

        {status.kind === "done" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Cancelamento concluído</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Você não receberá mais e-mails neste endereço. Pode fechar esta página.
            </p>
            <Button asChild variant="ghost" className="mt-6">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </div>
        )}

        {status.kind === "already" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Já cancelado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este endereço já está fora da lista de e-mails. Nenhuma ação necessária.
            </p>
            <Button asChild variant="ghost" className="mt-6">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </div>
        )}

        {status.kind === "invalid" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Link inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">{status.message}</p>
            <Button asChild variant="ghost" className="mt-6">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
