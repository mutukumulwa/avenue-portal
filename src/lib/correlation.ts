/**
 * Opaque identifiers for tracing one user intent across client, server and logs.
 *
 * UAT-HF DEF-070: the run found a single generic failure screen with no reference
 * a user could quote and no way for support to find the matching server log — even
 * though server errors already carried Next.js digests. DEF-065 is worse: a dropped
 * response left the operator unable to tell whether the write had committed, with
 * nothing to look it up by.
 *
 * Two distinct ideas, deliberately separate:
 *
 *   correlationId — identifies ONE attempt. Always safe to show a user and to put
 *                   in a support ticket. Regenerated on every retry.
 *   operationId   — identifies ONE intended business effect, and is the key of the
 *                   durable receipt (P01.02). Stable across retries of the same
 *                   intent, which is what makes "did my write land?" answerable.
 *
 * Both are random and opaque. Neither ever encodes a member number, national ID,
 * phone, email or any other identifier — a reference a user may quote aloud or
 * paste into a ticket must not carry personal data (DEF-057, DEF-079).
 */

const CORRELATION_PREFIX = "cor";
const OPERATION_PREFIX = "op";

/**
 * `crypto.randomUUID` is available in Node 19+ and every browser this app
 * supports. The fallback exists only for exotic runtimes (and older Safari over
 * plain HTTP, where `crypto.randomUUID` is not exposed) so an id is never empty.
 */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Last resort. Not used in any supported runtime; still unique enough to trace.
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/** A new id for one attempt. Safe to display; regenerate on every retry. */
export function newCorrelationId(): string {
  return `${CORRELATION_PREFIX}_${randomId()}`;
}

/**
 * A new id for one intended business effect. Mint this ONCE per draft on the
 * client and reuse it for every retry, so the server can recognise the replay.
 */
export function newOperationId(): string {
  return `${OPERATION_PREFIX}_${randomId()}`;
}

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${CORRELATION_PREFIX}_`) && value.length > 8;
}

export function isOperationId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${OPERATION_PREFIX}_`) && value.length > 7;
}
