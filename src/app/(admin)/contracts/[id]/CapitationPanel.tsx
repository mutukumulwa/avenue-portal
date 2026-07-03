import { prisma } from "@/lib/prisma";
import {
  addCapitationRuleAction, addContractPackageAction,
  deactivateContractPackageAction, deactivatePricingRuleAction,
} from "./manage-actions";

const inp = "rounded border border-gray-200 px-2 py-1 text-xs";
const lbl = "flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-[#6C757D]";

const CAPITATION_KINDS = ["CAPITATION", "PER_VISIT_CASE_RATE", "AVERAGE_COST_POOL"];

/**
 * Capitation & case-rate setup + display (WP-E4, TPA-confirmed): where a
 * capitation model exists, the covered package list and the capitation amount
 * live on the contract. Deep capitation (pool accounting, PMPM invoicing,
 * settlement) is a later workstream.
 */
export async function CapitationPanel({
  contractId, contractType, editable,
}: {
  contractId: string; contractType: string; editable: boolean;
}) {
  const [rules, packages] = await Promise.all([
    prisma.pricingRule.findMany({
      where: { contractId, isActive: true, ruleKind: { in: CAPITATION_KINDS as never } },
      orderBy: { priority: "asc" },
    }),
    prisma.contractPackage.findMany({
      where: { contractId, isActive: true },
      include: { components: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const isCapitationContract =
    rules.length > 0 || packages.length > 0 || contractType === "CASE_RATE_AGREEMENT";
  // FFS-only contracts show no empty capitation panel (WP-E4 acceptance) —
  // unless the contract is editable, where the setup form must be reachable.
  if (!isCapitationContract && !editable) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-[#000523] mb-3">Capitation &amp; case-rate packages</h2>

      {/* Capitation arrangements */}
      {rules.length === 0 ? (
        <p className="text-xs text-[#6C757D]">No capitation or case-rate arrangement on this contract.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => {
            const p = (r.params ?? {}) as { amount?: number; currency?: string; per?: string; poolId?: string; carveOutCodes?: string[]; rate?: number };
            return (
              <li key={r.id} className="flex items-start justify-between rounded-lg border border-[#6610F2]/20 bg-[#6610F2]/5 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-[#000523]">{r.ruleKind.replace(/_/g, " ")}</span>
                  {p.amount != null && (
                    <span className="ml-2 font-bold text-[#6610F2]">
                      {p.currency ?? ""} {Number(p.amount).toLocaleString()}
                      <span className="ml-1 text-xs font-normal text-[#6C757D]">
                        {p.per === "MEMBER_PER_YEAR" ? "per member / year" : "per member / month"}
                      </span>
                    </span>
                  )}
                  {p.rate != null && <span className="ml-2 font-bold text-[#6610F2]">{Number(p.rate).toLocaleString()} per visit</span>}
                  {p.poolId && <span className="ml-2 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#6C757D]">{p.poolId}</span>}
                  {p.carveOutCodes?.length ? (
                    <p className="mt-1 text-xs text-[#6C757D]">Carve-outs (billed FFS): {p.carveOutCodes.join(", ")}</p>
                  ) : null}
                </div>
                {editable && (
                  <form action={deactivatePricingRuleAction}>
                    <input type="hidden" name="contractId" value={contractId} />
                    <input type="hidden" name="ruleId" value={r.id} />
                    <button className="text-xs font-semibold text-[#DC3545] hover:underline">remove</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <form action={addCapitationRuleAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
          <input type="hidden" name="contractId" value={contractId} />
          <label className={lbl}>Capitation amount *<input name="amount" type="number" step="0.01" min="0.01" required className={`${inp} w-28`} /></label>
          <label className={lbl}>Per *
            <select name="per" required className={inp}>
              <option value="MEMBER_PER_MONTH">member / month</option>
              <option value="MEMBER_PER_YEAR">member / year</option>
            </select>
          </label>
          <label className={lbl}>Pool id<input name="poolId" placeholder="auto" className={`${inp} w-28`} /></label>
          <label className={lbl}>Carve-outs (comma codes)<input name="carveOutCodes" placeholder="MRI, CT, DIALYSIS" className={`${inp} w-44`} /></label>
          <button className="rounded bg-[#6610F2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#560bd0]">Add capitation</button>
        </form>
      )}

      {/* Covered package list */}
      <h3 className="mt-5 mb-2 text-xs font-semibold uppercase text-[#6C757D]">Package list ({packages.length})</h3>
      {packages.length === 0 ? (
        <p className="text-xs text-[#6C757D]">No packages listed.</p>
      ) : (
        <div className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain">
          {packages.map((pkg) => (
            <div key={pkg.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#000523]">
                  {pkg.name}
                  {pkg.code && <span className="ml-1 font-mono text-xs text-[#6C757D]">({pkg.code})</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-bold text-[#000523]">
                    {Number(pkg.packagePrice) > 0
                      ? `${pkg.currency} ${Number(pkg.packagePrice).toLocaleString()}`
                      : "covered by capitation"}
                  </span>
                  {editable && (
                    <form action={deactivateContractPackageAction}>
                      <input type="hidden" name="contractId" value={contractId} />
                      <input type="hidden" name="packageId" value={pkg.id} />
                      <button className="text-xs font-semibold text-[#DC3545] hover:underline">remove</button>
                    </form>
                  )}
                </span>
              </div>
              {pkg.components.length > 0 && (
                <p className="mt-1 text-xs text-[#6C757D]">
                  {pkg.components.filter((x) => x.type === "INCLUDED").map((x) => x.description).join(" · ") || "—"}
                  {pkg.components.some((x) => x.type === "EXCLUDED") && (
                    <span className="text-[#9a4b06]">
                      {" "}| excluded: {pkg.components.filter((x) => x.type === "EXCLUDED").map((x) => x.description).join(", ")}
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <form action={addContractPackageAction} className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 md:grid-cols-4">
          <input type="hidden" name="contractId" value={contractId} />
          <label className={lbl}>Package name *<input name="name" required placeholder="OP capitation package" className={inp} /></label>
          <label className={lbl}>Code<input name="code" placeholder="CAP-OP" className={inp} /></label>
          <label className={lbl}>Per-episode price (0 = covered)<input name="packagePrice" type="number" step="0.01" min="0" defaultValue={0} className={inp} /></label>
          <label className={lbl}>Trigger names (one per line)<textarea name="triggerCodes" rows={2} className={inp} /></label>
          <label className={`${lbl} col-span-2`}>Included services (one per line)<textarea name="includedComponents" rows={2} className={inp} /></label>
          <label className={`${lbl} col-span-2`}>Excluded / carve-out (one per line)<textarea name="excludedComponents" rows={2} className={inp} /></label>
          <div className="col-span-2 md:col-span-4">
            <button className="rounded bg-[#000523] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#142150]">Add package</button>
          </div>
        </form>
      )}
    </section>
  );
}
