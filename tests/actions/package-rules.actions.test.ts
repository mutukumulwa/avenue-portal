import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  package: { findUnique: vi.fn(), update: vi.fn() },
  packageVersion: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  sharedLimitGroup: { create: vi.fn() },
  benefitConfigSharedLimit: { createMany: vi.fn() },
  packageProviderEligibility: { create: vi.fn() },
  benefitConfig: { findMany: vi.fn() },
  provider: { findFirst: vi.fn() },
  providerContract: { findFirst: vi.fn() },
  treatmentExclusionRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  referralRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-1" } }),
  ROLES: { UNDERWRITING: "UNDERWRITING" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import {
  createTreatmentExclusionAction,
  deleteTreatmentExclusionAction,
  createReferralRuleAction,
  deleteReferralRuleAction,
  updatePackageAction,
} from "@/app/(admin)/packages/[id]/edit/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

const okVersion = () =>
  mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "tenant-1" } });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.treatmentExclusionRule.findMany.mockResolvedValue([]);
  mockPrisma.treatmentExclusionRule.create.mockResolvedValue({ id: "ex-new" });
  mockPrisma.referralRule.findMany.mockResolvedValue([]);
  mockPrisma.referralRule.create.mockResolvedValue({ id: "ref-new" });
});

// ─── createTreatmentExclusionAction ────────────────────────────────────────

describe("createTreatmentExclusionAction (WP-2.3)", () => {
  const goodForm = (over: Record<string, string> = {}) => {
    const f = fd({
      packageVersionId: "pv1",
      ruleCategory: "EXPERIMENTAL",
      exclusionType: "ABSOLUTE",
      effectiveFrom: "2026-01-01",
      memberSafeExplanation: "Experimental treatments are not covered.",
      ...over,
    });
    f.append("procedureCodes", "0XYZ9");
    return f;
  };

  it("creates a version-owned exclusion + audits it", async () => {
    okVersion();
    const res = await createTreatmentExclusionAction({ ok: true }, goodForm());
    expect(res.ok).toBe(true);
    expect(mockPrisma.treatmentExclusionRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          packageVersionId: "pv1",
          ruleCategory: "EXPERIMENTAL",
          exclusionType: "ABSOLUTE",
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "TREATMENT_EXCLUSION_CREATE" }) }),
    );
  });

  it("REJECTS a version owned by another tenant (no cross-tenant write)", async () => {
    mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "other" } });
    const res = await createTreatmentExclusionAction({ ok: true }, goodForm());
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentExclusionRule.create).not.toHaveBeenCalled();
  });

  it("REJECTS when neither owner is supplied (N-012 XOR)", async () => {
    const f = goodForm({ packageVersionId: "" });
    const res = await createTreatmentExclusionAction({ ok: true }, f);
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentExclusionRule.create).not.toHaveBeenCalled();
  });

  it("REJECTS an exclusion overlapping an existing rule (same category + scope + window)", async () => {
    okVersion();
    mockPrisma.treatmentExclusionRule.findMany.mockResolvedValue([
      {
        id: "e1",
        ruleCategory: "EXPERIMENTAL",
        benefitCategories: [],
        serviceCodes: [],
        diagnosisCodes: [],
        procedureCodes: ["0XYZ9"],
        effectiveFrom: new Date("2025-06-01"),
        effectiveTo: null,
        isActive: true,
      },
    ]);
    const res = await createTreatmentExclusionAction({ ok: true }, goodForm());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.effectiveFrom?.length).toBeGreaterThan(0);
    expect(mockPrisma.treatmentExclusionRule.create).not.toHaveBeenCalled();
  });

  it("REJECTS a rule with no scope dimension and writes nothing", async () => {
    okVersion();
    const res = await createTreatmentExclusionAction(
      { ok: true },
      fd({
        packageVersionId: "pv1",
        ruleCategory: "EXPERIMENTAL",
        exclusionType: "ABSOLUTE",
        effectiveFrom: "2026-01-01",
        memberSafeExplanation: "x",
      }),
    );
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentExclusionRule.create).not.toHaveBeenCalled();
  });

  it("supports a provider-contract owner (N-012) and verifies contract tenancy", async () => {
    mockPrisma.providerContract.findFirst.mockResolvedValue({ id: "pc1" });
    const f = fd({
      providerContractId: "pc1",
      ruleCategory: "OTHER",
      exclusionType: "ABSOLUTE",
      effectiveFrom: "2026-01-01",
      memberSafeExplanation: "Excluded under the provider agreement.",
    });
    f.append("serviceCodes", "SVC1");
    const res = await createTreatmentExclusionAction({ ok: true }, f);
    expect(res.ok).toBe(true);
    expect(mockPrisma.treatmentExclusionRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerContractId: "pc1" }) }),
    );
  });
});

describe("deleteTreatmentExclusionAction — tenant scope", () => {
  it("no-ops for another tenant", async () => {
    mockPrisma.treatmentExclusionRule.findUnique.mockResolvedValue({
      tenantId: "other",
      ruleCategory: "COSMETIC",
      packageVersion: { packageId: "pkg1" },
    });
    await deleteTreatmentExclusionAction("ex-x");
    expect(mockPrisma.treatmentExclusionRule.delete).not.toHaveBeenCalled();
  });

  it("deletes + audits when owned by the tenant", async () => {
    mockPrisma.treatmentExclusionRule.findUnique.mockResolvedValue({
      tenantId: "tenant-1",
      ruleCategory: "COSMETIC",
      packageVersion: { packageId: "pkg1" },
    });
    mockPrisma.treatmentExclusionRule.delete.mockResolvedValue({});
    await deleteTreatmentExclusionAction("ex-1");
    expect(mockPrisma.treatmentExclusionRule.delete).toHaveBeenCalledWith({ where: { id: "ex-1" } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "TREATMENT_EXCLUSION_DELETE" }) }),
    );
  });
});

