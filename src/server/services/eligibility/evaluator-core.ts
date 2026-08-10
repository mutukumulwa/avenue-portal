/**
 * evaluator-core.ts — the PURE point-in-time eligibility decision (SP-6).
 *
 * This is the single authority on precedence + reason-code mapping for the
 * published `06 Eligibility Oracle` (EO-001..024). It is deliberately free of
 * Prisma / I/O: the DB loader (`evaluator.ts`) gathers the facts (member snapshot,
 * group/client status + policy window, coverage periods, provider exclusion,
 * referral/exclusion evaluations, waiting-period flag, and the money base from
 * `BenefitUsageService.computeAvailability`) and hands them here. Every channel
 * (admin, provider, member, HR, API, preauth/claims) reports the SAME decision —
 * adapters may PROJECT fields but must never RECOMPUTE the verdict.
 *
 * Because the verdict logic lives here as a pure function, the 24 oracle rows are
 * proven cheaply as unit cases (tests/services/eligibility/evaluator-core.test.ts)
 * with no DB — the coverage-period cases are seeded as fixtures so they pass now
 * and stay green once WP-3.5E populates real periods for every enrolment path.
 */

import type { EligibilityReasonCode } from "./reason-codes";
import { isCoverageEnded } from "../coverage.service";
import { classifyAge } from "./age";
import type { ReferralEvaluation, ExclusionEvaluation } from "./rules";

export type EligibilityConclusion =
  | "ELIGIBLE"
  | "MEMBER_ELIGIBLE_BENEFIT_BLOCKED"
  | "NOT_ELIGIBLE"
  | "PENDING_RENEWAL"
  | "NOT_FOUND";

export interface CoveragePeriodInput {
  startDate: Date;
  endDate: Date | null;
}

/** Money base — the shape the evaluator needs from `computeAvailability`. */
export interface BenefitMoney {
  /** Category annual sublimit (the member's own row). */
  limit: number;
  used: number;
  held: number;
  /** Minimum available across every applicable constraint (payableCeiling). */
  remaining: number;
}

export interface MemberSnapshot {
  status: string; // MemberStatus
  relationship: string; // MemberRelationship
  dateOfBirth: Date | null;
  enrollmentDate: Date;
  coverEndDate: Date | null;
  packageVersionId: string | null;
}

export interface EligibilityFacts {
  serviceDate: Date;
  memberExists: boolean;
  member?: MemberSnapshot;
  client?: { status: string }; // ClientStatus
  group?: { status: string; effectiveDate: Date | null; renewalDate: Date | null };
  coveragePeriods?: CoveragePeriodInput[];
  ageRules?: { maxAge: number | null; dependentMaxAge: number | null } | null;
  /** Present only when a benefit/provider context was supplied. */
  benefitCode?: string | null;
  providerId?: string | null;
  /** Resolved by the loader from PackageProviderEligibility + tier + contract status. */
  providerExcluded?: boolean;
  referral?: ReferralEvaluation | null;
  exclusion?: ExclusionEvaluation | null;
  /** An active WaitingPeriodApplication covers this benefit on the service date. */
  waitingBlocked?: boolean;
  /** From `computeAvailability`; null when no config for the benefit / no benefit context. */
  benefitMoney?: BenefitMoney | null;
}

export interface EligibilityDecision {
  conclusion: EligibilityConclusion;
  reasonCode: EligibilityReasonCode;
  /** The member-life status reason as of the service date (independent of the benefit). */
  memberReason: EligibilityReasonCode;
  memberEligible: boolean;
  /** Headline available money; null when not applicable / not priceable. */
  available: number | null;
  explanations: string[];
}

// ── member-life classification ────────────────────────────────────────────────

type MemberClass =
  | { eligible: true; reason: EligibilityReasonCode; explanation: string }
  | { eligible: false; reason: EligibilityReasonCode; explanation: string };

