import { describe, it, expect } from "vitest";
import {
  decideEligibility,
  type EligibilityFacts,
  type EligibilityConclusion,
} from "@/server/services/eligibility/evaluator-core";
import type { EligibilityReasonCode } from "@/server/services/eligibility/reason-codes";
import type { ReferralEvaluation } from "@/server/services/eligibility/rules";

/**
 * SP-6 Q-phase proof — the published `06 Eligibility Oracle` (EO-001..024) encoded
 * as unit cases against the PURE decision core. The 24 rows come verbatim from the
 * run workbook (`06 Eligibility Oracle`); each asserts the EXACT conclusion +
 * reasonCode + available. Coverage-period cases (leaver / reinstatement / gap) are
 * seeded as fixtures so they pass now and stay green once WP-3.5E populates real
 * MemberCoveragePeriod rows for manual/endorsement/import enrolment — the evaluator
 * does not change when that lands.
 *
 * `available` values marked (oracle) are pinned by the workbook; (fixture) rows are
 * where the oracle left a placeholder and the fixture supplies the deterministic
 * seeded balance the evaluator projects.
 */

// Local-midnight dates so computeAge's get*() are timezone-stable.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

const EFFECTIVE = d(2026, 8, 1);
const RENEWAL = d(2027, 8, 1);
const AGE_RULES = { maxAge: 65, dependentMaxAge: 24 };
const PV = "pv-lakeview-v1"; // a pinned package version id

const OUTPATIENT = { limit: 2_000_000, used: 0, held: 0, remaining: 2_000_000 };

function base(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    serviceDate: d(2026, 8, 8),
    memberExists: true,
    member: {
      status: "ACTIVE",
      relationship: "PRINCIPAL",
      dateOfBirth: d(1985, 1, 1),
      enrollmentDate: EFFECTIVE,
      coverEndDate: null,
      packageVersionId: PV,
    },
    client: { status: "ACTIVE" },
    group: { status: "ACTIVE", effectiveDate: EFFECTIVE, renewalDate: RENEWAL },
    coveragePeriods: [{ startDate: EFFECTIVE, endDate: null }],
    ageRules: AGE_RULES,
    benefitCode: "OUTPATIENT",
    providerId: "prov-kampala-central",
    providerExcluded: false,
    benefitMoney: OUTPATIENT,
    ...overrides,
  };
}

const referralBlocked: ReferralEvaluation = {
  blocked: true,
  reasonCode: "MISSING_REFERRAL",
  memberSafeExplanation: "A referral is required for specialist outpatient care.",
  emergencyExceptionApplied: false,
  matchedRuleId: "rf-01",
};
const referralEmergency: ReferralEvaluation = {
  blocked: false,
  reasonCode: "EMERGENCY_REFERRAL_EXCEPTION",
  memberSafeExplanation: "Emergency care — the referral requirement is waived.",
  emergencyExceptionApplied: true,
  matchedRuleId: "rf-01",
};

interface EOCase {
  id: string;
  facts: EligibilityFacts;
  conclusion: EligibilityConclusion;
  reasonCode: EligibilityReasonCode;
  available: number | null;
  note: string;
}

