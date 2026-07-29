/**
 * F4.1 — PreauthInfoRequest schema (opt-in DB).
 *
 * The satellite persists with a default OPEN status + a requestedItems array,
 * enforces one sequence per PA, and supports the mutable lifecycle
 * (OPEN→RESPONDED→ACCEPTED). Relation-less (no FK), so synthetic ids suffice.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.1 PreauthInfoRequest schema (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  const tenantId = "t-f41";
  const paId = "pa-f41";
  const providerId = "prov-f41";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    await prisma.preauthInfoRequest.deleteMany({ where: { tenantId } });
  });
  afterAll(async () => {
    await prisma.preauthInfoRequest.deleteMany({ where: { tenantId } });
  });

  it("persists with default OPEN status + the requestedItems array + null response fields", async () => {
    const ir = await prisma.preauthInfoRequest.create({
      data: {
        tenantId, preAuthorizationId: paId, providerId, sequence: 1,
        requestedItems: ["LAB_RESULTS", "CLINICAL_NOTES"],
        prompt: "Please provide recent labs and consultation notes.",
        openedByActorType: "USER", openedByActorId: "reviewer-1",
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(ir.status).toBe("OPEN");
    expect(ir.requestedItems).toEqual(["LAB_RESULTS", "CLINICAL_NOTES"]);
    expect(ir.respondedAt).toBeNull();
    expect(ir.decidedAt).toBeNull();
  });

  it("enforces one sequence per PA (unique)", async () => {
    await prisma.preauthInfoRequest.create({
      data: { tenantId, preAuthorizationId: paId, providerId, sequence: 2, requestedItems: ["IMAGING_REPORTS"], prompt: "imaging", openedByActorType: "USER" },
    });
    await expect(
      prisma.preauthInfoRequest.create({
        data: { tenantId, preAuthorizationId: paId, providerId, sequence: 2, requestedItems: ["OTHER"], prompt: "dup", openedByActorType: "USER" },
      }),
    ).rejects.toThrow();
  });

  it("supports the mutable lifecycle OPEN→RESPONDED→ACCEPTED", async () => {
    const ir = await prisma.preauthInfoRequest.create({
      data: { tenantId, preAuthorizationId: paId, providerId, sequence: 3, requestedItems: ["TREATMENT_PLAN"], prompt: "plan", openedByActorType: "USER" },
    });
    const responded = await prisma.preauthInfoRequest.update({
      where: { id: ir.id },
      data: { status: "RESPONDED", responseNote: "Plan attached.", respondedByActorId: "prov-user", respondedAt: new Date() },
    });
    expect(responded.status).toBe("RESPONDED");
    const accepted = await prisma.preauthInfoRequest.update({
      where: { id: ir.id },
      data: { status: "ACCEPTED", decisionByActorId: "reviewer-1", decidedAt: new Date() },
    });
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.decidedAt).not.toBeNull();
  });

  it("indexes the provider inbox scope (query by tenant+provider+status runs)", async () => {
    const open = await prisma.preauthInfoRequest.findMany({ where: { tenantId, providerId, status: "OPEN" } });
    expect(Array.isArray(open)).toBe(true);
  });
});
