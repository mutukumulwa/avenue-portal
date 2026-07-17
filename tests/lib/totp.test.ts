import { describe, it, expect } from "vitest";
import { generateSecret, generateTotp, verifyTotp, otpauthUri } from "@/lib/totp";

describe("TOTP (RFC 6238, R81)", () => {
  it("generates a base32 secret", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it("verifies a freshly generated code", () => {
    const s = generateSecret();
    const now = Date.now();
    expect(verifyTotp(s, generateTotp(s, now), now)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const s = generateSecret();
    const now = Date.now();
    const wrong = generateTotp(s, now) === "000000" ? "111111" : "000000";
    expect(verifyTotp(s, wrong, now)).toBe(false);
  });

  it("tolerates ±1 step of drift but not more", () => {
    const s = generateSecret();
    const now = Date.now();
    expect(verifyTotp(s, generateTotp(s, now - 30_000), now, 1)).toBe(true); // prev window
    expect(verifyTotp(s, generateTotp(s, now - 90_000), now, 1)).toBe(false); // 3 steps back
  });

  it("rejects malformed tokens", () => {
    const s = generateSecret();
    expect(verifyTotp(s, "12345", Date.now())).toBe(false);
    expect(verifyTotp(s, "abcdef", Date.now())).toBe(false);
  });

  it("builds a valid otpauth URI", () => {
    const uri = otpauthUri("ABCDEF", "admin@medvex.co.ug");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=ABCDEF");
    expect(uri).toContain("issuer=Medvex");
  });

  it("matches an RFC 6238 SHA1 test vector", () => {
    // RFC 6238 seed "12345678901234567890" (ASCII) → base32; T=59s → 94287082.
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(generateTotp(secret, 59_000)).toBe("287082".padStart(6, "0").slice(-6));
  });
});

// ─── WP-8 (CU-OBS-15 / DEC-09) — compulsory-2FA rule ─────────────────────────
import { totpEnrolmentRequired, TOTP_ENFORCED_ROLES } from "@/lib/totp";

describe("totpEnrolmentRequired (WP-8, DEC-09)", () => {
  it("covers exactly the money-moving roles", () => {
    expect([...TOTP_ENFORCED_ROLES].sort()).toEqual(["FINANCE_OFFICER", "SUPER_ADMIN", "UNDERWRITER"]);
  });

  it("requires enrolment for an enforced role without TOTP", () => {
    expect(totpEnrolmentRequired("SUPER_ADMIN", false)).toBe(true);
    expect(totpEnrolmentRequired("FINANCE_OFFICER", false)).toBe(true);
    expect(totpEnrolmentRequired("UNDERWRITER", false)).toBe(true);
  });

  it("is satisfied once TOTP is enabled", () => {
    expect(totpEnrolmentRequired("SUPER_ADMIN", true)).toBe(false);
  });

  it("does not constrain non-privileged roles or missing roles", () => {
    expect(totpEnrolmentRequired("CLAIMS_OFFICER", false)).toBe(false);
    expect(totpEnrolmentRequired("MEMBER_USER", false)).toBe(false);
    expect(totpEnrolmentRequired(undefined, false)).toBe(false);
    expect(totpEnrolmentRequired(null, false)).toBe(false);
  });
});
