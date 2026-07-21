import { requireProvider } from "@/lib/provider-portal";
import { prisma } from "@/lib/prisma";
import { CaseService } from "@/server/services/case.service";
import { Layers } from "lucide-react";

function money(n: number) {
  // OBS-2: inpatient settlement is a base-currency (UGX) ledger — align with the
  // admin reconciliation panel rather than a hardcoded symbol.
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

const TONE: Record<string, string> = {
  OPEN:            "bg-[#FFC107]/10 text-[#856404]",
  PENDING_CLOSURE: "bg-[#FFC107]/10 text-[#856404]",
  CLOSED_FILED:    "bg-brand-indigo/10 text-brand-indigo",
  CANCELLED:       "bg-[#DC3545]/10 text-[#DC3545]",
};

/**
 * A6 — provider-portal reconciliation parity (§11.9). The provider sees the same
 * billed / approved / paid / outstanding / remaining-guarantee ledgers for each
 * of their admissions that the payer's finance team sees, computed from the SAME
 * source of truth (CaseService.getCaseReconciliation). Scoped to the provider's
 * OWN cases (providerId from the session) — never another facility's (A1).
 */
export default async function ProviderCases() {
  const { provider, tenantId } = await requireProvider();

  const cases = await prisma.clinicalCase.findMany({
    where: { tenantId, providerId: provider.id },
    select: {
      id: true, caseNumber: true, status: true, admissionDate: true, benefitCategory: true,
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
    },
    orderBy: { admissionDate: "desc" },
    take: 50,
  });

  // Recon per case through the identical read-model the admin/ops panel uses, so
  // the numbers match to the shilling. Bounded to the 50 most recent admissions.
  const rows = await Promise.all(
    cases.map(async (c) => ({ c, r: await CaseService.getCaseReconciliation(tenantId, c.id) })),
  );
  const openCount = rows.filter(({ c }) => c.status === "OPEN" || c.status === "PENDING_CLOSURE").length;

  return (
    <div className="space-y-6 font-ui">
      <div>
        <p className="text-xs font-bold uppercase text-brand-text-muted">Provider portal</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-brand-text-heading">
          <Layers size={22} /> Inpatient Cases
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-text-muted">
          Billed, approved, paid, outstanding and remaining guarantee for each admission — the same
          reconciliation the payer&apos;s finance team sees, updated as interim slices are cut and settled.
          {openCount > 0 ? ` ${openCount} open.` : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#EEEEEE] bg-white p-8 text-center text-sm text-brand-text-muted">
          No inpatient cases at your facility yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#EEEEEE] bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[#EEEEEE] text-left text-xs uppercase text-brand-text-muted">
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Slices</th>
                <th className="px-4 py-3 text-right">Billed</th>
                <th className="px-4 py-3 text-right">Approved</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-right">Guarantee left</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, r }) => (
                <tr key={c.id} className="border-b border-[#F5F5F5] last:border-0">
                  <td className="px-4 py-3 font-semibold text-brand-text-heading">
                    {c.caseNumber}
                    <div className="text-xs font-normal text-brand-text-muted">
                      {c.admissionDate ? new Date(c.admissionDate).toLocaleDateString("en-UG") : "—"} · {c.benefitCategory.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.member.firstName} {c.member.lastName}
                    <div className="text-xs text-brand-text-muted">{c.member.memberNumber}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{r.sliceCount}</td>
                  <td className="px-4 py-3 text-right">{money(r.billedToDate)}</td>
                  <td className="px-4 py-3 text-right">{money(r.approvedToDate)}</td>
                  <td className="px-4 py-3 text-right">{money(r.paidToDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-text-heading">{money(r.outstanding)}</td>
                  <td className="px-4 py-3 text-right">{money(r.remainingGuarantee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
