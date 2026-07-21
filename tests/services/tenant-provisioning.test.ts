import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// provisionTenant is the single onboarding/repair entry point
// (docs/TENANT_ONBOARDING_PLAN.md §2-3): default Client + RBAC + chart of
// accounts + the three reference catalogs, all idempotent.

const mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  client: { findFirst: vi.fn(), upsert: vi.fn() },
  role: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const seedRbac = vi.hoisted(() => vi.fn());
// Same resolved module as the SUT's `../../../prisma/seeds/rbac`.
vi.mock("../../prisma/seeds/rbac", () => ({ seedRbac }));

import { TenantProvisioningService } from "@/server/services/tenant-provisioning.service";
import { ReasonCodeService } from "@/server/services/reason-codes.service";
import { OverrideControlService } from "@/server/services/override-control.service";
import { ServiceCategoryService } from "@/server/services/service-category.service";
import { ApprovalMatrixService } from "@/server/services/approval-matrix.service";
import { GLService } from "@/server/services/gl.service";

describe("TenantProvisioningService.provisionTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant_123", name: "Acme TPA", config: {} });
    mockPrisma.client.findFirst.mockResolvedValue(null);
    mockPrisma.client.upsert.mockResolvedValue({ id: "cl_tenant_123" });
    mockPrisma.role.count.mockResolvedValue(17);
    vi.spyOn(GLService, "seedChartOfAccounts").mockResolvedValue(undefined);
    vi.spyOn(ReasonCodeService, "seedForTenant").mockResolvedValue(12);
    vi.spyOn(OverrideControlService, "seedForTenant").mockResolvedValue(5);
    vi.spyOn(ServiceCategoryService, "seedForTenant").mockResolvedValue(47);
    vi.spyOn(ApprovalMatrixService, "seedForTenant").mockResolvedValue(3);
  });
  afterEach(() => vi.restoreAllMocks());

  it("seeds the full required set and aggregates counts", async () => {
    const result = await TenantProvisioningService.provisionTenant("tenant_123");

    expect(mockPrisma.client.upsert).toHaveBeenCalledWith({
      where: { operatorTenantId_slug: { operatorTenantId: "tenant_123", slug: "default" } },
      update: {},
      create: {
        id: "cl_tenant_123",
        operatorTenantId: "tenant_123",
        type: "INSURER",
        name: "Acme TPA — Default Client",
        slug: "default",
        currency: "UGX",
        status: "ACTIVE",
      },
    });
    expect(seedRbac).toHaveBeenCalledWith(mockPrisma, "tenant_123");
    expect(GLService.seedChartOfAccounts).toHaveBeenCalledWith("tenant_123");
    expect(result).toEqual({
      reasonCodes: 12,
      overrideControls: 5,
      serviceCategories: 47,
      approvalMatrixRules: 3,
      glAccounts: 24,
      roles: 17,
      defaultClient: true,
    });
  });

  it("throws when the tenant row does not exist", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    await expect(TenantProvisioningService.provisionTenant("ghost")).rejects.toThrow(/not found/);
    expect(mockPrisma.client.upsert).not.toHaveBeenCalled();
    expect(seedRbac).not.toHaveBeenCalled();
  });

  it("honours explicit currency on the default-client create branch", async () => {
    await TenantProvisioningService.provisionTenant("tenant_123", { currency: "KES" });
    expect(mockPrisma.client.upsert.mock.calls[0][0].create.currency).toBe("KES");
  });

  it("falls back to tenant.config.defaultCurrency on repair runs", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "tenant_123",
      name: "Acme TPA",
      config: { defaultCurrency: "USD" },
    });
    await TenantProvisioningService.provisionTenant("tenant_123");
    expect(mockPrisma.client.upsert.mock.calls[0][0].create.currency).toBe("USD");
  });

  it("reports defaultClient:false and never mutates an existing default client", async () => {
    mockPrisma.client.findFirst.mockResolvedValue({ id: "cl_existing" });
    const result = await TenantProvisioningService.provisionTenant("tenant_123");
    expect(result.defaultClient).toBe(false);
    expect(mockPrisma.client.upsert.mock.calls[0][0].update).toEqual({});
  });
});
