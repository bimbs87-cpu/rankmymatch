import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { removePushSubscriptionFn, upsertPushSubscriptionFn } from "@/lib/push.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

/**
 * Web Push subscription manager.
 *
 * - Registers /sw.js (idempotent — sw.js is also used for the PWA install prompt)
 * - Asks for Notification permission when the user clicks "Ativar"
 * - Subscribes via PushManager and persists the subscription in `push_subscriptions`
 * - Cleans up stored subscription on revoke/unsubscribe
 *
 * The VAPID public key is exposed via /api/push/vapid-public-key (server route)
 * so we never have to bundle the key into client code.
 */

type PushStatus = "unsupported" | "denied" | "default" | "granted";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.getRegistration("/"));
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export function usePushSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("default");
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  // Initial probe
  useEffect(() => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as PushStatus);

    (async () => {
      try {
        const reg = await getPushRegistration();
        if (!reg) {
          setIsSubscribed(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        setIsSubscribed(false);
      }
    })();
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      toast.error("Notificações não suportadas neste navegador");
      return false;
    }
    if (!user) {
      toast.error("Faça login para ativar notificações");
      return false;
    }
    setBusy(true);
    try {
      const reg = await getPushRegistration();
      if (!reg) throw new Error("Service worker indisponível neste navegador");

      const perm = await Notification.requestPermission();
      setStatus(perm as PushStatus);
      if (perm === "denied") {
        toast.error("Permissão negada. Habilite notificações nas configurações do navegador.");
        return false;
      }
      if (perm !== "granted") {
        toast.message("Permissão não concedida — toque em Ativar e escolha Permitir/Sempre.");
        return false;
      }

      // Get public key
      const res = await fetch("/api/push/vapid-public-key");
      if (!res.ok) throw new Error(`Falha ao obter chave pública (HTTP ${res.status})`);
      const { publicKey } = (await res.json()) as { publicKey: string };
      if (!publicKey) throw new Error("Chave pública vazia");

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyBytes = urlBase64ToUint8Array(publicKey);
        const appServerKey = new Uint8Array(keyBytes.length);
        appServerKey.set(keyBytes);
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey.buffer,
          });
        } catch (subErr) {
          console.error("[push] pushManager.subscribe failed", subErr);
          const msg = subErr instanceof Error ? subErr.message : String(subErr);
          throw new Error(`Falha no registro push: ${msg}`);
        }
      }

      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const endpoint = json.endpoint || sub.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) throw new Error("Subscription inválida");

      await upsertPushSubscriptionFn({
        headers: await getServerFnAuthHeaders(),
        data: {
          endpoint,
          p256dh,
          auth,
          userAgent: navigator.userAgent,
        },
      });

      setIsSubscribed(true);
      toast.success("Notificações ativadas! 🔔");
      return true;
    } catch (err) {
      console.error("[push] subscribe failed", err);
      const msg = err instanceof Error ? err.message : "Erro desconhecido ao ativar notificações";
      toast.error(msg);
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!supported || !user) return;
    setBusy(true);
    try {
      const reg = await getPushRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await removePushSubscriptionFn({ headers: await getServerFnAuthHeaders(), data: { endpoint } });
      }
      setIsSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  return {
    supported,
    status,
    isSubscribed,
    busy,
    subscribe,
    unsubscribe,
  };
}
