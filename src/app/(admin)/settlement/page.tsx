import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";
import { CheckCircle2, Clock, AlertTriangle, DollarSign } from "lucide-react";
import Link from "next/link";

const STATUS_STYLE: Record<string, string> = {
  PENDING:          "bg-[#6C757D]/10 text-[#6C757D]",
  MAKER_SUBMITTED:  "bg-[#FFC107]/10 text-[#856404]",
  CHECKER_APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  SETTLED:          "bg-avenue-indigo/10 text-avenue-indigo",
  REJECTED:         "bg-[#DC3545]/10 text-[#DC3545]",
};

async function approveSettlementBatchAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const session = await requireRole(ROLES.FINANCE);
  const batchId = formData.get("batchId") as string;
  await claimAdjudicationService.approveSettlementBatch(batchId, session.user.tenantId, session.user.id);
}

async function createSettlementBatchAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const session = await requireRole(ROLES.FINANCE);
  const providerId  = formData.get("providerId") as string;
  const cycleMonth  = Number(formData.get("cycleMonth"));
  const cycleYear   = Number(formData.get("cycleYear"));
  await claimAdjudicationService.createSettlementBatch(
    session.user.tenantId, providerId, cycleMonth, cycleYear, session.user.id,
  );
}

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(ROLES.FINANCE);
  const tenantId = session.user.tenantId;
  const { status } = await searchParams;

  const { items: batches } = await claimAdjudicationService.listSettlementBatches(tenantId, {
    status: status as never,
  });

  const providers = await prisma.provider.findMany({
    where: { tenantId, contractStatus: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Provider Settlements</h1>
          <p className="text-avenue-text-muted text-sm mt-1">Batch settlement of approved claims to providers</p>
        </div>
      </div>

      {/* Create new batch */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-avenue-text-heading text-sm">Create Settlement Batch</h2>
        <form action={createSettlementBatchAction} className="flex gap-3 flex-wrap">
          <select name="providerId" required
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm min-w-48 focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
            <option value="">Select provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="cycleMonth" defaultValue={currentMonth}
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString("en-KE", { month: "long" })}
              </option>
            ))}
          </select>
          <input name="cycleYear" type="number" defaultValue={currentYear} min={2020} max={2030}
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm w-24 focus:ring-1 focus:ring-avenue-indigo focus:outline-none" />
          <button type="submit"
            className="bg-avenue-indigo text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors flex items-center gap-2">
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
                ? "bg-avenue-indigo text-white border-avenue-indigo"
                : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo hover:text-avenue-indigo"
            }`}>
            {s ? s.replace(/_/g, " ") : "All"} ({s === "" ? batches.length : batches.filter((b) => b.status === s).length})
          </Link>
        ))}
      </div>

      {/* Batch list */}
      {batches.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-avenue-text-muted opacity-30" />
          <p className="text-avenue-text-muted text-sm">No settlement batches found.</p>
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
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">
                    {batch.provider.name}
                  </td>
                  <td className="px-5 py-3 text-avenue-text-muted">
                    {new Date(batch.cycleYear, batch.cycleMonth - 1).toLocaleString("en-KE", { month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3 text-avenue-text-muted">{batch.claimCount}</td>
                  <td className="px-5 py-3 font-semibold font-mono text-avenue-text-heading">
                    {fmt(Number(batch.totalAmount))}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[batch.status] ?? ""}`}>
                      {batch.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-avenue-text-muted text-xs">
                    {batch.settledAt ? new Date(batch.settledAt).toLocaleDateString("en-KE") : "—"}
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
                      <span className="text-[10px] text-[#28A745] flex items-center gap-1">
                        <CheckCircle2 size={11} /> Paid
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
