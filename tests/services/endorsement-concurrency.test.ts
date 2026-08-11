/**
 * FG-C6 (SYS-1): endorsement approval must be concurrency-safe. The status
 * transition is the atomic gate — a concurrent second approval matches 0 rows
 * on the status-guarded updateMany and throws BEFORE any side effect (member
 * change / GL / invoice), so two checkers can't double-apply one endorsement.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async () => true) }));

const db = vi.hoisted(() => ({
  endorsement: {
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
    // WP-E1: the apply path now writes before/after snapshots via endorsement.update.
    update: vi.fn(async () => ({})),
  },
  // WP-E1: a leaver's prior state is read (before-snapshot) before termination.
  member: { update: vi.fn(async () => ({ id: "m1" })), findUnique: vi.fn(async () => null) },
  // WP-3.5E: MEMBER_DELETION now closes the leaver's coverage period.
  memberCoveragePeriod: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})) },
  // WP-E1: day-count pro-rata reads the group; null → skipped (no contribution to prorate).
  group: { findUnique: vi.fn(async () => null) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// WP-E1: E-004 approver-role matrix resolves via rbacService.hasRole.
vi.mock("@/server/services/rbac.service", () => ({ rbacService: rbac }));
// WP-3.5G: the MEMBER_DELETION apply path now audits via the chain service.
vi.mock("@/server/services/audit-chain.service", () => ({
  auditChainService: { append: vi.fn(async () => ({})) },
}));

import { EndorsementsService } from "@/server/services/endorsement.service";

// A MEMBER_DELETION with no pro-rata skips the GL/invoice path, so the test
// stays focused on the atomic decision gate.
const submittedDeletion = () => ({
  id: "e1",
  tenantId: "t1",
  status: "SUBMITTED",
  requestedBy: "maker",
  type: "MEMBER_DELETION",
  // WP-E1: sourceReference satisfies the E-015 material-evidence control.
  changeDetails: { memberId: "m1", sourceReference: "HR-LTR-2026-0007" },
  proratedAmount: 0,
  groupId: "g1",
  // No effectiveDate → not back-dated → E-007 override not required.
  endorsementNumber: "END-2026-00001",
});

beforeEach(() => {
  vi.clearAllMocks();
  rbac.hasRole.mockResolvedValue(true);
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
