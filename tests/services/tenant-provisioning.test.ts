import { describe, it, expect, vi, afterEach } from "vitest";
import { TenantProvisioningService } from "@/server/services/tenant-provisioning.service";
import { ReasonCodeService } from "@/server/services/reason-codes.service";
import { OverrideControlService } from "@/server/services/override-control.service";
import { ServiceCategoryService } from "@/server/services/service-category.service";

// provisionTenant is the single onboarding entry point — verify it seeds all
// three reference-data catalogs for the tenant and aggregates their counts.
describe("TenantProvisioningService.provisionTenant", () => {
  afterEach(() => vi.restoreAllMocks());

  it("seeds reason codes, override controls, and service categories for the tenant", async () => {
    const rc = vi.spyOn(ReasonCodeService, "seedForTenant").mockResolvedValue(12);
    const oc = vi.spyOn(OverrideControlService, "seedForTenant").mockResolvedValue(5);
    const sc = vi.spyOn(ServiceCategoryService, "seedForTenant").mockResolvedValue(47);

    const result = await TenantProvisioningService.provisionTenant("tenant_123");

    expect(rc).toHaveBeenCalledWith("tenant_123");
    expect(oc).toHaveBeenCalledWith("tenant_123");
    expect(sc).toHaveBeenCalledWith("tenant_123");
    expect(result).toEqual({ reasonCodes: 12, overrideControls: 5, serviceCategories: 47 });
  });
});
