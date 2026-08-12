/**
 * UAT-HF P03.03 acceptance — "the same fixture/date returns the same reason code
 * in provider UI, API, claim/preauth gate, and member surface; audience copy
 * differs only where privacy requires."
 *
 * The concrete failure this fixes: `memberVerdict` in
 * provider-eligibility.service.ts computed the FULL evaluator decision and then
 * discarded its `reasonCode`, returning a binary ELIGIBLE/NOT_ELIGIBLE plus one
 * of two hard-coded sentences. The evaluator already knew whether the member was
 * SUSPENDED, LAPSED, in a WAITING_PERIOD or past an AGE_BOUNDARY — the provider
 * surface simply threw it away. Meanwhile /api/v1/eligibility returned
 * `reason: decision.reasonCode` all along, so the two doors genuinely disagreed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn(async () => ({ contractStatus: "ACTIVE" })) },
  member: { findFirst: vi.fn(async (): Promise<MockDbRow | null> => null) },
  memberCoveragePeriod: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  providerEligibilityCheck: { create: vi.fn(async () => ({ id: "chk1" })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const entitlement = vi.hoisted(() => ({
  entitledMemberWhere: vi.fn(async () => ({})),
  hasEffectiveEntitlement: vi.fn(async () => true),
}));
vi.mock("@/server/services/provider-entitlement.service", () => ({ ProviderEntitlementService: entitlement }));
vi.mock("@/server/services/provider-entitlement-shadow.service", () => ({
  ProviderEntitlementShadowService: { shadowCompareMemberLookup: vi.fn(async () => undefined) },
}));
vi.mock("@/server/services/provider-access-settings.service", () => ({
  ProviderAccessSettingsService: { isEntitlementEnforced: vi.fn(async () => false) },
}));
vi.mock("@/server/services/providers.service", () => ({
  ProvidersService: { isOperational: (s: string) => s === "ACTIVE" },
}));

import { ProviderEligibilityService } from "@/server/services/provider-eligibility.service";
import { decideEligibility } from "@/server/services/eligibility/evaluator-core";
import { memberSafeText, operatorGuidanceText } from "@/server/services/eligibility/decision-contract";

const SERVICE_DATE = new Date("2026-08-11T00:00:00.000Z");

/**
 * A coverage period spanning the service date. Without one the evaluator
 * correctly answers NOT_YET_ENROLLED before it ever considers member status —
 * so a fixture lacking it cannot exercise SUSPENDED vs TERMINATED at all.
 */
const COVERAGE = [{ startDate: new Date("2020-01-01"), endDate: null }];

/**
 * A pinned package version. The evaluator fails CLOSED on an unpinned member
 * (F-PIN-2) and answers NOT_YET_ENROLLED before it ever considers status, so a
 * fixture without one cannot exercise SUSPENDED vs TERMINATED either.
 */
const PINNED_VERSION = "pkgv-1";
const ctx = {
  tenantId: "t1",
  providerId: "prov-1",
  actorType: "USER",
  actorId: "u1",
  allowedProviderBranchIds: [],
  permissions: [],
  requestId: "req-1",
} as unknown as Parameters<typeof ProviderEligibilityService.check>[0]["ctx"];

/** A member fixture the evaluator will classify however `status` dictates. */
const member = (status: string) => ({
  id: "m1",
  firstName: "Amina",
  lastName: "Nabirye Kato",
  memberNumber: "ABC-2026-00001",
  status,
  relationship: "PRINCIPAL",
  dateOfBirth: new Date("1990-01-01"),
  enrollmentDate: new Date("2020-01-01"),
  coverEndDate: null,
  packageVersionId: PINNED_VERSION,
  groupId: "g1",
  packageId: "pk1",
  group: {
    name: "Staff Scheme",
    status: "ACTIVE",
    clientId: "c1",
    effectiveDate: new Date("2020-01-01"),
    renewalDate: new Date("2030-01-01"),
    client: { status: "ACTIVE" },
  },
  package: { name: "Standard", maxAge: 65, dependentMaxAge: 24 },
});

const check = () =>
  ProviderEligibilityService.check({ ctx, memberNumber: "ABC-2026-00001", serviceDate: SERVICE_DATE });

beforeEach(() => {
  vi.clearAllMocks();
  db.provider.findFirst.mockResolvedValue({ contractStatus: "ACTIVE" });
  db.memberCoveragePeriod.findMany.mockResolvedValue(COVERAGE);
  db.providerEligibilityCheck.create.mockResolvedValue({ id: "chk1" });
  entitlement.hasEffectiveEntitlement.mockResolvedValue(true);
});

