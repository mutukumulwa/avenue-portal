import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlusCircle, UserCircle2, Activity } from "lucide-react";
import Link from "next/link";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { Suspense } from "react";

const STATUS_OPTIONS = [
  { value: "ACTIVE",             label: "Active"              },
  { value: "PENDING_ACTIVATION", label: "Pending Activation"  },
  { value: "SUSPENDED",          label: "Suspended"           },
  { value: "LAPSED",             label: "Lapsed"              },
  { value: "TERMINATED",         label: "Terminated"          },
];

const RELATIONSHIP_OPTIONS = [
  { value: "PRINCIPAL", label: "Principal" },
  { value: "SPOUSE",    label: "Spouse"    },
  { value: "CHILD",     label: "Child"     },
  { value: "PARENT",    label: "Parent"    },
  { value: "OTHER",     label: "Other"     },
];

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; relationship?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);

  const { q, status, relationship } = await searchParams;
  const tenantId = session.user.tenantId;

  const where = {
    tenantId,
    ...(status       ? { status: status as never }       : {}),
    ...(relationship  ? { relationship: relationship as never } : {}),
    ...(q ? {
      OR: [
        { firstName:    { contains: q, mode: "insensitive" as const } },
        { lastName:     { contains: q, mode: "insensitive" as const } },
        { memberNumber: { contains: q, mode: "insensitive" as const } },
        { email:        { contains: q, mode: "insensitive" as const } },
        { phone:        { contains: q, mode: "insensitive" as const } },
        { idNumber:     { contains: q, mode: "insensitive" as const } },
        { group: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    } : {}),
  };

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true,
        memberNumber: true, email: true, phone: true,
        status: true, relationship: true,
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.member.count({ where: { tenantId } }),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Member Registry</h1>
          <p className="text-avenue-text-muted mt-1 text-sm">Manage enrolled principals and dependents.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/members/import"
            className="flex items-center gap-2 px-5 py-2 rounded-full border border-avenue-indigo text-avenue-indigo text-sm font-semibold hover:bg-avenue-indigo hover:text-white transition-colors"
          >
            Bulk Import
          </Link>
          <Link
            href="/members/new"
            className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm"
          >
            <PlusCircle size={18} />
            Add Member
          </Link>
        </div>
      </div>

      <Suspense>
        <SearchFilterBar
          placeholder="Search by name, member no., email, group…"
          resultCount={members.length}
          totalCount={total}
          filters={[
            { key: "status",       label: "Status",       options: STATUS_OPTIONS       },
            { key: "relationship", label: "Relationship", options: RELATIONSHIP_OPTIONS },
          ]}
        />
      </Suspense>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Member No.</th>
                <th className="px-6 py-4">Group</th>
                <th className="px-6 py-4">Relationship</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body text-sm">
              {members.map(member => (
                <tr key={member.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-avenue-indigo/10 text-avenue-indigo flex items-center justify-center font-bold text-sm shrink-0">
                        {member.firstName[0]}{member.lastName[0]}
                      </div>
                      <div>
                        <p className="font-bold text-avenue-text-heading">{member.firstName} {member.lastName}</p>
                        <p className="text-xs text-avenue-text-muted">{member.email || member.phone || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-avenue-text-muted">{member.memberNumber}</td>
                  <td className="px-6 py-4">
                    <Link href={`/groups/${member.group.id}`}
                      className="font-semibold text-avenue-text-heading hover:text-avenue-indigo transition-colors">
                      {member.group.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${
                      member.relationship === "PRINCIPAL"
                        ? "bg-avenue-indigo/10 text-avenue-indigo"
                        : "bg-[#6C757D]/10 text-[#6C757D]"
                    }`}>
                      {member.relationship}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full inline-flex items-center gap-1 ${
                      member.status === "ACTIVE"             ? "bg-[#28A745]/10 text-[#28A745]" :
                      member.status === "PENDING_ACTIVATION" ? "bg-[#17A2B8]/10 text-[#17A2B8]" :
                      member.status === "SUSPENDED"          ? "bg-[#FFC107]/10 text-[#856404]" :
                      "bg-[#DC3545]/10 text-[#DC3545]"
                    }`}>
                      {member.status === "ACTIVE" && <Activity size={11} />}
                      {member.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/members/${member.id}`}
                      className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1 text-xs">
                      <UserCircle2 size={15} /> Profile
                    </Link>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center text-avenue-text-muted">
                    <UserCircle2 size={32} className="mx-auto mb-3 opacity-30" />
                    {q || status || relationship
                      ? "No members match your search. Try adjusting the filters."
                      : "No members found. Click \"Add Member\" to register someone."}
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
