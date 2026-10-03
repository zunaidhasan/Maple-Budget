// Maple Budget service worker (section 5).
//
// deliberately conservative cache strategy for a financial app:
// - static assets: cache-first (fast startup)
// - navigations: network-first, offline fallback page
// - /api/**: NEVER cached (sensitive financial data)

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API or authenticated app data.
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/app")) return;

  // Navigations: network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(OFFLINE_URL)) ?? Response.error();
        }
      })()
    );
    return;
  }

  // Static assets (same-origin): stale-while-revalidate.
  if (url.origin === self.location.origin && /\.(?:css|js|png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? fetchPromise;
      })()
    );
  }
});
