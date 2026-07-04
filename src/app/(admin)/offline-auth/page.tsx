import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ProvidersService } from "@/server/services/providers.service";
import { OfflineAuthService } from "@/server/services/offline-auth.service";
import { issueOfflineCodeAction, revokeOfflineCodeAction } from "./actions";
import { KeyRound, PhoneCall, ShieldOff } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  REVOKED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXHAUSTED: "bg-[#FFC107]/10 text-[#856404]",
};

export default async function OfflineAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ issued?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;
  const { issued } = await searchParams;

  const [codes, providers] = await Promise.all([
    OfflineAuthService.listForTenant(tenantId),
    prisma.provider.findMany({
      // PR-006: only operational providers are selectable for new encounters.
      where: ProvidersService.operationalWhere(tenantId),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const justIssued = issued ? codes.find((c) => c.id === issued) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Offline Work Codes</h1>
          <p className="text-sm text-brand-text-muted">
            A facility that cannot reach the system calls the claims desk; issue a
            time-boxed code here and read it out over the phone. The code unlocks
            offline capture at that facility and gates its encrypted data pack.
          </p>
        </div>
      </div>

      {justIssued && (
        <div className="rounded-lg border border-[#28A745]/40 bg-[#28A745]/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-text-heading">
            <PhoneCall className="h-4 w-4 text-[#28A745]" />
            Read this code out to {justIssued.contactName || "the caller"} at {justIssued.provider.name}:
          </p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-brand-text-heading">
            {justIssued.code}
          </p>
          <p className="mt-2 text-xs text-brand-text-muted">
            Valid until {justIssued.validUntil.toLocaleString()}. Delivery is off-system —
            phone and/or SMS only. It is shown in full only on this screen.
          </p>
        </div>
      )}

      {/* Issue form */}
      <form
        action={issueOfflineCodeAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-brand-border bg-brand-bg-alt/40 p-4 md:grid-cols-3"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
          Facility *
          <select name="providerId" required className="rounded-md border border-[#D6DCE5] px-2 py-2 text-sm text-brand-text-body">
            <option value="">Select facility…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
          Caller name
          <input name="contactName" placeholder="Who called from the facility" className="rounded-md border border-[#D6DCE5] px-2 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
          Caller phone
          <input name="contactPhone" placeholder="+2547…" className="rounded-md border border-[#D6DCE5] px-2 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted md:col-span-2">
          Reason for offline work
          <input name="reason" placeholder="e.g. fibre cut at facility" className="rounded-md border border-[#D6DCE5] px-2 py-2 text-sm" />
        </label>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-brand-text-muted">
            Validity (hours)
            <input name="validityHours" type="number" defaultValue={48} min={1} max={168} className="w-24 rounded-md border border-[#D6DCE5] px-2 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-full bg-brand-indigo px-6 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
            Issue code
          </button>
        </div>
      </form>

      {/* Register — self-contained scrolling (issue-1 rule) */}
      <div className="rounded-lg border border-brand-border bg-white shadow-sm">
        <div className="max-h-[55vh] overflow-y-auto overscroll-contain">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#E6E7E8] text-xs font-semibold uppercase text-[#6C757D]">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Issued by</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Valid until</th>
                <th className="px-4 py-3">Ops synced</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {codes.map((c) => (
                <tr key={c.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-3 font-mono font-semibold text-brand-text-heading">
                    {c.status === "ACTIVE" ? c.code : `OWA-····${c.code.slice(-2)}`}
                  </td>
                  <td className="px-4 py-3">{c.provider.name}</td>
                  <td className="px-4 py-3">{c.issuedBy.firstName} {c.issuedBy.lastName}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.contactName || "—"}{c.contactPhone ? ` · ${c.contactPhone}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs">{c.validUntil.toLocaleString()}</td>
                  <td className="px-4 py-3">{c._count.syncOperations}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE[c.status] ?? ""}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "ACTIVE" && (
                      <form action={revokeOfflineCodeAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC3545] hover:underline">
                          <ShieldOff className="h-3 w-3" /> Revoke
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-brand-text-muted">
                    No codes issued yet.
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
