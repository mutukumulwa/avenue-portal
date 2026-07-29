/**
 * F5.6 — pure claim-withdrawal policy (server-computed allowed action).
 *
 * providerCanWithdraw is the exact predicate the F5.5 service enforces, evaluated
 * purely so the page can hide the control the actor may not use. No DB, no session.
 */
import { describe, it, expect } from "vitest";
import type { ClaimStatus } from "@prisma/client";
import {
  providerCanWithdraw,
  CLAIM_WITHDRAWABLE_STATUSES,
  WITHDRAW_PERMISSION,
} from "@/server/services/claim-withdrawal/policy";

const base = {
  status: "RECEIVED" as ClaimStatus,
  providerBranchId: null,
  decidedAt: null,
  paidAt: null,
  paymentVoucherId: null,
  settlementBatchId: null,
};
const ctx = (over: Partial<{ permissions: string[]; allowedProviderBranchIds: string[] }> = {}) => ({
  permissions: [WITHDRAW_PERMISSION],
  allowedProviderBranchIds: [] as string[],
  ...over,
});

describe("F5.6 providerCanWithdraw", () => {
  it("the withdrawable set is exactly the pre-decision statuses (derived from the graph)", () => {
    expect([...CLAIM_WITHDRAWABLE_STATUSES].sort()).toEqual(["CAPTURED", "INCURRED", "RECEIVED", "UNDER_REVIEW"]);
    expect(CLAIM_WITHDRAWABLE_STATUSES).not.toContain("WITHDRAWN");
  });

  it("allows every pre-decision status with the permission and no branch/financial", () => {
    for (const status of CLAIM_WITHDRAWABLE_STATUSES) {
      expect(providerCanWithdraw(ctx(), { ...base, status })).toBe(true);
    }
  });

  it("hides the action without the explicit permission (strict — no legacy fallback)", () => {
    expect(providerCanWithdraw(ctx({ permissions: ["provider.claim.read"] }), base)).toBe(false);
    expect(providerCanWithdraw(ctx({ permissions: [] }), base)).toBe(false);
  });

  it("hides the action for a decided/terminal status", () => {
    for (const status of ["APPROVED", "PARTIALLY_APPROVED", "PAID", "DECLINED", "VOID", "SUPERSEDED", "APPEALED"] as ClaimStatus[]) {
      expect(providerCanWithdraw(ctx(), { ...base, status })).toBe(false);
    }
  });

  it("enforces branch scope on a branch-stamped claim", () => {
    expect(providerCanWithdraw(ctx({ allowedProviderBranchIds: ["b2"] }), { ...base, providerBranchId: "b1" })).toBe(false);
    expect(providerCanWithdraw(ctx({ allowedProviderBranchIds: ["b1"] }), { ...base, providerBranchId: "b1" })).toBe(true);
    // a null branch (legacy/single-branch) needs no branch grant
    expect(providerCanWithdraw(ctx({ allowedProviderBranchIds: [] }), { ...base, providerBranchId: null })).toBe(true);
  });

  it("hides the action when any money fact already exists", () => {
    expect(providerCanWithdraw(ctx(), { ...base, decidedAt: new Date() })).toBe(false);
    expect(providerCanWithdraw(ctx(), { ...base, paidAt: new Date() })).toBe(false);
    expect(providerCanWithdraw(ctx(), { ...base, paymentVoucherId: "v1" })).toBe(false);
    expect(providerCanWithdraw(ctx(), { ...base, settlementBatchId: "s1" })).toBe(false);
  });
});
