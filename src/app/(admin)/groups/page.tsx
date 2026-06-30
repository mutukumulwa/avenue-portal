import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlusCircle, Building2, Users, ChevronRight } from "lucide-react";
import Link from "next/link";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { Suspense } from "react";

const STATUS_OPTIONS = [
  { value: "PROSPECT",   label: "Prospect"   },
  { value: "ACTIVE",     label: "Active"     },
  { value: "PENDING",    label: "Pending"    },
  { value: "SUSPENDED",  label: "Suspended"  },
  { value: "LAPSED",     label: "Lapsed"     },
  { value: "TERMINATED", label: "Terminated" },
];

const statusColor = (s: string) => {
  switch (s) {
    case "PROSPECT":  return "bg-[#6C757D]/10 text-[#6C757D]";
    case "ACTIVE":    return "bg-[#28A745]/10 text-[#28A745]";
    case "PENDING":   return "bg-[#17A2B8]/10 text-[#17A2B8]";
    case "SUSPENDED": return "bg-[#FFC107]/10 text-[#856404]";
    default:          return "bg-[#DC3545]/10 text-[#DC3545]";
  }
};

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);

  const { q, status } = await searchParams;
  const tenantId = session.user.tenantId;

  const where = {
    tenantId,
    ...(status ? { status: status as never } : {}),
    ...(q ? {
      OR: [
        { name:               { contains: q, mode: "insensitive" as const } },
        { industry:           { contains: q, mode: "insensitive" as const } },
        { contactPersonName:  { contains: q, mode: "insensitive" as const } },
        { contactPersonEmail: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [groups, total] = await Promise.all([
    prisma.group.findMany({
      where,
      select: {
        id: true, name: true, industry: true, status: true,
        contactPersonName: true, contactPersonEmail: true, renewalDate: true,
        package: { select: { name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.group.count({ where: { tenantId } }),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Corporate Groups</h1>
          <p className="text-brand-text-muted mt-1 text-sm">Manage enrolled organizations and their packages.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/groups/new/individual"
            className="border border-brand-indigo text-brand-indigo hover:bg-brand-indigo/5 px-5 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 text-sm"
          >
            <PlusCircle size={16} />
            Individual Client
          </Link>
          <Link
            href="/groups/new"
            className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm"
          >
            <PlusCircle size={18} />
            Enroll Group
          </Link>
        </div>
      </div>

      <Suspense>
        <SearchFilterBar
          placeholder="Search by name, industry, contact…"
          resultCount={groups.length}
          totalCount={total}
          filters={[
            { key: "status", label: "Status", options: STATUS_OPTIONS },
          ]}
        />
      </Suspense>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Group</th>
              <th className="px-6 py-4">Contact Person</th>
              <th className="px-6 py-4">Package</th>
              <th className="px-6 py-4">Members</th>
              <th className="px-6 py-4">Renewal</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
            {groups.map(group => (
              <tr key={group.id} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-6 py-4">
                  <Link href={`/groups/${group.id}`} className="group block">
                    <span className="font-bold text-brand-text-heading group-hover:text-brand-indigo transition-colors">
                      {group.name}
                    </span>
                    <span className="text-xs text-brand-text-muted block">{group.industry ?? "—"}</span>
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <span className="font-medium text-brand-text-heading">{group.contactPersonName}</span>
                  <span className="text-xs text-brand-text-muted block">{group.contactPersonEmail}</span>
                </td>
                <td className="px-6 py-4 font-semibold text-brand-text-heading">{group.package.name}</td>
                <td className="px-6 py-4">
                  <span className="flex items-center gap-1.5 text-brand-text-heading font-semibold">
                    <Users size={13} className="text-brand-text-muted" />
                    {group._count.members}
                  </span>
                </td>
                <td className="px-6 py-4 text-brand-text-body">
                  {new Date(group.renewalDate).toLocaleDateString("en-UG")}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(group.status)}`}>
                    {group.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={`/groups/${group.id}`}
                    className="text-brand-indigo hover:text-brand-secondary font-semibold text-xs inline-flex items-center gap-1 transition-colors"
                  >
                    View <ChevronRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-14 text-center text-brand-text-muted">
                  <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                  {q || status
                    ? "No groups match your search. Try adjusting the filters."
                    : "No groups enrolled yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
