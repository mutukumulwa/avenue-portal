import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ComplianceService } from "@/server/services/compliance.service";
import {
  recordLicenceAction,
  recordDirectorAction,
  endDirectorAction,
  computeLevyAction,
} from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ShieldCheck } from "lucide-react";

const OBLIGATION_TONE: Record<string, string> = {
  OK: "bg-brand-success/10 text-brand-success",
  EXPIRING: "bg-[#FFC107]/15 text-[#856404]",
  EXPIRED: "bg-brand-error/10 text-brand-error",
  MISSING: "bg-brand-text-muted/10 text-brand-text-muted",
};

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [obligations, directorStatus, directors, licences, levies] = await Promise.all([
    ComplianceService.obligationStatus(tenantId),
    ComplianceService.directorResidencyStatus(tenantId),
    prisma.directorRegister.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { appointedAt: "desc" }],
    }),
    prisma.regulatoryLicence.findMany({
      where: { tenantId },
      orderBy: { expiresAt: "desc" },
      take: 10,
    }),
    prisma.complianceLevyComputation.findMany({
      where: { tenantId },
      orderBy: { period: "desc" },
      take: 10,
    }),
  ]);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">TPA Compliance Register</h1>
          <p className="text-sm text-brand-text-muted">
            The operator&rsquo;s own IRA-UG standing: licence, security deposit and indemnity
            obligations, director residency majority, and the annual compliance levy computed
            from the admin-fee ledger.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* Obligation traffic-lights */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Regulatory licence", state: obligations.licence },
          { label: "Security deposit", state: obligations.securityDeposit },
          { label: "Indemnity cover", state: obligations.indemnity },
        ].map((o) => (
          <div key={o.label} className="rounded-lg border border-brand-border bg-brand-bg p-4">
            <p className="text-xs font-semibold uppercase text-brand-text-muted">{o.label}</p>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${OBLIGATION_TONE[o.state] ?? OBLIGATION_TONE.MISSING}`}>
              {o.state}
            </span>
          </div>
        ))}
      </section>

      {/* Director residency status */}
      <section className={`rounded-lg border p-4 ${directorStatus.ok ? "border-brand-success/30 bg-brand-success/5" : "border-[#FFC107]/40 bg-[#FFC107]/5"}`}>
        <p className="text-sm text-brand-text-body">
          <strong>Director residency majority (IRA-UG):</strong> {directorStatus.resident} of {directorStatus.total} directors are Uganda-resident.{" "}
          {directorStatus.ok
            ? "Meets the ≥3 directors and resident-majority requirement."
            : "Does NOT meet the ≥3 directors and resident-majority requirement."}
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Record licence</h2>
          <form action={recordLicenceAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="number">Licence number</label>
              <input id="number" name="number" required className={inputCls} placeholder="TPA/2026/001" />
            </div>
            <div>
              <label className={labelCls} htmlFor="issuedAt">Issued</label>
              <input id="issuedAt" name="issuedAt" type="date" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="expiresAt">Expires</label>
              <input id="expiresAt" name="expiresAt" type="date" required className={inputCls} />
            </div>
            <div className="flex justify-end"><SubmitButton>Record</SubmitButton></div>
          </form>
        </section>

        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Add director</h2>
          <form action={recordDirectorAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="name">Name</label>
              <input id="name" name="name" required className={inputCls} placeholder="Jane Nakato" />
            </div>
            <div>
              <label className={labelCls} htmlFor="role">Role</label>
              <input id="role" name="role" className={inputCls} placeholder="Managing Director" />
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-text-body">
              <input type="checkbox" name="isResident" defaultChecked className="h-4 w-4" />
              Uganda-resident
            </label>
            <div className="flex justify-end"><SubmitButton>Add</SubmitButton></div>
          </form>
        </section>

        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Compute IRA levy</h2>
          <form action={computeLevyAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="period">Year</label>
              <input id="period" name="period" required className={inputCls} placeholder="2026" defaultValue={String(new Date().getFullYear())} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ratePercent">Levy rate %</label>
              <input id="ratePercent" name="ratePercent" type="number" step="0.01" min="0" max="100" required className={inputCls} placeholder="0.5" />
            </div>
            <p className="text-xs text-brand-text-muted">Basis = admin fees in the ledger for that year.</p>
            <div className="flex justify-end"><SubmitButton>Compute</SubmitButton></div>
          </form>
        </section>
      </div>

      {/* Directors table */}
      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Directors</h2>
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Residency</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {directors.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-text-muted">No directors recorded.</td></tr>
            ) : directors.map((d) => (
              <tr key={d.id} className={d.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-medium text-brand-text-heading">{d.name}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{d.role ?? "—"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{d.isResident ? "Uganda-resident" : "Non-resident"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${d.isActive ? "bg-brand-success/10 text-brand-success" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {d.isActive ? "Active" : "Ended"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {d.isActive && (
                    <form action={endDirectorAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="text-xs font-semibold text-brand-error hover:underline">End</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Licences + levies */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
          <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Licences</h2>
          <table className="w-full text-sm">
            <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr><th className="px-4 py-2.5">Number</th><th className="px-4 py-2.5">Expires</th><th className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {licences.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-brand-text-muted">No licences recorded.</td></tr>
              ) : licences.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-mono text-brand-text-heading">{l.number}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{new Date(l.expiresAt).toLocaleDateString("en-UG")}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
          <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Compliance levy</h2>
          <table className="w-full text-sm">
            <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr><th className="px-4 py-2.5">Period</th><th className="px-4 py-2.5">Basis</th><th className="px-4 py-2.5">Rate</th><th className="px-4 py-2.5">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {levies.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-text-muted">No levy computed yet.</td></tr>
              ) : levies.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2.5 font-mono text-brand-text-heading">{v.period}</td>
                  <td className="px-4 py-2.5 font-mono text-brand-text-body">{Number(v.feesReceivedBasis).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{Number(v.ratePercent)}%</td>
                  <td className="px-4 py-2.5 font-mono text-brand-text-heading">{Number(v.amount).toLocaleString()} {v.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
