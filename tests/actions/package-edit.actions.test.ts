import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  package: { findUnique: vi.fn(), update: vi.fn() },
  packageVersion: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  sharedLimitGroup: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  benefitConfigSharedLimit: { createMany: vi.fn(), deleteMany: vi.fn() },
  packageProviderEligibility: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  benefitConfig: { findMany: vi.fn() },
  provider: { findFirst: vi.fn() },
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
  updatePackageAction,
  createSharedLimitAction,
  deleteSharedLimitAction,
  createProviderEligibilityAction,
  deleteProviderEligibilityAction,
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

  it("repoints the package at the new version and writes a PACKAGE_VERSION_CREATE audit", async () => {
    loadedPackage();
    await expect(updatePackageAction({ ok: true }, editForm())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.package.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pkg1" }, data: { currentVersionId: "pv2" } }),
    );
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
  it("createProviderEligibilityAction rejects a version owned by another tenant", async () => {
    mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "other" } });
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageVersionId: "pv1", inclusionType: "INCLUDE", providerTier: "OWN" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.create).not.toHaveBeenCalled();
  });

  it("createProviderEligibilityAction requires a provider or tier", async () => {
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageVersionId: "pv1", inclusionType: "INCLUDE" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.packageProviderEligibility.create).not.toHaveBeenCalled();
  });

  it("createProviderEligibilityAction creates a tier rule and audits it", async () => {
    mockPrisma.packageVersion.findUnique.mockResolvedValue({ packageId: "pkg1", package: { tenantId: "tenant-1" } });
    mockPrisma.packageProviderEligibility.create.mockResolvedValue({ id: "er-new" });
    const res = await createProviderEligibilityAction({ ok: true }, fd({ packageVersionId: "pv1", inclusionType: "EXCLUDE", providerTier: "PARTNER" }));
    expect(res.ok).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "PACKAGE_PROVIDER_ELIGIBILITY_CREATE" }) }),
    );
  });

  it("deleteProviderEligibilityAction no-ops for another tenant", async () => {
    mockPrisma.packageProviderEligibility.findUnique.mockResolvedValue({
      inclusionType: "INCLUDE", packageVersion: { packageId: "pkg1", package: { tenantId: "other" } },
    });
    await deleteProviderEligibilityAction("er-x");
    expect(mockPrisma.packageProviderEligibility.delete).not.toHaveBeenCalled();
  });
});
