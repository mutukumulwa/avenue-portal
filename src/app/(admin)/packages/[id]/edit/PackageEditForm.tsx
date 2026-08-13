"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { updatePackageAction } from "./actions";
import type { ActionResult } from "@/lib/action-result";
import { BASE_CURRENCY } from "@/lib/utils";

const BENEFIT_CATEGORIES = [
  "INPATIENT", "OUTPATIENT", "MATERNITY", "DENTAL", "OPTICAL",
  "MENTAL_HEALTH", "CHRONIC_DISEASE", "SURGICAL", "AMBULANCE_EMERGENCY",
  "LAST_EXPENSE", "WELLNESS_PREVENTIVE", "REHABILITATION", "CUSTOM",
] as const;

type BenefitRow = {
  category: string;
  annualSubLimit: number;
  copayPercentage: number;
  waitingPeriodDays: number;
  waitingPeriodBasis: "COVER_START" | "DEPENDANT_JOIN" | "REINSTATEMENT" | "OTHER_APPROVED";
  perVisitLimit: number | null;
};

type PackageView = {
  name: string;
  description: string | null;
  status: string;
  type: string;
  annualLimit: number;
  contributionAmount: number;
  minAge: number;
  maxAge: number;
  dependentMaxAge: number;
  versionNumber: number;
};

const inputCls =
  "w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-brand-text-heading focus:ring-2 focus:ring-brand-indigo outline-none bg-white";
const labelCls = "block text-xs font-bold text-brand-text-muted uppercase mb-1";
const cellInputCls =
  "w-32 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-sm focus:ring-2 focus:ring-brand-indigo outline-none";

/**
 * WP-2.0 — the package-edit core form as a self-contained client `<form>`.
 *
 * Extracted from the page so it is NOT nested inside a wrapper form and the two
 * managers (SharedLimitsManager / ProviderEligibilityManager) can sit beside it
 * as sibling forms — that structural change is the real DEF-026 fix (nested
 * `<form>`s were dropped by the parser and posted to the wrong action).
 *
 * Uses `useActionState` so the SP-2 `ActionResult` field errors render adjacent
 * to inputs and the entered values are preserved on a validation failure.
 */
/** UAT-HF P09.06 — what archiving this package would affect, resolved server-side. */
export type ArchiveImpactView = {
  summary: string;
  inUse: boolean;
  /** Enrolled members — moving them is a cover change, so it is asked separately. */
  memberCount: number;
  schemes: { id: string; name: string; tierName?: string }[];
};

