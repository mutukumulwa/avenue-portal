import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createDrugExclusionAction, deactivateDrugExclusionAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Pill } from "lucide-react";

export default async function DrugExclusionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [clients, packages, exclusions] = await Promise.all([
    prisma.client.findMany({ where: { operatorTenantId: tenantId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.package.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.drugExclusion.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { client: { select: { name: true } } },
    }),
  ]);
  const packageName = new Map(packages.map((p) => [p.id, p.name]));

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Pill className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Drug Exclusions</h1>
          <p className="text-sm text-brand-text-muted">
            Excluded drugs are declined automatically at claim intake against
            ClaimLine drug codes, scoped per client and/or package. Empty scope =
            applies to everyone.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Exclude a drug</h2>
        <form action={createDrugExclusionAction} className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="drugCode">Drug code (ATC/NDC)</label>
            <input id="drugCode" name="drugCode" required className={inputCls} placeholder="N02BE01" />
          </div>
          <div>
            <label className={labelCls} htmlFor="drugName">Drug name (optional)</label>
            <input id="drugName" name="drugName" className={inputCls} placeholder="Paracetamol" />
          </div>
          <div>
            <label className={labelCls} htmlFor="clientId">Client scope</label>
            <select id="clientId" name="clientId" className={inputCls} defaultValue="">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="packageId">Package scope</label>
            <select id="packageId" name="packageId" className={inputCls} defaultValue="">
              <option value="">All packages</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="reason">Reason</label>
            <input id="reason" name="reason" className={inputCls} placeholder="Not covered under scheme formulary" />
          </div>
          <div className="col-span-2 flex justify-end">
            <SubmitButton>Add exclusion</SubmitButton>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Client</th>
              <th className="px-4 py-2.5">Package</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {exclusions.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-text-muted">No drug exclusions configured.</td></tr>
            ) : exclusions.map((e) => (
              <tr key={e.id} className={e.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-mono font-medium text-brand-text-heading">{e.drugCode}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{e.drugName ?? "—"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{e.client?.name ?? "All"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{e.packageId ? (packageName.get(e.packageId) ?? e.packageId) : "All"}</td>
                <td className="px-4 py-2.5 text-brand-text-muted">{e.reason ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${e.isActive ? "bg-brand-error/10 text-brand-error" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {e.isActive ? "Excluded" : "Ended"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {e.isActive && (
                    <form action={deactivateDrugExclusionAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-xs font-semibold text-brand-error hover:underline">End</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
