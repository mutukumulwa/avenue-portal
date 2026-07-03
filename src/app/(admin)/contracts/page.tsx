import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileSignature, Plus, AlertTriangle, FileUp, BarChart3, LayoutGrid } from "lucide-react";
import type { Prisma, ProviderContractStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#FFC107]/10 text-[#856404]",
  UNDER_REVIEW: "bg-[#17A2B8]/10 text-[#0c6472]",
  PENDING_CLARIFICATION: "bg-[#FD7E14]/10 text-[#9a4b06]",
  APPROVED: "bg-[#6610F2]/10 text-[#4409a8]",
  ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
  SUSPENDED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  TERMINATED: "bg-[#DC3545]/10 text-[#DC3545]",
  SUPERSEDED: "bg-[#6C757D]/10 text-[#6C757D]",
  ARCHIVED: "bg-[#6C757D]/10 text-[#6C757D]",
};

const TYPE_LABEL: Record<string, string> = {
  MASTER_SERVICE_AGREEMENT: "Master Agreement",
  RATE_SCHEDULE: "Rate Schedule",
  PACKAGE_AGREEMENT: "Package Agreement",
  CASE_RATE_AGREEMENT: "Case Rate",
  RECONCILIATION_AGREEMENT: "Reconciliation",
  ADDENDUM: "Addendum",
  GOVERNMENT_SCHEME_CONTRACT: "Government Scheme",
};

const STATUS_FILTERS = ["ALL", "DRAFT", "UNDER_REVIEW", "APPROVED", "ACTIVE", "SUSPENDED", "EXPIRED"] as const;

export default async function ContractsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { status, q } = await searchParams;
  const tenantId = session.user.tenantId;

  const where: Prisma.ProviderContractWhereInput = { tenantId };
  if (status && status !== "ALL") where.status = status as ProviderContractStatus;
  if (q) {
    where.OR = [
      { contractNumber: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { externalContractRef: { contains: q, mode: "insensitive" } },
    ];
  }

  const contracts = await prisma.providerContract.findMany({
    where,
    include: {
      provider: { select: { name: true } },
      _count: { select: { tariffLines: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const now = new Date();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileSignature className="w-7 h-7 text-[#06B9AB]" />
          <div>
            <h1 className="text-2xl font-semibold text-[#000523]">Provider Contracts</h1>
            <p className="text-sm text-[#6C757D]">Digital rate agreements — capture, approve, activate, version.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/contracts/queues"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#6C757D] hover:bg-gray-50"
          >
            <LayoutGrid className="w-4 h-4" /> Queues
          </Link>
          <Link
            href="/contracts/analytics"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#6C757D] hover:bg-gray-50"
          >
            <BarChart3 className="w-4 h-4" /> Analytics
          </Link>
          <Link
            href="/contracts/import"
            className="inline-flex items-center gap-2 rounded-lg border border-[#06B9AB] px-4 py-2 text-sm font-medium text-[#06B9AB] hover:bg-[#06B9AB]/5"
          >
            <FileUp className="w-4 h-4" /> Import
          </Link>
          <Link
            href="/contracts/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#06B9AB] px-4 py-2 text-sm font-medium text-white hover:bg-[#05a598]"
          >
            <Plus className="w-4 h-4" /> New Contract
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(s => {
          const active = (status ?? "ALL") === s;
          const href = `/contracts?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          return (
            <Link
              key={s}
              href={href}
              className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-[#000523] text-white" : "bg-gray-100 text-[#6C757D] hover:bg-gray-200"}`}
            >
              {s.replace(/_/g, " ")}
            </Link>
          );
        })}
        <form action="/contracts" className="ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search number / title / ref…"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm w-64"
          />
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-[#6C757D]">
            <tr>
              <th className="px-4 py-3 font-medium">Contract</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Effective</th>
              <th className="px-4 py-3 font-medium text-right">Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contracts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#6C757D]">
                  No contracts found. <Link href="/contracts/new" className="text-[#06B9AB] underline">Create one</Link>.
                </td>
              </tr>
            )}
            {contracts.map(c => {
              const isPastEnd = c.endDate < now;
              const display = c.status === "ACTIVE" && isPastEnd ? "EXPIRED" : c.status;
              const reviewDue = c.reviewDueDate && c.reviewDueDate <= now && c.status === "ACTIVE";
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${c.id}`} className="font-medium text-[#000523] hover:text-[#06B9AB]">
                      {c.contractNumber}
                    </Link>
                    <div className="text-xs text-[#6C757D] truncate max-w-xs">{c.title}</div>
                  </td>
                  <td className="px-4 py-3 text-[#000523]">{c.provider.name}</td>
                  <td className="px-4 py-3 text-[#6C757D]">{TYPE_LABEL[c.contractType] ?? c.contractType}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[display] ?? ""}`}>
                      {display.replace(/_/g, " ")}
                    </span>
                    {reviewDue && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[#FD7E14]/10 px-2 py-0.5 text-xs text-[#9a4b06]">
                        <AlertTriangle className="w-3 h-3" /> review due
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6C757D]">
                    {c.startDate.toISOString().slice(0, 10)} → {c.endDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right text-[#6C757D]">{c._count.tariffLines}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
