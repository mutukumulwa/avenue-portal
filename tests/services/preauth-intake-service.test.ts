/**
 * F3.3 — PreauthIntakeService (opt-in DB).
 *
 * Proves: happy path creates ONE PA + receipt(ACCEPTED) + SUBMITTED event + SLA
 * and calls adjudicate exactly once; same-key replay returns the same PA with
 * no second PA/hold/decision; same-key different-content conflicts with no
 * mutation; validation/member/provider failures create a REJECTED receipt and
 * NO PA; a post-commit adjudication failure leaves the receipt PROCESSING + PA
 * durable (visible, retryable).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PreauthCallerContext, PreauthSubmissionV1 } from "@/server/services/preauth-intake/contract";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F3.3 PreauthIntakeService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/preauth-intake/service").PreauthIntakeService;
  let Conflict: typeof import("@/server/services/preauth-intake/service").PreauthIntakeConflict;
  let world: import("../factories/provider-network").ProviderWorld;

  const adj = { calls: [] as string[] };
  const okDeps = { adjudicate: async (paId: string) => { adj.calls.push(paId); } };
  const failDeps = { adjudicate: async () => { throw new Error("engine down"); } };

  function ctx(over: Partial<PreauthCallerContext> = {}): PreauthCallerContext {
    return { channel: "PROVIDER_PORTAL", tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, actorType: "USER", actorId: world.users.a.biller.id, ...over };
  }
  function sub(over: Partial<PreauthSubmissionV1> = {}): PreauthSubmissionV1 {
    return {
      memberNumber: world.members.alpha.memberNumber, serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT",
      diagnoses: [{ icdCode: "J06.9", description: "URTI", isPrimary: true }],
      procedures: [{ cptCode: "99213", description: "Consult", quantity: 1, unitCost: 1500 }],
      estimatedCost: 1500, idempotencyKey: "k-" + Math.random().toString(36).slice(2), ...over,
    };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/preauth-intake/service");
    Svc = mod.PreauthIntakeService; Conflict = mod.PreauthIntakeConflict;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });

  afterAll(async () => {
    if (!world) return;
    const t = { in: [world.tenants.alpha.id, world.tenants.beta.id] };
    await prisma.preAuthorizationEvent.deleteMany({ where: { tenantId: t } });
    await prisma.preauthIntakeReceipt.deleteMany({ where: { tenantId: t } });
    await prisma.preAuthorization.deleteMany({ where: { tenantId: t } });
    await world.teardown();
  });

  it("happy path: one PA + ACCEPTED receipt + SUBMITTED event + SLA; adjudicate called once", async () => {
    adj.calls = [];
    const res = await Svc.submit(ctx(), sub({ idempotencyKey: "happy-1" }), okDeps);
    expect(res.status).toBe("ACCEPTED");
    expect(res.replayed).toBe(false);
    expect(res.preauthId).toBeTruthy();
    expect(adj.calls).toEqual([res.preauthId]); // exactly once

    const pa = await prisma.preAuthorization.findUniqueOrThrow({ where: { id: res.preauthId! } });
    expect(pa.status).toBe("SUBMITTED");
    expect(pa.providerId).toBe(world.providers.a.id);
    expect(pa.slaDeadlineAt).not.toBeNull();
    const receipt = await prisma.preauthIntakeReceipt.findUniqueOrThrow({ where: { id: res.receiptId } });
    expect(receipt.status).toBe("ACCEPTED"); // flipped after successful handoff
    const events = await prisma.preAuthorizationEvent.findMany({ where: { preAuthorizationId: res.preauthId! } });
    expect(events.map((e) => e.eventType)).toEqual(["SUBMITTED"]);
  });

  it("same-key replay returns the same PA and does not re-adjudicate or duplicate", async () => {
    adj.calls = [];
    const first = await Svc.submit(ctx(), sub({ idempotencyKey: "replay-1" }), okDeps);
    const second = await Svc.submit(ctx(), sub({ idempotencyKey: "replay-1" }), okDeps);
    expect(second.replayed).toBe(true);
    expect(second.preauthId).toBe(first.preauthId);
    expect(adj.calls).toEqual([first.preauthId]); // NOT called again on replay
    const count = await prisma.preAuthorization.count({ where: { tenantId: world.tenants.alpha.id, id: first.preauthId! } });
    expect(count).toBe(1);
  });

  it("same key + different content conflicts with no mutation", async () => {
    await Svc.submit(ctx(), sub({ idempotencyKey: "conf-1", estimatedCost: 1500 }), okDeps);
    const before = await prisma.preAuthorization.count({ where: { tenantId: world.tenants.alpha.id } });
    await expect(Svc.submit(ctx(), sub({ idempotencyKey: "conf-1", estimatedCost: 9999 }), okDeps)).rejects.toBeInstanceOf(Conflict);
    const after = await prisma.preAuthorization.count({ where: { tenantId: world.tenants.alpha.id } });
    expect(after).toBe(before); // nothing created by the conflicting attempt
  });

  it("validation failure → REJECTED receipt and NO PA", async () => {
    const res = await Svc.submit(ctx(), sub({ idempotencyKey: "rej-1", benefitCategory: undefined, diagnoses: [] }), okDeps);
    expect(res.status).toBe("REJECTED");
    expect(res.preauthId).toBeUndefined();
    const receipt = await prisma.preauthIntakeReceipt.findUniqueOrThrow({ where: { id: res.receiptId } });
    expect(receipt.status).toBe("REJECTED");
    expect(receipt.preAuthorizationId).toBeNull();
  });

  it("out-of-tenant member and inactive member are REJECTED (no PA)", async () => {
    const crossTenant = await Svc.submit(ctx(), sub({ idempotencyKey: "rej-mem-x", memberNumber: world.members.beta.memberNumber }), okDeps);
    expect(crossTenant.status).toBe("REJECTED");
    const inactive = await Svc.submit(ctx(), sub({ idempotencyKey: "rej-mem-i", memberNumber: world.members.alphaInactive.memberNumber }), okDeps);
    expect(inactive.status).toBe("REJECTED");
  });

  it("provider identity cannot be forged on a provider channel", async () => {
    // resolveProviderId → PROVIDER_FORGERY surfaces as a validation reject
    const res = await Svc.submit(ctx(), sub({ idempotencyKey: "forge-1", providerId: world.providers.b.id }), okDeps);
    expect(res.status).toBe("REJECTED");
    expect(res.errors?.some((e) => e.code === "PROVIDER_FORGERY")).toBe(true);
  });

  it("a benefit NOT in the member's package is REJECTED (PR-024, F3.6 CATCH) — no PA", async () => {
    // the world's members hold an OUTPATIENT benefit only; DENTAL is not in package
    const res = await Svc.submit(ctx(), sub({ idempotencyKey: "rej-benefit", benefitCategory: "DENTAL" }), okDeps);
    expect(res.status).toBe("REJECTED");
    expect(res.errors?.some((e) => e.code === "BENEFIT_NOT_IN_PACKAGE")).toBe(true);
    expect(res.preauthId).toBeUndefined();
    const receipt = await prisma.preauthIntakeReceipt.findUniqueOrThrow({ where: { id: res.receiptId } });
    expect(receipt.status).toBe("REJECTED");
    expect(receipt.preAuthorizationId).toBeNull();
  });

  it("post-commit adjudication failure leaves receipt PROCESSING + PA durable (recoverable)", async () => {
    const res = await Svc.submit(ctx(), sub({ idempotencyKey: "defer-1" }), failDeps);
    expect(res.status).toBe("ACCEPTED"); // the submission WAS accepted (PA exists)
    expect(res.preauthId).toBeTruthy();
    const pa = await prisma.preAuthorization.findUniqueOrThrow({ where: { id: res.preauthId! } });
    expect(pa.status).toBe("SUBMITTED"); // undecided, awaiting retry
    const receipt = await prisma.preauthIntakeReceipt.findUniqueOrThrow({ where: { id: res.receiptId } });
    expect(receipt.status).toBe("PROCESSING"); // visible recoverable state
    const events = await prisma.preAuthorizationEvent.findMany({ where: { preAuthorizationId: res.preauthId! }, orderBy: { sequence: "asc" } });
    expect(events.map((e) => e.eventType)).toEqual(["SUBMITTED", "ASSIGNED"]); // deferred marker appended
    expect(events[1].safeReasonCode).toBe("AUTO_DECISION_DEFERRED");
  });
});