// ─── createReferralRuleAction ──────────────────────────────────────────────

describe("createReferralRuleAction (WP-2.4)", () => {
  const goodForm = () => {
    const f = fd({
      packageVersionId: "pv1",
      requiresReferral: "on",
      emergencyException: "on",
      effectiveFrom: "2026-01-01",
      memberSafeExplanation: "Specialist visits require a referral except in an emergency.",
    });
    f.append("benefitCategories", "OUTPATIENT");
    f.append("providerSpecialties", "Cardiology");
    return f;
  };

  it("creates a referral rule + audits it", async () => {
    okVersion();
    const res = await createReferralRuleAction({ ok: true }, goodForm());
    expect(res.ok).toBe(true);
    expect(mockPrisma.referralRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          packageVersionId: "pv1",
          requiresReferral: true,
          emergencyException: true,
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "REFERRAL_RULE_CREATE" }) }),
    );
  });

  it("REJECTS a version owned by another tenant", async () => {
    mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "other" } });
    const res = await createReferralRuleAction({ ok: true }, goodForm());
    expect(res.ok).toBe(false);
    expect(mockPrisma.referralRule.create).not.toHaveBeenCalled();
  });

  it("REJECTS a referral rule overlapping an existing rule", async () => {
    okVersion();
    mockPrisma.referralRule.findMany.mockResolvedValue([
      {
        id: "r1",
        benefitCategories: ["OUTPATIENT"],
        serviceCodes: [],
        providerSpecialties: ["Cardiology"],
        effectiveFrom: new Date("2025-01-01"),
        effectiveTo: null,
        isActive: true,
      },
    ]);
    const res = await createReferralRuleAction({ ok: true }, goodForm());
    expect(res.ok).toBe(false);
    expect(mockPrisma.referralRule.create).not.toHaveBeenCalled();
  });
});

describe("deleteReferralRuleAction — tenant scope", () => {
  it("no-ops for another tenant", async () => {
    mockPrisma.referralRule.findUnique.mockResolvedValue({ tenantId: "other", packageVersion: { packageId: "pkg1" } });
    await deleteReferralRuleAction("ref-x");
    expect(mockPrisma.referralRule.delete).not.toHaveBeenCalled();
  });
});

// ─── updatePackageAction — copy-forward of exclusions + referral rules ──────

describe("updatePackageAction — copy-forward carries structured rules to the new version", () => {
  const editForm = () =>
    fd({
      packageId: "pkg1",
      name: "Gold",
      type: "GROUP",
      status: "ACTIVE",
      annualLimit: "5000000",
      contributionAmount: "25000",
      minAge: "0",
      maxAge: "65",
      dependentMaxAge: "24",
      benefit_enabled_OUTPATIENT: "on",
      benefit_limit_OUTPATIENT: "100000",
      benefit_copay_OUTPATIENT: "0",
      benefit_wait_OUTPATIENT: "0",
    });

  beforeEach(() => {
    mockPrisma.package.findUnique.mockResolvedValue({
      id: "pkg1",
      tenantId: "tenant-1",
      currentVersion: {
        id: "pv1",
        versionNumber: 3,
        benefits: [
          { id: "b-out", category: "OUTPATIENT", customCategoryName: null, coInsurancePct: 0, deductibleAmount: 0, fundingModel: "FEE_FOR_SERVICE", fundingOverrides: null, notes: null, exclusions: [] },
        ],
        sharedLimitGroups: [],
        eligibilityRules: [],
        treatmentExclusions: [
          {
            id: "ex-old",
            ruleCategory: "COSMETIC",
            exclusionType: "CONDITIONAL",
            benefitCategories: ["SURGICAL"],
            serviceCodes: [],
            diagnosisCodes: [],
            procedureCodes: ["15788"],
            exceptionLogic: { type: "RECONSTRUCTIVE_AFTER_TRAUMA", requiresPriorCoveredTrauma: true },
            effectiveFrom: new Date("2026-01-01"),
            effectiveTo: null,
            sourceClause: "Policy §7.3",
            internalNote: "note",
            memberSafeExplanation: "Cosmetic surgery is not covered.",
            isActive: true,
          },
        ],
        referralRules: [
          {
            id: "ref-old",
            benefitCategories: ["OUTPATIENT"],
            serviceCodes: [],
            providerSpecialties: ["Cardiology"],
            requiresReferral: true,
            emergencyException: true,
            effectiveFrom: new Date("2026-01-01"),
            effectiveTo: null,
            sourceClause: null,
            memberSafeExplanation: "Referral required.",
            isActive: true,
          },
        ],
      },
    });
    mockPrisma.packageVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 3 } });
    mockPrisma.packageVersion.create.mockResolvedValue({ id: "pv2", benefits: [{ id: "nb-out", category: "OUTPATIENT" }] });
    mockPrisma.package.update.mockResolvedValue({});
  });

  it("re-creates the exclusion + referral rows against the NEW version (immutable history preserved)", async () => {
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockPrisma.treatmentExclusionRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          packageVersionId: "pv2",
          ruleCategory: "COSMETIC",
          exclusionType: "CONDITIONAL",
          memberSafeExplanation: "Cosmetic surgery is not covered.",
        }),
      }),
    );
    expect(mockPrisma.referralRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ packageVersionId: "pv2", requiresReferral: true, emergencyException: true }),
      }),
    );
    // Audit records the copied counts.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PACKAGE_VERSION_CREATE",
          metadata: expect.objectContaining({ copiedExclusions: 1, copiedReferralRules: 1 }),
        }),
      }),
    );
  });
});
