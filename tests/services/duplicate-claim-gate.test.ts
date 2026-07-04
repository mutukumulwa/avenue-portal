/**
 * PR-012 acceptance: the double-capture rule must never flag a claim as its
 * own duplicate, must name the other claim(s) found, and must ignore
 * VOID/DECLINED priors.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findFirst: vi.fn(), findMany: vi.fn() },
  member: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";

const T = "t1";
const base = {
  providerId: "prov1",
  memberId: "mem1",
  dateOfService: new Date("2026-07-01"),
  benefitCategory: "OUTPATIENT",
};

function memberOk() {
  db.member.findUnique.mockResolvedValue({
    coverStartDate: new Date("2026-01-01"),
    coverEndDate: new Date("2026-12-31"),
    status: "ACTIVE",
    gender: "FEMALE",
  });
}

describe("duplicate-claim hard gate (PR-012)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberOk();
    db.claim.findFirst.mockResolvedValue(null);
    db.claim.findMany.mockResolvedValue([]);
  });

  it("unique combo → no duplicate flag", async () => {
    const res = await claimAdjudicationService.runHardGateValidation(T, { ...base, excludeClaimId: "self" });
    expect(res.passed).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("excludes the claim under evaluation from the duplicate query", async () => {
    await claimAdjudicationService.runHardGateValidation(T, {
      ...base,
      invoiceNumber: "INV-1",
      excludeClaimId: "self-id",
    });
    const dupWhere = db.claim.findMany.mock.calls[0][0].where;
    expect(dupWhere.id).toEqual({ not: "self-id" });
    const invWhere = db.claim.findFirst.mock.calls[0][0].where;
    expect(invWhere.id).toEqual({ not: "self-id" });
  });

  it("a true duplicate flags with the other claim's number", async () => {
    db.claim.findMany.mockResolvedValue([{ claimNumber: "CLM-2026-00001" }]);
    const res = await claimAdjudicationService.runHardGateValidation(T, { ...base, excludeClaimId: "second" });
    expect(res.passed).toBe(false);
    expect(res.errors.join(" ")).toContain("CLM-2026-00001");
  });

  it("VOID and DECLINED priors do not block (status filter excludes them)", async () => {
    await claimAdjudicationService.runHardGateValidation(T, base);
    const dupWhere = db.claim.findMany.mock.calls[0][0].where;
    expect(dupWhere.status).toEqual({ notIn: ["VOID", "DECLINED"] });
  });

  it("both duplicate queries are tenant-scoped", async () => {
    await claimAdjudicationService.runHardGateValidation(T, { ...base, invoiceNumber: "INV-9" });
    expect(db.claim.findMany.mock.calls[0][0].where.tenantId).toBe(T);
    expect(db.claim.findFirst.mock.calls[0][0].where.tenantId).toBe(T);
  });
});
