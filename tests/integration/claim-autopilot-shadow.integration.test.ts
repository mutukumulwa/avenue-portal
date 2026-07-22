/**
 * Claims Autopilot F4.6 — shadow mode REAL-DB proof.
 * SHADOW moves no money; proposal stored; agreement/overturn comparison correct.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { storeShadowProposal, compareShadowToOutcome } from "@/server/services/claim-autopilot/shadow";
import { registerClaimAutopilotProcessor } from "@/server/services/claim-autopilot/processor";
import { resetClaimProcessor, processClaimRun } from "@/server/jobs/claim-autopilot.job";
import { claimRunById } from "@/server/services/claim-intake/processing";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { persistClaim } from "@/server/services/claim-intake/persist";
import type { IntakeContext } from "@/server/services/claim-intake/context";
import type { AutoDecisionPlan } from "@/server/services/claim-autopilot/plan";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.6 integration — shadow mode", () => {
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
    memberId = m.id; clientId = m.group?.clientId ?? null;
    await prisma.autoAdjudicationPolicy.deleteMany({ where: { tenantId, maxAutoApproveAmount: 10_000_000 } });
    policyId = (await prisma.autoAdjudicationPolicy.create({ data: { tenantId, clientId, mode: "SHADOW", status: "APPROVED", maxAutoApproveAmount: 10_000_000, currency: "UGX", requireCleanFraud: true, requireAllLinesPriced: true, requireDocumentsComplete: true, requireEligibilityClear: true, requirePreauthWhenNeeded: true, allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"], isActive: true, effectiveFrom: new Date("2020-01-01"), version: 1 } })).id;
    registerClaimAutopilotProcessor();
  });

  afterAll(async () => {
    resetClaimProcessor();
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

  async function createClaim(): Promise<{ claimId: string; runId: string; lineId: string }> {
    seq += 1;
    const raw = { schemaVersion: "1", idempotencyKey: `f46-${Date.now()}-${seq}`, member: { memberId }, provider: { providerId }, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: `2029-0${(seq % 9) + 1}-05` }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines: [{ serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: "300.00", billedAmount: "300.00" }], currency: "UGX" };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture");
    const n = normalizeSubmission(parsed.data);
    const ctx: IntakeContext = { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f46", actorId: "f46", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: ctx.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `c-${seq}` });
    receiptIds.push(res.receipt.id);
    const r = await persistClaim(prisma, { context: ctx, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect });
    if (r.kind !== "CREATED") throw new Error("expected CREATED");
    claimIds.push(r.claimId);
    const line = await prisma.claimLine.findFirstOrThrow({ where: { claimId: r.claimId }, select: { id: true } });
    return { claimId: r.claimId, runId: r.runId, lineId: line.id };
  }

  const wouldApprovePlan = (claimId: string, lineId: string): AutoDecisionPlan => ({
    workflowVersion: "v1", claimId, claimRevision: 1, evaluatedAt: new Date().toISOString(), mode: "SHADOW", policyId, policyVersion: 1,
    disposition: "WOULD_APPROVE", totalBilled: "300.00", totalPayable: "300.00", currency: "UGX", reasons: [],
    lines: [{ claimLineId: lineId, decision: "APPROVED", billedAmount: "300.00", contractedAmount: "300.00", payableAmount: "300.00", shortfallAmount: "0.00", disallowedAmount: "0.00", memberLiability: "0.00", payerLiability: "300.00", providerWriteOff: "0.00", reasonCode: "APPROVED", resubmissionAllowed: false }],
    snapshots: { claimUpdatedAt: new Date().toISOString(), contractVersionIds: [], eligibilityAsOf: new Date().toISOString() },
  });

  it("SHADOW processing moves NO money (claim + line untouched)", async () => {
    const { claimId, runId } = await createClaim();
    await claimRunById(prisma, runId, { leaseOwner: "w" });
    await processClaimRun(prisma, { id: runId, claimId, tenantId, claimRevision: 1, workflowVersion: "v1", sequence: 1, attemptCount: 1 }, "w");
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true, approvedAmount: true, processingState: true, claimLines: { select: { adjudicationDecision: true } } } });
    expect(claim.status).toBe("RECEIVED"); // never decided automatically
    expect(Number(claim.approvedAmount)).toBe(0);
    expect(claim.claimLines.every((l) => l.adjudicationDecision === null)).toBe(true);
    expect(["SHADOW_COMPLETE", "ROUTED"]).toContain(claim.processingState);
  });

  it("stores the proposal and compares agreement vs a human decision", async () => {
    const { claimId, lineId, runId } = await createClaim();
    await storeShadowProposal(prisma, runId, wouldApprovePlan(claimId, lineId));
    await prisma.claimProcessingRun.update({ where: { id: runId }, data: { state: "SHADOW_COMPLETE" } });
    // undecided ⇒ no comparison yet
    expect(await compareShadowToOutcome(prisma, claimId)).toBeNull();

    // human AGREES (approves 300)
    await prisma.claim.update({ where: { id: claimId }, data: { status: "APPROVED", approvedAmount: 300 } });
    const agree = await compareShadowToOutcome(prisma, claimId);
    expect(agree).toMatchObject({ dispositionAgreed: true, amountAgreed: true, agreed: true });

    // human OVERTURNS the amount (approves 100)
    await prisma.claim.update({ where: { id: claimId }, data: { approvedAmount: 100 } });
    const amt = await compareShadowToOutcome(prisma, claimId);
    expect(amt).toMatchObject({ dispositionAgreed: true, amountAgreed: false, agreed: false });

    // human OVERTURNS the disposition (declines)
    await prisma.claim.update({ where: { id: claimId }, data: { status: "DECLINED", approvedAmount: 0 } });
    const dec = await compareShadowToOutcome(prisma, claimId);
    expect(dec).toMatchObject({ dispositionAgreed: false, agreed: false });
  });
});
