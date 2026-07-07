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
    member: { findUnique: vi.fn() },
    benefitConfig: { findFirst: vi.fn() },
    benefitUsage: { findUnique: vi.fn(async () => null), findMany: vi.fn(async (): Promise<any[]> => []), create: vi.fn(async (a: any) => a.data), update: vi.fn(async (a: any) => a.data) },
    benefitConfigSharedLimit: { findMany: vi.fn(async (): Promise<any[]> => []) },
    benefitHold: { findUnique: vi.fn(async () => null), update: vi.fn(async (a: any) => a.data), upsert: vi.fn(async () => ({})) },
    preAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async (a: any) => a.data) },
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

  it("PENDED (REFER_FOR_REVIEW) lines stay reviewer judgement — capped at billed, not blocked", async () => {
    engine.evaluateClaimById.mockResolvedValue({
      matched: true,
      contractNumber: "PC-2026-001",
      totals: { payable: 1000, billed: 86000 },
      lines: [
        { lineId: "l1", decision: "AUTO_APPROVED", payableAmount: 1000 },
        { lineId: "l2", decision: "PENDED", payableAmount: 0 },
      ],
    });
    db.claimLine.findMany.mockResolvedValue([
      { id: "l1", billedAmount: 6000 },
      { id: "l2", billedAmount: 80000 },
    ]);
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBe(81000); // 1000 payable + 80000 billed (pended)
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

  it("FFS tariff fallback preserves the pre-existing ceiling behaviour", async () => {
    claimsSvc.resolveClaimContractRates.mockResolvedValue({
      contract: { contractNumber: "PC-2026-002", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null },
      lines: [
        { lineId: "l1", cptCode: "99213", allowedUnit: 1500, quantity: 2, maxQuantityPerVisit: null, unitCost: 2000, requiresPreauth: false, quantityExceeded: false },
        { lineId: "l2", cptCode: null, allowedUnit: null, quantity: 1, maxQuantityPerVisit: null, unitCost: 5000, requiresPreauth: false, quantityExceeded: false },
      ],
    });
    const assessment = await ClaimDecisionService.assessCeiling(T, "clm1");
    expect(assessment.ceiling).toBe(8000); // 1500×2 + 5000 judgement line
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