export function PackageEditForm({
  packageId,
  pkg,
  benefits,
  impact,
  successors,
}: {
  packageId: string;
  pkg: PackageView;
  benefits: BenefitRow[];
  impact: ArchiveImpactView;
  /** Active packages a migration may repoint dependencies onto (P09.06). */
  successors: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState(pkg.status);
  // Only the TRANSITION into archived is a destructive act; re-saving an
  // already-archived package is not, and must not be nagged.
  const archivingNow = status === "ARCHIVED" && pkg.status !== "ARCHIVED";

  /**
   * UAT-HF P09.06 — "and migration control".
   *
   * The first pass told the operator what would be stranded and left them to
   * repoint each scheme by hand. Repointing three schemes out of four leaves a
   * scheme pointing at an archived package, and nothing surfaces it again —
   * P09.06 calls that a dangling current reference.
   *
   * Two mutually exclusive choices, because they are genuinely different
   * decisions: STRAND acknowledges the effect, MIGRATE avoids it.
   */
  const [archiveMode, setArchiveMode] = useState<"STRAND" | "MIGRATE">("STRAND");
  const [successorId, setSuccessorId] = useState("");
  const [moveMembers, setMoveMembers] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updatePackageAction,
    { ok: true },
  );
  const errs = state.ok ? {} : state.fieldErrors ?? {};
  const formError = state.ok ? undefined : state.formError;
  const err = (field: string) => (errs[field] ? errs[field][0] : undefined);

  const money = (label: string) => `${label} (${BASE_CURRENCY})`;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="packageId" value={packageId} />

      {formError && (
        <p role="alert" className="text-sm text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">
          {formError}
        </p>
      )}

      {/* Package details */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">
          Package Details
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Package Name</label>
            <input name="name" type="text" defaultValue={pkg.name} required className={inputCls}
              aria-invalid={err("name") ? true : undefined} />
            {err("name") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("name")}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="package-status">Status</label>
            <select
              id="package-status"
              name="status"
              defaultValue={pkg.status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputCls}
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            {err("status") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("status")}</p>}

            {/*
              UAT-HF P09.06 — DEF-025. Archiving was "committed by the same
              generic 'Save Changes' button used for harmless edits", with "no
              dialog, no alert, no inline warning and no statement of
              consequence", and — the part that matters — no dependency warning
              even when an ACTIVE scheme was bound to the package.

              Selecting Archived now states the impact by name and requires an
              explicit acknowledgement before the save is accepted. The server
              refuses without it, so this is the explanation rather than the
              control.
            */}
            {archivingNow && (
              <div
                role="alert"
                className="mt-2 rounded-lg border border-[#FFC107]/50 bg-[#FFC107]/10 px-3 py-2.5 text-xs text-[#856404]"
              >
                <p className="font-bold">This archives {pkg.name}.</p>
                <p className="mt-1">{impact.summary}</p>
                {impact.schemes.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-4">
                    {impact.schemes.map((s) => (
                      <li key={`${s.id}-${s.tierName ?? ""}`}>
                        {s.name}
                        {s.tierName ? ` — via the "${s.tierName}" tier` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {impact.inUse && (
                  <>
                    <label className="mt-2 flex items-start gap-2 font-semibold">
                      <input
                        type="checkbox"
                        name="__confirmArchiveInUse"
                        value="yes"
                        className="mt-0.5"
                        required
                      />
                      <span>
                        I understand this package is in use and that archiving it does not move or
                        end anyone&rsquo;s cover.
                      </span>
                    </label>

                    <fieldset className="mt-3 border-t border-[#FFC107]/40 pt-3">
                      <legend className="sr-only">What happens to the schemes using this package</legend>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="__archiveMode"
                          value="STRAND"
                          checked={archiveMode === "STRAND"}
                          onChange={() => setArchiveMode("STRAND")}
                          className="mt-0.5"
                        />
                        <span>Leave them pointing at this archived package. I will move them myself.</span>
                      </label>

                      <label className="mt-1.5 flex items-start gap-2">
                        <input
                          type="radio"
                          name="__archiveMode"
                          value="MIGRATE"
                          checked={archiveMode === "MIGRATE"}
                          onChange={() => setArchiveMode("MIGRATE")}
                          className="mt-0.5"
                          disabled={successors.length === 0}
                        />
                        <span>
                          Move them to another package now.
                          {successors.length === 0 && (
                            <span className="block font-normal">
                              No other active package exists to move them to.
                            </span>
                          )}
                        </span>
                      </label>

                      {archiveMode === "MIGRATE" && successors.length > 0 && (
                        <div className="mt-2 space-y-2 pl-6">
                          <label className="block">
                            <span className="block font-semibold">Move everything to</span>
                            <select
                              name={successorId ? "__migrateToPackageId" : "__unusedSuccessor"}
                              value={successorId}
                              onChange={(e) => setSuccessorId(e.target.value)}
                              required
                              className="mt-1 w-full rounded-[8px] border border-[#EEEEEE] bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="">Choose a package…</option>
                              {successors.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </label>

                          {impact.memberCount > 0 && (
                            /* Schemes are configuration; members are people with
                               cover. Moving them changes what they can claim
                               against, so it is its own decision and its own
                               tick — the server refuses the migration without
                               it rather than moving them quietly. */
                            <label className="flex items-start gap-2 font-semibold">
                              <input
                                type="checkbox"
                                name="__migrateMembers"
                                value="yes"
                                checked={moveMembers}
                                onChange={(e) => setMoveMembers(e.target.checked)}
                                className="mt-0.5"
                              />
                              <span>
                                Also move {impact.memberCount}{" "}
                                {impact.memberCount === 1 ? "member" : "members"}. Their cover
                                changes to the new package&rsquo;s benefits and limits immediately.
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                    </fieldset>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Description</label>
            <input name="description" type="text" defaultValue={pkg.description ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{money("Annual Limit")}</label>
            <input name="annualLimit" type="number" min="0" step="0.01" defaultValue={pkg.annualLimit} required className={inputCls}
              aria-invalid={err("annualLimit") ? true : undefined} />
            {err("annualLimit") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("annualLimit")}</p>}
          </div>
          <div>
            <label className={labelCls}>{money("Contribution Amount / yr")}</label>
            <input name="contributionAmount" type="number" min="0" step="0.01" defaultValue={pkg.contributionAmount} required className={inputCls}
              aria-invalid={err("contributionAmount") ? true : undefined} />
            {err("contributionAmount") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("contributionAmount")}</p>}
          </div>
          <div>
            <label className={labelCls}>Min Member Age</label>
            <input name="minAge" type="number" min="0" max="120" defaultValue={pkg.minAge} className={inputCls}
              aria-invalid={err("minAge") ? true : undefined} />
            {err("minAge") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("minAge")}</p>}
          </div>
          <div>
            <label className={labelCls}>Max Member Age</label>
            <input name="maxAge" type="number" min="0" max="120" defaultValue={pkg.maxAge} className={inputCls}
              aria-invalid={err("maxAge") ? true : undefined} />
            {err("maxAge") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("maxAge")}</p>}
          </div>
          <div>
            <label className={labelCls}>Dependent Max Age</label>
            <input name="dependentMaxAge" type="number" min="0" max="120" defaultValue={pkg.dependentMaxAge} className={inputCls}
              aria-invalid={err("dependentMaxAge") ? true : undefined} />
            {err("dependentMaxAge") && <p role="alert" className="text-xs text-[#DC3545] mt-1">{err("dependentMaxAge")}</p>}
          </div>
          <div>
            <label className={labelCls}>Package Type</label>
            <select name="type" defaultValue={pkg.type} className={inputCls}>
              <option value="INDIVIDUAL">Individual</option>
              <option value="FAMILY">Family</option>
              <option value="GROUP">Group</option>
              <option value="CORPORATE">Corporate</option>
            </select>
          </div>
        </div>
      </div>

      {/* Benefit schedule */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
          <h2 className="font-bold text-brand-text-heading font-heading">Benefit Schedule</h2>
          <p className="text-xs text-brand-text-muted">Editing → new version (from v{pkg.versionNumber})</p>
        </div>

        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold">
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Annual Sub-Limit ({BASE_CURRENCY})</th>
                <th className="px-3 py-2 text-left">Per-Visit Limit ({BASE_CURRENCY})</th>
                <th className="px-3 py-2 text-left">Co-Pay %</th>
                <th className="px-3 py-2 text-left">Waiting Period (days)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {BENEFIT_CATEGORIES.map((cat) => {
                const existing = benefits.find((b) => b.category === cat);
                return (
                  <tr key={cat} className="hover:bg-[#F8F9FA]">
                    <td className="px-3 py-2.5">
                      <label className="flex items-center gap-2 font-semibold text-brand-text-heading">
                        <input type="checkbox" name={`benefit_enabled_${cat}`} defaultChecked={!!existing} className="accent-brand-indigo" />
                        {cat.replace(/_/g, " ")}
                      </label>
                    </td>
                    <td className="px-3 py-2.5">
                      <input name={`benefit_limit_${cat}`} type="number" min="0" step="0.01"
                        defaultValue={existing ? existing.annualSubLimit : 0} className={cellInputCls}
                        aria-invalid={err(`benefit_limit_${cat}`) ? true : undefined} />
                      {err(`benefit_limit_${cat}`) && (
                        <p role="alert" className="text-[11px] text-[#DC3545] mt-1">{err(`benefit_limit_${cat}`)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <input name={`benefit_pervisit_${cat}`} type="number" min="0" step="0.01"
                        placeholder="—"
                        defaultValue={existing?.perVisitLimit != null ? existing.perVisitLimit : ""} className={cellInputCls}
                        aria-invalid={err(`benefit_pervisit_${cat}`) ? true : undefined} />
                      {err(`benefit_pervisit_${cat}`) && (
                        <p role="alert" className="text-[11px] text-[#DC3545] mt-1">{err(`benefit_pervisit_${cat}`)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <input name={`benefit_copay_${cat}`} type="number" min="0" max="100" step="0.01"
                        defaultValue={existing ? existing.copayPercentage : 0}
                        className="w-20 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-sm focus:ring-2 focus:ring-brand-indigo outline-none"
                        aria-invalid={err(`benefit_copay_${cat}`) ? true : undefined} />
                      {err(`benefit_copay_${cat}`) && (
                        <p role="alert" className="text-[11px] text-[#DC3545] mt-1">{err(`benefit_copay_${cat}`)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <input name={`benefit_wait_${cat}`} type="number" min="0"
                        defaultValue={existing ? existing.waitingPeriodDays : 0}
                        className="w-24 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-sm focus:ring-2 focus:ring-brand-indigo outline-none"
                        aria-invalid={err(`benefit_wait_${cat}`) ? true : undefined} />
                      {err(`benefit_wait_${cat}`) && (
                        <p role="alert" className="text-[11px] text-[#DC3545] mt-1">{err(`benefit_wait_${cat}`)}</p>
                      )}
                      {/* UAT-HF P09.03 — DEF-022. "The product never states what
                          the 270 days run FROM — cover start, enrolment date,
                          policy inception and member join date are all plausible
                          and none is named." Now it is chosen, not assumed. */}
                      <select
                        name={`benefit_basis_${cat}`}
                        defaultValue={existing ? existing.waitingPeriodBasis : "COVER_START"}
                        aria-label={`What the ${cat.replace(/_/g, " ").toLowerCase()} waiting period is measured from`}
                        className="mt-1 w-40 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-[11px] focus:ring-2 focus:ring-brand-indigo outline-none"
                      >
                        <option value="COVER_START">from policy cover start</option>
                        <option value="DEPENDANT_JOIN">from the member&rsquo;s join date</option>
                        <option value="REINSTATEMENT">from reinstatement</option>
                        <option value="OTHER_APPROVED">from an approved date</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-brand-text-muted">
          Per-visit limit caps each individual claim for that benefit (leave blank for no per-visit cap). Sub-limit and
          per-visit limit are fixed for this version — saving creates a new version.
        </p>
      </div>

      <div className="flex justify-end gap-3">
        <Link href={`/packages/${packageId}`}
          className="px-5 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text-heading transition-colors">
          Cancel
        </Link>
        <button type="submit" disabled={pending}
          className="bg-brand-indigo hover:bg-brand-secondary text-white px-8 py-2.5 rounded-full font-bold text-sm transition-colors disabled:opacity-50">
          {pending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
