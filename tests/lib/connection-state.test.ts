/**
 * UAT-HF P04.03 acceptance — "airplane mode at login shows 'Internet required to
 * sign in'; cached protected data is clearly marked with as-of time and cannot
 * masquerade as a live session."
 *
 * DEF-003: the offline capture of the sign-in page was byte-identical to the
 * online one — the service worker served the cached /login as the offline
 * fallback.
 * DEF-066: nothing distinguished a live read from a cached one, or told the user
 * whether captured work had actually been sent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  OFFLINE_CAPABLE_SCOPES,
  SIGN_IN_REQUIRES_INTERNET,
  canAttemptSignIn,
  describeConnection,
  describeFreshness,
  isOfflineCapableRoute,
} from "@/lib/connection-state";

const CAPTURED = new Date("2026-08-11T11:05:00Z"); // 14:05 EAT

describe("P04.03 the connection state is always stated", () => {
  it("offline on a portal route says nothing can be submitted", () => {
    const d = describeConnection({ online: false, offlineCapable: true });
    expect(d.state).toBe("OFFLINE");
    expect(d.label).toBe("Offline");
    expect(d.blocksSubmission).toBe(true);
    expect(d.persistent).toBe(true);
    expect(d.detail).toMatch(/nothing can be submitted/i);
  });

  it("offline with queued work says it has NOT been submitted", () => {
    const d = describeConnection({ online: false, queuedCount: 3, offlineCapable: true });
    // The precise thing the run's users got wrong: captured ≠ submitted.
    expect(d.detail).toMatch(/3 items are waiting/);
    expect(d.detail).toMatch(/NOT been submitted/);
  });

  it("offline on an admin route promises no offline capability at all", () => {
    const d = describeConnection({ online: false, offlineCapable: false });
    // Admin holds no offline pack and no outbox, so it must not imply "we'll
    // send this later".
    expect(d.detail).not.toMatch(/waiting|downloaded|already on this device/i);
    expect(d.detail).toMatch(/Nothing on this screen can be saved or submitted/i);
  });

  it("back online with a non-empty queue is SYNCING, not ONLINE", () => {
    const d = describeConnection({ online: true, queuedCount: 2, offlineCapable: true });
    expect(d.state).toBe("SYNCING");
    expect(d.persistent).toBe(true);
    expect(d.blocksSubmission).toBe(false);
    expect(d.detail).toMatch(/not submitted yet/i);
  });

  it("online with an empty queue is quiet", () => {
    const d = describeConnection({ online: true, queuedCount: 0, offlineCapable: true });
    expect(d.state).toBe("ONLINE");
    expect(d.persistent).toBe(false);
  });

  it("uses singular wording for one queued item", () => {
    const d = describeConnection({ online: true, queuedCount: 1, offlineCapable: true });
    expect(d.label).toBe("Sending 1 item");
    expect(d.detail).toMatch(/1 item captured offline is/);
  });

  it("never reports a negative or fractional queue", () => {
    expect(describeConnection({ online: true, queuedCount: -5 }).state).toBe("ONLINE");
    expect(describeConnection({ online: true, queuedCount: 1.9, offlineCapable: true }).label).toBe("Sending 1 item");
  });
});

describe("P04.03 cached data cannot masquerade as live", () => {
  it("a cached read carries its as-of time and says it is not confirmed", () => {
    const f = describeFreshness({ online: false, capturedAt: CAPTURED });
    expect(f.trust).toBe("CACHED");
    expect(f.stale).toBe(true);
    // The acceptance requires the as-of time, in the operational zone.
    expect(f.label).toMatch(/11 Aug 2026/);
    expect(f.label).toMatch(/14:05/);
    expect(f.label).toMatch(/EAT/);
    expect(f.label).toMatch(/not confirmed/i);
  });

  it("there is no short form that omits the timestamp", () => {
    // Guards the acceptance directly: any cached label must be quotable back at
    // the desk, so it can never be the bare word "Cached".
    const f = describeFreshness({ online: false, capturedAt: CAPTURED });
    expect(f.label).not.toBe("Cached");
    expect(f.label.length).toBeGreaterThan("Cached".length);
  });

  it("a capture past its validity is EXPIRED, not merely cached", () => {
    const f = describeFreshness({
      online: false,
      capturedAt: CAPTURED,
      validUntil: new Date("2026-08-11T12:00:00Z"),
      now: new Date("2026-08-12T09:00:00Z"),
    });
    expect(f.trust).toBe("EXPIRED");
    expect(f.stale).toBe(true);
    expect(f.label).toMatch(/Reconnect to confirm/i);
  });

  it("a capture still inside its validity is CACHED", () => {
    const f = describeFreshness({
      online: false,
      capturedAt: CAPTURED,
      validUntil: new Date("2026-08-12T12:00:00Z"),
      now: new Date("2026-08-12T09:00:00Z"),
    });
    expect(f.trust).toBe("CACHED");
  });

  it("an unknown capture time is UNKNOWN — never quietly called cached", () => {
    const f = describeFreshness({ online: false });
    expect(f.trust).toBe("UNKNOWN");
    expect(f.stale).toBe(true);
    expect(f.label).toMatch(/unknown/i);
  });

  it("an unparseable capture time is UNKNOWN, not a broken label", () => {
    const f = describeFreshness({ online: false, capturedAt: "not a date" });
    expect(f.trust).toBe("UNKNOWN");
    expect(f.label).not.toMatch(/Invalid Date/);
  });

  it("a live read is only LIVE when there is no device copy in play", () => {
    expect(describeFreshness({ online: true }).trust).toBe("LIVE");
    // Online but rendering a stored copy is still a stored copy.
    const f = describeFreshness({ online: true, capturedAt: CAPTURED });
    expect(f.trust).toBe("CACHED");
    expect(f.stale).toBe(true);
  });
});

describe("P04.03 offline scopes", () => {
  it("covers the three portals and excludes admin", () => {
    expect(isOfflineCapableRoute("/member/claims")).toBe(true);
    expect(isOfflineCapableRoute("/provider/eligibility")).toBe(true);
    expect(isOfflineCapableRoute("/fund/balance")).toBe(true);
    expect(isOfflineCapableRoute("/members/new")).toBe(false);
    expect(isOfflineCapableRoute("/contracts")).toBe(false);
    expect(isOfflineCapableRoute("/login")).toBe(false);
  });

  it("matches the scopes the service worker and offline shell use", () => {
    // Three copies of this list exist (TS, sw.js, offline.html) because the
    // latter two cannot import. Drift between them is the bug this catches.
    const sw = readFileSync("public/sw.js", "utf8");
    const shell = readFileSync("public/offline.html", "utf8");
    for (const scope of OFFLINE_CAPABLE_SCOPES) {
      expect(sw, `sw.js is missing ${scope}`).toContain(`"${scope}"`);
      expect(shell, `offline.html is missing ${scope}`).toContain(`"${scope}"`);
    }
  });
});

describe("P04.03 sign-in is impossible offline and says so", () => {
  it("refuses the attempt while offline", () => {
    expect(canAttemptSignIn(false)).toBe(false);
    expect(canAttemptSignIn(true)).toBe(true);
  });

  it("the shell carries the acceptance's exact wording", () => {
    const shell = readFileSync("public/offline.html", "utf8");
    expect(shell).toContain(SIGN_IN_REQUIRES_INTERNET);
  });
});

describe("P04.03 the DEF-003 mechanism is gone from the service worker", () => {
  const sw = readFileSync("public/sw.js", "utf8");
  const code = sw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("never precaches the sign-in page", () => {
    // This single line is the whole defect: /login in SHELL_ASSETS is what made
    // the offline capture identical to the online one.
    expect(code).not.toContain('"/login"');
  });

  it("never serves a cached /login as a navigation fallback", () => {
    expect(code).not.toMatch(/caches\.match\(\s*["']\/login["']/);
  });

  it("falls back to the dedicated offline shell instead", () => {
    expect(code).toContain('OFFLINE_SHELL = "/offline.html"');
    expect(code).toMatch(/caches\.match\(OFFLINE_SHELL\)/);
    expect(code).toContain("OFFLINE_SHELL,"); // precached, so it exists offline
  });

  it("bumps the cache version so already-installed copies of /login are purged", () => {
    // activate deletes every cache not in the current version's list; without a
    // bump, medvex-shell-v2 keeps serving the old /login to existing devices.
    expect(code).toContain('const VERSION = "v3"');
  });

  it("still lets API and auth requests go straight to the network", () => {
    // Regression guard: the fix must not start intercepting live auth.
    expect(code).toContain('url.pathname.startsWith("/api/")');
    expect(code).toContain('url.pathname.includes("/auth/")');
  });
});

describe("P04.03 the offline shell stands on its own", () => {
  const shell = readFileSync("public/offline.html", "utf8");

  it("has no external CSS or JS, since neither may be cached", () => {
    expect(shell).not.toMatch(/<link[^>]+stylesheet/i);
    expect(shell).not.toMatch(/<script[^>]+src=/i);
  });

  it("offers no form to type credentials into", () => {
    // The failure was a user typing into a page that could not authenticate.
    expect(shell).not.toMatch(/<input/i);
    expect(shell).not.toMatch(/<form/i);
  });

  it("announces itself to assistive tech", () => {
    expect(shell).toContain('role="alert"');
  });

  it("under-promises when its script cannot run", () => {
    // The static markup — what a no-JS client sees — must not claim anything is
    // saved or queued.
    const body = shell.slice(shell.indexOf("<body"), shell.indexOf("<script"));
    expect(body).toMatch(/Nothing on this screen is saved/i);
    expect(body).not.toMatch(/still be readable|waiting to be sent/i);
  });
});
