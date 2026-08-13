/**
 * UAT-HF P09.04 acceptance — "rules belong to draft version; no hard delete —
 * retire with reason/effectiveTo; copy-forward only through version service;
 * historical version retains exact rules."
 *
 * DEF-055 (S2) gap 2: "Adding two provider rules left the package at Current v5
 * / Total Versions 5, unchanged, even though the same edit form states that
 * saving creates a new version — so there is no versioned record of the network
 * change."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { getOrCreateWorkingDraft } from "@/server/services/package-working-draft.service";

function makeDb(over: Record<string, unknown> = {}) {
  const db = {
    package: { findFirst: vi.fn().mockResolvedValue({ id: "pkg1", currentVersionId: "pv-live" }) },
    packageVersion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { versionNumber: 5 } }),
      create: vi.fn().mockResolvedValue({ id: "pv-draft", versionNumber: 6 }),
    },
    benefitConfig: { create: vi.fn().mockResolvedValue({ id: "nb", category: "OUTPATIENT" }) },
    sharedLimitGroup: { create: vi.fn().mockResolvedValue({ id: "slg-new" }) },
    benefitConfigSharedLimit: { createMany: vi.fn().mockResolvedValue({}) },
    packageProviderEligibility: { create: vi.fn().mockResolvedValue({}) },
    treatmentExclusionRule: { create: vi.fn().mockResolvedValue({}) },
    referralRule: { create: vi.fn().mockResolvedValue({}) },
    ...over,
  };
  return db as unknown as Parameters<typeof getOrCreateWorkingDraft>[0] & typeof db;
}

const INPUT = { tenantId: "t1", packageId: "pkg1", userId: "u1" };

const SOURCE_VERSION = {
  id: "pv-live",
  facilityAccess: ["ALL_NETWORK"],
  pricingModelUrl: null,
  pricingConfig: null,
  benefits: [
    {
      id: "b-out", category: "OUTPATIENT", customCategoryName: null,
      annualSubLimit: 100_000, perVisitLimit: 5_000, copayPercentage: 10,
      coInsurancePct: 0, deductibleAmount: 0, fundingModel: "FEE_FOR_SERVICE",
      fundingOverrides: null, waitingPeriodDays: 30, notes: null, exclusions: [],
    },
  ],
  sharedLimitGroups: [
    { id: "slg1", name: "Maternity pool", limitAmount: 3_000_000, appliesTo: "FAMILY", benefitConfigs: [{ benefitConfigId: "b-out" }] },
  ],
  eligibilityRules: [
    {
      id: "er1", providerId: "prov-1", providerTier: null, inclusionType: "EXCLUDE",
      priority: 7, effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-12-31"), isActive: false,
    },
  ],
  treatmentExclusions: [
    {
      ruleCategory: "COSMETIC", exclusionType: "ABSOLUTE", benefitCategories: ["OUTPATIENT"],
      serviceCodes: [], diagnosisCodes: [], procedureCodes: [], exceptionLogic: null,
      effectiveFrom: new Date("2026-01-01"), effectiveTo: null, isActive: true,
      memberSafeExplanation: "Cosmetic procedures are not covered.", sourceClause: "Sch 4", internalNote: null,
    },
  ],
  referralRules: [
    {
      benefitCategories: ["OUTPATIENT"], serviceCodes: ["99245"], providerSpecialties: [],
      requiresReferral: true, emergencyException: true,
      effectiveFrom: new Date("2026-01-01"), effectiveTo: null, isActive: true,
      memberSafeExplanation: "Specialist visits need a referral.", sourceClause: null,
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("P09.04 one working draft, not one per rule", () => {
  it("reuses an existing DRAFT instead of minting another version", async () => {
    // An operator adding three rules must not produce v6, v7 and v8.
    const db = makeDb();
    db.packageVersion.findFirst.mockResolvedValue({ id: "pv-existing", versionNumber: 6 });

    const draft = await getOrCreateWorkingDraft(db, INPUT);

    expect(draft).toEqual({ id: "pv-existing", versionNumber: 6, created: false });
    expect(db.packageVersion.create).not.toHaveBeenCalled();
  });

  it("creates one when there is none, numbered MAX + 1", async () => {
    const db = makeDb();
    const draft = await getOrCreateWorkingDraft(db, INPUT);

    expect(draft.created).toBe(true);
    expect(db.packageVersion.create.mock.calls[0][0].data.versionNumber).toBe(6);
    expect(db.packageVersion.create.mock.calls[0][0].data.status).toBe("DRAFT");
  });

  it("records who opened it, so a checker can be required to differ (DEC-03)", async () => {
    const db = makeDb();
    await getOrCreateWorkingDraft(db, INPUT);
    expect(db.packageVersion.create.mock.calls[0][0].data.submittedById).toBe("u1");
  });

  it("only looks for a DRAFT — a REJECTED version is not silently reopened", async () => {
    // Reopening one would let a change the checker refused come back without
    // them knowing.
    const db = makeDb();
    await getOrCreateWorkingDraft(db, INPUT);
    expect(db.packageVersion.findFirst.mock.calls[0][0].where.status).toBe("DRAFT");
  });

  it("refuses a package in another tenant", async () => {
    const db = makeDb();
    db.package.findFirst.mockResolvedValue(null);
    await expect(getOrCreateWorkingDraft(db, INPUT)).rejects.toThrow(/not found/i);
  });
});

describe("P09.04 the copy-forward keeps the version faithful", () => {
  it("carries provider rules WITH their precedence columns", async () => {
    // The bug this test exists for: P09.05 added priority / effectiveFrom /
    // effectiveTo / isActive, and the original copy-forward did not carry them —
    // so every new version reset priority to 0, dropped the window, and
    // REACTIVATED a retired rule.
    const db = makeDb();
    db.packageVersion.findUnique.mockResolvedValue(SOURCE_VERSION);

    await getOrCreateWorkingDraft(db, INPUT);

    const copied = db.packageProviderEligibility.create.mock.calls[0][0].data;
    expect(copied).toMatchObject({
      packageVersionId: "pv-draft",
      providerId: "prov-1",
      inclusionType: "EXCLUDE",
      priority: 7,
      isActive: false,
    });
    expect(copied.effectiveFrom).toEqual(new Date("2026-01-01"));
    expect(copied.effectiveTo).toEqual(new Date("2026-12-31"));
  });

  it("carries benefits, exclusions and referral rules too", async () => {
    const db = makeDb();
    db.packageVersion.findUnique.mockResolvedValue(SOURCE_VERSION);

    await getOrCreateWorkingDraft(db, INPUT);

    expect(db.benefitConfig.create).toHaveBeenCalledTimes(1);
    expect(db.treatmentExclusionRule.create).toHaveBeenCalledTimes(1);
    expect(db.referralRule.create).toHaveBeenCalledTimes(1);
    // The referral row is tenant-scoped; omitting it would fail at runtime.
    expect(db.referralRule.create.mock.calls[0][0].data.tenantId).toBe("t1");
  });

  it("re-maps shared-limit links to the NEW benefit ids", async () => {
    // Copying the group but keeping the old benefit ids would strand the pool
    // against a previous version's rows.
    const db = makeDb();
    db.packageVersion.findUnique.mockResolvedValue(SOURCE_VERSION);
    db.benefitConfig.create.mockResolvedValue({ id: "nb-out", category: "OUTPATIENT" });

    await getOrCreateWorkingDraft(db, INPUT);

    expect(db.benefitConfigSharedLimit.createMany).toHaveBeenCalledWith({
      data: [{ sharedLimitGroupId: "slg-new", benefitConfigId: "nb-out" }],
    });
  });

  it("drops a shared-limit group whose benefits all disappeared", async () => {
    const db = makeDb();
    db.packageVersion.findUnique.mockResolvedValue({
      ...SOURCE_VERSION,
      sharedLimitGroups: [{ id: "slg1", name: "Orphan", limitAmount: 1, appliesTo: "MEMBER", benefitConfigs: [{ benefitConfigId: "gone" }] }],
    });

    await getOrCreateWorkingDraft(db, INPUT);
    expect(db.sharedLimitGroup.create).not.toHaveBeenCalled();
  });

  it("handles a package with no current version at all", async () => {
    const db = makeDb();
    db.package.findFirst.mockResolvedValue({ id: "pkg1", currentVersionId: null });

    const draft = await getOrCreateWorkingDraft(db, INPUT);

    expect(draft.created).toBe(true);
    expect(db.packageProviderEligibility.create).not.toHaveBeenCalled();
    expect(db.benefitConfig.create).not.toHaveBeenCalled();
  });
});

describe("P09.04 the other copy-forward was fixed too", () => {
  it("updatePackageAction carries the precedence columns", () => {
    // Two copy-forwards exist. Fixing only the new one would leave the benefits
    // form still resetting every provider rule's priority and reviving retired
    // ones.
    const actions = readFileSync("src/app/(admin)/packages/[id]/edit/actions.ts", "utf8");
    const block = actions.slice(actions.indexOf("Copy-forward provider eligibility rules"));
    expect(block.slice(0, 1400)).toContain("priority: rule.priority");
    expect(block.slice(0, 1400)).toContain("isActive: rule.isActive");
  });
});

describe("P09.04 the surfaces DEF-055 named", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("gap 1 — the rule form finally has date controls", () => {
    const mgr = read("src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx");
    expect(mgr).toContain('name="effectiveFrom"');
    expect(mgr).toContain('name="effectiveTo"');
    expect(mgr).toMatch(/Effective \{r\.effectiveFrom/);
  });

  it("gap 2 — the screen says which version it is editing", () => {
    const mgr = read("src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx");
    expect(mgr).toMatch(/Editing draft v\{draftVersionNumber\}/);
    expect(mgr).toMatch(/until this draft is approved and activated/i);
  });

  it("gap 3 — the DETAIL page shows the network to anyone who can read it", () => {
    const detail = read("src/app/(admin)/packages/[id]/page.tsx");
    expect(detail).toMatch(/Provider Network Rules/);
    expect(detail).toContain("packageProviderEligibility.findMany");
    // And states the precedence, so the read view agrees with the edit view.
    expect(detail).toMatch(/the more specific one wins/i);
  });

  it("gap 3 — it says so plainly when there are no restrictions", () => {
    const detail = read("src/app/(admin)/packages/[id]/page.tsx");
    expect(detail).toMatch(/No network restrictions/);
  });

  it("gap 4 — the native confirm is gone, replaced by a reasoned withdrawal", () => {
    const mgr = read("src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx");
    expect(mgr).not.toMatch(/confirm\(/);
    expect(mgr).toContain("retireProviderEligibilityAction");
    expect(mgr).toMatch(/name="reason"/);
    expect(mgr).toMatch(/minLength=\{5\}/);
  });

  it("gap 4 — the withdrawal control names the rule it removes", () => {
    const mgr = read("src/app/(admin)/packages/[id]/edit/ProviderEligibilityManager.tsx");
    expect(mgr).toMatch(/aria-label=\{`Withdraw rule:/);
    expect(mgr).toMatch(/Withdraw “\{ruleLabel\(r\)\}”/);
  });

  it("retired rules stay visible on the detail page rather than vanishing", () => {
    const detail = read("src/app/(admin)/packages/[id]/page.tsx");
    expect(detail).toContain("retiredNetworkRules");
    expect(detail).toMatch(/Withdrawn/);
  });
});
