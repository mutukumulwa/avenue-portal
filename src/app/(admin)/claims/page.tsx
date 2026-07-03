import { requireRole, ROLES } from "@/lib/rbac";
import { ClaimsService } from "@/server/services/claims.service";
import { prisma } from "@/lib/prisma";
import { slaState, type ContractSlaTerms } from "@/lib/claims-sla";
import type { ClaimStatus, ServiceType } from "@prisma/client";
import { PlusCircle, ArrowRight, FileSearch, ShieldAlert, Clock } from "lucide-react";
import Link from "next/link";
import { measureAsync } from "@/lib/perf";

const PAGE_SIZE = 50;

const STATUSES: ClaimStatus[] = [
  "INCURRED", "RECEIVED", "CAPTURED", "UNDER_REVIEW",
  "APPROVED", "PARTIALLY_APPROVED", "DECLINED", "PAID", "APPEALED", "VOID",
];
const SERVICE_TYPES: ServiceType[] = ["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"];

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; providerId?: string; status?: string; serviceType?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const providerId = params.providerId || undefined;
  const status = STATUSES.includes(params.status as ClaimStatus) ? (params.status as ClaimStatus) : undefined;
  const serviceType = SERVICE_TYPES.includes(params.serviceType as ServiceType)
    ? (params.serviceType as ServiceType)
    : undefined;

  const [claims, counts, providers] = await measureAsync("claims.list.data", () =>
    Promise.all([
      ClaimsService.getClaims(tenantId, status, session.user.clientId, {
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        providerId,
        serviceType,
      }),
      ClaimsService.getClaimStatusCounts(tenantId, session.user.clientId, { providerId, serviceType, status }),
      prisma.provider.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]),
  );

  const totalPages = Math.max(1, Math.ceil(counts.total / PAGE_SIZE));
  const n = (keys: string[]) => keys.reduce((s, k) => s + (counts.byStatus[k] ?? 0), 0);

  const filterQuery = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { providerId, status: params.status, serviceType: params.serviceType, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/claims?${qs}` : "/claims";
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "APPROVED": case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "RECEIVED": case "UNDER_REVIEW": case "CAPTURED": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "INCURRED": return "bg-[#6C757D]/10 text-[#6C757D]";
      case "PARTIALLY_APPROVED": return "bg-[#FFC107]/10 text-[#856404]";
      case "DECLINED": case "VOID": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Claims</h1>
          <p className="text-brand-text-body font-body mt-1">Review and adjudicate medical insurance claims.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/claims/new/reimbursement"
            className="border border-brand-indigo text-brand-indigo hover:bg-brand-indigo/5 px-5 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 text-sm"
          >
            <PlusCircle size={16} />
            Reimbursement
          </Link>
          <Link
            href="/claims/new"
            className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm"
          >
            <PlusCircle size={18} />
            <span>New Claim</span>
          </Link>
        </div>
      </div>

      {/* Summary cards — computed via groupBy, correct on every page */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", count: counts.total, color: "bg-brand-indigo" },
          { label: "Awaiting Capture", count: n(["INCURRED", "RECEIVED"]), color: "bg-[#6C757D]" },
          { label: "In Review", count: n(["CAPTURED", "UNDER_REVIEW"]), color: "bg-[#17A2B8]" },
          { label: "Approved", count: n(["APPROVED", "PARTIALLY_APPROVED"]), color: "bg-[#28A745]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
            <p className="text-xs text-brand-text-muted font-bold uppercase">{s.label}</p>
            <p className="text-2xl font-bold text-brand-text-heading mt-1">{s.count}</p>
            <div className={`h-1 w-12 rounded ${s.color} mt-2`} />
          </div>
        ))}
      </div>

      {/* Filters — facility first (issue 2) */}
      <form method="get" action="/claims" className="flex flex-wrap items-end gap-3 rounded-lg border border-[#EEEEEE] bg-white p-3 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
          Facility
          <select name="providerId" defaultValue={providerId ?? ""} className="rounded-md border border-[#D6DCE5] px-2 py-1.5 text-sm text-brand-text-body">
            <option value="">All facilities</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
          Status
          <select name="status" defaultValue={params.status ?? ""} className="rounded-md border border-[#D6DCE5] px-2 py-1.5 text-sm text-brand-text-body">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
          Service
          <select name="serviceType" defaultValue={params.serviceType ?? ""} className="rounded-md border border-[#D6DCE5] px-2 py-1.5 text-sm text-brand-text-body">
            <option value="">All services</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
          Filter
        </button>
        {(providerId || status || serviceType) && (
          <Link href="/claims" className="text-sm font-semibold text-brand-secondary hover:underline">Clear</Link>
        )}
      </form>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        {/* Self-contained scrolling (issue 1): the table scrolls, the page doesn't. */}
        <div className="max-h-[65vh] overflow-y-auto overscroll-contain overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Claim No.</th>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Provider</th>
                <th className="px-6 py-4">Service</th>
                <th className="px-6 py-4">SLA</th>
                <th className="px-6 py-4">Billed (KES)</th>
                <th className="px-6 py-4">Approved (KES)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body text-sm">
              {claims.map((claim) => {
                const sla = slaState({
                  receivedAt: claim.receivedAt,
                  serviceType: claim.serviceType,
                  contractTerms: (claim.contract as ContractSlaTerms | null) ?? null,
                });
                const decided = ["APPROVED", "PARTIALLY_APPROVED", "DECLINED", "PAID", "VOID"].includes(claim.status);
                return (
                  <tr key={claim.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-6 py-4 font-mono text-brand-text-heading font-semibold">
                      <div className="flex items-center gap-2">
                        {claim._count.exceptionLogs > 0 && (
                          <span title="Has open exceptions"><ShieldAlert size={14} className="text-[#856404] shrink-0" /></span>
                        )}
                        {claim.claimNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-brand-text-heading">{claim.member.firstName} {claim.member.lastName}</span>
                        <span className="text-xs">{claim.member.memberNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">{claim.provider.name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold uppercase">
                        {claim.serviceType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {decided ? (
                        <span className="text-xs text-brand-text-muted">—</span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            sla.breached ? "bg-[#DC3545]/10 text-[#DC3545]" : "bg-[#E6E7E8] text-[#6C757D]"
                          }`}
                          title={sla.spec.label}
                        >
                          <Clock size={10} />
                          {sla.breached ? `${-sla.dueInHours}h over` : `${sla.dueInHours}h left`}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-brand-text-heading font-semibold">{Number(claim.billedAmount).toLocaleString()}</td>
                    <td className="px-6 py-4 font-semibold text-[#28A745]">
                      {Number(claim.approvedAmount) > 0 ? Number(claim.approvedAmount).toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full inline-flex ${statusColor(claim.status)}`}>
                        {claim.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/claims/${claim.id}`} className="text-brand-indigo hover:text-brand-secondary font-semibold inline-flex items-center gap-1">
                        Review <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {claims.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-brand-text-body">
                    <FileSearch size={32} className="mx-auto mb-3 text-[#Dcdcdc]" />
                    No claims found{providerId || status || serviceType ? " for these filters" : ". Click “New Claim” to submit one"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side pagination */}
        <div className="flex items-center justify-between border-t border-[#EEEEEE] px-6 py-3 text-sm">
          <span className="text-brand-text-muted">
            Page {page} of {totalPages} · {counts.total.toLocaleString()} claims
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={filterQuery({ page: String(page - 1) })} className="rounded-full border border-[#D6DCE5] px-4 py-1.5 font-semibold text-brand-text-body hover:border-brand-teal">
                ← Prev
              </Link>
            ) : (
              <span className="rounded-full border border-[#EEEEEE] px-4 py-1.5 text-brand-text-muted">← Prev</span>
            )}
            {page < totalPages ? (
              <Link href={filterQuery({ page: String(page + 1) })} className="rounded-full border border-[#D6DCE5] px-4 py-1.5 font-semibold text-brand-text-body hover:border-brand-teal">
                Next →
              </Link>
            ) : (
              <span className="rounded-full border border-[#EEEEEE] px-4 py-1.5 text-brand-text-muted">Next →</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
