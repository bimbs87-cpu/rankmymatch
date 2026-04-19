// Service worker for RankMyMatch.
// Keeps a pure pass-through fetch handler (required for the PWA install prompt
// without ever intercepting OAuth) and adds Web Push support for round
// notifications (lista aberta, registrar resultado, etc).
const SW_VERSION = "v5-2026-04-19-push";

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
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "RankMyMatch", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "RankMyMatch";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    tag: payload.tag || payload.type || "rankmymatch",
    renotify: true,
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab if same origin, otherwise open a new one.
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
