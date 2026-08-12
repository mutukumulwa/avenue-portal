"use client";

/**
 * UAT-HF P04.03 — the persistent connection surface (DEF-003, DEF-066).
 *
 * Mounted once in the root layout so there is no route that can lose it. It is
 * silent while online with an empty outbox, and unmissable otherwise: the run's
 * complaint was not that the product was offline, it was that the product never
 * said so.
 *
 * `role="status"` + `aria-live="polite"` so the change is announced without
 * stealing focus mid-task.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { describeConnection, isOfflineCapableRoute } from "@/lib/connection-state";
import { Outbox } from "@/lib/offline/outbox";

const TONE_CLASS = {
  neutral: "bg-slate-800 text-white",
  warning: "bg-amber-100 text-amber-900 border-t border-amber-300",
  info: "bg-sky-100 text-sky-900 border-t border-sky-300",
} as const;

function subscribeToConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const readOnline = () => navigator.onLine;

// Server snapshot. Optimistic on purpose: `navigator.onLine` does not exist
// during SSR, and flashing an "Offline" banner that vanishes on hydration would
// train users to ignore the one surface that has to be believed.
const assumeOnline = () => true;

export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribeToConnection, readOnline, assumeOnline);
  const [queuedCount, setQueuedCount] = useState(0);
  const pathname = usePathname() ?? "";

  // Only portal routes have an outbox; admin holds no offline pack and queues no
  // work, so it must never claim either.
  const offlineCapable = isOfflineCapableRoute(pathname);

  useEffect(() => {
    if (!offlineCapable) return;

    let cancelled = false;
    const refresh = () => {
      Outbox.pending()
        .then((ops) => {
          if (!cancelled) setQueuedCount(ops.length);
        })
        .catch(() => {
          // A queue we cannot read is left at its last known value rather than
          // replaced by a fabricated count; the offline banner still shows.
        });
    };
    refresh();

    // The service worker posts this after a Background Sync flush.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "medvex-sync-flush") refresh();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    const timer = window.setInterval(refresh, 15_000);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
  }, [offlineCapable, online]);

  const description = describeConnection({
    online,
    // Derived, not stored: navigating from a portal route to an admin one must
    // not leave a stale count behind claiming work is queued here.
    queuedCount: offlineCapable ? queuedCount : 0,
    offlineCapable,
  });

  return (
    <div
      role="status"
      aria-live="polite"
      // Always mounted so assistive tech has a stable live region to announce
      // into; emptied rather than unmounted when there is nothing to say.
      className={
        description.persistent
          ? `fixed inset-x-0 bottom-0 z-50 px-4 py-2 text-sm ${TONE_CLASS[description.tone]}`
          : "sr-only"
      }
      data-connection-state={description.state}
    >
      {description.persistent ? (
        <p className="mx-auto max-w-3xl">
          <strong>{description.label}.</strong> {description.detail}
        </p>
      ) : null}
    </div>
  );
}
