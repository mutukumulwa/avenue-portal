/**
 * Claims Autopilot F4.2 — staged read-only evaluation REAL-DB proof.
 * OFF routing, stop-at-first-route + SKIPPED marking, stage ordering, read-only.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { evaluateClaimStaged } from "@/server/services/claim-autopilot/evaluate";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { persistClaim } from "@/server/services/claim-intake/persist";
import type { IntakeContext } from "@/server/services/claim-intake/context";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const STAGE_ORDER = ["CONTEXT", "ELIGIBILITY", "CODING", "DOCUMENTS", "DUPLICATE", "CONTRACT", "PREAUTH", "BENEFIT", "FRAUD", "COST_SHARE", "POLICY"];

describe.skipIf(!URL_SET)("F4.2 integration — staged evaluation", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, memberId: string, clientId: string | null, policyId: string;
  const receiptIds: string[] = [];
  const claimIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" } })).id;
    const m = await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, include: { group: { select: { clientId: true } } } });
    memberId = m.id;
    clientId = m.group?.clientId ?? null;
    // Defensive: clear any test-signature policy leaked by a prior failed run.
    await prisma.autoAdjudicationPolicy.deleteMany({ where: { tenantId, maxAutoApproveAmount: 10_000_000 } });
    policyId = (await prisma.autoAdjudicationPolicy.create({
      data: { tenantId, clientId, mode: "LIVE", status: "APPROVED", maxAutoApproveAmount: 10_000_000, currency: "UGX", requireCleanFraud: true, requireAllLinesPriced: true, requireDocumentsComplete: true, requireEligibilityClear: true, requirePreauthWhenNeeded: true, allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"], isActive: true, effectiveFrom: new Date("2020-01-01"), version: 1 },
    })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: claimIds } } } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.claimFraudAlert.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.adjudicationLog.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimLine.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    await prisma.autoAdjudicationPolicy.delete({ where: { id: policyId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function createClaim(coded: boolean): Promise<{ claimId: string; runId: string }> {
    seq += 1;
    const line = coded
      ? { serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" }
      : { serviceCategory: "OTHER", description: "uncoded sundry", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" };
    const raw = { schemaVersion: "1", idempotencyKey: `f42-${Date.now()}-${seq}`, member: { memberId }, provider: { providerId }, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines: [line], currency: "UGX" };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture");
    const n = normalizeSubmission(parsed.data);
    const ctx: IntakeContext = { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f42", actorId: "f42", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: ctx.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `c-${seq}` });
    receiptIds.push(res.receipt.id);
    const r = await persistClaim(prisma, { context: ctx, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect });
    if (r.kind !== "CREATED") throw new Error("expected CREATED");
    claimIds.push(r.claimId);
    return { claimId: r.claimId, runId: r.runId };
  }

  async function stagesFor(runId: string) {
    return prisma.claimProcessingStage.findMany({ where: { runId }, select: { stage: true, state: true } });
  }

  it("no LIVE policy ⇒ routes AUTO_POLICY_* with POLICY routed and all other stages SKIPPED", async () => {
    await prisma.autoAdjudicationPolicy.update({ where: { id: policyId }, data: { status: "DRAFT" } });
    try {
      const { claimId, runId } = await createClaim(true);
      const r = await evaluateClaimStaged(prisma, tenantId, claimId, runId);
      expect(r.disposition).toBe("ROUTE");
      expect(r.mode).toBe("OFF");
      expect(r.routeCode).toMatch(/AUTO_POLICY_(NOT_LIVE|OFF)/);
      const stages = await stagesFor(runId);
      expect(stages.find((s) => s.stage === "POLICY")?.state).toBe("ROUTED");
      expect(stages.filter((s) => s.stage !== "POLICY").every((s) => s.state === "SKIPPED")).toBe(true);
    } finally {
      await prisma.autoAdjudicationPolicy.update({ where: { id: policyId }, data: { status: "APPROVED" } });
    }
  });

  it("under LIVE, stages run in order and stop at the first route (rest SKIPPED)", async () => {
    const { claimId, runId } = await createClaim(false); // uncoded ⇒ routes at CODING (or earlier)
    const r = await evaluateClaimStaged(prisma, tenantId, claimId, runId);
    expect(r.mode).toBe("LIVE");
    expect(r.disposition).toBe("ROUTE");
    const stages = await stagesFor(runId);
    const byName = new Map(stages.map((s) => [s.stage as string, s.state as string]));
    // find the routed stage; every earlier stage PASSED, every later SKIPPED.
    const routedIdx = STAGE_ORDER.findIndex((n) => byName.get(n) === "ROUTED");
    expect(routedIdx).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < STAGE_ORDER.length; i += 1) {
      const st = byName.get(STAGE_ORDER[i]);
      if (i < routedIdx) expect(["PASSED", "SKIPPED"]).toContain(st);
      else if (i > routedIdx) expect(st).toBe("SKIPPED");
    }
  });

  it("evaluation is READ-ONLY w.r.t. claim/line money and status", async () => {
    const { claimId, runId } = await createClaim(true);
    const before = await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true, billedAmount: true, approvedAmount: true, claimLines: { select: { adjudicationDecision: true, approvedAmount: true } } } });
    await evaluateClaimStaged(prisma, tenantId, claimId, runId);
    const after = await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true, billedAmount: true, approvedAmount: true, claimLines: { select: { adjudicationDecision: true, approvedAmount: true } } } });
    expect(after.status).toBe(before.status);
    expect(Number(after.billedAmount)).toBe(Number(before.billedAmount));
    expect(Number(after.approvedAmount)).toBe(Number(before.approvedAmount));
    expect(after.claimLines.every((l) => l.adjudicationDecision === null)).toBe(true);
    expect(after.claimLines.every((l) => Number(l.approvedAmount) === 0)).toBe(true);
  });
});
