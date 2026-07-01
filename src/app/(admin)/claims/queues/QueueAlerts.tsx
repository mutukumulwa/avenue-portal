"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { getIncomingClaimCountAction } from "./actions";

const POLL_MS = 20_000;

/**
 * Incoming-claim alert (G3.3). Polls the RECEIVED count; when it rises above the
 * baseline captured on load, surfaces a "N new claims" banner. Lightweight —
 * no new infra (rides the claims table + a poll), and lets the operator refresh
 * the board on demand.
 */
export function QueueAlerts({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const baseline = useRef(initialCount);
  const [incoming, setIncoming] = useState(0);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const count = await getIncomingClaimCountAction();
        if (!stop) setIncoming(Math.max(0, count - baseline.current));
      } catch {
        /* ignore transient errors */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  if (incoming <= 0) return null;

  return (
    <button
      onClick={() => router.refresh()}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-info/30 bg-brand-info/10 px-4 py-2 text-sm font-semibold text-brand-info hover:bg-brand-info/15"
    >
      <BellRing className="h-4 w-4" />
      {incoming} new claim{incoming === 1 ? "" : "s"} landed — click to refresh the board
    </button>
  );
}
