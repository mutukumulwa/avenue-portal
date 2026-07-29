/**
 * F1.1 — provider permission catalog + persona role bundles.
 *
 * Pure block: asserts the §7.1 catalog and §2.4 least-privilege allow/deny
 * matrix with no DB. DB block (opt-in AUTOPILOT_TEST_DB): proves seedRbac is
 * idempotent and that role→permission resolution keeps provider and TPA
 * permissions from leaking across the boundary.
 */
import { describe, it, expect } from "vitest";
import {
  PROVIDER_PERMISSIONS,
  PROVIDER_ROLE_PERMISSIONS,
  PROVIDER_ROLE_CODES,
  PROVIDER_PERSONA_ROLE_CODES,
  PROVIDER_PERMISSION_CODE_SET,
} from "@/../prisma/seeds/provider-rbac";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

// The exact §7.1 catalog — a drift guard. If the spec list changes, this must change with it.
const SPEC_CODES = [
  "provider.eligibility.read",
  "provider.preauth.read", "provider.preauth.create", "provider.preauth.respond", "provider.preauth.cancel",
  "provider.claim.read", "provider.claim.create", "provider.claim.respond", "provider.claim.withdraw", "provider.claim.correct", "provider.claim.reconsider",
  "provider.case.read",
  "provider.settlement.read", "provider.settlement.export",
  "provider.payment_query.manage",
  "provider.contract.read",
  "provider.performance.read",
  "provider.profile.read", "provider.profile.change_request",
  "provider.users.manage",
  "provider.api_keys.manage",
  "provider.integrations.manage",
];

