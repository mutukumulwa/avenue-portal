import { prisma } from "@/lib/prisma";
import { formatPricingRule } from "@/lib/format-pricing-rule";
import {
  addApplicabilityAction, attachBranchAction, detachBranchAction,
  createProviderBranchAction, addTariffLineAction, deactivateTariffAction, addExclusionAction,
  addPricingRuleAction, deactivatePricingRuleAction,
} from "./manage-actions";

const inp = "rounded border border-gray-200 px-2 py-1 text-xs";

// Management widgets for a contract (spec §11.2/§11.4/§11.5). Add/remove forms
// are shown only while the contract is editable (DRAFT / PENDING_CLARIFICATION).
export async function ManagePanel({
  contractId, providerId, branchScope, editable,
}: {
  contractId: string; providerId: string; branchScope: string; editable: boolean;
}) {
  const [clients, branches, contractBranches, tariffs, exclusions, pricingRules] = await Promise.all([
    prisma.client.findMany({ where: { operatorTenant: { providers: { some: { id: providerId } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => []),
    prisma.providerBranch.findMany({ where: { providerId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractBranch.findMany({ where: { contractId }, include: { branch: { select: { name: true } } } }),
    prisma.providerTariff.findMany({ where: { contractId, isActive: true }, orderBy: { serviceName: "asc" } }),
    prisma.providerContractExclusion.findMany({ where: { contractId } }),
    prisma.pricingRule.findMany({ where: { contractId, isActive: true }, orderBy: { priority: "asc" } }),
  ]);

  const hiddenId = <input type="hidden" name="contractId" value={contractId} />;

  return (
    <div className="space-y-6 mt-6">
      {/* Tariffs */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#000523] mb-3">Tariff lines ({tariffs.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[#6C757D]"><tr><th className="py-1">Service</th><th className="py-1">Type</th><th className="py-1">UoM</th><th className="py-1 text-right">Rate</th><th className="py-1">PA</th>{editable && <th />}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {tariffs.map(t => (
                <tr key={t.id} className={t.rateMissing ? "bg-[#FFF8E1]" : ""}>
                  <td className="py-1">{t.serviceName}{t.cptCode ? ` (${t.cptCode})` : ""}</td>
                  <td className="py-1 text-[#6C757D]">{t.rateType}</td>
                  <td className="py-1 text-[#6C757D]">{t.unitOfMeasure}</td>
                  <td className="py-1 text-right">{t.rateMissing ? <span className="text-[#DC3545]">missing</span> : Number(t.agreedRate).toLocaleString()}</td>
                  <td className="py-1">{t.requiresPreauth ? "✓" : ""}</td>
                  {editable && (
                    <td className="py-1 text-right">
                      <form action={deactivateTariffAction}>{hiddenId}<input type="hidden" name="tariffId" value={t.id} /><button className="text-[#DC3545]">remove</button></form>
                    </td>
                  )}
                </tr>
              ))}
              {tariffs.length === 0 && <tr><td colSpan={6} className="py-2 text-[#6C757D]">No tariff lines yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {editable && (
          <form action={addTariffLineAction} className="mt-3 flex flex-wrap items-end gap-2">
            {hiddenId}
            <input name="serviceName" placeholder="Service name" required className={inp} />
            <input name="cptCode" placeholder="Code" className={`${inp} w-20`} />
            <input name="agreedRate" type="number" step="0.01" placeholder="Rate" className={`${inp} w-24`} />
            <select name="rateType" className={inp} defaultValue="FIXED" title="How this line is priced">
              <option value="FIXED">Fee-for-service (fixed)</option>
              <option value="PER_DIEM">Per diem</option>
              <option value="DISCOUNT_OFF_BILLED">Discount off billed</option>
              <option value="MARKUP_OVER_COST">Markup over cost</option>
              <option value="NET_OF_EXTERNAL">Net of external scheme</option>
              <option value="EXTERNAL_TARIFF_REF">External tariff reference</option>
            </select>
            <select name="unitOfMeasure" className={inp} defaultValue="PER_ITEM">
              {["PER_ITEM", "PER_DAY", "PER_VISIT", "PER_HOUR", "PER_SESSION", "PER_EPISODE"].map(x => <option key={x}>{x}</option>)}
            </select>
            <input name="maxQuantityPerVisit" type="number" placeholder="max qty" className={`${inp} w-20`} />
            <label className="flex items-center gap-1 text-xs text-[#6C757D]"><input type="checkbox" name="requiresPreauth" /> PA</label>
            <label className="flex items-center gap-1 text-xs text-[#6C757D]"><input type="checkbox" name="requiresReferral" /> referral</label>
            <label className="flex items-center gap-1 text-xs text-[#6C757D]"><input type="checkbox" name="rateMissing" /> rate-missing</label>
            <button className="rounded bg-[#06B9AB] px-3 py-1 text-xs font-medium text-white">Add</button>
          </form>
        )}
      </section>

      {/* Applicability */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#000523] mb-3">Applicability (payers / schemes)</h2>
        {editable && (
          <form action={addApplicabilityAction} className="mb-3 flex flex-wrap items-end gap-2">
            {hiddenId}
            <select name="clientId" required className={inp} defaultValue="">
              <option value="" disabled>Payer…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input name="benefitCategory" placeholder="Benefit (opt)" className={inp} />
            <input name="memberCategory" placeholder="Member category (opt)" className={inp} />
            <select name="inclusionType" className={inp} defaultValue="INCLUDE"><option>INCLUDE</option><option>EXCLUDE</option></select>
            <button className="rounded bg-[#06B9AB] px-3 py-1 text-xs font-medium text-white">Add</button>
          </form>
        )}
        <p className="text-xs text-[#6C757D]">{clients.length === 0 ? "No payers available for this provider's tenant." : "Add ≥1 payer row (required to activate — V1)."}</p>
      </section>

      {/* Branches (LISTED only) */}
      {branchScope === "LISTED" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#000523] mb-3">Covered branches</h2>
          <ul className="mb-3 space-y-1 text-xs">
            {contractBranches.map(cb => (
              <li key={cb.id} className="flex items-center justify-between">
                <span>{cb.branch.name}</span>
                {editable && <form action={detachBranchAction}>{hiddenId}<input type="hidden" name="contractBranchId" value={cb.id} /><button className="text-[#DC3545]">remove</button></form>}
              </li>
            ))}
            {contractBranches.length === 0 && <li className="text-[#6C757D]">None attached — LISTED scope requires ≥1 (V1).</li>}
          </ul>
          {editable && (
            <div className="flex flex-wrap gap-4">
              <form action={attachBranchAction} className="flex items-end gap-2">
                {hiddenId}
                <select name="branchId" className={inp} defaultValue=""><option value="" disabled>Attach branch…</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                <button className="rounded bg-[#06B9AB] px-3 py-1 text-xs font-medium text-white">Attach</button>
              </form>
              <form action={createProviderBranchAction} className="flex items-end gap-2">
                {hiddenId}
                <input name="name" placeholder="New branch name" className={inp} />
                <input name="code" placeholder="code" className={`${inp} w-20`} />
                <button className="rounded border border-gray-200 px-3 py-1 text-xs">Create + attach later</button>
              </form>
            </div>
          )}
        </section>
      )}

      {/* Pricing rules — builder */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#000523] mb-3">Pricing rules ({pricingRules.length})</h2>
        {/* PR-008: operator-language rendering with a raw view for support. */}
        <ul className="mb-3 space-y-1.5 text-xs">
          {pricingRules.map(r => (
            <li key={r.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[#6C757D]">{r.scope === "CONTRACT" ? "Whole contract" : r.scope.replace(/_/g, " ").toLowerCase()} · </span>
                <span className="font-medium text-[#000523]">{formatPricingRule(r)}</span>
                <details className="inline-block ml-2 align-baseline">
                  <summary className="cursor-pointer text-[10px] text-[#6C757D] underline decoration-dotted inline">raw</summary>
                  <code className="block mt-1 rounded bg-[#F8F9FA] px-2 py-1 text-[10px] text-[#6C757D] break-all">{r.ruleKind} {JSON.stringify(r.params)}</code>
                </details>
              </div>
              {editable && <form action={deactivatePricingRuleAction}>{hiddenId}<input type="hidden" name="ruleId" value={r.id} /><button className="text-[#DC3545] shrink-0">remove</button></form>}
            </li>
          ))}
          {pricingRules.length === 0 && <li className="text-[#6C757D]">No pricing rules — line tariffs price directly.</li>}
        </ul>
        {editable && (
          <form action={addPricingRuleAction} className="flex flex-wrap items-end gap-2">
            {hiddenId}
            <select name="ruleKind" className={inp} defaultValue="PER_VISIT_CASE_RATE" title="Whole-contract pricing model">
              <option value="PER_VISIT_CASE_RATE">Case rate (fixed per visit)</option>
              <option value="CAPITATION">Capitation (prepaid, 0 per encounter)</option>
              <option value="AVERAGE_COST_POOL">Average-cost pool (reconciled)</option>
              <option value="DISCOUNT_OFF_BILLED">Discount off billed</option>
              <option value="PER_DIEM">Per diem</option>
              <option value="PACKAGE">Package</option>
            </select>
            <input name="rate" type="number" step="0.01" placeholder="rate" className={`${inp} w-24`} />
            <input name="pct" type="number" step="0.01" placeholder="pct" className={`${inp} w-16`} />
            <input name="poolId" placeholder="poolId" className={`${inp} w-24`} />
            <input name="carveOutDescriptions" placeholder="carve-outs (comma)" className={`${inp} w-40`} />
            <button className="rounded bg-[#06B9AB] px-3 py-1 text-xs font-medium text-white">Add rule</button>
          </form>
        )}
      </section>

      {/* Exclusions */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#000523] mb-3">Exclusions ({exclusions.length})</h2>
        <ul className="mb-3 space-y-1 text-xs">
          {exclusions.map(e => <li key={e.id} className="text-[#6C757D]">{e.serviceName}{e.reason ? ` — ${e.reason}` : ""}</li>)}
          {exclusions.length === 0 && <li className="text-[#6C757D]">No exclusions.</li>}
        </ul>
        {editable && (
          <form action={addExclusionAction} className="flex flex-wrap items-end gap-2">
            {hiddenId}
            <input name="serviceName" placeholder="Excluded service" required className={inp} />
            <input name="cptCode" placeholder="code" className={`${inp} w-20`} />
            <input name="reason" placeholder="reason" className={inp} />
            <button className="rounded bg-[#06B9AB] px-3 py-1 text-xs font-medium text-white">Add</button>
          </form>
        )}
      </section>
    </div>
  );
}
