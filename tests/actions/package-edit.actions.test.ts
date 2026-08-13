import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  package: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  packageVersion: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  sharedLimitGroup: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  benefitConfigSharedLimit: { createMany: vi.fn(), deleteMany: vi.fn() },
  packageProviderEligibility: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  benefitConfig: { findMany: vi.fn() },
  provider: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// P09.04: the working-draft resolver has its own suite; here it is a stub so
// these tests assert the ACTION's behaviour, not the copy-forward's.
const getOrCreateWorkingDraft = vi.hoisted(() =>
  vi.fn(async () => ({ id: "draft-v4", versionNumber: 4, created: true })),
);
vi.mock("@/server/services/package-working-draft.service", () => ({ getOrCreateWorkingDraft }));

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
  updatePackageAction,
  createSharedLimitAction,
  deleteSharedLimitAction,
  createProviderEligibilityAction,
  retireProviderEligibilityAction,
} from "@/app/(admin)/packages/[id]/edit/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

/** A package load with one OUTPATIENT + one MATERNITY benefit, a FAMILY
 *  maternity pool, and one provider-INCLUDE rule on the current version. */
function loadedPackage() {
  mockPrisma.package.findUnique.mockResolvedValue({
    id: "pkg1",
    tenantId: "tenant-1",
    currentVersion: {
      id: "pv1",
      versionNumber: 3,
      benefits: [
        { id: "b-out", category: "OUTPATIENT", customCategoryName: null, coInsurancePct: 0, deductibleAmount: 0, fundingModel: "FEE_FOR_SERVICE", fundingOverrides: null, notes: null, exclusions: [] },
        { id: "b-mat", category: "MATERNITY", customCategoryName: null, coInsurancePct: 0, deductibleAmount: 0, fundingModel: "FEE_FOR_SERVICE", fundingOverrides: null, notes: null, exclusions: [] },
      ],
      sharedLimitGroups: [
        { id: "slg1", name: "Maternity family pool", limitAmount: 3_000_000, appliesTo: "FAMILY", benefitConfigs: [{ benefitConfigId: "b-mat" }] },
      ],
      eligibilityRules: [{ id: "er1", providerId: "p1", providerTier: null, inclusionType: "INCLUDE" }],
    },
  });
  mockPrisma.packageVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 3 } });
  mockPrisma.packageVersion.create.mockResolvedValue({
    id: "pv2",
    benefits: [
      { id: "nb-out", category: "OUTPATIENT" },
      { id: "nb-mat", category: "MATERNITY" },
    ],
  });
}

const editForm = (over: Record<string, string> = {}) =>
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
    benefit_pervisit_OUTPATIENT: "300000",
    benefit_enabled_MATERNITY: "on",
    benefit_limit_MATERNITY: "3000000",
    benefit_copay_MATERNITY: "0",
    benefit_wait_MATERNITY: "0",
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.package.update.mockResolvedValue({});
  mockPrisma.sharedLimitGroup.create.mockResolvedValue({ id: "new-slg" });
  mockPrisma.benefitConfigSharedLimit.createMany.mockResolvedValue({});
  mockPrisma.packageProviderEligibility.create.mockResolvedValue({ id: "new-er" });
  // P09.05: createProviderEligibilityAction now reads the sibling rules to
  // refuse a save that would create an unresolvable precedence tie. Default to
  // an empty set so the existing cases still exercise the happy path.
  mockPrisma.packageProviderEligibility.findMany.mockResolvedValue([]);
  mockPrisma.packageProviderEligibility.update.mockResolvedValue({});
  mockPrisma.packageProviderEligibility.delete.mockResolvedValue({});
  mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
  getOrCreateWorkingDraft.mockResolvedValue({ id: "draft-v4", versionNumber: 4, created: true });
});

// ─── updatePackageAction — validation ─────────────────────────────────────

