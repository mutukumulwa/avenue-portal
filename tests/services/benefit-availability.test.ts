/**
 * P1 characterization + acceptance suite (TPA_PRIORITY_SIX P1.0/P1.1/P1.6).
 *
 * Written FAILING before implementation (P1.0). Contract under test:
 *   BenefitUsageService.computeAvailability — ONE availability result whose
 *   payableCeiling is the minimum across PER_VISIT / CATEGORY / OVERALL /
 *   SHARED_MEMBER / SHARED_FAMILY constraints (DEC-02..06 recorded in
 *   uat/priority-six/P1_BENEFIT_DECISIONS.md), crediting holds the same claim
 *   converts (P1-B), aggregating FAMILY pools across principal+dependants
 *   (P1-C), resolving the period from the SERVICE DATE, and failing closed on
 *   orphaned dependants (DEC-06).
 *   BenefitUsageService.recordUsage — rejects an over-limit write (gap #2)
 *   instead of incrementing and flooring at zero.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    member: { findUnique: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
    benefitConfig: { findFirst: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
    benefitUsage: {
      findUnique: vi.fn(async (): Promise<any> => null),
      findMany: vi.fn(async (): Promise<any[]> => []),
      create: vi.fn(async (a: any) => a.data),
      update: vi.fn(async (a: any) => a.data),
    },
    benefitConfigSharedLimit: { findMany: vi.fn(async (): Promise<any[]> => []) },
    benefitHold: { findMany: vi.fn(async (): Promise<any[]> => []) },
    exceptionLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { BenefitUsageService } from "@/server/services/benefit-usage.service";

const ENROLL = new Date("2026-01-15");

/** Baseline: principal member m1, OUTPATIENT config 500k, package annualLimit 0 (no overall). */
function baseline(over: { annualLimit?: number; perVisitLimit?: number | null; pkgPerVisit?: number | null } = {}) {
  db.member.findUnique.mockResolvedValue({
    id: "m1",
    relationship: "PRINCIPAL",
    principalId: null,
    enrollmentDate: ENROLL,
    packageVersionId: "pv1",
    package: { annualLimit: over.annualLimit ?? 0, perVisitLimit: over.pkgPerVisit ?? null },
  });
  db.benefitConfig.findFirst.mockResolvedValue({
    id: "cfg-out",
    annualSubLimit: 500_000,
    perVisitLimit: over.perVisitLimit ?? null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.benefitUsage.findUnique.mockResolvedValue(null);
  db.benefitUsage.findMany.mockResolvedValue([]);
  db.benefitConfigSharedLimit.findMany.mockResolvedValue([]);
  db.benefitHold.findMany.mockResolvedValue([]);
  db.member.findMany.mockResolvedValue([]);
  baseline();
});

describe("P1.1 computeAvailability — one result, minimum across constraints", () => {
  it("no usage row yet: ceiling = category sublimit; CATEGORY constraint present", async () => {
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "OUTPATIENT", requestedAmount: 200_000,
    });
    expect(a).not.toBeNull();
    expect(a!.payableCeiling).toBe(500_000);
    const cat = a!.constraints.find((c) => c.kind === "CATEGORY")!;
    expect(cat.limit).toBe(500_000);
    expect(cat.available).toBe(500_000);
    expect(a!.familyRootId).toBe("m1");
  });

  it("returns null when the package has no config for the category (package gate owns that)", async () => {
    db.benefitConfig.findFirst.mockResolvedValue(null);
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "DENTAL", requestedAmount: 1,
    });
    expect(a).toBeNull();
  });

  it("PER_VISIT binds below the category balance", async () => {
    baseline({ perVisitLimit: 50_000 });
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "OUTPATIENT", requestedAmount: 80_000,
    });
    expect(a!.payableCeiling).toBe(50_000);
    expect(a!.binding!.kind).toBe("PER_VISIT");
  });

  it("OVERALL (Package.annualLimit, DEC-03) binds when other categories consumed it", async () => {
    baseline({ annualLimit: 100_000 });
    // Overall query: this member's rows across categories in the period.
    db.benefitUsage.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.memberId === "m1" && !args?.where?.benefitConfigId) {
        return [
          { memberId: "m1", amountUsed: 80_000, activeHoldAmount: 0, benefitConfig: { category: "DENTAL" } },
        ];
      }
      return [];
    });
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "OUTPATIENT", requestedAmount: 50_000,
    });
    const overall = a!.constraints.find((c) => c.kind === "OVERALL")!;
    expect(overall.limit).toBe(100_000);
    expect(overall.used).toBe(80_000);
    expect(a!.payableCeiling).toBe(20_000);
    expect(a!.binding!.kind).toBe("OVERALL");
    expect(a!.reasonCode).toBe("BENEFIT_OVERALL_EXHAUSTED");
  });

  it("P1-B: an attached PA hold being converted by this claim is credited exactly once", async () => {
    // Category row: 0 used, 200k held (the PA's own hold).
    db.benefitUsage.findUnique.mockResolvedValue({ amountUsed: 0, activeHoldAmount: 200_000 });
    db.benefitHold.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.preAuthId) {
        return [{ memberId: "m1", benefitCategory: "OUTPATIENT", heldAmount: 200_000, status: "ACTIVE" }];
      }
      // liveHoldSums: one ACTIVE, unexpired hold of 200k
      return [{ memberId: "m1", benefitCategory: "OUTPATIENT", heldAmount: 200_000, expiresAt: new Date(Date.now() + 86_400_000) }];
    });
    // Without credit the ceiling would be 500k − 0 − 200k = 300k. With the
    // converting hold credited it is the full 500k.
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "OUTPATIENT", requestedAmount: 150_000,
      creditPreauthIds: ["pa1"],
    });
    const cat = a!.constraints.find((c) => c.kind === "CATEGORY")!;
    expect(cat.held).toBe(0);
    expect(a!.payableCeiling).toBe(500_000);
  });

  it("P1-C: FAMILY shared pool aggregates principal + dependants; child two gets only the remainder", async () => {
    // Treated member = child2 (dependant of m1).
    db.member.findUnique.mockResolvedValue({
      id: "child2", relationship: "CHILD", principalId: "m1",
      enrollmentDate: ENROLL, packageVersionId: "pv1",
      package: { annualLimit: 0, perVisitLimit: null },
    });
    db.member.findMany.mockResolvedValue([{ id: "m1" }, { id: "child1" }, { id: "child2" }]);
    db.benefitConfigSharedLimit.mockName;
    db.benefitConfigSharedLimit.findMany.mockResolvedValue([
      {
        sharedLimitGroup: {
          id: "slg1", name: "Family optical pool", limitAmount: 500_000, appliesTo: "FAMILY",
          benefitConfigs: [{ benefitConfigId: "cfg-out" }],
        },
      },
    ]);
    db.benefitUsage.findMany.mockImplementation(async (args: any) => {
      const m = args?.where?.memberId;
      if (m && typeof m === "object" && Array.isArray(m.in)) {
        return [
          { memberId: "m1", amountUsed: 200_000, activeHoldAmount: 0, benefitConfig: { category: "OUTPATIENT" } },
          { memberId: "child1", amountUsed: 250_000, activeHoldAmount: 0, benefitConfig: { category: "OUTPATIENT" } },
        ];
      }
      return [];
    });
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "child2", benefitCategory: "OUTPATIENT", requestedAmount: 100_000,
    });
    expect(a!.familyRootId).toBe("m1");
    const fam = a!.constraints.find((c) => c.kind === "SHARED_FAMILY")!;
    expect(fam.limit).toBe(500_000);
    expect(fam.used).toBe(450_000);
    expect(fam.available).toBe(50_000);
    expect(a!.payableCeiling).toBe(50_000);
    expect(a!.reasonCode).toBe("BENEFIT_FAMILY_LIMIT_EXHAUSTED");
  });

  it("MEMBER-scoped shared pool counts only the treated member", async () => {
    db.benefitConfigSharedLimit.findMany.mockResolvedValue([
      {
        sharedLimitGroup: {
          id: "slg2", name: "Member dental+optical", limitAmount: 300_000, appliesTo: "MEMBER",
          benefitConfigs: [{ benefitConfigId: "cfg-out" }, { benefitConfigId: "cfg-dental" }],
        },
      },
    ]);
    db.benefitUsage.findMany.mockImplementation(async (args: any) => {
      const m = args?.where?.memberId;
      if (m === "m1" && args?.where?.benefitConfigId) {
        return [{ memberId: "m1", amountUsed: 120_000, activeHoldAmount: 0, benefitConfig: { category: "DENTAL" } }];
      }
      return [];
    });
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "OUTPATIENT", requestedAmount: 250_000,
    });
    const pool = a!.constraints.find((c) => c.kind === "SHARED_MEMBER")!;
    expect(pool.available).toBe(180_000);
    expect(a!.payableCeiling).toBe(180_000);
    expect(a!.reasonCode).toBe("BENEFIT_SHARED_LIMIT_EXHAUSTED");
  });

  it("DEC-06: orphaned dependant with a FAMILY pool fails closed with a data-quality error", async () => {
    db.member.findUnique.mockResolvedValue({
      id: "orphan", relationship: "SPOUSE", principalId: null,
      enrollmentDate: ENROLL, packageVersionId: "pv1",
      package: { annualLimit: 0, perVisitLimit: null },
    });
    db.benefitConfigSharedLimit.findMany.mockResolvedValue([
      { sharedLimitGroup: { id: "slg1", name: "Family pool", limitAmount: 500_000, appliesTo: "FAMILY", benefitConfigs: [{ benefitConfigId: "cfg-out" }] } },
    ]);
    await expect(
      BenefitUsageService.computeAvailability(db, {
        memberId: "orphan", benefitCategory: "OUTPATIENT", requestedAmount: 10_000,
        tenantId: "t1", actorId: "u1",
      }),
    ).rejects.toThrow(/principal/i);
    expect(db.exceptionLog.create).toHaveBeenCalled();
  });

  it("resolves the benefit period from the SERVICE DATE, not now (P1.1 rule 1)", async () => {
    const a = await BenefitUsageService.computeAvailability(db, {
      memberId: "m1", benefitCategory: "OUTPATIENT", requestedAmount: 1,
      serviceDate: new Date("2025-12-01"),
    });
    expect(a!.periodStart.getFullYear()).toBe(2025);
    expect(a!.periodStart.getMonth()).toBe(0); // January (enrollment anniversary)
    expect(a!.periodEnd.getFullYear()).toBe(2026);
  });
});

describe("P1 gap #2 — recordUsage rejects an over-limit write (never floor-at-zero)", () => {
  it("allows an exact-limit consumption", async () => {
    db.benefitUsage.findUnique.mockResolvedValue({
      id: "u1", amountUsed: 400_000, activeHoldAmount: 0,
    });
    await expect(
      BenefitUsageService.recordUsage(db, "m1", "OUTPATIENT", 100_000),
    ).resolves.toMatchObject({ remaining: 0 });
  });

  it("rejects one unit above the remaining limit with an operator-readable error", async () => {
    db.benefitUsage.findUnique.mockResolvedValue({
      id: "u1", amountUsed: 400_000, activeHoldAmount: 0,
    });
    await expect(
      BenefitUsageService.recordUsage(db, "m1", "OUTPATIENT", 100_001),
    ).rejects.toThrow(/BENEFIT|limit/i);
    // and no write happened
    expect(db.benefitUsage.update).not.toHaveBeenCalled();
    expect(db.benefitUsage.create).not.toHaveBeenCalled();
  });
});
