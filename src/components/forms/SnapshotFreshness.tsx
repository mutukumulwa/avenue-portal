"use client";

/**
 * UAT-HF P04.05 — the as-of label, and the "this may have changed" prompt.
 *
 * DEF-066: nothing distinguished a live read from a cached one.
 * DEF-062: a tab holding superseded state "neither warns nor revalidates".
 *
 * P04.03 built `describeFreshness` and left it unused by any screen; this is the
 * component that puts it on one. Two states, deliberately different in weight:
 *
 *   * a snapshot's **as-of time**, always shown, quiet — it is context;
 *   * a **may-be-stale** prompt with a Refresh control, loud, shown only when the
 *     tab has been away long enough for the data to have moved.
 */

import { describeFreshness } from "@/lib/connection-state";
import { useStaleDataGuard } from "@/components/forms/useStaleDataGuard";
import { RefreshCw } from "lucide-react";

export function SnapshotFreshness({
  capturedAt,
  validUntil,
  label = "this page",
  online = true,
}: {
  /** When the server produced this data. Absent means "live, right now". */
  capturedAt?: Date | string | null;
  validUntil?: Date | string | null;
  label?: string;
  online?: boolean;
}) {
  const { mayBeStale, revalidate } = useStaleDataGuard();
  const freshness = describeFreshness({ online, capturedAt, validUntil });

  if (mayBeStale) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-freshness="STALE"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-[#FFC107]/50 bg-[#FFC107]/5 px-3 py-2 text-xs text-[#856404]"
      >
        <span>
          <strong>This may be out of date.</strong> {capitalise(label)} was loaded a while ago and
          somebody may have changed it since.
        </span>
        <button
          type="button"
          onClick={revalidate}
          className="flex items-center gap-1 rounded-full bg-[#856404] px-3 py-1 font-semibold text-white"
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>
    );
  }

  // A live read with nothing cached needs no chrome — saying "Live" on every
  // page is noise that trains people to stop reading the label that matters.
  if (freshness.trust === "LIVE") return null;

  return (
    <p className="text-xs text-brand-text-muted" data-freshness={freshness.trust}>
      {freshness.label}
    </p>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
