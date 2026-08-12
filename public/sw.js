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
//
// ⚠️ Honesty rule (UAT-HF P04.03 / DEF-003): an offline navigation must never be
// answered with a cached page that is indistinguishable from the live one. v2
// precached "/login" and served it as the offline fallback, so a user in
// airplane mode saw a Sign In form byte-identical to the online capture and
// could type credentials into a page that could not possibly authenticate them.
// The fallback is now a dedicated offline shell that says so, and "/login" is
// never cached at all. VERSION was bumped to v3 specifically so `activate`
// deletes medvex-shell-v2 and with it every already-installed copy of /login.
const VERSION = "v3";
const SHELL_CACHE = `medvex-shell-${VERSION}`;
const RUNTIME_CACHE = `medvex-runtime-${VERSION}`;

// The page served for any navigation that fails offline. It is plain HTML with
// inline styles: it has to render when the app's own JS and CSS are absent.
const OFFLINE_SHELL = "/offline.html";

// Where *previously downloaded data* may still be readable offline. This scopes
// what the offline shell is allowed to promise — it does NOT decide whether the
// shell is shown. Admin is excluded: it holds no offline pack and queues no
// work, so it must not claim either.
const OFFLINE_SCOPES = ["/member/", "/provider/", "/fund/"];

const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/medvex-icon.svg",
  "/icons/medvex-maskable.svg",
  OFFLINE_SHELL,
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

  // Navigations: network-first. Offline, every route falls back to the SAME
  // dedicated offline shell — including /login and including admin.
  //
  // DEF-003: the fallback used to be the cached /login page, which is why the
  // run recorded the offline capture as identical to the online one. Serving a
  // real screen that the user cannot tell is a corpse is worse than serving
  // nothing, so the shell announces itself and offers no form to fill in.
  //
  // The shell tailors its own copy from `location.pathname` (the browser keeps
  // the ORIGINAL navigation URL when a fallback is served, so it can tell an
  // admin route from a portal route itself — see isOfflineScope in offline.html,
  // which must be kept in step with OFFLINE_SCOPES above).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_SHELL).then((r) => r || Response.error()),
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
