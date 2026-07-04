import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ProvidersService } from "@/server/services/providers.service";
import { openCaseAction } from "../actions";
import { BriefcaseMedical, ArrowLeft } from "lucide-react";
import Link from "next/link";

const CASE_TYPES = ["INPATIENT_ADMISSION", "OUTPATIENT_EPISODE", "MATERNITY", "DAY_CASE", "CHRONIC_CYCLE"];
const BENEFITS = ["INPATIENT", "OUTPATIENT", "MATERNITY", "SURGICAL", "DENTAL", "OPTICAL", "CHRONIC_DISEASE"];

export default async function NewCasePage() {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const [providers, members] = await Promise.all([
    prisma.provider.findMany({ where: ProvidersService.operationalWhere(tenantId), select: { id: true, name: true }, orderBy: { name: "asc" } }), // PR-006: operational only
    prisma.member.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { memberNumber: true, firstName: true, lastName: true },
      orderBy: { memberNumber: "asc" },
      take: 1000,
    }),
  ]);

  const input = "w-full rounded-md border border-[#D6DCE5] px-3 py-2 text-sm text-brand-text-body outline-none focus:border-brand-teal";
  const label = "flex flex-col gap-1 text-xs font-semibold text-brand-text-muted";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/cases" className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-secondary">
        <ArrowLeft className="h-4 w-4" /> Back to open cases
      </Link>
      <div className="flex items-center gap-3">
        <BriefcaseMedical className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Open a Case</h1>
          <p className="text-sm text-brand-text-muted">
            Start the clinical episode — services logged during the stay accrue here and file as one claim.
          </p>
        </div>
      </div>

      <form action={openCaseAction} className="grid grid-cols-1 gap-4 rounded-lg border border-brand-border bg-white p-6 shadow-sm md:grid-cols-2">
        <label className={label}>
          Member number *
          <input name="memberNumber" required list="case-members" placeholder="MVX-2026-00001" className={input} />
          <datalist id="case-members">
            {members.map((m) => (
              <option key={m.memberNumber} value={m.memberNumber}>{m.firstName} {m.lastName}</option>
            ))}
          </datalist>
        </label>
        <label className={label}>
          Facility *
          <select name="providerId" required className={input}>
            <option value="">Select facility…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className={label}>
          Case type *
          <select name="caseType" required className={input} defaultValue="INPATIENT_ADMISSION">
            {CASE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label className={label}>
          Benefit *
          <select name="benefitCategory" required className={input} defaultValue="INPATIENT">
            {BENEFITS.map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label className={label}>
          Admission date
          <input name="admissionDate" type="date" className={input} />
        </label>
        <label className={label}>
          Expected discharge
          <input name="expectedDischargeDate" type="date" className={input} />
        </label>
        <label className={label}>
          Attending doctor
          <input name="attendingDoctor" placeholder="Dr …" className={input} />
        </label>
        <label className={label}>
          Estimated cost
          <input name="estimatedCost" type="number" min="0" className={input} />
        </label>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="rounded-full bg-brand-indigo px-8 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-secondary">
            Open case
          </button>
        </div>
      </form>
    </div>
  );
}
