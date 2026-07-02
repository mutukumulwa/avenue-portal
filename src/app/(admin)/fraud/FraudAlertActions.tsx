"use client";

import { useState, useTransition } from "react";
import { CheckCircle, ArrowUpCircle, Loader2, Search } from "lucide-react";
import { dismissAlertAction, escalateClaimAction, openInvestigationFromAlertAction } from "./actions";

export function FraudAlertActions({
  alertId,
  claimId,
  claimNumber,
}: {
  alertId: string;
  claimId: string;
  claimNumber: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"dismissed" | "escalated" | "investigating" | null>(null);

  if (done) {
    return (
      <span className={`text-[10px] font-bold uppercase ${done === "dismissed" ? "text-[#6C757D]" : done === "investigating" ? "text-brand-indigo" : "text-[#DC3545]"}`}>
        {done}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {isPending ? (
        <Loader2 size={14} className="animate-spin text-brand-text-muted" />
      ) : (
        <>
          <button
            onClick={() =>
              startTransition(async () => {
                await dismissAlertAction(alertId);
                setDone("dismissed");
              })
            }
            title="Dismiss — false positive"
            className="p-1 rounded text-[#28A745] hover:bg-[#28A745]/10 transition-colors"
          >
            <CheckCircle size={15} />
          </button>
          <button
            onClick={() =>
              startTransition(async () => {
                await openInvestigationFromAlertAction(alertId, claimId);
                setDone("investigating");
              })
            }
            title="Open a formal fraud investigation"
            className="p-1 rounded text-brand-indigo hover:bg-brand-indigo/10 transition-colors"
          >
            <Search size={15} />
          </button>
          <button
            onClick={() => {
              if (!confirm(`Escalate ${claimNumber} to fraud review? This will place the claim on hold.`)) return;
              startTransition(async () => {
                await escalateClaimAction(claimId);
                setDone("escalated");
              });
            }}
            title="Escalate — place claim on hold"
            className="p-1 rounded text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors"
          >
            <ArrowUpCircle size={15} />
          </button>
        </>
      )}
    </div>
  );
}
