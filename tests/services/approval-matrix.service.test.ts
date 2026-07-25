import { describe, it, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const db = vi.hoisted(() => ({
  approvalMatrix: {
    findMany: vi.fn(),
    count: vi.fn(),
    createMany: vi.fn(async (_a: any) => ({ count: 3 })),
    create: vi.fn(async (_a: any) => ({ id: "r-auto" })),
  },
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

    // ── PR-017: FX-correct band matching ─────────────────────────────────────
    it("converts a KES amount to UGX before band matching (PR-017 #1)", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([
        rule({ id: "low", claimValueMin: 0, claimValueMax: 200_000, requiredRole: "CLAIMS_OFFICER" }),
        rule({ id: "dual", claimValueMin: 200_001, claimValueMax: null, requiredRole: "MEDICAL_OFFICER", requiresDual: true }),
      ]);
      db.fxRate.findFirst.mockResolvedValue({ rate: 27 }); // 1 KES = 27 UGX
      const r = await ApprovalMatrixService.resolve(T, {
        actionType: "CLAIM_PAYMENT",
        amount: 86_000,
        currency: "KES", // ≈ UGX 2,322,000 — must hit the dual band, not "low"
      });
      expect(r?.matrix.id).toBe("dual");
      expect(r?.steps).toHaveLength(2);
      expect(r?.failSafe).toBe(false);
      expect(r?.baseAmount).toBe(86_000 * 27);
      expect(r?.fxRate).toBe(27);
    });

    it("missing FX rate fails safe to the most demanding rule (PR-017 D1)", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([
        rule({ id: "low", claimValueMin: 0, claimValueMax: 200_000, requiredRole: "CLAIMS_OFFICER" }),
        rule({ id: "dual", claimValueMin: 200_001, claimValueMax: null, requiredRole: "MEDICAL_OFFICER", requiresDual: true }),
      ]);
      db.fxRate.findFirst.mockResolvedValue(null); // no KES rate in force
      const r = await ApprovalMatrixService.resolve(T, {
        actionType: "CLAIM_PAYMENT",
        amount: 100, // tiny — would band-match "low" if the identity leak survived
        currency: "KES",
      });
      expect(r?.failSafe).toBe(true);
      expect(r?.matrix.id).toBe("dual"); // never the lowest band
      expect(r?.steps.length).toBeGreaterThan(1);
    });

    it("uses the rate effective at the decision date, not the latest row (PR-017 #4)", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([
        rule({ id: "band", claimValueMin: 2_000_000, claimValueMax: null, requiredRole: "FINANCE_OFFICER" }),
      ]);
      const asOf = new Date("2026-03-01");
      db.fxRate.findFirst.mockImplementation(async (args: any) => {
        // The query must constrain effectiveFrom ≤ atDate — assert and answer
        // with the rate that was in force then (25, not today's 29).
        expect(args.where.effectiveFrom.lte).toEqual(asOf);
        return { rate: 25 };
      });
      const r = await ApprovalMatrixService.resolve(T, {
        actionType: "CLAIM_PAYMENT",
        amount: 86_000,
        currency: "KES",
        atDate: asOf,
      });
      expect(r?.baseAmount).toBe(86_000 * 25);
      expect(r?.matrix.id).toBe("band");
    });

    // ── F76-GAP-02: governed policy changes carry no claim value ─────────────
    it("resolves a null-amount policy change on the action type alone (AUTO_ADJ_POLICY_CHANGE)", async () => {
      db.approvalMatrix.findMany.mockResolvedValue([
        rule({ id: "auto", actionType: "AUTO_ADJ_POLICY_CHANGE", requiredRole: "FINANCE_OFFICER", claimValueMin: null, claimValueMax: null }),
      ]);
      const r = await ApprovalMatrixService.resolve(T, {
        actionType: "AUTO_ADJ_POLICY_CHANGE",
        currency: "UGX",
      });
      expect(r).not.toBeNull();
      expect(r!.matrix.id).toBe("auto");
      expect(r!.matrix.requiredRole).toBe("FINANCE_OFFICER");
      expect(r!.baseAmount).toBeNull();
      expect(r!.failSafe).toBe(false);
    });
  });

  describe("seedForTenant (A3-OBS-01 / F76-GAP-02 — default matrix on provisioning)", () => {
    it("seeds the 3 CLAIM_PAYMENT bands + the AUTO_ADJ_POLICY_CHANGE checker on a fresh tenant", async () => {
      db.approvalMatrix.count.mockResolvedValue(0);
      const n = await ApprovalMatrixService.seedForTenant(T);
      expect(n).toBe(4);
      // Three claim-payment bands via createMany.
      expect(db.approvalMatrix.createMany).toHaveBeenCalledOnce();
      const bands = (db.approvalMatrix.createMany.mock.calls[0][0] as { data: any[] }).data;
      expect(bands).toHaveLength(3);
      // The inpatient >200k dual-approval rule is present (the register's A3 control).
      expect(bands).toContainEqual(
        expect.objectContaining({ serviceType: "INPATIENT", claimValueMin: 200000, requiredRole: "UNDERWRITER", requiresDual: true }),
      );
      // The governed policy-change checker via create — FINANCE_OFFICER, no bands.
      expect(db.approvalMatrix.create).toHaveBeenCalledOnce();
      expect(db.approvalMatrix.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: "AUTO_ADJ_POLICY_CHANGE",
            requiredRole: "FINANCE_OFFICER",
            requiresDual: false,
            claimValueMin: null,
            claimValueMax: null,
          }),
        }),
      );
    });

    it("backfills only the policy rule when claim-payment bands already exist (re-provision)", async () => {
      // existingClaim > 0 (skip bands), existingPolicy === 0 (seed the policy rule).
      db.approvalMatrix.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
      const n = await ApprovalMatrixService.seedForTenant(T);
      expect(n).toBe(1);
      expect(db.approvalMatrix.createMany).not.toHaveBeenCalled();
      expect(db.approvalMatrix.create).toHaveBeenCalledOnce();
    });

    it("is fully idempotent — leaves an already-configured matrix untouched", async () => {
      db.approvalMatrix.count.mockResolvedValue(3); // both action types already present
      const n = await ApprovalMatrixService.seedForTenant(T);
      expect(n).toBe(0);
      expect(db.approvalMatrix.createMany).not.toHaveBeenCalled();
      expect(db.approvalMatrix.create).not.toHaveBeenCalled();
    });
  });
});
