/**
 * UAT-HF P04.03 — the persistent connection surface (DEF-003, DEF-066).
 *
 * The module tests cover the wording; these cover that it actually reaches the
 * screen, on every route, and stays quiet when there is nothing to say.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ current: "/provider/eligibility" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const pending = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/lib/offline/outbox", () => ({ Outbox: { pending } }));

import { ConnectionStatus } from "@/components/ConnectionStatus";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.mockResolvedValue([]);
  pathname.current = "/provider/eligibility";
  setOnline(true);
});

afterEach(() => setOnline(true));

describe("P04.03 the banner appears exactly when it should", () => {
  it("is silent when online with nothing queued", async () => {
    render(<ConnectionStatus />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "ONLINE");
    });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows an offline banner in airplane mode", async () => {
    setOnline(false);
    render(<ConnectionStatus />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "OFFLINE");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Offline/);
    expect(screen.getByRole("status")).toHaveTextContent(/nothing can be submitted/i);
  });

  it("reacts to the browser going offline while the page is open", async () => {
    render(<ConnectionStatus />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "ONLINE"));

    setOnline(false);
    window.dispatchEvent(new Event("offline"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "OFFLINE");
    });
  });

  it("says queued work is not yet submitted once back online", async () => {
    pending.mockResolvedValue([{ opKey: "a" }, { opKey: "b" }]);
    render(<ConnectionStatus />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "SYNCING");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/not submitted yet/i);
  });

  it("never reads an outbox on an admin route", async () => {
    pathname.current = "/members/new";
    setOnline(false);
    render(<ConnectionStatus />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "OFFLINE");
    });
    // Admin queues nothing, so it must neither open the queue nor imply one.
    expect(pending).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).not.toHaveTextContent(/waiting/i);
  });

  it("still reports the connection when the queue cannot be read at all", async () => {
    // An unreadable outbox leaves the count at its last known value (0 here) and
    // must not take the offline warning down with it — the connection state is
    // the part the user cannot do without.
    pending.mockRejectedValue(new Error("IndexedDB unavailable"));
    setOnline(false);
    render(<ConnectionStatus />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("data-connection-state", "OFFLINE");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Offline/);
  });

  it("keeps a stable live region so the change is announced", async () => {
    render(<ConnectionStatus />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");

    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(region).toHaveTextContent(/Offline/));
    // Same node throughout — a region that unmounts is not announced.
    expect(screen.getByRole("status")).toBe(region);
  });
});