describe("updatePackageAction — validation (no write on failure)", () => {
  it("REJECTS minAge >= maxAge and writes nothing", async () => {
    const res = await updatePackageAction({ ok: true }, editForm({ minAge: "70", maxAge: "65" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.minAge?.length).toBeGreaterThan(0);
    expect(mockPrisma.packageVersion.create).not.toHaveBeenCalled();
  });

  it("REJECTS a benefit sub-limit above the annual limit", async () => {
    const res = await updatePackageAction(
      { ok: true },
      editForm({ annualLimit: "500000", benefit_limit_MATERNITY: "3000000" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.benefit_limit_MATERNITY?.length).toBeGreaterThan(0);
    expect(mockPrisma.packageVersion.create).not.toHaveBeenCalled();
  });

  it.each([
    ["negative annual limit", { annualLimit: "-1" }],
    ["copay above 100", { benefit_copay_OUTPATIENT: "500" }],
    ["zero per-visit limit", { benefit_pervisit_OUTPATIENT: "0" }],
  ])("REJECTS %s", async (_l, over) => {
    const res = await updatePackageAction({ ok: true }, editForm(over));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageVersion.create).not.toHaveBeenCalled();
  });
});

// ─── updatePackageAction — version bump, per-visit, copy-forward, audit ────

describe("updatePackageAction — new version + copy-forward", () => {
  it("numbers the new version from MAX(versionNumber)+1", async () => {
    loadedPackage();
    mockPrisma.packageVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 7 } });
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.packageVersion.aggregate).toHaveBeenCalled();
    expect(mockPrisma.packageVersion.create.mock.calls[0][0].data.versionNumber).toBe(8);
  });

  it("persists the per-visit limit on the new OUTPATIENT benefit (DEF-022 write path)", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    const created = mockPrisma.packageVersion.create.mock.calls[0][0].data.benefits.create;
    const out = created.find((b: { category: string }) => b.category === "OUTPATIENT");
    expect(out.perVisitLimit).toBe(300000);
  });

  it("copies the maternity FAMILY pool forward, re-mapping its benefit link to the new version", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    // Group re-created against the NEW version pv2…
    expect(mockPrisma.sharedLimitGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ packageVersionId: "pv2", name: "Maternity family pool", appliesTo: "FAMILY" }),
      }),
    );
    // …and its link re-mapped b-mat → nb-mat (the new MATERNITY config id).
    expect(mockPrisma.benefitConfigSharedLimit.createMany).toHaveBeenCalledWith({
      data: [{ sharedLimitGroupId: "new-slg", benefitConfigId: "nb-mat" }],
    });
  });

  it("copies provider eligibility rules forward onto the new version", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.packageProviderEligibility.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ packageVersionId: "pv2", providerId: "p1", inclusionType: "INCLUDE" }),
      }),
    );
  });

  /**
   * UAT-HF P09.01 — DEF-024. This test asserted the defect.
   *
   * "A single underwriter changed a live ACTIVE package (enabled DENTAL at UGX
   * 10,000) and the change took effect immediately as version v5 'Current',
   * with no approval requested, no Draft/Pending/Approved state."
   *
   * Repointing `currentVersionId` in the maker's save IS that behaviour, so the
   * expectation is inverted: the save creates a DRAFT and touches nothing live.
   * Activation moved to approvePackageVersionAction, where a different checker
   * has to say yes (DEC-03).
   */
  it("does NOT repoint the package — the maker's save leaves a DRAFT", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);

    // The acceptance: "maker save cannot change live member eligibility".
    // `currentVersionId` is the pointer eligibility reads.
    const repointed = mockPrisma.package.update.mock.calls.some(
      (c: unknown[]) => (c[0] as { data?: { currentVersionId?: string } })?.data?.currentVersionId,
    );
    expect(repointed).toBe(false);
  });

  it("creates the new version as a DRAFT, recording who made it", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    const created = mockPrisma.packageVersion.create.mock.calls.at(-1)![0] as {
      data: { status?: string; submittedById?: string };
    };
    expect(created.data.status).toBe("DRAFT");
    // Recorded so the checker can be required to be somebody else.
    expect(created.data.submittedById).toBeTruthy();
  });

  it("still writes a PACKAGE_VERSION_CREATE audit", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "PACKAGE_VERSION_CREATE" }) }),
    );
  });
});

// ─── createSharedLimitAction — D1 + tenant scope + guards ──────────────────