describe("P03.03 the provider surface no longer discards the evaluator's reason", () => {
  it.each(["ACTIVE", "SUSPENDED", "TERMINATED", "LAPSED"])(
    "a %s member reports the SAME reason code the evaluator produced",
    async (status) => {
      db.member.findFirst.mockResolvedValue(member(status));

      // What the evaluator itself concludes for this fixture.
      const expected = decideEligibility({
        serviceDate: SERVICE_DATE,
        memberExists: true,
        member: {
          status,
          relationship: "PRINCIPAL",
          dateOfBirth: new Date("1990-01-01"),
          enrollmentDate: new Date("2020-01-01"),
          coverEndDate: null,
          packageVersionId: PINNED_VERSION,
        },
        client: { status: "ACTIVE" },
        group: { status: "ACTIVE", effectiveDate: new Date("2020-01-01"), renewalDate: new Date("2030-01-01") },
        coveragePeriods: COVERAGE,
        ageRules: { maxAge: 65, dependentMaxAge: 24 },
      });

      const result = await check();
      // The parity assertion: one reason code, not a binary verdict.
      expect(result.decision.reasonCode).toBe(expected.reasonCode);
    },
  );

  it("distinguishes SUSPENDED from TERMINATED, which used to share one sentence", async () => {
    db.member.findFirst.mockResolvedValue(member("SUSPENDED"));
    const suspended = await check();
    db.member.findFirst.mockResolvedValue(member("TERMINATED"));
    const terminated = await check();

    expect(suspended.decision.reasonCode).not.toBe(terminated.decision.reasonCode);
    // Both used to render "Member cover is not currently active for this service date."
    expect(suspended.decision.memberSafeExplanation).not.toBe(terminated.decision.memberSafeExplanation);
    expect(suspended.decision.operatorGuidance).not.toBe(terminated.decision.operatorGuidance);
  });

  it("takes its copy from the shared catalogue, so no surface invents wording", async () => {
    db.member.findFirst.mockResolvedValue(member("SUSPENDED"));
    const result = await check();
    expect(result.decision.memberSafeExplanation).toBe(memberSafeText(result.decision.reasonCode));
    expect(result.decision.operatorGuidance).toBe(operatorGuidanceText(result.decision.reasonCode));
  });
});

describe("P03.03 a facility entitled to nobody is not reported as a bad card (DEF-053)", () => {
  it("returns PROVIDER_NOT_ENTITLED when the facility has no effective entitlement", async () => {
    db.member.findFirst.mockResolvedValue(null);
    entitlement.hasEffectiveEntitlement.mockResolvedValue(false);

    const result = await check();
    expect(result.decision.reasonCode).toBe("PROVIDER_NOT_ENTITLED");
    // The operator is told where the fault actually lies.
    expect(result.decision.operatorGuidance).toMatch(/not a problem with the member's card/i);
  });

  it("returns NOT_FOUND when the facility IS entitled but this number is not its member", async () => {
    db.member.findFirst.mockResolvedValue(null);
    entitlement.hasEffectiveEntitlement.mockResolvedValue(true);

    const result = await check();
    expect(result.decision.reasonCode).toBe("NOT_FOUND");
  });

  it("shows the SAME member-safe string for both, preserving anti-enumeration", async () => {
    db.member.findFirst.mockResolvedValue(null);
    entitlement.hasEffectiveEntitlement.mockResolvedValue(false);
    const notEntitled = await check();
    entitlement.hasEffectiveEntitlement.mockResolvedValue(true);
    const notFound = await check();

    // Identical outward; different internally and to the operator.
    expect(notEntitled.decision.memberSafeExplanation).toBe(notFound.decision.memberSafeExplanation);
    expect(notEntitled.decision.reasonCode).not.toBe(notFound.decision.reasonCode);
    expect(notEntitled.decision.operatorGuidance).not.toBe(notFound.decision.operatorGuidance);
  });
});

describe("P03.03 the decision carries what the run said was missing", () => {
  it("has freshness, a correlation id and the evidence row (DEF-062, DEF-070)", async () => {
    db.member.findFirst.mockResolvedValue(member("ACTIVE"));
    const { decision } = await check();

    expect(decision.serviceDate).toBe(SERVICE_DATE.toISOString());
    expect(decision.dataAsOf).toBeTruthy();
    expect(decision.validUntil).toBeTruthy();
    expect(decision.correlationId).toBe("req-1");
    expect(decision.checkId).toBe("chk1");
    expect(decision.disclaimer).toMatch(/not a guarantee of payment/i);
  });

  it("separates cover status from the benefit outcome (DEF-058)", async () => {
    db.member.findFirst.mockResolvedValue(member("ACTIVE"));
    const { decision } = await check();
    expect(decision.coverStatus.covered).toBe(true);
    expect(decision.benefit).toHaveProperty("referralRequired");
    expect(decision.benefit).toHaveProperty("waitingEligibleFrom");
  });

  it("marks a non-operational facility as a facility problem, not a member one", async () => {
    db.provider.findFirst.mockResolvedValue({ contractStatus: "SUSPENDED" });
    const { decision } = await check();
    expect(decision.reasonCode).toBe("PROVIDER_NOT_ENTITLED");
    expect(decision.network.inNetwork).toBe(false);
  });
});
