import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CrossBorderService } from "@/server/services/cross-border.service";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { upsertFacilityAction, retireFacilityAction, openCaseAction } from "./actions";
import { Globe2 } from "lucide-react";

export const CASE_STATUS_BADGE: Record<string, string> = {
  SOURCING: "bg-brand-text-muted/10 text-brand-text-muted",
  ESTIMATED: "bg-brand-info/10 text-brand-info",
  GOP_ISSUED: "bg-brand-secondary/10 text-brand-secondary",
  IN_TREATMENT: "bg-brand-warning/10 text-brand-warning",
  INVOICED: "bg-brand-teal/10 text-brand-teal",
  SETTLED: "bg-brand-success/10 text-brand-success",
  CANCELLED: "bg-brand-pink/15 text-brand-error",
};

export function ugx(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(Number(n))} UGX`;
}

export default async function CrossBorderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [facilities, cases, members] = await Promise.all([
    CrossBorderService.listFacilities(tenantId, { includeInactive: true }),
    CrossBorderService.listCases(tenantId),
    prisma.member.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, memberNumber: true, firstName: true, lastName: true, group: { select: { client: { select: { name: true } } } } },
      orderBy: { memberNumber: "asc" },
      take: 200,
    }),
  ]);
  const vetted = facilities.filter((f) => f.isActive && f.isVetted);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-medium text-brand-text-heading";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Globe2 className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Cross-border coordination</h1>
          <p className="text-sm text-brand-text-muted">
            Overseas care: vetted-facility sourcing → FX-normalised estimate →
            GOP within limits → single consolidated invoice → settlement.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* Open a case */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Open a coordination case</h2>
        <form action={openCaseAction} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className={labelCls} htmlFor="memberId">Member</label>
            <select id="memberId" name="memberId" required defaultValue="" className={inputCls}>
              <option value="" disabled>Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.memberNumber} — {m.firstName} {m.lastName}{m.group.client ? ` (${m.group.client.name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="facilityId">Facility (optional)</label>
            <select id="facilityId" name="facilityId" defaultValue="" className={inputCls}>
              <option value="">—</option>
              {vetted.map((f) => (
                <option key={f.id} value={f.id}>{f.name} · {f.country}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="diagnosis">Diagnosis / reason</label>
            <input id="diagnosis" name="diagnosis" required placeholder="e.g. Oncology — chemotherapy" className={inputCls} />
          </div>
          <div className="lg:col-span-4">
            <label className={labelCls} htmlFor="treatmentSummary">Treatment summary (optional)</label>
            <input id="treatmentSummary" name="treatmentSummary" className={inputCls} />
          </div>
          <div className="flex justify-end lg:col-span-4">
            <SubmitButton>Open case</SubmitButton>
          </div>
        </form>
      </section>

      {/* Cases */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-brand-text-muted">Cases ({cases.length})</h2>
        {cases.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No cross-border cases yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Case</th>
                  <th className="px-4 py-2.5 font-semibold">Facility</th>
                  <th className="px-4 py-2.5 font-semibold">Estimate</th>
                  <th className="px-4 py-2.5 font-semibold">GOP</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/cross-border/${c.id}`} className="font-medium text-brand-secondary hover:underline">
                        {c.caseNumber}
                      </Link>
                      <div className="text-xs text-brand-text-muted">{c.diagnosis}</div>
                    </td>
                    <td className="px-4 py-2.5 text-brand-text-body">
                      {c.facility ? `${c.facility.name} · ${c.facility.country}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-brand-text-body">{ugx(c.estimatedAmountUgx ? Number(c.estimatedAmountUgx) : null)}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{ugx(c.gopAmountUgx ? Number(c.gopAmountUgx) : null)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CASE_STATUS_BADGE[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Facility registry */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Add vetted facility</h2>
        <form action={upsertFacilityAction} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Apollo Hospitals" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="country">Country</label>
            <input id="country" name="country" required placeholder="India" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="city">City</label>
            <input id="city" name="city" placeholder="Chennai" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="currency">Billing currency</label>
            <input id="currency" name="currency" defaultValue="USD" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="accreditation">Accreditation</label>
            <input id="accreditation" name="accreditation" placeholder="JCI" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="contactEmail">Contact email</label>
            <input id="contactEmail" name="contactEmail" type="email" className={inputCls} />
          </div>
          <div className="lg:col-span-2">
            <label className={labelCls} htmlFor="specialties">Specialties (comma-separated)</label>
            <input id="specialties" name="specialties" placeholder="Oncology, Cardiac Surgery" className={inputCls} />
          </div>
          <label className="flex items-center gap-2 self-end text-sm text-brand-text-body">
            <input type="checkbox" name="isVetted" defaultChecked className="rounded border-brand-border" />
            Vetted (steerable)
          </label>
          <div className="flex justify-end lg:col-span-3">
            <SubmitButton>Save facility</SubmitButton>
          </div>
        </form>

        {facilities.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-brand-border">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Facility</th>
                  <th className="px-4 py-2.5 font-semibold">Specialties</th>
                  <th className="px-4 py-2.5 font-semibold">Currency</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {facilities.map((f) => (
                  <tr key={f.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-brand-text-heading">{f.name}</span>
                      <div className="text-xs text-brand-text-muted">{[f.city, f.country].filter(Boolean).join(", ")}{f.accreditation ? ` · ${f.accreditation}` : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 text-brand-text-body">{f.specialties.join(", ") || "—"}</td>
                    <td className="px-4 py-2.5 text-brand-text-body">{f.currency}</td>
                    <td className="px-4 py-2.5">
                      {!f.isActive ? (
                        <span className="inline-flex rounded-full bg-brand-text-muted/10 px-2.5 py-0.5 text-xs font-medium text-brand-text-muted">Retired</span>
                      ) : f.isVetted ? (
                        <span className="inline-flex rounded-full bg-brand-success/10 px-2.5 py-0.5 text-xs font-medium text-brand-success">Vetted</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-brand-warning/10 px-2.5 py-0.5 text-xs font-medium text-brand-warning">Unvetted</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {f.isActive && (
                        <form action={retireFacilityAction}>
                          <input type="hidden" name="id" value={f.id} />
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
