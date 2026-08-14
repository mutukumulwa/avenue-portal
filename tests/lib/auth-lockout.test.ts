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
  // UAT-HF P10.02 / DEC-11: the failure counter is now ONE atomic statement, so
  // parallel bad attempts cannot lose increments. The CASE logic runs in
  // Postgres and was verified there (see IMPLEMENTATION_LOG.md); these tests
  // pin what the TypeScript around it does with the result.
  $queryRaw: vi.fn(async () => [{ failedLoginCount: 1, locked: false }]),
  userRoleAssignment: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const bcryptMock = vi.hoisted(() => ({ compare: vi.fn(), hash: vi.fn() }));
const totpMock = vi.hoisted(() => ({
  verifyTotp: vi.fn(() => true),
  // UAT-HF P10.03: the credential path now asks WHICH time step matched and
  // spends it, so a used code cannot open a second session (DEF-013).
  verifyTotpCounter: vi.fn((): number | null => 1_000_000),
  consumeTotpCounter: vi.fn(async () => true),
  totpEnrolmentRequiredNow: vi.fn(() => false),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("bcryptjs", () => ({ default: bcryptMock }));
vi.mock("@/lib/totp", () => ({
  verifyTotp: totpMock.verifyTotp,
  verifyTotpCounter: totpMock.verifyTotpCounter,
  consumeTotpCounter: totpMock.consumeTotpCounter,
  totpEnrolmentRequiredNow: totpMock.totpEnrolmentRequiredNow,
}));
vi.mock("@/lib/perf", () => ({
  measureAsync: <T,>(_l: string, w: () => Promise<T>) => w(),
}));

import {
  authorizeCredentials,
  LOCK_DURATION_MS,
  ATTEMPT_WINDOW_MS,
  TIMING_EQUALISER_HASH,
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
  prismaMock.$queryRaw.mockResolvedValue([{ failedLoginCount: 1, locked: false }]);
  prismaMock.userRoleAssignment.findMany.mockResolvedValue([]);
  prismaMock.user.update.mockResolvedValue({ sessionVersion: 1 });
  prismaMock.auditLog.create.mockResolvedValue({});
  totpMock.verifyTotp.mockReturnValue(true);
  totpMock.verifyTotpCounter.mockReturnValue(1_000_000);
  totpMock.consumeTotpCounter.mockResolvedValue(true);
});

describe("DEF-002 — brute-force lockout", () => {
  /**
   * UAT-HF P10.02 / DEC-11 rewrote the three counter tests below.
   *
   * The rolling-window arithmetic moved OUT of TypeScript and INTO one atomic
   * SQL statement, because the old read-then-write lost increments: measured on
   * a real Postgres, **five parallel wrong passwords produced a final count of
   * 1**, so the lock never armed — the exact throttle an attacker would
   * parallelise past. The CASE logic is verified against a real database (see
   * IMPLEMENTATION_LOG.md: 1,2,3,4,lock sequentially; stale window restarts at
   * 1; five parallel failures lock with exactly one audit-claiming row).
   *
   * What is asserted here is what the surrounding TypeScript does with the
   * result — the part mocks can speak to.
   */
  /**
   * UAT-HF P10.05 — every failure now writes an AUTH_SIGN_IN_FAILED row, so
   * "was an audit written" is no longer the same question as "did it lock".
   * These read rows by action rather than counting calls, which is what the
   * assertions below actually meant all along.
   */
  type AuditData = { action: string; tenantId?: string; metadata: Record<string, unknown> };
  const auditRows = (action: string): AuditData[] =>
    (prismaMock.auditLog.create.mock.calls as unknown[][])
      .map((c) => (c[0] as { data: AuditData }).data)
      .filter((d) => d.action === action);

  it("does not lock while the counter is below the threshold, but records the attempt", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ failedLoginCount: 3, lastFailedLoginAt: new Date(Date.now() - 60_000) }),
    );
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.$queryRaw.mockResolvedValue([{ failedLoginCount: 4, locked: false }]);

    const res = await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    expect(res).toBeNull();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    // No lock — that is the original assertion, unchanged in meaning.
    expect(auditRows("AUTH_ACCOUNT_LOCKED")).toHaveLength(0);
    // But the attempt itself is no longer invisible. Before P10.05 four of
    // every five failures left no trace at all.
    const failed = auditRows("AUTH_SIGN_IN_FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0].metadata).toMatchObject({
      reason: "BAD_PASSWORD",
      attemptsInWindow: 4,
      lockArmed: false,
    });
    expect(failed[0].tenantId).toBe("t1");
  });

  it("counts the failure in ONE statement, never a read-then-write", async () => {
    prismaMock.user.findFirst.mockResolvedValue(baseUser({ failedLoginCount: 3 }));
    bcryptMock.compare.mockResolvedValue(false);

    await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    // A separate user.update would mean the count came from a findFirst several
    // awaits earlier — with a bcrypt compare in between — which is how five
    // simultaneous guesses counted as one.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("uses UTC in the raw statement, not the server's local clock", async () => {
    prismaMock.user.findFirst.mockResolvedValue(baseUser({ failedLoginCount: 3 }));
    bcryptMock.compare.mockResolvedValue(false);

    await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    const call = prismaMock.$queryRaw.mock.calls[0] as unknown as [{ raw?: string[] }];
    const sql = call[0]?.raw?.join("?") ?? "";
    // These are `timestamp without time zone` columns holding UTC. Measured on a
    // +03 host, CURRENT_TIMESTAMP made a freshly applied lock read as already
    // expired — a three-hour hole in the throttle.
    expect(sql).toContain("now() AT TIME ZONE 'UTC'");
    expect(sql).not.toMatch(/=\s*CURRENT_TIMESTAMP/);
  });

  it("writes an AUTH_ACCOUNT_LOCKED audit row when the statement reports the lock armed", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ failedLoginCount: 4, lastFailedLoginAt: new Date(Date.now() - 60_000) }),
    );
    bcryptMock.compare.mockResolvedValue(false);
    // The row that actually armed the lock is the one that reports
    // locked && count reset to 0, so exactly one audit row is written however
    // many attempts raced.
    prismaMock.$queryRaw.mockResolvedValue([{ failedLoginCount: 0, locked: true }]);

    const res = await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    expect(res).toBeNull();
    // Two rows now: the attempt, then the lock it armed — in that order, so a
    // reader sees the cause immediately above the effect.
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
    const failed = auditRows("AUTH_SIGN_IN_FAILED");
    expect(failed).toHaveLength(1);
    // The statement wraps the counter to 0 on the attempt that arms the lock,
    // so a naive read of the column would report this fifth attempt as the 0th.
    expect(failed[0].metadata).toMatchObject({ attemptsInWindow: 5, lockArmed: true });

    const lockAudit = auditRows("AUTH_ACCOUNT_LOCKED")[0];
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

  it("a locked account fails even with the correct password, and is never told so (AC 2)", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ lockedUntil: new Date(Date.now() + 5 * 60_000) }),
    );
    bcryptMock.compare.mockResolvedValue(true); // correct password

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct" });

    expect(res).toBeNull();
    expect(prismaMock.user.update).not.toHaveBeenCalled();

    // This assertion used to read `compare` was never called at all. That was a
    // proxy for AC 2, and it also made the account identifiable by how FAST it
    // was refused: once an unknown address costs a bcrypt compare, an instant
    // refusal marks a locked — therefore existing — account. A compare is now
    // spent, against the equaliser, and never against the real hash.
    const hashesCompared = bcryptMock.compare.mock.calls.map((c: unknown[]) => c[1]);
    expect(hashesCompared).not.toContain("hash"); // the fixture account's real hash
    expect(hashesCompared).toEqual([TIMING_EQUALISER_HASH]);
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

  it("passes the rolling window boundary into the statement so a stale streak restarts", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({
        failedLoginCount: 4,
        lastFailedLoginAt: new Date(Date.now() - (ATTEMPT_WINDOW_MS + 60_000)),
      }),
    );
    bcryptMock.compare.mockResolvedValue(false);
    prismaMock.$queryRaw.mockResolvedValue([{ failedLoginCount: 1, locked: false }]);

    const res = await authorizeCredentials({ email: "a@x.com", password: "wrong" });

    expect(res).toBeNull();
    // D-9's rolling window is now evaluated in SQL against this boundary.
    const params = (prismaMock.$queryRaw.mock.calls[0] as unknown as unknown[]).slice(1);
    const windowStart = params.find((v): v is Date => v instanceof Date)!;
    expect(Date.now() - windowStart.getTime()).toBeGreaterThan(ATTEMPT_WINDOW_MS - 5_000);
    expect(auditRows("AUTH_ACCOUNT_LOCKED")).toHaveLength(0);
    // The restarted streak is recorded as attempt 1, not as a continuation.
    expect(auditRows("AUTH_SIGN_IN_FAILED")[0].metadata).toMatchObject({ attemptsInWindow: 1 });
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
    totpMock.verifyTotpCounter.mockReturnValue(null); // …so no step matched

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct", totp: "000000" });

    expect(res).toBeNull();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1); // counted as a failure
  });

  /**
   * UAT-HF P10.03 — DEF-013. A replayed code is cryptographically VALID; it is
   * refused because the step was already spent. It must be indistinguishable
   * from a wrong code, including in the lockout counter, or the counter itself
   * tells an attacker their guess was right.
   */
  it("a REPLAYED TOTP on a correct password counts as a failure too", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({
        totpEnabled: true,
        totpSecret: "SECRET",
        failedLoginCount: 1,
        lastFailedLoginAt: new Date(),
      }),
    );
    bcryptMock.compare.mockResolvedValue(true); // password correct
    totpMock.verifyTotpCounter.mockReturnValue(1_000_000); // code IS valid…
    totpMock.consumeTotpCounter.mockResolvedValue(false); // …but already spent

    const res = await authorizeCredentials({ email: "a@x.com", password: "correct", totp: "123456" });

    expect(res).toBeNull();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1); // counted as a failure
  });

  it("does not spend a TOTP step when the password is wrong", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      baseUser({ totpEnabled: true, totpSecret: "SECRET" }),
    );
    bcryptMock.compare.mockResolvedValue(false); // password wrong
    totpMock.verifyTotpCounter.mockReturnValue(1_000_000);

    await authorizeCredentials({ email: "a@x.com", password: "wrong", totp: "123456" });

    // Otherwise a wrong password burns a legitimate user's current code, and
    // they are told "incorrect" for a code that was correct.
    expect(totpMock.consumeTotpCounter).not.toHaveBeenCalled();
  });

  it("an unknown email returns null and never touches the counter (non-existent accounts untouched)", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await authorizeCredentials({ email: "nobody@x.com", password: "whatever" });

    expect(res).toBeNull();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    // A compare IS spent here now — against the equaliser, so that a rejected
    // address costs what a real one does. Returning instantly was an
    // enumeration oracle that no response body revealed.
    expect(bcryptMock.compare.mock.calls.map((c: unknown[]) => c[1])).toEqual([
      TIMING_EQUALISER_HASH,
    ]);
  });
});
