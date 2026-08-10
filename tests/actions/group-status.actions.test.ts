import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
vi.mock("@/server/services/groups.service", () => {
  class InvalidGroupTransitionError extends Error {
    code = "INVALID_GROUP_TRANSITION" as const;
  }
  return {
    GroupsService: { changeGroupStatus: vi.fn() },
    InvalidGroupTransitionError,
  };
});

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "u1", tenantId: "t1", clientId: undefined } }),
  ROLES: { MEMBER_OPS: ["MEMBER_OPS"] },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { changeGroupStatusAction } from "@/app/(admin)/groups/[id]/status/actions";
import { GroupsService, InvalidGroupTransitionError } from "@/server/services/groups.service";

const svc = GroupsService.changeGroupStatus as unknown as ReturnType<typeof vi.fn>;

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  writeAudit.mockResolvedValue(undefined);
});

describe("changeGroupStatusAction — WP-S2", () => {
  it("suspends and writes a GROUP_SUSPENDED audit with before/after (S-005)", async () => {
    svc.mockResolvedValue({
      before: { status: "ACTIVE", suspendedAt: null, suspensionReason: null, terminatedAt: null },
      after: { status: "SUSPENDED", suspendedAt: "2026-09-01T00:00:00.000Z", suspensionReason: "overdue", terminatedAt: null },
      affectedMembers: 3,
      groupName: "Lakeview",
    });
    const res = await changeGroupStatusAction("g1", null, fd({ targetStatus: "SUSPENDED", reason: "overdue" }));
    expect(res.ok).toBe(true);
    expect(svc).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledOnce();
    const audit = writeAudit.mock.calls[0][0];
    expect(audit.action).toBe("GROUP_SUSPENDED");
    expect(audit.module).toBe("GROUPS");
    expect(JSON.parse(audit.metadata.before).status).toBe("ACTIVE");
    expect(JSON.parse(audit.metadata.after).status).toBe("SUSPENDED");
    expect(audit.metadata.affectedMembers).toBe(3);
  });

  it("labels a SUSPENDED→ACTIVE change as GROUP_REACTIVATED", async () => {
    svc.mockResolvedValue({
      before: { status: "SUSPENDED", suspendedAt: "x", suspensionReason: "y", terminatedAt: null },
      after: { status: "ACTIVE", suspendedAt: null, suspensionReason: null, terminatedAt: null },
      affectedMembers: 1,
      groupName: "Lakeview",
    });
    await changeGroupStatusAction("g1", null, fd({ targetStatus: "ACTIVE" }));
    expect(writeAudit.mock.calls[0][0].action).toBe("GROUP_REACTIVATED");
  });

  it("labels a governed terminal reinstate as GROUP_REINSTATED", async () => {
    svc.mockResolvedValue({
      before: { status: "TERMINATED", suspendedAt: null, suspensionReason: null, terminatedAt: "x" },
      after: { status: "ACTIVE", suspendedAt: null, suspensionReason: null, terminatedAt: null },
      affectedMembers: 0,
      groupName: "Lakeview",
    });
    await changeGroupStatusAction("g1", null, fd({ targetStatus: "ACTIVE", override: "true", reason: "appeal" }));
    expect(writeAudit.mock.calls[0][0].action).toBe("GROUP_REINSTATED");
    expect(writeAudit.mock.calls[0][0].metadata.override).toBe(true);
  });

  it("surfaces an invalid transition as a field error and writes no audit (S-006)", async () => {
    svc.mockRejectedValue(new InvalidGroupTransitionError("Cannot move a scheme from TERMINATED to ACTIVE."));
    const res = await changeGroupStatusAction("g1", null, fd({ targetStatus: "ACTIVE" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.targetStatus?.[0]).toMatch(/cannot move/i);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("rejects an unknown target status at the schema boundary (service not called)", async () => {
    const res = await changeGroupStatusAction("g1", null, fd({ targetStatus: "BOGUS" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.targetStatus?.length).toBeGreaterThan(0);
    expect(svc).not.toHaveBeenCalled();
  });
});
