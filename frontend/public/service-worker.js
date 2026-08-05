/*
 * TeamNest.ai service worker (combined).
 *
 * 1. Imports the OneSignal SW SDK so web push keeps working (this file is also
 *    registered by OneSignal via serviceWorkerPath, so we must not conflict).
 * 2. Adds a network-first app-shell cache so the app is installable as a
 *    desktop/mobile PWA and shows an offline shell when the network drops.
 *
 * Network-first is intentional: it never serves stale JS/CSS while online
 * (safe for the dev preview + HMR), and only falls back to cache offline.
 */
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {
  /* OneSignal optional — app shell still works without it */
}

const CACHE = "teamnest-shell-v4";
const SHELL = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("teamnest-shell-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Only handle our own origin; leave the backend API, CDNs and websockets alone.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (
    url.pathname.includes("hot-update") ||
    url.pathname.startsWith("/ws") ||
    url.search.includes("sockjs")
  ) {
    return;
  }

  const isAsset = /\.(js|css|png|jpg|jpeg|svg|webp|gif|woff2?|ttf|ico|json)$/.test(url.pathname);
  if (req.mode !== "navigate" && !isAsset) return;

  // The app shell (HTML navigations) and code assets (JS/CSS) must never be
  // served stale while online — a stale bundle would run an old route table
  // and mis-route deep links. Force these to bypass the HTTP cache so we
  // always execute the latest deploy; other assets (images/fonts) use default.
  const mustBeFresh = req.mode === "navigate" || /\.(js|css)$/.test(url.pathname);

  event.respondWith(
    (async () => {
      try {
        const net = await fetch(req, mustBeFresh ? { cache: "no-store" } : {});
        if (net && net.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone()).catch(() => {});
        }
        return net;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          return (
            (await caches.match("/index.html")) ||
            (await caches.match("/")) ||
            Response.error()
          );
        }
        return Response.error();
      }
    })(),
  );
});
