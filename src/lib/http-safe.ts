import { lookup as dnsLookup } from "node:dns/promises";
import { assertSafeOutboundUrl, isBlockedHost, UrlSafetyError } from "@/lib/url-safety";

/**
 * PNOS F9.7 — SSRF-safe outbound fetch with RUNTIME DNS-rebinding protection.
 *
 * This closes the form-only limitation the F9.3 URL validator documented: a
 * hostname can pass the form check yet RESOLVE to a private address. Here we
 * resolve the host at call time and reject if ANY resolved IP is private/
 * loopback/link-local/reserved — plus HTTPS-only, a hard timeout, a response body
 * cap, and NO redirect following (a redirect to an internal address is a classic
 * SSRF pivot; a data endpoint must not redirect).
 *
 * The DNS resolver and the fetcher are injectable so the pull adapter can be tested
 * hermetically (no real network). The defaults use node:dns + global fetch.
 *
 * Residual note: global fetch re-resolves DNS, so a determined attacker with a
 * sub-timeout rebind could still race the pre-flight check. Full closure needs
 * connection pinning to the validated IP (an undici Agent with a validating
 * lookup) — that hardening lands with the F9.7 PILOT ACTIVATION (gated on a signed
 * contract), where the concrete endpoint + TLS pinning are known.
 */

export interface SafeFetchDeps {
  /** Resolve a hostname to its IP strings. Default: node:dns lookup (all). */
  resolver?: (hostname: string) => Promise<string[]>;
  /** Perform the actual request. Default: global fetch with redirect: "manual". */
  fetcher?: (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<SafeFetchResponse>;
}

export interface SafeFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface SafeFetchOptions {
  allowlist?: string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBodyBytes?: number;
}

export interface SafeFetchResult {
  status: number;
  body: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BODY_BYTES = 5_000_000; // 5 MB

async function defaultResolver(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
}

const defaultFetcher: NonNullable<SafeFetchDeps["fetcher"]> = async (url, init) => {
  const res = await fetch(url, { method: "GET", redirect: "manual", signal: init.signal, headers: init.headers });
  return res as unknown as SafeFetchResponse;
};

/**
 * Resolve a hostname and assert EVERY resolved IP is a public destination. Throws
 * UrlSafetyError("BLOCKED_HOST") on a private/loopback/reserved resolution or an
 * empty resolution.
 */
export async function resolveAndAssertPublic(hostname: string, resolver: (h: string) => Promise<string[]>): Promise<string[]> {
  let ips: string[];
  try {
    ips = await resolver(hostname);
  } catch {
    throw new UrlSafetyError("BLOCKED_HOST", "Endpoint host could not be resolved.");
  }
  if (ips.length === 0) throw new UrlSafetyError("BLOCKED_HOST", "Endpoint host resolved to no address.");
  for (const ip of ips) {
    if (isBlockedHost(ip)) throw new UrlSafetyError("BLOCKED_HOST", "Endpoint host resolves to a private/reserved address (DNS rebind).");
  }
  return ips;
}

/**
 * Fetch a URL safely: HTTPS-only + allowlist + form check (assertSafeOutboundUrl),
 * runtime DNS-rebind check (resolveAndAssertPublic), a hard timeout, no redirects,
 * and a response body cap. Throws UrlSafetyError for a safety rejection, or an
 * Error for a transport/timeout/oversize/redirect failure.
 */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}, deps: SafeFetchDeps = {}): Promise<SafeFetchResult> {
  const resolver = deps.resolver ?? defaultResolver;
  const fetcher = deps.fetcher ?? defaultFetcher;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const safe = assertSafeOutboundUrl(rawUrl, { allowlist: opts.allowlist });
  await resolveAndAssertPublic(safe.hostname, resolver);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(safe.href, { signal: controller.signal, headers: opts.headers ?? {} });
    // A redirect (3xx) is refused — never follow a Location to a possibly-internal host.
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`Refusing to follow a redirect (status ${res.status}).`);
    }
    const body = await res.text();
    if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
      throw new Error("Response body exceeds the maximum size.");
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
