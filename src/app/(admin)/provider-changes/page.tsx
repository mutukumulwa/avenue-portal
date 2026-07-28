import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ClipboardCheck } from "lucide-react";
import { ProviderMasterDataChangeService } from "@/server/services/provider-master-data-change/service";

/**
 * PNOS F7.6 — TPA operator queue for provider master-data change requests. Operator
 * (ADMIN_ONLY) reads the full row incl. INTERNAL detail; the review + maker/checker
 * + bank verify/activate controls live on the detail page. This is the work queue.
 */
const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-[#FFC107]/10 text-[#856404]", UNDER_REVIEW: "bg-brand-indigo/10 text-brand-indigo",
  INFORMATION_REQUIRED: "bg-[#FFC107]/10 text-[#856404]", PROVIDER_RESPONDED: "bg-[#17A2B8]/10 text-[#17A2B8]",
  PENDING_CHECKER: "bg-[#6f42c1]/10 text-[#6f42c1]", APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]", WITHDRAWN: "bg-[#E6E7E8] text-[#6C757D]",
};

export default async function ProviderChangesQueue() {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const reviewer = { userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string };
  const rows = await ProviderMasterDataChangeService.listForReviewer(reviewer);
  const providerIds = [...new Set(rows.map((r) => r.providerId))];
  const providers = providerIds.length ? await prisma.provider.findMany({ where: { id: { in: providerIds }, tenantId: reviewer.tenantId }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(providers.map((p) => [p.id, p.name]));
  const fmtDate = (v: Date | string | null) => (v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><ClipboardCheck size={22} /> Provider change requests</h1>
      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-brand-text-muted text-sm">No change requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[46rem]">
              <thead className="text-[11px] uppercase text-brand-text-muted"><tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-5 py-2 font-bold">Provider</th><th className="text-left px-5 py-2 font-bold">Category</th><th className="text-left px-5 py-2 font-bold">Risk</th><th className="text-left px-5 py-2 font-bold">Status</th><th className="text-left px-5 py-2 font-bold">Due</th>
              </tr></thead>
              <tbody className="divide-y divide-[#F4F4F4]">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5"><Link href={`/provider-changes/${r.id}`} className="font-semibold text-brand-indigo hover:underline">{nameOf.get(r.providerId) ?? r.providerId.slice(0, 8)}</Link></td>
                    <td className="px-5 py-2.5 text-xs capitalize">{r.category.replace(/_/g, " ").toLowerCase()}</td>
                    <td className="px-5 py-2.5 text-xs">{r.riskLevel}</td>
                    <td className="px-5 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[r.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{r.status.replace(/_/g, " ")}</span></td>
                    <td className="px-5 py-2.5 text-xs text-brand-text-muted">{fmtDate(r.dueAt)}</td>
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