const CASES: EOCase[] = [
  {
    id: "EO-001",
    facts: base(),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE",
    available: 2_000_000, // (oracle)
    note: "Normal in-period, in-network",
  },
  {
    id: "EO-002",
    facts: base({ serviceDate: d(2026, 7, 31), benefitMoney: null }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "POLICY_NOT_STARTED",
    available: 0, // (oracle)
    note: "Day before policy",
  },
  {
    id: "EO-003",
    facts: base({ serviceDate: d(2026, 8, 1) }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE",
    available: 2_000_000, // (oracle)
    note: "Policy start boundary",
  },
  {
    id: "EO-004",
    facts: base({ serviceDate: d(2027, 7, 31) }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE",
    available: 2_000_000, // (fixture) oracle placeholder
    note: "Policy last day boundary",
  },
  {
    id: "EO-005",
    facts: base({ serviceDate: d(2027, 8, 1), benefitMoney: null }),
    conclusion: "PENDING_RENEWAL",
    reasonCode: "RENEWAL_VERSION",
    available: null, // (oracle)
    note: "No silent carry-forward",
  },
  {
    id: "EO-006",
    facts: base({
      serviceDate: d(2026, 8, 14),
      member: {
        status: "ACTIVE",
        relationship: "PRINCIPAL",
        dateOfBirth: d(1985, 1, 1),
        enrollmentDate: d(2026, 8, 15),
        coverEndDate: null,
        packageVersionId: PV,
      },
      coveragePeriods: [{ startDate: d(2026, 8, 15), endDate: null }],
      benefitMoney: null,
    }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "NOT_YET_ENROLLED",
    available: 0, // (oracle)
    note: "Future joiner day before",
  },
  {
    id: "EO-007",
    facts: base({
      serviceDate: d(2026, 8, 15),
      member: {
        status: "ACTIVE",
        relationship: "PRINCIPAL",
        dateOfBirth: d(1985, 1, 1),
        enrollmentDate: d(2026, 8, 15),
        coverEndDate: null,
        packageVersionId: PV,
      },
      coveragePeriods: [{ startDate: d(2026, 8, 15), endDate: null }],
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE",
    available: 2_000_000, // (oracle)
    note: "Future joiner effective day",
  },
  {
    id: "EO-008",
    facts: base({
      benefitCode: "MATERNITY",
      waitingBlocked: true,
      benefitMoney: { limit: 3_000_000, used: 0, held: 0, remaining: 3_000_000 },
    }),
    conclusion: "MEMBER_ELIGIBLE_BENEFIT_BLOCKED",
    reasonCode: "WAITING_PERIOD",
    available: 3_000_000, // (oracle) — pool intact, shown while blocked
    note: "270-day benefit wait; member eligible, benefit blocked",
  },
  {
    id: "EO-009",
    facts: base({ member: { status: "SUSPENDED", relationship: "PRINCIPAL", dateOfBirth: d(1985, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV }, benefitMoney: null }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "SUSPENDED",
    available: 0, // (oracle)
    note: "Suspension must be immediate",
  },
  {
    id: "EO-010",
    facts: base({
      serviceDate: d(2026, 8, 6),
      member: { status: "TERMINATED", relationship: "PRINCIPAL", dateOfBirth: d(1985, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: d(2026, 8, 6), packageVersionId: PV },
      coveragePeriods: [{ startDate: EFFECTIVE, endDate: d(2026, 8, 6) }],
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE_AS_OF_SERVICE_DATE",
    available: 2_000_000, // (fixture) oracle placeholder
    note: "Leaver inclusive last day",
  },
  {
    id: "EO-011",
    facts: base({
      serviceDate: d(2026, 8, 7),
      member: { status: "TERMINATED", relationship: "PRINCIPAL", dateOfBirth: d(1985, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: d(2026, 8, 6), packageVersionId: PV },
      coveragePeriods: [{ startDate: EFFECTIVE, endDate: d(2026, 8, 6) }],
      benefitMoney: null,
    }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "TERMINATED",
    available: 0, // (oracle)
    note: "First day after leaver cutoff",
  },
  {
    id: "EO-012",
    facts: base({
      member: { status: "LAPSED", relationship: "PRINCIPAL", dateOfBirth: d(1985, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
      // Realistic: the lapse path did not close the period; treatAsEnded must not
      // let an open period leak cover.
      coveragePeriods: [{ startDate: d(2026, 7, 1), endDate: null }],
      benefitMoney: null,
    }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "LAPSED",
    available: 0, // (oracle)
    note: "Lapsed",
  },
  {
    id: "EO-013",
    facts: base({
      serviceDate: d(2026, 8, 3),
      member: { status: "ACTIVE", relationship: "PRINCIPAL", dateOfBirth: d(1985, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
      coveragePeriods: [
        { startDate: EFFECTIVE, endDate: d(2026, 8, 2) },
        { startDate: d(2026, 8, 5), endDate: null },
      ],
      benefitMoney: null,
    }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "COVERAGE_GAP",
    available: 0, // (oracle)
    note: "Reinstatement gap",
  },
  {
    id: "EO-014",
    facts: base({
      member: { status: "ACTIVE", relationship: "PRINCIPAL", dateOfBirth: d(1985, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
      coveragePeriods: [
        { startDate: EFFECTIVE, endDate: d(2026, 8, 2) },
        { startDate: d(2026, 8, 5), endDate: null },
      ],
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "REINSTATED",
    available: 2_000_000, // (fixture) oracle placeholder
    note: "After reinstatement",
  },
  {
    id: "EO-015",
    facts: base({
      member: { status: "ACTIVE", relationship: "CHILD", dateOfBirth: d(2002, 8, 8), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "AGE_BOUNDARY",
    available: 2_000_000, // (fixture) oracle placeholder
    note: "Exactly max dependant age (24)",
  },
  {
    id: "EO-016",
    facts: base({
      member: { status: "ACTIVE", relationship: "CHILD", dateOfBirth: d(2001, 8, 7), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
      benefitMoney: null,
    }),
    conclusion: "NOT_ELIGIBLE",
    reasonCode: "OVER_AGE_DEPENDANT",
    available: 0, // (oracle)
    note: "One day over max-age boundary (25)",
  },
  {
    id: "EO-017",
    facts: base({
      benefitCode: "MATERNITY",
      member: { status: "ACTIVE", relationship: "SPOUSE", dateOfBirth: d(1990, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
      benefitMoney: { limit: 3_000_000, used: 2_950_000, held: 0, remaining: 50_000 },
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE_DEPENDANT",
    available: 50_000, // (fixture) oracle placeholder "1"; near-exhausted family pool
    note: "Near-exhausted family pool balance",
  },
  {
    id: "EO-018",
    facts: base({
      benefitMoney: { limit: 2_000_000, used: 2_000_000, held: 0, remaining: 0 },
    }),
    conclusion: "MEMBER_ELIGIBLE_BENEFIT_BLOCKED",
    reasonCode: "LIMIT_EXHAUSTED",
    available: 0, // (oracle) — member eligible, benefit exhausted
    note: "Member status not confused with benefit exhaustion",
  },
  {
    id: "EO-019",
    facts: base({
      benefitCode: "INPATIENT",
      benefitMoney: { limit: 15_000_000, used: 0, held: 5_000_000, remaining: 10_000_000 },
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE",
    available: 10_000_000, // (fixture) oracle placeholder; approved PA hold deducted
    note: "Approved pre-auth hold deducted",
  },
  {
    id: "EO-020",
    facts: base({ providerId: "prov-out-of-network", providerExcluded: true }),
    conclusion: "MEMBER_ELIGIBLE_BENEFIT_BLOCKED",
    reasonCode: "PROVIDER_EXCLUDED",
    available: 0, // (oracle) — network restriction zeroes payable here
    note: "Network restriction",
  },
  {
    id: "EO-021",
    facts: base({
      benefitCode: "SPECIALIST_OUTPATIENT",
      providerId: "prov-lakeside-specialist",
      referral: referralBlocked,
      benefitMoney: null, // non-config context
    }),
    conclusion: "MEMBER_ELIGIBLE_BENEFIT_BLOCKED",
    reasonCode: "MISSING_REFERRAL",
    available: null, // (oracle) — benefit/provider context returned
    note: "Referral required",
  },
  {
    id: "EO-022",
    facts: base({
      benefitCode: "EMERGENCY",
      providerId: "prov-lakeside-specialist",
      referral: referralEmergency,
      benefitMoney: null,
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "EMERGENCY_REFERRAL_EXCEPTION",
    available: null, // (oracle) — emergency bypass explained
    note: "Emergency bypass",
  },
  {
    id: "EO-023",
    facts: base({
      member: { status: "ACTIVE", relationship: "CHILD", dateOfBirth: d(2010, 1, 1), enrollmentDate: EFFECTIVE, coverEndDate: null, packageVersionId: PV },
    }),
    conclusion: "ELIGIBLE",
    reasonCode: "ACTIVE_DEPENDANT",
    available: 2_000_000, // (fixture) oracle placeholder
    note: "Independent dependant identity, family link",
  },
  {
    id: "EO-024",
    facts: { serviceDate: d(2026, 8, 8), memberExists: false },
    conclusion: "NOT_FOUND",
    reasonCode: "NOT_FOUND",
    available: null, // (oracle) — no data leakage
    note: "Unknown member",
  },
];

describe("SP-6 eligibility evaluator — 06 Eligibility Oracle (EO-001..024)", () => {
  for (const c of CASES) {
    it(`${c.id} → ${c.conclusion} / ${c.reasonCode} (${c.note})`, () => {
      const decision = decideEligibility(c.facts);
      expect(decision.conclusion, `${c.id} conclusion`).toBe(c.conclusion);
      expect(decision.reasonCode, `${c.id} reasonCode`).toBe(c.reasonCode);
      expect(decision.available, `${c.id} available`).toBe(c.available);
    });
  }

  it("covers all 24 oracle rows", () => {
    expect(CASES).toHaveLength(24);
    const ids = new Set(CASES.map((c) => c.id));
    expect(ids.size).toBe(24);
  });

  it("member-eligible-but-benefit-blocked keeps the member life eligible (EO-018/020/021 vs EO-002/011)", () => {
    const exhausted = decideEligibility(CASES.find((c) => c.id === "EO-018")!.facts);
    expect(exhausted.memberEligible).toBe(true);
    const terminated = decideEligibility(CASES.find((c) => c.id === "EO-011")!.facts);
    expect(terminated.memberEligible).toBe(false);
  });
});
