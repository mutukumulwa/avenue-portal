import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "admin-1", tenantId: "t1" } }),
  ROLES: { ADMIN_ONLY: "ADMIN_ONLY" },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateUserAccessAction } from "@/app/(admin)/settings/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

beforeEach(() => vi.clearAllMocks());

// BD-01: the inline "Update Access" control must never escalate a scoped portal
// user to admin, nor mint a portal role without its binding.
describe("updateUserAccessAction (BD-01)", () => {
  it("rejects escalating a PROVIDER_USER to SUPER_ADMIN", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      role: "PROVIDER_USER", providerId: "p1", memberId: null, brokerId: null, groupId: null,
    });

    await expect(
      updateUserAccessAction(fd({ userId: "u1", role: "SUPER_ADMIN", isActive: "true" })),
    ).rejects.toThrow(/scoped portal role/i);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("allows toggling a portal user active/inactive while preserving its role", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      role: "PROVIDER_USER", providerId: "p1", memberId: null, brokerId: null, groupId: null,
    });
    mockPrisma.user.update.mockResolvedValue({});

    await updateUserAccessAction(fd({ userId: "u1", role: "PROVIDER_USER", isActive: "false" }));

    expect(mockPrisma.user.update).toHaveBeenCalledOnce();
    const arg = mockPrisma.user.update.mock.calls[0][0];
    expect(arg.data).toEqual({ role: "PROVIDER_USER", isActive: false });
  });

  it("rejects converting a staff user INTO a portal role inline", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      role: "CLAIMS_OFFICER", providerId: null, memberId: null, brokerId: null, groupId: null,
    });

    await expect(
      updateUserAccessAction(fd({ userId: "u2", role: "MEMBER_USER", isActive: "true" })),
    ).rejects.toThrow(/Invite User/i);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      role: "CLAIMS_OFFICER", providerId: null, memberId: null, brokerId: null, groupId: null,
    });

    await expect(
      updateUserAccessAction(fd({ userId: "u2", role: "GOD_MODE", isActive: "true" })),
    ).rejects.toThrow(/invalid role/i);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("allows a normal staff role change", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      role: "CLAIMS_OFFICER", providerId: null, memberId: null, brokerId: null, groupId: null,
    });
    mockPrisma.user.update.mockResolvedValue({});

    await updateUserAccessAction(fd({ userId: "u3", role: "FINANCE_OFFICER", isActive: "true" }));

    expect(mockPrisma.user.update).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledOnce();
  });
});
