/**
 * DEC-FH-X11 (owner, 2026-09-11) in the services: a withdrawn or superseded
 * claim is kept wherever claims are listed — lists, per-status buckets, case
 * slices, rejection rows — and left out of every total: analytics facts, the
 * tRPC claims summary, the member's care-history summary, case reconciliation
 * and the contract-analytics datasets. Queue load is a work count, so it keeps
 * every queued claim.
 *
 * The fixture has three claims that count (approved, received, declined) and
 * two that do not (withdrawn, superseded), so every total below is the three.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeModel, type Row } from "../fixtures/claim-totals-db";

const state = vi.hoisted(() => ({ claims: [] as Record<string, unknown>[], lines: [] as Record<string, unknown>[] }));
const db = vi.hoisted(() => ({
  claim: {} as Record<string, unknown>,
  claimLine: {} as Record<string, unknown>,
  caseMixWeight: { findMany: vi.fn(async () => []) },
  analyticsEncounterFact: {
    upsert: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  clinicalCase: { findUnique: vi.fn(async () => ({ currency: "UGX" })) },
  caseServiceEntry: { findMany: vi.fn(async () => []) },
  preAuthorization: { findMany: vi.fn(async () => []) },
  user: { findUnique: vi.fn(async (): Promise<unknown> => null) },
  member: { findMany: vi.fn(async () => []) },
  providerContract: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({
  auth: async () => null,
  getCachedSession: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

import { AnalyticsRefreshService } from "@/server/services/analytics-refresh.service";
import { getExclusionRejectionRows } from "@/server/services/report-exclusions";
import { CaseService } from "@/server/services/case.service";
import { MemberAppService } from "@/server/services/member-app.service";
import { ContractAnalyticsService } from "@/server/services/contract-analytics.service";
import { createCallerFactory } from "@/server/trpc/trpc";
import { effectivePermissions } from "@/lib/authz/catalog";
import { reportsRouter } from "@/server/trpc/routers/reports";

Object.assign(db.claim, fakeModel(() => state.claims));
Object.assign(db.claimLine, fakeModel(() => state.lines));

const SEEN = new Date("2026-09-10T08:00:00Z");
const member = {
  id: "m1", groupId: "g1", packageId: "pk1", benefitTierId: null, firstName: "Ada", lastName: "Fixture",
  memberNumber: "X11-0001", relationship: "PRINCIPAL", gender: "FEMALE", dateOfBirth: new Date("1990-01-01"),
  dependents: [], principal: null, group: { id: "g1", name: "Fixture Group", brokerId: null, county: null },
};
const provider = { id: "p1", name: "Fixture Clinic", tier: "PARTNER", type: "CLINIC", county: null };

function claim(id: string, status: string, billed: number, extra: Row = {}): Row {
  return {
    id, claimNumber: `CLM-${id}`, tenantId: "t1", providerId: "p1", memberId: "m1", caseId: null, status,
    serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", billedAmount: billed, approvedAmount: 0, paidAmount: 0,
    memberLiability: 0, dateOfService: SEEN, createdAt: SEEN, diagnoses: [], claimLines: [], coContributionTransaction: null,
    autoAdjDecision: null, turnaroundDays: null, assignedQueue: null, declineReasonCode: null, declineNotes: null,
    decidedAt: null, isInterimBill: false, settlementBatch: null, member, provider, ...extra,
  };
}

const APPROVED = claim("approved", "APPROVED", 100_000, {
  approvedAmount: 80_000, paidAmount: 80_000, memberLiability: 20_000, autoAdjDecision: "AUTO_APPROVE", turnaroundDays: 2,
  decidedAt: SEEN,
});
const RECEIVED = claim("received", "RECEIVED", 50_000, { assignedQueue: "NO_CONTRACT" });
const DECLINED = claim("declined", "DECLINED", 10_000, { declineReasonCode: "EXCLUDED", decidedAt: SEEN });
// A pre-decision copay estimate on the two that must not count, so a leak shows.
const WITHDRAWN = claim("withdrawn", "WITHDRAWN", 33_900, { memberLiability: 5_000, assignedQueue: "NO_CONTRACT" });
const SUPERSEDED = claim("superseded", "SUPERSEDED", 20_000, { memberLiability: 3_000 });
const FIXTURE = [APPROVED, RECEIVED, DECLINED, WITHDRAWN, SUPERSEDED];

function line(id: string, onClaim: Row, extra: Row): Row {
  return {
    id, claimId: onClaim.id, claim: onClaim, contractId: "k1", description: "Consultation", cptCode: null,
    billedAmount: 0, approvedAmount: 0, payerLiability: 0, shortfallAmount: 0, disallowedAmount: 0, providerWriteOff: 0,
    reasonCode: null, matchedRuleType: "CONTRACT_RATE", adjudicationDecision: null, declineReason: null, icdCode: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.claims = FIXTURE;
  state.lines = [];
});

describe("analytics facts (every analytics figure is a total)", () => {
  it("writes facts only for claims that count, and removes any a withdrawn or superseded claim had", async () => {
    state.claims = FIXTURE.map((c) => ({ ...c, claimLines: [{ id: `line-${c.id}`, billedAmount: c.billedAmount, approvedAmount: c.approvedAmount, icdCode: null }] }));
    db.analyticsEncounterFact.deleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await AnalyticsRefreshService.refreshEncounterFacts({ tenantId: "t1" });

    const written = db.analyticsEncounterFact.upsert.mock.calls.map((call) => (call as unknown as [{ where: { sourceKey: string } }])[0].where.sourceKey);
    expect(written.sort()).toEqual(["claim-line:line-approved", "claim-line:line-declined", "claim-line:line-received"]);
    expect(db.analyticsEncounterFact.deleteMany).toHaveBeenCalledWith({ where: { sourceClaimId: { in: ["withdrawn", "superseded"] } } });
    expect(result).toEqual({ claims: 5, facts: 3, removed: 2 });
  });

  it("deletes nothing when every claim counts", async () => {
    state.claims = [APPROVED, RECEIVED];
    const result = await AnalyticsRefreshService.refreshEncounterFacts({ tenantId: "t1" });
    expect(db.analyticsEncounterFact.deleteMany).not.toHaveBeenCalled();
    expect(result.removed).toBe(0);
  });
});

describe("Exclusion & Rejected rows", () => {
  it("lists withdrawn and superseded claims but marks them out of the totals", async () => {
    state.lines = [line("partial", APPROVED, { adjudicationDecision: "DECLINED", disallowedAmount: 4_000, description: "Frames" })];
    const rows = await getExclusionRejectionRows("t1");
    const byClaim = Object.fromEntries(rows.map((r) => [`${r.claimNumber}/${r.scope}`, r.inTotals]));
    expect(byClaim).toEqual({
      "CLM-declined/Whole claim": true,
      "CLM-withdrawn/Whole claim": false,
      "CLM-superseded/Whole claim": false,
      "CLM-approved/Frames": true,
    });
  });
});

describe("tRPC reports.claimsSummary", () => {
  const ctx = {
    session: { user: { id: "u1", role: "SUPER_ADMIN", tenantId: "t1", permissions: effectivePermissions("SUPER_ADMIN") } },
    tenantId: "t1", clientId: undefined, prisma: db, user: { id: "u1", role: "SUPER_ADMIN" },
  };
  const caller = () => createCallerFactory(reportsRouter as any)(ctx as any) as any;

  it("totals the three that count; the status buckets and the claim list keep all five", async () => {
    const out = await caller().claimsSummary({ from: "2026-09-01", to: "2026-09-30" });
    expect(out.totalClaims).toBe(3);
    expect(out.totalBilled).toBe(160_000);
    expect(out.totalApproved).toBe(80_000);
    expect(out.totalPaid).toBe(80_000);
    expect(out.lossRatio).toBe(50);
    expect(out.byCategory).toEqual({ OUTPATIENT: 160_000 });
    expect(out.byStatus).toEqual({ APPROVED: 1, RECEIVED: 1, DECLINED: 1, WITHDRAWN: 1, SUPERSEDED: 1 });
    expect(out.claims).toHaveLength(5);
  });
});

describe("member care history", () => {
  it("lists every encounter but sums only the ones that count", async () => {
    db.user.findUnique.mockResolvedValue({ member: { id: "m1", tenantId: "t1", dependents: [], principal: null } });
    const history = await MemberAppService.getEncounterHistoryForUser("u1", "t1");
    expect(history!.encounters).toHaveLength(5);
    expect(history!.summary).toEqual({
      totalBilled: 160_000,
      planApproved: 80_000,
      planPaid: 80_000,
      memberShare: 20_000,
      encounterCount: 3,
      privateEncounterCount: 0,
    });
  });
});

describe("inpatient case reconciliation", () => {
  it("keeps a withdrawn or superseded slice in the slices, out of approved/member share/slice count", async () => {
    const onCase = (id: string, status: string, extra: Row) => claim(id, status, 0, { caseId: "case1", ...extra });
    state.claims = [
      onCase("s1", "APPROVED", { isInterimBill: true, approvedAmount: 100, memberLiability: 10, settlementBatch: { status: "SETTLED", settledAt: SEEN } }),
      onCase("s2", "WITHDRAWN", { isInterimBill: true, approvedAmount: 50, memberLiability: 5 }),
      onCase("s3", "SUPERSEDED", { isInterimBill: true, memberLiability: 7 }),
      onCase("s4", "RECEIVED", { isInterimBill: false, memberLiability: 2 }),
    ];
    const recon = await CaseService.getCaseReconciliation("t1", "case1");
    expect(recon.approvedToDate).toBe(100);
    expect(recon.paidToDate).toBe(100);
    expect(recon.outstanding).toBe(0);
    expect(recon.memberShare).toBe(12);
    expect(recon.sliceCount).toBe(1);
    expect(recon.slices.map((s) => s.status)).toEqual(["APPROVED", "WITHDRAWN", "SUPERSEDED", "RECEIVED"]);
  });
});

describe("contract analytics", () => {
  beforeEach(() => {
    state.lines = [
      line("l1", APPROVED, { billedAmount: 100_000, payerLiability: 80_000, shortfallAmount: 20_000, reasonCode: { code: "PRC-001" } }),
      line("l2", WITHDRAWN, { billedAmount: 33_900, payerLiability: 33_900, reasonCode: { code: "SVC-002" }, matchedRuleType: "UNLISTED_PAY_AS_BILLED", description: "Physio" }),
      line("l3", SUPERSEDED, { billedAmount: 20_000, shortfallAmount: 5_000, reasonCode: { code: "PRC-001" }, matchedRuleType: "UNLISTED_PAY_AS_BILLED", description: "Physio" }),
      line("l4", RECEIVED, { billedAmount: 50_000, payerLiability: 50_000, reasonCode: { code: "SVC-002" }, matchedRuleType: "UNLISTED_PAY_AS_BILLED", description: "Physio" }),
    ];
  });

  it("claims by contract, short-paid, backlog and leakage count only lines of claims that count", async () => {
    const [byContract] = await ContractAnalyticsService.claimsByContract("t1");
    expect(byContract).toMatchObject({ lineCount: 2, billed: 150_000, payable: 130_000, shortfall: 20_000 });
    expect(await ContractAnalyticsService.shortPaidSummary("t1")).toEqual({ lines: 1, shortfallTotal: 20_000 });
    const backlog = await ContractAnalyticsService.amendmentBacklog("t1");
    expect(backlog.map((b) => [b.description, b.count, b.billedAtRisk])).toEqual([["Physio", 1, 50_000]]);
    expect(await ContractAnalyticsService.providerLeakage("t1")).toEqual({ lines: 1, unlistedSpend: 50_000 });
  });

  it("turnaround counts the three claims that count", async () => {
    expect(await ContractAnalyticsService.turnaround("t1")).toEqual({
      totalClaims: 3, autoApproved: 1, autoApprovedPct: 33.3, avgTurnaroundDays: 2,
    });
  });

  it("queue load is a work count and keeps every queued claim", async () => {
    expect(await ContractAnalyticsService.queueLoad("t1")).toEqual([{ queue: "NO_CONTRACT", count: 2 }]);
  });
});
