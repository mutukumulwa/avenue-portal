/**
 * Claims Autopilot F5.7 — pre-auth conversion rail REAL-DB proof.
 *
 * `createClaimWithPreauth` now submits through the canonical intake with the
 * durable key `<preauthId>:claim-create:v1`. Proves: conversion creates ONE
 * claim with the PA connected + ATTACHED atomically (channel
 * PREAUTH_CONVERSION, source PREAUTH); the benefit HOLD is preserved (consumed
 * only at decision); repeat + concurrent conversions return the SAME claim;
 * a non-approved or suspended-facility PA fails safely with no claim.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClaimsService } from "@/server/services/claims.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.7 integration — PA conversion converges on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, memberId: string, providerId: string, otherProviderId: string;
  const RUN = Date.now().toString(36);
  let seq = 0;
  const paIds: string[] = [];

  async function makePA(over: Record<string, unknown> = {}): Promise<{ id: string; preauthNumber: string }> {
    seq += 1;
    const pa = await prisma.preAuthorization.create({
      data: {
        tenantId, memberId, providerId,
        preauthNumber: `PA-F57-${RUN}-${seq}`,
        benefitCategory: "OUTPATIENT", serviceType: "OUTPATIENT", submittedBy: "PROVIDER",
        status: "APPROVED", estimatedCost: 8000, approvedAmount: 8000,
        diagnoses: [{ icdCode: "J06.9", description: "Acute URI", isPrimary: true }],
        procedures: [{ cptCode: "99213", description: "GP consult" }],
        validUntil: new Date(Date.now() + 7 * 86_400_000),
        ...over,
      },
      select: { id: true, preauthNumber: true },
    });
    paIds.push(pa.id);
    return pa;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    memberId = (await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { id: true } })).id;
    const [a, b] = await prisma.provider.findMany({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true }, take: 2 });
    providerId = a.id;
    otherProviderId = b.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.provider.update({ where: { id: otherProviderId }, data: { contractStatus: "ACTIVE" } }).catch(() => undefined);
    const claims = await prisma.claim.findMany({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { contains: ":claim-create:v1" } } } }, select: { id: true } });
    const ids = claims.map((c) => c.id);
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: ids } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { contains: ":claim-create:v1" } } }).catch(() => undefined);
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    await prisma.benefitHold.deleteMany({ where: { preAuthId: { in: paIds } } }).catch(() => undefined);
    await prisma.preAuthorization.deleteMany({ where: { id: { in: paIds } } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("converts once: PA connected + ATTACHED atomically, canonical channel/source, hold PRESERVED", async () => {
    const pa = await makePA();
    await prisma.benefitHold.create({
      data: { tenantId, memberId, preAuthId: pa.id, benefitCategory: "OUTPATIENT", heldAmount: 8000, expiresAt: new Date(Date.now() + 7 * 86_400_000), status: "ACTIVE" },
    });

    const claim = await ClaimsService.createClaimWithPreauth(tenantId, pa.id);
    expect(claim.claimNumber).toMatch(/^CLM-/);
    expect(Number(claim.billedAmount)).toBe(8000);

    const freshPA = await prisma.preAuthorization.findUniqueOrThrow({ where: { id: pa.id }, select: { status: true, claimId: true, attachedAt: true } });
    expect(freshPA.status).toBe("ATTACHED");
    expect(freshPA.claimId).toBe(claim.id);
    expect(freshPA.attachedAt).not.toBeNull();

    const receipt = await prisma.claimIntakeReceipt.findFirstOrThrow({ where: { claimId: claim.id }, select: { channel: true, scopeKey: true, idempotencyKey: true } });
    expect(receipt.channel).toBe("PREAUTH_CONVERSION");
    expect(receipt.scopeKey).toBe(`preauth:${pa.id}`);
    expect(receipt.idempotencyKey).toBe(`${pa.id}:claim-create:v1`);
    const full = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id }, select: { source: true, claimLines: { select: { billedAmount: true } } } });
    expect(full.source).toBe("PREAUTH");
    expect(full.claimLines.length).toBe(1); // the legacy shell had ZERO lines

    // The hold is untouched by conversion — consumed only at decision time.
    const hold = await prisma.benefitHold.findUniqueOrThrow({ where: { preAuthId: pa.id }, select: { status: true, heldAmount: true } });
    expect(hold.status).toBe("ACTIVE");
    expect(Number(hold.heldAmount)).toBe(8000);
  });

  it("a repeated conversion returns the SAME claim (no error, no duplicate)", async () => {
    const pa = await makePA();
    const first = await ClaimsService.createClaimWithPreauth(tenantId, pa.id);
    const second = await ClaimsService.createClaimWithPreauth(tenantId, pa.id);
    expect(second.id).toBe(first.id);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: `${pa.id}:claim-create:v1` } } } })).toBe(1);
  });

  it("CONCURRENT conversions yield exactly ONE claim, both callers get it", async () => {
    const pa = await makePA();
    const [a, b] = await Promise.all([
      ClaimsService.createClaimWithPreauth(tenantId, pa.id),
      ClaimsService.createClaimWithPreauth(tenantId, pa.id),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: `${pa.id}:claim-create:v1` } } } })).toBe(1);
  });

  it("a non-approved PA fails safely with no claim", async () => {
    const pa = await makePA({ status: "SUBMITTED" });
    await expect(ClaimsService.createClaimWithPreauth(tenantId, pa.id)).rejects.toThrow(/Only approved/i);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: `${pa.id}:claim-create:v1` } } } })).toBe(0);
  });

  it("a PA at a now-suspended facility fails safely (scope), no claim", async () => {
    const pa = await makePA({ providerId: otherProviderId });
    await prisma.provider.update({ where: { id: otherProviderId }, data: { contractStatus: "SUSPENDED" } });
    await expect(ClaimsService.createClaimWithPreauth(tenantId, pa.id)).rejects.toThrow(/SUSPENDED|not permitted|cannot be submitted/i);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: `${pa.id}:claim-create:v1` } } } })).toBe(0);
    await prisma.provider.update({ where: { id: otherProviderId }, data: { contractStatus: "ACTIVE" } });
  });
});
