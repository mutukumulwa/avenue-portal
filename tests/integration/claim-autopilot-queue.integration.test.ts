/**
 * Claims Autopilot F3.6 — BullMQ enqueue dedup + handler dispatch (Redis + DB).
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL and AUTOPILOT_TEST_REDIS set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { enqueueClaimAutopilotRun, Queues, getConnection } from "@/lib/queue";
import { runClaimAutopilotRunJob, setClaimProcessor, resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const REDIS_SET = !!process.env.AUTOPILOT_TEST_REDIS && process.env.REDIS_URL === process.env.AUTOPILOT_TEST_REDIS;

describe.skipIf(!URL_SET || !REDIS_SET)("F3.6 integration — BullMQ queue", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;
  const receiptIds: string[] = [];
  const claimIds: string[] = [];

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    await Queues.claims.obliterate({ force: true }).catch(() => undefined);
  });

  afterAll(async () => {
    resetClaimProcessor();
    if (prisma) {
      await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: claimIds } } } });
      await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: claimIds } } });
      await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
      await prisma.$disconnect();
    }
    await Queues.claims.obliterate({ force: true }).catch(() => undefined);
    await Queues.claims.close().catch(() => undefined);
    getConnection().disconnect();
  });

  async function makeRun(): Promise<{ runId: string; claimId: string }> {
    // Disjoint window (from the end by claimNumber) so it never shares seeded claims with the front-window files.
    const claimId = (await prisma.claim.findFirstOrThrow({ where: { tenantId, id: { notIn: claimIds } }, orderBy: { claimNumber: "desc" }, select: { id: true } })).id;
    claimIds.push(claimId);
    const receipt = await prisma.claimIntakeReceipt.create({ data: { tenantId, scopeKey: "user:f36q", channel: "ADMIN_PORTAL", idempotencyKey: `f36q-${Date.now()}-${claimIds.length}`, schemaVersion: "1", requestHash: "req:v1:h", suspectedDuplicateFingerprint: "suspect:v1:s", correlationId: "c", state: "SUCCEEDED", claimId } });
    receiptIds.push(receipt.id);
    const run = await prisma.claimProcessingRun.create({ data: { tenantId, claimId, receiptId: receipt.id, claimRevision: 1, workflowVersion: "v1", sequence: 1, trigger: "INITIAL", state: "PENDING" } });
    return { runId: run.id, claimId };
  }

  it("enqueue is idempotent per run id (duplicate dispatch collapses to one job)", async () => {
    const { runId } = await makeRun();
    await enqueueClaimAutopilotRun(runId, tenantId);
    await enqueueClaimAutopilotRun(runId, tenantId); // duplicate
    const job = await Queues.claims.getJob(`car-${runId}`);
    expect(job).toBeTruthy();
    const waiting = await Queues.claims.getWaiting();
    const forRun = waiting.filter((j) => (j.data as { runId?: string }).runId === runId);
    expect(forRun).toHaveLength(1);
  });

  it("the run-job handler claims and processes the run", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "DOCUMENTS_INCOMPLETE", assignedQueue: "PROVIDER_QUERY" }));
    const { runId } = await makeRun();
    await runClaimAutopilotRunJob({ data: { runId, tenantId } });
    const run = await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.state).toBe("ROUTED");
    expect(run.routeCode).toBe("DOCUMENTS_INCOMPLETE");
  });
});
