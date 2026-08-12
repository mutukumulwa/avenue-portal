/**
 * UAT-HF P10.04 acceptance — "fake-clock test expires at policy threshold with
 * no user activity; polling cannot extend it; active user rolls idle window only
 * to absolute max; expired submit preserves draft and requires reauth."
 *
 * DEF-015: "The session cookie is issued with a 30-minute expiry. After a
 * measured 32 minutes of genuine inactivity with an enrolment form open, the
 * first protected action (loading the Member Registry) completed normally in
 * 4.1 s, still authenticated, with no reauthentication prompt and no expiry
 * message. An unattended admin workstation therefore remains signed in past its
 * own stated session lifetime."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  LOCK_DURATION_MS,
  SESSION_ABSOLUTE_MAX_AGE_S,
  SESSION_IDLE_MAX_AGE_S,
  SIGN_IN_RECOVERY_GUIDANCE,
  mayPerformPrivilegedWrite,
  sessionDecision,
  sessionExpiryMessage,
} from "@/lib/session-policy";

const T0 = 1_770_000_000_000;
const MIN = 60_000;

describe("P10.04 the idle window, on a fake clock", () => {
  it("is ACTIVE inside the window", () => {
    const d = sessionDecision({
      authenticatedAtMs: T0,
      lastActivityAtMs: T0,
      nowMs: T0 + 10 * MIN,
    });
    expect(d.state).toBe("ACTIVE");
    expect(d.expired).toBe(false);
  });

  it("expires at the policy threshold with no activity — the run's 32 minutes", () => {
    const d = sessionDecision({
      authenticatedAtMs: T0,
      lastActivityAtMs: T0,
      nowMs: T0 + 32 * MIN,
    });
    // The exact measurement the run reported as still-authenticated.
    expect(d.state).toBe("IDLE_EXPIRED");
    expect(d.expired).toBe(true);
    expect(d.limit).toBe("idle");
  });

  it("expires exactly ON the boundary, not a second later", () => {
    const at = sessionDecision({
      lastActivityAtMs: T0,
      nowMs: T0 + SESSION_IDLE_MAX_AGE_S * 1000,
    });
    expect(at.state).toBe("IDLE_EXPIRED");
    const just_before = sessionDecision({
      lastActivityAtMs: T0,
      nowMs: T0 + SESSION_IDLE_MAX_AGE_S * 1000 - 1,
    });
    expect(just_before.expired).toBe(false);
  });

  it("warns before it expires rather than dropping the user mid-task", () => {
    const d = sessionDecision({
      lastActivityAtMs: T0,
      nowMs: T0 + SESSION_IDLE_MAX_AGE_S * 1000 - 60_000,
    });
    expect(d.state).toBe("EXPIRING_SOON");
    expect(sessionExpiryMessage(d)).toMatch(/signed out shortly/i);
  });

  it("genuine activity rolls the window", () => {
    const activeAt = T0 + 25 * MIN; // the user did something
    const d = sessionDecision({
      authenticatedAtMs: T0,
      lastActivityAtMs: activeAt,
      nowMs: T0 + 32 * MIN,
    });
    expect(d.state).toBe("ACTIVE");
  });
});

describe("P10.04 the absolute cap, which nothing extends", () => {
  it("ends the session however active the user has been", () => {
    const now = T0 + SESSION_ABSOLUTE_MAX_AGE_S * 1000 + 1;
    const d = sessionDecision({
      authenticatedAtMs: T0,
      lastActivityAtMs: now - 1000, // busy one second ago
      nowMs: now,
    });
    expect(d.state).toBe("ABSOLUTE_EXPIRED");
    expect(d.expired).toBe(true);
    expect(d.limit).toBe("absolute");
  });

  it("is reported ahead of idle expiry when both have passed", () => {
    // The user cannot fix an absolute expiry by being more active, so that is
    // the one to tell them about.
    const now = T0 + SESSION_ABSOLUTE_MAX_AGE_S * 1000 + 10 * MIN;
    const d = sessionDecision({ authenticatedAtMs: T0, lastActivityAtMs: T0, nowMs: now });
    expect(d.state).toBe("ABSOLUTE_EXPIRED");
  });

  it("binds the countdown once it is the nearer deadline", () => {
    // Well inside the idle window, but minutes from the absolute one.
    const now = T0 + SESSION_ABSOLUTE_MAX_AGE_S * 1000 - 60_000;
    const d = sessionDecision({ authenticatedAtMs: T0, lastActivityAtMs: now, nowMs: now });
    expect(d.limit).toBe("absolute");
    expect(d.state).toBe("EXPIRING_SOON");
    expect(sessionExpiryMessage(d)).toMatch(/maximum length/i);
  });

  it("covers a working day, and is dead by the next morning", () => {
    // The setting DEF-015 names: a shared front desk (DEV-SHARED).
    expect(SESSION_ABSOLUTE_MAX_AGE_S).toBeGreaterThanOrEqual(8 * 3600);
    expect(SESSION_ABSOLUTE_MAX_AGE_S).toBeLessThanOrEqual(16 * 3600);
  });
});

describe("P10.04 unknown state is resolved differently by client and server", () => {
  const unknown = sessionDecision({ nowMs: T0 });

  it("is UNKNOWN when neither clock is readable", () => {
    expect(unknown.state).toBe("UNKNOWN");
    expect(unknown.msRemaining).toBeNull();
  });

  it("does NOT count as expired for the client guard", () => {
    // A false bounce throws away typed work to protect nothing.
    expect(unknown.expired).toBe(false);
  });

  it("DOES block a privileged write — fail closed", () => {
    // "fail closed if authoritative session state cannot be verified for
    // privileged write". A write we cannot vouch for is a write by nobody.
    expect(mayPerformPrivilegedWrite(unknown)).toBe(false);
  });

  it("allows a privileged write only while genuinely live", () => {
    expect(
      mayPerformPrivilegedWrite(sessionDecision({ lastActivityAtMs: T0, nowMs: T0 + MIN })),
    ).toBe(true);
    expect(
      mayPerformPrivilegedWrite(
        sessionDecision({ lastActivityAtMs: T0, nowMs: T0 + 31 * MIN }),
      ),
    ).toBe(false);
  });

  it("ignores a NaN or non-finite clock rather than trusting it", () => {
    expect(sessionDecision({ authenticatedAtMs: NaN, nowMs: T0 }).state).toBe("UNKNOWN");
    expect(sessionDecision({ lastActivityAtMs: Infinity, nowMs: T0 }).state).toBe("UNKNOWN");
  });
});

describe("P10.04 the messages say what happened and what survives", () => {
  it("distinguishes idle from absolute", () => {
    const idle = sessionDecision({ lastActivityAtMs: T0, nowMs: T0 + 40 * MIN });
    const abs = sessionDecision({
      authenticatedAtMs: T0,
      nowMs: T0 + SESSION_ABSOLUTE_MAX_AGE_S * 1000 + 1,
    });
    expect(sessionExpiryMessage(idle)).toMatch(/period of inactivity/i);
    expect(sessionExpiryMessage(abs)).toMatch(/maximum length/i);
  });

  it("tells the user their typed work is not gone", () => {
    // The acceptance requires the expired submit to preserve the draft
    // (P04.02); the message has to say so or they will assume otherwise.
    const idle = sessionDecision({ lastActivityAtMs: T0, nowMs: T0 + 40 * MIN });
    expect(sessionExpiryMessage(idle)).toMatch(/still on this device/i);
  });
});

describe("P10.04 DEF-015 — the guard no longer keeps the session alive", () => {
  const source = readFileSync("src/components/layouts/SessionExpiryGuard.tsx", "utf8");
  const code = source
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
    .join("\n");

  it("reads the session endpoint exactly once", () => {
    // This was the whole defect: NextAuth re-issues the cookie with a fresh exp
    // on /api/auth/session once updateAge has elapsed, so a 60s poll kept the
    // rolling window permanently topped up.
    expect(code.match(/fetch\("\/api\/auth\/session"/g)?.length).toBe(1);
  });

  it("no longer polls that endpoint on an interval", () => {
    expect(code).not.toMatch(/setInterval\(\s*load/);
    expect(code).not.toMatch(/setInterval\([^)]*fetch/);
  });

  it("no longer re-reads it on window focus", () => {
    expect(code).not.toMatch(/addEventListener\("focus"/);
  });

  it("computes expiry from local clocks after that one read", () => {
    expect(code).toContain("sessionDecision");
    expect(code).toContain("Date.now()");
  });

  it("knows about the absolute deadline, not just the rolling one", () => {
    // NextAuth's `expires` only ever describes the rolling window.
    expect(code).toContain("SESSION_ABSOLUTE_MAX_AGE_S");
    expect(code).toContain("authenticatedAt");
  });
});

describe("P10.04 the server enforces the absolute cap itself", () => {
  const auth = readFileSync("src/lib/auth.ts", "utf8");

  it("stamps the authentication instant once, at sign-in", () => {
    expect(auth).toContain("token.authenticatedAt = Date.now();");
  });

  it("signs out past the absolute limit, before any fail-open check", () => {
    const capIndex = auth.indexOf("SESSION_ABSOLUTE_MAX_AGE_S * 1000");
    const singleSessionIndex = auth.indexOf("single-session, R25");
    expect(capIndex).toBeGreaterThan(-1);
    // The single-session check fails OPEN when the version is unknown; the
    // absolute cap must not be reachable only after it.
    expect(capIndex).toBeLessThan(singleSessionIndex);
  });

  it("never refreshes the stamp on a later request", () => {
    // One assignment only. A second would make the cap rolling, which is the
    // exact thing it exists not to be.
    expect(auth.match(/token\.authenticatedAt = /g)?.length).toBe(1);
  });
});

/**
 * UAT-HF P10.02 / DEC-11 — DEF-010.
 *
 * "After five or six consecutive failed sign-ins the account is locked, but the
 * message never changes ... There is no lockout notice, no cooldown duration,
 * no attempts-remaining warning." The register also records that the security
 * posture itself is correct: "fail-closed and non-enumerating ... the gap is
 * entirely in what is communicated."
 */
