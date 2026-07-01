const SHELL_CACHE = "aicare-member-shell-v1";
const RUNTIME_CACHE = "aicare-member-runtime-v1";

const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/medvex-icon.svg",
  "/icons/medvex-maskable.svg",
  "/login",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/member/") ||
    url.pathname.startsWith("/broker/") ||
    url.pathname.startsWith("/fund/") ||
    url.pathname.includes("/auth/")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/login")));
    return;
  }

  if (["style", "script", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
  }
});

// ── Offline store-and-forward (G4) ──────────────────────────────────────
// Background Sync: on reconnect, ask open clients to flush their IndexedDB
// outbox to POST /api/v1/sync. The client owns the flush (it holds the DB
// schema + session credentials); the SW just triggers it on the "medvex-sync"
// tag. See src/lib/offline/outbox.ts.
self.addEventListener("sync", (event) => {
  if (event.tag === "medvex-sync") {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) client.postMessage({ type: "medvex-sync-flush" });
        })
    );
  }
});