const fmt = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * LAPSED is not in coverage.service's COVERAGE_ENDED_STATUSES (an open period
 * would otherwise count as live cover), but a lapsed member is not eligible at
 * the current date (EO-012). Treat LAPSED as ended-like for the "does an open
 * period count" decision, while still honouring a *closed* past window as
 * ACTIVE_AS_OF_SERVICE_DATE.
 */
function treatAsEnded(status: string): boolean {
  return isCoverageEnded(status) || status === "LAPSED";
}

/** Ended-status → the oracle's terminal reason code. */
function endedReason(status: string): EligibilityReasonCode {
  if (status === "LAPSED" || status === "LAPSED_BEFORE_ACTIVATION") return "LAPSED";
  // TERMINATED / TERMINATED_* / CANCELLED_COOLING_OFF / EXPIRED → TERMINATED
  return "TERMINATED";
}

interface PeriodAnalysis {
  covered: boolean;
  priorGap: boolean;
  inGap: boolean;
  beforeFirst: boolean;
}

function analyzePeriods(
  periods: CoveragePeriodInput[],
  serviceDate: Date,
  endedLike: boolean,
): PeriodAnalysis {
  const sorted = [...periods].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  let covered = false;
  let coveringIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const within =
      serviceDate >= p.startDate &&
      (p.endDate === null ? !endedLike : serviceDate <= p.endDate);
    if (within) {
      covered = true;
      coveringIdx = i;
      break;
    }
  }
  const priorGap = covered && coveringIdx > 0;

  let inGap = false;
  let beforeFirst = false;
  if (!covered && sorted.length > 0) {
    if (serviceDate < sorted[0].startDate) {
      beforeFirst = true;
    } else {
      const endedBefore = sorted.some((p) => p.endDate !== null && p.endDate < serviceDate);
      const startsAfter = sorted.some((p) => p.startDate > serviceDate);
      inGap = endedBefore && startsAfter;
    }
  }
  return { covered, priorGap, inGap, beforeFirst };
}

function classifyMember(
  member: MemberSnapshot,
  serviceDate: Date,
  periods: CoveragePeriodInput[],
): MemberClass {
  const status = member.status;
  const isDependant = member.relationship !== "PRINCIPAL";

  // Suspension is an immediate hold — never resolved by an open period (EO-009).
  if (status === "SUSPENDED") {
    return { eligible: false, reason: "SUSPENDED", explanation: "Member cover is suspended." };
  }
  if (status === "PENDING_ACTIVATION") {
    return { eligible: false, reason: "NOT_YET_ENROLLED", explanation: "Member cover is pending activation." };
  }

  const endedLike = treatAsEnded(status);
  const activeReason: EligibilityReasonCode = isDependant ? "ACTIVE_DEPENDANT" : "ACTIVE";

  if (periods.length > 0) {
    const a = analyzePeriods(periods, serviceDate, endedLike);
    if (a.covered) {
      if (endedLike) {
        return {
          eligible: true,
          reason: "ACTIVE_AS_OF_SERVICE_DATE",
          explanation: `Member cover ended, but the service date ${fmt(serviceDate)} falls within a covered period.`,
        };
      }
      if (a.priorGap) {
        return {
          eligible: true,
          reason: "REINSTATED",
          explanation: "Member was reinstated after a coverage gap and is covered on the service date.",
        };
      }
      return { eligible: true, reason: activeReason, explanation: "Member cover is active on the service date." };
    }
    // Not covered as of the service date.
    if (a.inGap) {
      return { eligible: false, reason: "COVERAGE_GAP", explanation: `Service date ${fmt(serviceDate)} falls in an uncovered gap between coverage periods.` };
    }
    if (a.beforeFirst) {
      return { eligible: false, reason: "POLICY_NOT_STARTED", explanation: "Service date precedes the member's first coverage period." };
    }
    if (endedLike) {
      return { eligible: false, reason: endedReason(status), explanation: "Member cover has ended before the service date." };
    }
    return { eligible: false, reason: "COVERAGE_GAP", explanation: "Service date is not within any coverage period." };
  }

  // No coverage periods yet (pre-WP-3.5E for manual/endorsement/import enrolment):
  // fall back to current status + enrollment date — no worse than today.
  if (endedLike) {
    return { eligible: false, reason: endedReason(status), explanation: "Member cover has ended." };
  }
  return { eligible: true, reason: activeReason, explanation: "Member cover is active." };
}

