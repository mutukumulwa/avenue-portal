import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn() },
  preAuthorization: { findUnique: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []), update: vi.fn(async (a: any) => a.data) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ClaimsService } from "@/server/services/claims.service";

const baseClaim = (over: any = {}) => ({
  id: "clm1", memberId: "m1", providerId: "p1", status: "RECEIVED", ...over,
});
const basePA = (over: any = {}) => ({
  id: "pa1", memberId: "m1", providerId: "p1", status: "APPROVED",
  claimId: null, validUntil: new Date(Date.now() + 86_400_000),
  preauthNumber: "PA-2026-00001", ...over,
});

describe("ClaimsService.attachPreauth (WP-C2 validation matrix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(baseClaim());
    db.preAuthorization.findUnique.mockResolvedValue(basePA());
  });

  it("attaches an approved in-window PA: sets claimId, attachedAt, ATTACHED", async () => {
    await ClaimsService.attachPreauth("t1", "clm1", "pa1");
    expect(db.preAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pa1" },
        data: expect.objectContaining({ claimId: "clm1", status: "ATTACHED" }),
      }),
    );
  });

  it("is idempotent when the PA is already attached to this claim", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(basePA({ claimId: "clm1" }));
    await ClaimsService.attachPreauth("t1", "clm1", "pa1");
    expect(db.preAuthorization.update).not.toHaveBeenCalled();
  });

  it("rejects a PA attached to another claim", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(basePA({ claimId: "other" }));
    await expect(ClaimsService.attachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/already attached/);
  });

  it("rejects a non-APPROVED PA", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(basePA({ status: "SUBMITTED" }));
    await expect(ClaimsService.attachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/APPROVED/);
  });

  it("rejects a wrong-member PA", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(basePA({ memberId: "m2" }));
    await expect(ClaimsService.attachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/different member/);
  });

  it("rejects a wrong-facility PA", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(basePA({ providerId: "p2" }));
    await expect(ClaimsService.attachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/different facility/);
  });

  it("rejects a PA past its validity window", async () => {
    db.preAuthorization.findUnique.mockResolvedValue(
      basePA({ validUntil: new Date(Date.now() - 86_400_000) }),
    );
    await expect(ClaimsService.attachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/validity window/);
  });

  it("rejects attachment to a terminal claim", async () => {
    db.claim.findUnique.mockResolvedValue(baseClaim({ status: "PAID" }));
    await expect(ClaimsService.attachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/PAID/);
  });
});

describe("ClaimsService.detachPreauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detaches an ATTACHED PA back to APPROVED", async () => {
    db.preAuthorization.findUnique.mockResolvedValue({ id: "pa1", claimId: "clm1", status: "ATTACHED" });
    await ClaimsService.detachPreauth("t1", "clm1", "pa1");
    expect(db.preAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { claimId: null, attachedAt: null, status: "APPROVED" },
      }),
    );
  });

  it("refuses to detach a UTILISED PA", async () => {
    db.preAuthorization.findUnique.mockResolvedValue({ id: "pa1", claimId: "clm1", status: "UTILISED" });
    await expect(ClaimsService.detachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/consumed/);
  });

  it("refuses when the PA is not attached to this claim", async () => {
    db.preAuthorization.findUnique.mockResolvedValue({ id: "pa1", claimId: "other", status: "ATTACHED" });
    await expect(ClaimsService.detachPreauth("t1", "clm1", "pa1")).rejects.toThrow(/not attached/);
  });
});

describe("ClaimsService.getPreauthCoverage (WP-C2 cap check)", () => {
  it("flags overage when billed exceeds attached PA cover (net of utilisation)", async () => {
    db.claim.findUnique.mockResolvedValue({ billedAmount: 500_000, caseId: null });
    db.preAuthorization.findMany.mockResolvedValue([
      { id: "pa1", preauthNumber: "PA-1", approvedAmount: 200_000, estimatedCost: 250_000, utilisedAmount: 0 },
      { id: "pa2", preauthNumber: "PA-2", approvedAmount: null, estimatedCost: 100_000, utilisedAmount: 0 },
    ]);
    const c = await ClaimsService.getPreauthCoverage("t1", "clm1");
    expect(c.approvedCover).toBe(300_000);
    expect(c.exceedsCover).toBe(true);
  });

  it("nets utilisation out of the cover (multi-slice episode)", async () => {
    db.claim.findUnique.mockResolvedValue({ billedAmount: 500_000, caseId: "case1" });
    db.preAuthorization.findMany.mockResolvedValue([
      { id: "pa1", preauthNumber: "PA-1", approvedAmount: 200_000, estimatedCost: 250_000, utilisedAmount: 150_000 },
    ]);
    const c = await ClaimsService.getPreauthCoverage("t1", "clm1");
    expect(c.approvedCover).toBe(50_000); // 200k − 150k already consumed by earlier slices
    expect(c.exceedsCover).toBe(true);
  });

  it("does not flag claims with no attached PAs", async () => {
    db.claim.findUnique.mockResolvedValue({ billedAmount: 500_000, caseId: null });
    db.preAuthorization.findMany.mockResolvedValue([]);
    const c = await ClaimsService.getPreauthCoverage("t1", "clm1");
    expect(c.exceedsCover).toBe(false);
  });
});
