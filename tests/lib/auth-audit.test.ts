import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT-HF P10.05 — the failed-sign-in audit rail.
 *
 * The rail exists because the log could say "this account locked at 14:32" and
 * nothing else: four failures in five left no trace, and attempts made *during*
 * a lock left none at all. Worse, the columns that did hold the evidence
 * (`failedLoginCount`, `lastFailedLoginAt`) are cleared by an admin password
 * reset — which is the first thing an operator does when a user reports a
 * suspicious sign-in. The reaction destroyed the evidence.
 *
 * Two properties have to hold together, and they pull against each other:
 * every failure is recorded, AND an attacker cannot use that to grow the audit
 * table without limit. These pin both, plus the absolute rule that no audit
 * failure may ever propagate into the auth path.
 */

/** The shapes auth-audit.ts passes to Prisma, typed so tsc checks the assertions. */
type AuditRow = {
  // Nullable since P10.08 — see the model comment. A null is "no actor", a
  // fact, never a stand-in for one we failed to resolve.
  userId: string | null;
  tenantId: string | null;
  action: string;
  module: string;
  description: string;
  metadata: Record<string, unknown>;
};
type Lookback = { where: { userId: string; action: string; createdAt: { gte: Date } } };
type UserLookup = { where: { email: string; isActive: boolean }; select: Record<string, boolean> };

const mocks = vi.hoisted(() => ({
  create: vi.fn(async (_args: { data: AuditRow }) => ({})),
  findFirst: vi.fn(async (_args: Lookback): Promise<{ id: string } | null> => null),
  userFindFirst: vi.fn(
    async (_args: UserLookup): Promise<{ id: string; tenantId: string } | null> => null,
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: mocks.create, findFirst: mocks.findFirst },
    user: { findFirst: mocks.userFindFirst },
  },
}));

import {
  recordUnknownAddressSignIn,
  recordIpBlocked,
  recordFailedSignIn,
  recordBlockedSignIn,
  recordInactiveAccountSignIn,
  findDeactivatedAccount,
  AUTH_SIGN_IN_FAILED,
  AUTH_SIGN_IN_BLOCKED,
  AUTH_SIGN_IN_INACTIVE,
  AUTH_SIGN_IN_UNKNOWN,
  AUTH_SIGN_IN_IP_BLOCKED,
} from "@/lib/auth-audit";
import { LOCK_DURATION_MS } from "@/lib/session-policy";

/** The first audit row written. Throws a readable failure if none was. */
const row = (): AuditRow => {
  const call = mocks.create.mock.calls[0];
  if (!call) throw new Error("expected an audit row to have been written, none was");
  return call[0].data;
};

/** The lookback window a dedupe guard queried with. */
const lookbackSince = (): Date => {
  const call = mocks.findFirst.mock.calls[0];
  if (!call) throw new Error("expected a dedupe lookback, none was made");
  return call[0].where.createdAt.gte;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Implementations, not just calls — clearAllMocks leaves mockResolvedValue in
  // place, which silently leaks one test's stub into the next.
  mocks.create.mockResolvedValue({});
  mocks.findFirst.mockResolvedValue(null);
  mocks.userFindFirst.mockResolvedValue(null);
});

