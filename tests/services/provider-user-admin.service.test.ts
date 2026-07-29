/**
 * F1.5 — provider user administration & offboarding.
 *
 * OPT-IN DB suite. Proves the spec invariants: a provider admin cannot grant a
 * TPA or cross-provider role, the last-admin safeguard holds, a suspended user
 * loses access (session revoked + branch scope retired), and role grants are
 * idempotent (a used grant cannot be replayed into a duplicate).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F1.5 ProviderUserAdminService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/server/services/provider-user-admin.service").ProviderUserAdminService;
  let AccessSvc: typeof import("@/server/services/provider-access.service").ProviderAccessService;
  let world: import("../factories/provider-network").ProviderWorld;
  let adminCtx: import("@/server/services/provider-access.service").ProviderAccessContext;
  let tenantId: string, providerA: string;

  async function grantRoleDirect(userId: string, code: string) {
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId, code } });
    await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id, tenantId, isActive: true, status: "ACTIVE", makerId: userId, checkerId: userId } });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = (await import("@/server/services/provider-user-admin.service")).ProviderUserAdminService;
    AccessSvc = (await import("@/server/services/provider-access.service")).ProviderAccessService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    const { seedRbac } = await import("@/../prisma/seeds/rbac");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
    providerA = world.providers.a.id;
    await seedRbac(prisma, tenantId);
    // the admin persona user gets PROVIDER_ADMIN (holds provider.users.manage)
    await grantRoleDirect(world.users.a.admin.id, "PROVIDER_ADMIN");
    adminCtx = await AccessSvc.buildUserContext({ userId: world.users.a.admin.id, tenantId, providerId: providerA });
  });

  afterAll(async () => {
    if (!world) return;
    const tIds = [world.tenants.alpha.id, world.tenants.beta.id];
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId: { in: tIds } } } });
    await prisma.role.deleteMany({ where: { tenantId: { in: tIds } } });
    await world.teardown();
  });

  it("grants a provider persona role to an own-provider user (idempotent)", async () => {
    const a1 = await svc.assignRole(adminCtx, { targetUserId: world.users.a.biller.id, roleCode: "PROVIDER_BILLER" });
    const a2 = await svc.assignRole(adminCtx, { targetUserId: world.users.a.biller.id, roleCode: "PROVIDER_BILLER" });
    expect(a2.id).toBe(a1.id); // replay returns the same assignment, no duplicate
  });

  it("provider_admin_cannot_grant_a_TPA_role", async () => {
    await expect(svc.assignRole(adminCtx, { targetUserId: world.users.a.biller.id, roleCode: "CLAIMS_OFFICER" })).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
    await expect(svc.assignRole(adminCtx, { targetUserId: world.users.a.biller.id, roleCode: "SUPER_ADMIN" })).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
    // and cannot grant the deprecated legacy role
    await expect(svc.assignRole(adminCtx, { targetUserId: world.users.a.biller.id, roleCode: "PROVIDER_LEGACY" })).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
  });

  it("provider_admin_cannot_manage_a_cross_provider_user", async () => {
    // userB is bound to provider B; admin's context is provider A
    await expect(svc.assignRole(adminCtx, { targetUserId: world.users.b.id, roleCode: "PROVIDER_BILLER" })).rejects.toMatchObject({ code: "FORBIDDEN_PROVIDER" });
    await expect(svc.suspendUser(adminCtx, { targetUserId: world.users.b.id })).rejects.toMatchObject({ code: "FORBIDDEN_PROVIDER" });
  });

  it("an actor without provider.users.manage is denied", async () => {
    const billerCtx = await AccessSvc.buildUserContext({ userId: world.users.a.biller.id, tenantId, providerId: providerA });
    await expect(svc.assignRole(billerCtx, { targetUserId: world.users.a.clinician.id, roleCode: "PROVIDER_CLINICIAN" })).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
  });

  it("suspend revokes the session and retires branch scope", async () => {
    const victim = world.users.a.frontdesk.id;
    await svc.assignBranches(adminCtx, { targetUserId: victim, branchIds: [world.branches.a1.id, world.branches.a2.id] });
    expect(await ProviderBranchIds(victim)).toEqual(expect.arrayContaining([world.branches.a1.id, world.branches.a2.id]));
    const before = await prisma.user.findUniqueOrThrow({ where: { id: victim }, select: { sessionVersion: true } });

    const res = await svc.suspendUser(adminCtx, { targetUserId: victim, reason: "offboarded" });
    expect(res.retiredBranches).toBe(2);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim }, select: { sessionVersion: true, isActive: true } });
    expect(after.isActive).toBe(false);
    expect(after.sessionVersion).toBe(before.sessionVersion + 1); // session revoked
    expect(await ProviderBranchIds(victim)).toEqual([]); // branch scope gone
  });

  it("last_provider_admin_cannot_be_suspended_or_demoted", async () => {
    // admin is the only PROVIDER_ADMIN in provider A
    await expect(svc.suspendUser(adminCtx, { targetUserId: world.users.a.admin.id })).rejects.toMatchObject({ code: "LAST_ADMIN" });
    await expect(svc.revokeRole(adminCtx, { targetUserId: world.users.a.admin.id, roleCode: "PROVIDER_ADMIN" })).rejects.toMatchObject({ code: "LAST_ADMIN" });

    // with a second admin present, the safeguard releases
    await svc.assignRole(adminCtx, { targetUserId: world.users.a.clinician.id, roleCode: "PROVIDER_ADMIN" });
    const res = await svc.revokeRole(adminCtx, { targetUserId: world.users.a.admin.id, roleCode: "PROVIDER_ADMIN" });
    expect(res.revoked).toBe(1);
  });

  async function ProviderBranchIds(userId: string) {
    const { ProviderBranchAssignmentService } = await import("@/server/services/provider-branch-assignment.service");
    return ProviderBranchAssignmentService.activeBranchIdsForUser(userId, tenantId);
  }
});
