import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ProvidersService } from "@/server/services/providers.service";
import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";
import { CheckCircle2, Clock, AlertTriangle, DollarSign } from "lucide-react";
import Link from "next/link";

const STATUS_STYLE: Record<string, string> = {
  PENDING:          "bg-[#6C757D]/10 text-[#6C757D]",
  MAKER_SUBMITTED:  "bg-[#FFC107]/10 text-[#856404]",
  CHECKER_APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  SETTLED:          "bg-brand-indigo/10 text-brand-indigo",
  REJECTED:         "bg-[#DC3545]/10 text-[#DC3545]",
};

import { redirect } from "next/navigation";

async function approveSettlementBatchAction(formData: FormData) {
  "use server";
  let errorMsg = "";
  try {
    const { requireRole, ROLES } = await import("@/lib/rbac");
    const session = await requireRole(ROLES.FINANCE);
    const batchId = formData.get("batchId") as string;
    await claimAdjudicationService.approveSettlementBatch(batchId, session.user.tenantId, session.user.id);
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "An error occurred";
  }

  if (errorMsg) {
    redirect(`/settlement?error=${encodeURIComponent(errorMsg)}`);
  }
  
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/settlement");
  redirect("/settlement");
}

async function createSettlementBatchAction(formData: FormData) {
  "use server";
  let errorMsg = "";
  try {
    const { requireRole, ROLES } = await import("@/lib/rbac");
    const session = await requireRole(ROLES.FINANCE);
    const providerId  = formData.get("providerId") as string;
    const cycleMonth  = Number(formData.get("cycleMonth"));
    const cycleYear   = Number(formData.get("cycleYear"));
    await claimAdjudicationService.createSettlementBatch(
      session.user.tenantId, providerId, cycleMonth, cycleYear, session.user.id,
    );
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "An error occurred";
  }

  if (errorMsg) {
    redirect(`/settlement?error=${encodeURIComponent(errorMsg)}`);
  }
  
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/settlement");
  redirect("/settlement");
}

async function markSettlementBatchPaidAction(formData: FormData) {
  "use server";
  let errorMsg = "";
  try {
    const { requireRole, ROLES } = await import("@/lib/rbac");
    const session = await requireRole(ROLES.FINANCE);
    const batchId = formData.get("batchId") as string;
    await claimAdjudicationService.markSettlementBatchPaid(batchId, session.user.tenantId, session.user.id);
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "An error occurred";
  }

  if (errorMsg) {
    redirect(`/settlement?error=${encodeURIComponent(errorMsg)}`);
  }
  
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/settlement");
  redirect("/settlement");
}

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string, error?: string }>;
}) {
  const session = await requireRole(ROLES.FINANCE);
  const tenantId = session.user.tenantId;
  const { status, error } = await searchParams;

  const { items: batches } = await claimAdjudicationService.listSettlementBatches(tenantId, {
    status: status as never,
  });

  const providers = await prisma.provider.findMany({
    // PR-006: settlement pays EXISTING claims — suspended/expired providers stay
    // settleable; only PENDING (never operational) is excluded.
    where: { tenantId, contractStatus: { in: [...ProvidersService.SETTLEMENT_STATUSES] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-UG")}`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Error banner from server actions */}
      {error && (
        <div className="flex items-center gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-[#856404] shrink-0" />
          <p className="text-sm font-semibold text-[#856404] flex-1">
            {error}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Provider Settlements</h1>
          <p className="text-brand-text-muted text-sm mt-1">Batch settlement of approved claims to providers</p>
        </div>
      </div>

      {/* Create new batch */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-text-heading text-sm">Create Settlement Batch</h2>
        <form action={createSettlementBatchAction} className="flex gap-3 flex-wrap">
          <select name="providerId" required
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm min-w-48 focus:ring-1 focus:ring-brand-indigo focus:outline-none">
            <option value="">Select provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="cycleMonth" defaultValue={currentMonth}
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString("en-UG", { month: "long" })}
              </option>
            ))}
          </select>
          <input name="cycleYear" type="number" defaultValue={currentYear} min={2020} max={2030}
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm w-24 focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
          <button type="submit"
            className="bg-brand-indigo text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-2">
            <DollarSign size={14} /> Create Batch
          </button>
        </form>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {["", "MAKER_SUBMITTED", "CHECKER_APPROVED", "SETTLED"].map((s) => (
          <Link key={s} href={s ? `?status=${s}` : "/settlement"}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              (status ?? "") === s
                ? "bg-brand-indigo text-white border-brand-indigo"
                : "border-[#EEEEEE] text-brand-text-muted hover:border-brand-indigo hover:text-brand-indigo"
            }`}>
            {s ? s.replace(/_/g, " ") : "All"} ({s === "" ? batches.length : batches.filter((b) => b.status === s).length})
          </Link>
        ))}
      </div>

      {/* Batch list */}
      {batches.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-brand-text-muted opacity-30" />
          <p className="text-brand-text-muted text-sm">No settlement batches found.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Cycle</th>
                <th className="px-5 py-3">Claims</th>
                <th className="px-5 py-3">Total Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Settled</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-brand-text-heading">
                    {batch.provider.name}
                  </td>
                  <td className="px-5 py-3 text-brand-text-muted">
                    {new Date(batch.cycleYear, batch.cycleMonth - 1).toLocaleString("en-UG", { month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3 text-brand-text-muted">{batch.claimCount}</td>
                  <td className="px-5 py-3 font-semibold font-mono text-brand-text-heading">
                    {fmt(Number(batch.totalAmount))}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[batch.status] ?? ""}`}>
                      {batch.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-brand-text-muted text-xs">
                    {batch.settledAt ? new Date(batch.settledAt).toLocaleDateString("en-UG") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {batch.status === "MAKER_SUBMITTED" && (
                      <form action={approveSettlementBatchAction}>
                        <input type="hidden" name="batchId" value={batch.id} />
                        <button type="submit"
                          className="text-xs font-semibold text-[#28A745] border border-[#28A745]/30 px-3 py-1 rounded-full hover:bg-[#28A745]/10 transition-colors flex items-center gap-1">
                          <CheckCircle2 size={11} /> Approve
                        </button>
                      </form>
                    )}
                    {batch.status === "CHECKER_APPROVED" && (
                      <form action={markSettlementBatchPaidAction}>
                        <input type="hidden" name="batchId" value={batch.id} />
                        <button type="submit"
                          className="text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-3 py-1 rounded-full hover:bg-brand-indigo/10 transition-colors flex items-center gap-1">
                          <DollarSign size={11} /> Mark Paid
                        </button>
                      </form>
                    )}
                    {batch.status === "SETTLED" && (
                      <span className="text-[10px] text-brand-indigo flex items-center gap-1">
                        <CheckCircle2 size={11} /> Settled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
