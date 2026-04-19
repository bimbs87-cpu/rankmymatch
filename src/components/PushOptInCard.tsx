import { Bell, BellOff, BellRing, Smartphone } from "lucide-react";
import { useState } from "react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

/**
 * Opt-in card to enable mobile/desktop push notifications.
 * Shown on the Notifications page (and anywhere we want to nudge users).
 */
export function PushOptInCard({ compact = false }: { compact?: boolean }) {
  const { supported, status, isSubscribed, busy, subscribe, unsubscribe } =
    usePushSubscription();
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!supported) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <BellOff className="h-4 w-4 shrink-0" />
          <span>
            Este navegador não suporta notificações push. No iPhone, abra o app
            instalado na tela inicial.
          </span>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <div className="flex items-center gap-2">
          <BellOff className="h-4 w-4 shrink-0" />
          <span>
            Você bloqueou notificações para este site. Reabilite nas configurações
            do navegador para receber alertas no celular.
          </span>
        </div>
      </div>
    );
  }

  if (isSubscribed && status === "granted") {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-success/30 bg-success/5 p-3">
        <div className="flex items-center gap-2 text-xs text-success">
          <BellRing className="h-4 w-4" />
          <div>
            <p className="font-semibold">Push ativado neste dispositivo</p>
            {!compact && (
              <p className="text-[11px] text-success/80">
                Você receberá um alerta sempre que uma lista abrir.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={async () => {
            await unsubscribe();
            setFeedback("Push desativado neste dispositivo.");
          }}
          disabled={busy}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          Desativar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Smartphone className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Receber alertas no celular
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Avisamos no seu telefone assim que uma lista abrir, antes que as vagas
            acabem.
          </p>
          {feedback && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{feedback}</p>
          )}
          <button
            onClick={async () => {
              const ok = await subscribe();
              setFeedback(
                ok
                  ? "Pronto! Você receberá notificações neste dispositivo."
                  : "Não foi possível ativar. Verifique a permissão no navegador.",
              );
            }}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Bell className="h-3.5 w-3.5" />
            {busy ? "Ativando..." : "Ativar push"}
          </button>
        </div>
      </div>
    </div>
  );
}
