import Link from "next/link";
import { requireProvider } from "@/lib/provider-portal";
import { prisma } from "@/lib/prisma";
import { UserCheck, Search, CheckCircle2, XCircle } from "lucide-react";

function money(n: number) {
  return `KES ${Math.round(n).toLocaleString("en-UG")}`;
}

const ELIGIBLE_STATUSES = ["ACTIVE"];

export default async function ProviderEligibility({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenantId } = await requireProvider();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const member = query
    ? await prisma.member.findFirst({
        where: { tenantId, memberNumber: { equals: query, mode: "insensitive" } },
        select: {
          id: true, memberNumber: true, firstName: true, lastName: true, relationship: true,
          status: true, dateOfBirth: true,
          group: { select: { name: true, status: true } },
          package: { select: { name: true, annualLimit: true } },
          principal: { select: { firstName: true, lastName: true, memberNumber: true } },
        },
      })
    : null;

  let used = 0;
  if (member) {
    const usage = await prisma.benefitUsage.aggregate({
      where: { memberId: member.id },
      _sum: { amountUsed: true },
    });
    used = Number(usage._sum.amountUsed ?? 0);
  }

  const limit = member ? Number(member.package?.annualLimit ?? 0) : 0;
  const memberEligible = !!member && ELIGIBLE_STATUSES.includes(member.status) && ELIGIBLE_STATUSES.includes(member.group?.status ?? "");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
          <UserCheck size={22} /> Member eligibility
        </h1>
        <p className="text-brand-text-muted text-sm mt-1">Enter the member/card number to confirm cover before treating.</p>
      </div>

      <form method="GET" className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            name="q"
            defaultValue={query}
            placeholder="e.g. NWSC-2026-00001"
            className="w-full border border-[#EEEEEE] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
          />
        </div>
        <button type="submit" className="rounded-lg bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">Check</button>
      </form>

      {query && !member && (
        <div className="rounded-lg bg-[#DC3545]/5 border border-[#DC3545]/30 px-4 py-3 text-sm text-[#DC3545] font-semibold">
          No member found for “{query}”. Check the card number and try again.
        </div>
      )}

      {member && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
          <div className={`px-5 py-4 flex items-center gap-3 ${memberEligible ? "bg-[#28A745]/5" : "bg-[#DC3545]/5"}`}>
            {memberEligible ? <CheckCircle2 className="text-[#28A745]" size={28} /> : <XCircle className="text-[#DC3545]" size={28} />}
            <div>
              <p className="text-lg font-bold text-brand-text-heading">
                {member.firstName} {member.lastName}{" "}
                <span className="font-mono text-sm text-brand-text-muted">{member.memberNumber}</span>
              </p>
              <p className={`text-sm font-semibold ${memberEligible ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                {memberEligible ? "ELIGIBLE — cover is active" : `NOT ELIGIBLE — member is ${member.status}${member.group && member.group.status !== "ACTIVE" ? `, scheme ${member.group.status}` : ""}`}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 px-5 py-5 text-sm">
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Scheme</dt><dd className="mt-0.5">{member.group?.name ?? "—"}</dd></div>
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Package</dt><dd className="mt-0.5">{member.package?.name ?? "—"}</dd></div>
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Relationship</dt><dd className="mt-0.5">{member.relationship}{member.principal ? ` of ${member.principal.firstName} ${member.principal.lastName}` : ""}</dd></div>
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Annual limit</dt><dd className="mt-0.5 font-mono">{money(limit)}</dd></div>
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Used</dt><dd className="mt-0.5 font-mono">{money(used)}</dd></div>
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Remaining</dt><dd className="mt-0.5 font-mono font-bold text-brand-indigo">{money(Math.max(0, limit - used))}</dd></div>
          </dl>
          {memberEligible && (
            <div className="px-5 pb-5">
              <Link
                href={`/provider/claims/new?memberId=${member.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary"
              >
                File a claim for this member →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
