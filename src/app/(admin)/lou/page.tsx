import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { LouService } from "@/server/services/case.service";
import { issueLouAction, cancelLouAction } from "./actions";
import { FileSignature } from "lucide-react";
import Link from "next/link";

const BADGE: Record<string, string> = {
  DRAFT: "bg-[#6C757D]/10 text-[#6C757D]",
  ISSUED: "bg-[#17A2B8]/10 text-[#17A2B8]",
  UTILISED: "bg-[#28A745]/10 text-[#28A745]",
  EXHAUSTED: "bg-[#FFC107]/10 text-[#856404]",
  CANCELLED: "bg-[#DC3545]/10 text-[#DC3545]",
};

export default async function LouRegisterPage() {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const [lous, providers, members] = await Promise.all([
    LouService.list(tenantId),
    prisma.provider.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.member.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { memberNumber: true, firstName: true, lastName: true },
      orderBy: { memberNumber: "asc" },
      take: 1000,
    }),
  ]);

  const input = "rounded-md border border-[#D6DCE5] px-2 py-2 text-sm text-brand-text-body outline-none focus:border-brand-teal";
  const label = "flex flex-col gap-1 text-xs font-semibold text-brand-text-muted";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileSignature className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Letters of Undertaking</h1>
          <p className="text-sm text-brand-text-muted">
            Payer undertakings issued to facilities for admissions — attach to a case so they file with the claim.
          </p>
        </div>
      </div>

      {/* Issue form */}
      <form action={issueLouAction} className="grid grid-cols-1 gap-3 rounded-lg border border-brand-border bg-brand-bg-alt/40 p-4 md:grid-cols-5">
        <label className={label}>Member number *
          <input name="memberNumber" required list="lou-members" placeholder="MVX-2026-00001" className={input} />
          <datalist id="lou-members">
            {members.map((m) => <option key={m.memberNumber} value={m.memberNumber}>{m.firstName} {m.lastName}</option>)}
          </datalist>
        </label>
        <label className={label}>Facility *
          <select name="providerId" required className={input}>
            <option value="">Select…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className={label}>Amount ceiling *
          <input name="amountCeiling" type="number" min="1" required className={input} />
        </label>
        <label className={label}>Valid (days)
          <input name="validityDays" type="number" min="1" defaultValue={30} className={input} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="rounded-full bg-brand-indigo px-6 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
            Issue LOU
          </button>
        </div>
      </form>

      {/* Register — self-contained scrolling (issue-1 rule) */}
      <div className="rounded-lg border border-brand-border bg-white shadow-sm">
        <div className="max-h-[55vh] overflow-y-auto overscroll-contain">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#E6E7E8] text-xs font-semibold uppercase text-[#6C757D]">
                <th className="px-4 py-3">LOU No.</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3 text-right">Ceiling</th>
                <th className="px-4 py-3">Valid until</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {lous.map((l) => (
                <tr key={l.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-3 font-mono font-semibold text-brand-text-heading">{l.louNumber}</td>
                  <td className="px-4 py-3">
                    {l.member.firstName} {l.member.lastName}
                    <span className="ml-1 text-xs text-brand-text-muted">{l.member.memberNumber}</span>
                  </td>
                  <td className="px-4 py-3">{l.provider.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{l.case?.caseNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{l.currency} {Number(l.amountCeiling).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">{l.validUntil?.toISOString().slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${BADGE[l.status] ?? ""}`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === "ISSUED" && (
                      <form action={cancelLouAction}>
                        <input type="hidden" name="louId" value={l.id} />
                        <button type="submit" className="text-xs font-semibold text-[#DC3545] hover:underline">Cancel</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {lous.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-brand-text-muted">
                    No letters of undertaking yet. Issue one above, or from an open <Link href="/cases" className="text-brand-indigo hover:underline">case</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
