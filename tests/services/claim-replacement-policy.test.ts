/**
 * F5.8 — pure claim-correction policy (server-computed allowed action).
 *
 * providerCanCorrect is the exact predicate the F5.7 service enforces, evaluated purely
 * so the page can hide the "Correct claim" entry the actor may not use. No DB, no session.
 */
import { describe, it, expect } from "vitest";
import type { ClaimStatus } from "@prisma/client";
import { providerCanCorrect, CLAIM_SUPERSEDABLE_STATUSES, CORRECT_PERMISSION } from "@/server/services/claim-replacement/policy";

const base = {
  status: "RECEIVED" as ClaimStatus,
  providerBranchId: null,
  supersededByClaimId: null,
  decidedAt: null,
  paidAt: null,
  paymentVoucherId: null,
  settlementBatchId: null,
};
const ctx = (over: Partial<{ permissions: string[]; allowedProviderBranchIds: string[] }> = {}) => ({
  permissions: [CORRECT_PERMISSION],
  allowedProviderBranchIds: [] as string[],
  ...over,
});

describe("F5.8 providerCanCorrect", () => {
  it("the supersedable set is the pre-decision statuses (SUPERSEDED not reachable from INCURRED)", () => {
    expect([...CLAIM_SUPERSEDABLE_STATUSES].sort()).toEqual(["CAPTURED", "RECEIVED", "UNDER_REVIEW"]);
    expect(CLAIM_SUPERSEDABLE_STATUSES).not.toContain("SUPERSEDED");
    expect(CLAIM_SUPERSEDABLE_STATUSES).not.toContain("INCURRED");
  });

  it("allows each supersedable status with the permission", () => {
    for (const status of CLAIM_SUPERSEDABLE_STATUSES) expect(providerCanCorrect(ctx(), { ...base, status })).toBe(true);
  });

  it("hides without the explicit permission (strict — no legacy fallback)", () => {
    expect(providerCanCorrect(ctx({ permissions: ["provider.claim.read"] }), base)).toBe(false);
    expect(providerCanCorrect(ctx({ permissions: [] }), base)).toBe(false);
  });

  it("hides an already-superseded claim", () => {
    expect(providerCanCorrect(ctx(), { ...base, supersededByClaimId: "child-1" })).toBe(false);
    expect(providerCanCorrect(ctx(), { ...base, status: "SUPERSEDED" })).toBe(false);
  });

  it("hides a decided/terminal claim", () => {
    for (const status of ["APPROVED", "PAID", "DECLINED", "VOID", "WITHDRAWN"] as ClaimStatus[]) {
      expect(providerCanCorrect(ctx(), { ...base, status })).toBe(false);
    }
  });

  it("enforces branch scope on a branch-stamped claim", () => {
    expect(providerCanCorrect(ctx({ allowedProviderBranchIds: ["b2"] }), { ...base, providerBranchId: "b1" })).toBe(false);
    expect(providerCanCorrect(ctx({ allowedProviderBranchIds: ["b1"] }), { ...base, providerBranchId: "b1" })).toBe(true);
  });

  it("hides when a money fact already exists", () => {
    expect(providerCanCorrect(ctx(), { ...base, decidedAt: new Date() })).toBe(false);
    expect(providerCanCorrect(ctx(), { ...base, settlementBatchId: "s1" })).toBe(false);
  });
});
