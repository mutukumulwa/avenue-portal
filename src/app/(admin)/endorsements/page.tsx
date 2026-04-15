import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlusCircle, FileStack, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { Suspense } from "react";

const STATUS_OPTIONS = [
  { value: "DRAFT",        label: "Draft"        },
  { value: "SUBMITTED",    label: "Submitted"    },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED",     label: "Approved"     },
  { value: "APPLIED",      label: "Applied"      },
  { value: "REJECTED",     label: "Rejected"     },
  { value: "CANCELLED",    label: "Cancelled"    },
];

const TYPE_OPTIONS = [
  { value: "MEMBER_ADDITION",   label: "Member Addition"   },
  { value: "MEMBER_DELETION",   label: "Member Deletion"   },
  { value: "DEPENDENT_ADDITION",label: "Dependent Addition"},
  { value: "DEPENDENT_DELETION",label: "Dependent Deletion"},
  { value: "PACKAGE_UPGRADE",   label: "Package Upgrade"   },
  { value: "PACKAGE_DOWNGRADE", label: "Package Downgrade" },
  { value: "SALARY_CHANGE",     label: "Salary Change"     },
  { value: "BENEFIT_MODIFICATION", label: "Benefit Mod."  },
  { value: "GROUP_DATA_CHANGE", label: "Group Data Change" },
  { value: "CORRECTION",        label: "Correction"        },
];

const STATUS_STYLE: Record<string, string> = {
  DRAFT:        "bg-[#6C757D]/10 text-[#6C757D]",
  SUBMITTED:    "bg-[#17A2B8]/10 text-[#17A2B8]",
  UNDER_REVIEW: "bg-[#FFC107]/10 text-[#856404]",
  APPROVED:     "bg-avenue-indigo/10 text-avenue-indigo",
  APPLIED:      "bg-[#28A745]/10 text-[#28A745]",
  REJECTED:     "bg-[#DC3545]/10 text-[#DC3545]",
  CANCELLED:    "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function EndorsementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);

  const { q, status, type } = await searchParams;
  const tenantId = session.user.tenantId;

  const where = {
    tenantId,
    ...(status ? { status: status as never } : {}),
    ...(type   ? { type:   type   as never } : {}),
    ...(q ? {
      OR: [
        { endorsementNumber: { contains: q, mode: "insensitive" as const } },
        { group: { name:     { contains: q, mode: "insensitive" as const } } },
        { member: { firstName:{ contains: q, mode: "insensitive" as const } } },
        { member: { lastName: { contains: q, mode: "insensitive" as const } } },
      ],
    } : {}),
  };

  const [endorsements, total] = await Promise.all([
    prisma.endorsement.findMany({
      where,
      select: {
        id: true, endorsementNumber: true, type: true,
        status: true, effectiveDate: true, proratedAmount: true,
        group:  { select: { id: true, name: true } },
        member: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.endorsement.count({ where: { tenantId } }),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Endorsements</h1>
          <p className="text-avenue-text-muted mt-1 text-sm">Manage mid-term policy adjustments and pro-rata recalculations.</p>
        </div>
        <Link
          href="/endorsements/new"
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm"
        >
          <PlusCircle size={18} />
          New Endorsement
        </Link>
      </div>

      <Suspense>
        <SearchFilterBar
          placeholder="Search by reference no., group, member…"
          resultCount={endorsements.length}
          totalCount={total}
          filters={[
            { key: "status", label: "Status", options: STATUS_OPTIONS },
            { key: "type",   label: "Type",   options: TYPE_OPTIONS   },
          ]}
        />
      </Suspense>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Group</th>
                <th className="px-6 py-4">Change Type</th>
                <th className="px-6 py-4">Affected Member</th>
                <th className="px-6 py-4">Financial Impact</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Effective</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {endorsements.map(end => (
                <tr key={end.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-avenue-text-heading">{end.endorsementNumber}</td>
                  <td className="px-6 py-4">
                    <Link href={`/groups/${end.group.id}`}
                      className="font-bold text-avenue-text-heading hover:text-avenue-indigo transition-colors">
                      {end.group.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-[10px] font-bold uppercase">
                      {end.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">
                    {end.member ? `${end.member.firstName} ${end.member.lastName}` : <span className="text-avenue-text-muted text-xs">Group-level</span>}
                  </td>
                  <td className="px-6 py-4">
                    {Number(end.proratedAmount) !== 0 ? (
                      <span className={`font-semibold ${Number(end.proratedAmount) > 0 ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                        {Number(end.proratedAmount) > 0 ? "+" : ""}KES {Math.abs(Number(end.proratedAmount)).toLocaleString("en-KE")}
                      </span>
                    ) : (
                      <span className="text-avenue-text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLE[end.status] ?? STATUS_STYLE.DRAFT}`}>
                      {end.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">
                    {new Date(end.effectiveDate).toLocaleDateString("en-KE")}
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/endorsements/${end.id}`}
                      className="text-avenue-indigo hover:text-avenue-secondary font-semibold text-xs inline-flex items-center gap-1 transition-colors">
                      Review <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
              {endorsements.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-avenue-text-muted">
                    <FileStack size={32} className="mx-auto mb-3 opacity-30" />
                    {q || status || type
                      ? "No endorsements match your search."
                      : "No endorsements found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
