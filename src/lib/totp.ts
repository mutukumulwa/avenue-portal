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

/** Verify a token, tolerating ±`window` steps of clock drift. */
export function verifyTotp(
  secret: string,
  token: string,
  at: number = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(token || "")) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(key, counter + w) === token) return true;
  }
  return false;
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

/** True when the role demands TOTP and the user hasn't enrolled yet. */
export function totpEnrolmentRequired(role: string | null | undefined, totpEnabled: boolean): boolean {
  return !!role && TOTP_ENFORCED_ROLES.has(role) && !totpEnabled;
}