describe("createSharedLimitAction", () => {
  const okVersion = () =>
    mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "tenant-1" } });

  it("creates a single-category FAMILY pool (CT-015) and audits it", async () => {
    okVersion();
    mockPrisma.benefitConfig.findMany.mockResolvedValue([{ id: "bc-mat" }]);
    mockPrisma.sharedLimitGroup.findFirst.mockResolvedValue(null);
    mockPrisma.sharedLimitGroup.create.mockResolvedValue({ id: "slg-new" });

    const form = fd({ packageVersionId: "pv1", name: "Maternity family pool", limitAmount: "3000000", appliesTo: "FAMILY" });
    form.append("benefitConfigIds", "bc-mat");

    const res = await createSharedLimitAction({ ok: true }, form);
    expect(res.ok).toBe(true);
    expect(mockPrisma.sharedLimitGroup.create).toHaveBeenCalledOnce();
    expect(mockPrisma.benefitConfigSharedLimit.createMany).toHaveBeenCalledWith({
      data: [{ sharedLimitGroupId: "slg-new", benefitConfigId: "bc-mat" }],
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SHARED_LIMIT_CREATE" }) }),
    );
  });

  it("REJECTS a single-benefit MEMBER pool (needs 2) and writes nothing", async () => {
    okVersion();
    const form = fd({ packageVersionId: "pv1", name: "Combined", limitAmount: "100000", appliesTo: "MEMBER" });
    form.append("benefitConfigIds", "bc1");
    const res = await createSharedLimitAction({ ok: true }, form);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.benefitConfigIds?.length).toBeGreaterThan(0);
    expect(mockPrisma.sharedLimitGroup.create).not.toHaveBeenCalled();
  });

  it.each([
    ["zero amount", "0"],
    ["negative amount", "-5"],
  ])("REJECTS a %s pool", async (_l, amount) => {
    okVersion();
    const form = fd({ packageVersionId: "pv1", name: "X", limitAmount: amount, appliesTo: "FAMILY" });
    form.append("benefitConfigIds", "bc1");
    const res = await createSharedLimitAction({ ok: true }, form);
    expect(res.ok).toBe(false);
    expect(mockPrisma.sharedLimitGroup.create).not.toHaveBeenCalled();
  });

  it("REJECTS a benefit id that is not part of the version", async () => {
    okVersion();
    mockPrisma.benefitConfig.findMany.mockResolvedValue([]); // none owned
    const form = fd({ packageVersionId: "pv1", name: "Pool", limitAmount: "100000", appliesTo: "FAMILY" });
    form.append("benefitConfigIds", "bc-foreign");
    const res = await createSharedLimitAction({ ok: true }, form);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.benefitConfigIds?.length).toBeGreaterThan(0);
    expect(mockPrisma.sharedLimitGroup.create).not.toHaveBeenCalled();
  });

  it("REJECTS a version owned by another tenant (no cross-tenant write)", async () => {
    mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "other" } });
    const form = fd({ packageVersionId: "pv1", name: "Pool", limitAmount: "100000", appliesTo: "FAMILY" });
    form.append("benefitConfigIds", "bc-mat");
    const res = await createSharedLimitAction({ ok: true }, form);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.formError).toMatch(/not found/i);
  });

  it("REJECTS a duplicate group name in the version", async () => {
    okVersion();
    mockPrisma.benefitConfig.findMany.mockResolvedValue([{ id: "bc-mat" }]);
    mockPrisma.sharedLimitGroup.findFirst.mockResolvedValue({ id: "existing" });
    const form = fd({ packageVersionId: "pv1", name: "Maternity family pool", limitAmount: "3000000", appliesTo: "FAMILY" });
    form.append("benefitConfigIds", "bc-mat");
    const res = await createSharedLimitAction({ ok: true }, form);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.name?.length).toBeGreaterThan(0);
    expect(mockPrisma.sharedLimitGroup.create).not.toHaveBeenCalled();
  });
});

// ─── delete actions — tenant scoping ───────────────────────────────────────

