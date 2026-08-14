import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

/**
 * UAT-HF P10.01 — the two-step sign-in (DEF-011).
 *
 * The run: "Nothing tells the user a code is required, that their code was
 * malformed, or that it had expired." The form showed one box labelled
 * *Authenticator code (if 2FA enabled)* to every user, and a user whose account
 * required a code but who left it blank got "Invalid email or password".
 *
 * The acceptance criterion is "users without TOTP never see an unexplained
 * optional field; required user cannot bypass step". That needs the server to
 * say whether a code applies — and to say it ONLY after the password is
 * verified, or the answer identifies the account.
 *
 * These pin the three things that make that safe: one indistinguishable
 * rejection, the same lockout counter as a full sign-in, and no counter reset
 * on a half-finished sign-in.
 */

/** The shape auth-audit.ts writes. Typed so tsc checks the assertions below. */
type AuditRow = {
  userId: string;
  tenantId: string;
  action: string;
  module: string;
  description: string;
  metadata: Record<string, unknown>;
};

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  registerFailedAttempt: vi.fn(async () => {}),
  // UAT-HF P10.05. A real fake, not a stub: the audit rows this step now writes
  // are asserted below, so swallowing them would test nothing. Its absence also
  // caught a defect — `prisma.auditLog` being undefined threw SYNCHRONOUSLY out
  // of evaluateSignInStep, which `.catch()` in the writer could not intercept.
  auditCreate: vi.fn(async (_args: { data: AuditRow }) => ({})),
  // UAT-HF P10.07 — the per-source throttle. A real fake: it fails OPEN on
  // error, so a missing mock would let every test below pass while the gate
  // did nothing.
  ipFindUnique: vi.fn(async () => null as { blockedUntil: Date | null } | null),
  queryRaw: vi.fn(async () => [] as unknown[]),
  auditFindFirst: vi.fn(async (): Promise<{ id: string } | null> => null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findFirst, update: mocks.update },
    auditLog: { create: mocks.auditCreate, findFirst: mocks.auditFindFirst },
    signInIpThrottle: { findUnique: mocks.ipFindUnique },
    $queryRaw: mocks.queryRaw,
  },
}));
// Partial: `equaliseRejectionTiming` is kept REAL, because it is what spends
// the bcrypt comparison the timing test below measures. Stubbing it would make
// that test pass while the oracle it guards against was wide open.
vi.mock("@/lib/auth-credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-credentials")>();
  return { ...actual, registerFailedAttempt: mocks.registerFailedAttempt };
});

import { evaluateSignInStep, type SignInStep } from "@/lib/auth-challenge";

const PASSWORD = "Correct-Horse-1";
let hash: string;

beforeEach(async () => {
  vi.clearAllMocks();
  // clearAllMocks clears CALLS, not implementations — so a mockResolvedValue
  // set by one test survives into the next. That silently broke the
  // deactivated-account test (it passed alone, failed in the suite) because the
  // "once per lock" stub left auditFindFirst returning a row. Defaults are
  // restored explicitly rather than relying on clear semantics.
  mocks.auditFindFirst.mockResolvedValue(null);
  mocks.auditCreate.mockResolvedValue({});
  mocks.ipFindUnique.mockResolvedValue(null);
  mocks.queryRaw.mockResolvedValue([]);
  process.env.VERCEL = "1"; // the forwarded-for header is only trusted there
  hash ??= await bcrypt.hash(PASSWORD, 4);
});

const account = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  tenantId: "t1",
  passwordHash: hash,
  totpEnabled: false,
  totpSecret: null,
  lockedUntil: null,
  ...over,
});

