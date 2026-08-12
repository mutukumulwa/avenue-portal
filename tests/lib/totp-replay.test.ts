/**
 * UAT-HF P10.03 acceptance — "first current code succeeds, immediate replay
 * fails, next time-step succeeds, parallel same-code attempts yield exactly one
 * session."
 *
 * DEF-013: "A code was used to sign in successfully; after logout the SAME code
 * was submitted again in a brand-new browser profile and was ACCEPTED, opening
 * a second authenticated session ... There is no one-time-use enforcement."
 */
import { describe, it, expect, vi } from "vitest";
import {
  consumeTotpCounter,
  generateSecret,
  generateTotp,
  verifyTotp,
  verifyTotpCounter,
} from "@/lib/totp";

const SECRET = generateSecret();
const T0 = 1_770_000_000_000; // fixed instant; step = 30s
const STEP_MS = 30_000;

/** A tiny in-memory stand-in for the conditional UPDATE. */
function fakeUserStore(initial: number | null = null) {
  const state = { lastTotpCounter: initial };
  return {
    state,
    db: {
      user: {
        updateMany: vi.fn(async (args: { where: any; data: any }) => {
          const counter = args.data.lastTotpCounter as number;
          const current = state.lastTotpCounter;
          // Mirrors `OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt } }]`.
          if (current === null || current < counter) {
            state.lastTotpCounter = counter;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
    },
  };
}

describe("P10.03 verifyTotpCounter reports WHICH step matched", () => {
  it("returns the current step for a current code", () => {
    const code = generateTotp(SECRET, T0);
    expect(verifyTotpCounter(SECRET, code, T0)).toBe(Math.floor(T0 / 1000 / 30));
  });

  it("returns the neighbouring step for a code one step old, within drift", () => {
    const code = generateTotp(SECRET, T0 - STEP_MS);
    expect(verifyTotpCounter(SECRET, code, T0)).toBe(Math.floor(T0 / 1000 / 30) - 1);
  });

  it("returns null for a wrong or malformed code", () => {
    expect(verifyTotpCounter(SECRET, "000000", T0)).toBeNull();
    expect(verifyTotpCounter(SECRET, "abc", T0)).toBeNull();
    expect(verifyTotpCounter(SECRET, "", T0)).toBeNull();
  });

  it("returns null outside the drift window", () => {
    const old = generateTotp(SECRET, T0 - 5 * STEP_MS);
    expect(verifyTotpCounter(SECRET, old, T0)).toBeNull();
  });

  it("verifyTotp is still the boolean view of the same answer", () => {
    const code = generateTotp(SECRET, T0);
    expect(verifyTotp(SECRET, code, T0)).toBe(true);
    expect(verifyTotp(SECRET, "000000", T0)).toBe(false);
  });
});

describe("P10.03 DEF-013 — a spent code cannot be spent again", () => {
  it("first use succeeds", async () => {
    const { db } = fakeUserStore();
    const counter = verifyTotpCounter(SECRET, generateTotp(SECRET, T0), T0)!;
    expect(await consumeTotpCounter(db, "u1", counter)).toBe(true);
  });

  it("the immediate replay fails — the run's exact reproduction", async () => {
    const { db } = fakeUserStore();
    const code = generateTotp(SECRET, T0);
    const counter = verifyTotpCounter(SECRET, code, T0)!;

    expect(await consumeTotpCounter(db, "u1", counter)).toBe(true);
    // "In a fresh browser profile, sign in again with the SAME code while it is
    // still valid." The code still VERIFIES; it may no longer be spent.
    expect(verifyTotpCounter(SECRET, code, T0)).toBe(counter);
    expect(await consumeTotpCounter(db, "u1", counter)).toBe(false);
  });

  it("the next time step succeeds, so a legitimate user is not locked out", async () => {
    const { db } = fakeUserStore();
    const first = verifyTotpCounter(SECRET, generateTotp(SECRET, T0), T0)!;
    await consumeTotpCounter(db, "u1", first);

    const later = T0 + STEP_MS;
    const next = verifyTotpCounter(SECRET, generateTotp(SECRET, later), later)!;
    expect(next).toBe(first + 1);
    expect(await consumeTotpCounter(db, "u1", next)).toBe(true);
  });

  it("an EARLIER step is refused, so the drift window cannot be walked backwards", async () => {
    const { db } = fakeUserStore();
    const current = verifyTotpCounter(SECRET, generateTotp(SECRET, T0), T0)!;
    await consumeTotpCounter(db, "u1", current);

    // The -1 drift code is still cryptographically valid at T0...
    const drifted = verifyTotpCounter(SECRET, generateTotp(SECRET, T0 - STEP_MS), T0)!;
    expect(drifted).toBe(current - 1);
    // ...but it is older than what has been spent, so it buys nothing. Without
    // this the 90-second window the register measured stays open backwards.
    expect(await consumeTotpCounter(db, "u1", drifted)).toBe(false);
  });

  it("a user who has never used a code is accepted (NULL means nothing spent)", async () => {
    const { db, state } = fakeUserStore(null);
    expect(state.lastTotpCounter).toBeNull();
    expect(await consumeTotpCounter(db, "u1", 12345)).toBe(true);
    expect(state.lastTotpCounter).toBe(12345);
  });
});

describe("P10.03 parallel same-code attempts yield exactly one session", () => {
  it("only one of ten simultaneous attempts with one code succeeds", async () => {
    const { db } = fakeUserStore();
    const counter = verifyTotpCounter(SECRET, generateTotp(SECRET, T0), T0)!;

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeTotpCounter(db, "u1", counter)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("puts the check in the WHERE clause, not in a read-then-write", async () => {
    const { db } = fakeUserStore();
    await consumeTotpCounter(db, "u1", 100);
    const where = db.user.updateMany.mock.calls[0][0].where;
    // Reading the counter and then updating it would reopen the race this
    // exists to close.
    expect(where.OR).toEqual([{ lastTotpCounter: null }, { lastTotpCounter: { lt: 100 } }]);
    expect(where.id).toBe("u1");
  });
});

describe("P10.03 the sign-in path spends the step", () => {
  const source = readSource("src/lib/auth-credentials.ts");

  it("verifies the counter rather than a bare boolean", () => {
    expect(source).toContain("verifyTotpCounter");
    expect(source).toContain("consumeTotpCounter");
  });

  it("only spends the step once the password is known good", () => {
    // Otherwise a wrong password could burn a legitimate user's code.
    expect(source).toMatch(/isPasswordValid &&\s*\(await consumeTotpCounter/);
  });

  it("a replay counts as a failed authentication, like any bad code", () => {
    // `totpOk` folds into the same `authOk` the lockout counter keys on, so a
    // replay is not distinguishable from a mistype by response or by timing.
    expect(source).toContain("const authOk = isPasswordValid && totpOk;");
  });
});

describe("P10.03 enrolment spends the step too", () => {
  const source = readSource("src/app/(admin)/settings/security/actions.ts");

  it("consumes the code that switched two-factor on", () => {
    // Otherwise the enrolment code is immediately replayable as a sign-in.
    expect(source).toContain("consumeTotpCounter");
  });

  it("reports a replay with the same wording as a wrong code", () => {
    const replies = source.match(/return \{ error: "Incorrect code — try again\." \}/g) ?? [];
    expect(replies.length).toBeGreaterThanOrEqual(2);
  });
});

function readSource(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(path, "utf8");
}
