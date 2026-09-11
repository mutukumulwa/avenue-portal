/**
 * Family Hospital UAT plan P07.01 — the trial-record cleanup, against a real
 * Postgres (opt-in: DATABASE_URL === AUTOPILOT_TEST_DB).
 *
 * Proves: the dry run reconciles the reviewed set and names anything else the
 * provider holds; an apply refuses — writing nothing — on drift or for an actor
 * who is not a claims/clinical operator; an apply withdraws every claim and
 * cancels every pre-auth through the lifecycle services with the DEC-FH-04
 * reason, leaves an audit row per record and a SUCCEEDED receipt; a rerun of
 * the batch replays, and a new batch finds everything already done.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("P07.01 family trial-record cleanup (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let lib: typeof import("../../scripts/lib/family-trial-record-cleanup");
  let world: import("../factories/provider-network").ProviderWorld;
  const operators: Record<string, string> = {};

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    lib = await import("../../scripts/lib/family-trial-record-cleanup");
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    for (const [key, role] of [["claims", "CLAIMS_OFFICER"], ["finance", "FINANCE_OFFICER"]] as const) {
      const u = await prisma.user.create({
        data: { tenantId: world.tenants.alpha.id, role, email: `${key}.${world.token}@tpa.test`, passwordHash: "x", firstName: key, lastName: "Operator", isActive: true },
      });
      operators[key] = u.id;
    }
  });
  afterAll(async () => {
    if (!world) return;
    await prisma.operationReceipt.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: Object.values(operators) } } });
    await world.teardown();
  });

  /** Two RECEIVED claims and one UNDER_REVIEW pre-auth for one provider — the P00.03 shape. */
  async function trialSet(providerId: string) {
    const c1 = await world.createClaim({ providerId, status: "RECEIVED" });
    const c2 = await world.createClaim({ providerId, status: "RECEIVED" });
    const pa = await world.createPreauth({ providerId });
    await prisma.preAuthorization.update({ where: { id: pa.id }, data: { status: "UNDER_REVIEW" } });
    return {
      scope: { tenantId: world.tenants.alpha.id, providerId },
      suspect: { claims: [{ id: c1.id, number: c1.claimNumber }, { id: c2.id, number: c2.claimNumber }], preauths: [{ id: pa.id, number: pa.preauthNumber }] },
    };
  }
  const statuses = async (ids: string[]) => {
    const [c, p] = await Promise.all([
      prisma.claim.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }),
      prisma.preAuthorization.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }),
    ]);
    return Object.fromEntries([...c, ...p].map((r) => [r.id, r.status as string]));
  };

  it("refuses on drift — a record the reviewed set does not name, or one no longer undecided — and writes nothing", async () => {
    const { scope, suspect } = await trialSet(world.providers.a.id);
    const extra = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
    const inspection = await lib.inspect(prisma, scope, suspect);
    expect(inspection.unexpected.map((u) => u.id)).toEqual([extra.id]);
    expect(inspection.refusals.join("\n")).toContain(extra.claimNumber);

    const err = await lib.applyCleanup(prisma, { scope, suspect, batchRef: `DRIFT-${world.token}`, operatorUserId: operators.claims }).catch((e) => e);
    expect(err).toBeInstanceOf(lib.CleanupRefused);
    expect(err.code).toBe("DRIFT");
    const ids = [...suspect.claims.map((c) => c.id), ...suspect.preauths.map((p) => p.id)];
    expect(Object.values(await statuses(ids)).sort()).toEqual(["RECEIVED", "RECEIVED", "UNDER_REVIEW"]);
    expect(await prisma.operationReceipt.count({ where: { idempotencyKey: `DRIFT-${world.token}` } })).toBe(0);

    // a reviewed claim that was decided is drift too
    await prisma.claim.update({ where: { id: suspect.claims[0].id }, data: { status: "APPROVED" } });
    const decided = await lib.inspect(prisma, scope, { ...suspect, claims: suspect.claims });
    expect(decided.claims[0]).toMatchObject({ action: "REFUSE", blocker: "a APPROVED claim cannot be withdrawn" });
  });

  it("refuses an actor who is not a claims and clinical operator", async () => {
    const { scope, suspect } = await trialSet(world.providers.b.id);
    for (const actor of [operators.finance, world.users.a.admin.id]) {
      const err = await lib.applyCleanup(prisma, { scope, suspect, batchRef: `OPERATOR-${world.token}`, operatorUserId: actor }).catch((e) => e);
      expect(err.code).toBe("OPERATOR");
    }
    const ids = [...suspect.claims.map((c) => c.id), ...suspect.preauths.map((p) => p.id)];
    expect(Object.values(await statuses(ids)).sort()).toEqual(["RECEIVED", "RECEIVED", "UNDER_REVIEW"]);

    // ── then the real run on the same set ──────────────────────────────────
    const batchRef = `FH-P0701-${world.token}`;
    const dry = await lib.inspect(prisma, scope, suspect);
    expect(dry.refusals).toEqual([]);
    expect([...dry.claims, ...dry.preauths].map((r) => r.action)).toEqual(["WITHDRAW", "WITHDRAW", "CANCEL"]);

    const run = await lib.applyCleanup(prisma, { scope, suspect, batchRef, operatorUserId: operators.claims });
    expect(run.outcome).toBe("APPLIED");
    expect(run.steps.map((s) => `${s.number}:${s.fromStatus}->${s.toStatus}:${s.effect}`)).toEqual([
      `${suspect.claims[0].number}:RECEIVED->WITHDRAWN:WITHDRAWN`,
      `${suspect.claims[1].number}:RECEIVED->WITHDRAWN:WITHDRAWN`,
      `${suspect.preauths[0].number}:UNDER_REVIEW->CANCELLED:CANCELLED`,
    ]);
    expect(await statuses(ids)).toEqual({ [ids[0]]: "WITHDRAWN", [ids[1]]: "WITHDRAWN", [ids[2]]: "CANCELLED" });
    expect([...run.after.claims, ...run.after.preauths].every((r) => r.action === "ALREADY_DONE")).toBe(true);

    // one audit row per record, by the operator, and one lifecycle log per claim
    expect(run.auditEvents.map((a) => a.action).sort()).toEqual(["CLAIM:WITHDRAW", "CLAIM:WITHDRAW", "PREAUTH:CANCELLED"]);
    expect(new Set(run.auditEvents.map((a) => a.userId))).toEqual(new Set([operators.claims]));
    expect(run.lifecycleLogs).toHaveLength(2);
    const logs = await prisma.adjudicationLog.findMany({ where: { claimId: { in: ids } } });
    expect(logs.every((l) => l.notes?.startsWith("Operator withdrawal — Trial record priced from the wrong tariff: operation "))).toBe(true);
    const paAudit = await prisma.auditLog.findFirst({ where: { entityId: ids[2], action: "PREAUTH:CANCELLED" } });
    expect(paAudit!.description).toContain("TEST_DATA_INCORRECT_TARIFF");

    const receipt = await prisma.operationReceipt.findUnique({ where: { id: run.operationId } });
    expect(receipt).toMatchObject({ state: "SUCCEEDED", resultCode: "WITHDRAWN:2;CANCELLED:1", entityId: world.providers.b.id, entityRef: batchRef });

    // nothing deleted
    expect(await prisma.claim.count({ where: { id: { in: ids } } })).toBe(2);
    expect(await prisma.preAuthorization.count({ where: { id: { in: ids } } })).toBe(1);

    // rerun of the same batch: replay, no new rows
    const replay = await lib.applyCleanup(prisma, { scope, suspect, batchRef, operatorUserId: operators.claims });
    expect(replay).toMatchObject({ outcome: "REPLAYED", operationId: run.operationId, steps: [] });
    expect(await prisma.auditLog.count({ where: { entityId: { in: ids }, action: { in: ["CLAIM:WITHDRAW", "PREAUTH:CANCELLED"] } } })).toBe(3);

    // a new batch finds everything already done and changes nothing
    const again = await lib.applyCleanup(prisma, { scope, suspect, batchRef: `${batchRef}-R2`, operatorUserId: operators.claims });
    expect(again.outcome).toBe("APPLIED");
    expect(again.steps.every((s) => s.effect === "ALREADY_DONE")).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: { in: ids }, action: { in: ["CLAIM:WITHDRAW", "PREAUTH:CANCELLED"] } } })).toBe(3);
    expect(await prisma.adjudicationLog.count({ where: { claimId: { in: ids }, action: "WITHDRAWN" } })).toBe(2);
  });
});
