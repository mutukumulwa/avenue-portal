/**
 * UAT-HF P03.06 — the policy parity gate.
 *
 * The plan, in full: "Run the full canonical eligibility table after package
 * rules are versioned. **Release fails if authoring projection, member display,
 * provider decision, and claim/preauth enforcement disagree.**"
 *
 * It exists because the same question — *when does this benefit become usable
 * for this member?* — is asked on four surfaces, and the run found them giving
 * different answers. A gate that only compared the two surfaces which happen to
 * share a module would be worse than none: it would go green while the other
 * two disagreed, and green would mean something different from what the reader
 * assumes.
 *
 * So each audience is reported as **AGREES**, **DISAGREES**, or **NOT
 * CONSULTED**, and the last is a gate failure rather than a pass. That is the
 * same discipline `scripts/verification-gate.mjs` applies to P12.04's steps,
 * for the same reason.
 *
 * ## What this found
 *
 * It found three different sources of truth for one policy question. Two have
 * since been reconciled; one has not.
 *
 *   authoring projection ... `BenefitConfig.waitingPeriodDays` + basis, via
 *                            `waitingPeriodWorkedExample`
 *   member display ......... the same two fields, via `waitingPeriodStatus` —
 *                            deliberately the same module, so these cannot drift
 *   provider decision ...... **was nothing at all**, so a provider was told
 *                            cover was active for a benefit the member could not
 *                            yet use. Now runs `waitingPeriodStatus` on the same
 *                            anchors, from the member's pinned version
 *   claim/preauth .......... still `WaitingPeriodApplication.endDate` — a
 *                            *stored* date on a different table, written by a
 *                            different path, never reconciled against the
 *                            benefit's configured duration
 *
 * **What the provider column here does and does not prove.** It reuses the
 * member column because both audiences now call the same function — that is
 * parity by construction, not an independent measurement, and this gate never
 * invokes the service. The evidence that the service is actually wired to it is
 * `tests/services/provider-eligibility-waiting-period.test.ts`, which drives
 * the real code path. Both are needed: this one catches the module diverging,
 * that one catches the caller opting out.
 */

import {
  waitingPeriodStatus,
  waitingPeriodWorkedExample,
  type WaitingPeriodBasisValue,
} from "@/lib/member-policy-copy";

/** One row of the canonical eligibility table. */
export interface PolicyCase {
  name: string;
  waitingPeriodDays: number;
  basis: WaitingPeriodBasisValue;
  /** The date the basis resolves to. */
  anchorDate: string;
  /** When the question is being asked. */
  asOf: string;
  /** The answer every audience must give, or null when none applies. */
  expectedEligibleFrom: string | null;
}

/**
 * The canonical table.
 *
 * Deliberately small and deliberately awkward: a 270-day maternity wait (the
 * one the run actually configured), a month boundary, a leap day, and a wait
 * that has already elapsed. Adding rows is cheap; these are the ones that have
 * previously been got wrong.
 */
export const CANONICAL_POLICY_CASES: PolicyCase[] = [
  {
    name: "270-day maternity from cover start",
    waitingPeriodDays: 270,
    basis: "COVER_START",
    anchorDate: "2026-08-11",
    asOf: "2026-08-13",
    expectedEligibleFrom: "2027-05-08",
  },
  {
    name: "30-day wait crossing a month end",
    waitingPeriodDays: 30,
    basis: "COVER_START",
    anchorDate: "2026-01-31",
    asOf: "2026-02-15",
    expectedEligibleFrom: "2026-03-02",
  },
  {
    name: "wait crossing 29 February in a leap year",
    waitingPeriodDays: 10,
    basis: "COVER_START",
    anchorDate: "2028-02-25",
    asOf: "2028-02-26",
    expectedEligibleFrom: "2028-03-06",
  },
  {
    name: "wait measured from a dependant's own join date",
    waitingPeriodDays: 90,
    basis: "DEPENDANT_JOIN",
    anchorDate: "2026-06-01",
    asOf: "2026-08-13",
    expectedEligibleFrom: "2026-08-30",
  },
  {
    name: "wait already elapsed",
    waitingPeriodDays: 30,
    basis: "COVER_START",
    anchorDate: "2026-01-01",
    asOf: "2026-08-13",
    expectedEligibleFrom: "2026-01-31",
  },
  {
    name: "no wait configured",
    waitingPeriodDays: 0,
    basis: "COVER_START",
    anchorDate: "2026-01-01",
    asOf: "2026-08-13",
    expectedEligibleFrom: null,
  },
];

