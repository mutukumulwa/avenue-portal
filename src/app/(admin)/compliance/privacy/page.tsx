import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  openDsrAction,
  setDsrStatusAction,
  recordProcessorAction,
  recordBreachAction,
  markBreachNotifiedAction,
} from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Lock } from "lucide-react";

const DSR_TONE: Record<string, string> = {
  RECEIVED: "bg-brand-warning/10 text-brand-warning",
  IN_PROGRESS: "bg-brand-indigo/10 text-brand-indigo",
  FULFILLED: "bg-brand-success/10 text-brand-success",
  REJECTED: "bg-brand-text-muted/10 text-brand-text-muted",
};

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;
  const now = new Date();

  const [dsrs, processors, breaches] = await Promise.all([
    prisma.dataSubjectRequest.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.processorRegister.findMany({ where: { tenantId, isActive: true }, orderBy: { createdAt: "desc" } }),
    prisma.breachIncident.findMany({ where: { tenantId }, orderBy: { detectedAt: "desc" }, take: 20 }),
  ]);

  const memberIds = dsrs.map((d) => d.memberId);
  const members = memberIds.length
    ? await prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, firstName: true, lastName: true, memberNumber: true } })
    : [];
  const memberLabel = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName} (${m.memberNumber})`]));

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const smallInput =
    "rounded-md border border-brand-border bg-brand-bg px-2 py-1.5 text-xs text-brand-text-body focus:border-brand-teal focus:outline-none";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Data Protection (DPPA-2019)</h1>
          <p className="text-sm text-brand-text-muted">
            Data-subject requests with the statutory 30-day SLA, the processor / sub-processor
            register, and the breach workflow with the 72-hour regulator-notification clock.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* DSR intake */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Open a data-subject request</h2>
        <form action={openDsrAction} className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls} htmlFor="memberId">Member ID</label>
            <input id="memberId" name="memberId" required className={inputCls} placeholder="cuid…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="type">Type</label>
            <select id="type" name="type" required className={inputCls} defaultValue="ACCESS">
              <option value="ACCESS">Access</option>
              <option value="CORRECTION">Correction</option>
              <option value="OBJECTION">Objection</option>
              <option value="ERASURE">Erasure</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="notes">Notes</label>
            <input id="notes" name="notes" className={inputCls} placeholder="Optional" />
          </div>
          <div className="col-span-3 flex justify-end"><SubmitButton>Open request</SubmitButton></div>
        </form>
      </section>

      {/* DSR queue */}
      <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Data-subject requests</h2>
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Member</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">SLA deadline</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {dsrs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-text-muted">No requests.</td></tr>
            ) : dsrs.map((d) => {
              const overdue = d.status !== "FULFILLED" && d.status !== "REJECTED" && d.slaDeadlineAt < now;
              return (
                <tr key={d.id}>
                  <td className="px-4 py-2.5 text-brand-text-body">{memberLabel.get(d.memberId) ?? d.memberId}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{d.type}</td>
                  <td className={`px-4 py-2.5 ${overdue ? "font-bold text-brand-error" : "text-brand-text-body"}`}>
                    {new Date(d.slaDeadlineAt).toLocaleDateString("en-UG")}{overdue ? " (overdue)" : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${DSR_TONE[d.status]}`}>{d.status.replace("_", " ")}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {d.status === "FULFILLED" || d.status === "REJECTED" ? (
                      <span className="text-xs text-brand-text-muted">{d.fulfilmentRef ?? "—"}</span>
                    ) : (
                      <form action={setDsrStatusAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={d.id} />
                        <input name="fulfilmentRef" placeholder="Artefact ref" className={smallInput} />
                        {d.status === "RECEIVED" && (
                          <button name="status" value="IN_PROGRESS" className="text-xs font-semibold text-brand-indigo hover:underline">Start</button>
                        )}
                        <button name="status" value="FULFILLED" className="text-xs font-semibold text-brand-success hover:underline">Fulfil</button>
                        <button name="status" value="REJECTED" className="text-xs font-semibold text-brand-error hover:underline">Reject</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Processor register + breach intake */}
      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Register a processor</h2>
          <form action={recordProcessorAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="pname">Name</label>
              <input id="pname" name="name" required className={inputCls} placeholder="MinIO Cloud Ltd" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelCls} htmlFor="role">Role</label>
                <select id="role" name="role" className={inputCls} defaultValue="PROCESSOR">
                  <option value="PROCESSOR">Processor</option>
                  <option value="SUB_PROCESSOR">Sub-processor</option>
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls} htmlFor="location">Location</label>
                <input id="location" name="location" className={inputCls} placeholder="Uganda" />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="dataCategories">Data categories (comma-sep)</label>
              <input id="dataCategories" name="dataCategories" className={inputCls} placeholder="claims, health" />
            </div>
            <div>
              <label className={labelCls} htmlFor="dpaRef">DPA ref</label>
              <input id="dpaRef" name="dpaRef" className={inputCls} placeholder="DPA-2026-01" />
            </div>
            <div className="flex justify-end"><SubmitButton>Register</SubmitButton></div>
          </form>
        </section>

        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Record a breach</h2>
          <form action={recordBreachAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="scope">Scope</label>
              <input id="scope" name="scope" required className={inputCls} placeholder="Exposed member records" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelCls} htmlFor="severity">Severity</label>
                <select id="severity" name="severity" className={inputCls} defaultValue="MEDIUM">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls} htmlFor="detectedAt">Detected</label>
                <input id="detectedAt" name="detectedAt" type="date" required className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="narrative">Narrative</label>
              <input id="narrative" name="narrative" className={inputCls} placeholder="What happened" />
            </div>
            <div className="flex justify-end"><SubmitButton>Record breach</SubmitButton></div>
          </form>
        </section>
      </div>

      {/* Processor + breach tables */}
      <div className="grid grid-cols-2 gap-6">
        <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
          <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Processor register</h2>
          <table className="w-full text-sm">
            <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Location</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {processors.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-brand-text-muted">No processors registered.</td></tr>
              ) : processors.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium text-brand-text-heading">{p.name}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{p.role}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{p.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
          <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Breach incidents</h2>
          <table className="w-full text-sm">
            <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr><th className="px-4 py-2.5">Detected</th><th className="px-4 py-2.5">Severity</th><th className="px-4 py-2.5">Notify by</th><th className="px-4 py-2.5">Notified</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {breaches.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-text-muted">No breaches recorded.</td></tr>
              ) : breaches.map((b) => {
                const overdue = !b.regulatorNotified && b.notifiableBy != null && b.notifiableBy < now;
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 text-brand-text-body">{new Date(b.detectedAt).toLocaleDateString("en-UG")}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{b.severity}</td>
                    <td className={`px-4 py-2.5 ${overdue ? "font-bold text-brand-error" : "text-brand-text-body"}`}>
                      {b.notifiableBy ? new Date(b.notifiableBy).toLocaleDateString("en-UG") : "—"}{overdue ? " (overdue)" : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      {b.regulatorNotified ? (
                        <span className="text-xs font-semibold text-brand-success">Notified</span>
                      ) : (
                        <form action={markBreachNotifiedAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="text-xs font-semibold text-brand-indigo hover:underline">Mark notified</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