describe("P10.02 lockout guidance is helpful without being enumerable", () => {
  it("names the cooldown, so a locked user knows to wait rather than keep guessing", () => {
    expect(SIGN_IN_RECOVERY_GUIDANCE).toMatch(new RegExp(`${LOCK_DURATION_MS / 60_000} minutes`));
  });

  it("offers the recovery the run could not find anywhere in the product", () => {
    expect(SIGN_IN_RECOVERY_GUIDANCE).toMatch(/administrator to unlock/i);
  });

  it("is conditional in its wording — it never asserts the account IS locked", () => {
    // "may be" and "if". Saying "your account is locked" would confirm the
    // account exists, which is the enumeration the primary line avoids.
    expect(SIGN_IN_RECOVERY_GUIDANCE).toMatch(/may be temporarily locked/i);
    expect(SIGN_IN_RECOVERY_GUIDANCE).not.toMatch(/your account is locked/i);
  });

  it("depends on nothing, so it cannot vary by account", () => {
    // A constant cannot leak. This is why the guidance is a constant and not a
    // function of the user: identical after the first failure and the fifteenth,
    // for a real account and for one that does not exist.
    expect(typeof SIGN_IN_RECOVERY_GUIDANCE).toBe("string");
  });

  it("is rendered by the sign-in page alongside the unchanged primary error", () => {
    const login = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
    expect(login).toContain("SIGN_IN_RECOVERY_GUIDANCE");
    // The enumeration-safe primary line must NOT have been made specific.
    expect(login).toContain('setError("Invalid email or password. Please try again.")');
  });

  it("is importable by a client component without dragging in the server", () => {
    // It lives in session-policy.ts precisely because auth-credentials.ts pulls
    // in Prisma and bcrypt.
    const policy = readFileSync("src/lib/session-policy.ts", "utf8");
    expect(policy).not.toMatch(/from "@\/lib\/prisma"/);
    expect(policy).not.toMatch(/from "bcrypt/);
  });
});

describe("P10.02 the admin unlock path the run could not find", () => {
  const actions = readFileSync("src/app/(admin)/settings/actions.ts", "utf8");

  it("exists as its own action", () => {
    expect(actions).toContain("export async function unlockUserAccountAction");
  });

  it("requires a reason, and records it", () => {
    expect(actions).toMatch(/Give a reason for the unlock/);
    expect(actions).toMatch(/metadata: \{ targetUserId: target\.id, targetEmail: target\.email, reason/);
  });

  it("is admin-gated and tenant-scoped", () => {
    const fn = actions.slice(actions.indexOf("unlockUserAccountAction"));
    expect(fn).toContain("requireRole(ROLES.ADMIN_ONLY)");
    expect(fn).toContain("tenantId: session.user.tenantId");
  });

  it("does NOT touch credentials — an unlock is not a password event", () => {
    const fn = actions.slice(
      actions.indexOf("unlockUserAccountAction"),
      actions.length,
    );
    // The pre-existing path only unlocked as a side effect of a password reset,
    // which hands a mistyping user a new password they did not ask for.
    expect(fn).not.toContain("passwordHash");
    expect(fn).not.toContain("mustChangePassword");
    expect(fn).not.toContain("sessionVersion");
  });

  it("writes an audit row inside the tenant hash chain", () => {
    const fn = actions.slice(actions.indexOf("unlockUserAccountAction"));
    expect(fn).toContain('action: "AUTH_ACCOUNT_UNLOCKED"');
    expect(fn).toContain("tenantId: session.user.tenantId");
  });
});
