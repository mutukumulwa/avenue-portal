import { describe, it, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const db = vi.hoisted(() => ({
  approvalMatrix: { findMany: vi.fn() },
  fxRate: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ApprovalMatrixService } from "@/server/services/approval-matrix.service";

const T = "t1";
const rule = (over: Partial<any>) => ({
  id: "r",
  tenantId: T,
  clientId: null,
  actionType: "CLAIM_PAYMENT",
  claimValueMin: null,
  claimValueMax: null,
  currency: "UGX",
  serviceType: null,
  benefitCategory: null,
  requiredRole: "CLAIMS_OFFICER",
  requiresDual: false,
  slaMinutes: null,
  escalationTargetRole: null,
  effectiveFrom: new Date("2026-01-01"),
  steps: [],
  ...over,
});

describe("ApprovalMatrixService — engine (G3.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("roleAuthorised", () => {
    it("a senior role satisfies a junior requirement", () => {
      expect(ApprovalMatrixService.roleAuthorised("SUPER_ADMIN", "CLAIMS_OFFICER")).toBe(true);
    });
    it("a junior role cannot satisfy a senior requirement", () => {
      expect(ApprovalMatrixService.roleAuthorised("CLAIMS_OFFICER", "FINANCE_OFFICER")).toBe(false);
    });
    it("an exact role match is authorised", () => {
      expect(ApprovalMatrixService.roleAuthorised("UNDERWRITER", "UNDERWRITER")).toBe(true);
    });
    it("no role is never authorised", () => {
      expect(ApprovalMatrixService.roleAuthorised(null, "CLAIMS_OFFICER")).toBe(false);
    });
  });

  describe("enforceSegregationOfDuties", () => {
    it("throws when maker === checker", () => {
      expect(() => ApprovalMatrixService.enforceSegregationOfDuties("u1", "u1")).toThrow(TRPCError);
    });
    it("passes when maker ≠ checker", () => {
      expect(() => ApprovalMatrixService.enforceSegregationOfDuties("u1", "u2")).not.toThrow();
    });
  });

  describe("expandSteps", () => {
    it("uses explicit ApprovalSteps, sorted by level", () => {
      const steps = ApprovalMatrixService.expandSteps(
        rule({
          steps: [
            { level: 2, requiredRole: "FINANCE_OFFICER", slaMinutes: null, escalationTargetRole: null },
            { level: 1, requiredRole: "CLAIMS_OFFICER", slaMinutes: 30, escalationTargetRole: "UNDERWRITER" },
          ],
        }) as any,
      );
      expect(steps.map((s) => s.level)).toEqual([1, 2]);
      expect(steps[0].requiredRole).toBe("CLAIMS_OFFICER");
    });
    it("falls back to a single legacy step from requiredRole", () => {
      expect(ApprovalMatrixService.expandSteps(rule({}) as any)).toHaveLength(1);
    });
    it("legacy requiresDual yields two steps", () => {
      expect(ApprovalMatrixService.expandSteps(rule({ requiresDual: true }) as any)).toHaveLength(2);
    });
  });

  describe("resolve", () => {
    it("returns null when no rule applies", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([]);
      expect(await ApprovalMatrixService.resolve(T, { actionType: "CLAIM_PAYMENT" })).toBeNull();
    });

    it("prefers a client-specific rule over an all-clients rule", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([
        rule({ id: "all", clientId: null, requiredRole: "CLAIMS_OFFICER" }),
        rule({ id: "c1", clientId: "c1", requiredRole: "FINANCE_OFFICER" }),
      ]);
      const r = await ApprovalMatrixService.resolve(T, { actionType: "CLAIM_PAYMENT", clientId: "c1" });
      expect(r?.matrix.id).toBe("c1");
    });

    it("respects the amount band (UGX identity)", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([
        rule({ id: "low", claimValueMin: 0, claimValueMax: 1_000_000, requiredRole: "CLAIMS_OFFICER" }),
        rule({ id: "high", claimValueMin: 1_000_001, claimValueMax: null, requiredRole: "FINANCE_OFFICER" }),
      ]);
      const r = await ApprovalMatrixService.resolve(T, {
        actionType: "CLAIM_PAYMENT",
        amount: 5_000_000,
        currency: "UGX",
      });
      expect(r?.matrix.id).toBe("high");
    });
  });
});
