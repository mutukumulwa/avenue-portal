// Medvex service worker — offline-first support for the member/provider/fund
// portals (G4). Bump VERSION on any change to this file: the activate handler
// purges every older cache, which also evicts any stale precached chunks.
//
// ⚠️ Correctness rule: static assets and navigations are **network-first**. The
// cache is only ever an *offline fallback*, never the primary source. A previous
// cache-first strategy served stale JS/CSS chunks that mismatched a freshly
// served document, crashing every page (admin included) with a client-side
// "Application error" until the SW was manually unregistered. Network-first
// guarantees an online client always gets the current build.
const VERSION = "v2";
const SHELL_CACHE = `medvex-shell-${VERSION}`;
const RUNTIME_CACHE = `medvex-runtime-${VERSION}`;

// The offline navigation fallback is scoped to the PWA portals only. Admin, API
// and auth always go to the network with no cached fallback.
const OFFLINE_SCOPES = ["/member/", "/provider/", "/fund/"];

const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/medvex-icon.svg",
  "/icons/medvex-maskable.svg",
  "/login",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  // Activate immediately so a fixed SW replaces a broken one without waiting.
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
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Allow a page to promote a waiting SW immediately (used by PWARegister).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isOfflineScope(pathname) {
  return OFFLINE_SCOPES.some((scope) => pathname.startsWith(scope));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API and auth are always live — never intercept.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/auth/")) return;

  // Navigations: network-first. Offline, fall back to the cached shell only for
  // the PWA portals; elsewhere let the network error surface normally.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        isOfflineScope(url.pathname)
          ? caches.match("/login").then((r) => r || Response.error())
          : Response.error(),
      ),
    );
    return;
  }

  // Static assets: network-first, revalidating on every request. Successful
  // responses are cached purely as an offline fallback (never served while the
  // network is reachable), so a new build can never be shadowed by a stale chunk.
  if (["style", "script", "font", "image"].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || Response.error())),
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
        }),
    );
  }
});
