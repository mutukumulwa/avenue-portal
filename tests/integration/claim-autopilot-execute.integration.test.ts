/**
 * Claims Autopilot F4.5g — atomic automatic execution REAL-DB proof (STOP condition).
 * Happy execute + benefit conservation; atomic rollback (no partial line/claim/money);
 * stale plan; fraud-at-commit; two concurrent ⇒ one.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClaimDecisionService } from "@/server/services/claim-decision.service";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { persistClaim } from "@/server/services/claim-intake/persist";
import type { IntakeContext } from "@/server/services/claim-intake/context";
import type { AutoDecisionPlan } from "@/server/services/claim-autopilot/plan";
import { getSystemActorId } from "@/server/services/system-actor.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.5g integration — atomic automatic execution", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, memberId: string, clientId: string | null, systemActorId: string;
  let availStart = 0;
  const receiptIds: string[] = [];
  const claimIds: string[] = [];
  const executedClaimIds: string[] = [];
  let seq = 0;

  const avail = async () => (await BenefitUsageService.computeAvailability(prisma, { memberId, benefitCategory: "OUTPATIENT", requestedAmount: 1, serviceDate: new Date("2026-06-01") }))?.payableCeiling ?? 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" } })).id;
    systemActorId = await getSystemActorId(tenantId);
    // pick a member with OUTPATIENT benefit headroom
    const members = await prisma.member.findMany({ where: { tenantId, status: "ACTIVE" }, include: { group: { select: { clientId: true } } }, take: 40 });
    for (const m of members) {
      memberId = m.id; clientId = m.group?.clientId ?? null;
      const a = await avail();
      if (a >= 3000) { availStart = a; break; }
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of executedClaimIds) await ClaimDecisionService.voidClaim(tenantId, id, { actorId: systemActorId, reason: "F4.5g test cleanup" }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.$disconnect();
  });

  async function createClaim(amount: number): Promise<{ claimId: string; lineId: string; revision: number }> {
    seq += 1;
    const a = amount.toFixed(2);
    const raw = { schemaVersion: "1", idempotencyKey: `f45-${Date.now()}-${seq}`, member: { memberId }, provider: { providerId }, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines: [{ serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: a, billedAmount: a }], currency: "UGX" };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture");
    const n = normalizeSubmission(parsed.data);
    const ctx: IntakeContext = { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f45", actorId: "f45", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: ctx.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `c-${seq}` });
    receiptIds.push(res.receipt.id);
    const r = await persistClaim(prisma, { context: ctx, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect });
    if (r.kind !== "CREATED") throw new Error("expected CREATED");
    claimIds.push(r.claimId);
    const line = await prisma.claimLine.findFirstOrThrow({ where: { claimId: r.claimId }, select: { id: true } });
    const c = await prisma.claim.findUniqueOrThrow({ where: { id: r.claimId }, select: { claimRevision: true } });
    return { claimId: r.claimId, lineId: line.id, revision: c.claimRevision };
  }

  function plan(claimId: string, lineId: string, revision: number, amount: number): AutoDecisionPlan {
    const a = amount.toFixed(2);
    const now = new Date().toISOString();
    return { workflowVersion: "v1", claimId, claimRevision: revision, evaluatedAt: now, mode: "LIVE", policyId: "test-live", policyVersion: 1, disposition: "APPROVE", action: "APPROVED", totalBilled: a, totalPayable: a, currency: "UGX", reasons: [], lines: [{ claimLineId: lineId, decision: "APPROVED", billedAmount: a, contractedAmount: a, payableAmount: a, shortfallAmount: "0.00", disallowedAmount: "0.00", memberLiability: "0.00", payerLiability: a, providerWriteOff: "0.00", reasonCode: "APPROVED", resubmissionAllowed: false }], snapshots: { claimUpdatedAt: now, contractVersionIds: [], eligibilityAsOf: now } };
  }

  it("executes atomically: claim APPROVED, line stamped, benefit consumed exactly once", async () => {
    expect(availStart).toBeGreaterThanOrEqual(3000);
    const { claimId, lineId, revision } = await createClaim(300);
    const before = await avail();
    const r = await ClaimDecisionService.executeAutoPlan(tenantId, claimId, plan(claimId, lineId, revision, 300), systemActorId);
    executedClaimIds.push(claimId);
    expect(r.executed).toBe(true);
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true, approvedAmount: true, claimLines: { select: { adjudicationDecision: true, approvedAmount: true } } } });
    expect(claim.status).toBe("APPROVED");
    expect(Number(claim.approvedAmount)).toBe(300);
    expect(claim.claimLines[0].adjudicationDecision).toBe("APPROVED");
    expect(Number(claim.claimLines[0].approvedAmount)).toBe(300);
    const after = await avail();
    expect(before - after).toBeCloseTo(300, 0); // benefit consumed once
  });

  it("rolls back fully when the money transaction fails — no partial line/claim/money", async () => {
    const { claimId, lineId, revision } = await createClaim(300);
    const over = availStart + 1_000_000; // exceeds benefit ⇒ decide's benefit gate throws inside the tx
    await expect(ClaimDecisionService.executeAutoPlan(tenantId, claimId, plan(claimId, lineId, revision, over), systemActorId)).rejects.toBeTruthy();
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true, approvedAmount: true, claimLines: { select: { adjudicationDecision: true } } } });
    expect(claim.status).toBe("RECEIVED"); // untouched
    expect(Number(claim.approvedAmount)).toBe(0);
    expect(claim.claimLines[0].adjudicationDecision).toBeNull(); // NO partial line stamp
  });

  it("rejects a stale plan (revision changed) with no writes", async () => {
    const { claimId, lineId, revision } = await createClaim(300);
    await prisma.claim.update({ where: { id: claimId }, data: { claimRevision: revision + 1 } }); // claim edited after plan
    const r = await ClaimDecisionService.executeAutoPlan(tenantId, claimId, plan(claimId, lineId, revision, 300), systemActorId);
    expect(r).toMatchObject({ executed: false, stale: true });
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true } })).status).toBe("RECEIVED");
  });

  it("blocks execution when a fraud alert appears before commit", async () => {
    const { claimId, lineId, revision } = await createClaim(300);
    const alert = await prisma.claimFraudAlert.create({ data: { tenantId, claimId, rule: "F45-TEST", score: 90, resolved: false } });
    try {
      const r = await ClaimDecisionService.executeAutoPlan(tenantId, claimId, plan(claimId, lineId, revision, 300), systemActorId);
      expect(r).toMatchObject({ executed: false, stale: true });
      expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true } })).status).toBe("RECEIVED");
    } finally {
      await prisma.claimFraudAlert.delete({ where: { id: alert.id } });
    }
  });

  it("two concurrent automatic decisions ⇒ exactly one; benefit consumed once", async () => {
    const { claimId, lineId, revision } = await createClaim(300);
    const before = await avail();
    const p = plan(claimId, lineId, revision, 300);
    const [a, b] = await Promise.all([
      ClaimDecisionService.executeAutoPlan(tenantId, claimId, p, systemActorId).catch(() => ({ executed: false })),
      ClaimDecisionService.executeAutoPlan(tenantId, claimId, p, systemActorId).catch(() => ({ executed: false })),
    ]);
    executedClaimIds.push(claimId);
    expect([a.executed, b.executed].filter(Boolean)).toHaveLength(1); // exactly one executed
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true } })).status).toBe("APPROVED");
    const after = await avail();
    expect(before - after).toBeCloseTo(300, 0); // NOT 600 — benefit consumed once
  });
});
