/**
 * FG-C6 (SYS-1): endorsement approval must be concurrency-safe. The status
 * transition is the atomic gate — a concurrent second approval matches 0 rows
 * on the status-guarded updateMany and throws BEFORE any side effect (member
 * change / GL / invoice), so two checkers can't double-apply one endorsement.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  endorsement: {
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  member: { update: vi.fn(async () => ({ id: "m1" })) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { EndorsementsService } from "@/server/services/endorsement.service";

// A MEMBER_DELETION with no pro-rata skips the GL/invoice path, so the test
// stays focused on the atomic decision gate.
const submittedDeletion = () => ({
  id: "e1",
  tenantId: "t1",
  status: "SUBMITTED",
  requestedBy: "maker",
  type: "MEMBER_DELETION",
  changeDetails: { memberId: "m1" },
  proratedAmount: 0,
  groupId: "g1",
  endorsementNumber: "END-2026-00001",
});

beforeEach(() => {
  vi.clearAllMocks();
  db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
  db.endorsement.updateMany.mockResolvedValue({ count: 1 });
});

describe("approveEndorsement — atomic decision gate (FG-C6)", () => {
  it("claims the endorsement with a status-guarded updateMany, then applies the change", async () => {
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.endorsement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "e1", tenantId: "t1", status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }),
        data: expect.objectContaining({ status: "APPLIED" }),
      }),
    );
    expect(db.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m1" }, data: expect.objectContaining({ status: "TERMINATED" }) }),
    );
  });

  it("a concurrent second approval loses the gate — throws, no member change", async () => {
    db.endorsement.updateMany.mockResolvedValueOnce({ count: 0 }); // winner already applied
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "checker"),
    ).rejects.toThrow(/just actioned by another reviewer/i);
    expect(db.member.update).not.toHaveBeenCalled();
  });

  it("still blocks self-approval (SoD) before the gate", async () => {
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "maker"),
    ).rejects.toThrow(/Segregation of duties/i);
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
  });
});
