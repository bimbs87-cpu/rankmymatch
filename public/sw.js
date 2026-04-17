// Minimal service worker required for PWA install prompt.
// IMPORTANT: never intercept OAuth callbacks — they must go straight to the network.
// Bumping the version string forces old service workers (with broken behavior) to update.
const SW_VERSION = "v3-2026-04-17";

self.addEventListener("install", (event) => {
  // Activate this SW as soon as it finishes installing,
  // replacing any older version that may be intercepting requests.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clear ALL caches left behind by previous SW versions — old cached
      // OAuth/login responses were preventing fresh sign-ins on Chrome/iOS.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Bypass the service worker entirely for auth/OAuth flows and API calls.
// Returning without calling event.respondWith() lets the browser handle the
// request normally (no SW involvement at all).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never touch OAuth, Supabase, or auth-related paths.
  if (
    url.pathname.startsWith("/~oauth") ||
    url.pathname.startsWith("/auth") ||
    url.hostname.endsWith("supabase.co") ||
    url.hostname.endsWith("lovable.app") === false
  ) {
    return; // browser default
  }

  // For everything else, also pass through (no caching).
  return;
});
