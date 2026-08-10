/**
 * DEF-002 — database-backed login throttling & temporary lockout.
 *
 * Exercises the extracted authorizeCredentials() directly (no DB; prisma,
 * bcrypt and TOTP are mocked). The lockout state lives on the User row so the
 * control is consistent across every serverless instance (AC 5).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), update: vi.fn() },
  userRoleAssignment: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const bcryptMock = vi.hoisted(() => ({ compare: vi.fn(), hash: vi.fn() }));
const totpMock = vi.hoisted(() => ({
  verifyTotp: vi.fn(() => true),
  totpEnrolmentRequiredNow: vi.fn(() => false),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("bcryptjs", () => ({ default: bcryptMock }));
vi.mock("@/lib/totp", () => ({
  verifyTotp: totpMock.verifyTotp,
  totpEnrolmentRequiredNow: totpMock.totpEnrolmentRequiredNow,
}));
vi.mock("@/lib/perf", () => ({
  measureAsync: <T,>(_l: string, w: () => Promise<T>) => w(),
}));

import {
  authorizeCredentials,
  LOCK_DURATION_MS,
  ATTEMPT_WINDOW_MS,
} from "@/lib/auth-credentials";

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@x.com",
    passwordHash: "hash",
    firstName: "Jane",
    lastName: "Doe",
    role: "CLAIMS_OFFICER",
    tenantId: "t1",
    clientId: null,
    groupId: null,
    memberId: null,
    providerId: null,
    totpSecret: null,
    totpEnabled: false,
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userRoleAssignment.findMany.mockResolvedValue([]);
  prismaMock.user.update.mockResolvedValue({ sessionVersion: 1 });
  prismaMock.auditLog.create.mockResolvedValue({});
  totpMock.verifyTotp.mockReturnValue(true);
});

describe("DEF-002 — brute-force lockout", () => {
  it("the 4th consecutive failure does NOT lock", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ failedLoginCount: 3, lastFailedLoginAt: new Date(Date.now() - 60_000) }),
    );
    bcryptMock.compare.mockResolvedValue(false);

    const res = await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    expect(res).toBeNull();
    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.failedLoginCount).toBe(4);
    expect(upd.data.lockedUntil).toBeNull();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("the 5th consecutive failure locks the account (~now+15m) and writes an AUTH_ACCOUNT_LOCKED audit row", async () => {
    const now = Date.now();
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ failedLoginCount: 4, lastFailedLoginAt: new Date(now - 60_000) }),
    );
    bcryptMock.compare.mockResolvedValue(false);

    const res = await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    expect(res).toBeNull();
    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.failedLoginCount).toBe(0); // reset when the lock is applied
    expect(upd.data.lockedUntil).toBeInstanceOf(Date);
    const lockMs = (upd.data.lockedUntil as Date).getTime() - now;
    expect(lockMs).toBeGreaterThan(LOCK_DURATION_MS - 5_000);
    expect(lockMs).toBeLessThan(LOCK_DURATION_MS + 5_000);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const lockAudit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(lockAudit.action).toBe("AUTH_ACCOUNT_LOCKED");
    // WP-3.1 (DEF-005): the lock event must carry tenantId so it sits inside the
    // tenant hash chain (it was previously omitted → outside the chain).
    expect(lockAudit.tenantId).toBe("t1");
    // Recorded lock window is derived from the constant, so it matches policy.
    expect(lockAudit.metadata.lockMinutes).toBe(LOCK_DURATION_MS / 60_000);
  });

  it("a successful login after the lock window elapsed clears the lock AND audits AUTH_ACCOUNT_UNLOCKED with tenantId", async () => {
    // A spent lock (lockedUntil in the past) no longer blocks; the successful
    // login clears it — and now records the recovery so lock → expiry → sign-in
    // is a complete, observable lifecycle.
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ lockedUntil: new Date(Date.now() - 60_000), failedLoginCount: 0 }),
    );
    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 4 });

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct" });

    expect(res).not.toBeNull();
    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.lockedUntil).toBeNull();
    expect(upd.data.failedLoginCount).toBe(0);

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const unlockAudit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(unlockAudit.action).toBe("AUTH_ACCOUNT_UNLOCKED");
    expect(unlockAudit.tenantId).toBe("t1");
  });

  it("a normal successful login (never locked) writes NO unlock audit", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ lockedUntil: null, failedLoginCount: 2, lastFailedLoginAt: new Date() }),
    );
    bcryptMock.compare.mockResolvedValue(true);

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct" });

    expect(res).not.toBeNull();
    // lockedUntil was null → nothing to unlock → no AUTH_ACCOUNT_UNLOCKED row.
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("a locked account fails WITHOUT a password comparison, even with the correct password (AC 2)", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ lockedUntil: new Date(Date.now() + 5 * 60_000) }),
    );
    bcryptMock.compare.mockResolvedValue(true); // correct password

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct" });

    expect(res).toBeNull();
    expect(bcryptMock.compare).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("a successful login clears failedLoginCount and lockedUntil in one write", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ failedLoginCount: 3, lastFailedLoginAt: new Date() }),
    );
    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 7 });

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct" });

    expect(res).not.toBeNull();
    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.failedLoginCount).toBe(0);
    expect(upd.data.lockedUntil).toBeNull();
    expect(upd.data.sessionVersion).toEqual({ increment: 1 });
  });

  it("a failure after a stale window restarts the count at 1, not prev+1", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({
        failedLoginCount: 4,
        lastFailedLoginAt: new Date(Date.now() - (ATTEMPT_WINDOW_MS + 60_000)),
      }),
    );
    bcryptMock.compare.mockResolvedValue(false);

    const res = await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    expect(res).toBeNull();
    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.failedLoginCount).toBe(1); // fresh streak → nowhere near the lock
    expect(upd.data.lockedUntil).toBeNull();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("a wrong TOTP on a correct password still counts as a failure (D-11)", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({
        totpEnabled: true,
        totpSecret: "SECRET",
        failedLoginCount: 1,
        lastFailedLoginAt: new Date(),
      }),
    );
    bcryptMock.compare.mockResolvedValue(true); // password correct
    totpMock.verifyTotp.mockReturnValue(false); // TOTP wrong

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct", totp: "000000" });

    expect(res).toBeNull();
    const upd = prismaMock.user.update.mock.calls[0][0];
    expect(upd.data.failedLoginCount).toBe(2); // incremented from 1
  });

  it("an unknown email returns null and never touches the counter (non-existent accounts untouched)", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await authorizeCredentials({ email: "nobody@x.com", password: "whatever" });

    expect(res).toBeNull();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(bcryptMock.compare).not.toHaveBeenCalled();
  });
});