describe("deleteSharedLimitAction — tenant scope", () => {
  it("no-ops (no delete) when the group belongs to another tenant", async () => {
    mockPrisma.sharedLimitGroup.findUnique.mockResolvedValue({
      name: "P", packageVersion: { packageId: "pkg1", package: { tenantId: "other" } },
    });
    await deleteSharedLimitAction("slg-x");
    expect(mockPrisma.sharedLimitGroup.delete).not.toHaveBeenCalled();
  });

  it("deletes + audits when owned by the tenant", async () => {
    mockPrisma.sharedLimitGroup.findUnique.mockResolvedValue({
      name: "Pool", packageVersion: { packageId: "pkg1", package: { tenantId: "tenant-1" } },
    });
    mockPrisma.sharedLimitGroup.delete.mockResolvedValue({});
    await deleteSharedLimitAction("slg-1");
    expect(mockPrisma.sharedLimitGroup.delete).toHaveBeenCalledWith({ where: { id: "slg-1" } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SHARED_LIMIT_DELETE" }) }),
    );
  });
});

describe("provider eligibility actions", () => {
  // UAT-HF P09.04 (DEF-055): rules now land on a DRAFT version resolved by
  // getOrCreateWorkingDraft, so the action takes a packageId rather than a
  // version id. The draft service is mocked; its own behaviour is covered by
  // tests/services/package-working-draft.test.ts.
  it("createProviderEligibilityAction rejects a package owned by another tenant", async () => {
    mockPrisma.package.findFirst.mockResolvedValue(null);
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageId: "pkg1", inclusionType: "INCLUDE", providerTier: "OWN" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.create).not.toHaveBeenCalled();
  });

  it("createProviderEligibilityAction requires a provider or tier", async () => {
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageId: "pkg1", inclusionType: "INCLUDE" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.create).not.toHaveBeenCalled();
  });

  it("createProviderEligibilityAction writes to the DRAFT, not the live version", async () => {
    // The heart of DEF-055 gap 2: the run's rules went onto the ACTIVE version,
    // so live eligibility moved with no version bump and no approval.
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageId: "pkg1", inclusionType: "EXCLUDE", providerTier: "PARTNER" }));
    expect(res.ok).toBe(true);
    expect(mockPrisma.packageProviderEligibility.create.mock.calls[0][0].data.packageVersionId).toBe("draft-v4");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "PACKAGE_PROVIDER_ELIGIBILITY_CREATE" }) }),
    );
  });

  it("createProviderEligibilityAction stores the effective window", async () => {
    // DEF-055 gap 1: "The provider rule form has no date control at all."
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
    const res = await createProviderEligibilityAction(
      { ok: true },
      fd({ packageId: "pkg1", inclusionType: "EXCLUDE", providerTier: "PANEL", effectiveFrom: "2026-09-01", effectiveTo: "2026-12-31" }),
    );
    expect(res.ok).toBe(true);
    const data = mockPrisma.packageProviderEligibility.create.mock.calls[0][0].data;
    expect(new Date(data.effectiveFrom).toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(new Date(data.effectiveTo).toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("createProviderEligibilityAction refuses an end date before the start", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
    const res = await createProviderEligibilityAction(
      { ok: true },
      fd({ packageId: "pkg1", inclusionType: "EXCLUDE", providerTier: "PANEL", effectiveFrom: "2026-12-31", effectiveTo: "2026-09-01" }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.fieldErrors?.effectiveTo?.[0]).toMatch(/cannot be before/i);
    expect(mockPrisma.packageProviderEligibility.create).not.toHaveBeenCalled();
  });

  it("createProviderEligibilityAction treats blank dates as an open window", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageId: "pkg1", inclusionType: "EXCLUDE", providerTier: "PANEL" }));
    expect(res.ok).toBe(true);
    const data = mockPrisma.packageProviderEligibility.create.mock.calls[0][0].data;
    expect(data.effectiveFrom).toBeNull();
    expect(data.effectiveTo).toBeNull();
  });

  // UAT-HF P09.05 (DEF-054) — the write-time half of the precedence work.
  it("createProviderEligibilityAction REFUSES a rule that would tie with an existing one", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
    mockPrisma.packageProviderEligibility.findMany.mockResolvedValue([
      { id: "er-1", inclusionType: "EXCLUDE", providerId: null, providerTier: "PARTNER", priority: 0, effectiveFrom: null, effectiveTo: null, isActive: true },
    ]);

    const res = await createProviderEligibilityAction(
      { ok: true },
      fd({ packageId: "pkg1", inclusionType: "INCLUDE", providerTier: "PARTNER" }),
    );

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.formError).toMatch(/contradicts one already in the draft/i);
    expect(mockPrisma.packageProviderEligibility.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("createProviderEligibilityAction ALLOWS a rule the ladder can resolve", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg1" });
    mockPrisma.provider.findFirst.mockResolvedValue({ id: "prov-agape" });
    mockPrisma.packageProviderEligibility.findMany.mockResolvedValue([
      { id: "er-1", inclusionType: "EXCLUDE", providerId: null, providerTier: "PANEL", priority: 0, effectiveFrom: null, effectiveTo: null, isActive: true },
    ]);

    const res = await createProviderEligibilityAction(
      { ok: true },
      fd({ packageId: "pkg1", inclusionType: "INCLUDE", providerId: "prov-agape" }),
    );

    expect(res.ok).toBe(true);
    expect(mockPrisma.packageProviderEligibility.create).toHaveBeenCalled();
  });
});

