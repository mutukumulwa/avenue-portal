import { requireRole, ROLES } from "@/lib/rbac";
import { MemberAppService } from "@/server/services/member-app.service";
import { EyeOff, Shield, User, Users } from "lucide-react";
import { redirect } from "next/navigation";

function formatMoney(value: number | null) {
  if (value === null) return "Private";
  if (value >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}M`;
  return `UGX ${Math.round(value).toLocaleString("en-UG")}`;
}

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function barTone(pct: number) {
  if (pct >= 0.9) return "bg-[#DC3545]";
  if (pct >= 0.7) return "bg-[#FFC107]";
  return "bg-[#28A745]";
}

function statusTone(status: string) {
  return status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]";
}

export default async function MemberDependentsPage() {
  const session = await requireRole(ROLES.MEMBER);
  const family = await MemberAppService.getFamilyViewForUser(session.user.id, session.user.tenantId);

  if (!family) redirect("/login");

  const familyUsedPct = Math.round(family.familySummary.usedPct * 100);

  return (
    <div className="space-y-6 font-ui">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Family Coverage</h1>
          <p className="mt-1 text-brand-text-muted">
            {family.viewer.isPrincipalViewer ? "Your covered family members and benefit position." : "Your own covered membership details."}
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold uppercase text-brand-text-muted">Family benefit balance</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-brand-text-heading">{formatMoney(family.familySummary.totalRemaining)}</p>
              <p className="mt-1 text-sm text-brand-text-muted">
                {formatMoney(family.familySummary.totalUsed)} used of {formatMoney(family.familySummary.totalLimit)}
              </p>
            </div>
            <Users className="h-8 w-8 text-brand-indigo" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#E6E7E8]">
            <div className={`h-full rounded-full ${barTone(family.familySummary.usedPct)}`} style={{ width: `${familyUsedPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[13px] text-brand-text-muted">
            <span>{family.familySummary.memberCount.toLocaleString("en-UG")} covered member(s)</span>
            <span>{familyUsedPct}% used</span>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <Shield className="h-6 w-6 text-[#17A2B8]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-brand-text-muted">Privacy guardrail</p>
          <p className="mt-2 text-sm leading-relaxed text-brand-text-muted">{family.privacyNote}</p>
        </div>
      </section>

      <section className="space-y-4">
        {family.members.map((member) => {
          const usedPct = Math.round(member.summary.overallUsedPct * 100);
          const displayName = `${member.firstName} ${member.lastName}`;
          return (
            <div key={member.id} className={`rounded-[8px] border bg-white p-5 shadow-sm ${member.isSelf ? "border-brand-indigo/30" : "border-[#EEEEEE]"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${member.isSelf ? "bg-brand-indigo/10 text-brand-indigo" : "bg-[#E6E7E8] text-[#6C757D]"}`}>
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-bold text-brand-text-heading">{displayName}</h2>
                      <span className="rounded-full bg-brand-indigo/10 px-2 py-0.5 text-[12px] font-bold text-brand-indigo">
                        {member.isSelf ? "You" : member.relationship.replace(/_/g, " ")}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${statusTone(member.status)}`}>
                        {member.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-brand-text-muted">
                      {member.memberNumber} · Age {member.age} · {member.packageName}
                    </p>
                  </div>
                </div>
                <div className="text-left lg:text-right">
                  <p className="text-[13px] text-brand-text-muted">Remaining</p>
                  <p className="text-xl font-bold tabular-nums text-brand-text-heading">{formatMoney(member.summary.totalRemaining)}</p>
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#E6E7E8]">
                <div className={`h-full rounded-full ${barTone(member.summary.overallUsedPct)}`} style={{ width: `${usedPct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[13px] text-brand-text-muted">
                <span>{formatMoney(member.summary.totalUsed)} used</span>
                <span>{member.summary.pace}</span>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[8px] bg-[#F8F9FA] p-4">
                  <p className="mb-3 text-[13px] font-bold uppercase text-brand-text-muted">Benefit categories</p>
                  <div className="space-y-3">
                    {member.categoryDetails.slice(0, 4).map((benefit) => (
                      <div key={benefit.id}>
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <span className="font-semibold text-brand-text-heading">{benefit.name}</span>
                          <span className="tabular-nums text-brand-text-muted">
                            {benefit.masked ? "Private" : `${Math.round((benefit.usedPct ?? 0) * 100)}%`}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#E6E7E8]">
                          <div
                            className={`h-full rounded-full ${benefit.masked ? "bg-[#6C757D]" : barTone(benefit.usedPct ?? 0)}`}
                            style={{ width: `${benefit.masked ? 100 : Math.round((benefit.usedPct ?? 0) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[8px] bg-[#F8F9FA] p-4">
                  <p className="mb-3 text-[13px] font-bold uppercase text-brand-text-muted">Recent visible care</p>
                  <div className="space-y-3">
                    {member.recentVisibleEncounters.map((encounter) => (
                      <div key={encounter.id} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-brand-text-heading">{encounter.providerName}</p>
                          <p className="text-[13px] text-brand-text-muted">
                            {encounter.benefitCategory.replace(/_/g, " ")} · {formatDate(encounter.dateOfService)}
                          </p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums text-brand-text-heading">{formatMoney(encounter.approvedAmount)}</p>
                      </div>
                    ))}
                    {member.recentVisibleEncounters.length === 0 && (
                      <p className="text-sm text-brand-text-muted">No visible care events yet.</p>
                    )}
                    {member.hiddenSensitiveEncounterCount > 0 && (
                      <div className="flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-[13px] text-brand-text-muted">
                        <EyeOff className="h-4 w-4" />
                        {member.hiddenSensitiveEncounterCount} private event(s) summarized only.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
