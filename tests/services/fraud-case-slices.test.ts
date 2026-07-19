import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * IPL-PA-01 (A5) — the two heuristic rules that would false-fire on interim
 * slices are made case-aware before fraud screening is wired onto case-born
 * claims:
 *   RULE-GATE-001 (high-value-no-PA) counts the PAs that SECURE the claim
 *     case-inclusively — a slice authorised by a PA attached to its CASE is not
 *     "unlinked".
 *   RULE-VEL-001 (visit velocity) excludes same-case siblings — a weekly-sliced
 *     admission emits several claims that are one episode, not velocity.
 */
const db = vi.hoisted(() => ({
  claim: {
    findUnique: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    count: vi.fn(async () => 0),
  },
  providerTariff: { findFirst: vi.fn(async (): Promise<any> => null) },
  claimFraudAlert: { createMany: vi.fn(async (_a?: unknown) => ({ count: 0 })) },
  preAuthorization: { count: vi.fn(async (_a?: any) => 0) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FraudService } from "@/server/services/fraud.service";

const HIGH = 3_000_000; // well over the 150k high-value threshold

const sliceClaim = (over: Partial<any> = {}) => ({
  id: "slice1",
  tenantId: "t1",
  serviceType: "INPATIENT",
  currency: "UGX",
  billedAmount: HIGH,
  dateOfService: new Date("2026-08-01"),
  dischargeDate: null,
  memberId: "m1",
  providerId: "p1",
  caseId: "case1",
  claimLines: [],
  member: { gender: "MALE", claims: [] },
  ...over,
});

async function rulesFor(claim: any) {
  db.claim.findUnique.mockResolvedValue(claim);
  await FraudService.evaluateClaim(claim.id, "t1");
  const call = db.claimFraudAlert.createMany.mock.calls[0]?.[0] as
    | { data: Array<{ rule: string }> }
    | undefined;
  return (call?.data ?? []).map((a) => a.rule);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.claim.findMany.mockResolvedValue([]);
  db.providerTariff.findFirst.mockResolvedValue(null);
});

describe("RULE-GATE-001 — high-value-without-PA is case-aware", () => {
  it("does NOT flag a high-value slice whose CASE has a PA (securingPaCount > 0)", async () => {
    db.preAuthorization.count.mockResolvedValue(1); // a case-attached PA secures it
    const rules = await rulesFor(sliceClaim());
    expect(rules).not.toContain("High Value Without Pre-Authorization");
    // the count was asked case-inclusively (OR on claimId/caseId)
    const where = (db.preAuthorization.count.mock.calls[0]?.[0] as any)?.where;
    expect(where.OR).toEqual([{ claimId: "slice1" }, { caseId: "case1" }]);
  });

  it("DOES flag a high-value slice whose case has no PA at all", async () => {
    db.preAuthorization.count.mockResolvedValue(0);
    const rules = await rulesFor(sliceClaim());
    expect(rules).toContain("High Value Without Pre-Authorization");
  });

  it("a non-case claim still uses the claimId-only PA count", async () => {
    db.preAuthorization.count.mockResolvedValue(0);
    await rulesFor(sliceClaim({ caseId: null }));
    const where = (db.preAuthorization.count.mock.calls[0]?.[0] as any)?.where;
    expect(where.claimId).toBe("slice1");
    expect(where.OR).toBeUndefined();
  });
});

describe("RULE-VEL-001 — visit velocity excludes same-case siblings", () => {
  it("does NOT flag when the recent claims are all siblings of the same case", async () => {
    db.preAuthorization.count.mockResolvedValue(1); // silence RULE-GATE-001
    // 6 recent claims, all on case1 → all excluded → velocity 0.
    const siblings = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, caseId: "case1" }));
    const rules = await rulesFor(sliceClaim({ member: { gender: "MALE", claims: siblings } }));
    expect(rules).not.toContain("Suspicious Visit Velocity");
  });

  it("DOES flag when the recent claims are on DIFFERENT cases (genuine velocity)", async () => {
    db.preAuthorization.count.mockResolvedValue(1);
    const others = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, caseId: `other${i}` }));
    const rules = await rulesFor(sliceClaim({ member: { gender: "MALE", claims: others } }));
    expect(rules).toContain("Suspicious Visit Velocity");
  });
});
