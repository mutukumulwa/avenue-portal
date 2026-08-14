import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PASSWORD_BCRYPT_COST } from "@/lib/password-policy";

/**
 * The sign-in enumeration oracle.
 *
 * `authorizeCredentials` returned in microseconds when no account matched,
 * while a real account spent ~100 ms inside bcrypt. Every response body was
 * identical (D-13) and the wall clock told you anyway: submit an address, time
 * the refusal, learn whether that person has an account on this system.
 *
 * `evaluateSignInStep` had a guard against exactly this — and it was a
 * **cost-10** hash while the application hashes passwords at 12, roughly a
 * quarter of the work. It narrowed the gap and read as solved, which is worse
 * than an obvious hole: nobody re-examines a control that looks present.
 *
 * The cost factor is therefore the thing to pin. Timing itself is not asserted
 * here — a wall-clock assertion on a shared CI box is a flaky test, and the
 * property that actually matters (same cost factor, same work) is exact.
 */

const REAL_PASSWORD_HASH_CALL = /bcrypt\.hash\([^,)]+,\s*(\d+)\)/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("the equaliser does the same work as a real comparison", () => {
  it("is hashed at exactly the cost the application uses", async () => {
    const { TIMING_EQUALISER_HASH } = await import("@/lib/auth-credentials");
    // "$2a$12$..." — the middle field is the cost. This single assertion is what
    // the cost-10 copy would have failed.
    const cost = Number(TIMING_EQUALISER_HASH.split("$")[2]);
    expect(cost).toBe(PASSWORD_BCRYPT_COST);
  });

  it("is a valid bcrypt hash that matches nothing anyone could supply", async () => {
    const { TIMING_EQUALISER_HASH } = await import("@/lib/auth-credentials");
    expect(TIMING_EQUALISER_HASH).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);

    // importActual, NOT the top-level import: `vi.mock("bcryptjs")` below is
    // hoisted above every import in this file, so a plain `bcrypt.compare` here
    // asks the MOCK whether the guess matches — and the mock always says no.
    // Written that way first, this test passed even when the mock was changed
    // to claim every guess DID match. It asserted nothing.
    const realBcrypt = await vi.importActual<typeof import("bcryptjs")>("bcryptjs");
    for (const guess of ["", "password", "admin", TIMING_EQUALISER_HASH]) {
      expect(await realBcrypt.compare(guess, TIMING_EQUALISER_HASH)).toBe(false);
    }
  });

  it("no password-hashing call site disagrees with the constant", () => {
    // The equaliser can only equalise what the application actually writes. A
    // call site left at a literal 12 is fine today and silently wrong the day
    // the constant moves — which is precisely how the cost-10 copy survived.
    const offenders: string[] = [];
    // src/ only. scripts/ holds provisioning tools that are not part of the
    // deployed application, and one of them is untracked work belonging to
    // another session — not this task's to change.
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      if (!/passwordHash|newPassword|adminPassword/.test(src)) continue;
      for (const m of src.matchAll(REAL_PASSWORD_HASH_CALL)) {
        // 10 is deliberate for high-entropy secrets (API keys, reset codes,
        // integration secrets) — those are not user passwords and are not
        // subject to this control.
        if (m[1] !== "10") offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Both rejection paths have to pay. Fixing only "no such account" moves the
 * oracle rather than closing it: once an unknown address costs ~100 ms, an
 * INSTANT refusal identifies a locked — therefore existing — account.
 */
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  compare: vi.fn(async () => false),
  hash: vi.fn(async () => "hashed"),
  registerFailedAttempt: vi.fn(async () => {}),
  auditCreate: vi.fn(async () => ({})),
  auditFindFirst: vi.fn(async () => null),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: mocks.compare, hash: mocks.hash },
  compare: mocks.compare,
  hash: mocks.hash,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findFirst, update: vi.fn(async () => ({ sessionVersion: 1 })) },
    auditLog: { create: mocks.auditCreate, findFirst: mocks.auditFindFirst },
    userRoleAssignment: { findMany: vi.fn(async () => []) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compare.mockResolvedValue(false);
  mocks.auditFindFirst.mockResolvedValue(null);
  mocks.auditCreate.mockResolvedValue({});
});

/** Which hashes were compared against, in order. */
const comparedAgainst = () => mocks.compare.mock.calls.map((c: unknown[]) => c[1]);

describe("every rejection costs a comparison — authorizeCredentials", () => {
  it("spends one when no account matches", async () => {
    const { authorizeCredentials, TIMING_EQUALISER_HASH } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue(null);

    expect(await authorizeCredentials({ email: "nobody@b.ug", password: "x" })).toBeNull();
    // This is the oracle. Before the fix there was no compare at all here.
    expect(comparedAgainst()).toContain(TIMING_EQUALISER_HASH);
  });

  it("spends one when the account is locked", async () => {
    const { authorizeCredentials, TIMING_EQUALISER_HASH } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue({
      id: "u1", email: "a@b.ug", passwordHash: "REAL", tenantId: "t1", role: "CLAIMS_OFFICER",
      firstName: "A", lastName: "B", totpEnabled: false, totpSecret: null,
      mustChangePassword: false, failedLoginCount: 0, lastFailedLoginAt: null,
      lockedUntil: new Date(Date.now() + 600_000),
    });

    expect(await authorizeCredentials({ email: "a@b.ug", password: "x" })).toBeNull();
    expect(comparedAgainst()).toContain(TIMING_EQUALISER_HASH);
  });

  it("never compares a locked account against its REAL hash", async () => {
    // The lock must not become an oracle for the password itself. Equalising is
    // about duration; it must buy no information.
    const { authorizeCredentials } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue({
      id: "u1", email: "a@b.ug", passwordHash: "REAL", tenantId: "t1", role: "CLAIMS_OFFICER",
      firstName: "A", lastName: "B", totpEnabled: false, totpSecret: null,
      mustChangePassword: false, failedLoginCount: 0, lastFailedLoginAt: null,
      lockedUntil: new Date(Date.now() + 600_000),
    });

    await authorizeCredentials({ email: "a@b.ug", password: "x" });
    expect(comparedAgainst()).not.toContain("REAL");
  });

  it("still compares against the real hash for a live account", async () => {
    // The equaliser must not have replaced the actual authentication.
    const { authorizeCredentials } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue({
      id: "u1", email: "a@b.ug", passwordHash: "REAL", tenantId: "t1", role: "CLAIMS_OFFICER",
      firstName: "A", lastName: "B", totpEnabled: false, totpSecret: null,
      mustChangePassword: false, failedLoginCount: 0, lastFailedLoginAt: null,
      lockedUntil: null,
    });

    await authorizeCredentials({ email: "a@b.ug", password: "x" });
    expect(comparedAgainst()).toEqual(["REAL"]);
  });

  it("a throwing compare does not turn a rejection into an error", async () => {
    const { authorizeCredentials } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue(null);
    mocks.compare.mockRejectedValue(new Error("bcrypt exploded"));
    await expect(authorizeCredentials({ email: "n@b.ug", password: "x" })).resolves.toBeNull();
  });
});

describe("every rejection costs a comparison — evaluateSignInStep", () => {
  it("spends one when the account is locked", async () => {
    // This step already equalised the no-account path. The locked path was the
    // half it missed, so the oracle survived in the cheaper of the two entry
    // points — the one an attacker would target.
    const { evaluateSignInStep } = await import("@/lib/auth-challenge");
    const { TIMING_EQUALISER_HASH } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue({
      id: "u1", tenantId: "t1", passwordHash: "REAL",
      totpEnabled: false, totpSecret: null, lockedUntil: new Date(Date.now() + 600_000),
    });

    expect(await evaluateSignInStep("a@b.ug", "x")).toBe("REJECTED");
    expect(comparedAgainst()).toContain(TIMING_EQUALISER_HASH);
    expect(comparedAgainst()).not.toContain("REAL");
  });

  it("spends one when no account matches", async () => {
    const { evaluateSignInStep } = await import("@/lib/auth-challenge");
    const { TIMING_EQUALISER_HASH } = await import("@/lib/auth-credentials");
    mocks.findFirst.mockResolvedValue(null);

    expect(await evaluateSignInStep("nobody@b.ug", "x")).toBe("REJECTED");
    expect(comparedAgainst()).toContain(TIMING_EQUALISER_HASH);
  });
});
