/**
 * Claims Autopilot F3.4 — ClaimIntakeService.submit REAL-DB acceptance matrix.
 * accepted / replayed / conflict / enqueue-resilience / chained-audit.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClaimIntakeService, setProcessingEnqueuer, resetProcessingEnqueuer } from "@/server/services/claim-intake/intake.service";
import type { CallerIdentity } from "@/server/services/claim-intake/context";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F3.4 integration — ClaimIntakeService.submit", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, memberId: string, userId: string;
  const receiptIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const t = await prisma.tenant.findFirstOrThrow();
    tenantId = t.id;
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" } })).id;
    memberId = (await prisma.member.findFirstOrThrow({ where: { tenantId } })).id;
    userId = (await prisma.user.findFirstOrThrow({ where: { tenantId } })).id;
  });

  afterAll(async () => {
    resetProcessingEnqueuer();
    if (!prisma) return;
    const claimIds = (await prisma.claimIntakeReceipt.findMany({ where: { id: { in: receiptIds }, claimId: { not: null } }, select: { claimId: true } })).map((r) => r.claimId!) as string[];
    await prisma.claimProcessingRun.deleteMany({ where: { receiptId: { in: receiptIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.claimLine.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    await prisma.$disconnect();
  });

  const caller = (): CallerIdentity => ({ kind: "operatorUser", tenantId, userId });
  const raw = (key: string, over: Record<string, unknown> = {}) => ({
    schemaVersion: "1", idempotencyKey: key,
    member: { memberId }, provider: { providerId },
    encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
    diagnoses: [{ code: "J06.9", isPrimary: true }],
    lines: [
      { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" },
      { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "J06.9", description: "FBC", quantity: 1, unitCost: "2000.00", billedAmount: "2000.00" },
    ],
    currency: "UGX",
    ...over,
  });
  const key = () => `f34-${Date.now()}-${++seq}`;

  async function submit(k: string, over: Record<string, unknown> = {}) {
    const r = await ClaimIntakeService.submit(caller(), raw(k, over));
    receiptIds.push(r.receiptId);
    return r;
  }

  it("ACCEPTED: creates a claim + PENDING run, links the receipt, enqueues, and chain-audits", async () => {
    const enq: Array<{ runId: string; tenantId: string }> = [];
    setProcessingEnqueuer(async (runId, tid) => { enq.push({ runId, tenantId: tid }); });
    const k = key();
    const r = await submit(k);
    expect(r).toMatchObject({ success: true, replayed: false, outcome: "ACCEPTED", receiptState: "SUCCEEDED", processingState: "PENDING" });
    expect(r.claimId).toBeTruthy();
    expect(r.claimNumber).toMatch(/^CLM-/);

    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: r.claimId! }, include: { processingRuns: true } });
    expect(Number(claim.billedAmount)).toBe(3500);
    expect(claim.processingRuns).toHaveLength(1);
    expect(enq).toHaveLength(1);
    expect(enq[0].runId).toBe(claim.processingRuns[0].id);

    // chain-linked intake audit (not the plain writeAudit)
    const audit = await prisma.auditLog.findFirst({ where: { tenantId, action: "CLAIM:INTAKE_ACCEPTED", entityId: r.claimId! } });
    expect(audit, "INTAKE_ACCEPTED audit event").toBeTruthy();
    resetProcessingEnqueuer();
  });

  it("REPLAYED: same key + same payload returns the original claim, replayed=true, no 2nd claim", async () => {
    const k = key();
    const first = await submit(k);
    const before = await prisma.claim.count({ where: { tenantId } });
    const second = await submit(k);
    expect(second.replayed).toBe(true);
    expect(second.outcome).toBe("REPLAYED");
    expect(second.claimId).toBe(first.claimId);
    expect(await prisma.claim.count({ where: { tenantId } })).toBe(before);
  });

  it("CONFLICT: same key + different payload throws idempotency conflict (no mutation)", async () => {
    const k = key();
    const first = await submit(k);
    await expect(submit(k, { lines: [{ sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", description: "GP", quantity: 1, unitCost: "9999.00", billedAmount: "9999.00" }] })).rejects.toMatchObject({ kind: "IDEMPOTENCY_CONFLICT", httpStatus: 409 });
    // original claim untouched
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: first.claimId! } });
    expect(Number(claim.billedAmount)).toBe(3500);
  });

  it("acceptance never depends on Redis: a throwing enqueuer still yields ACCEPTED", async () => {
    setProcessingEnqueuer(async () => { throw new Error("redis down"); });
    const r = await submit(key());
    expect(r.outcome).toBe("ACCEPTED");
    expect(r.claimId).toBeTruthy();
    // the run remains PENDING for the sweeper to recover
    const run = await prisma.claimProcessingRun.findFirstOrThrow({ where: { receiptId: r.receiptId } });
    expect(run.state).toBe("PENDING");
    resetProcessingEnqueuer();
  });

  it("getReceipt returns the authoritative state after a timeout/response-loss", async () => {
    const r = await submit(key());
    const view = await ClaimIntakeService.getReceipt(tenantId, r.receiptId);
    expect(view).toMatchObject({ receiptId: r.receiptId, receiptState: "SUCCEEDED", claimId: r.claimId, replayed: true });
    // foreign tenant cannot read it
    expect(await ClaimIntakeService.getReceipt("some-other-tenant", r.receiptId)).toBeNull();
  });
});
