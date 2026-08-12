import { createHmac, randomBytes } from "node:crypto";

/**
 * RFC 6238 TOTP (Medvex spec §6 / R81 / gap H-01), hand-rolled on node crypto
 * (no otplib/speakeasy dependency). 6 digits, 30-second step, HMAC-SHA1 —
 * compatible with Google Authenticator, Authy, 1Password, etc.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function generateTotp(secret: string, at: number = Date.now(), step = 30): string {
  return hotp(base32Decode(secret), Math.floor(at / 1000 / step));
}

/**
 * Which time step a token matched, or null.
 *
 * UAT-HF P10.03 — DEF-013: "A code was used to sign in successfully; after
 * logout the SAME code was submitted again in a brand-new browser profile and
 * was ACCEPTED, opening a second authenticated session ... There is no
 * one-time-use enforcement." With ±1 step of drift tolerance the replay window
 * is roughly 90 seconds.
 *
 * A boolean cannot be made single-use: to reject a replay you have to know
 * WHICH code was accepted, and a counter is the only thing that identifies it
 * without storing the code. Callers persist the returned counter and refuse
 * anything at or below it — see `consumeTotpCounter`.
 *
 * Steps are checked from oldest to newest so a token that somehow matches more
 * than one step (astronomically unlikely, but the loop must be deterministic)
 * yields the LOWEST counter — never a higher one, which would silently burn
 * intervening steps.
 */
export function verifyTotpCounter(
  secret: string,
  token: string,
  at: number = Date.now(),
  window = 1,
): number | null {
  if (!/^\d{6}$/.test(token || "")) return null;
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(key, counter + w) === token) return counter + w;
  }
  return null;
}

/**
 * Verify a token, tolerating ±`window` steps of clock drift.
 *
 * ⚠️ This answers "is this code currently valid", NOT "may this code be used".
 * It cannot detect a replay. Anything that grants a session or authorises a
 * privileged change must use {@link verifyTotpCounter} and persist the counter.
 */
export function verifyTotp(
  secret: string,
  token: string,
  at: number = Date.now(),
  window = 1,
): boolean {
  return verifyTotpCounter(secret, token, at, window) !== null;
}

/** otpauth:// URI for authenticator apps (rendered as text/QR at enrolment). */
export function otpauthUri(secret: string, account: string, issuer = "Medvex"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * WP-8 (CU-OBS-15 / DEC-09, accepted 2026-07-16): roles for which two-factor
 * is COMPULSORY — the money-moving and cover-granting staff. A privileged user
 * without an enrolled authenticator may still sign in (enrolment grace) but is
 * confined to Settings → Security until TOTP is enabled; verification itself
 * is already mandatory once enabled (R81).
 */
export const TOTP_ENFORCED_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "FINANCE_OFFICER",
  "UNDERWRITER",
]);

/** True when the role demands TOTP and the user hasn't enrolled yet (pure rule). */
export function totpEnrolmentRequired(role: string | null | undefined, totpEnabled: boolean): boolean {
  return !!role && TOTP_ENFORCED_ROLES.has(role) && !totpEnabled;
}

/**
 * Deployment gate for the WP-8 rule (Arthur, 2026-07-17): during the test
 * phase shared UAT personas hold privileged roles and testers cannot enrol
 * authenticators, so enforcement is OFF unless the environment says otherwise.
 * Go-live checklist (H8): set REQUIRE_PRIVILEGED_2FA=true in Vercel — nothing
 * else changes; the grace/confinement flow activates for the DEC-09 roles.
 */
export function totpEnforcementActive(env: Record<string, string | undefined> = process.env): boolean {
  return ["true", "1", "on"].includes((env.REQUIRE_PRIVILEGED_2FA ?? "").toLowerCase());
}

/** The rule × the deployment gate — what login/requireRole actually consult. */
export function totpEnrolmentRequiredNow(
  role: string | null | undefined,
  totpEnabled: boolean,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return totpEnforcementActive(env) && totpEnrolmentRequired(role, totpEnabled);
}

/**
 * UAT-HF P10.03 — spend a TOTP time step, atomically.
 *
 * DEF-013 in one function. The conditional update is the whole mechanism:
 *
 *   UPDATE "User" SET "lastTotpCounter" = $counter
 *    WHERE id = $id AND ("lastTotpCounter" IS NULL OR "lastTotpCounter" < $counter)
 *
 * A row is matched only if this step is strictly newer than the last one spent,
 * so:
 *
 *   * a replay of a consumed code matches nothing → rejected;
 *   * two simultaneous attempts with the SAME code race on the same row, one
 *     matches and one does not → exactly one session, which is the acceptance's
 *     "parallel same-code attempts yield exactly one session";
 *   * a code from an EARLIER step than one already spent is also rejected, so
 *     the ±1 drift window cannot be walked backwards.
 *
 * Read-then-write would reopen the race it exists to close, so the check lives
 * in the WHERE clause.
 *
 * Returns false when the step was already spent. Callers must treat that
 * exactly like a wrong code — including counting it as a failed attempt — so a
 * replay is not distinguishable from a bad code by response or by timing.
 */
export async function consumeTotpCounter(
  db: {
    user: {
      updateMany(args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }): Promise<{ count: number }>;
    };
  },
  userId: string,
  counter: number,
): Promise<boolean> {
  const result = await db.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: counter } }],
    },
    data: { lastTotpCounter: counter },
  });
  return result.count === 1;
}
