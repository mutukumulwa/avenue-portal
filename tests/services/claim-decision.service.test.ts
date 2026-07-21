/**
 * W1 side-effect contract suite — the permanent regression guard for the
 * consolidated decision stack (remediation plan W1.1 acceptance test 1).
 *
 * Drives ClaimDecisionService.decide with a mocked Prisma layer and asserts
 * ALL money-control side-effects:
 *   claim status, AdjudicationLog, benefit-usage upsert (PR-016), hold
 *   conversion + PA UTILISED (PR-011/016), contract ceiling block (PR-014),
 *   PA-cover confirmation (PR-015), FX-correct matrix (PR-017), GL posting +
 *   self-funded drawdown (PR-018), idempotency, VOID reversal.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const claimUpdate = vi.fn(async (args: any) => ({ id: "clm1", ...args.data }));
  const state: any = {
    claim: {
      findUnique: vi.fn(),
      update: claimUpdate,
    },
    claimLine: { findMany: vi.fn(async (): Promise<any[]> => []), update: vi.fn(async () => ({})) },
    practitioner: { findFirst: vi.fn(async () => null) },
    member: { findUnique: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
    benefitConfig: { findFirst: vi.fn() },
    benefitUsage: { findUnique: vi.fn(async () => null), findMany: vi.fn(async (): Promise<any[]> => []), create: vi.fn(async (a: any) => a.data), update: vi.fn(async (a: any) => a.data) },
    benefitConfigSharedLimit: { findMany: vi.fn(async (): Promise<any[]> => []) },
    benefitHold: { findUnique: vi.fn(async () => null), findMany: vi.fn(async (): Promise<any[]> => []), update: vi.fn(async (a: any) => a.data), upsert: vi.fn(async () => ({})) },
    preAuthorization: { findMany: vi.fn(async (): Promise<any[]> => []), count: vi.fn(async () => 0), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async (a: any) => a.data) },
    approvalMatrix: { findMany: vi.fn(async (): Promise<any[]> => []) },
    approvalRequest: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "ar1" })), update: vi.fn(async (a: any) => a.data) },
    // OBS-7 fraud gate: default tenant config leaves the gate OFF, and no
    // unresolved fraud alerts, so decide() proceeds exactly as before.
    tenant: { findUnique: vi.fn(async () => ({ config: {} })) },
    claimFraudAlert: { findMany: vi.fn(async (): Promise<any[]> => []) },
    fxRate: { findFirst: vi.fn(async () => null) },
    overrideRecord: { findFirst: vi.fn(async () => null) },
    coContributionTransaction: { findUnique: vi.fn(async () => null) },
    chartOfAccount: { findUnique: vi.fn(async (a: any) => ({ id: `acc-${a.where.tenantId_code.code}`, code: a.where.tenantId_code.code })) },
    journalEntry: { count: vi.fn(async () => 0), create: vi.fn(async (a: any) => ({ id: "je1", ...a.data })) },
    selfFundedAccount: { update: vi.fn(async () => ({})) },
    fundTransaction: { create: vi.fn(async () => ({})) },
    exceptionLog: { create: vi.fn(async () => ({})) },
    adjudicationLog: { create: vi.fn(async () => ({})) },
    auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Contract engine + FFS resolution are exercised via their own suites; here we
// stub the ceiling inputs per scenario.
const engine = vi.hoisted(() => ({ evaluateClaimById: vi.fn(async (): Promise<any> => null) }));
vi.mock("@/server/services/contract-engine/engine", () => ({ ContractEngine: engine }));

const claimsSvc = vi.hoisted(() => ({
  resolveClaimContractRates: vi.fn(async (): Promise<any> => ({ contract: null, lines: [] })),
  // IPL-PA-01: faithful copy of the real resolver (union of claim- and
  // case-attached PAs). The findMany it feeds is mocked, so only its shape
  // matters, but we mirror the branch so a caseId scenario is exercised.
  effectivePreauthWhere: (claim: any) =>
    claim.caseId ? { OR: [{ claimId: claim.id }, { caseId: claim.caseId }] } : { claimId: claim.id },
}));
vi.mock("@/server/services/claims.service", () => ({ ClaimsService: claimsSvc }));

const costShare = vi.hoisted(() => ({
  applyForClaim: vi.fn(async () => ({ copayPercentage: 0, memberPays: 0, deductibleApplied: 0, coInsuranceApplied: 0, planPays: 0 })),
}));
vi.mock("@/server/services/cost-share.service", () => ({ CostShareResolver: costShare }));

const funding = vi.hoisted(() => ({
  resolveForClaim: vi.fn(async () => ({ anyCapitated: false, lines: [] as any[] })),
  applyToDecidedClaim: vi.fn(async () => ({})),
}));
vi.mock("@/server/services/funding-model.service", () => ({ FundingModelService: funding }));

const audit = vi.hoisted(() => ({ append: vi.fn(async () => ({})) }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: audit }));

vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));

import { ClaimDecisionService } from "@/server/services/claim-decision.service";

const T = "t1";
const NOW = new Date("2026-07-04T10:00:00Z");

const baseClaim = (over: Partial<any> = {}) => ({
  id: "clm1",
  claimNumber: "CLM-2026-00042",
  status: "UNDER_REVIEW",
  currency: "KES",
  memberId: "m1",
  benefitCategory: "INPATIENT",
  serviceType: "INPATIENT",
  billedAmount: 86000,
  receivedAt: NOW,
  adjudicatorId: null,
  attendingDoctor: null,
  isReimbursement: false,
  preauths: [] as any[],
  member: { group: { clientId: "c1", fundingMode: "INSURED", selfFundedAccount: null } },
  ...over,
});

function memberWithConfig() {
  db.member.findUnique.mockResolvedValue({
    packageVersionId: "pv1",
    enrollmentDate: new Date("2026-01-15"),
    group: { client: { currency: "KES" } },
  });
  db.benefitConfig.findFirst.mockResolvedValue({ id: "cfg-inpatient", annualSubLimit: 500000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.chartOfAccount.findUnique.mockImplementation(async (a: any) => ({
    id: `acc-${a.where.tenantId_code.code}`,
    code: a.where.tenantId_code.code,
  }));
  db.claim.findUnique.mockResolvedValue(baseClaim());
  // IPL-PA-01: decide() reads securing PAs via preAuthorization.findMany (case
  // read-through), not the claim's own FK list. Route the mock to the current
  // claim's `preauths` so PA scenarios (set via baseClaim({ preauths: [...] }))
  // keep exercising the credit + utilisation loop. Reads the recorded findUnique
  // result at call-time, so per-test overrides propagate without extra calls.
  db.preAuthorization.findMany.mockImplementation(async () => {
    const results = db.claim.findUnique.mock.results;
    const claim = await Promise.resolve(results[results.length - 1]?.value);
    return (claim?.preauths ?? []) as any[];
  });
  db.benefitUsage.findUnique.mockResolvedValue(null);
  db.benefitUsage.findMany.mockResolvedValue([]);
  db.benefitConfigSharedLimit.findMany.mockResolvedValue([]);
  db.benefitHold.findUnique.mockResolvedValue(null);
  db.approvalMatrix.findMany.mockResolvedValue([]);
  // OBS-2 Ticket 5: KES claims normalise at an in-force rate. Default 1 keeps
  // base == transaction for the non-FX suites; the FX suites override it.
  db.fxRate.findFirst.mockResolvedValue({ rate: 1 });
  db.overrideRecord.findFirst.mockResolvedValue(null);
  engine.evaluateClaimById.mockResolvedValue(null);
  claimsSvc.resolveClaimContractRates.mockResolvedValue({ contract: null, lines: [] });
  funding.resolveForClaim.mockResolvedValue({ anyCapitated: false, lines: [] });
  memberWithConfig();
});

const decide = (over: Partial<any> = {}) =>
  ClaimDecisionService.decide(T, "clm1", {
    action: "APPROVED",
    approvedAmount: 3600,
    reviewerId: "u1",
    reviewerRole: "CLAIMS_OFFICER",
    ...over,
  });

describe("PR-016 — benefit usage consumption", () => {
  it("creates the usage row (upsert) for a member with no existing rows", async () => {
    await decide();
    expect(db.benefitUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: "m1",
          benefitConfigId: "cfg-inpatient",
          amountUsed: 3600,
          claimCount: 1,
        }),
      }),
    );
    // Scoped: only the resolved config's row — no unscoped updateMany.
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedAmount: 3600 }) }),
    );
  });

  it("increments the existing scoped row and only that row", async () => {
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 1000, activeHoldAmount: 0 });
    await decide();
    expect(db.benefitUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bu1" },
        data: expect.objectContaining({ amountUsed: { increment: 3600 }, claimCount: { increment: 1 } }),
      }),
    );
    expect(db.benefitUsage.create).not.toHaveBeenCalled();
  });

  it("PARTIALLY_APPROVED consumes the approved — not billed — amount", async () => {
    await decide({ action: "PARTIALLY_APPROVED", approvedAmount: 2000 });
    expect(db.benefitUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountUsed: 2000 }) }),
    );
  });

  it("DECLINED consumes nothing", async () => {
    await decide({ action: "DECLINED", approvedAmount: 0, declineReasonCode: "NOT_COVERED" });
    expect(db.benefitUsage.create).not.toHaveBeenCalled();
    expect(db.benefitUsage.update).not.toHaveBeenCalled();
  });

  it("blocks approval when the benefit is not in the member's package", async () => {
    db.benefitConfig.findFirst.mockResolvedValue(null);
    await expect(decide()).rejects.toThrow(/not in the member's package/);
  });

  it("second decision on an already-decided claim is rejected (idempotency)", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({ status: "APPROVED" }));
    await expect(decide()).rejects.toThrow(/current status/);
    expect(db.benefitUsage.create).not.toHaveBeenCalled();
  });
});

describe("PR-011/016 — PA hold conversion + UTILISED", () => {
  const withPa = () =>
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        preauths: [{ id: "pa1", preauthNumber: "PA-2026-00009", approvedAmount: 85000, estimatedCost: 85000, status: "ATTACHED" }],
      }),
    );

  it("PR-022: a partial-cover approval consumes only its share — hold reduced (stays ACTIVE), PA back to APPROVED with utilisedAmount advanced", async () => {
    withPa();
    db.benefitHold.findUnique.mockResolvedValue({
      preAuthId: "pa1", status: "ACTIVE", heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT",
    });
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 0, activeHoldAmount: 85000 });

    await decide({ approvedAmount: 3600 });

    // Hold reduced by the consumed 3,600 — NOT converted; the remaining
    // 81,400 reservation protects the rest of the episode.
    expect(db.benefitHold.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { preAuthId: "pa1" },
        data: expect.objectContaining({ heldAmount: 81400 }),
      }),
    );
    expect(db.benefitUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activeHoldAmount: { increment: -3600 } }) }),
    );
    // Usage incremented exactly once with the approved amount.
    const usageWrites = db.benefitUsage.update.mock.calls.filter(
      (c: any[]) => c[0]?.data?.amountUsed,
    );
    expect(usageWrites).toHaveLength(1);
    expect(usageWrites[0][0].data.amountUsed).toEqual({ increment: 3600 });
    // PA returns to the pool with its consumption recorded.
    expect(db.preAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pa1" },
        data: expect.objectContaining({ status: "APPROVED", utilisedAmount: 3600, claimId: null }),
      }),
    );
  });

  it("PR-011/016: a full-cover approval converts the hold and sets the PA UTILISED", async () => {
    withPa();
    db.benefitHold.findUnique.mockResolvedValue({
      preAuthId: "pa1", status: "ACTIVE", heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT",
    });
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 0, activeHoldAmount: 85000 });

    await decide({ approvedAmount: 85000 });

    expect(db.benefitHold.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { preAuthId: "pa1" },
        data: expect.objectContaining({ status: "CONVERTED", convertedToClaimId: "clm1" }),
      }),
    );
    expect(db.benefitUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activeHoldAmount: { increment: -85000 } }) }),
    );
    expect(db.preAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pa1" },
        data: expect.objectContaining({ status: "UTILISED", utilisedAmount: 85000 }),
      }),
    );
  });

  it("decline detaches the PA back to APPROVED and leaves the hold ACTIVE", async () => {
    withPa();
    db.benefitHold.findUnique.mockResolvedValue({
      preAuthId: "pa1", status: "ACTIVE", heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT",
    });
    await decide({ action: "DECLINED", approvedAmount: 0, declineReasonCode: "NOT_COVERED" });
    expect(db.preAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "APPROVED", claimId: null, attachedAt: null } }),
    );
    expect(db.benefitHold.update).not.toHaveBeenCalled();
  });
});

describe("PR-014 — contract price ceiling", () => {
  const caseRateEngine = () =>
    engine.evaluateClaimById.mockResolvedValue({
      matched: true,
      contractNumber: "PC-2026-001",
      totals: { payable: 3600, billed: 86000 },
      lines: [{ lineId: "l1", decision: "AUTO_APPROVED", payableAmount: 3600 }],
    });

  it("approving at the engine payable succeeds; above it is blocked naming ceiling + source", async () => {
    caseRateEngine();
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 86000 }]);
    await expect(decide({ approvedAmount: 86000 })).rejects.toThrow(/payable ceiling[\s\S]*3,600[\s\S]*PC-2026-001/);

    caseRateEngine();
    await expect(decide({ approvedAmount: 3600 })).resolves.toBeTruthy();
  });

  it("engine-vs-enforcement parity: the enforced ceiling equals the engine's deterministic payable", async () => {
    caseRateEngine();
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 86000 }]);
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBe(3600);
    expect(assessment.deterministic).toBe(true);
  });

  it("BD-07: a PENDED (uncoded/unlisted) line contributes 0 to the ceiling — NOT its billed amount", async () => {
    // Proven CLM-2026-00295 shape: one priced line + one uncoded line that pends
    // for review. Folding the pended line's billed amount into the ceiling is the
    // BD-07 bypass — it must be EXCLUDED so the ceiling is the priced sum only.
    engine.evaluateClaimById.mockResolvedValue({
      matched: true,
      contractNumber: "PC-2026-001",
      totals: { payable: 1000, billed: 86000 },
      lines: [
        { lineId: "l1", decision: "AUTO_APPROVED", payableAmount: 1000 },
        { lineId: "l2", decision: "PENDED", payableAmount: 0 },
      ],
    });
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBe(1000); // priced line only; the pended 80,000 excluded
    expect(assessment.hasUnpricedLines).toBe(true);
    expect(assessment.deterministic).toBe(true);
  });

  it("an approved PAY_ABOVE_CONTRACT_RATE override lets the decision exceed the ceiling", async () => {
    caseRateEngine();
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 86000 }]);
    db.overrideRecord.findFirst.mockResolvedValue({ id: "ovr1" });
    await expect(decide({ approvedAmount: 86000 })).resolves.toBeTruthy();
  });

  it("no contract → no ceiling → reviewer judgement", async () => {
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBeNull();
    await expect(decide({ approvedAmount: 86000 })).resolves.toBeTruthy();
  });

  it("BD-07 (FFS): an unpriced tariff line (allowedUnit null) contributes 0 — priced lines only", async () => {
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-2026-002", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null },
      lines: [
        { lineId: "l1", cptCode: "99213", allowedUnit: 1500, quantity: 2, maxQuantityPerVisit: null, unitCost: 2000, requiresPreauth: false, quantityExceeded: false },
        { lineId: "l2", cptCode: null, allowedUnit: null, quantity: 1, maxQuantityPerVisit: null, unitCost: 5000, requiresPreauth: false, quantityExceeded: false },
      ],
    });
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBe(3000); // 1500×2 only; the uncoded 5,000 line excluded
    expect(assessment.hasUnpricedLines).toBe(true);
  });

  it("FFS: a PAY_AS_BILLED unlisted rule (non-null allowedUnit) still prices deterministically", async () => {
    // Regression guard for the BD-07 fix: legitimate unlisted rules that resolve
    // to a real allowedUnit (pay-as-billed / discount-off-billed) must NOT be
    // zeroed — only genuinely-unpriced (allowedUnit === null) lines are excluded.
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-2026-003", unlistedServiceRule: "PAY_AS_BILLED", unlistedDiscountPct: null },
      lines: [
        { lineId: "l1", cptCode: "99213", allowedUnit: 1500, quantity: 1, maxQuantityPerVisit: null, unitCost: 2000, requiresPreauth: false, quantityExceeded: false },
        { lineId: "l2", cptCode: null, allowedUnit: 5000, quantity: 1, maxQuantityPerVisit: null, unitCost: 5000, requiresPreauth: false, quantityExceeded: false },
      ],
    });
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBe(6500); // 1500 + 5000 pay-as-billed (both priced)
    expect(assessment.hasUnpricedLines).toBeFalsy();
  });
});

describe("PR-015 — attached-PA cover confirmation", () => {
  const withPa = () =>
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        preauths: [{ id: "pa1", preauthNumber: "PA-1", approvedAmount: 85000, estimatedCost: 85000, status: "ATTACHED" }],
      }),
    );

  it("approving ≤ cover needs no confirmation", async () => {
    withPa();
    await expect(decide({ approvedAmount: 85000 })).resolves.toBeTruthy();
  });

  it("approving above cover without confirmation is rejected with cover, amount and delta", async () => {
    withPa();
    await expect(decide({ approvedAmount: 86000 })).rejects.toThrow(/86,000[\s\S]*85,000[\s\S]*1,000/);
  });

  it("approving above cover with confirmation succeeds and the note lands in the AdjudicationLog", async () => {
    withPa();
    await decide({ approvedAmount: 86000, overCoverConfirmation: "senior reviewed invoices" });
    const logWrite = db.claim.update.mock.calls[0][0].data.adjudicationLogs.create;
    expect(logWrite.notes).toMatch(/over-cover confirmed/i);
    expect(logWrite.notes).toMatch(/senior reviewed invoices/);
  });

  it("no-PA claim never prompts (regression)", async () => {
    await expect(decide({ approvedAmount: 86000 })).resolves.toBeTruthy();
  });
});

describe("PR-017 — FX-correct approval matrix", () => {
  const inpatientDualRule = {
    id: "r-dual", tenantId: T, clientId: null, actionType: "CLAIM_PAYMENT",
    claimValueMin: 200000, claimValueMax: null, currency: "UGX",
    serviceType: null, benefitCategory: "INPATIENT",
    requiredRole: "MEDICAL_OFFICER", requiresDual: true,
    slaMinutes: null, escalationTargetRole: null,
    effectiveFrom: new Date("2026-01-01"), effectiveTo: null, isActive: true, steps: [] as any[],
  };

  it("KES 86,000 @ 27 → UGX 2,322,000 matches the >200k dual band and opens an ApprovalRequest", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([inpatientDualRule]);
    db.fxRate.findFirst.mockResolvedValue({ rate: 27 });
    await expect(decide({ approvedAmount: 86000 })).rejects.toThrow(/2-level approval/);
    expect(db.approvalRequest.create).toHaveBeenCalled();
  });

  it("UGX claim behaviour unchanged (below the band → no matrix gate)", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({ currency: "UGX", billedAmount: 86000 }));
    db.approvalMatrix.findMany.mockResolvedValue([inpatientDualRule]);
    await expect(decide({ approvedAmount: 86000 })).resolves.toBeTruthy(); // 86k UGX < 200k min
  });

  it("missing FX rate fails safe: routed to the highest path + ExceptionLog", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([inpatientDualRule]);
    db.fxRate.findFirst.mockResolvedValue(null); // no KES rate
    await expect(decide({ approvedAmount: 100 })).rejects.toThrow(/No FX rate .* fail-safe/);
    expect(db.exceptionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: expect.stringContaining("FX rate missing") }) }),
    );
  });
});

describe("OBS-7 — fraud approval gate (integration)", () => {
  const gateOn = () =>
    db.tenant.findUnique.mockResolvedValue({
      config: {
        claims: {
          requireFraudClearanceBeforeApproval: true,
          fraudApprovalSeverityThreshold: "MEDIUM",
          fraudApprovalGateMode: "CLEAR_ALERT_ONLY",
        },
      },
    });

  it("gate ON + open HIGH alert blocks approval before any GL / usage side effect", async () => {
    gateOn();
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "HIGH", rule: "Velocity Check" }]);
    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(/Fraud control/);
    expect(db.journalEntry.create).not.toHaveBeenCalled();
    expect(db.benefitUsage.create).not.toHaveBeenCalled();
    expect(db.claim.update).not.toHaveBeenCalled();
  });

  it("gate ON but DECLINE is still allowed", async () => {
    gateOn();
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "CRITICAL", rule: "x" }]);
    await expect(
      decide({ action: "DECLINED", approvedAmount: 0, declineReasonCode: "FRAUD_SUSPECTED" }),
    ).resolves.toBeTruthy();
  });

  it("gate ON but alert resolved (none unresolved) → approval proceeds and posts GL", async () => {
    gateOn();
    db.claimFraudAlert.findMany.mockResolvedValue([]);
    await expect(decide({ approvedAmount: 3600 })).resolves.toBeTruthy();
    expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
  });
});

describe("OBS-2 — FX snapshot at approval (Ticket 5/6)", () => {
  it("UGX claim: base == transaction, rate 1, no FX lookup", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({ currency: "UGX" }));
    await decide({ approvedAmount: 3600 });
    const data = db.claim.update.mock.calls[0][0].data;
    expect(data.baseCurrency).toBe("UGX");
    expect(data.approvedBaseAmount).toBe(3600);
    expect(data.fxRateToBase).toBe(1);
    expect(data.fxRateDate).toBeNull();
    // GL posts the base amount.
    const je = db.journalEntry.create.mock.calls[0][0].data;
    const dr = je.lines.create.reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
    expect(dr).toBe(3600);
  });

  it("KES claim with a rate persists the base amount and posts GL in UGX", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({ currency: "KES" }));
    db.fxRate.findFirst.mockResolvedValue({ rate: 27 });
    await decide({ approvedAmount: 3600 });
    const data = db.claim.update.mock.calls[0][0].data;
    expect(data.approvedBaseAmount).toBe(97200); // 3600 × 27
    expect(data.fxRateToBase).toBe(27);
    expect(data.fxRateDate).toBeInstanceOf(Date);
    // GL is in base: Dr/Cr = 97,200 UGX, not 3,600 raw KES.
    const je = db.journalEntry.create.mock.calls[0][0].data;
    const dr = je.lines.create.reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
    const cr = je.lines.create.reduce((s: number, l: any) => s + (l.credit ?? 0), 0);
    expect(dr).toBe(97200);
    expect(cr).toBe(97200);
  });

  it("KES claim with NO in-force rate fails closed before any side effect", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({ currency: "KES" }));
    db.fxRate.findFirst.mockResolvedValue(null); // missing rate, no matrix rule
    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(/FX fail-closed/);
    expect(db.journalEntry.create).not.toHaveBeenCalled();
    expect(db.claim.update).not.toHaveBeenCalled();
    // ExceptionLog captures the missing-rate block.
    expect(db.exceptionLog.create).toHaveBeenCalled();
  });
});

describe("PR-018 — GL posting + self-funded drawdown", () => {
  it("approval posts one balanced CLAIM_APPROVED JE inside the decision transaction", async () => {
    await decide({ approvedAmount: 3600 });
    expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
    const je = db.journalEntry.create.mock.calls[0][0].data;
    expect(je.sourceType).toBe("CLAIM_APPROVED");
    expect(je.sourceId).toBe("clm1");
    const lines = je.lines.create;
    const dr = lines.reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
    const cr = lines.reduce((s: number, l: any) => s + (l.credit ?? 0), 0);
    expect(dr).toBe(3600);
    expect(cr).toBe(3600);
  });

  it("a missing GL account blocks the approval loudly (no silent skip)", async () => {
    db.chartOfAccount.findUnique.mockResolvedValue(null);
    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(/GL account .* not found/);
  });

  it("self-funded scheme approval draws down the fund with a CLAIM_DEDUCTION", async () => {
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        member: { group: { clientId: "c1", fundingMode: "SELF_FUNDED", selfFundedAccount: { id: "sfa1", balance: 1000000 } } },
      }),
    );
    await decide({ approvedAmount: 3600 });
    expect(db.selfFundedAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balance: 996400 }) }),
    );
    expect(db.fundTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "CLAIM_DEDUCTION", amount: 3600 }) }),
    );
  });

  it("VOID reverses usage with a compensating decrement and posts a reversing JE, net ledger zero", async () => {
    db.claim.findUnique.mockResolvedValue(
      baseClaim({ status: "APPROVED", approvedAmount: 3600, settlementBatchId: null }),
    );
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 3600, activeHoldAmount: 0 });

    await ClaimDecisionService.voidClaim(T, "clm1", { actorId: "u1", reason: "capture error" });

    expect(db.benefitUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountUsed: { increment: -3600 } }) }),
    );
    const je = db.journalEntry.create.mock.calls[0][0].data;
    expect(je.sourceType).toBe("CLAIM_VOID");
    const lines = je.lines.create;
    // Reversal mirrors the approval: Dr Claims Payable / Cr Claims Incurred.
    expect(lines.find((l: any) => l.debit === 3600).accountId).toBe("acc-2010");
    expect(lines.find((l: any) => l.credit === 3600).accountId).toBe("acc-5010");
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "VOID" }) }),
    );
  });

  it("a settled claim cannot be voided", async () => {
    db.claim.findUnique.mockResolvedValue(
      baseClaim({ status: "APPROVED", approvedAmount: 3600, settlementBatchId: "batch1" }),
    );
    await expect(ClaimDecisionService.voidClaim(T, "clm1", { actorId: "u1", reason: "x" })).rejects.toThrow(/settlement/);
  });
});

// BD-04: an active contract with NO enforceable line (CPT-less / unlisted) must
// yield a deterministic 0 ceiling flagged `unpriced` — NOT null (which the UI
// reads as "no contract → default full billed"). This closes the bypass.
describe("assessCeiling — unpriced active contract (BD-04)", () => {
  it("returns ceiling 0 + unpriced when the contract exists but no line is priced", async () => {
    engine.evaluateClaimById.mockResolvedValue(null); // no engine contract
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-2026-001" },
      lines: [
        { lineId: "l1", allowedUnit: null, unitCost: 80000, quantity: 1, maxQuantityPerVisit: null },
      ],
    });

    const res = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(res.ceiling).toBe(0);
    expect(res.unpriced).toBe(true);
    expect(res.contractNumber).toBe("PC-2026-001");
  });

  it("still returns null (reviewer judgement) when there is genuinely no contract", async () => {
    engine.evaluateClaimById.mockResolvedValue(null);
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: null,
      lines: [
        { lineId: "l1", allowedUnit: null, unitCost: 80000, quantity: 1, maxQuantityPerVisit: null },
      ],
    });

    const res = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(res.ceiling).toBeNull();
    expect(res.unpriced).toBeFalsy();
  });

  it("blocks a full-billed approval on an unpriced active-contract claim", async () => {
    memberWithConfig();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({ currency: "UGX", benefitCategory: "OUTPATIENT", serviceType: "OUTPATIENT", billedAmount: 80000 }),
    );
    engine.evaluateClaimById.mockResolvedValue(null);
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-2026-001" },
      lines: [
        { lineId: "l1", allowedUnit: null, unitCost: 80000, quantity: 1, maxQuantityPerVisit: null, requiresPreauth: false, quantityExceeded: false, cptCode: null },
      ],
    });
    db.overrideRecord.findFirst.mockResolvedValue(null); // no override

    await expect(
      ClaimDecisionService.decide(T, "clm1", {
        action: "APPROVED",
        approvedAmount: 80000,
        reviewerId: "u1",
        reviewerRole: "CLAIMS_OFFICER",
      }),
    ).rejects.toThrow(/no line resolved to a contracted price|uncoded or unlisted/i);
    expect(db.claim.update).not.toHaveBeenCalled();
  });
});

// BD-07: a MIXED claim (some lines priced, at least one uncoded/unlisted) must
// NOT let the uncoded line's billed amount ride into the payable ceiling. The
// ceiling is the priced sum only; approving the full billed amount is blocked
// and routed to a PAY_ABOVE_CONTRACT_RATE override. Proven end-to-end on prod
// as CLM-2026-00295 (consultation priced 3,500 + uncoded bundle billed 80,000
// → payable ceiling had inflated to 83,500 and Approve(Full) was accepted).
describe("BD-07 — mixed coded + uncoded claim (money-control regression)", () => {
  beforeEach(() => {
    db.claim.findUnique.mockResolvedValue(
      baseClaim({ currency: "UGX", benefitCategory: "OUTPATIENT", serviceType: "OUTPATIENT", billedAmount: 83500 }),
    );
    db.overrideRecord.findFirst.mockResolvedValue(null);
  });

  const mixedEngine = () =>
    engine.evaluateClaimById.mockResolvedValue({
      matched: true,
      contractNumber: "PC-2026-001",
      totals: { payable: 3500, billed: 83500 },
      lines: [
        { lineId: "l1", decision: "AUTO_APPROVED", payableAmount: 3500 }, // CONSULTATION 99213
        { lineId: "l2", decision: "PENDED", payableAmount: 0 },           // uncoded bundle, billed 80,000
      ],
    });

  const decideMixed = (over: Partial<any> = {}) =>
    ClaimDecisionService.decide(T, "clm1", {
      action: "APPROVED",
      approvedAmount: 3500,
      reviewerId: "u1",
      reviewerRole: "CLAIMS_OFFICER",
      ...over,
    });

  it("engine branch: ceiling excludes the uncoded line — 3,500, not 83,500", async () => {
    mixedEngine();
    const a = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(a.ceiling).toBe(3500);
    expect(a.hasUnpricedLines).toBe(true);
    expect(a.deterministic).toBe(true);
  });

  it("engine branch: full-billed approval (83,500) is BLOCKED and routed to an override", async () => {
    mixedEngine();
    await expect(decideMixed({ approvedAmount: 83500 })).rejects.toThrow(
      /payable ceiling[\s\S]*3,500[\s\S]*PAY_ABOVE_CONTRACT_RATE/,
    );
    expect(db.claim.update).not.toHaveBeenCalled();
  });

  it("engine branch: approving the priced portion (3,500) succeeds with no override", async () => {
    mixedEngine();
    await expect(decideMixed({ approvedAmount: 3500 })).resolves.toBeTruthy();
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedAmount: 3500 }) }),
    );
  });

  it("FFS branch: an uncoded tariff line is likewise excluded and blocks full-billed", async () => {
    engine.evaluateClaimById.mockResolvedValue(null); // no engine → FFS tariff path
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-2026-002" },
      lines: [
        { lineId: "l1", cptCode: "99213", agreedRate: 3500, allowedUnit: 3500, quantity: 1, maxQuantityPerVisit: null, unitCost: 6000, requiresPreauth: false, quantityExceeded: false },
        { lineId: "l2", cptCode: null, agreedRate: null, allowedUnit: null, quantity: 1, maxQuantityPerVisit: null, unitCost: 80000, requiresPreauth: false, quantityExceeded: false },
      ],
    });
    const a = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(a.ceiling).toBe(3500); // priced line only
    expect(a.hasUnpricedLines).toBe(true);

    await expect(decideMixed({ approvedAmount: 83500 })).rejects.toThrow(/payable ceiling[\s\S]*3,500/);
    await expect(decideMixed({ approvedAmount: 3500 })).resolves.toBeTruthy();
  });
});

// ─── P1.3 — benefit availability gate at the decision (IP-DEF-06) ────────────
// The gate runs FIRST inside the decision transaction: an approval above the
// member's available benefit is hard-blocked with the binding constraint and a
// partial-to-availability suggestion (DEC-04), leaving NO side effects; holds
// the claim converts are credited once (P1-B); FAMILY pools block dependants
// beyond the family remainder (P1-C).
describe("P1.3 — benefit availability gate (IP-DEF-06)", () => {
  it("blocks approving a fully-exhausted member with BENEFIT_CATEGORY_EXHAUSTED and no side effects", async () => {
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 500000, activeHoldAmount: 0 });
    await expect(decide({ approvedAmount: 85000 })).rejects.toThrow(/BENEFIT_CATEGORY_EXHAUSTED[\s\S]*Approve up to KES 0/);
    expect(db.benefitUsage.create).not.toHaveBeenCalled();
    expect(db.benefitUsage.update).not.toHaveBeenCalled();
    expect(db.claim.update).not.toHaveBeenCalled();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it("a SELF_FUNDED claim blocked by the gate leaves NO fund or GL side effects", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({
      member: { group: { clientId: "c1", fundingMode: "SELF_FUNDED", selfFundedAccount: { id: "sfa1", balance: 10_000_000 } } },
    }));
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 500000, activeHoldAmount: 0 });
    await expect(decide({ approvedAmount: 85000 })).rejects.toThrow(/BENEFIT_CATEGORY_EXHAUSTED/);
    expect(db.selfFundedAccount.update).not.toHaveBeenCalled();
    expect(db.fundTransaction.create).not.toHaveBeenCalled();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it("allows an explicit partial approval equal to the availability", async () => {
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 490000, activeHoldAmount: 0 });
    await expect(decide({ action: "PARTIALLY_APPROVED", approvedAmount: 10000 })).resolves.toBeTruthy();
    expect(db.benefitUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountUsed: { increment: 10000 } }) }),
    );
  });

  it("P1-B: a claim converting its own PA hold is NOT false-blocked by that reservation", async () => {
    // 500k limit, 300k used, 200k held by THIS claim's PA. Without the credit
    // the availability would be 0; crediting the converting hold makes it 200k.
    const usageRow: any = { id: "bu1", amountUsed: 300000, activeHoldAmount: 200000 };
    const holdRow: any = { preAuthId: "pa1", memberId: "m1", benefitCategory: "INPATIENT", heldAmount: 200000, status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) };
    db.claim.findUnique.mockResolvedValue(baseClaim({
      preauths: [{ id: "pa1", preauthNumber: "PA-2026-00001", approvedAmount: 200000, estimatedCost: 200000, utilisedAmount: 0, status: "ATTACHED" }],
    }));
    db.benefitUsage.findUnique.mockImplementation(async () => ({ ...usageRow }));
    db.benefitUsage.update.mockImplementation(async (a: any) => {
      if (a.data?.amountUsed?.increment) usageRow.amountUsed += a.data.amountUsed.increment;
      if (a.data?.activeHoldAmount?.increment) usageRow.activeHoldAmount += a.data.activeHoldAmount.increment;
      return { ...usageRow };
    });
    db.benefitHold.findUnique.mockImplementation(async () => ({ ...holdRow }));
    db.benefitHold.update.mockImplementation(async (a: any) => {
      Object.assign(holdRow, a.data);
      return { ...holdRow };
    });
    db.benefitHold.findMany.mockImplementation(async (a: any) => {
      if (a?.where?.preAuthId) return holdRow.status === "ACTIVE" ? [{ ...holdRow }] : [];
      return holdRow.status === "ACTIVE" ? [{ ...holdRow }] : [];
    });

    await expect(decide({ approvedAmount: 150000 })).resolves.toBeTruthy();
    // Hold partially consumed: 200k − 150k = 50k stays reserved; usage +150k.
    expect(holdRow.heldAmount).toBe(50000);
    expect(usageRow.amountUsed).toBe(450000);
    expect(usageRow.activeHoldAmount).toBe(50000);
  });

  it("P1-C: a dependant beyond the FAMILY pool remainder is blocked with BENEFIT_FAMILY_LIMIT_EXHAUSTED", async () => {
    // Reset implementations the P1-B test installed on shared mocks.
    db.benefitHold.findMany.mockResolvedValue([]);
    db.benefitUsage.update.mockImplementation(async (a: any) => a.data);
    db.member.findUnique.mockResolvedValue({
      id: "m1", relationship: "CHILD", principalId: "m0",
      packageVersionId: "pv1", enrollmentDate: new Date("2026-01-15"),
      package: { annualLimit: 0, perVisitLimit: null },
    });
    db.member.findMany.mockResolvedValue([{ id: "m0" }, { id: "m1" }, { id: "sib" }]);
    db.benefitConfigSharedLimit.findMany.mockResolvedValue([
      { sharedLimitGroup: { id: "slg1", name: "Family inpatient pool", limitAmount: 500000, appliesTo: "FAMILY", benefitConfigs: [{ benefitConfigId: "cfg-inpatient" }] } },
    ]);
    db.benefitUsage.findMany.mockImplementation(async (a: any) => {
      const m = a?.where?.memberId;
      if (m && typeof m === "object" && Array.isArray(m.in)) {
        return [
          { memberId: "m0", amountUsed: 200000, activeHoldAmount: 0, benefitConfig: { category: "INPATIENT" } },
          { memberId: "sib", amountUsed: 250000, activeHoldAmount: 0, benefitConfig: { category: "INPATIENT" } },
        ];
      }
      return [];
    });
    await expect(decide({ approvedAmount: 100000 })).rejects.toThrow(/BENEFIT_FAMILY_LIMIT_EXHAUSTED[\s\S]*Approve up to KES 50,000/);
    expect(db.claim.update).not.toHaveBeenCalled();
  });
});

// ─── IPL-PA-01 — interim slices honour the case's PAs ────────────────────────
describe("IPL-PA-01 — a case slice reads its PAs through the case", () => {
  // A PA-required contract line (the CT-HEAD shape from the Boda repro). No
  // enforceable-price surprise: allowedUnit is high so the ceiling never binds
  // the small approval, isolating the PA gate.
  const paRequiredLine = () =>
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-UAT-IP-2026" },
      lines: [
        {
          lineId: "l1", cptCode: "CT-HEAD", description: "CT Head",
          requiresPreauth: true, quantityExceeded: false,
          allowedUnit: 1_000_000, quantity: 1, maxQuantityPerVisit: null, agreedRate: null,
        },
      ],
    });

  it("a slice with a case PA and a PA-required line ADJUDICATES (was the IPL-PA-01 block)", async () => {
    memberWithConfig();
    paRequiredLine();
    // The PA is attached to the CASE (claimId null), approved after / independent
    // of the cut — the exact state the old FK-snapshot code could not see.
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null }],
      }),
    );

    await decide({ approvedAmount: 3600 });

    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedAmount: 3600 }) }),
    );
    // The case PA was consumed (partial) and stayed APPROVED with caseId intact
    // (the update data never clears caseId).
    const paUpdate = db.preAuthorization.update.mock.calls.find((c: any[]) => c[0]?.where?.id === "capa");
    expect(paUpdate).toBeTruthy();
    expect(paUpdate![0].data).toEqual(expect.objectContaining({ status: "APPROVED", utilisedAmount: 3600, claimId: null }));
    expect(paUpdate![0].data).not.toHaveProperty("caseId");
  });

  it("a slice with a PA-required line and NO PA anywhere still THROWS (gate regression) and points at the case", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(baseClaim({ caseId: "case1", preauths: [] }));

    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(
      /requires pre-authorization[\s\S]*attach one to its case/,
    );
    expect(db.claim.update).not.toHaveBeenCalled();
  });

  it("a UTILISED case PA satisfies the required-line gate (F6 final bill) but the cover cap needs explicit confirmation", async () => {
    memberWithConfig();
    paRequiredLine();
    // Earlier slices fully consumed the GOP → PA is UTILISED, 0 remaining cover.
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 2_000_000, status: "UTILISED", claimId: "slice-earlier" }],
      }),
    );

    // Gate passes (UTILISED counts), but 3,600 > 0 remaining cover → cover cap.
    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(/PA cover check/);
    // With the explicit over-cover confirmation it proceeds.
    await decide({ approvedAmount: 3600, overCoverConfirmation: "final residual line after GOP exhausted" });
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
    );
  });

  it("DECLINING a slice never consumes or detaches the case's PAs", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null }],
      }),
    );

    await decide({ action: "DECLINED", approvedAmount: 0, declineReasonCode: "NOT_COVERED" });
    // No per-PA utilisation write (that only happens on approval).
    expect(db.preAuthorization.update).not.toHaveBeenCalled();
    // The detach updateMany is scoped to claimId, so a case PA (claimId null)
    // is untouched — the guarantee survives for the next slice.
    expect(db.preAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ claimId: "clm1" }) }),
    );
  });
});

describe("OBS-PA-EXP-01 — PA validity is checked at decision time", () => {
  // Same PA-required line shape as the IPL-PA-01 suite (allowedUnit high so the
  // ceiling never binds the small approval — isolates the PA validity gate).
  const paRequiredLine = () =>
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-UAT-IP-2026" },
      lines: [
        {
          lineId: "l1", cptCode: "CT-HEAD", description: "CT Head",
          requiresPreauth: true, quantityExceeded: false,
          allowedUnit: 1_000_000, quantity: 1, maxQuantityPerVisit: null, agreedRate: null,
        },
      ],
    });
  // Far past / far future so the check is robust to real wall-clock (`decide()`
  // reads `new Date()`, not the test's NOW).
  const EXPIRED = new Date("2020-01-01T00:00:00Z");
  const FUTURE = new Date("2099-12-31T00:00:00Z");

  it("BLOCKS when the only securing PA has lapsed (validUntil in the past)", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null, validUntil: EXPIRED }],
      }),
    );
    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(/has expired[\s\S]*Renew or extend/);
    expect(db.claim.update).not.toHaveBeenCalled();
  });

  it("ADJUDICATES when the securing PA is still within validity (no false block)", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null, validUntil: FUTURE }],
      }),
    );
    await decide({ approvedAmount: 3600 });
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedAmount: 3600 }) }),
    );
  });

  it("does NOT block a UTILISED-but-expired PA (F6 final bill — the episode was authorised)", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 2_000_000, status: "UTILISED", claimId: "slice-earlier", validUntil: EXPIRED }],
      }),
    );
    // Gate passes (UTILISED satisfies it despite expiry); the cover cap — NOT an
    // "expired" throw — is what stops the 0-remaining over-cover approval.
    await expect(decide({ approvedAmount: 3600 })).rejects.toThrow(/PA cover check/);
  });

  it("does NOT block when at least one securing PA is still valid (mixed expired + live)", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [
          { id: "old", preauthNumber: "PA-OLD", approvedAmount: 1_000_000, estimatedCost: 1_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null, validUntil: EXPIRED },
          { id: "new", preauthNumber: "PA-NEW", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null, validUntil: FUTURE },
        ],
      }),
    );
    await decide({ approvedAmount: 3600 });
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
    );
  });

  it("never blocks a PA with no validUntil set (open-ended guarantee — regression guard)", async () => {
    memberWithConfig();
    paRequiredLine();
    db.claim.findUnique.mockResolvedValue(
      baseClaim({
        caseId: "case1",
        preauths: [{ id: "capa", preauthNumber: "PA-CASE-1", approvedAmount: 2_000_000, estimatedCost: 2_000_000, utilisedAmount: 0, status: "APPROVED", claimId: null }],
      }),
    );
    await decide({ approvedAmount: 3600 });
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
    );
  });
});
