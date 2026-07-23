import { prisma } from "@/lib/prisma";
import { getClaimProcessingTimeline } from "@/server/services/claim-intake/reconciliation";
import { getReason, isRouteCode } from "@/server/services/claim-intake/reason-catalog";
import { ReprocessButton } from "./ReprocessButton";

/**
 * F6.3 — the claim's automation story (§12.2): every processing run with its
 * staged trace, the routed reason (internal text + remedy + what the provider
 * and member were told), the stored shadow proposal, and an authorized
 * reprocess. History is append-only — prior runs stay visible after edits.
 */
const STATE_BADGE: Record<string, string> = {
  PASSED: "bg-[#28A745]/10 text-[#1E7E34]",
  ROUTED: "bg-[#FFC107]/15 text-[#856404]",
  SKIPPED: "bg-[#E6E7E8] text-[#6C757D]",
  RUNNING: "bg-brand-indigo/10 text-brand-indigo",
  RETRYABLE: "bg-[#FD7E14]/10 text-[#B35A00]",
  FAILED: "bg-[#DC3545]/10 text-[#DC3545]",
  PENDING: "bg-[#E6E7E8] text-[#6C757D]",
  SHADOW_COMPLETE: "bg-brand-indigo/10 text-brand-indigo",
  AUTO_DECIDED: "bg-[#28A745]/10 text-[#1E7E34]",
  SUPERSEDED: "bg-[#E6E7E8] text-[#6C757D]",
};

function Badge({ label }: { label: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATE_BADGE[label] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

export async function AutomationPanel({ tenantId, claimId, claimStatus }: { tenantId: string; claimId: string; claimStatus: string }) {
  const tl = await getClaimProcessingTimeline(prisma, tenantId, claimId);
  if (tl.receipts.length === 0 && tl.runs.length === 0) return null; // pre-canonical claim — nothing to explain

  const decidable = !["APPROVED", "PARTIALLY_APPROVED", "DECLINED", "VOID", "SETTLED", "PAID"].includes(claimStatus);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-brand-text-heading text-sm">Automation timeline</h3>
        {decidable && <ReprocessButton claimId={claimId} />}
      </div>

      {tl.receipts.map((r) => (
        <div key={r.id} className="text-xs text-brand-text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-brand-text-body">Receipt</span>
          <span className="font-mono">{r.id}</span>
          <Badge label={r.state} />
          <span>{r.channel}</span>
          <span>{new Date(r.createdAt).toLocaleString("en-UG")}</span>
        </div>
      ))}

      {tl.runs.map((run) => {
        const route = run.routeCode && isRouteCode(run.routeCode) ? getReason(run.routeCode) : null;
        return (
          <div key={run.id} className="border border-[#EEEEEE] rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-brand-text-heading">Run {run.sequence}</span>
              <Badge label={run.state} />
              <span className="text-brand-text-muted">{run.trigger}</span>
              {run.routeCode && <span className="font-mono text-[10px] bg-[#F8F9FA] border border-[#EEEEEE] rounded px-1.5 py-0.5">{run.routeCode}</span>}
              {run.assignedQueue && <span className="text-brand-text-muted">queue: {run.assignedQueue.replace(/_/g, " ")}</span>}
            </div>

            {route && (
              <div className="text-xs space-y-1 bg-[#F8F9FA] rounded-md p-2.5">
                <p><span className="font-semibold">Why:</span> {route.internal}</p>
                <p><span className="font-semibold">Next step:</span> {route.remedy}</p>
                <p className="text-brand-text-muted"><span className="font-semibold">Provider was told:</span> {route.provider}</p>
                <p className="text-brand-text-muted"><span className="font-semibold">Member was told:</span> {route.member}</p>
              </div>
            )}

            {run.stages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {run.stages.map((s) => (
                  <span key={s.stage} title={s.reasonCode ?? undefined} className="inline-flex items-center gap-1 text-[10px] border border-[#EEEEEE] rounded-full px-2 py-0.5">
                    {s.stage.replace(/_/g, " ")} <Badge label={s.state} />
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {tl.audit.length > 0 && (
        <details className="text-xs text-brand-text-muted">
          <summary className="cursor-pointer font-semibold">Automation audit ({tl.audit.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {tl.audit.map((a, i) => (
              <li key={i}>
                <span className="font-mono">{a.action}</span> — {new Date(a.createdAt).toLocaleString("en-UG")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