// ── the decision ──────────────────────────────────────────────────────────────

/**
 * Point-in-time eligibility decision. Precedence (first match wins):
 *   0. member not found
 *   1. unpinned package version → fail CLOSED (never fail-open to zero)
 *   2. client status (SUSPENDED / TERMINATED)
 *   3. group/scheme status (SUSPENDED / LAPSED / TERMINATED / not-yet-active)
 *   4. policy window (before start / on-or-after renewal)
 *   5. future joiner (before enrolment date)
 *   6. member life status as of service date (coverage-period aware)
 *   7. dependant age
 *   -- member is eligible from here; benefit/provider gates only affect the benefit --
 *   8. provider network → referral → waiting period → treatment exclusion → benefit limit
 */
export function decideEligibility(facts: EligibilityFacts): EligibilityDecision {
  if (!facts.memberExists || !facts.member) {
    return {
      conclusion: "NOT_FOUND",
      reasonCode: "NOT_FOUND",
      memberReason: "NOT_FOUND",
      memberEligible: false,
      available: null,
      explanations: ["No member matches this reference."],
    };
  }
  const m = facts.member;

  const notEligible = (reasonCode: EligibilityReasonCode, explanation: string): EligibilityDecision => ({
    conclusion: "NOT_ELIGIBLE",
    reasonCode,
    memberReason: reasonCode,
    memberEligible: false,
    available: 0,
    explanations: [explanation],
  });

  // 1. Pin required — fail CLOSED (F-PIN-2). Unpinned = not enrolled into a
  //    priceable version; never fail-open to a zero-cost/blank benefit.
  if (!m.packageVersionId) {
    return notEligible(
      "NOT_YET_ENROLLED",
      "Member has no pinned package version (unbound/quotation group); coverage cannot be priced (fail-closed).",
    );
  }

  // 2. Client status.
  if (facts.client?.status === "SUSPENDED") return notEligible("SUSPENDED", "The client account is suspended.");
  if (facts.client?.status === "TERMINATED") return notEligible("TERMINATED", "The client account is terminated.");

  // 3. Group / scheme status (preauth omits this today — the evaluator consults it).
  switch (facts.group?.status) {
    case "SUSPENDED":
      return notEligible("SUSPENDED", "The scheme is suspended.");
    case "LAPSED":
      return notEligible("LAPSED", "The scheme has lapsed.");
    case "TERMINATED":
      return notEligible("TERMINATED", "The scheme is terminated.");
    case "PROSPECT":
    case "PENDING":
      return notEligible("NOT_YET_ENROLLED", "The scheme is not yet active.");
    default:
      break; // ACTIVE or unknown → continue (member-level checks still gate)
  }

  // 4. Policy window (Group.effectiveDate / renewalDate). renewalDate is the
  //    EXCLUSIVE end (EO-004 last day eligible; EO-005 renewal day → RENEWAL_VERSION).
  const eff = facts.group?.effectiveDate ?? null;
  const ren = facts.group?.renewalDate ?? null;
  if (eff && facts.serviceDate < eff) {
    return notEligible("POLICY_NOT_STARTED", `Policy starts ${fmt(eff)}; the service date is before it.`);
  }
  if (ren && facts.serviceDate >= ren) {
    return {
      conclusion: "PENDING_RENEWAL",
      reasonCode: "RENEWAL_VERSION",
      memberReason: "RENEWAL_VERSION",
      memberEligible: false,
      available: null,
      explanations: [`The policy period ended ${fmt(ren)}; eligibility depends on an approved renewal version (no silent carry-forward).`],
    };
  }

  // 5. Future joiner.
  if (facts.serviceDate < m.enrollmentDate) {
    return notEligible("NOT_YET_ENROLLED", `Member enrolment is effective ${fmt(m.enrollmentDate)}; the service date is before it.`);
  }

  // 6. Member life status as of the service date.
  const cls = classifyMember(m, facts.serviceDate, facts.coveragePeriods ?? []);
  if (!cls.eligible) return notEligible(cls.reason, cls.explanation);

  // 7. Dependant age.
  const age = classifyAge(m, facts.serviceDate, facts.ageRules ?? null);
  if (age.over) {
    return notEligible("OVER_AGE_DEPENDANT", "The dependant exceeds the maximum dependant age.");
  }

  // The member (life) is eligible. Headline member reason (used when the benefit
  // is not blocked). AGE_BOUNDARY takes precedence over plain ACTIVE/dependant
  // (EO-015: exactly max dependant age → AGE_BOUNDARY, still eligible).
  let memberReason = cls.reason;
  const explanations = [cls.explanation];
  if (age.boundary) {
    memberReason = "AGE_BOUNDARY";
    explanations.push("Member is exactly at the maximum age boundary (last covered year).");
  }

  const benefitMoney = facts.benefitMoney ?? null;
  const moneyAvailable = benefitMoney ? benefitMoney.remaining : null;

  const benefitBlocked = (
    reasonCode: EligibilityReasonCode,
    explanation: string,
    available: number | null,
  ): EligibilityDecision => ({
    conclusion: "MEMBER_ELIGIBLE_BENEFIT_BLOCKED",
    reasonCode,
    memberReason,
    memberEligible: true,
    available,
    explanations: [...explanations, explanation],
  });

  const eligible = (
    reasonCode: EligibilityReasonCode,
    available: number | null,
    extra?: string,
  ): EligibilityDecision => ({
    conclusion: "ELIGIBLE",
    reasonCode,
    memberReason,
    memberEligible: true,
    available,
    explanations: extra ? [...explanations, extra] : explanations,
  });

  // 8a. Provider network — an excluded provider means nothing is payable here.
  if (facts.providerExcluded) {
    return benefitBlocked("PROVIDER_EXCLUDED", "The selected provider is not covered under this member's package.", 0);
  }

  // 8b. Referral (structured, WP-2.4).
  if (facts.referral) {
    if (facts.referral.blocked) {
      return benefitBlocked(
        "MISSING_REFERRAL",
        facts.referral.memberSafeExplanation ?? "A referral is required for this service.",
        moneyAvailable,
      );
    }
    if (facts.referral.emergencyExceptionApplied) {
      return eligible(
        "EMERGENCY_REFERRAL_EXCEPTION",
        moneyAvailable,
        facts.referral.memberSafeExplanation ?? "Emergency: the referral requirement is waived (auditable).",
      );
    }
  }

  // 8c. Waiting period (benefit-level).
  if (facts.waitingBlocked) {
    // The pool is intact — the oracle shows the full remaining limit while blocked
    // (EO-008), so we keep the computed available rather than zeroing it.
    return benefitBlocked("WAITING_PERIOD", "This benefit is still within its waiting period.", moneyAvailable);
  }

  // 8d. Structured treatment exclusion (WP-2.3).
  if (facts.exclusion?.excluded) {
    return benefitBlocked(
      facts.exclusion.reasonCode ?? "TREATMENT_EXCLUDED",
      facts.exclusion.memberSafeExplanation ?? "This treatment is excluded under the benefit schedule.",
      0,
    );
  }

  // 8e. Benefit money.
  if (benefitMoney) {
    if (benefitMoney.remaining <= 0) {
      // EO-018: member stays eligible; the benefit is exhausted (not the member).
      return benefitBlocked("LIMIT_EXHAUSTED", "The annual limit for this benefit is exhausted.", 0);
    }
    return eligible(memberReason, benefitMoney.remaining);
  }

  // No priceable benefit context (no benefitCode, or a non-config context such as
  // SPECIALIST_OUTPATIENT / EMERGENCY) — member-level eligibility stands.
  return eligible(memberReason, moneyAvailable);
}
