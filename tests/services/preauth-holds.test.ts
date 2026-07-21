/**
 * PR-011 acceptance — pre-auth approval places a BenefitHold; lifecycle
 * complete (expiry sweep, cancel release, upserted usage rows, status guards).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    preAuthorization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 4),
    },
    benefitHold: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async (): Promise<any[]> => []),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    member: { findUnique: vi.fn() },
    benefitConfig: { findFirst: vi.fn() },
    benefitUsage: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async (): Promise<any[]> => []),
      create: vi.fn(async (a: any) => a.data),
      update: vi.fn(async (a: any) => a.data),
    },
    benefitConfigSharedLimit: { findMany: vi.fn(async (): Promise<any[]> => []) },
    auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";

const T = "t1";
const pa = (over: Partial<any> = {}) => ({
  id: "pa1",
  tenantId: T,
  preauthNumber: "PA-2026-00009",
  memberId: "m1",
  benefitCategory: "INPATIENT",
  estimatedCost: 85000,
  status: "UNDER_REVIEW",
  claimId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.preAuthorization.findUnique.mockResolvedValue(pa());
  db.member.findUnique.mockResolvedValue({ packageVersionId: "pv1", enrollmentDate: new Date("2026-01-15") });
  db.benefitConfig.findFirst.mockResolvedValue({ id: "cfg1", annualSubLimit: 500000 });
  db.benefitUsage.findUnique.mockResolvedValue(null);
  db.benefitHold.findUnique.mockResolvedValue(null);
});

describe("approveByHuman — canonical PA approval (PR-011)", () => {
  it("FG-C8: a concurrent decide loses the atomic gate — CONFLICT, no phantom hold", async () => {
    // Another reviewer already decided the PA, so the status-guarded updateMany
    // matches 0 rows for this approval (its pre-check saw the stale SUBMITTED PA).
    db.preAuthorization.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      preauthAdjudicationService.approveByHuman("pa1", T, "u1", 85000, undefined, 30),
    ).rejects.toThrow(/just decided by another reviewer/i);
    // The hold is placed AFTER the atomic gate, so a lost race leaves no phantom hold.
    expect(db.benefitHold.upsert).not.toHaveBeenCalled();
  });

  it("IP-DEF-01: the reviewer's approval note persists to the real reviewNotes column", async () => {
    await preauthAdjudicationService.approveByHuman("pa1", T, "u1", 85000, "Clinically indicated — repeat scan", 30);
    const paUpdate = db.preAuthorization.updateMany.mock.calls[0][0].data;
    expect(paUpdate.reviewNotes).toBe("Clinically indicated — repeat scan");
    expect(paUpdate.status).toBe("APPROVED");
  });

  it("approves with a hold: BenefitHold ACTIVE for the amount, expiry = validUntil, activeHoldAmount upserted", async () => {
    await preauthAdjudicationService.approveByHuman("pa1", T, "u1", 85000, undefined, 30);

    // PA approved with a 30-day validity window (via the FG-C8 atomic status claim)
    const paUpdate = db.preAuthorization.updateMany.mock.calls[0][0].data;
    expect(paUpdate.status).toBe("APPROVED");
    expect(db.preAuthorization.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "pa1", status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
    });
    const days = Math.round((paUpdate.validUntil.getTime() - Date.now()) / 86400000);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);

    // Hold row upserted for the approved amount
    expect(db.benefitHold.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { preAuthId: "pa1" },
        create: expect.objectContaining({ heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT" }),
      }),
    );
    // BenefitUsage row CREATED (member had none) with the held amount — the
    // pre-remediation updateMany silently no-opped here.
    expect(db.benefitUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ benefitConfigId: "cfg1", activeHoldAmount: 85000, amountUsed: 0 }),
      }),
    );
  });

  it("P1.2 (DEC-04): hard-blocks an approval above availability with a partial-to-availability suggestion", async () => {
    // 480k of 500k used → 20k available; an 85k approval is BLOCKED (the
    // pre-P1 behaviour merely annotated the shortfall and approved anyway).
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 480000, activeHoldAmount: 0 });
    await expect(
      preauthAdjudicationService.approveByHuman("pa1", T, "u1", 85000),
    ).rejects.toThrow(/BENEFIT_CATEGORY_EXHAUSTED[\s\S]*Approve up to UGX 20,000/);
    // Nothing was decided and no hold was placed — the gate precedes the flip.
    expect(db.preAuthorization.updateMany).not.toHaveBeenCalled();
    expect(db.benefitHold.upsert).not.toHaveBeenCalled();
  });

  it("rejects a decision on an already-APPROVED PA (idempotency / double-hold guard)", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(pa({ status: "APPROVED" }));
    await expect(preauthAdjudicationService.approveByHuman("pa1", T, "u1", 85000)).rejects.toThrow(/current status/);
    expect(db.benefitHold.upsert).not.toHaveBeenCalled();
  });

  it("declineByHuman guards status the same way", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(pa({ status: "DECLINED" }));
    await expect(
      preauthAdjudicationService.declineByHuman("pa1", T, "u1", "NOT_COVERED", "x"),
    ).rejects.toThrow(/current status/);
  });
});

describe("hold lifecycle (PR-011 #3)", () => {
  it("cancel releases the hold in the same operation and restores activeHoldAmount", async () => {
    db.benefitHold.findUnique.mockResolvedValue({
      preAuthId: "pa1", status: "ACTIVE", heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT",
    });
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 0, activeHoldAmount: 85000 });

    await preauthAdjudicationService.cancelPreAuth("pa1", T, "u1", "member cancelled");

    expect(db.benefitHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RELEASED" }) }),
    );
    expect(db.benefitUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activeHoldAmount: { increment: -85000 } }) }),
    );
  });

  it("a UTILISED PA cannot be cancelled", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(pa({ status: "UTILISED" }));
    await expect(preauthAdjudicationService.cancelPreAuth("pa1", T, "u1", "x")).rejects.toThrow(/cannot be cancelled/);
  });

  it("the expiry sweep releases the hold, restores the amount, and marks the PA EXPIRED", async () => {
    db.benefitHold.findMany.mockResolvedValue([
      { preAuthId: "pa1", status: "ACTIVE", heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT", expiresAt: new Date("2026-06-01") },
    ]);
    db.benefitHold.findUnique.mockResolvedValue({
      preAuthId: "pa1", status: "ACTIVE", heldAmount: 85000, memberId: "m1", benefitCategory: "INPATIENT",
    });
    db.benefitUsage.findUnique.mockResolvedValue({ id: "bu1", amountUsed: 0, activeHoldAmount: 85000 });

    const released = await preauthAdjudicationService.releaseExpiredHolds(T);

    expect(released).toBe(1);
    expect(db.benefitHold.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RELEASED" }) }),
    );
    expect(db.preAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "pa1", status: "APPROVED", claimId: null }),
        data: { status: "EXPIRED" },
      }),
    );
  });
});
