/**
 * Family Hospital UAT plan P05.02 step 2 — the approved public origin of the
 * application, from deployment configuration only.
 *
 * A link that goes into an email must never be built from the incoming
 * request's Host header: that header is attacker-controllable, and a forged host
 * would mail a real setup token to somebody else's server. The origin comes from
 * NEXT_PUBLIC_APP_URL (or NEXTAUTH_URL, the other configured origin this code
 * base already trusts), must be https — plain http only for localhost outside
 * production — and is null when absent or malformed, which callers treat as a
 * configuration failure rather than guessing.
 */
export function approvedPublicOrigin(): string | null {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && local && process.env.NODE_ENV !== "production") return url.origin;
  return null;
}
