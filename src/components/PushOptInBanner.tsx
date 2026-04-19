import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const DISMISS_KEY = "push-banner-dismissed-at";
const REAPPEAR_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Discreet 1-line banner on the home screen.
 * - Hidden when push is unsupported, denied, already subscribed, or recently dismissed.
 * - Dismiss persists for 7 days in localStorage.
 */
export function PushOptInBanner() {
  const { supported, status, isSubscribed, busy, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(true); // start dismissed → only show after probing

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) {
        setDismissed(false);
        return;
      }
      const ts = Number(raw);
      if (!Number.isFinite(ts)) {
        setDismissed(false);
        return;
      }
      setDismissed(Date.now() - ts < REAPPEAR_AFTER_MS);
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!supported) return null;
  if (status === "denied") return null;
  if (isSubscribed && status === "granted") return null;
  if (dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-foreground">
        Receba alertas no celular quando uma lista abrir.
      </span>
      <button
        type="button"
        onClick={async () => {
          await subscribe();
        }}
        disabled={busy}
        className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? "..." : "Ativar"}
      </button>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
