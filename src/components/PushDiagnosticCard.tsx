import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { PUSH_EVENT_TYPES, usePushPreferences } from "@/hooks/use-push-preferences";
import { BellRing, BellOff, CheckCircle2, XCircle, Smartphone, AlertTriangle } from "lucide-react";

interface SubRow {
  id: string;
  endpoint: string;
  user_agent: string | null;
  last_used_at: string | null;
  failure_count: number;
  created_at: string;
}

/**
 * Self-service diagnostics for push notifications.
 * Shows: subscription status, active devices, and per-event preferences,
 * so a user can quickly understand why they're not receiving pushes.
 */
export function PushDiagnosticCard() {
  const { user } = useAuth();
  const { supported, status, isSubscribed, busy, subscribe, unsubscribe } = usePushSubscription();
  const { isEnabled, toggle, loading: prefsLoading } = usePushPreferences();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, user_agent, last_used_at, failure_count, created_at")
        .eq("user_id", user.id)
        .order("last_used_at", { ascending: false });
      if (!cancelled) {
        setSubs(data || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isSubscribed]);

  if (!user) return null;

  const statusBadge = (() => {
    if (!supported) return { label: "Não suportado neste navegador", tone: "muted" as const };
    if (status === "denied") return { label: "Bloqueado pelo navegador", tone: "destructive" as const };
    if (!isSubscribed) return { label: "Desativado", tone: "warning" as const };
    return { label: "Ativo", tone: "success" as const };
  })();

  return (
    <section className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <div className="rounded-3xl border border-border bg-card p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <BellRing className="h-3 w-3" /> Diagnóstico de notificações
            </div>
            <h2 className="mt-3 font-display text-xl font-bold text-foreground">
              Você está recebendo pushs?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use esta área pra verificar o status do seu dispositivo e quais tipos de aviso estão ligados.
            </p>
          </div>
          <span
            className={
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " +
              (statusBadge.tone === "success"
                ? "bg-success/15 text-success"
                : statusBadge.tone === "warning"
                  ? "bg-warning/15 text-warning"
                  : statusBadge.tone === "destructive"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground")
            }
          >
            {statusBadge.label}
          </span>
        </div>

        {/* Action buttons */}
        {supported && (
          <div className="mt-4 flex flex-wrap gap-2">
            {!isSubscribed ? (
              <button
                onClick={() => subscribe()}
                disabled={busy || status === "denied"}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:scale-[1.02] disabled:opacity-60"
              >
                <BellRing className="h-3.5 w-3.5" />
                Ativar pushs neste dispositivo
              </button>
            ) : (
              <button
                onClick={() => unsubscribe()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                <BellOff className="h-3.5 w-3.5" />
                Desativar neste dispositivo
              </button>
            )}
            {status === "denied" && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Permissão bloqueada — libere nas configurações do navegador.
              </span>
            )}
          </div>
        )}

        {/* Subscriptions */}
        <div className="mt-6">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Dispositivos inscritos ({subs.length})
          </h3>
          {loading ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ) : subs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-5 text-center text-xs text-muted-foreground">
              Nenhum dispositivo ativo. Os pushs precisam ser ativados em cada navegador/celular que você usar.
            </div>
          ) : (
            <ul className="space-y-2">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3"
                >
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground" title={s.user_agent || ""}>
                      {shortUA(s.user_agent)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Inscrito em{" "}
                      {new Date(s.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {s.last_used_at && (
                        <>
                          {" · "}último uso{" "}
                          {new Date(s.last_used_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  {s.failure_count > 0 ? (
                    <span
                      className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive"
                      title="Falhas recentes na entrega"
                    >
                      {s.failure_count} falha{s.failure_count > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Preferences per event type */}
        <div className="mt-6">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Preferências por tipo
          </h3>
          {prefsLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-background/40">
              {PUSH_EVENT_TYPES.map((evt) => {
                const enabled = isEnabled(evt.key);
                return (
                  <li key={evt.key} className="flex items-center gap-3 px-3 py-2.5">
                    {enabled ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{evt.label}</p>
                      <p className="text-[10px] text-muted-foreground">{evt.description}</p>
                    </div>
                    <button
                      onClick={() => toggle(evt.key, !enabled)}
                      className={
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition " +
                        (enabled
                          ? "bg-success/15 text-success hover:bg-success/25"
                          : "border border-border bg-card text-muted-foreground hover:bg-accent")
                      }
                    >
                      {enabled ? "Ligado" : "Desligado"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Mesmo com as preferências ligadas, é preciso ter pelo menos 1 dispositivo inscrito acima.
          </p>
        </div>
      </div>
    </section>
  );
}

function shortUA(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  // Try to extract a friendly name
  if (/iPhone/i.test(ua)) return "iPhone (Safari)";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    if (/Chrome/i.test(ua)) return "Android (Chrome)";
    return "Android";
  }
  if (/Edg\//i.test(ua)) return "Microsoft Edge (Desktop)";
  if (/Chrome/i.test(ua)) return "Chrome (Desktop)";
  if (/Firefox/i.test(ua)) return "Firefox (Desktop)";
  if (/Safari/i.test(ua)) return "Safari (Desktop)";
  return ua.slice(0, 60);
}
