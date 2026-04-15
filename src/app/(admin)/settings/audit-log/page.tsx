import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { AuditLogFilters } from "./AuditLogFilters";
import { FileText } from "lucide-react";

const MODULE_COLOR: Record<string, string> = {
  CLAIMS:       "bg-avenue-indigo/10 text-avenue-indigo",
  PREAUTH:      "bg-[#17A2B8]/10 text-[#17A2B8]",
  MEMBERS:      "bg-[#28A745]/10 text-[#28A745]",
  GROUPS:       "bg-[#FFC107]/10 text-[#856404]",
  BILLING:      "bg-[#6C757D]/10 text-[#6C757D]",
  PROVIDERS:    "bg-[#F5C6B6]/50 text-[#a0522d]",
  SETTINGS:     "bg-[#292A83]/10 text-[#292A83]",
  ENDORSEMENTS: "bg-[#DC3545]/10 text-[#DC3545]",
};

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; module?: string; dateFrom?: string; dateTo?: string; q?: string; page?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const sp = await searchParams;
  const tenantId = session.user.tenantId;
  const page = Math.max(1, Number(sp.page ?? 1));

  const where = {
    user: { tenantId },
    ...(sp.userId   ? { userId: sp.userId }                                 : {}),
    ...(sp.module   ? { module: sp.module }                                  : {}),
    ...(sp.q        ? { description: { contains: sp.q, mode: "insensitive" as const } } : {}),
    ...(sp.dateFrom || sp.dateTo ? {
      createdAt: {
        ...(sp.dateFrom ? { gte: new Date(sp.dateFrom) } : {}),
        ...(sp.dateTo   ? { lte: new Date(sp.dateTo + "T23:59:59Z") } : {}),
      },
    } : {}),
  };

  const [logs, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function pageUrl(p: number) {
    const q = new URLSearchParams({ ...sp, page: String(p) });
    return `/settings/audit-log?${q}`;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Audit Log</h1>
        <p className="text-avenue-text-body text-sm mt-1">
          User activity trail — {total.toLocaleString()} record{total !== 1 ? "s" : ""}
          {Object.values(sp).some(Boolean) ? " (filtered)" : ""}.
        </p>
      </div>

      <AuditLogFilters users={users} />

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Timestamp</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Module</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 text-xs text-avenue-text-muted whitespace-nowrap font-mono">
                  {new Date(log.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "medium" })}
                </td>
                <td className="px-5 py-3">
                  <p className="font-semibold text-avenue-text-heading text-xs">{log.user.firstName} {log.user.lastName}</p>
                  <p className="text-[10px] text-avenue-text-muted">{log.user.email}</p>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${MODULE_COLOR[log.module] ?? "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                    {log.module}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-avenue-text-muted">
                  {log.action.replace(/_/g, " ")}
                </td>
                <td className="px-5 py-3 text-avenue-text-body max-w-sm truncate">{log.description}</td>
                <td className="px-5 py-3 font-mono text-xs text-avenue-text-muted">{log.ipAddress ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-avenue-text-body">
                  <FileText size={28} className="mx-auto mb-2 text-[#DCDCDC]" />
                  No audit records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-avenue-text-muted">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={pageUrl(page - 1)} className="px-3 py-1.5 border border-[#EEEEEE] rounded-lg hover:bg-[#F8F9FA] transition-colors text-avenue-text-heading">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={pageUrl(page + 1)} className="px-3 py-1.5 border border-[#EEEEEE] rounded-lg hover:bg-[#F8F9FA] transition-colors text-avenue-text-heading">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