export type AudienceVerdict = "AGREES" | "DISAGREES" | "NOT_CONSULTED";

export interface AudienceResult {
  audience: string;
  verdict: AudienceVerdict;
  /** What it answered, where it answers at all. */
  answers: (string | null)[];
  /** Why it disagrees or cannot be asked. */
  note?: string;
}

/** The date the authoring projection shows a maker. */
function authoringAnswer(c: PolicyCase): string | null {
  const worked = waitingPeriodWorkedExample(
    c.waitingPeriodDays,
    new Date(`${c.anchorDate}T00:00:00Z`),
  );
  return worked?.eligibleFrom ?? null;
}

/** The date the member's benefit view shows. */
function memberAnswer(c: PolicyCase): string | null {
  const status = waitingPeriodStatus({
    waitingPeriodDays: c.waitingPeriodDays,
    waitingPeriodBasis: c.basis,
    coverStartDate: `${c.anchorDate}T00:00:00Z`,
    anchors: {
      dependantJoinDate: `${c.anchorDate}T00:00:00Z`,
      reinstatementDate: `${c.anchorDate}T00:00:00Z`,
      approvedBasisDate: `${c.anchorDate}T00:00:00Z`,
    },
    now: new Date(`${c.asOf}T00:00:00Z`),
  });
  return status.eligibleFrom;
}

/**
 * Run the canonical table across every audience.
 *
 * Pure: it evaluates the code paths that can be evaluated without a database,
 * and reports the two that cannot be — rather than omitting them, which is the
 * failure this gate is built to prevent.
 */
export function runPolicyParity(cases: PolicyCase[] = CANONICAL_POLICY_CASES): {
  results: AudienceResult[];
  mismatches: string[];
  passed: boolean;
} {
  const results: AudienceResult[] = [];
  const mismatches: string[] = [];

  const authoring = cases.map(authoringAnswer);
  const member = cases.map(memberAnswer);

  cases.forEach((c, i) => {
    if (authoring[i] !== c.expectedEligibleFrom) {
      mismatches.push(
        `authoring projection: "${c.name}" answered ${authoring[i]}, expected ${c.expectedEligibleFrom}`,
      );
    }
    if (member[i] !== c.expectedEligibleFrom) {
      mismatches.push(
        `member display: "${c.name}" answered ${member[i]}, expected ${c.expectedEligibleFrom}`,
      );
    }
    if (authoring[i] !== member[i]) {
      mismatches.push(
        `authoring and member disagree on "${c.name}": ${authoring[i]} vs ${member[i]}`,
      );
    }
  });

  results.push({
    audience: "authoring projection",
    verdict: authoring.every((a, i) => a === cases[i].expectedEligibleFrom) ? "AGREES" : "DISAGREES",
    answers: authoring,
  });
  results.push({
    audience: "member display",
    verdict: member.every((a, i) => a === cases[i].expectedEligibleFrom) ? "AGREES" : "DISAGREES",
    answers: member,
  });

  // ── The two that cannot be asked ─────────────────────────────────────────
  //
  // Reported, not omitted. A gate that compared only the surfaces sharing a
  // module would go green while these two disagreed.
  // The provider desk now runs the SAME `waitingPeriodStatus` as the member
  // app, on the same anchors, from the member's pinned version — so its answers
  // are the member column's by construction rather than by coincidence.
  results.push({
    audience: "provider decision",
    verdict: member.every((a, i) => a === cases[i].expectedEligibleFrom) ? "AGREES" : "DISAGREES",
    answers: member,
    note:
      "Evaluated only when the caller names a benefit category; a general 'is this member " +
      "covered' question is not about one benefit. An UNRESOLVED wait is deliberately not " +
      "treated as blocked — refusing care on our own missing configuration would be the " +
      "mirror error.",
  });
  results.push({
    audience: "claim/preauth enforcement",
    verdict: "NOT_CONSULTED",
    answers: [],
    note:
      "preauth-adjudication.service.ts reads WaitingPeriodApplication.endDate — a stored date on a " +
      "different table, written by a different path, never reconciled against the benefit's " +
      "configured duration and basis.",
  });

  mismatches.push(
    ...results
      .filter((r) => r.verdict === "NOT_CONSULTED")
      .map((r) => `${r.audience}: NOT CONSULTED — ${r.note}`),
  );
  mismatches.push(
    ...results
      .filter((r) => r.verdict === "DISAGREES")
      .map((r) => `${r.audience}: DISAGREES with the canonical table`),
  );

  return { results, mismatches, passed: mismatches.length === 0 };
}
