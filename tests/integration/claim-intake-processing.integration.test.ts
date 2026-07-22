/**
 * Claims Autopilot F3.5 — processing-run lease + stage repository REAL-DB proof.
 * Two-worker race, stale reclaim, non-owner immutability, retry reuse,
 * reprocess sequence/supersession, concurrent-reprocess single-run, stage upsert.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  claimNextRun, claimRunById, extendLease, recordStage,
  markRunRouted, markRunRetryable, markRunFailed, markRunAutoDecided,
  createReprocessRun,
} from "@/server/services/claim-intake/processing";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F3.5 integration — processing run lease + stages", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;
  const claimPool: string[] = [];
  const usedClaimIds: string[] = [];
  const receiptIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    // Disjoint claim window (by claimNumber) so parallel integration files never share seeded claims.
    const claims = await prisma.claim.findMany({ where: { tenantId }, orderBy: { claimNumber: "asc" }, select: { id: true }, skip: 0, take: 25 });
    claimPool.push(...claims.map((c) => c.id));
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: usedClaimIds } } } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: usedClaimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.$disconnect();
  });

  function nextClaim(): string {
    const id = claimPool.pop();
    if (!id) throw new Error("claim pool exhausted");
    usedClaimIds.push(id);
    return id;
  }

  async function makeRun(over: Record<string, unknown> = {}): Promise<{ runId: string; claimId: string; receiptId: string }> {
    seq += 1;
    const claimId = nextClaim();
    const receipt = await prisma.claimIntakeReceipt.create({
      data: { tenantId, scopeKey: "user:f35", channel: "ADMIN_PORTAL", idempotencyKey: `f35-${Date.now()}-${seq}`, schemaVersion: "1", requestHash: "req:v1:h", suspectedDuplicateFingerprint: "suspect:v1:s", correlationId: `c-${seq}`, state: "SUCCEEDED", claimId },
    });
    receiptIds.push(receipt.id);
    const run = await prisma.claimProcessingRun.create({
      data: { tenantId, claimId, receiptId: receipt.id, claimRevision: 1, workflowVersion: "v1", sequence: 1, trigger: "INITIAL", state: "PENDING", ...over },
    });
    return { runId: run.id, claimId, receiptId: receipt.id };
  }

  it("two workers cannot claim the same run (race)", async () => {
    const { runId } = await makeRun();
    const [a, b] = await Promise.all([claimRunById(prisma, runId, { leaseOwner: "worker-A" }), claimRunById(prisma, runId, { leaseOwner: "worker-B" })]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    const row = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(row.state).toBe("RUNNING");
    expect(["worker-A", "worker-B"]).toContain(row.leaseOwner);
  });

  it("reclaims a stale (expired-lease) RUNNING run", async () => {
    const { runId } = await makeRun();
    await claimRunById(prisma, runId, { leaseOwner: "crashed" });
    await prisma.claimProcessingRun.update({ where: { id: runId }, data: { leaseExpiresAt: new Date(Date.now() - 60_000) } });
    const reclaimed = await claimRunById(prisma, runId, { leaseOwner: "fresh" });
    expect(reclaimed).toBeTruthy();
    expect((await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } })).leaseOwner).toBe("fresh");
  });

  it("only the lease owner may complete a run; non-owner writes nothing", async () => {
    const { runId } = await makeRun();
    await claimRunById(prisma, runId, { leaseOwner: "owner" });
    expect(await markRunRouted(prisma, runId, "intruder", { routeCode: "FRAUD_REVIEW" })).toBe(false);
    expect(await markRunRouted(prisma, runId, "owner", { routeCode: "FRAUD_REVIEW", assignedQueue: "FRAUD_REVIEW" })).toBe(true);
    const row = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(row.state).toBe("ROUTED");
    expect(row.routeCode).toBe("FRAUD_REVIEW");
    expect(row.leaseOwner).toBeNull();
  });

  it("a transient retry reuses the SAME run and bumps attemptCount", async () => {
    const { runId } = await makeRun();
    const c1 = await claimRunById(prisma, runId, { leaseOwner: "w1" });
    expect(c1!.attemptCount).toBe(1);
    expect(await markRunRetryable(prisma, runId, "w1", { safeMessage: "db timeout", nextAttemptAt: new Date(Date.now() - 1000) })).toBe(true);
    const c2 = await claimRunById(prisma, runId, { leaseOwner: "w2" });
    expect(c2!.id).toBe(runId);
    expect(c2!.attemptCount).toBe(2);
  });

  it("a terminal run is immutable (a later transition changes nothing)", async () => {
    const { runId } = await makeRun();
    await claimRunById(prisma, runId, { leaseOwner: "w" });
    await markRunAutoDecided(prisma, runId, "w", { modeResolved: "LIVE" });
    expect(await markRunFailed(prisma, runId, "w", { safeMessage: "late" })).toBe(false);
    expect((await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } })).state).toBe("AUTO_DECIDED");
  });

  it("authorized reprocess creates the next sequence with a supersession link", async () => {
    const { runId, claimId, receiptId } = await makeRun();
    await claimRunById(prisma, runId, { leaseOwner: "w" });
    await markRunRouted(prisma, runId, "w", { routeCode: "DOCUMENTS_INCOMPLETE" });
    const rp = await createReprocessRun(prisma, { tenantId, claimId, receiptId, claimRevision: 1, trigger: "MANUAL_REPROCESS" });
    expect(rp.created).toBe(true);
    expect(rp.sequence).toBe(2);
    const run2 = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: rp.runId } });
    expect(run2.supersedesRunId).toBe(runId);
    expect(run2.state).toBe("PENDING");
  });

  it("concurrent reprocess creates exactly ONE non-terminal run", async () => {
    const { runId, claimId, receiptId } = await makeRun();
    await claimRunById(prisma, runId, { leaseOwner: "w" });
    await markRunRouted(prisma, runId, "w", { routeCode: "DOCUMENTS_INCOMPLETE" });
    const [x, y] = await Promise.all([
      createReprocessRun(prisma, { tenantId, claimId, receiptId, claimRevision: 1, trigger: "MANUAL_REPROCESS" }),
      createReprocessRun(prisma, { tenantId, claimId, receiptId, claimRevision: 1, trigger: "MANUAL_REPROCESS" }),
    ]);
    expect(x.runId).toBe(y.runId);
    expect(x.sequence).toBe(2);
    expect(await prisma.claimProcessingRun.count({ where: { claimId, claimRevision: 1, workflowVersion: "v1", state: { in: ["PENDING", "RUNNING", "RETRYABLE"] } } })).toBe(1);
  });

  it("recordStage upserts under (runId, stage) and bumps attempts", async () => {
    const { runId } = await makeRun();
    await recordStage(prisma, runId, "CONTRACT", { state: "RUNNING", currentStage: true });
    await recordStage(prisma, runId, "CONTRACT", { state: "PASSED", result: { payable: "3500" } });
    const stages = await prisma.claimProcessingStage.findMany({ where: { runId } });
    expect(stages).toHaveLength(1);
    expect(stages[0].state).toBe("PASSED");
    expect(stages[0].attemptCount).toBe(2);
    expect((await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } })).currentStage).toBe("CONTRACT");
  });

  it("claimNextRun claims a due run and extendLease keeps it", async () => {
    const { runId } = await makeRun();
    const claimed = await claimNextRun(prisma, { leaseOwner: "sweeper" });
    expect(claimed).toBeTruthy();
    // extend whatever we claimed (its own lease)
    expect(await extendLease(prisma, claimed!.id, "sweeper")).toBe(true);
    // terminate to avoid interfering with later assertions
    await markRunRouted(prisma, claimed!.id, "sweeper", { routeCode: "PIPELINE_RETRY" });
    // our specific run is claimable if it wasn't the one picked
    const mine = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(["PENDING", "ROUTED", "RUNNING"]).toContain(mine.state);
  });
});
