/**
 * Claims Autopilot F3.6 — processing + recovery sweep REAL-DB proof.
 * processClaimRun outcomes (route/mirror, retry, exhaustion→FAILED),
 * enqueue-failure→sweeper-recovery, worker-crash (stale lease)→recovery.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  processClaimRun, runClaimAutopilotRecoveryJob,
  setClaimProcessor, resetClaimProcessor, MAX_RUN_ATTEMPTS,
} from "@/server/jobs/claim-autopilot.job";
import { claimRunById } from "@/server/services/claim-intake/processing";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F3.6 integration — processing + recovery", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;
  const claimPool: string[] = [];
  const usedClaimIds: string[] = [];
  const receiptIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    // Disjoint claim window (by claimNumber) so parallel integration files never
    // share seeded claims. Pool ONLY untouched claims — canonical intake (F5.1+)
    // creates claims that already carry a sequence-1 run, and VOIDed test
    // leftovers must never re-enter a fixture pool.
    claimPool.push(
      ...(
        await prisma.claim.findMany({
          where: { tenantId, processingRuns: { none: {} }, status: { not: "VOID" } },
          orderBy: { claimNumber: "asc" }, select: { id: true }, skip: 40, take: 25,
        })
      ).map((c) => c.id),
    );
  });
  afterEach(() => resetClaimProcessor());
  afterAll(async () => {
    if (!prisma) return;
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: usedClaimIds } } } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: usedClaimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.$disconnect();
  });

  async function makeRun(over: Record<string, unknown> = {}): Promise<{ runId: string; claimId: string }> {
    seq += 1;
    const claimId = claimPool.pop()!;
    usedClaimIds.push(claimId);
    const receipt = await prisma.claimIntakeReceipt.create({ data: { tenantId, scopeKey: "user:f36", channel: "ADMIN_PORTAL", idempotencyKey: `f36-${Date.now()}-${seq}`, schemaVersion: "1", requestHash: "req:v1:h", suspectedDuplicateFingerprint: "suspect:v1:s", correlationId: `c-${seq}`, state: "SUCCEEDED", claimId } });
    receiptIds.push(receipt.id);
    const run = await prisma.claimProcessingRun.create({ data: { tenantId, claimId, receiptId: receipt.id, claimRevision: 1, workflowVersion: "v1", sequence: 1, trigger: "INITIAL", state: "PENDING", ...over } });
    return { runId: run.id, claimId };
  }

  it("processClaimRun applies a ROUTE outcome and mirrors it to the claim", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "PREAUTH_REQUIRED", assignedQueue: "CLINICAL_AUTH_REVIEW" }));
    const { runId, claimId } = await makeRun();
    const claimed = await claimRunById(prisma, runId, { leaseOwner: "w1" });
    await processClaimRun(prisma, claimed!, "w1");
    const run = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.state).toBe("ROUTED");
    expect(run.routeCode).toBe("PREAUTH_REQUIRED");
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(claim.processingState).toBe("ROUTED");
    expect(claim.processingRouteCode).toBe("PREAUTH_REQUIRED");
    expect(claim.assignedQueue).toBe("CLINICAL_AUTH_REVIEW");
  });

  it("a processor error retries (below the cap) and FAILS visibly once exhausted", async () => {
    setClaimProcessor(async () => { throw new Error("dependency down\n  at x.ts:1"); });
    // below cap ⇒ RETRYABLE
    const { runId } = await makeRun();
    const c1 = await claimRunById(prisma, runId, { leaseOwner: "w" });
    await processClaimRun(prisma, c1!, "w");
    const r1 = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(r1.state).toBe("RETRYABLE");
    expect(r1.safeMessage).not.toMatch(/\n/); // sanitized
    expect(r1.nextAttemptAt).toBeInstanceOf(Date);

    // at the cap ⇒ FAILED + claim mirror
    const { runId: runId2, claimId } = await makeRun({ attemptCount: MAX_RUN_ATTEMPTS - 1 });
    const c2 = await claimRunById(prisma, runId2, { leaseOwner: "w" });
    expect(c2!.attemptCount).toBe(MAX_RUN_ATTEMPTS);
    await processClaimRun(prisma, c2!, "w");
    const r2 = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId2 } });
    expect(r2.state).toBe("FAILED");
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(claim.processingState).toBe("FAILED");
    expect(claim.assignedQueue).toBe("AUTOPILOT_FAILURE");
  });

  it("the recovery sweep processes runs whose enqueue never happened", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "AUTO_POLICY_NOT_LIVE", assignedQueue: "MANUAL_ADJUDICATION" }));
    const mine = await Promise.all([makeRun(), makeRun(), makeRun()]);
    const res = await runClaimAutopilotRecoveryJob({ db: prisma, owner: "sweeper", batchSize: 50 });
    expect(res.processed).toBeGreaterThanOrEqual(3);
    for (const m of mine) {
      const run = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: m.runId } });
      expect(run.state).toBe("ROUTED");
    }
  });

  it("the recovery sweep reclaims a crashed worker's stale-leased run", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "AUTO_POLICY_NOT_LIVE", assignedQueue: "MANUAL_ADJUDICATION" }));
    const { runId } = await makeRun();
    await claimRunById(prisma, runId, { leaseOwner: "crashed-worker" }); // RUNNING, leased
    await prisma.claimProcessingRun.update({ where: { id: runId }, data: { leaseExpiresAt: new Date(Date.now() - 300_000) } }); // lease expired
    await runClaimAutopilotRecoveryJob({ db: prisma, owner: "recovery", batchSize: 50 });
    const run = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.state).toBe("ROUTED"); // reclaimed + processed
  });
});
