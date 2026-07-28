import { requireRole, ROLES } from "@/lib/rbac";
import { SettlementReconciliationService } from "@/server/services/settlement-reconciliation/service";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";

/**
 * PNOS F6.9 — settlement reconciliation dashboard (operator, read-only).
 *
 * Shows the latest reconciliation run + its open exceptions (the exact I5/I6
 * mismatch per batch), with investigation status. The control NEVER auto-repairs
 * money; finance investigates and corrects out-of-band through the canonical owners.
 */

const TONE: Record<string, string> = {
  OPEN: "bg-[#DC3545]/10 text-[#DC3545]",
  INVESTIGATING: "bg-[#FFC107]/10 text-[#856404]",
  RESOLVED: "bg-[#28A745]/10 text-[#28A745]",
  ACCEPTED: "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function SettlementReconciliationDashboard() {
  const session = await requireRole(ROLES.FINANCE);
  const tenantId = session.user.tenantId;

  const [run, exceptions] = await Promise.all([
    SettlementReconciliationService.latestRun(tenantId),
    SettlementReconciliationService.listExceptions(tenantId, { limit: 200 }),
  ]);
  const open = exceptions.filter((e) => e.investigationStatus === "OPEN" || e.investigationStatus === "INVESTIGATING");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settlement" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to settlements">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <ShieldCheck size={22} /> Settlement Reconciliation
          </h1>
          <p className="text-brand-text-muted text-sm mt-1">
            Independent I5/I6 check per settled batch — line = claim = batch = voucher = successful disbursement. This control never repairs money automatically.
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 grid sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Last run</p>
          <p className="font-semibold text-brand-text-heading mt-0.5">{run?.finishedAt ? new Date(run.finishedAt).toLocaleString("en-UG") : run ? "Running…" : "Never"}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Batches checked</p>
          <p className="font-semibold text-brand-text-heading mt-0.5">{run?.batchesChecked ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Open exceptions</p>
          <p className={`font-bold mt-0.5 ${open.length ? "text-[#DC3545]" : "text-[#28A745]"}`}>{open.length}</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {exceptions.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm flex flex-col items-center gap-2">
            <ShieldCheck size={22} className="text-[#28A745]" />
            {run ? "No reconciliation exceptions — every settled batch conserves." : "No reconciliation run yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[52rem]">
              <caption className="sr-only">Settlement reconciliation exceptions</caption>
              <thead>
                <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                  <th scope="col" className="px-5 py-3">Batch</th>
                  <th scope="col" className="px-5 py-3">Type</th>
                  <th scope="col" className="px-5 py-3">Detail</th>
                  <th scope="col" className="px-5 py-3 text-right">Expected</th>
                  <th scope="col" className="px-5 py-3 text-right">Actual</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {exceptions.map((e) => (
                  <tr key={e.id} className="hover:bg-[#F8F9FA]">
                    <th scope="row" className="px-5 py-2.5 font-normal">
                      <Link href={`/settlement/${e.settlementBatchId}`} className="font-mono text-xs text-brand-indigo hover:underline">
                        {e.settlementBatchId.slice(0, 8)}
                      </Link>
                    </th>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#856404]">
                        <AlertTriangle size={12} /> {e.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-brand-text-muted">{e.detail}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{e.currency} {e.expectedAmount != null ? Number(e.expectedAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{e.currency} {e.actualAmount != null ? Number(e.actualAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE[e.investigationStatus] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>
                        {e.investigationStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