// ─── P09.04 (DEF-055) — retire, never hard-delete ──────────────────────────

describe("retireProviderEligibilityAction", () => {
  const rule = (over: Record<string, unknown> = {}) => ({
    id: "er-x",
    inclusionType: "INCLUDE",
    providerId: "p1",
    providerTier: null,
    isActive: true,
    packageVersion: {
      id: "pv1", status: "ACTIVE", versionNumber: 5,
      packageId: "pkg1", package: { tenantId: "tenant-1" },
    },
    ...over,
  });

  it("requires a reason", async () => {
    // "the rule is gone with no reason captured, no approval and no audit entry"
    const res = await retireProviderEligibilityAction({ ok: true }, fd({ ruleId: "er-x", reason: "" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.update).not.toHaveBeenCalled();
    expect(mockPrisma.packageProviderEligibility.delete).not.toHaveBeenCalled();
  });

  it("no-ops for another tenant", async () => {
    mockPrisma.packageProviderEligibility.findUnique.mockResolvedValue(
      rule({ packageVersion: { id: "pv1", status: "ACTIVE", versionNumber: 5, packageId: "pkg1", package: { tenantId: "other" } } }),
    );
    const res = await retireProviderEligibilityAction({ ok: true }, fd({ ruleId: "er-x", reason: "contract ended" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.delete).not.toHaveBeenCalled();
  });

  it("RETIRES a rule that has taken effect — it is not deleted", async () => {
    // A deleted rule cannot explain a claim decided under it.
    mockPrisma.packageProviderEligibility.findUnique.mockResolvedValue(rule());
    const res = await retireProviderEligibilityAction({ ok: true }, fd({ ruleId: "er-x", reason: "Contract with this facility ended" }));
    expect(res.ok).toBe(true);
    expect(mockPrisma.packageProviderEligibility.delete).not.toHaveBeenCalled();
    const upd = mockPrisma.packageProviderEligibility.update.mock.calls[0][0];
    expect(upd.data.isActive).toBe(false);
    expect(upd.data.effectiveTo).toBeInstanceOf(Date);
  });

  it("audits the retirement WITH the reason", async () => {
    mockPrisma.packageProviderEligibility.findUnique.mockResolvedValue(rule());
    await retireProviderEligibilityAction({ ok: true }, fd({ ruleId: "er-x", reason: "Contract ended 2026-08" }));
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("PACKAGE_PROVIDER_ELIGIBILITY_RETIRE");
    expect(JSON.stringify(audit)).toContain("Contract ended 2026-08");
  });

  it("DISCARDS a rule still in an unapproved draft", async () => {
    // It never took effect, so there is no history worth preserving — but the
    // discard is still audited.
    mockPrisma.packageProviderEligibility.findUnique.mockResolvedValue(
      rule({ packageVersion: { id: "pv9", status: "DRAFT", versionNumber: 6, packageId: "pkg1", package: { tenantId: "tenant-1" } } }),
    );
    const res = await retireProviderEligibilityAction({ ok: true }, fd({ ruleId: "er-x", reason: "added by mistake" }));
    expect(res.ok).toBe(true);
    expect(mockPrisma.packageProviderEligibility.delete).toHaveBeenCalledWith({ where: { id: "er-x" } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("PACKAGE_PROVIDER_ELIGIBILITY_DISCARD");
  });

  it("refuses a rule already withdrawn", async () => {
    mockPrisma.packageProviderEligibility.findUnique.mockResolvedValue(rule({ isActive: false }));
    const res = await retireProviderEligibilityAction({ ok: true }, fd({ ruleId: "er-x", reason: "again" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.update).not.toHaveBeenCalled();
  });
});
