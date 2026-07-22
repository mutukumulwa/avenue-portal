/**
 * Claims Autopilot F4.7 — circuit breaker REAL-DB proof.
 * open/close + audit; client-scope; blocks live execution + resume on close;
 * commit-time gate; auto-trip.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openBreaker, closeBreaker, isBreakerOpen, tripBreaker, getBreakerState } from "@/server/services/claim-autopilot/circuit-breaker";
import { ClaimDecisionService, StalePlanError } from "@/server/services/claim-decision.service";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { persistClaim } from "@/server/services/claim-intake/persist";
import type { IntakeContext } from "@/server/services/claim-intake/context";
import type { AutoDecisionPlan } from "@/server/services/claim-autopilot/plan";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.7 integration — circuit breaker", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, memberId: string, clientId: string | null, systemActorId: string;
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
    const members = await prisma.member.findMany({ where: { tenantId, status: "ACTIVE" }, include: { group: { select: { clientId: true } } }, take: 40 });
    for (const m of members) { memberId = m.id; clientId = m.group?.clientId ?? null; if ((await avail()) >= 3000) break; }
    await prisma.claimAutopilotBreaker.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const id of executedClaimIds) await ClaimDecisionService.voidClaim(tenantId, id, { actorId: systemActorId, reason: "F4.7 cleanup" }).catch(() => undefined);
    await prisma.claimAutopilotBreaker.deleteMany({ where: { tenantId } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.$disconnect();
  });

  async function createClaim(amount: number): Promise<{ claimId: string; lineId: string; revision: number }> {
    seq += 1;
    const a = amount.toFixed(2);
    const raw = { schemaVersion: "1", idempotencyKey: `f47-${Date.now()}-${seq}`, member: { memberId }, provider: { providerId }, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines: [{ serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: a, billedAmount: a }], currency: "UGX" };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture");
    const n = normalizeSubmission(parsed.data);
    const ctx: IntakeContext = { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f47", actorId: "f47", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: ctx.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `c-${seq}` });
    receiptIds.push(res.receipt.id);
    const r = await persistClaim(prisma, { context: ctx, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect });
    if (r.kind !== "CREATED") throw new Error("expected CREATED");
    claimIds.push(r.claimId);
    const line = await prisma.claimLine.findFirstOrThrow({ where: { claimId: r.claimId }, select: { id: true } });
    return { claimId: r.claimId, lineId: line.id, revision: (await prisma.claim.findUniqueOrThrow({ where: { id: r.claimId }, select: { claimRevision: true } })).claimRevision };
  }
  const plan = (claimId: string, lineId: string, revision: number, amount: number): AutoDecisionPlan => {
    const a = amount.toFixed(2); const now = new Date().toISOString();
    return { workflowVersion: "v1", claimId, claimRevision: revision, evaluatedAt: now, mode: "LIVE", policyId: "test", policyVersion: 1, disposition: "APPROVE", action: "APPROVED", totalBilled: a, totalPayable: a, currency: "UGX", reasons: [], lines: [{ claimLineId: lineId, decision: "APPROVED", billedAmount: a, contractedAmount: a, payableAmount: a, shortfallAmount: "0.00", disallowedAmount: "0.00", memberLiability: "0.00", payerLiability: a, providerWriteOff: "0.00", reasonCode: "APPROVED", resubmissionAllowed: false }], snapshots: { claimUpdatedAt: now, contractVersionIds: [], eligibilityAsOf: now } };
  };

  it("manual open/close is immediate, reason-required and audited", async () => {
    await openBreaker(tenantId, { actorId: systemActorId, reason: "ops incident" });
    expect(await isBreakerOpen(prisma, tenantId, clientId)).toBe(true);
    expect((await getBreakerState(tenantId))?.isOpen).toBe(true);
    expect(await prisma.auditLog.findFirst({ where: { tenantId, action: "AUTO_ADJ:CIRCUIT_BREAKER_OPENED" } })).toBeTruthy();
    await expect(closeBreaker(tenantId, { actorId: systemActorId, reason: "" })).rejects.toThrow(/reason/i);
    await closeBreaker(tenantId, { actorId: systemActorId, reason: "resolved" });
    expect(await isBreakerOpen(prisma, tenantId, clientId)).toBe(false);
    expect(await prisma.auditLog.findFirst({ where: { tenantId, action: "AUTO_ADJ:CIRCUIT_BREAKER_CLOSED" } })).toBeTruthy();
  });

  it("a client-specific breaker only blocks that client", async () => {
    await openBreaker(tenantId, { clientId: "other-client", actorId: systemActorId, reason: "client incident" });
    expect(await isBreakerOpen(prisma, tenantId, "other-client")).toBe(true);
    expect(await isBreakerOpen(prisma, tenantId, clientId)).toBe(false); // a different client is unaffected
    expect(await isBreakerOpen(prisma, tenantId, null)).toBe(false); // no tenant-wide breaker
    await closeBreaker(tenantId, { clientId: "other-client", actorId: systemActorId, reason: "done" });
  });

  it("an open breaker blocks live execution (no money); closing it resumes", async () => {
    const { claimId, lineId, revision } = await createClaim(300);
    await openBreaker(tenantId, { actorId: systemActorId, reason: "freeze" });
    const blocked = await ClaimDecisionService.executeAutoPlan(tenantId, claimId, plan(claimId, lineId, revision, 300), systemActorId);
    expect(blocked).toMatchObject({ executed: false, breakerOpen: true });
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true } })).status).toBe("RECEIVED");

    await closeBreaker(tenantId, { actorId: systemActorId, reason: "unfreeze" });
    const ok = await ClaimDecisionService.executeAutoPlan(tenantId, claimId, plan(claimId, lineId, revision, 300), systemActorId);
    executedClaimIds.push(claimId);
    expect(ok.executed).toBe(true);
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true } })).status).toBe("APPROVED");
  });

  it("the commit-time gate blocks a decision when the breaker check trips inside the tx", async () => {
    const { claimId } = await createClaim(300);
    await expect(
      ClaimDecisionService.decide(tenantId, claimId, { action: "APPROVED", approvedAmount: 300, reviewerId: systemActorId, systemDecision: true, expectedRevision: 1, breakerCheck: async () => true }),
    ).rejects.toBeInstanceOf(StalePlanError);
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, select: { status: true } })).status).toBe("RECEIVED");
  });

  it("tripBreaker opens automatically and is marked auto-triggered", async () => {
    await tripBreaker(tenantId, "reconciliation invariant failed");
    const state = await getBreakerState(tenantId);
    expect(state?.isOpen).toBe(true);
    expect(state?.autoTriggered).toBe(true);
    await closeBreaker(tenantId, { actorId: systemActorId, reason: "incident resolved" });
  });
});