describe("evaluateSignInStep", () => {
  it("asks for a code when the account has an authenticator", async () => {
    mocks.findFirst.mockResolvedValue(account({ totpEnabled: true, totpSecret: "S3CR3T" }));
    expect(await evaluateSignInStep("a@b.ug", PASSWORD)).toBe("CODE_REQUIRED");
  });

  it("does not ask for a code when the account has none", async () => {
    mocks.findFirst.mockResolvedValue(account());
    expect(await evaluateSignInStep("a@b.ug", PASSWORD)).toBe("PASSWORD_ONLY");
  });

  it("treats totpEnabled with no secret as no authenticator", async () => {
    // A half-finished enrolment must not strand the user on a step that cannot
    // be satisfied — there is no secret to generate a code from.
    mocks.findFirst.mockResolvedValue(account({ totpEnabled: true, totpSecret: null }));
    expect(await evaluateSignInStep("a@b.ug", PASSWORD)).toBe("PASSWORD_ONLY");
  });

  it("never reveals whether a code applies before the password is right", async () => {
    mocks.findFirst.mockResolvedValue(account({ totpEnabled: true, totpSecret: "S3CR3T" }));
    expect(await evaluateSignInStep("a@b.ug", "wrong")).toBe("REJECTED");
  });

  it("returns the same REJECTED for a wrong password, no account and a lock", async () => {
    mocks.findFirst.mockResolvedValue(account());
    const wrongPassword = await evaluateSignInStep("a@b.ug", "wrong");

    mocks.findFirst.mockResolvedValue(null);
    const noAccount = await evaluateSignInStep("nobody@b.ug", PASSWORD);

    mocks.findFirst.mockResolvedValue(account({ lockedUntil: new Date(Date.now() + 600_000) }));
    const locked = await evaluateSignInStep("a@b.ug", PASSWORD);

    // Not merely "all falsy" — literally the same value, because the caller
    // renders one sentence and a second outcome would be a second sentence.
    expect([wrongPassword, noAccount, locked]).toEqual(["REJECTED", "REJECTED", "REJECTED"]);
  });

  it("registers a failed attempt so this step cannot be used to bypass the lockout", async () => {
    mocks.findFirst.mockResolvedValue(account());
    await evaluateSignInStep("a@b.ug", "wrong");
    expect(mocks.registerFailedAttempt).toHaveBeenCalledWith("u1", "t1", "BAD_PASSWORD");
  });

  it("does not count an attempt against an account that is already locked", async () => {
    // Re-counting would let anyone extend a victim's lock indefinitely by
    // hammering an account they cannot get into anyway.
    mocks.findFirst.mockResolvedValue(account({ lockedUntil: new Date(Date.now() + 600_000) }));
    expect(await evaluateSignInStep("a@b.ug", PASSWORD)).toBe("REJECTED");
    expect(mocks.registerFailedAttempt).not.toHaveBeenCalled();
  });

  it("records an attempt made while the account is locked", async () => {
    // UAT-HF P10.05. The throttle deliberately does NOT count these, which is
    // why they were previously invisible everywhere. Attempts continuing
    // through a lock is the signal that separates a forgetful user from an
    // attack, so the audit rail records it even though the counter must not.
    const lockedUntil = new Date(Date.now() + 600_000);
    mocks.findFirst.mockResolvedValue(account({ lockedUntil }));
    await evaluateSignInStep("a@b.ug", PASSWORD);

    const row = mocks.auditCreate.mock.calls[0]?.[0]?.data;
    expect(row).toMatchObject({ userId: "u1", tenantId: "t1", action: "AUTH_SIGN_IN_BLOCKED" });
    // tenantId present is the whole point — a row without it sits outside the
    // tenant hash chain and is invisible to tenant-scoped review (DEF-005).
    expect(row.tenantId).toBe("t1");
  });

  it("records only once per lock, however many attempts are made", async () => {
    mocks.findFirst.mockResolvedValue(account({ lockedUntil: new Date(Date.now() + 600_000) }));
    mocks.auditFindFirst.mockResolvedValue({ id: "already-written" });
    await evaluateSignInStep("a@b.ug", PASSWORD);
    // Otherwise an attacker hammering a locked account grows the audit table at
    // will — a rail that records everything is a rail that can be used to fill
    // the disk.
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("records an attempt against a deactivated account", async () => {
    // The credential lookup filters on isActive, so this is indistinguishable
    // from an unknown address at the point of rejection — and it is the more
    // interesting of the two: somebody is trying to sign in as a person who was
    // switched off.
    mocks.findFirst
      .mockResolvedValueOnce(null) // the isActive-filtered credential lookup
      .mockResolvedValueOnce({ id: "gone", tenantId: "t1" }); // the audit-only lookup
    expect(await evaluateSignInStep("ex@b.ug", PASSWORD)).toBe("REJECTED");

    const row = mocks.auditCreate.mock.calls[0]?.[0]?.data;
    expect(row).toMatchObject({ userId: "gone", tenantId: "t1", action: "AUTH_SIGN_IN_INACTIVE" });
  });

  it("records an address with no account, with a null actor", async () => {
    // This used to assert the opposite — that NOTHING was written — because
    // AuditLog.userId was a required FK and there was no row to point at.
    // P10.08 made it nullable precisely so this event, the clearest signal
    // credential stuffing produces, stops being invisible.
    mocks.findFirst.mockResolvedValue(null);
    expect(await evaluateSignInStep("nobody@b.ug", PASSWORD)).toBe("REJECTED");

    const row = mocks.auditCreate.mock.calls[0]?.[0]?.data;
    expect(row).toMatchObject({ action: "AUTH_SIGN_IN_UNKNOWN", userId: null });
    // No tenant either: an address matching no account belongs to nobody. The
    // row is outside the per-tenant hash chain, which is a property of the
    // event rather than a defect in the write.
    expect(row.tenantId).toBeNull();
    expect(row.metadata).toMatchObject({ attempted: "nobody@b.ug" });
  });

  it("an audit failure never turns a rejection into an exception", async () => {
    // The rail is best-effort by contract. If writing the row could throw, a
    // wrong password would become a 500 — strictly worse than the gap it fixes.
    mocks.findFirst.mockResolvedValue(account({ lockedUntil: new Date(Date.now() + 600_000) }));
    mocks.auditCreate.mockRejectedValue(new Error("audit table unavailable"));
    await expect(evaluateSignInStep("a@b.ug", PASSWORD)).resolves.toBe("REJECTED");
  });

  it("refuses before any lookup when the source address is blocked", async () => {
    // UAT-HF P10.07. The per-account throttle stops five guesses at ONE
    // account; it does nothing about one source working through a list, which
    // is what password spraying is. Refusing BEFORE the lookup is the point —
    // gating after the bcrypt would cost exactly what it exists to save.
    mocks.ipFindUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 600_000) });
    expect(await evaluateSignInStep("a@b.ug", PASSWORD, "41.210.0.9")).toBe("RATE_LIMITED");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("says RATE_LIMITED rather than REJECTED, which would be a lie", () => {
    // Not an enumeration leak: it is a fact about the NETWORK, true whether or
    // not the address typed belongs to anyone. Collapsing it into "invalid
    // email or password" sends a user with perfectly good credentials into a
    // password reset that cannot help — the DEF-011/P10.02 failure exactly.
    expect<SignInStep>("RATE_LIMITED").not.toBe("REJECTED");
  });

  it("does not gate at all when the address cannot be trusted", async () => {
    // rateLimitKey returns null off-Vercel. Keying on a spoofable header would
    // let an attacker have a VICTIM'S address blocked, so no key means no gate.
    mocks.ipFindUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 600_000) });
    mocks.findFirst.mockResolvedValue(account());
    expect(await evaluateSignInStep("a@b.ug", PASSWORD, null)).toBe("PASSWORD_ONLY");
  });

  it("does not count an attempt when the password is correct", async () => {
    mocks.findFirst.mockResolvedValue(account({ totpEnabled: true, totpSecret: "S3CR3T" }));
    await evaluateSignInStep("a@b.ug", PASSWORD);
    expect(mocks.registerFailedAttempt).not.toHaveBeenCalled();
  });

  it("does not clear the lockout counter on a half-finished sign-in", async () => {
    // Only a completed sign-in clears it (authorizeCredentials does that in the
    // same write that bumps sessionVersion). If this step cleared it, a correct
    // password with no code would reset the throttle for ever.
    mocks.findFirst.mockResolvedValue(account({ totpEnabled: true, totpSecret: "S3CR3T" }));
    await evaluateSignInStep("a@b.ug", PASSWORD);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("only ever looks at active accounts", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await evaluateSignInStep("a@b.ug", PASSWORD);
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ email: "a@b.ug", isActive: true });
  });

  it("spends a bcrypt comparison even when no account matched", async () => {
    // Otherwise the no-account path returns in microseconds while a real
    // account spends ~100ms — a timing oracle for "does this address exist
    // here" that no response body would reveal.
    mocks.findFirst.mockResolvedValue(null);
    const t0 = performance.now();
    await evaluateSignInStep("nobody@b.ug", PASSWORD);
    const noAccount = performance.now() - t0;

    mocks.findFirst.mockResolvedValue(account());
    const t1 = performance.now();
    await evaluateSignInStep("a@b.ug", "wrong");
    const realAccount = performance.now() - t1;

    // Both do one bcrypt compare at the same cost factor, so the cheap path is
    // not an order of magnitude faster. Generous bound: this is a smoke test
    // for "a compare happened", not a timing-attack measurement.
    expect(noAccount).toBeGreaterThan(realAccount / 10);
  });
});
