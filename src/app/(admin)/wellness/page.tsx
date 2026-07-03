import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { WellnessService } from "@/server/services/wellness.service";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { upsertProgramAction, retireProgramAction, enrollAction, logActivityAction, withdrawAction } from "./actions";
import { HeartPulse } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  SCREENING: "Screening",
  CHRONIC_DISEASE_MGMT: "Chronic care",
  INCENTIVE: "Incentive",
};
const TYPE_BADGE: Record<string, string> = {
  SCREENING: "bg-brand-info/10 text-brand-info",
  CHRONIC_DISEASE_MGMT: "bg-brand-secondary/10 text-brand-secondary",
  INCENTIVE: "bg-brand-teal/10 text-brand-teal",
};
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-brand-success/10 text-brand-success",
  COMPLETED: "bg-brand-info/10 text-brand-info",
  WITHDRAWN: "bg-brand-text-muted/10 text-brand-text-muted",
  LAPSED: "bg-brand-warning/10 text-brand-warning",
};
const ACTIVITY_TYPES = ["SCREENING_COMPLETED", "HEALTH_CHECK", "VITALS_LOGGED", "IMMUNIZATION", "COACHING_SESSION", "PHYSICAL_ACTIVITY", "OTHER"];

const fmtDate = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

export default async function WellnessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [analytics, programs, members, enrollments, dueScreenings] = await Promise.all([
    WellnessService.programAnalytics(tenantId),
    WellnessService.listPrograms(tenantId, { includeInactive: true }),
    prisma.member.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, memberNumber: true, firstName: true, lastName: true },
      orderBy: { memberNumber: "asc" },
      take: 200,
    }),
    prisma.wellnessEnrollment.findMany({
      where: { tenantId },
      include: {
        program: { select: { name: true, type: true } },
        member: { select: { memberNumber: true, firstName: true, lastName: true } },
      },
      orderBy: { enrolledAt: "desc" },
      take: 25,
    }),
    WellnessService.dueScreenings(tenantId),
  ]);
  const activePrograms = programs.filter((p) => p.isActive);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-medium text-brand-text-heading";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <HeartPulse className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Preventative care & wellness</h1>
          <p className="text-sm text-brand-text-muted">
            Funded screenings, chronic-disease protocols and an incentive layer —
            a loss-ratio countermeasure. Members earn points; screenings recur on cadence.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* Analytics */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-brand-text-muted">Programme participation</h2>
        {analytics.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No programmes yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Programme</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Enrolled</th>
                  <th className="px-4 py-2.5 font-semibold">Active</th>
                  <th className="px-4 py-2.5 font-semibold">Completion</th>
                  <th className="px-4 py-2.5 font-semibold">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {analytics.map((a) => (
                  <tr key={a.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5 font-medium text-brand-text-heading">{a.name}{!a.isActive && <span className="ml-2 text-xs text-brand-text-muted">(retired)</span>}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[a.type]}`}>{TYPE_LABEL[a.type]}</span></td>
                    <td className="px-4 py-2.5 text-brand-text-body">{a.enrolled}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{a.active}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{a.completionRate}%</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{a.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Enroll */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Enrol a member</h2>
        <form action={enrollAction} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="programId">Programme</label>
            <select id="programId" name="programId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Select…</option>
              {activePrograms.map((p) => <option key={p.id} value={p.id}>{p.name} · {TYPE_LABEL[p.type]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="memberId">Member</label>
            <select id="memberId" name="memberId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Select…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.memberNumber} — {m.firstName} {m.lastName}</option>)}
            </select>
          </div>
          <div className="flex items-end justify-end">
            <SubmitButton>Enrol</SubmitButton>
          </div>
        </form>
      </section>

      {/* Due screenings */}
      {dueScreenings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-brand-text-muted">Due now ({dueScreenings.length})</h2>
          <div className="overflow-hidden rounded-lg border border-brand-warning/40 bg-brand-warning/5">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-brand-border">
                {dueScreenings.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 text-brand-text-body">{e.member.memberNumber} — {e.member.firstName} {e.member.lastName}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{e.program.name}</td>
                    <td className="px-4 py-2.5 text-brand-text-muted">due {fmtDate(e.nextDueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent enrolments */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-brand-text-muted">Recent enrolments ({enrollments.length})</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No enrolments yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Member</th>
                  <th className="px-4 py-2.5 font-semibold">Programme</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Points</th>
                  <th className="px-4 py-2.5 font-semibold">Next due</th>
                  <th className="px-4 py-2.5 font-semibold">Log activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {enrollments.map((e) => (
                  <tr key={e.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5 text-brand-text-body">{e.member.memberNumber} — {e.member.firstName} {e.member.lastName}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{e.program.name}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[e.status]}`}>{e.status}</span></td>
                    <td className="px-4 py-2.5 text-brand-text-body">{e.pointsEarned}</td>
                    <td className="px-4 py-2.5 text-brand-text-muted">{fmtDate(e.nextDueDate)}</td>
                    <td className="px-4 py-2.5">
                      {e.status !== "WITHDRAWN" ? (
                        <form action={logActivityAction} className="flex items-center gap-2">
                          <input type="hidden" name="enrollmentId" value={e.id} />
                          <select name="type" defaultValue="HEALTH_CHECK" className="rounded-md border border-brand-border bg-brand-bg px-2 py-1 text-xs">
                            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
                          </select>
                          <button className="rounded-full bg-brand-secondary px-3 py-1 text-xs font-semibold text-white hover:opacity-90">Log</button>
                        </form>
                      ) : (
                        <span className="text-xs text-brand-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Programme registry */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Add programme</h2>
        <form action={upsertProgramAction} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Annual health check" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue="SCREENING" className={inputCls}>
              <option value="SCREENING">Screening</option>
              <option value="CHRONIC_DISEASE_MGMT">Chronic disease management</option>
              <option value="INCENTIVE">Incentive</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cadenceMonths">Cadence (months)</label>
            <input id="cadenceMonths" name="cadenceMonths" type="number" min="1" placeholder="12" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="fundedAmount">Funded amount</label>
            <input id="fundedAmount" name="fundedAmount" type="number" step="0.01" placeholder="150000" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="currency">Currency</label>
            <input id="currency" name="currency" defaultValue="UGX" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pointsReward">Points / activity</label>
            <input id="pointsReward" name="pointsReward" type="number" min="0" defaultValue="0" className={inputCls} />
          </div>
          <div className="lg:col-span-2">
            <label className={labelCls} htmlFor="targetConditions">Target conditions (comma-separated)</label>
            <input id="targetConditions" name="targetConditions" placeholder="Diabetes, Hypertension" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="description">Description</label>
            <input id="description" name="description" className={inputCls} />
          </div>
          <div className="flex justify-end lg:col-span-3">
            <SubmitButton>Save programme</SubmitButton>
          </div>
        </form>

        {programs.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-brand-border">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Programme</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Cadence</th>
                  <th className="px-4 py-2.5 font-semibold">Funded</th>
                  <th className="px-4 py-2.5 font-semibold">Points</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {programs.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-brand-text-heading">{p.name}</span>
                      {!p.isActive && <span className="ml-2 text-xs text-brand-text-muted">(retired)</span>}
                      {p.targetConditions.length > 0 && <div className="text-xs text-brand-text-muted">{p.targetConditions.join(", ")}</div>}
                    </td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[p.type]}`}>{TYPE_LABEL[p.type]}</span></td>
                    <td className="px-4 py-2.5 text-brand-text-body">{p.cadenceMonths ? `${p.cadenceMonths} mo` : "one-off"}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{p.fundedAmount ? `${new Intl.NumberFormat("en-UG").format(Number(p.fundedAmount))} ${p.currency}` : "—"}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{p.pointsReward}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.isActive && (
                        <form action={retireProgramAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs font-semibold text-brand-error hover:underline">Retire</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
