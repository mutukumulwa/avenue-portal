"use client";

/**
 * UAT-HF P04.05 — revalidate a view that may have been superseded (DEF-062).
 *
 * "Tab A held a member profile showing ACTIVE while tab B on the same session
 * lapsed the member. Without a reload, tab A continued to display ACTIVE, and a
 * scan for staleness language (stale / out of date / refresh / changed / reload)
 * returned nothing — no banner, no revalidation prompt, no disabled actions."
 *
 * The register holds DEF-062 at S3 only because status does not gate actions on
 * a fresh page either (DEF-058), and says explicitly: "If DEF-058 is fixed
 * without also fixing this, the severity rises." So this must land with, or
 * before, the status gating in P07.06.
 *
 * Revalidation happens when the tab regains focus or comes back online — the two
 * moments a background tab becomes a foreground decision.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface StaleDataGuard {
  /** When this view's data was loaded. */
  loadedAt: Date;
  /** True once the view has been away long enough that it may be superseded. */
  mayBeStale: boolean;
  /** Re-fetch the server components for this route. */
  revalidate: () => void;
}

/** How long a tab may sit in the background before its data is suspect. */
export const STALE_AFTER_MS = 30_000;

export function useStaleDataGuard(options: { loadedAt?: Date; staleAfterMs?: number } = {}): StaleDataGuard {
  const router = useRouter();
  const [loadedAt, setLoadedAt] = useState(() => options.loadedAt ?? new Date());
  const [mayBeStale, setMayBeStale] = useState(false);
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS;

  const revalidate = useCallback(() => {
    setLoadedAt(new Date());
    setMayBeStale(false);
    router.refresh();
  }, [router]);

  useEffect(() => {
    // Only mark stale on RETURN to the tab, not on a timer. A user reading a
    // record for two minutes has not gone stale; a user coming back to a tab
    // they left open an hour ago has.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - loadedAt.getTime() < staleAfterMs) return;
      setMayBeStale(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [loadedAt, staleAfterMs]);

  return { loadedAt, mayBeStale, revalidate };
}
