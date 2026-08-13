import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { HRLeaverForm } from "./HRLeaverForm";
import { calendarDateFromInstant, formatCalendarDate } from "@/lib/calendar-date";

/**
 * UAT-HF P08.01 (DEF-004) — the leaver request, reached from the member the HR
 * manager is already looking at.
 *
 * The member is resolved from the route, so the plan's "HR can submit a leaver
 * without route knowledge" is satisfied by construction: there is no group or
 * member picker to get wrong, and no way to reach another employer's staff.
 */
export default async function HRLeaverPage(props: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await props.params;
  const session = await requireRole(ROLES.HR);

  // Same N3 / PRIVACY-S1-B guard as the detail page: without it, an ungrouped HR
  // user or a SUPER_ADMIN (inside ROLES.HR) would have the groupId key dropped
  // by Prisma and reach every group in the tenant.
  if (!session.user.groupId) notFound();

  const member = await prisma.member.findFirst({
    where: {
      id: memberId,
      tenantId: session.user.tenantId,
      groupId: session.user.groupId,
    },
    select: {
      id: true,
      memberNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      coverStartDate: true,
      dependents: {
        where: { status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
  if (!member) notFound();

  const name = `${member.firstName} ${member.lastName}`;

  // A non-active member has nothing to end. Say so here rather than letting the
  // operator fill a form the action will reject.
  if (member.status !== "ACTIVE") {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Report an employee leaving</h1>
        <div role="status" className="rounded-[8px] border border-[#EEEEEE] bg-[#F8F9FA] p-5">
          <p className="text-sm text-brand-text-heading font-semibold">
            {name} is already {member.status.toLowerCase()}.
          </p>
          <p className="text-sm text-brand-text-muted mt-1">
            There is no cover to end. If this is wrong, raise a support request and
            your scheme administrator will correct the record.
          </p>
          <div className="flex gap-3 mt-4">
            <Link href={`/hr/roster/${member.id}`} className="text-sm font-bold text-brand-indigo hover:text-brand-secondary">
              Back to {name}
            </Link>
            <Link href="/hr/support/new" className="text-sm font-bold text-brand-indigo hover:text-brand-secondary">
              Raise a support request
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // coverStartDate is nullable on Member; the helper takes a Date.
  const start = member.coverStartDate ? calendarDateFromInstant(member.coverStartDate) : null;

  return (
    <HRLeaverForm
      memberId={member.id}
      memberName={name}
      memberNumber={member.memberNumber}
      coverStartLabel={start ? formatCalendarDate(start) : null}
      dependants={member.dependents.map((d) => ({
        id: d.id,
        name: `${d.firstName} ${d.lastName}`,
      }))}
    />
  );
}
