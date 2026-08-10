/**
 * DEF-010 — the client session-expiry guard must intercept a submit on a
 * protected form when the idle session has already expired, BEFORE the browser's
 * native field validation, and bounce to /login?reason=expired instead of
 * posting half-typed data at a dead session (or silently redirecting).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { SessionExpiryGuard } from "@/components/layouts/SessionExpiryGuard";

function mockSessionEndpoint(expires: string) {
  return vi.fn(async () => ({
    json: async () => ({ expires }),
  })) as unknown as typeof fetch;
}

// Let the guard's async /api/auth/session read + ref-set microtasks settle.
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// jsdom's window.location.assign is non-configurable, so replace the whole
// location object with a minimal stub carrying the two members the guard reads.
let assign: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(() => {
  originalLocation = window.location;
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign, pathname: "/members/new", href: "http://localhost/members/new", origin: "http://localhost" },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SessionExpiryGuard", () => {
  it("intercepts a submit on an EXPIRED session and redirects to /login?reason=expired", async () => {
    vi.stubGlobal("fetch", mockSessionEndpoint(new Date(Date.now() - 60_000).toISOString()));
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    render(
      <SessionExpiryGuard>
        <form onSubmit={onSubmit}>
          {/* Left intentionally empty: if the guard fired only on `submit` it
              would never run, because native `required` validation would block
              an empty field first. Firing on capture-phase click proves it runs
              BEFORE native validation. */}
          <input name="firstName" required defaultValue="" />
          <button type="submit">Register Member</button>
        </form>
      </SessionExpiryGuard>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /register member/i }));

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toBe("/login?reason=expired&callbackUrl=%2Fmembers%2Fnew");
    // The form must NOT have been submitted at a dead session.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("lets a submit through when the session is still LIVE", async () => {
    vi.stubGlobal("fetch", mockSessionEndpoint(new Date(Date.now() + 20 * 60_000).toISOString()));
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    render(
      <SessionExpiryGuard>
        <form onSubmit={onSubmit}>
          <button type="submit">Register Member</button>
        </form>
      </SessionExpiryGuard>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /register member/i }));

    expect(assign).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("stays inert (server remains the authority) when the session endpoint is unreadable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch);
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    render(
      <SessionExpiryGuard>
        <form onSubmit={onSubmit}>
          <button type="submit">Register Member</button>
        </form>
      </SessionExpiryGuard>,
    );
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /register member/i }));

    // Unknown expiry ⇒ guard does not block; the server guard still fails closed.
    expect(assign).not.toHaveBeenCalled();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
