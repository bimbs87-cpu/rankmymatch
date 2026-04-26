// Service worker for RankMyMatch.
// Keeps a pure pass-through fetch handler (required for the PWA install prompt
// without ever intercepting OAuth) and adds Web Push support for round
// notifications + admin moderation actions (Aprovar/Recusar inline).
const SW_VERSION = "v7-2026-04-26-android-assets";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Pure pass-through. Never call event.respondWith.
self.addEventListener("fetch", () => {
  return;
});

// ---- Web Push ----
const ADMIN_TYPES = new Set([
  "join_request",
  "player_claim",
  "admin_pending_reminder",
]);

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "RankMyMatch", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "RankMyMatch";
  const data = payload.data || {};
  const isAdminActionable =
    ADMIN_TYPES.has(payload.type) &&
    (data.requestId || data.claimId) &&
    data.kind;

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/android-icon-192.png",
    badge: payload.badge || "/android-icon-192.png",
    tag: payload.tag || payload.type || "rankmymatch",
    renotify: true,
    data: {
      url: payload.url || "/",
      type: payload.type,
      ...data,
    },
    actions: isAdminActionable
      ? [
          { action: "approve", title: "✓ Aprovar" },
          { action: "reject", title: "✗ Recusar" },
        ]
      : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

async function handleAdminAction(action, data) {
  const kind = data.kind; // "join_request" | "claim"
  const id = data.requestId || data.claimId;
  if (!id || !kind) return;

  try {
    const res = await fetch("/hooks/admin-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind, id, action }),
    });
    const ok = res.ok;
    await self.registration.showNotification(
      ok ? (action === "approve" ? "Aprovado" : "Recusado") : "Falha na ação",
      {
        body: ok
          ? "Solicitação processada com sucesso."
          : "Não foi possível processar. Abra o app para tentar novamente.",
        icon: "/android-icon-192.png",
        badge: "/android-icon-192.png",
        tag: `admin-action-result-${id}`,
      }
    );
  } catch {
    await self.registration.showNotification("Falha na ação", {
      body: "Sem conexão. Abra o app para responder.",
      icon: "/android-icon-192.png",
      badge: "/android-icon-192.png",
      tag: `admin-action-result-${id}`,
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  if (action === "approve" || action === "reject") {
    event.waitUntil(handleAdminAction(action, data));
    return;
  }

  const targetUrl = data.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) {
              try {
                await client.navigate(targetUrl);
              } catch {
                /* ignore */
              }
            }
            return;
          }
        } catch {
          /* ignore */
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
