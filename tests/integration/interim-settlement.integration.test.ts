/**
 * IPL-001 — interim / periodic inpatient settlement, REAL-DB proof (UAT Option A).
 *
 * Drives an OPEN inpatient admission through TWO Friday interim slices + a final
 * residual close, adjudicates and settles each against a real Postgres, and
 * asserts the seven-ledger model holds (plan §3/§11/§21):
 *   SET-01  slice cut on an open case; case stays open; entries frozen.
 *   SET-02  second slice bills only NEW unbilled lines (identity, not guess).
 *   SET-03  final close bills only the residual; every shilling billed once.
 *   §11.6   benefit `used` rises at DECISION, once per slice; settlement does not
 *           consume benefit a second time.
 *   §11.7-8 an interim slice flows through the ordinary settlement pipeline and
 *           is paid exactly once.
 *
 * OPT-IN — runs only when BOTH are set (so it can never touch a real/prod DB):
 *   INTERIM_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL    = the same URL (services read @/lib/prisma at import)
 *
 * Driver (on the disposable Lima UAT VM):
 *   cd ~/avenue-portal && npx prisma db push && npx prisma generate
 *   INTERIM_TEST_DB=postgresql://aicare:uatlocal2026@127.0.0.1:5432/aicare_uat \
 *   DATABASE_URL=$INTERIM_TEST_DB \
 *   npx vitest run tests/integration/interim-settlement.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.INTERIM_TEST_DB && process.env.DATABASE_URL === process.env.INTERIM_TEST_DB;

describe.skipIf(!URL_SET)("IPL-001 integration — interim inpatient settlement conserves the seven ledgers", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];
  let CaseService: (typeof import("@/server/services/case.service"))["CaseService"];
  let Decisions: (typeof import("@/server/services/claim-decision.service"))["ClaimDecisionService"];
  let adjudication: (typeof import("@/server/services/claim-adjudication.service"))["claimAdjudicationService"];
  let BenefitUsageService: (typeof import("@/server/services/benefit-usage.service"))["BenefitUsageService"];
  let preauthAdj: (typeof import("@/server/services/preauth-adjudication.service"))["preauthAdjudicationService"];

  let tenantId: string;
  let memberId: string;
  let providerId: string;
  let reviewerId: string;
  let caseId: string;
  let configId: string;
  const createdClaimIds: string[] = [];
  const ENTRY = 8_000; // small, so any real INPATIENT limit comfortably covers 5 of them

  // admission + entry dates must be on/before the (real) server clock and inside
  // the episode — pin them a couple of weeks back from "now" on the VM.
  const d = (offsetDays: number) => {
    const base = new Date();
    base.setUTCHours(0, 0, 0, 0);
    base.setUTCDate(base.getUTCDate() - offsetDays);
    return base;
  };
  const admission = d(20);
  // week 1: entries at -18, -16 ; cut-off -15
  // week 2: entries at -12, -10 ; cut-off -9
  // residual: entry at -6 ; final close
  const w1a = d(18), w1b = d(16), cut1 = d(15);
  const w2a = d(12), w2b = d(10), cut2 = d(9);
  const resid = d(6);

  // IPL-RV-01 fix: SUM usage across ALL periods for the member+config. The old
  // `findFirst orderBy periodStart desc` read a single period row, so when a
  // decision booked into a period different from the latest existing row the
  // before/after reads hit DIFFERENT rows — the reported "anomalous −834k on a
  // no-op approval". A sum over every period is immune to which period a write
  // lands in, so the delta is exactly what the decision booked.
  const usedInpatient = async () => {
    const cfg = await BenefitUsageService.resolveConfig(prisma, memberId, "INPATIENT");
    if (!cfg) return 0;
    const agg = await prisma.benefitUsage.aggregate({
      where: { memberId, benefitConfigId: cfg.configId },
      _sum: { amountUsed: true },
    });
    return Number(agg._sum.amountUsed ?? 0);
  };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    CaseService = (await import("@/server/services/case.service")).CaseService;
    Decisions = (await import("@/server/services/claim-decision.service")).ClaimDecisionService;
    adjudication = (await import("@/server/services/claim-adjudication.service")).claimAdjudicationService;
    BenefitUsageService = (await import("@/server/services/benefit-usage.service")).BenefitUsageService;
    preauthAdj = (await import("@/server/services/preauth-adjudication.service")).preauthAdjudicationService;

    // A member with an INPATIENT benefit config and plenty of headroom.
    const member = await prisma.member.findFirst({
      where: {
        status: "ACTIVE",
        relationship: "PRINCIPAL",
        packageVersion: { benefits: { some: { category: "INPATIENT" } } },
      },
      select: { id: true, tenantId: true },
    });
    if (!member) throw new Error("No seeded ACTIVE principal with an INPATIENT benefit — cannot run.");
    memberId = member.id;
    tenantId = member.tenantId;

    // IPL-RV-01 hermeticity: capture the INPATIENT config and ZERO this member's
    // INPATIENT usage across all periods, so the suite runs on a clean ledger
    // regardless of what the seed pre-loaded (the old suite depended on ambient
    // usage/contract state and produced non-deterministic deltas). The opt-in
    // guard guarantees this is a throwaway DB.
    const cfg = await BenefitUsageService.resolveConfig(prisma, memberId, "INPATIENT");
    if (!cfg) throw new Error("Member has no INPATIENT benefit config — cannot run.");
    configId = cfg.configId;
    await prisma.benefitUsage.deleteMany({ where: { memberId, benefitConfigId: configId } });

    // Prefer a provider with NO active ProviderContract, so the slice adjudicates
    // on the deterministic "no ceiling — reviewer judgement" path (assessCeiling
    // → null), AND with NO existing settlement batch / approved-unsettled claim,
    // so §11.7-8's batch contains only our slices.
    const providers = await prisma.provider.findMany({
      where: { tenantId, contractStatus: { notIn: ["EXPIRED", "SUSPENDED"] } },
      select: { id: true },
    });
    let fallback: string | undefined;
    for (const p of providers) {
      const [batches, pending, contracts] = await Promise.all([
        prisma.providerSettlementBatch.count({ where: { tenantId, providerId: p.id } }),
        prisma.claim.count({
          where: { tenantId, providerId: p.id, status: { in: ["APPROVED", "PARTIALLY_APPROVED"] }, settlementBatchId: null },
        }),
        prisma.providerContract.count({ where: { providerId: p.id } }).catch(() => 0),
      ]);
      if (batches === 0 && pending === 0) {
        fallback ??= p.id;
        if (contracts === 0) { providerId = p.id; break; } // ideal: no contract
      }
    }
    if (!providerId) providerId = fallback ?? providers[0]?.id;
    if (!providerId) throw new Error("No usable provider available — cannot run.");

    const reviewer = await prisma.user.findFirst({ where: { tenantId }, select: { id: true } });
    reviewerId = reviewer!.id;
  });

  afterAll(async () => {
    // Best-effort teardown of the artefacts this test created (disposable VM DB).
    try {
      await prisma.adjudicationLog.deleteMany({ where: { claimId: { in: createdClaimIds } } });
      await prisma.claimLine.deleteMany({ where: { claimId: { in: createdClaimIds } } });
      await prisma.claimFraudAlert.deleteMany({ where: { claimId: { in: createdClaimIds } } });
      await prisma.caseServiceEntry.updateMany({ where: { caseId }, data: { billedInClaimId: null } });
      await prisma.preAuthorization.updateMany({ where: { claimId: { in: createdClaimIds } }, data: { claimId: null } });
      const batchIds = (await prisma.claim.findMany({ where: { id: { in: createdClaimIds }, settlementBatchId: { not: null } }, select: { settlementBatchId: true } })).map((c) => c.settlementBatchId!).filter(Boolean);
      await prisma.claim.updateMany({ where: { id: { in: createdClaimIds } }, data: { settlementBatchId: null } });
      await prisma.paymentVoucher.deleteMany({ where: { id: { in: batchIds } } }).catch(() => {});
      await prisma.providerSettlementBatch.deleteMany({ where: { id: { in: batchIds } } }).catch(() => {});
      await prisma.caseServiceEntry.deleteMany({ where: { caseId } });
      await prisma.claim.deleteMany({ where: { id: { in: createdClaimIds } } });
      await prisma.clinicalCase.deleteMany({ where: { id: caseId } });
    } catch {
      /* leave artefacts — the VM DB is disposable */
    }
  });

  const addEntry = (date: Date, desc: string, code: string | null = null) =>
    CaseService.addServiceEntry({
      tenantId, caseId, entryDate: date, category: "OTHER",
      serviceCode: code, description: desc, quantity: 1, unitAmount: ENTRY, enteredById: reviewerId,
    });

  const approve = (claimId: string, amount: number) =>
    Decisions.decide(tenantId, claimId, { action: "APPROVED", approvedAmount: amount, reviewerId, matrixSatisfied: true });

  it("SET-01: cuts an interim slice from an open admission; the case stays open and entries freeze", async () => {
    const c = await CaseService.openCase({
      tenantId, memberId, providerId, caseType: "INPATIENT_ADMISSION",
      benefitCategory: "INPATIENT", admissionDate: admission, openedById: reviewerId,
      // NB: no attendingDoctor — avoids the practitioner-credential adjudication gate.
    });
    caseId = c.id;
    await addEntry(w1a, "Ward bed day 1");
    await addEntry(w1b, "IV fluids");

    const slice1 = await CaseService.cutInterimSlice({ tenantId, caseId, cutoffDate: cut1, cutById: reviewerId });
    createdClaimIds.push(slice1.id);

    expect(slice1.isInterimBill).toBe(true);
    expect(slice1.caseSliceSeq).toBe(1);
    expect(Number(slice1.billedAmount)).toBe(2 * ENTRY);
    expect(slice1.invoiceNumber).toBe(`${c.caseNumber}-S1`);

    const caseAfter = await prisma.clinicalCase.findUnique({ where: { id: caseId }, select: { status: true } });
    expect(caseAfter?.status).toBe("OPEN"); // still open — keeps accruing

    const frozen = await prisma.caseServiceEntry.findMany({ where: { caseId }, select: { billedInClaimId: true } });
    expect(frozen.filter((e) => e.billedInClaimId === slice1.id)).toHaveLength(2); // both week-1 lines frozen onto slice 1
    const lines = await prisma.claimLine.count({ where: { claimId: slice1.id } });
    expect(lines).toBe(2);
  });

  it("§11.6: adjudicating the slice raises benefit `used` by the approved amount (once)", async () => {
    const before = await usedInpatient();
    const slice1 = await prisma.claim.findFirst({ where: { caseId, caseSliceSeq: 1 }, select: { id: true, billedAmount: true } });
    // Precondition (guards against seed drift): with a no-contract provider the
    // slice adjudicates on the deterministic reviewer-judgement path — no ceiling.
    const ceil = await Decisions.assessCeiling(tenantId, slice1!.id);
    expect(ceil.ceiling).toBeNull();
    await approve(slice1!.id, Number(slice1!.billedAmount));
    const after = await usedInpatient();
    expect(after - before).toBeCloseTo(2 * ENTRY, 2);
    const decided = await prisma.claim.findUnique({ where: { id: slice1!.id }, select: { status: true, approvedAmount: true } });
    expect(decided?.status).toBe("APPROVED");
    expect(Number(decided?.approvedAmount)).toBe(2 * ENTRY);
  });

  it("SET-02: a second slice bills ONLY the new unbilled lines; used rises again without re-counting slice 1", async () => {
    await addEntry(w2a, "Ward bed day 8");
    await addEntry(w2b, "Physiotherapy");

    const usedBefore = await usedInpatient();
    const slice2 = await CaseService.cutInterimSlice({ tenantId, caseId, cutoffDate: cut2, cutById: reviewerId });
    createdClaimIds.push(slice2.id);
    expect(slice2.caseSliceSeq).toBe(2);
    expect(Number(slice2.billedAmount)).toBe(2 * ENTRY); // only the two NEW lines, not the whole 4-line accrual

    const slice2Lines = await prisma.claimLine.findMany({ where: { claimId: slice2.id }, select: { description: true } });
    expect(slice2Lines.map((l) => l.description).sort()).toEqual(["Physiotherapy", "Ward bed day 8"]);

    await approve(slice2.id, Number(slice2.billedAmount));
    const usedAfter = await usedInpatient();
    expect(usedAfter - usedBefore).toBeCloseTo(2 * ENTRY, 2); // only slice 2's amount, slice 1 not double-counted
  });

  it("SET-03: final close bills only the residual line; every non-void entry is billed exactly once", async () => {
    await addEntry(resid, "Discharge meds");

    const finalClaim = await CaseService.closeAndFile(tenantId, caseId, reviewerId);
    expect(finalClaim).not.toBeNull();
    createdClaimIds.push(finalClaim!.id);
    expect(finalClaim!.isInterimBill).toBe(false);
    expect(finalClaim!.caseSliceSeq).toBe(3);
    expect(Number(finalClaim!.billedAmount)).toBe(ENTRY); // only the residual, slices not re-billed

    const caseAfter = await prisma.clinicalCase.findUnique({ where: { id: caseId }, select: { status: true } });
    expect(caseAfter?.status).toBe("CLOSED_FILED");

    // Conservation: every non-voided entry has exactly one billing owner, and the
    // sum billed across all case claims equals the sum of the entries (billed once).
    const entries = await prisma.caseServiceEntry.findMany({ where: { caseId, voided: false }, select: { totalAmount: true, billedInClaimId: true } });
    expect(entries).toHaveLength(5);
    expect(entries.every((e) => !!e.billedInClaimId)).toBe(true); // none unbilled
    const entriesTotal = entries.reduce((s, e) => s + Number(e.totalAmount), 0);
    const claims = await prisma.claim.findMany({ where: { caseId }, select: { billedAmount: true } });
    const claimsTotal = claims.reduce((s, c) => s + Number(c.billedAmount), 0);
    expect(claimsTotal).toBe(entriesTotal); // Σ billed across slices+final == Σ entries (no double bill, no leak)
    expect(entriesTotal).toBe(5 * ENTRY);
  });

  it("reconciliation read-model reports the seven ledgers coherently", async () => {
    const finalClaim = await prisma.claim.findFirst({ where: { caseId, isInterimBill: false }, select: { id: true, billedAmount: true } });
    await approve(finalClaim!.id, Number(finalClaim!.billedAmount)); // decide the final claim too

    const r = await CaseService.getCaseReconciliation(tenantId, caseId);
    expect(r.billedToDate).toBe(5 * ENTRY);        // B
    expect(r.billedOnSlices).toBe(5 * ENTRY);       // all frozen after close
    expect(r.unbilledResidual).toBe(0);
    expect(r.approvedToDate).toBe(5 * ENTRY);       // U — 3 claims all approved
    expect(r.slices).toHaveLength(3);               // 2 interim + 1 final
    expect(r.sliceCount).toBe(2);                   // interim slices only
  });

  it("§11.7-8: an interim slice settles through the ordinary pipeline exactly once; benefit is not re-consumed", async () => {
    const now = new Date();
    const usedBeforeSettle = await usedInpatient();

    const batch = await adjudication.createSettlementBatch(tenantId, providerId, now.getUTCMonth() + 1, now.getUTCFullYear(), reviewerId);
    // a different checker approves, then mark paid
    const checker = await prisma.user.findFirst({ where: { tenantId, id: { not: reviewerId } }, select: { id: true } });
    const checkerId = checker?.id ?? reviewerId;
    await adjudication.approveSettlementBatch(batch.id, tenantId, checkerId);
    await adjudication.markSettlementBatchPaid(batch.id, tenantId, checkerId);

    const settledBatch = await prisma.providerSettlementBatch.findUnique({ where: { id: batch.id }, select: { status: true } });
    expect(settledBatch?.status).toBe("SETTLED");

    // Our slices are in the batch and paid exactly once.
    const paid = await prisma.claim.findMany({
      where: { id: { in: createdClaimIds }, settlementBatchId: batch.id },
      select: { approvedAmount: true, paidAmount: true, status: true },
    });
    expect(paid.length).toBeGreaterThanOrEqual(3);
    for (const c of paid) {
      expect(Number(c.paidAmount)).toBeCloseTo(Number(c.approvedAmount), 2);
    }

    // Settlement did NOT consume benefit a second time (§11.6 / §21 timing rule).
    const usedAfterSettle = await usedInpatient();
    expect(usedAfterSettle).toBeCloseTo(usedBeforeSettle, 2);
  });

  // ── IPL-PA-01: a slice honours a PA attached to its CASE (read-through) ──────
  it("IPL-PA-01: a slice consumes a case PA's hold via read-through (partial → PA stays APPROVED, caseId intact)", async () => {
    const now = new Date();
    const admit = new Date(now); admit.setUTCHours(0, 0, 0, 0); admit.setUTCDate(admit.getUTCDate() - 3);
    const svc = new Date(admit); svc.setUTCDate(svc.getUTCDate() + 1);

    // A fresh case for the same member/provider.
    const c = await CaseService.openCase({
      tenantId, memberId, providerId, caseType: "INPATIENT_ADMISSION",
      benefitCategory: "INPATIENT", admissionDate: admit, openedById: reviewerId,
    });
    const paCaseId = c.id;
    await CaseService.addServiceEntry({
      tenantId, caseId: paCaseId, entryDate: svc, category: "OTHER",
      serviceCode: null, description: "PA-covered ward day", quantity: 1, unitAmount: ENTRY, enteredById: reviewerId,
    });

    // An APPROVED PA on the CASE (not the slice), with an ACTIVE hold — the exact
    // shape the old FK-snapshot code could not credit to a slice.
    const PA_COVER = 50_000;
    const pa = await prisma.preAuthorization.create({
      data: {
        tenantId, preauthNumber: `PA-IPL-${Date.now()}`, memberId, providerId,
        submittedBy: "ADMIN", status: "APPROVED", benefitCategory: "INPATIENT",
        serviceType: "INPATIENT", diagnoses: [], procedures: [],
        estimatedCost: PA_COVER, approvedAmount: PA_COVER, utilisedAmount: 0,
        validFrom: admit, validUntil: new Date(now.getTime() + 30 * 86_400_000),
      },
      select: { id: true },
    });
    await preauthAdj.createBenefitHold(pa.id, tenantId, memberId, "INPATIENT", PA_COVER, new Date(now.getTime() + 30 * 86_400_000));
    await CaseService.attachPreauth(tenantId, paCaseId, pa.id); // sets caseId, keeps claimId null

    // Cut a slice — the fix means it does NOT re-point the PA.
    const slice = await CaseService.cutInterimSlice({ tenantId, caseId: paCaseId, cutoffDate: svc, cutById: reviewerId });
    createdClaimIds.push(slice.id);
    const afterCut = await prisma.preAuthorization.findUnique({ where: { id: pa.id }, select: { claimId: true, caseId: true } });
    expect(afterCut?.claimId).toBeNull();          // NOT re-pointed onto the slice
    expect(afterCut?.caseId).toBe(paCaseId);        // still secures the case

    // Decide the slice — read-through must find the case PA, credit its hold and
    // consume it partially.
    await approve(slice.id, ENTRY);

    const afterDecide = await prisma.preAuthorization.findUnique({
      where: { id: pa.id }, select: { status: true, utilisedAmount: true, claimId: true, caseId: true },
    });
    expect(afterDecide?.status).toBe("APPROVED");                 // partial → back to APPROVED
    expect(Number(afterDecide?.utilisedAmount)).toBeCloseTo(ENTRY, 2);
    expect(afterDecide?.claimId).toBeNull();                       // detached from the slice FK
    expect(afterDecide?.caseId).toBe(paCaseId);                    // episode linkage preserved

    const hold = await prisma.benefitHold.findUnique({ where: { preAuthId: pa.id }, select: { status: true, heldAmount: true } });
    // Hold reduced by the consumed amount, still ACTIVE (residual guarantee).
    expect(hold?.status).toBe("ACTIVE");
    expect(Number(hold?.heldAmount)).toBeCloseTo(PA_COVER - ENTRY, 2);

    const decided = await prisma.claim.findUnique({ where: { id: slice.id }, select: { status: true } });
    expect(decided?.status).toBe("APPROVED");

    // teardown of this leg's case
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: paCaseId } }).catch(() => {});
    await prisma.benefitHold.deleteMany({ where: { preAuthId: pa.id } }).catch(() => {});
  });
});
