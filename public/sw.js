// Minimal service worker required for PWA install prompt on Android Chrome
// No caching — just enables the "Add to Home Screen" / "Install app" option

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests — no caching
  return;
});
