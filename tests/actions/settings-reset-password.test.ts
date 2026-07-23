import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

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

import { resetUserPasswordAction } from "@/app/(admin)/settings/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

const staffTarget = {
  id: "u1", email: "grace@medvex.co.ug", role: "CLAIMS_OFFICER",
  firstName: "Grace", lastName: "Okello",
};

beforeEach(() => vi.clearAllMocks());

// Admin credential reset: policy-validated bcrypt(12) hash, tenant-scoped,
// session-revoking, and NEVER a path to role/binding changes (BD-01).
describe("resetUserPasswordAction", () => {
  it("rejects a password that fails policy before touching the target", async () => {
    const res = await resetUserPasswordAction(null, fd({ userId: "u1", password: "short" }));

    expect(res.error).toMatch(/at least 10/i);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("requires both userId and password", async () => {
    const res = await resetUserPasswordAction(null, fd({ userId: "u1" }));

    expect(res.error).toMatch(/required/i);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a target outside the actor's tenant", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await resetUserPasswordAction(null, fd({ userId: "other-tenant-user", password: "Str0ngEnough" }));

    expect(res.error).toMatch(/not found/i);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "other-tenant-user", tenantId: "t1" } }),
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("sets a bcrypt hash + bumps sessionVersion, and nothing else", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(staffTarget);
    mockPrisma.user.update.mockResolvedValue({});

    const res = await resetUserPasswordAction(null, fd({ userId: "u1", password: "N3wPassword!" }));

    expect(res).toEqual({ ok: true });
    expect(mockPrisma.user.update).toHaveBeenCalledOnce();
    const arg = mockPrisma.user.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1", tenantId: "t1" });
    // Credential-only write: exactly the hash + the session revocation bump.
    expect(Object.keys(arg.data).sort()).toEqual(["passwordHash", "sessionVersion"]);
    expect(arg.data.sessionVersion).toEqual({ increment: 1 });
    // Stored as a verifying bcrypt hash, never plaintext.
    expect(arg.data.passwordHash).not.toContain("N3wPassword!");
    expect(await bcrypt.compare("N3wPassword!", arg.data.passwordHash)).toBe(true);
  });

  it("BD-01: a locked portal row can still have its password reset, bindings untouched", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u9", email: "provider.agakhan@medvex.co.ug", role: "PROVIDER_USER",
      firstName: "Aga", lastName: "Khan",
    });
    mockPrisma.user.update.mockResolvedValue({});

    const res = await resetUserPasswordAction(null, fd({ userId: "u9", password: "Fac1lityReset" }));

    expect(res).toEqual({ ok: true });
    const arg = mockPrisma.user.update.mock.calls[0][0];
    expect(arg.data.role).toBeUndefined();
    expect(arg.data.providerId).toBeUndefined();
    expect(arg.data.isActive).toBeUndefined();
  });

  it("audits the reset without leaking the password", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(staffTarget);
    mockPrisma.user.update.mockResolvedValue({});

    await resetUserPasswordAction(null, fd({ userId: "u1", password: "Aud1tedReset" }));

    expect(writeAudit).toHaveBeenCalledOnce();
    const audit = writeAudit.mock.calls[0][0];
    expect(audit).toMatchObject({
      userId: "admin-1",
      action: "USER_PASSWORD_RESET",
      module: "SETTINGS",
      metadata: expect.objectContaining({ targetUserId: "u1", sessionsRevoked: true }),
    });
    expect(JSON.stringify(audit)).not.toContain("Aud1tedReset");
  });
});
