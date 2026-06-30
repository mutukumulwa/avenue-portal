import Link from "next/link";
import { Fingerprint, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";
import { emergencyOverrideAction, initiateCheckInAction } from "./actions";
import { MemberLookup } from "./MemberLookup";

export default async function CheckInsPage() {
  const session = await requireRole(ROLES.OPS);

  const [members, providers, recentChallenges, overrides] = await Promise.all([
    prisma.member.findMany({
      where: { tenantId: session.user.tenantId, status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } },
    }),
    prisma.provider.findMany({
      where: { tenantId: session.user.tenantId, contractStatus: "ACTIVE" },
      orderBy: [{ tier: "asc" }, { name: "asc" }],
      select: { id: true, name: true, tier: true, county: true },
    }),
    prisma.checkInChallenge.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
      },
    }),
    SecureCheckInService.getDailyOverrideSummary(session.user.tenantId),
  ]);

  return (
    <div className="space-y-6 font-ui">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-brand-text-heading">Secure Check-Ins</h1>
          <p className="text-sm text-brand-text-muted mt-1">
            Start member visit verification and monitor same-day overrides.
          </p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white px-4 py-3 text-right">
          <p className="text-[13px] font-medium text-brand-text-muted">Today&apos;s overrides</p>
          <p className="text-2xl font-bold text-brand-error">{overrides.length}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Fingerprint className="h-5 w-5 text-brand-indigo" />
            <h2 className="font-bold text-brand-text-heading">Initiate Secure Check-In</h2>
          </div>
          <form action={initiateCheckInAction} className="space-y-4">
            <MemberLookup
              members={members.map((member) => ({
                id: member.id,
                memberNumber: member.memberNumber,
                firstName: member.firstName,
                lastName: member.lastName,
                groupName: member.group?.name ?? null,
              }))}
              name="memberId"
            />

            <label className="block">
              <span className="text-[13px] font-medium text-brand-text-muted">Facility</span>
              <select name="providerId" required className="mt-1 w-full rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm text-brand-text-heading outline-none focus:border-brand-indigo">
                <option value="">Select facility...</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} - {provider.tier}{provider.county ? ` - ${provider.county}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[13px] font-medium text-brand-text-muted">Workstation</span>
              <input name="workstationId" placeholder="Reception desk or device ID" className="mt-1 w-full rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm text-brand-text-heading outline-none focus:border-brand-indigo" />
            </label>

            <button className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-bold text-white hover:bg-brand-secondary">
              Initiate secure check-in
            </button>
          </form>
        </section>

        <section className="rounded-[8px] border border-red-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-5 w-5 text-brand-error" />
            <h2 className="font-bold text-brand-text-heading">Emergency Override</h2>
          </div>
          <form action={emergencyOverrideAction} className="space-y-4">
            <MemberLookup
              members={members.map((member) => ({
                id: member.id,
                memberNumber: member.memberNumber,
                firstName: member.firstName,
                lastName: member.lastName,
                groupName: member.group?.name ?? null,
              }))}
              name="memberId"
            />
            <select name="providerId" required className="w-full rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm text-brand-text-heading outline-none focus:border-brand-indigo">
              <option value="">Select facility...</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
            <textarea name="reason" required minLength={10} rows={4} placeholder="Document the emergency reason for bypassing standard verification." className="w-full rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm text-brand-text-heading outline-none focus:border-brand-indigo" />
            <button className="rounded-full bg-brand-error px-5 py-2 text-sm font-bold text-white hover:opacity-90">
              Open visit with override
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white">
        <div className="border-b border-[#EEEEEE] px-5 py-4">
          <h2 className="font-bold text-brand-text-heading">Recent Check-Ins</h2>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {recentChallenges.map((challenge) => (
            <Link key={challenge.id} href={`/check-ins/${challenge.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-brand-bg-alt">
              <div>
                <p className="font-bold text-brand-text-heading">
                  {challenge.member.firstName} {challenge.member.lastName}
                </p>
                <p className="text-xs text-brand-text-muted">{challenge.member.memberNumber} - {challenge.provider.name}</p>
              </div>
              <span className="rounded-full bg-brand-bg-alt px-3 py-1 text-xs font-bold text-brand-text-body">
                {challenge.status.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
          {recentChallenges.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No check-ins initiated yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
