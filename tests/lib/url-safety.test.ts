/**
 * F9.3 — SSRF-safe outbound URL validation (pure). Rejects non-HTTPS, embedded
 * credentials, private/loopback/link-local/reserved IP literals, internal
 * hostnames, and off-allowlist hosts; accepts a public HTTPS endpoint.
 */
import { describe, it, expect } from "vitest";
import { assertSafeOutboundUrl, isBlockedHost, hostMatchesAllowlist, UrlSafetyError } from "@/lib/url-safety";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof UrlSafetyError ? e.code : "OTHER";
  }
}

describe("assertSafeOutboundUrl", () => {
  it("accepts a public https endpoint and returns the normalized parts", () => {
    const r = assertSafeOutboundUrl("https://hms.aku.edu/api/v1/batches");
    expect(r.hostname).toBe("hms.aku.edu");
    expect(r.href).toContain("https://hms.aku.edu");
  });

  it("rejects a non-absolute URL", () => {
    expect(code(() => assertSafeOutboundUrl("/relative/path"))).toBe("NOT_ABSOLUTE");
  });

  it("rejects a non-HTTPS scheme", () => {
    expect(code(() => assertSafeOutboundUrl("http://hms.aku.edu"))).toBe("NOT_HTTPS");
    expect(code(() => assertSafeOutboundUrl("ftp://hms.aku.edu"))).toBe("NOT_HTTPS");
    expect(code(() => assertSafeOutboundUrl("file:///etc/passwd"))).toBe("NOT_HTTPS");
  });

  it("rejects embedded credentials", () => {
    expect(code(() => assertSafeOutboundUrl("https://user:pass@hms.aku.edu"))).toBe("EMBEDDED_CREDENTIALS");
  });

  it("rejects private / loopback / link-local / reserved IPv4 literals", () => {
    for (const h of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.1", "192.168.1.1", "0.0.0.0", "100.64.0.1", "224.0.0.1", "240.0.0.1"]) {
      expect(code(() => assertSafeOutboundUrl(`https://${h}/x`))).toBe("BLOCKED_HOST");
    }
  });

  it("allows a public IPv4 literal (subject to the runtime resolution check in F9.7)", () => {
    // 8.8.8.8 is public — the URL FORM is safe; runtime DNS/redirect checks are F9.7.
    expect(() => assertSafeOutboundUrl("https://8.8.8.8/x")).not.toThrow();
  });

  it("rejects internal hostnames", () => {
    for (const h of ["localhost", "db.localhost", "svc.internal", "printer.local", "host.lan"]) {
      expect(code(() => assertSafeOutboundUrl(`https://${h}/x`))).toBe("BLOCKED_HOST");
    }
  });

  it("rejects IPv6 loopback / link-local / ULA / IPv4-mapped-private literals", () => {
    for (const h of ["[::1]", "[fe80::1]", "[fc00::1]", "[fd12:3456::1]", "[::ffff:127.0.0.1]", "[::ffff:10.0.0.1]"]) {
      expect(code(() => assertSafeOutboundUrl(`https://${h}/x`))).toBe("BLOCKED_HOST");
    }
  });

  it("enforces an allowlist when one is supplied", () => {
    expect(code(() => assertSafeOutboundUrl("https://evil.example.com/x", { allowlist: ["hms.aku.edu"] }))).toBe("NOT_ALLOWLISTED");
    expect(() => assertSafeOutboundUrl("https://hms.aku.edu/x", { allowlist: ["hms.aku.edu"] })).not.toThrow();
    // wildcard suffix
    expect(() => assertSafeOutboundUrl("https://edi.slade360.co.ke/x", { allowlist: ["*.slade360.co.ke"] })).not.toThrow();
    expect(code(() => assertSafeOutboundUrl("https://slade360.co.ke/x", { allowlist: ["*.slade360.co.ke"] }))).toBe("NOT_ALLOWLISTED");
  });
});

describe("isBlockedHost / hostMatchesAllowlist", () => {
  it("classifies blocked vs routable hosts", () => {
    expect(isBlockedHost("10.1.2.3")).toBe(true);
    expect(isBlockedHost("192.0.2.1")).toBe(false); // TEST-NET is not private per our block set (routable-form)
    expect(isBlockedHost("hms.aku.edu")).toBe(false);
    expect(isBlockedHost("")).toBe(true);
  });
  it("matches exact and wildcard allowlist entries", () => {
    expect(hostMatchesAllowlist("a.b.com", ["a.b.com"])).toBe(true);
    expect(hostMatchesAllowlist("x.b.com", ["*.b.com"])).toBe(true);
    expect(hostMatchesAllowlist("b.com", ["*.b.com"])).toBe(false);
    expect(hostMatchesAllowlist("a.evil.com", ["*.b.com"])).toBe(false);
  });
});
