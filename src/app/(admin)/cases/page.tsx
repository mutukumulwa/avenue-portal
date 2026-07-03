import { requireRole, ROLES } from "@/lib/rbac";
import { CaseService } from "@/server/services/case.service";
import { BriefcaseMedical, PlusCircle, Building2, Clock } from "lucide-react";
import Link from "next/link";

function losDays(admissionDate: Date | null): number | null {
  if (!admissionDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(admissionDate).getTime()) / 86_400_000));
}

const TYPE_LABEL: Record<string, string> = {
  INPATIENT_ADMISSION: "Inpatient",
  OUTPATIENT_EPISODE: "Outpatient",
  MATERNITY: "Maternity",
  DAY_CASE: "Day case",
  CHRONIC_CYCLE: "Chronic cycle",
};

export default async function OpenCasesPage() {
  const session = await requireRole(ROLES.OPS);
  const cases = await CaseService.listOpenCases(session.user.tenantId, session.user.clientId);

  // Facility-first grouping (mirrors the claims queues board).
  const byFacility = new Map<string, { name: string; items: typeof cases }>();
  for (const c of cases) {
    const g = byFacility.get(c.provider.id) ?? { name: c.provider.name, items: [] as typeof cases };
    g.items.push(c);
    byFacility.set(c.provider.id, g);
  }
  const facilities = [...byFacility.values()].sort((a, b) => b.items.length - a.items.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BriefcaseMedical className="h-6 w-6 text-brand-secondary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Open Cases</h1>
            <p className="text-sm text-brand-text-muted">
              Clinical episodes accruing services, pre-auths and LOUs — each files as a single claim at closure.
              {" "}{cases.length} open.
            </p>
          </div>
        </div>
        <Link
          href="/cases/new"
          className="flex items-center gap-2 rounded-full bg-brand-indigo px-6 py-2 font-semibold text-white shadow-sm hover:bg-brand-secondary"
        >
          <PlusCircle size={18} /> Open Case
        </Link>
      </div>

      {facilities.length === 0 && (
        <p className="rounded-lg border border-brand-border bg-brand-bg-alt/40 p-8 text-center text-sm text-brand-text-muted">
          No open cases. Open one when a member is admitted or starts a treatment episode.
        </p>
      )}

      <div className="space-y-4">
        {facilities.map((f) => (
          <section key={f.name} className="rounded-lg border border-brand-border bg-brand-bg-alt/40">
            <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
              <span className="flex items-center gap-2 font-heading font-semibold text-brand-text-heading">
                <Building2 className="h-4 w-4 text-brand-secondary" /> {f.name}
              </span>
              <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs font-bold text-brand-text-body">
                {f.items.length} open
              </span>
            </div>
            {/* Self-contained scrolling (issue-1 rule) */}
            <div className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain p-3">
              {f.items.map((c) => {
                const los = losDays(c.admissionDate);
                return (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}`}
                    className="block rounded-md border border-brand-border bg-brand-bg p-3 text-sm hover:border-brand-teal"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-brand-text-muted">{c.caseNumber}</span>
                      <span className="rounded-full bg-brand-bg-alt px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-text-muted">
                        {TYPE_LABEL[c.caseType] ?? c.caseType}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-medium text-brand-text-heading">
                        {c.member.firstName} {c.member.lastName}
                        <span className="ml-2 text-xs font-normal text-brand-text-muted">{c.member.memberNumber}</span>
                      </span>
                      <span className="font-semibold text-brand-text-heading">
                        {c.currency} {Number(c.accruedAmount).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-brand-text-muted">
                      {los !== null && (
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> LOS {los}d</span>
                      )}
                      <span>{c._count.serviceEntries} services</span>
                      <span>{c._count.preauths} PAs</span>
                      <span>{c._count.lous} LOUs</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
