/**
 * Claims Autopilot F4.3 — coding/document/duplicate route fidelity REAL-DB proof.
 * mixed coded/uncoded ⇒ CODING; missing doc ⇒ DOCUMENTS_INCOMPLETE; fuzzy second
 * visit ⇒ DUPLICATE_REVIEW with safe refs; cleared duplicate ⇒ passes.
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

describe.skipIf(!URL_SET)("F4.3 integration — coding/document/duplicate fidelity", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, memberId: string, clientId: string | null, policyId: string, activeContractId: string | null;
  const receiptIds: string[] = [];
  const claimIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    const p = await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" } });
    providerId = p.id;
    const m = await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, include: { group: { select: { clientId: true } } } });
    memberId = m.id;
    clientId = m.group?.clientId ?? null;
    activeContractId = (await prisma.providerContract.findFirst({ where: { tenantId, providerId, status: "ACTIVE" }, select: { id: true } }))?.id ?? null;
    await prisma.autoAdjudicationPolicy.deleteMany({ where: { tenantId, maxAutoApproveAmount: 10_000_000 } });
    policyId = (await prisma.autoAdjudicationPolicy.create({
      data: { tenantId, clientId, mode: "LIVE", status: "APPROVED", maxAutoApproveAmount: 10_000_000, currency: "UGX", requireCleanFraud: true, requireAllLinesPriced: true, requireDocumentsComplete: true, requireEligibilityClear: true, requirePreauthWhenNeeded: true, allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"], isActive: true, effectiveFrom: new Date("2020-01-01"), version: 1 },
    })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: claimIds } } } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.document.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.claimFraudAlert.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.adjudicationLog.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claimLine.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    await prisma.autoAdjudicationPolicy.delete({ where: { id: policyId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function createClaim(opts: { serviceFrom: string; uncodedSecondLine?: boolean; amount?: string }): Promise<{ claimId: string; runId: string }> {
    seq += 1;
    const amt = opts.amount ?? "1500.00";
    const lines: Record<string, unknown>[] = [{ serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: amt, billedAmount: amt }];
    if (opts.uncodedSecondLine) lines.push({ serviceCategory: "OTHER", description: "uncoded sundry", quantity: 1, unitCost: "500.00", billedAmount: "500.00" });
    const raw = { schemaVersion: "1", idempotencyKey: `f43-${Date.now()}-${seq}`, member: { memberId }, provider: { providerId }, encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: opts.serviceFrom }, diagnoses: [{ code: "J06.9", isPrimary: true }], lines, currency: "UGX" };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture: " + JSON.stringify(parsed.error.issues));
    const n = normalizeSubmission(parsed.data);
    const ctx: IntakeContext = { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f43", actorId: "f43", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: ctx.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `c-${seq}` });
    receiptIds.push(res.receipt.id);
    const r = await persistClaim(prisma, { context: ctx, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect });
    if (r.kind !== "CREATED") throw new Error("expected CREATED");
    claimIds.push(r.claimId);
    return { claimId: r.claimId, runId: r.runId };
  }
  const stageState = async (runId: string, stage: string) => (await prisma.claimProcessingStage.findFirst({ where: { runId, stage: stage as never }, select: { state: true } }))?.state;

  it("a mixed coded/uncoded claim routes at CODING (PRICING_INCOMPLETE)", async () => {
    const { claimId, runId } = await createClaim({ serviceFrom: "2026-01-05", uncodedSecondLine: true });
    const r = await evaluateClaimStaged(prisma, tenantId, claimId, runId);
    expect(r.disposition).toBe("ROUTE");
    expect(r.routeCode).toBe("PRICING_INCOMPLETE");
    expect(r.routeStage).toBe("CODING");
  });

  it("a missing mandatory document routes DOCUMENTS_INCOMPLETE; supplying it clears that stage", async () => {
    if (!activeContractId) return; // provider has no active contract in this dataset — nothing to enforce
    const rule = await prisma.documentationRule.create({ data: { tenantId, contractId: activeContractId, documentType: "INVOICE", mandatory: true, isActive: true, effectiveFrom: new Date("2020-01-01") } });
    try {
      const a = await createClaim({ serviceFrom: "2026-02-10" });
      const r1 = await evaluateClaimStaged(prisma, tenantId, a.claimId, a.runId);
      expect(r1.routeCode).toBe("DOCUMENTS_INCOMPLETE");
      expect(r1.routeStage).toBe("DOCUMENTS");

      // now supply the required document
      await prisma.document.create({ data: { claimId: a.claimId, category: "INVOICE", fileName: "inv.pdf", fileUrl: "s3://x" } });
      const b = await createClaim({ serviceFrom: "2026-02-11" });
      // attach the doc to b too
      await prisma.document.create({ data: { claimId: b.claimId, category: "INVOICE", fileName: "inv.pdf", fileUrl: "s3://x" } });
      const r2 = await evaluateClaimStaged(prisma, tenantId, b.claimId, b.runId);
      expect(await stageState(b.runId, "DOCUMENTS")).toBe("PASSED");
      expect(r2.routeCode).not.toBe("DOCUMENTS_INCOMPLETE");
    } finally {
      await prisma.documentationRule.delete({ where: { id: rule.id } });
    }
  });

  it("a fuzzy second visit routes DUPLICATE_REVIEW with safe candidate refs; clearing lets it pass", async () => {
    // Run-unique future dates so no leftover claim can fall in this test's window.
    const baseTime = new Date("2027-06-01").getTime() + (Date.now() % (200 * 86_400_000));
    const d1 = new Date(baseTime).toISOString().slice(0, 10);
    const d2 = new Date(baseTime + 2 * 86_400_000).toISOString().slice(0, 10);
    const first = await createClaim({ serviceFrom: d1, amount: "1500.00" });
    const firstClaim = await prisma.claim.findUniqueOrThrow({ where: { id: first.claimId }, select: { claimNumber: true } });
    const second = await createClaim({ serviceFrom: d2, amount: "1500.00" }); // 2 days later
    const r = await evaluateClaimStaged(prisma, tenantId, second.claimId, second.runId);
    expect(r.routeCode).toBe("DUPLICATE_REVIEW");
    expect(await stageState(second.runId, "DUPLICATE")).toBe("ROUTED");
    // safe candidate ref = the first claim's number (no PII)
    const dupStage = await prisma.claimProcessingStage.findFirstOrThrow({ where: { runId: second.runId, stage: "DUPLICATE" }, select: { result: true } });
    expect(JSON.stringify(dupStage.result)).toContain(firstClaim.claimNumber);

    // cleared ⇒ DUPLICATE passes (does not route there)
    const r2 = await evaluateClaimStaged(prisma, tenantId, second.claimId, undefined, { duplicateCleared: true });
    expect(r2.routeCode).not.toBe("DUPLICATE_REVIEW");
  });
});
