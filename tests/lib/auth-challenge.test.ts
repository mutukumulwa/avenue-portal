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

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  registerFailedAttempt: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: mocks.findFirst, update: mocks.update } },
}));
vi.mock("@/lib/auth-credentials", () => ({ registerFailedAttempt: mocks.registerFailedAttempt }));

import { evaluateSignInStep } from "@/lib/auth-challenge";

const PASSWORD = "Correct-Horse-1";
let hash: string;

beforeEach(async () => {
  vi.clearAllMocks();
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
    expect(mocks.registerFailedAttempt).toHaveBeenCalledWith("u1", "t1");
  });

  it("does not count an attempt against an account that is already locked", async () => {
    // Re-counting would let anyone extend a victim's lock indefinitely by
    // hammering an account they cannot get into anyway.
    mocks.findFirst.mockResolvedValue(account({ lockedUntil: new Date(Date.now() + 600_000) }));
    expect(await evaluateSignInStep("a@b.ug", PASSWORD)).toBe("REJECTED");
    expect(mocks.registerFailedAttempt).not.toHaveBeenCalled();
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
