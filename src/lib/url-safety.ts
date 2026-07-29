/**
 * PNOS F9.3 — SSRF-safe outbound URL validation (§8.12 "HTTPS only; explicit
 * host/IP allowlist and DNS rebinding protection").
 *
 * Pure, dependency-free URL-FORM checks used when an integration admin configures
 * an outbound endpoint (PULL/BIDIRECTIONAL) and — at request time — by the F9.7
 * transport. This module rejects the dangerous URL *forms*: non-HTTPS schemes,
 * embedded credentials, and literal private/loopback/link-local/reserved IPs or
 * internal hostnames, plus enforces an optional host allowlist.
 *
 * LIMITATION (documented, closed in F9.7): a hostname that RESOLVES to a private
 * address (DNS rebinding) can only be caught by resolving at connect time and
 * re-checking the resolved IP. That runtime guard belongs to the F9.7 transport;
 * this module validates the form a human/config can supply.
 */

export type UrlSafetyCode =
  | "NOT_ABSOLUTE"
  | "NOT_HTTPS"
  | "EMBEDDED_CREDENTIALS"
  | "BLOCKED_HOST"
  | "NOT_ALLOWLISTED";

export class UrlSafetyError extends Error {
  constructor(public code: UrlSafetyCode, message: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

export interface SafeUrl {
  href: string;
  hostname: string;
  port: string;
}

/** IPv4 dotted-quad → the four octets, or null if not a well-formed IPv4 literal. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
  if (octets.some((o) => o > 255)) return null;
  return [octets[0], octets[1], octets[2], octets[3]];
}

/** True when an IPv4 literal falls in a private / loopback / link-local / reserved range. */
function isBlockedIpv4(o: [number, number, number, number]): boolean {
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && o[2] === 0) return true; // 192.0.0/24 IETF
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
  return false;
}

/**
 * Classify a hostname literal. Returns true when the host must be BLOCKED for an
 * outbound integration call (never a public destination). Non-IP hostnames are
 * blocked only for the well-known internal names; a normal DNS name returns false
 * here and is subject to the allowlist + the F9.7 runtime resolution check.
 */
export function isBlockedHost(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, ""); // strip IPv6 brackets
  if (!host) return true;

  // Internal / non-routable names.
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;

  const v4 = parseIpv4(host);
  if (v4) return isBlockedIpv4(v4);

  // IPv6 literals.
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true; // loopback / unspecified
    if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) return true; // link-local fe80::/10
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local fc00::/7
    // IPv4-mapped ::ffff:a.b.c.d — the URL parser may serialize the embedded v4 in
    // hex (::ffff:7f00:1), so block the whole mapped range: it is never a legitimate
    // public destination here and is a classic v4-filter bypass.
    if (host.startsWith("::ffff:") || host.startsWith("::")) return true;
    return false; // a routable public IPv6 literal
  }

  return false; // an ordinary DNS hostname
}

/** True when the host matches an allowlist entry (exact, or a `*.domain` suffix). */
export function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = hostname.trim().toLowerCase();
  return allowlist.some((raw) => {
    const entry = raw.trim().toLowerCase();
    if (!entry) return false;
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // ".domain.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === entry;
  });
}

/**
 * Assert a raw URL is a safe HTTPS outbound target. Throws UrlSafetyError with a
 * code; returns the normalized SafeUrl on success.
 */
export function assertSafeOutboundUrl(rawUrl: string, opts: { allowlist?: string[] } = {}): SafeUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlSafetyError("NOT_ABSOLUTE", "URL must be absolute (https://host/…).");
  }
  if (url.protocol !== "https:") {
    throw new UrlSafetyError("NOT_HTTPS", "Only https:// endpoints are allowed.");
  }
  if (url.username || url.password) {
    throw new UrlSafetyError("EMBEDDED_CREDENTIALS", "Credentials must not be embedded in the URL.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new UrlSafetyError("BLOCKED_HOST", "Endpoint host is a private, loopback, or internal address.");
  }
  if (opts.allowlist && opts.allowlist.length > 0 && !hostMatchesAllowlist(url.hostname, opts.allowlist)) {
    throw new UrlSafetyError("NOT_ALLOWLISTED", "Endpoint host is not in the configured allowlist.");
  }
  return { href: url.href, hostname: url.hostname, port: url.port };
}