describe("a counted failure", () => {
  it("records the reason, the streak and whether it armed the lock", async () => {
    await recordFailedSignIn({
      userId: "u1", tenantId: "t1", reason: "BAD_PASSWORD",
      attemptsInWindow: 3, lockArmed: false,
    });
    expect(row()).toMatchObject({
      userId: "u1", tenantId: "t1", action: AUTH_SIGN_IN_FAILED, module: "AUTH",
    });
    expect(row().metadata).toEqual({ reason: "BAD_PASSWORD", attemptsInWindow: 3, lockArmed: false });
  });

  it("carries tenantId, so the row is inside the tenant hash chain", async () => {
    // A row without it sits outside the chain and is invisible to tenant-scoped
    // audit review — DEF-005/WP-3.1, which is exactly why these write the row
    // directly instead of going through writeAudit().
    await recordFailedSignIn({
      userId: "u1", tenantId: "t1", reason: "BAD_PASSWORD", attemptsInWindow: 1, lockArmed: false,
    });
    expect(row().tenantId).toBe("t1");
  });

  it("distinguishes a rejected code from a rejected password in the description", async () => {
    // The operationally important one: BAD_TOTP means somebody HAS the
    // password. Reading it should not require decoding a metadata field.
    await recordFailedSignIn({
      userId: "u1", tenantId: "t1", reason: "BAD_TOTP", attemptsInWindow: 2, lockArmed: false,
    });
    expect(row().description).toMatch(/correct password/i);
    expect(row().metadata).toMatchObject({ reason: "BAD_TOTP" });
  });

  it("says the streak is unknown rather than inventing one", async () => {
    // null is what the counter reports when its own statement failed. Writing 0
    // there would read as "no prior failures", which is a different claim.
    await recordFailedSignIn({
      userId: "u1", tenantId: "t1", reason: "BAD_PASSWORD", attemptsInWindow: null, lockArmed: false,
    });
    expect(row().metadata).toMatchObject({ attemptsInWindow: null });
  });

  it("is written every time — it is the bounded path", async () => {
    // No lookback here by design: the throttle already caps this at five per
    // window, and deduplicating would hide the 1-2-3-4-5 progression that makes
    // the record readable.
    for (let i = 1; i <= 3; i++) {
      await recordFailedSignIn({
        userId: "u1", tenantId: "t1", reason: "BAD_PASSWORD", attemptsInWindow: i, lockArmed: false,
      });
    }
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

describe("an attempt while locked", () => {
  const lockedUntil = new Date(Date.now() + 600_000);

  it("is recorded, even though the throttle deliberately does not count it", async () => {
    await recordBlockedSignIn({ userId: "u1", tenantId: "t1", lockedUntil });
    expect(row()).toMatchObject({ action: AUTH_SIGN_IN_BLOCKED, tenantId: "t1" });
    expect(row().metadata).toMatchObject({ lockedUntil: lockedUntil.toISOString() });
  });

  it("is recorded only once per lock", async () => {
    mocks.findFirst.mockResolvedValue({ id: "already" });
    await recordBlockedSignIn({ userId: "u1", tenantId: "t1", lockedUntil });
    // Otherwise hammering one locked account writes one row per attempt, and a
    // rail that records everything becomes a way to fill the disk.
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("looks back to when the lock ARMED, not to now", async () => {
    // Anchoring at the lock's start is what makes "once per lock" true: a
    // rolling window would let a long lock accumulate rows, and a window
    // shorter than the lock would too.
    await recordBlockedSignIn({ userId: "u1", tenantId: "t1", lockedUntil });
    const since = lookbackSince();
    expect(since.getTime()).toBe(lockedUntil.getTime() - LOCK_DURATION_MS);
  });

  it("records a SECOND lock separately", async () => {
    // The dedupe must not swallow a genuinely new lock. A fresh lock has a
    // later lockedUntil, so its lookback starts after the previous row.
    const later = new Date(Date.now() + LOCK_DURATION_MS * 3);
    await recordBlockedSignIn({ userId: "u1", tenantId: "t1", lockedUntil: later });
    const since = lookbackSince();
    expect(since.getTime()).toBe(later.getTime() - LOCK_DURATION_MS);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("records the event when the lookback itself fails", async () => {
    // An extra row is a smaller problem than a silently missing one.
    mocks.findFirst.mockRejectedValue(new Error("db down"));
    await recordBlockedSignIn({ userId: "u1", tenantId: "t1", lockedUntil });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});

describe("an attempt against a deactivated account", () => {
  it("is recorded", async () => {
    await recordInactiveAccountSignIn({ userId: "gone", tenantId: "t1" });
    expect(row()).toMatchObject({ userId: "gone", tenantId: "t1", action: AUTH_SIGN_IN_INACTIVE });
  });

  it("is bounded by window, because no lock can ever arm here", async () => {
    mocks.findFirst.mockResolvedValue({ id: "already" });
    await recordInactiveAccountSignIn({ userId: "gone", tenantId: "t1" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses a lookback one lock-duration wide", async () => {
    await recordInactiveAccountSignIn({ userId: "gone", tenantId: "t1" });
    const since = lookbackSince();
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(LOCK_DURATION_MS - 1_000);
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(LOCK_DURATION_MS + 1_000);
  });
});

describe("resolving a rejected address to a deactivated account", () => {
  it("looks only for INACTIVE users", async () => {
    // If this ever returned an active user it would be a second credential
    // lookup living outside the auth decision — the thing it is kept separate
    // to avoid.
    await findDeactivatedAccount("ex@b.ug");
    expect(mocks.userFindFirst.mock.calls[0]?.[0].where).toEqual({ email: "ex@b.ug", isActive: false });
  });

  it("selects nothing that could authenticate anyone", async () => {
    await findDeactivatedAccount("ex@b.ug");
    expect(mocks.userFindFirst.mock.calls[0]?.[0].select).toEqual({ id: true, tenantId: true });
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    mocks.userFindFirst.mockRejectedValue(new Error("db down"));
    await expect(findDeactivatedAccount("ex@b.ug")).resolves.toBeNull();
  });
});

describe("no audit failure ever reaches the auth path", () => {
  // The rail is best-effort by contract. A rail that can throw turns a wrong
  // password into a 500 — strictly worse than the gap it closes.
  it("swallows a rejected write", async () => {
    mocks.create.mockRejectedValue(new Error("audit table unavailable"));
    await expect(
      recordFailedSignIn({
        userId: "u1", tenantId: "t1", reason: "BAD_PASSWORD", attemptsInWindow: 1, lockArmed: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows a SYNCHRONOUS throw, which `.catch()` alone would miss", async () => {
    // Not hypothetical. The first version used `prisma.auditLog.create(...).catch()`,
    // and an undefined `auditLog` threw on the property access — before any
    // promise existed — straight out of evaluateSignInStep. Found by a test
    // whose fixture simply had no auditLog mock.
    mocks.create.mockImplementation(() => {
      throw new Error("synchronous");
    });
    await expect(
      recordFailedSignIn({
        userId: "u1", tenantId: "t1", reason: "BAD_PASSWORD", attemptsInWindow: 1, lockArmed: false,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("the two events that had no actor to attach to", () => {
  /**
   * Both were UNRECORDED before P10.08 — not anonymised, absent — because
   * AuditLog.userId was a required foreign key. They are the patterns an
   * investigation looks for, and both are actor-less by nature.
   */

  it("an unknown address is recorded with a null actor and null tenant", async () => {
    await recordUnknownAddressSignIn("nobody@example.ug");
    expect(row()).toMatchObject({
      userId: null,
      tenantId: null,
      action: AUTH_SIGN_IN_UNKNOWN,
      module: "AUTH",
    });
    expect(row().metadata).toMatchObject({ attempted: "nobody@example.ug" });
  });

  it("normalises the address so one attacker is one pattern", async () => {
    await recordUnknownAddressSignIn("  NoBody@Example.UG  ");
    expect(row().metadata).toMatchObject({ attempted: "nobody@example.ug" });
  });

  it("WITHHOLDS a value that is not email-shaped", async () => {
    // People type their password into the email field. Storing whatever
    // arrived would put plaintext passwords into a table that is retained,
    // exported and read by staff — building a credential leak while building a
    // security control.
    await recordUnknownAddressSignIn("Hunter2!MyRealPassword");
    expect(row().metadata).toMatchObject({
      attempted: null,
      redacted: "NOT_EMAIL_SHAPED",
      length: "Hunter2!MyRealPassword".length,
    });
  });

  it("still records the attempt when the value is withheld", async () => {
    // Redacting the content must not discard the EVENT: the count is what
    // reveals the sweep.
    await recordUnknownAddressSignIn("not-an-address");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(row().action).toBe(AUTH_SIGN_IN_UNKNOWN);
  });

  it("does not mistake a password containing @ for an address", async () => {
    // The shape check has to be an address check, not an "@" check.
    await recordUnknownAddressSignIn("p@ssword");
    expect(row().metadata).toMatchObject({ redacted: "NOT_EMAIL_SHAPED" });
  });

  it("an IP block is recorded with a null actor", async () => {
    // A source-level control fires ACROSS accounts. Hanging the row on
    // whichever account was tried last would be a fiction that reads as fact.
    await recordIpBlocked("41.210.0.9", 50, 15);
    expect(row()).toMatchObject({ userId: null, action: AUTH_SIGN_IN_IP_BLOCKED });
    expect(row().metadata).toMatchObject({ ipAddress: "41.210.0.9", limit: 50, windowMinutes: 15 });
  });

  it("neither throws when the write fails", async () => {
    mocks.create.mockRejectedValue(new Error("audit table unavailable"));
    await expect(recordUnknownAddressSignIn("a@b.ug")).resolves.toBeUndefined();
    await expect(recordIpBlocked("41.210.0.9", 50, 15)).resolves.toBeUndefined();
  });
});
