/**
 * Claims Autopilot F3.7 — exact-once terminal audit + timeline + reconciliation.
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { processClaimRun, setClaimProcessor, resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";
import { claimRunById, recordStage } from "@/server/services/claim-intake/processing";
import {
  getClaimProcessingTimeline, findAcceptedReceiptsWithoutClaim,
  findStuckRuns, findTerminalRunsWithoutAudit,
} from "@/server/services/claim-intake/reconciliation";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F3.7 integration — reconcilable effects", () => {
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
    claimPool.push(...(await prisma.claim.findMany({ where: { tenantId }, orderBy: { claimNumber: "asc" }, select: { id: true }, skip: 90, take: 25 })).map((c) => c.id));
  });
  afterEach(() => resetClaimProcessor());
  afterAll(async () => {
    if (!prisma) return;
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: usedClaimIds } } } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: usedClaimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.$disconnect();
  });

  async function makeRun(runOver: Record<string, unknown> = {}, receiptClaimId?: string): Promise<{ runId: string; claimId: string; receiptId: string }> {
    seq += 1;
    const claimId = claimPool.pop()!;
    usedClaimIds.push(claimId);
    const receipt = await prisma.claimIntakeReceipt.create({ data: { tenantId, scopeKey: "user:f37", channel: "ADMIN_PORTAL", idempotencyKey: `f37-${Date.now()}-${seq}`, schemaVersion: "1", requestHash: "req:v1:h", suspectedDuplicateFingerprint: "suspect:v1:s", correlationId: `c-${seq}`, state: "SUCCEEDED", claimId: receiptClaimId === undefined ? claimId : receiptClaimId } });
    receiptIds.push(receipt.id);
    const run = await prisma.claimProcessingRun.create({ data: { tenantId, claimId, receiptId: receipt.id, claimRevision: 1, workflowVersion: "v1", sequence: 1, trigger: "INITIAL", state: "PENDING", ...runOver } });
    return { runId: run.id, claimId, receiptId: receipt.id };
  }

  it("terminal audit fires exactly once even if processed twice", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "FRAUD_REVIEW", assignedQueue: "FRAUD_REVIEW" }));
    const { runId, claimId } = await makeRun();
    const auditWhere = { tenantId, entityType: "Claim", entityId: claimId, action: "CLAIM:AUTOPILOT_ROUTED" };
    const before = await prisma.auditLog.count({ where: auditWhere });
    const claimed = await claimRunById(prisma, runId, { leaseOwner: "w" });
    await processClaimRun(prisma, claimed!, "w");
    await processClaimRun(prisma, claimed!, "w"); // second call: run already terminal ⇒ no-op
    const after = await prisma.auditLog.count({ where: auditWhere });
    expect(after - before).toBe(1); // exactly one terminal audit despite two processClaimRun calls
  });

  it("processing remains safe even when the run has a real audit actor (worker context, no request scope)", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "DOCUMENTS_INCOMPLETE", assignedQueue: "PROVIDER_QUERY" }));
    const { runId } = await makeRun();
    const claimed = await claimRunById(prisma, runId, { leaseOwner: "w" });
    await expect(processClaimRun(prisma, claimed!, "w")).resolves.toBeUndefined();
    expect((await prisma.claimProcessingRun.findUniqueOrThrow({ where: { id: runId } })).state).toBe("ROUTED");
  });

  it("timeline returns receipt + run + stages + audit for a claim", async () => {
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "PRICING_INCOMPLETE", assignedQueue: "PRICING_REVIEW" }));
    const { runId, claimId } = await makeRun();
    await recordStage(prisma, runId, "CONTRACT", { state: "PASSED", result: { payable: "1" } });
    const claimed = await claimRunById(prisma, runId, { leaseOwner: "w" });
    await processClaimRun(prisma, claimed!, "w");
    const tl = await getClaimProcessingTimeline(prisma, tenantId, claimId);
    expect(tl.receipts.length).toBeGreaterThanOrEqual(1);
    expect(tl.runs).toHaveLength(1);
    expect(tl.runs[0].stages.some((s) => s.stage === "CONTRACT")).toBe(true);
    expect(tl.audit.some((a) => a.action === "CLAIM:AUTOPILOT_ROUTED")).toBe(true);
  });

  it("reconciliation detects a SUCCEEDED receipt with no linked claim", async () => {
    // a receipt intentionally left unlinked
    seq += 1;
    const orphan = await prisma.claimIntakeReceipt.create({ data: { tenantId, scopeKey: "user:f37orphan", channel: "ADMIN_PORTAL", idempotencyKey: `f37orphan-${Date.now()}`, schemaVersion: "1", requestHash: "req:v1:h", suspectedDuplicateFingerprint: "suspect:v1:s", correlationId: "c", state: "SUCCEEDED", claimId: null } });
    receiptIds.push(orphan.id);
    const offenders = await findAcceptedReceiptsWithoutClaim(prisma, tenantId);
    expect(offenders.some((o) => o.id === orphan.id)).toBe(true);
  });

  it("reconciliation detects a stuck (old, non-terminal) run", async () => {
    const { runId } = await makeRun({ createdAt: new Date(Date.now() - 30 * 60_000) }); // 30 min old, PENDING
    const stuck = await findStuckRuns(prisma, 10, tenantId); // older than 10 min
    expect(stuck.some((s) => s.id === runId)).toBe(true);
  });

  it("reconciliation flags a terminal run with no audit, not one with audit", async () => {
    // terminal run WITHOUT audit (created directly ROUTED, never processed)
    const noAudit = await makeRun({ state: "ROUTED", completedAt: new Date() });
    // terminal run WITH audit (processed)
    setClaimProcessor(async () => ({ kind: "ROUTED", routeCode: "BENEFIT_LIMIT_REVIEW", assignedQueue: "BENEFIT_REVIEW" }));
    const withAudit = await makeRun();
    const claimed = await claimRunById(prisma, withAudit.runId, { leaseOwner: "w" });
    await processClaimRun(prisma, claimed!, "w");

    const offenders = await findTerminalRunsWithoutAudit(prisma, tenantId);
    const offenderIds = new Set(offenders.map((o) => o.id));
    expect(offenderIds.has(noAudit.runId)).toBe(true);
    expect(offenderIds.has(withAudit.runId)).toBe(false);
  });
});
