"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Whether a service worker already controls this page. Used to distinguish a
    // *first* install (no reload) from an *update* that replaces a stale worker
    // (reload once to pick up the fresh build — this auto-heals any client that
    // still had the old cache-first worker serving stale chunks).
    const wasControlled = !!navigator.serviceWorker.controller;
    let reloaded = false;

    const onControllerChange = () => {
      if (reloaded || !wasControlled) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      // updateViaCache: "none" forces the browser to revalidate /sw.js against
      // the network on every load instead of trusting its HTTP cache, so a fixed
      // worker is picked up promptly rather than up to 24h later.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          // If an updated worker is already waiting, promote it immediately.
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                installing.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {
          // Registration failures should not block the portal.
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
