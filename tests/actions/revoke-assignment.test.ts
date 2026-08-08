/**
 * DEF-002 — revoking a dynamic role assignment from Users & Access.
 *
 * Acceptance requirements exercised here:
 *  - 6: an expired/revoked assignment leaves effective access WITHOUT deleting
 *       the audit history.
 *  - 7: a crafted request cannot reach an assignment outside the operator's
 *       tenant.
 *  - 8: the change invalidates the target's live session.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  userRoleAssignment: { findFirst: vi.fn(), update: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "admin-1", tenantId: "t1" } }),
  ROLES: { ADMIN_ONLY: "ADMIN_ONLY" },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revokeAssignmentAction } from "@/app/(admin)/settings/users/[id]/actions";

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
};

const liveAssignment = {
  id: "a1",
  isActive: true,
  role: { code: "SENIOR_UNDERWRITER" },
};

beforeEach(() => vi.clearAllMocks());

describe("revokeAssignmentAction", () => {
  it("scopes the lookup to the operator's tenant and the named user", async () => {
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(liveAssignment);

    await revokeAssignmentAction(fd({ assignmentId: "a1", userId: "u1" }));

    const where = mockPrisma.userRoleAssignment.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "a1", tenantId: "t1", userId: "u1" });
  });

  it("marks the assignment revoked instead of deleting it", async () => {
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(liveAssignment);

    await revokeAssignmentAction(fd({ assignmentId: "a1", userId: "u1" }));

    const data = mockPrisma.userRoleAssignment.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ isActive: false, status: "REVOKED", revokedById: "admin-1" });
    expect(data.revokedAt).toBeInstanceOf(Date);
  });

  it("invalidates the target's live session", async () => {
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(liveAssignment);

    await revokeAssignmentAction(fd({ assignmentId: "a1", userId: "u1" }));

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
    });
  });

  it("writes the revocation to the audit trail", async () => {
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(liveAssignment);

    await revokeAssignmentAction(fd({ assignmentId: "a1", userId: "u1" }));

    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_ASSIGNMENT_REVOKED",
        metadata: expect.objectContaining({ targetUserId: "u1", roleCode: "SENIOR_UNDERWRITER" }),
      }),
    );
  });

  it("is a silent no-op for an assignment in another tenant", async () => {
    // findFirst is tenant-scoped, so a foreign id resolves to null and the
    // response is indistinguishable from an unknown id (non-enumerating).
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue(null);

    await revokeAssignmentAction(fd({ assignmentId: "foreign", userId: "u1" }));

    expect(mockPrisma.userRoleAssignment.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("does not re-revoke an already inactive assignment", async () => {
    mockPrisma.userRoleAssignment.findFirst.mockResolvedValue({ ...liveAssignment, isActive: false });

    await revokeAssignmentAction(fd({ assignmentId: "a1", userId: "u1" }));

    expect(mockPrisma.userRoleAssignment.update).not.toHaveBeenCalled();
  });

  it("ignores a request missing either identifier", async () => {
    await revokeAssignmentAction(fd({ assignmentId: "a1" }));
    expect(mockPrisma.userRoleAssignment.findFirst).not.toHaveBeenCalled();
  });
});
