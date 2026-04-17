// Minimal service worker required for PWA install prompt on Chrome/Android.
// IMPORTANT: never intercept OAuth callbacks — they must go straight to network.
// Bumping the version string forces old service workers to update.
const SW_VERSION = "v4-2026-04-17-ios-safe";

self.addEventListener("install", () => {
  // Activate immediately, replacing any older version.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clear ALL caches left behind by previous SW versions — old cached
      // OAuth/login responses were preventing fresh sign-ins.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Pure pass-through: do NOT call event.respondWith() for ANY request.
// The only reason this SW exists is so Chrome/Edge will offer the PWA install
// prompt (which requires a registered SW with a fetch handler). We never
// want to intercept — especially OAuth callbacks on /~oauth which iOS Safari
// is extremely sensitive about.
self.addEventListener("fetch", () => {
  // Intentionally empty — browser handles the request normally.
  return;
});
