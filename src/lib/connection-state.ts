/**
 * UAT-HF P04.03 — connection and freshness state, as data.
 *
 * DEF-003: in airplane mode the product served a cached Sign In page that the
 * run recorded as byte-identical to the online one.
 * DEF-066: nothing on screen distinguished a live read from a cached one, or
 * told the user whether work they had submitted had actually been sent.
 *
 * Both are the same underlying failure: the product knew its connection state
 * and did not say. This module is the single place that turns
 * (online?, queued work, when data was captured) into words, so every surface
 * says the same thing and the wording can be tested without a browser.
 *
 * The rule the whole module obeys: **never overstate.** When something is
 * unknown it is reported as unknown, and a read whose age we cannot establish
 * is never called live.
 */

import { formatInstant } from "@/lib/calendar-date";

/** How the device is currently connected. */
export type ConnectionState =
  /** The network is reachable and reads are live. */
  | "ONLINE"
  /** The network is unreachable. Nothing can be submitted. */
  | "OFFLINE"
  /** Back online with work still waiting to be sent. */
  | "SYNCING";

/** How much a displayed value can be trusted. */
export type ReadTrust =
  /** Fetched from the server just now. */
  | "LIVE"
  /** Read from this device's copy. Correct as at `capturedAt`, not now. */
  | "CACHED"
  /** Read from this device's copy, past the point it was good for. */
  | "EXPIRED"
  /** We cannot establish when this was captured, so we cannot vouch for it. */
  | "UNKNOWN";

export interface ConnectionDescription {
  state: ConnectionState;
  /** Short persistent label, e.g. "Offline". */
  label: string;
  /** The consequence, in the user's terms. Always names what they can rely on. */
  detail: string;
  /** True when a submit cannot reach the server right now. */
  blocksSubmission: boolean;
  /** True when the surface should be visible at all (online + nothing queued ⇒ quiet). */
  persistent: boolean;
  /** Severity, for styling. */
  tone: "neutral" | "warning" | "info";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Describe the connection for a persistent status surface.
 *
 * `queuedCount` is the number of operations sitting in the device outbox that
 * have NOT been accepted by the server. It is deliberately separate from
 * `online`: being back online does not mean the queue has drained, and the run
 * showed users assuming exactly that.
 */
export function describeConnection(input: {
  online: boolean;
  queuedCount?: number;
  /** Whether this route can hold downloaded data / queue work at all. */
  offlineCapable?: boolean;
}): ConnectionDescription {
  const queued = Math.max(0, Math.trunc(input.queuedCount ?? 0));
  const offlineCapable = input.offlineCapable ?? false;

  if (!input.online) {
    return {
      state: "OFFLINE",
      label: "Offline",
      detail: offlineCapable
        ? queued > 0
          ? `Not connected. ${queued} ${plural(queued, "item is", "items are")} waiting on this device and ${plural(queued, "has", "have")} NOT been submitted.`
          : "Not connected. You can read what is already on this device; nothing can be submitted."
        : "Not connected. Nothing on this screen can be saved or submitted until you reconnect.",
      blocksSubmission: true,
      persistent: true,
      tone: "warning",
    };
  }

  if (queued > 0) {
    return {
      state: "SYNCING",
      label: `Sending ${queued} ${plural(queued, "item", "items")}`,
      detail: `Connected. ${queued} ${plural(queued, "item captured offline is", "items captured offline are")} still being sent — ${plural(queued, "it is", "they are")} not submitted yet.`,
      blocksSubmission: false,
      persistent: true,
      tone: "info",
    };
  }

  return {
    state: "ONLINE",
    label: "Online",
    detail: "Connected. Everything on this screen is live.",
    blocksSubmission: false,
    persistent: false,
    tone: "neutral",
  };
}

export interface FreshnessDescription {
  trust: ReadTrust;
  /** e.g. "Cached — as at 11 Aug 2026, 14:05 EAT". Safe to render verbatim. */
  label: string;
  /** True when the caller must not present this as the current position. */
  stale: boolean;
}

/**
 * Describe how fresh a displayed value is.
 *
 * The acceptance requires that "cached protected data is clearly marked with as-of
 * time and cannot masquerade as a live session", so a cached read ALWAYS carries
 * its timestamp — there is no short form that omits it.
 */
export function describeFreshness(input: {
  online: boolean;
  /** When this device captured the value. Absent ⇒ we cannot vouch for it. */
  capturedAt?: Date | string | null;
  /** The point past which the capture must not be relied on, if it has one. */
  validUntil?: Date | string | null;
  now?: Date;
}): FreshnessDescription {
  const now = input.now ?? new Date();
  const capturedAt = toDate(input.capturedAt);

  // A live read needs no timestamp: it is being fetched as it is shown.
  if (input.online && !capturedAt) {
    return { trust: "LIVE", label: "Live", stale: false };
  }

  if (!capturedAt) {
    // Offline with no capture time. We genuinely do not know how old this is,
    // and saying "cached" would imply we did.
    return {
      trust: "UNKNOWN",
      label: "Age unknown — not verified against the server",
      stale: true,
    };
  }

  const asAt = formatInstant(capturedAt);
  const validUntil = toDate(input.validUntil);

  if (validUntil && now.getTime() > validUntil.getTime()) {
    return {
      trust: "EXPIRED",
      label: `Expired copy — as at ${asAt}. Reconnect to confirm.`,
      stale: true,
    };
  }

  return {
    trust: "CACHED",
    label: `Cached copy — as at ${asAt}, not confirmed since.`,
    stale: true,
  };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Routes that hold downloaded data and can queue work offline.
 *
 * Must match OFFLINE_SCOPES in `public/sw.js` and in `public/offline.html`.
 * Admin is absent on purpose: it has no offline pack and no outbox, so it must
 * never show a banner implying work will be sent later.
 */
export const OFFLINE_CAPABLE_SCOPES = ["/member/", "/provider/", "/fund/"] as const;

export function isOfflineCapableRoute(pathname: string): boolean {
  return OFFLINE_CAPABLE_SCOPES.some((scope) => pathname.startsWith(scope));
}

/**
 * Whether a sign-in attempt can possibly succeed right now.
 *
 * DEF-003's acceptance in one function: offline, the answer is no, and the
 * caller must say so instead of rendering a form.
 */
export function canAttemptSignIn(online: boolean): boolean {
  return online;
}

/** The exact wording the acceptance names for the offline sign-in case. */
export const SIGN_IN_REQUIRES_INTERNET = "Internet required to sign in";
