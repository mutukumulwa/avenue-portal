/**
 * Claims Autopilot F4.4 — buildAutoDecisionPlan REAL-DB proof.
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildAutoDecisionPlan, validatePlanConservation } from "@/server/services/claim-autopilot/plan";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { persistClaim } from "@/server/services/claim-intake/persist";
import type { IntakeContext } from "@/server/services/claim-intake/context";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.4 integration — AutoDecisionPlan build", () => {
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
    policyId = (await prisma.autoAdjudicationPolicy.create({ data: { tenantId, clientId, mode: "LIVE", status: "APPROVED", maxAutoApproveAmount: 10_000_000, currency: "UGX", requireCleanFraud: true, requireAllLinesPriced: true, requireDocumentsComplete: true, requireEligibilityClear: true, requirePreauthWhenNeeded: true, allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"], isActive: true, effectiveFrom: new Date("2020-01-01"), version: 1 } })).id;
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

  async function createClaim(uncoded: boolean, serviceFrom: string): Promise<string> {
    seq += 1;
    const lines: Record<string, unknown>[] = [{ serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" }];
    if (uncoded) lines.push({ serviceCategory: "OTHER", description: "uncoded", quantity: 1, unitCost: "500.00", billedAmount: "500.00" });
    const raw = { schemaVersion: "1", idempotencyKey: `f44-${Date.now()}-${seq}`, member: { memberId }, provider: { providerId }, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines, currency: "UGX" };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture");
    const n = normalizeSubmission(parsed.data);
    const ctx: IntakeContext = { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f44", actorId: "f44", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: ctx.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `c-${seq}` });
    receiptIds.push(res.receipt.id);
    const r = await persistClaim(prisma, { context: ctx, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect });
    if (r.kind !== "CREATED") throw new Error("expected CREATED");
    claimIds.push(r.claimId);
    return r.claimId;
  }

  it("a routed claim yields a ROUTE plan with catalog reasons, zero payable, and conserves", async () => {
    const claimId = await createClaim(true, "2028-01-05"); // uncoded ⇒ routes at CODING
    const plan = await buildAutoDecisionPlan(prisma, tenantId, claimId);
    expect(plan.disposition).toBe("ROUTE");
    expect(plan.routeCode).toBe("PRICING_INCOMPLETE");
    expect(plan.totalPayable).toBe("0.00");
    expect(plan.reasons).toHaveLength(1);
    expect(plan.reasons[0].providerMessage.length).toBeGreaterThan(0);
    expect(plan.reasons[0].memberMessage).toBeTruthy();
    expect(plan.reasons[0].remedy).toBeTruthy();
    expect(plan.lines.every((l) => l.decision === "PENDED" && l.reasonCode.length > 0)).toBe(true);
    expect(validatePlanConservation(plan)).toEqual({ valid: true, errors: [] });
  });

  it("any plan (whatever the real disposition) conserves and JSON-serializes", async () => {
    const claimId = await createClaim(false, "2028-02-05");
    const plan = await buildAutoDecisionPlan(prisma, tenantId, claimId);
    expect(validatePlanConservation(plan)).toEqual({ valid: true, errors: [] });
    expect(Number(plan.totalBilled)).toBe(1500);
    // serializable, money as strings
    const round = JSON.parse(JSON.stringify(plan));
    expect(round.claimId).toBe(claimId);
    expect(typeof round.totalPayable).toBe("string");
  });
});
