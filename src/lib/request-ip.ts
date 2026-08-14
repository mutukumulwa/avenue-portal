/**
 * UAT-HF P10.07 — the client IP, and whether it can be trusted as a control.
 *
 * `x-forwarded-for` is a request header. Anyone can set it. Whether its value
 * means anything depends entirely on what sits in front of the application, and
 * that is a deployment fact the code cannot infer — so it is stated here rather
 * than assumed.
 *
 * ## Why this is separate from the IP the audit log records
 *
 * `lib/audit.ts` and `audit-chain.service.ts` read the same header and store it,
 * and they are right to keep doing so without this check. An audit row is a
 * *record* — "the request claimed to come from here" is useful even when the
 * claim is unverified. A rate limit is a *control*, and a control keyed on a
 * value the attacker chooses is not a control:
 *
 *   - they rotate the header and the limit never applies to them;
 *   - worse, they put a **victim's** IP in it and have that address blocked.
 *
 * The second is why an untrusted header must not be used here even "as a best
 * effort". It converts a brute-force defence into a denial-of-service tool
 * aimed at whoever the attacker names.
 *
 * ## When it is trusted
 *
 * On Vercel. Their documented behaviour: *"Vercel overwrites this header and
 * does not forward external IPs to prevent spoofing"* — so the value that
 * reaches the function is the platform's, not the caller's. (Enterprise
 * accounts can enable a trusted proxy, which turns that guarantee off. This is
 * not an Enterprise account; if that ever changes, this file is the place that
 * has to know.)
 *
 * Anywhere else — a self-hosted deployment, the in-country Kampala option, a
 * container behind an unknown ingress — the header is whatever the caller sent,
 * unless an operator asserts otherwise by setting `TRUST_PROXY_IP_HEADER=true`.
 * That assertion is a promise that a proxy overwrites the header; making it
 * falsely is how the DoS above gets built.
 */

/** Reason an IP could not be used as a rate-limit key. */
export type UntrustedReason = "NO_PROXY_TRUST" | "NO_HEADER";

export type ClientIp =
  | { trusted: true; ip: string }
  | { trusted: false; reason: UntrustedReason };

/**
 * Whether the platform guarantees the forwarded-for header.
 *
 * `VERCEL` is set by the platform on every deployment and cannot be set by a
 * request, so it is a safe signal. The env override exists for deployments that
 * are behind a proxy the operator controls.
 */
export function proxyHeaderIsTrusted(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TRUST_PROXY_IP_HEADER === "true") return true;
  if (env.TRUST_PROXY_IP_HEADER === "false") return false; // explicit opt-out wins
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
}

/**
 * Read the client IP from request headers, but only where it means something.
 *
 * Takes anything with a `get` — `Headers`, or the object `next/headers` returns
 * — so this works in a route handler, a server action, and NextAuth's
 * `authorize(credentials, request)`.
 */
export function clientIpFrom(
  headers: { get(name: string): string | null } | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ClientIp {
  if (!proxyHeaderIsTrusted(env)) return { trusted: false, reason: "NO_PROXY_TRUST" };
  if (!headers) return { trusted: false, reason: "NO_HEADER" };

  // Vercel overwrites the header with a single value. The first element is the
  // right one to take on any correctly-configured proxy: appended entries are
  // added by hops CLOSER to the app, so the leftmost is the original client.
  // (On a proxy that APPENDS rather than overwrites, the leftmost is
  // caller-controlled — which is exactly the case this function refuses to be
  // used in without an explicit operator assertion.)
  const raw = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip");
  const ip = raw?.trim();
  if (!ip) return { trusted: false, reason: "NO_HEADER" };

  // Normalise the IPv4-mapped IPv6 form so the same client is one key, not two.
  const normalised = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (!isPlausibleIp(normalised)) return { trusted: false, reason: "NO_HEADER" };

  return { trusted: true, ip: normalised };
}

/**
 * A shape check, not a validation.
 *
 * The value becomes a database key, so an unbounded string would let a caller
 * (on a deployment where the header is trusted but the proxy misbehaves) write
 * arbitrary long rows. Rejecting anything that is not IP-shaped bounds that
 * without pretending to parse addresses properly.
 */
export function isPlausibleIp(value: string): boolean {
  if (value.length === 0 || value.length > 45) return false; // 45 = longest IPv6 text form
  return /^[0-9a-fA-F.:]+$/.test(value) && /[.:]/.test(value);
}
