import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WP-N1 (N-009) — the tariff actions reject zero/negative/NaN rates and bad date
 * order server-side (no partial row). WP-N2 (N-010) — overlapping windows for the
 * same code+scope are blocked. WP-N3 (N-011) — a tariff is soft-deactivated, never
 * hard-deleted, and the deactivation is audited.
 */

const mockPrisma = vi.hoisted(() => ({
  provider: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  providerTariff: { findMany: vi.fn(async (): Promise<unknown[]> => []), create: vi.fn(async (_a?: any) => ({ id: "t-new" })), update: vi.fn(async () => ({})), delete: vi.fn(), findUnique: vi.fn() },
  providerDiagnosisTariff: { findUnique: vi.fn(), create: vi.fn(async () => ({ id: "d-new" })), update: vi.fn(async () => ({})), delete: vi.fn() },
  serviceMappingMemory: { count: vi.fn(async () => 0) },
  pricingRule: { count: vi.fn(async () => 0) },
  claimLine: { count: vi.fn(async () => 0) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-1" } }),
  ROLES: { ADMIN_ONLY: ["SUPER_ADMIN"] },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const writeAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/audit", () => ({ writeAudit: writeAuditMock }));

import {
  upsertCptTariffAction,
  deleteCptTariffAction,
  upsertDiagnosisTariffAction,
  deleteDiagnosisTariffAction,
} from "@/app/(admin)/providers/[id]/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

const validCpt = { providerId: "p1", serviceName: "Consultation", agreedRate: "2500", currency: "UGX", effectiveFrom: "2026-01-01" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.provider.findUnique.mockResolvedValue({ id: "p1" });
  mockPrisma.providerTariff.findMany.mockResolvedValue([]);
});

describe("upsertCptTariffAction — N-009 validation", () => {
  it("rejects a zero rate with a field error and writes NO row", async () => {
    const r = await upsertCptTariffAction(fd({ ...validCpt, agreedRate: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.agreedRate).toBeTruthy();
    expect(mockPrisma.providerTariff.create).not.toHaveBeenCalled();
    expect(mockPrisma.providerTariff.update).not.toHaveBeenCalled();
  });

  it("rejects a negative rate and a NaN rate", async () => {
    expect((await upsertCptTariffAction(fd({ ...validCpt, agreedRate: "-100" }))).ok).toBe(false);
    expect((await upsertCptTariffAction(fd({ ...validCpt, agreedRate: "abc" }))).ok).toBe(false);
    expect(mockPrisma.providerTariff.create).not.toHaveBeenCalled();
  });

  it("rejects effectiveTo <= effectiveFrom", async () => {
    const r = await upsertCptTariffAction(fd({ ...validCpt, effectiveTo: "2025-12-31" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.effectiveTo).toBeTruthy();
  });

  it("creates a valid tariff and audits it", async () => {
    const r = await upsertCptTariffAction(fd(validCpt));
    expect(r.ok).toBe(true);
    expect(mockPrisma.providerTariff.create).toHaveBeenCalledOnce();
    expect((mockPrisma.providerTariff.create.mock.calls[0]![0] as any).data.agreedRate).toBe(2500);
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "PROVIDER_TARIFF_CREATED" }));
  });

  it("blocks an overlapping active rate (N-010) and writes NO row", async () => {
    mockPrisma.providerTariff.findMany.mockResolvedValue([
      { id: "t-old", cptCode: null, serviceName: "Consultation", clientId: null, contractId: null, effectiveFrom: new Date("2026-01-01"), effectiveTo: null, isActive: true },
    ]);
    const r = await upsertCptTariffAction(fd(validCpt));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.effectiveFrom).toBeTruthy();
    expect(mockPrisma.providerTariff.create).not.toHaveBeenCalled();
  });

  it("fails closed when the provider is not in the tenant", async () => {
    mockPrisma.provider.findUnique.mockResolvedValue(null);
    const r = await upsertCptTariffAction(fd(validCpt));
    expect(r.ok).toBe(false);
    expect(mockPrisma.providerTariff.create).not.toHaveBeenCalled();
  });
});

describe("deleteCptTariffAction — N-011 soft-deactivate", () => {
  it("soft-deactivates (never hard-deletes) and audits, retaining references", async () => {
    mockPrisma.providerTariff.findUnique.mockResolvedValue({ id: "t1", isActive: true, serviceName: "Consultation", provider: { tenantId: "tenant-1" } });
    mockPrisma.serviceMappingMemory.count.mockResolvedValue(2);
    mockPrisma.claimLine.count.mockResolvedValue(5);

    const r = await deleteCptTariffAction(fd({ tariffId: "t1", providerId: "p1" }));
    expect(r.ok).toBe(true);
    expect(mockPrisma.providerTariff.delete).not.toHaveBeenCalled();
    expect(mockPrisma.providerTariff.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1" }, data: { isActive: false } }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "PROVIDER_TARIFF_DEACTIVATED" }));
  });

  it("rejects a tariff from another tenant", async () => {
    mockPrisma.providerTariff.findUnique.mockResolvedValue({ id: "t1", isActive: true, serviceName: "X", provider: { tenantId: "other-tenant" } });
    const r = await deleteCptTariffAction(fd({ tariffId: "t1", providerId: "p1" }));
    expect(r.ok).toBe(false);
    expect(mockPrisma.providerTariff.update).not.toHaveBeenCalled();
  });
});

describe("diagnosis tariff actions", () => {
  const validDiag = { providerId: "p1", icdCode: "B54", diagnosisLabel: "Malaria", bundledRate: "8000", effectiveFrom: "2026-01-01" };

  it("rejects a rate-less diagnosis tariff (must price something)", async () => {
    const r = await upsertDiagnosisTariffAction(fd({ providerId: "p1", icdCode: "B54", diagnosisLabel: "Malaria", effectiveFrom: "2026-01-01" }));
    expect(r.ok).toBe(false);
    expect(mockPrisma.providerDiagnosisTariff.create).not.toHaveBeenCalled();
  });

  it("rejects a zero bundled rate", async () => {
    expect((await upsertDiagnosisTariffAction(fd({ ...validDiag, bundledRate: "0" }))).ok).toBe(false);
  });

  it("creates a valid diagnosis tariff and audits it", async () => {
    const r = await upsertDiagnosisTariffAction(fd(validDiag));
    expect(r.ok).toBe(true);
    expect(mockPrisma.providerDiagnosisTariff.create).toHaveBeenCalledOnce();
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "PROVIDER_DIAGNOSIS_TARIFF_CREATED" }));
  });

  it("soft-deactivates a diagnosis tariff (never hard-deletes)", async () => {
    mockPrisma.providerDiagnosisTariff.findUnique.mockResolvedValue({ id: "d1", isActive: true, icdCode: "B54", diagnosisLabel: "Malaria", provider: { tenantId: "tenant-1" } });
    const r = await deleteDiagnosisTariffAction(fd({ tariffId: "d1", providerId: "p1" }));
    expect(r.ok).toBe(true);
    expect(mockPrisma.providerDiagnosisTariff.delete).not.toHaveBeenCalled();
    expect(mockPrisma.providerDiagnosisTariff.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1" }, data: { isActive: false } }));
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "PROVIDER_DIAGNOSIS_TARIFF_DEACTIVATED" }));
  });
});
