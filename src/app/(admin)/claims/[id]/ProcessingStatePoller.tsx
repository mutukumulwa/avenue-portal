"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * F6.2: while a freshly submitted claim is still processing, refresh the page a
 * bounded number of times so the operator sees the routed/decided state without
 * hammering the server. Stops at a terminal state, at the bound, or on unmount.
 */
const TERMINAL = ["ROUTED", "SHADOW_COMPLETE", "AUTO_DECIDED", "FAILED"];
const INTERVAL_MS = 4000;
const MAX_POLLS = 10;

export function ProcessingStatePoller({ processingState }: { processingState: string | null }) {
  const router = useRouter();
  const polls = useRef(0);
  const [exhausted, setExhausted] = useState(false);
  const terminal = processingState != null && TERMINAL.includes(processingState);

  useEffect(() => {
    if (terminal || exhausted) return;
    const t = setInterval(() => {
      polls.current += 1;
      if (polls.current > MAX_POLLS) {
        clearInterval(t);
        setExhausted(true); // async (timer callback) — no render-phase setState
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [terminal, exhausted, router]);

  if (terminal || exhausted) return null;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-muted">
      <span className="w-2 h-2 rounded-full bg-brand-indigo animate-pulse" aria-hidden />
      Processing — this page updates automatically…
    </span>
  );
}
