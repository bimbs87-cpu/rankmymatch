import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { removePushSubscriptionFn, upsertPushSubscriptionFn } from "@/lib/push.functions";

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
    if (!supported || !user) return false;
    setBusy(true);
    try {
      const reg = await getPushRegistration();
      if (!reg) throw new Error("Service worker indisponível");

      const perm = await Notification.requestPermission();
      setStatus(perm as PushStatus);
      if (perm !== "granted") return false;

      // Get public key
      const res = await fetch("/api/push/vapid-public-key");
      if (!res.ok) throw new Error("Falha ao obter chave pública");
      const { publicKey } = (await res.json()) as { publicKey: string };
      if (!publicKey) throw new Error("Chave pública vazia");

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const keyBytes = urlBase64ToUint8Array(publicKey);
        // Copy into a fresh ArrayBuffer to satisfy strict DOM typings.
        const appServerKey = new Uint8Array(keyBytes.length);
        appServerKey.set(keyBytes);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey.buffer,
        });
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
        data: {
          endpoint,
          p256dh,
          auth,
          userAgent: navigator.userAgent,
        },
      });

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[push] subscribe failed", err);
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
        await removePushSubscriptionFn({ data: { endpoint } });
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
