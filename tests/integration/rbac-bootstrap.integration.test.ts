/**
 * WP-3.5A (PROD-BLOCKER-1) — RBAC bootstrap has no deadlock. REAL-DB proof.
 *
 * Production ships with zero Role/Permission/UserRoleAssignment rows, so every
 * rbacService-gated surface fails closed and rbac.service's own assignRole
 * (requires ROLE:ASSIGN) could never mint the first assignment. This proves the
 * two-part fix end to end:
 *   • Part 2 — seedRbac creates the catalog idempotently AND bootstraps the
 *     SUPER_ADMIN's assignment by writing the row directly (not via assignRole);
 *   • Part 1 — even stripped back to prod's zero-dynamic-rows state, a
 *     SUPER_ADMIN resolves authority from the enum-role baseline and can mint
 *     the FIRST role assignment through the maker → checker flow.
 *
 * Self-contained: creates its own tenant + users. OPT-IN gate:
 * AUTOPILOT_TEST_DB === DATABASE_URL. Runs sequentially (tests share state).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const URL_SET =
  !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("WP-3.5A RBAC bootstrap — no deadlock (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let rbacService: typeof import("@/server/services/rbac.service").rbacService;
  let tenantId: string;
  let superAdminId: string;
  let targetId: string;
  const slug = `rbac-boot-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    rbacService = (await import("@/server/services/rbac.service")).rbacService;
    const tenant = await prisma.tenant.create({ data: { name: "RBAC Bootstrap Test", slug } });
    tenantId = tenant.id;
    const mk = async (email: string, role: "SUPER_ADMIN" | "CLAIMS_OFFICER") =>
      (
        await prisma.user.create({
          data: {
            tenantId,
            email: `${email}@${slug}.test`,
            passwordHash: "x",
            firstName: email,
            lastName: "T",
            role,
          },
        })
      ).id;
    superAdminId = await mk("root", "SUPER_ADMIN");
    targetId = await mk("target", "CLAIMS_OFFICER");
  });

  afterAll(async () => {
    if (!prisma || !tenantId) return;
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("before seed the catalog is empty — no roles exist to assign (the prod state)", async () => {
    expect(await prisma.role.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.userRoleAssignment.count({ where: { tenantId } })).toBe(0);
  });

  it("seedRbac creates the catalog idempotently and bootstraps SUPER_ADMIN directly", async () => {
    const { seedRbac } = await import("@/../prisma/seeds/rbac");
    const { PROVIDER_PERSONA_ROLE_CODES } = await import("@/../prisma/seeds/provider-rbac");

    await seedRbac(prisma, tenantId);

    const roleCount1 = await prisma.role.count({ where: { tenantId } });
    expect(roleCount1).toBeGreaterThan(0);

    // The six provider persona roles exist, so they can later be assigned.
    for (const code of PROVIDER_PERSONA_ROLE_CODES) {
      expect(await prisma.role.findFirst({ where: { tenantId, code } })).not.toBeNull();
    }

    // SUPER_ADMIN received a direct ACTIVE assignment — the bootstrap exception,
    // written via prisma.create, never through the guarded assignRole.
    expect(
      await prisma.userRoleAssignment.count({
        where: { tenantId, userId: superAdminId, isActive: true, status: "ACTIVE" },
      }),
    ).toBe(1);

    // Idempotent re-run: no duplicate roles, no duplicate bootstrap assignment.
    await seedRbac(prisma, tenantId);
    expect(await prisma.role.count({ where: { tenantId } })).toBe(roleCount1);
    expect(
      await prisma.userRoleAssignment.count({
        where: { tenantId, userId: superAdminId, isActive: true },
      }),
    ).toBe(1);
  });

  it("baseline fallback: a SUPER_ADMIN with ZERO dynamic rows still passes ROLE:ASSIGN", async () => {
    // Reproduce prod exactly: keep the catalog, strip every dynamic assignment.
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId } });
    expect(await prisma.userRoleAssignment.count({ where: { tenantId } })).toBe(0);

    await expect(
      rbacService.requirePermission(superAdminId, "ROLE:ASSIGN", tenantId),
    ).resolves.toBeUndefined();
    expect(await rbacService.hasPermission(superAdminId, "QUOTATION:ISSUE", tenantId)).toBe(true);
    expect(await rbacService.hasRole(superAdminId, "SUPER_ADMIN", tenantId)).toBe(true);
    expect(await rbacService.getUserPermissions(superAdminId, tenantId)).toContain("*");
  });

  it("the first role assignment succeeds end-to-end via maker → checker", async () => {
    // Maker is the baseline SUPER_ADMIN (no dynamic rows) — authorized by fallback.
    const assignment = await rbacService.assignRole(
      targetId,
      "CLAIMS_OFFICER",
      tenantId,
      superAdminId,
    );
    expect(assignment.status).toBe("PENDING_APPROVAL");
    expect(assignment.isActive).toBe(false);

    // A distinct SUPER_ADMIN approves (maker ≠ checker); baseline authorizes the checker too.
    const checkerId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `checker@${slug}.test`,
          passwordHash: "x",
          firstName: "chk",
          lastName: "T",
          role: "SUPER_ADMIN",
        },
      })
    ).id;
    const approved = await rbacService.approveRoleAssignment(assignment.id, checkerId, tenantId);
    expect(approved.status).toBe("ACTIVE");
    expect(approved.isActive).toBe(true);
  });
});
