"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ShieldCheck, ShieldOff, X, AlertTriangle } from "lucide-react";
import { createProviderEligibilityAction, retireProviderEligibilityAction } from "./actions";
import type { ActionResult } from "@/lib/action-result";
import {
  PROVIDER_RULE_RANK,
  detectProviderRuleConflicts,
  rankOf,
  resolveProviderRule,
} from "@/lib/provider-precedence";

type EligibilityRule = {
  id: string;
  inclusionType: "INCLUDE" | "EXCLUDE";
  providerId: string | null;
  providerTier: string | null;
  providerName?: string | null;
  priority?: number | null;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
  isActive?: boolean | null;
};

type ProviderRef = { id: string; name: string; tier: string };

const TIERS = ["OWN", "PARTNER", "PANEL"] as const;

export function ProviderEligibilityManager({
  packageId,
  draftVersionNumber,
  liveVersionNumber,
  initialRules,
  availableProviders,
}: {
  packageId: string;
  /** The open DRAFT's number, when one exists. */
  draftVersionNumber: number | null;
  /** The version members are actually on right now. */
  liveVersionNumber: number | null;
  initialRules: EligibilityRule[];
  availableProviders: ProviderRef[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [ruleType, setRuleType] = useState<"provider" | "tier">("provider");
  const [retiring, setRetiring] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [state, formAction, creating] = useActionState<ActionResult, FormData>(
    async (_prev, fd) => {
      const result = await createProviderEligibilityAction(_prev, fd);
      if (result.ok) {
        setAdding(false);
        startTransition(() => router.refresh());
      }
      return result;
    },
    { ok: true },
  );

  const formError = state.ok ? undefined : state.formError;
  const providerErr = state.ok ? undefined : state.fieldErrors?.providerId?.[0];

  // P09.04 (DEF-055): the native browser confirm is gone. It could not name what
  // it was removing, could not take a reason, and appeared AFTER activation —
  // "the only disclosure of intent is the native browser confirm that appears
  // after activation". An in-page form can do all three.
  const [retireState, retireAction, retiringNow] = useActionState<ActionResult, FormData>(
    async (_prev, fd) => {
      const result = await retireProviderEligibilityAction(_prev, fd);
      if (result.ok) {
        setRetiring(null);
        startTransition(() => router.refresh());
      }
      return result;
    },
    { ok: true },
  );
  const retireError = retireState.ok ? undefined : (retireState.formError ?? retireState.fieldErrors?.reason?.[0]);

  const includes = initialRules.filter(r => r.inclusionType === "INCLUDE");
  const excludes = initialRules.filter(r => r.inclusionType === "EXCLUDE");

  const ruleLabel = (r: EligibilityRule) =>
    r.providerName ?? (r.providerTier ? `All ${r.providerTier} tier providers` : r.providerId ?? "—");

  // ── P09.05 / DEC-04 (DEF-054) ──────────────────────────────────────────────
  // The run scanned this screen for "wins / takes precedence / overrides /
  // priority / order" and found nothing. Everything below answers that, using
  // the SAME module the evaluator uses — not a second implementation.

  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-UG", { day: "2-digit", month: "2-digit", year: "numeric" });

  const conflicts = detectProviderRuleConflicts(initialRules);

  const RANK_LABEL: Record<number, string> = {
    [PROVIDER_RULE_RANK.SPECIFIC_EXCLUDE]: "1st — beats everything",
    [PROVIDER_RULE_RANK.SPECIFIC_INCLUDE]: "2nd — beats tier rules",
    [PROVIDER_RULE_RANK.TIER]: "3rd — lowest",
  };

  const tierOf = new Map(availableProviders.map(p => [p.id, p.tier]));

  /**
   * What this rule actually does once precedence is applied.
   *
   * A tier rule that is overridden for a named provider is the case the run hit,
   * and saying so on the row is the difference between a list of rules and an
   * answer to "is that hospital payable".
   */
  const effectOf = (r: EligibilityRule): string | null => {
    if (r.providerId) {
      const tier = tierOf.get(r.providerId);
      const tierRule = tier
        ? initialRules.find(o => o.providerTier === tier && o.inclusionType !== r.inclusionType)
        : undefined;
      if (tierRule) {
        return `Overrides "${ruleLabel(tierRule)}" for this provider — naming a provider beats a tier rule.`;
      }
      return null;
    }

    // A tier rule: list the named providers that escape it.
    const overridden = initialRules.filter(
      o => o.providerId && o.inclusionType !== r.inclusionType && tierOf.get(o.providerId) === r.providerTier,
    );
    if (overridden.length === 0) return null;
    return `Does not apply to ${overridden.map(ruleLabel).join(", ")} — a rule naming a provider wins.`;
  };

  /**
   * The verdict for every provider a rule names, plus every provider in a tier a
   * rule names. Computed by `resolveProviderRule` — the same function the
   * adjudication engine calls — so the screen cannot say one thing and the claim
   * decide another.
   */
  const namedProviderIds = new Set(initialRules.map(r => r.providerId).filter((id): id is string => !!id));
  const namedTiers = new Set(initialRules.map(r => r.providerTier).filter((t): t is string => !!t));
  const effectiveVerdicts = availableProviders
    .filter(p => namedProviderIds.has(p.id) || namedTiers.has(p.tier))
    .map(p => {
      const verdict = resolveProviderRule(initialRules, { id: p.id, tier: p.tier });
      const winner = verdict.winningRuleId
        ? initialRules.find(r => r.id === verdict.winningRuleId)
        : undefined;
      const why =
        verdict.decision === "AMBIGUOUS"
          ? "two rules of equal precedence disagree, so this goes to manual review"
          : verdict.decision === "NOT_LISTED"
            ? "not named by any INCLUDE rule, and this package uses a whitelist"
            : winner
              ? `${winner.inclusionType === "EXCLUDE" ? "excluded" : "included"} by "${ruleLabel(winner)}"`
              : "no rule applies";
      return { id: p.id, name: p.name, payable: verdict.payable, why };
    });

  const RuleRow = ({ r, tone }: { r: EligibilityRule; tone: "include" | "exclude" }) => {
    const rank = rankOf(r);
    const effect = effectOf(r);
    const inConflict = conflicts.some(c => c.ruleIds.includes(r.id));
    const border = tone === "include" ? "bg-[#28A745]/5 border-[#28A745]/20" : "bg-[#DC3545]/5 border-[#DC3545]/20";
    const Icon = tone === "include" ? ShieldCheck : ShieldOff;
    const iconColour = tone === "include" ? "text-[#28A745]" : "text-[#DC3545]";

    return (
      <div className={`rounded px-3 py-2 border ${inConflict ? "bg-amber-50 border-amber-400" : border}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Icon size={14} className={iconColour} />
            <span className="font-semibold text-brand-text-heading truncate">{ruleLabel(r)}</span>
            {rank !== null && (
              <span className="shrink-0 text-[10px] font-bold uppercase text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                Precedence {RANK_LABEL[rank]}
              </span>
            )}
            {(r.priority ?? 0) !== 0 && (
              <span className="shrink-0 text-[10px] font-bold uppercase text-gray-500">
                Priority {r.priority}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRetiring(retiring === r.id ? null : r.id)}
            disabled={isPending || retiringNow}
            aria-expanded={retiring === r.id}
            aria-label={`Withdraw rule: ${r.inclusionType} ${ruleLabel(r)}`}
            className="shrink-0 text-red-400 hover:bg-red-50 p-1.5 rounded disabled:opacity-40"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Sibling managers show "Effective 11/08/2026 -> —"; this one showed
            nothing at all, so a dated rule was indistinguishable from a
            permanent one (DEF-055 gap 1). */}
        <p className="text-[11px] text-brand-text-muted mt-1 pl-6">
          Effective {r.effectiveFrom ? fmtDate(r.effectiveFrom) : "when this version goes live"} →{" "}
          {r.effectiveTo ? fmtDate(r.effectiveTo) : "—"}
          {r.isActive === false && <span className="ml-2 font-semibold text-gray-500">Withdrawn</span>}
        </p>

        {effect && <p className="text-[11px] text-brand-text-muted mt-1 pl-6">{effect}</p>}

        {/* P09.04 (DEF-055 gap 4): a named, reasoned withdrawal in place of an
            unlabelled icon and a native confirm that said only "Remove this
            eligibility rule?" and captured nothing. */}
        {retiring === r.id && (
          <form action={retireAction} className="mt-3 border-t border-gray-200 pt-3 space-y-2">
            <input type="hidden" name="ruleId" value={r.id} />
            <label htmlFor={`retire-${r.id}`} className="block text-[11px] font-bold text-brand-text-heading">
              Withdraw “{ruleLabel(r)}” — why?
            </label>
            <p className="text-[11px] text-brand-text-muted">
              The rule is kept and its end date set, so a claim decided under it can
              still be explained. It stops applying once this draft is approved.
            </p>
            <div className="flex gap-2">
              <input
                id={`retire-${r.id}`}
                name="reason"
                type="text"
                required
                minLength={5}
                maxLength={200}
                placeholder="e.g. Contract with this facility ended"
                className="flex-1 border border-gray-300 px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-indigo"
              />
              <button
                type="button"
                onClick={() => setRetiring(null)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
              >
                Keep it
              </button>
              <button
                type="submit"
                disabled={retiringNow}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#DC3545] rounded hover:bg-[#c82333] disabled:opacity-60"
              >
                {retiringNow ? "Withdrawing…" : "Withdraw"}
              </button>
            </div>
            {retireError && (
              <p role="alert" className="text-[11px] text-[#DC3545] font-semibold">{retireError}</p>
            )}
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4 mt-6">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Provider Eligibility</h2>
        <button
          type="button"
          onClick={() => { setAdding(true); }}
          disabled={adding}
          className="text-xs bg-[#0B1437]/10 text-brand-indigo px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
        >
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {/* P09.04 (DEF-055 gap 2): the run added two rules and the package stayed
          "Current v5 / Total Versions 5, unchanged". Network changes are now
          versioned like every other coverage change, and the screen says which
          version it is editing and which one members are actually on. */}
      <div className={`rounded p-3 text-xs border ${draftVersionNumber ? "bg-[#17A2B8]/5 border-[#17A2B8]/30" : "bg-[#F8F9FA] border-[#EEEEEE]"}`}>
        {draftVersionNumber ? (
          <>
            <p className="font-semibold text-brand-text-heading">
              Editing draft v{draftVersionNumber}
              {liveVersionNumber !== null && <> · members are on v{liveVersionNumber}</>}
            </p>
            <p className="text-brand-text-muted mt-0.5">
              Nothing here reaches a member until this draft is approved and activated.
            </p>
          </>
        ) : (
          <p className="text-brand-text-muted">
            The first rule you add opens a new draft version.
            {liveVersionNumber !== null && <> Members stay on v{liveVersionNumber} until it is approved.</>}
          </p>
        )}
      </div>

      <div className="text-xs text-brand-text-muted space-y-1">
        <p>
          INCLUDE rules whitelist specific providers or tiers. EXCLUDE rules block them. If no INCLUDE rules exist, all active providers are allowed (subject to EXCLUDE rules).
        </p>
        <p>
          <strong className="text-brand-text-heading">When rules disagree, the more specific one wins.</strong>{" "}
          Highest precedence first: a rule that <em>excludes a named provider</em>, then one that{" "}
          <em>includes a named provider</em>, then any <em>tier</em> rule. So excluding one hospital
          from an included tier blocks it, and including one hospital from an excluded tier admits
          it. Two rules of the same kind on the same target cannot both be saved.
        </p>
      </div>

      {conflicts.length > 0 && (
        <div role="alert" className="border border-amber-400 bg-amber-50 rounded p-3 space-y-1">
          <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle size={14} /> {conflicts.length === 1 ? "A rule conflict has no winner" : `${conflicts.length} rule conflicts have no winner`}
          </p>
          {conflicts.map((c) => (
            <p key={c.ruleIds.join("-")} className="text-[11px] text-amber-900">
              {c.message}
            </p>
          ))}
          <p className="text-[11px] text-amber-900">
            Until this is resolved, care at the affected providers is sent for manual review rather
            than decided automatically.
          </p>
        </div>
      )}

      {adding && (
        <form action={formAction} className="bg-gray-50 border border-gray-200 rounded p-4 space-y-4">
          <input type="hidden" name="packageId" value={packageId} />

          {formError && <p role="alert" className="text-xs text-red-600 font-semibold">{formError}</p>}
          {providerErr && <p role="alert" className="text-xs text-red-600 font-semibold">{providerErr}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Rule Type</label>
              <select name="inclusionType" className="w-full border p-2 rounded text-sm">
                <option value="INCLUDE">INCLUDE — allow this provider/tier</option>
                <option value="EXCLUDE">EXCLUDE — block this provider/tier</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Target</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRuleType("provider")}
                  className={`flex-1 py-1.5 text-xs rounded font-bold border transition-colors ${ruleType === "provider" ? "bg-brand-indigo text-white border-brand-indigo" : "border-gray-200 text-gray-500"}`}>
                  Specific Provider
                </button>
                <button type="button" onClick={() => setRuleType("tier")}
                  className={`flex-1 py-1.5 text-xs rounded font-bold border transition-colors ${ruleType === "tier" ? "bg-brand-indigo text-white border-brand-indigo" : "border-gray-200 text-gray-500"}`}>
                  Provider Tier
                </button>
              </div>
            </div>
          </div>

          {ruleType === "provider" ? (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Provider</label>
              <select name="providerId" className="w-full border p-2 rounded text-sm">
                <option value="">Select provider…</option>
                {availableProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.tier})</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Provider Tier</label>
              <select name="providerTier" className="w-full border p-2 rounded text-sm">
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* P09.04 (DEF-055 gap 1): "The provider rule form has no date control at
              all, while sibling Treatment Exclusions and Referral Rules both
              display 'Effective 11/08/2026 -> —'." Both optional: blank "from"
              means in force as soon as this version activates, which is the
              common case and should stay one keystroke. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rule-effectiveFrom" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                Effective from
              </label>
              <input id="rule-effectiveFrom" name="effectiveFrom" type="date" className="w-full border p-2 rounded text-sm" />
              <p className="text-[10px] text-brand-text-muted mt-1">Blank = as soon as this version goes live.</p>
            </div>
            <div>
              <label htmlFor="rule-effectiveTo" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                Effective to
              </label>
              <input id="rule-effectiveTo" name="effectiveTo" type="date" className="w-full border p-2 rounded text-sm" />
              <p className="text-[10px] text-brand-text-muted mt-1">Blank = no end date.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={creating}
              className="px-3 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold hover:bg-blue-800 disabled:opacity-60">
              {creating ? "Saving…" : "Save Rule"}
            </button>
          </div>
        </form>
      )}

      {/* Excludes render FIRST because they outrank includes at the same
          specificity — the reading order now matches the deciding order. */}
      {excludes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-[#DC3545]">Excluded (blocklist)</p>
          {excludes.map(r => <RuleRow key={r.id} r={r} tone="exclude" />)}
        </div>
      )}

      {includes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-[#28A745]">Included (whitelist)</p>
          {includes.map(r => <RuleRow key={r.id} r={r} tone="include" />)}
        </div>
      )}

      {/* The answer the operator actually came for: for every provider named by
          a rule, is it payable? Resolved by the evaluator's own module. */}
      {initialRules.length > 0 && effectiveVerdicts.length > 0 && (
        <div className="border-t border-[#EEEEEE] pt-3 space-y-1">
          <p className="text-[10px] font-bold uppercase text-gray-500">Effective outcome</p>
          {effectiveVerdicts.map(v => (
            <p key={v.id} className="text-xs">
              <span className="font-semibold text-brand-text-heading">{v.name}</span>{" "}
              <span className={v.payable ? "text-[#28A745]" : "text-[#DC3545]"}>
                {v.payable ? "is payable" : "is not payable"}
              </span>
              <span className="text-brand-text-muted"> — {v.why}</span>
            </p>
          ))}
        </div>
      )}

      {initialRules.length === 0 && !adding && (
        <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-200 rounded">
          No eligibility rules — all active providers are allowed.
        </div>
      )}
    </div>
  );
}
