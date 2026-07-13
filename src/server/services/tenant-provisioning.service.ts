import { ReasonCodeService } from "./reason-codes.service";
import { OverrideControlService } from "./override-control.service";
import { ServiceCategoryService } from "./service-category.service";

// ─── TENANT PROVISIONING ─────────────────────────────────────────────────────
// The single definition of the reference data every tenant needs before it can
// be used: adjudication reason codes, contract override controls, and the
// service-category taxonomy (which the contract fee schedule tiers by — a tenant
// without it dumps every tariff line into "Other"). Call provisionTenant()
// wherever a tenant is created so none can launch un-provisioned.
//
// RBAC roles/permissions are seeded separately (prisma/seeds/rbac) because that
// module is scoped to the seed runner, not the app server.

export class TenantProvisioningService {
  /**
   * Idempotent per-tenant reference-data setup. Each underlying seed upserts,
   * so this is safe to re-run (e.g. after a catalog changes, or to repair a
   * tenant that predates a catalog). Returns the counts seeded per catalog.
   */
  static async provisionTenant(tenantId: string) {
    const reasonCodes = await ReasonCodeService.seedForTenant(tenantId);
    const overrideControls = await OverrideControlService.seedForTenant(tenantId);
    const serviceCategories = await ServiceCategoryService.seedForTenant(tenantId);
    return { reasonCodes, overrideControls, serviceCategories };
  }
}
