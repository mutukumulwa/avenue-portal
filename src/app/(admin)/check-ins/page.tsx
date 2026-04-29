import Link from "next/link";
import { Fingerprint, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";
import { emergencyOverrideAction, initiateCheckInAction } from "./actions";

export default async function CheckInsPage() {
  const session = await requireRole(ROLES.OPS);

  const [members, providers, recentChallenges, overrides] = await Promise.all([
    prisma.member.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 100,
      select: { id: true, memberNumber: true, firstName: true, lastName: true },
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Secure Check-Ins</h1>
          <p className="text-sm text-avenue-text-muted mt-1">
            Start member visit verification and monitor same-day overrides.
          </p>
        </div>
        <div className="rounded-lg border border-[#EEEEEE] bg-white px-4 py-3 text-right">
          <p className="text-xs font-bold uppercase text-avenue-text-muted">Today&apos;s overrides</p>
          <p className="text-2xl font-bold text-avenue-error">{overrides.length}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-[#EEEEEE] bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Fingerprint className="h-5 w-5 text-avenue-indigo" />
            <h2 className="font-bold text-avenue-text-heading">Initiate Secure Check-In</h2>
          </div>
          <form action={initiateCheckInAction} className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase text-avenue-text-muted">Member</span>
              <select name="memberId" required className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
                <option value="">Select member...</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.lastName}, {member.firstName} - {member.memberNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-avenue-text-muted">Facility</span>
              <select name="providerId" required className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
                <option value="">Select facility...</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} - {provider.tier}{provider.county ? ` - ${provider.county}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-avenue-text-muted">Workstation</span>
              <input name="workstationId" placeholder="Reception desk or device ID" className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </label>

            <button className="rounded-full bg-avenue-indigo px-5 py-2 text-sm font-bold text-white hover:bg-avenue-secondary">
              Initiate secure check-in
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-red-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-5 w-5 text-avenue-error" />
            <h2 className="font-bold text-avenue-text-heading">Emergency Override</h2>
          </div>
          <form action={emergencyOverrideAction} className="space-y-4">
            <select name="memberId" required className="w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">Select member...</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.lastName}, {member.firstName} - {member.memberNumber}
                </option>
              ))}
            </select>
            <select name="providerId" required className="w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">Select facility...</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
            <textarea name="reason" required minLength={10} rows={4} placeholder="Document the emergency reason for bypassing standard verification." className="w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            <button className="rounded-full bg-avenue-error px-5 py-2 text-sm font-bold text-white hover:opacity-90">
              Open visit with override
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-lg border border-[#EEEEEE] bg-white">
        <div className="border-b border-[#EEEEEE] px-5 py-4">
          <h2 className="font-bold text-avenue-text-heading">Recent Check-Ins</h2>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {recentChallenges.map((challenge) => (
            <Link key={challenge.id} href={`/check-ins/${challenge.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-avenue-bg-alt">
              <div>
                <p className="font-bold text-avenue-text-heading">
                  {challenge.member.firstName} {challenge.member.lastName}
                </p>
                <p className="text-xs text-avenue-text-muted">{challenge.member.memberNumber} - {challenge.provider.name}</p>
              </div>
              <span className="rounded-full bg-avenue-bg-alt px-3 py-1 text-xs font-bold text-avenue-text-body">
                {challenge.status.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
          {recentChallenges.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-avenue-text-muted">No check-ins initiated yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
