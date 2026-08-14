import { describe, it, expect } from "vitest";
import { clientIpFrom, proxyHeaderIsTrusted, isPlausibleIp } from "@/lib/request-ip";

/**
 * UAT-HF P10.07 — whether the client IP can be trusted as a rate-limit key.
 *
 * This is the file where getting it wrong is worse than not doing it at all.
 * `x-forwarded-for` is a request header; anyone can set it. Keying a rate limit
 * on an attacker-chosen value gives them two things:
 *
 *   1. rotate the header, and the limit never applies to them;
 *   2. put a **victim's** address in it, and have that address blocked.
 *
 * The second turns a brute-force defence into a denial-of-service tool aimed at
 * whoever the attacker names. That is why "use it as a best effort" is not an
 * option, and why these tests are about refusing rather than parsing.
 */

const hdrs = (map: Record<string, string>) => ({
  get: (n: string) => map[n.toLowerCase()] ?? null,
});

describe("when the header is trusted", () => {
  it("is trusted on Vercel, which overwrites it to prevent spoofing", () => {
    // Vercel's documented behaviour, and the whole basis for using it at all.
    expect(proxyHeaderIsTrusted({ VERCEL: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(proxyHeaderIsTrusted({ VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("is NOT trusted by default anywhere else", () => {
    // A self-hosted deployment, a container behind an unknown ingress, the
    // in-country option. Defaulting to trust here is how the DoS above ships.
    expect(proxyHeaderIsTrusted({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("can be asserted by an operator who knows their proxy overwrites it", () => {
    expect(proxyHeaderIsTrusted({ TRUST_PROXY_IP_HEADER: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("lets an explicit opt-out override the platform default", () => {
    // Belt and braces for an Enterprise account with a trusted proxy enabled,
    // where Vercel's overwrite guarantee no longer holds.
    expect(
      proxyHeaderIsTrusted({ VERCEL: "1", TRUST_PROXY_IP_HEADER: "false" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("only 'true' turns it on — not any truthy string", () => {
    // "1", "yes" and "TRUE" all read as enabled to a careless implementation.
    // A security switch should not be ambiguous about what enables it.
    for (const v of ["1", "yes", "TRUE", "on"]) {
      expect(proxyHeaderIsTrusted({ TRUST_PROXY_IP_HEADER: v } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
  });
});

describe("reading the address", () => {
  const trusted = { VERCEL: "1" } as unknown as NodeJS.ProcessEnv;

  it("returns no key at all when the header is not trusted", () => {
    // Not a fallback to the header anyway. Refusing to key the limiter is the
    // point: no rate limiting is strictly safer than one an attacker aims.
    const r = clientIpFrom(hdrs({ "x-forwarded-for": "1.2.3.4" }), {} as unknown as NodeJS.ProcessEnv);
    expect(r).toEqual({ trusted: false, reason: "NO_PROXY_TRUST" });
  });

  it("takes the leftmost entry, the original client", () => {
    const r = clientIpFrom(hdrs({ "x-forwarded-for": "41.210.0.9, 10.0.0.1" }), trusted);
    expect(r).toEqual({ trusted: true, ip: "41.210.0.9" });
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpFrom(hdrs({ "x-real-ip": "41.210.0.9" }), trusted)).toEqual({
      trusted: true,
      ip: "41.210.0.9",
    });
  });

  it("normalises the IPv4-mapped IPv6 form to one key", () => {
    // ::ffff:41.210.0.9 and 41.210.0.9 are the same client. Two keys would give
    // that client twice the allowance.
    expect(clientIpFrom(hdrs({ "x-forwarded-for": "::ffff:41.210.0.9" }), trusted)).toEqual({
      trusted: true,
      ip: "41.210.0.9",
    });
  });

  it("handles an IPv6 address", () => {
    expect(clientIpFrom(hdrs({ "x-forwarded-for": "2c0f:f6d0::1" }), trusted)).toEqual({
      trusted: true,
      ip: "2c0f:f6d0::1",
    });
  });

  it("returns no key when there is no header", () => {
    expect(clientIpFrom(hdrs({}), trusted)).toEqual({ trusted: false, reason: "NO_HEADER" });
    expect(clientIpFrom(null, trusted)).toEqual({ trusted: false, reason: "NO_HEADER" });
  });

  it("rejects a value that is not IP-shaped", () => {
    // The value becomes a PRIMARY KEY. Without a shape check, a misbehaving
    // proxy on a trusted deployment could write unbounded arbitrary rows.
    for (const bad of ["not-an-ip", "<script>", "a".repeat(200), " ", "localhost"]) {
      expect(clientIpFrom(hdrs({ "x-forwarded-for": bad }), trusted).trusted).toBe(false);
    }
  });
});

describe("the shape check", () => {
  it("accepts real addresses", () => {
    for (const ip of ["41.210.0.9", "255.255.255.255", "::1", "2c0f:f6d0:0:1::abcd"]) {
      expect(isPlausibleIp(ip), ip).toBe(true);
    }
  });

  it("rejects anything longer than the longest IPv6 text form", () => {
    expect(isPlausibleIp("1".repeat(46))).toBe(false);
  });

  it("requires a separator, so a bare number is not an address", () => {
    expect(isPlausibleIp("12345")).toBe(false);
    expect(isPlausibleIp("")).toBe(false);
  });
});
