/**
 * Claims Autopilot F5.6 — reimbursement rail REAL-DB proof.
 *
 * Both reimbursement surfaces now converge on `reimbursementService.submit`,
 * which adapts onto the canonical intake (channel/source REIMBURSEMENT).
 * Proves: clean submit ⇒ claim + receipt + proof metadata + destination, and
 * the staged evaluator ALWAYS routes to REIMBURSEMENT_PROOF_REVIEW (D13 — no
 * automatic money decision, correct queue even with automation OFF); replay ⇒
 * one claim; an out-of-network (suspended-contract) facility is ACCEPTED (the
 * member already paid); an outside-window submission records the flag and still
 * routes (metadata, not a gate).
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { reimbursementService } from "@/server/services/reimbursement.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.6 integration — reimbursement converges on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, memberId: string, providerId: string, suspendedProviderId: string, systemActorId: string;
  const RUN = Date.now().toString(36);
  let seq = 0;
  const key = () => `f56-${RUN}-${(seq += 1)}`;

  const submit = (over: Record<string, unknown> = {}) =>
    reimbursementService.submit({
      tenantId,
      submittedById: systemActorId,
      memberId,
      providerId,
      serviceDate: new Date("2026-06-20"),
      totalPaidByMember: 5200,
      diagnoses: [{ code: "J06.9", description: "Acute URI", isPrimary: true }],
      lineItems: [{ serviceCategory: "CONSULTATION", cptCode: "99213", description: "Paid consult", quantity: 1, unitCost: 5200 }],
      benefitCategory: "OUTPATIENT",
      idempotencyKey: key(),
      bankName: "Stanbic",
      accountNo: "0102030405",
      ...over,
    } as never);

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    systemActorId = await (await import("@/server/services/system-actor.service")).getSystemActorId(tenantId);
    memberId = (await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { id: true } })).id;
    const [a, b] = await prisma.provider.findMany({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true }, take: 2 });
    providerId = a.id;
    // Simulate an out-of-network facility: flip provider B to SUSPENDED for the test.
    suspendedProviderId = b.id;
    await prisma.provider.update({ where: { id: b.id }, data: { contractStatus: "SUSPENDED" } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.provider.update({ where: { id: suspendedProviderId }, data: { contractStatus: "ACTIVE" } }).catch(() => undefined);
    const claims = await prisma.claim.findMany({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { startsWith: `f56-${RUN}` } } } }, select: { id: true } });
    const ids = claims.map((c) => c.id);
    await prisma.reimbursementRequest.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: ids } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { startsWith: `f56-${RUN}` } } }).catch(() => undefined);
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("clean submit: canonical claim + receipt + destination, ALWAYS routed to proof review (D13), no money", async () => {
    const res = await submit({ proofType: "RECEIPT_PHOTO", proofFileUrl: "https://files.local/receipt-1.jpg" });
    expect(res.claimId).toBeTruthy();

    const claim = await prisma.claim.findUniqueOrThrow({
      where: { id: res.claimId! },
      select: {
        isReimbursement: true, source: true, status: true, approvedAmount: true,
        processingRouteCode: true, assignedQueue: true, processingState: true,
        reimbursementBankName: true, reimbursementAccountNo: true,
      },
    });
    expect(claim.isReimbursement).toBe(true);
    expect(claim.source).toBe("REIMBURSEMENT");
    expect(claim.reimbursementBankName).toBe("Stanbic");
    expect(claim.reimbursementAccountNo).toBe("0102030405");
    // D13: no automatic money decision — routed to the reimbursement queue,
    // even though no LIVE policy exists (correct queue beats the OFF fallback).
    expect(["APPROVED", "PARTIALLY_APPROVED"]).not.toContain(claim.status);
    expect(Number(claim.approvedAmount ?? 0)).toBe(0);
    expect(claim.processingState).toBe("ROUTED");
    expect(claim.processingRouteCode).toBe("REIMBURSEMENT_PROOF_REVIEW");
    expect(claim.assignedQueue).toBe("REIMBURSEMENT_REVIEW");

    const receipt = await prisma.claimIntakeReceipt.findFirstOrThrow({ where: { claimId: res.claimId! }, select: { channel: true, scopeKey: true } });
    expect(receipt.channel).toBe("REIMBURSEMENT");
    expect(receipt.scopeKey).toBe(`reimbursement:${memberId}`);

    // proof metadata rides on the linked request row
    const request = await prisma.reimbursementRequest.findFirstOrThrow({ where: { claimId: res.claimId! }, select: { proofType: true, submittedWithinWindow: true } });
    expect(request.proofType).toBe("RECEIPT_PHOTO");
    expect(request.submittedWithinWindow).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { tenantId, action: "REIMBURSEMENT:SUBMITTED", entityId: res.claimId! }, select: { id: true } });
    expect(audit).toBeTruthy();
  });

  it("replaying the same draft key yields ONE claim", async () => {
    const k = key();
    const first = await submit({ idempotencyKey: k });
    const second = await submit({ idempotencyKey: k });
    expect(second.replayed).toBe(true);
    expect(second.claimId).toBe(first.claimId);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: k } } } })).toBe(1);
  });

  it("an out-of-network (suspended-contract) facility is ACCEPTED — the member already paid", async () => {
    const res = await submit({ providerId: suspendedProviderId });
    expect(res.claimId).toBeTruthy();
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: res.claimId! }, select: { providerId: true, processingRouteCode: true } });
    expect(claim.providerId).toBe(suspendedProviderId);
    expect(claim.processingRouteCode).toBe("REIMBURSEMENT_PROOF_REVIEW"); // still manual review
  });

  it("an outside-window submission records the flag and still routes (metadata, not a gate)", async () => {
    const res = await submit({
      serviceDate: new Date(Date.now() - 200 * 86_400_000),
      proofType: "RECEIPT_PHOTO",
      proofFileUrl: "https://files.local/receipt-2.jpg",
    });
    expect(res.claimId).toBeTruthy();
    const request = await prisma.reimbursementRequest.findFirstOrThrow({ where: { claimId: res.claimId! }, select: { submittedWithinWindow: true } });
    expect(request.submittedWithinWindow).toBe(false);
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: res.claimId! }, select: { processingRouteCode: true } });
    expect(claim.processingRouteCode).toBe("REIMBURSEMENT_PROOF_REVIEW");
  });
});