describe("F1.1 provider permission catalog (pure)", () => {
  it("catalog matches the spec §7.1 code list exactly", () => {
    expect(PROVIDER_PERMISSIONS.map((p) => p.code).sort()).toEqual([...SPEC_CODES].sort());
  });

  it("every permission is well-formed and in the PROVIDER module", () => {
    for (const p of PROVIDER_PERMISSIONS) {
      expect(p.code).toMatch(/^provider\.[a-z_]+\.[a-z_]+$/);
      expect(p.module).toBe("PROVIDER");
      expect(p.action).toMatch(/^[A-Z_]+$/);
      expect(p.resource).toMatch(/^[A-Z_]+$/);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("every persona role grants only provider.* permissions that exist in the catalog (no TPA perm leaks in)", () => {
    for (const [role, codes] of Object.entries(PROVIDER_ROLE_PERMISSIONS)) {
      for (const c of codes) {
        expect(c.startsWith("provider."), `${role} → ${c} must be a provider permission`).toBe(true);
        expect(PROVIDER_PERMISSION_CODE_SET.has(c), `${role} → ${c} must exist in the catalog`).toBe(true);
      }
      // no duplicates within a bundle
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("enforces the §2.4 least-privilege deny matrix", () => {
    const has = (role: string, code: string) => PROVIDER_ROLE_PERMISSIONS[role].includes(code);
    // front desk: no settlement, no api keys, no clinical response
    expect(has("PROVIDER_FRONT_DESK", "provider.settlement.read")).toBe(false);
    expect(has("PROVIDER_FRONT_DESK", "provider.api_keys.manage")).toBe(false);
    expect(has("PROVIDER_FRONT_DESK", "provider.claim.respond")).toBe(false);
    // clinician: no settlement, no api keys, no contract changes/user admin
    expect(has("PROVIDER_CLINICIAN", "provider.settlement.read")).toBe(false);
    expect(has("PROVIDER_CLINICIAN", "provider.api_keys.manage")).toBe(false);
    expect(has("PROVIDER_CLINICIAN", "provider.users.manage")).toBe(false);
    // biller: not PA approve/respond-as-clinician? biller responds to claim exceptions but not user/key admin, not PA cancel
    expect(has("PROVIDER_BILLER", "provider.users.manage")).toBe(false);
    expect(has("PROVIDER_BILLER", "provider.api_keys.manage")).toBe(false);
    // finance: no clinical decisions/documents
    expect(has("PROVIDER_FINANCE", "provider.claim.respond")).toBe(false);
    expect(has("PROVIDER_FINANCE", "provider.preauth.respond")).toBe(false);
    expect(has("PROVIDER_FINANCE", "provider.users.manage")).toBe(false);
    // integration admin: no settlement, no claim, no clinical
    expect(has("PROVIDER_INTEGRATION_ADMIN", "provider.settlement.read")).toBe(false);
    expect(has("PROVIDER_INTEGRATION_ADMIN", "provider.claim.read")).toBe(false);
    // admin: no direct contract/bank activation permission exists at all (only change_request)
    expect(PROVIDER_PERMISSION_CODE_SET.has("provider.contract.activate")).toBe(false);
    expect(has("PROVIDER_ADMIN", "provider.profile.change_request")).toBe(true);
  });

  it("grants each persona the capabilities §2.4 says it must have", () => {
    const has = (role: string, code: string) => PROVIDER_ROLE_PERMISSIONS[role].includes(code);
    expect(has("PROVIDER_FRONT_DESK", "provider.eligibility.read")).toBe(true);
    expect(has("PROVIDER_FRONT_DESK", "provider.preauth.create")).toBe(true);
    expect(has("PROVIDER_CLINICIAN", "provider.preauth.respond")).toBe(true);
    expect(has("PROVIDER_BILLER", "provider.claim.correct")).toBe(true);
    expect(has("PROVIDER_BILLER", "provider.settlement.read")).toBe(true);
    expect(has("PROVIDER_FINANCE", "provider.settlement.export")).toBe(true);
    expect(has("PROVIDER_FINANCE", "provider.payment_query.manage")).toBe(true);
    expect(has("PROVIDER_ADMIN", "provider.users.manage")).toBe(true);
    expect(has("PROVIDER_INTEGRATION_ADMIN", "provider.integrations.manage")).toBe(true);
  });

  it("PROVIDER_LEGACY is temporary and excluded from the persona role set", () => {
    expect(PROVIDER_ROLE_CODES).toContain("PROVIDER_LEGACY");
    expect(PROVIDER_PERSONA_ROLE_CODES).not.toContain("PROVIDER_LEGACY");
    // legacy preserves today's reach incl. api-key management (gap #5, to be re-mapped in F1.5)
    expect(PROVIDER_ROLE_PERMISSIONS.PROVIDER_LEGACY).toContain("provider.api_keys.manage");
  });
});

describe.skipIf(!URL_SET)("F1.1 seedRbac integration — idempotency + boundary (opt-in DB)", () => {
  it("seeds provider roles/permissions idempotently and keeps the provider/TPA boundary", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { seedRbac } = await import("@/../prisma/seeds/rbac");
    const { rbacService } = await import("@/server/services/rbac.service");
    const { randomUUID } = await import("crypto");

    const token = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `RBAC ${token}`, slug: `rbac-${token}` } });
    const mkUser = (email: string, role: string) =>
      prisma.user.create({ data: { tenantId: tenant.id, email: `${email}.${token}@t.test`, passwordHash: "x", firstName: email, lastName: "T", role: role as never } });
    const providerUser = await mkUser("prov", "PROVIDER_USER");
    const claimsUser = await mkUser("clm", "CLAIMS_OFFICER");

    try {
      await seedRbac(prisma, tenant.id);
      const permsAfter1 = await prisma.permission.count();
      const rpAfter1 = await prisma.rolePermission.count({ where: { role: { tenantId: tenant.id } } });
      // second run must not duplicate
      await seedRbac(prisma, tenant.id);
      expect(await prisma.permission.count()).toBe(permsAfter1);
      expect(await prisma.rolePermission.count({ where: { role: { tenantId: tenant.id } } })).toBe(rpAfter1);

      // every provider permission exists globally
      const providerPermCount = await prisma.permission.count({ where: { module: "PROVIDER" } });
      expect(providerPermCount).toBe(PROVIDER_PERMISSIONS.length);

      // Assign PROVIDER_BILLER to the provider user and resolve — only provider.* perms
      const billerRole = await prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, code: "PROVIDER_BILLER" } });
      await prisma.userRoleAssignment.create({
        data: { userId: providerUser.id, roleId: billerRole.id, tenantId: tenant.id, isActive: true, status: "ACTIVE", makerId: providerUser.id, checkerId: providerUser.id },
      });
      const providerPerms = await rbacService.getUserPermissions(providerUser.id, tenant.id);
      expect(providerPerms.length).toBeGreaterThan(0);
      expect(providerPerms.every((c) => c.startsWith("provider."))).toBe(true);

      // CLAIMS_OFFICER (auto-migrated by seedRbac) resolves ZERO provider.* perms
      const claimsPerms = await rbacService.getUserPermissions(claimsUser.id, tenant.id);
      expect(claimsPerms.length).toBeGreaterThan(0);
      expect(claimsPerms.some((c) => c.startsWith("provider."))).toBe(false);
    } finally {
      await prisma.userRoleAssignment.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.rolePermission.deleteMany({ where: { role: { tenantId: tenant.id } } });
      await prisma.role.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });
});
