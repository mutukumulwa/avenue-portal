import { prisma } from "@/lib/prisma";
import { ReasonCodeService } from "./reason-codes.service";
import { OverrideControlService } from "./override-control.service";
import { ServiceCategoryService } from "./service-category.service";
import { GLService, STANDARD_ACCOUNTS } from "./gl.service";
import { seedRbac } from "../../../prisma/seeds/rbac";

// ─── TENANT PROVISIONING ─────────────────────────────────────────────────────
// The single definition of everything a tenant needs before it can operate
// (docs/TENANT_ONBOARDING_PLAN.md §2 — each item fails CLOSED without it):
//   1. Default Client (slug `default`) — clientResolve.ts throws without it,
//      blocking every scheme/group/member.
//   2. RBAC — roles/permissions + the User.role-enum → UserRoleAssignment
//      migration; granular requirePermission is fail-closed. (prisma/seeds/rbac
//      imports only @prisma/client, so it is app-importable — the old note here
//      claiming it was seed-runner-scoped was wrong.)
//   3. Chart of accounts — GL getAccount throws inside claim-approval/
//      settlement/invoice transactions.
//   4. Reference catalogs: adjudication reason codes, override controls, and
//      the service-category taxonomy (without which the contract fee schedule
//      dumps every tariff line into "Other").
// Call provisionTenant() wherever a tenant is created so none can launch
// un-provisioned. Every step upserts, so it doubles as the repair path.

export class TenantProvisioningService {
  /**
   * Idempotent full per-tenant setup. Safe to re-run (e.g. after a catalog
   * grows, or to repair a tenant whose provisioning partially failed).
   *
   * `opts.currency` applies ONLY when the default client is created by this
   * run; an existing default client is never mutated (upsert `update: {}`).
   * On repair runs it falls back to `tenant.config.defaultCurrency` (persisted
   * by the onboarding action), then "UGX".
   *
   * IMPORTANT ordering: create the tenant's first admin User BEFORE calling
   * this — seedRbac's migration step mints their ACTIVE UserRoleAssignment,
   * which is what populates session permissions at login.
   */
  static async provisionTenant(tenantId: string, opts?: { currency?: string }) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, config: true },
    });
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found — create the tenant row before provisioning.`);
    }

    const cfg = (tenant.config ?? {}) as Record<string, unknown>;
    const currency =
      opts?.currency ??
      (typeof cfg.defaultCurrency === "string" ? cfg.defaultCurrency : undefined) ??
      "UGX";

    // 1. Default Client (G2.1) — same upsert key + shape as prisma/seed.ts.
    const existingDefaultClient = await prisma.client.findFirst({
      where: { operatorTenantId: tenantId, slug: "default" },
      select: { id: true },
    });
    await prisma.client.upsert({
      where: { operatorTenantId_slug: { operatorTenantId: tenantId, slug: "default" } },
      update: {},
      create: {
        id: `cl_${tenantId}`,
        operatorTenantId: tenantId,
        type: "INSURER",
        name: `${tenant.name} — Default Client`,
        slug: "default",
        currency,
        status: "ACTIVE",
      },
    });

    // 2. RBAC — global permissions, 17 tenant roles, role-permission maps, and
    //    the enum→UserRoleAssignment migration for every existing user.
    await seedRbac(prisma, tenantId);
    const roles = await prisma.role.count({ where: { tenantId } });

    // 3. Chart of accounts — money spine prerequisite.
    await GLService.seedChartOfAccounts(tenantId);

    // 4. Reference catalogs.
    const reasonCodes = await ReasonCodeService.seedForTenant(tenantId);
    const overrideControls = await OverrideControlService.seedForTenant(tenantId);
    const serviceCategories = await ServiceCategoryService.seedForTenant(tenantId);

    return {
      reasonCodes,
      overrideControls,
      serviceCategories,
      glAccounts: STANDARD_ACCOUNTS.length, // seedChartOfAccounts returns void
      roles,
      defaultClient: !existingDefaultClient, // true = created by THIS run
    };
  }
}
