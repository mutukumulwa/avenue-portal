/**
 * F1.2 — provider user↔branch assignment service.
 *
 * OPT-IN DB suite (AUTOPILOT_TEST_DB === DATABASE_URL). Uses the F0.6 factory
 * for a real two-provider graph and exercises the four spec invariants:
 * cross-provider rejected, overlapping active duplicate rejected, effective
 * dates respected, retirement removes the active result.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!URL_SET)("F1.2 ProviderBranchAssignmentService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/server/services/provider-branch-assignment.service").ProviderBranchAssignmentService;
  let Err: typeof import("@/server/services/provider-branch-assignment.service").ProviderBranchAssignmentError;
  let world: import("../factories/provider-network").ProviderWorld;

  // convenience handles
  let tenantId: string, providerA: string, providerB: string;
  let branchA1: string, branchA2: string, branchB1: string;
  let userAId: string, actorId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    ({ ProviderBranchAssignmentService: svc, ProviderBranchAssignmentError: Err } = await import(
      "@/server/services/provider-branch-assignment.service"
    ));
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
    providerA = world.providers.a.id;
    providerB = world.providers.b.id;
    branchA1 = world.branches.a1.id;
    branchA2 = world.branches.a2.id;
    branchB1 = world.branches.b1.id;
    userAId = world.users.a.biller.id; // bound to provider A
    actorId = world.users.a.admin.id; // a real user id for audit FK
  });

  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("assigns a provider user to an in-scope branch and writes an audit row", async () => {
    const row = await svc.assign({ tenantId, providerId: providerA, userId: userAId, providerBranchId: branchA1, createdBy: actorId });
    expect(row.id).toBeTruthy();
    expect(row.activeTo).toBeNull();
    const branchIds = await svc.activeBranchIdsForUser(userAId, tenantId);
    expect(branchIds).toContain(branchA1);
    const audit = await prisma.auditLog.findFirst({ where: { entityType: "PROVIDER_USER_BRANCH_ASSIGNMENT", entityId: row.id, action: "PROVIDER_BRANCH_ASSIGNMENT_CREATED" } });
    expect(audit).not.toBeNull();
  });

  it("provider_a_user_cannot_be_assigned_to_provider_b_branch (branch not in provider scope)", async () => {
    await expect(
      svc.assign({ tenantId, providerId: providerA, userId: userAId, providerBranchId: branchB1, createdBy: actorId }),
    ).rejects.toMatchObject({ code: "BRANCH_NOT_IN_SCOPE" });
  });

  it("user_bound_to_provider_a_cannot_be_assigned_under_provider_b (cross-provider denied)", async () => {
    await expect(
      svc.assign({ tenantId, providerId: providerB, userId: userAId, providerBranchId: branchB1, createdBy: actorId }),
    ).rejects.toMatchObject({ code: "USER_PROVIDER_MISMATCH" });
  });

  it("overlapping_active_duplicate_is_rejected", async () => {
    // userAId already active on branchA1 from the first test
    await expect(
      svc.assign({ tenantId, providerId: providerA, userId: userAId, providerBranchId: branchA1, createdBy: actorId }),
    ).rejects.toMatchObject({ code: "DUPLICATE_ACTIVE" });
  });

  it("effective_dates_are_respected (future assignment is not active now)", async () => {
    const clinician = world.users.a.clinician.id;
    const future = new Date(Date.now() + 7 * DAY);
    const row = await svc.assign({ tenantId, providerId: providerA, userId: clinician, providerBranchId: branchA2, createdBy: actorId, activeFrom: future });
    // not active now
    expect(await svc.activeBranchIdsForUser(clinician, tenantId)).not.toContain(branchA2);
    // active at/after activeFrom
    const laterIds = await svc.activeBranchIdsForUser(clinician, tenantId, new Date(future.getTime() + DAY));
    expect(laterIds).toContain(branchA2);
    expect(row.activeFrom.getTime()).toBe(future.getTime());
  });

  it("retirement_removes_the_active_result_and_allows_reassignment", async () => {
    const frontdesk = world.users.a.frontdesk.id;
    const first = await svc.assign({ tenantId, providerId: providerA, userId: frontdesk, providerBranchId: branchA1, createdBy: actorId });
    expect(await svc.activeBranchIdsForUser(frontdesk, tenantId)).toContain(branchA1);

    const retired = await svc.retire(first.id, { tenantId, retiredBy: actorId, reason: "offboarded" });
    expect(retired.activeTo).not.toBeNull();
    expect(retired.retireReason).toBe("offboarded");
    expect(await svc.activeBranchIdsForUser(frontdesk, tenantId)).not.toContain(branchA1);

    // idempotent retire
    const again = await svc.retire(first.id, { tenantId, retiredBy: actorId, reason: "noop" });
    expect(again.retireReason).toBe("offboarded"); // unchanged

    // re-assignment after retirement is allowed (no active dup remains)
    const second = await svc.assign({ tenantId, providerId: providerA, userId: frontdesk, providerBranchId: branchA1, createdBy: actorId });
    expect(second.id).not.toBe(first.id);
    expect(await svc.activeBranchIdsForUser(frontdesk, tenantId)).toContain(branchA1);
  });

  it("retire_rejects_an_assignment_from_another_tenant_scope", async () => {
    await expect(svc.retire("nonexistent-id", { tenantId, retiredBy: actorId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
