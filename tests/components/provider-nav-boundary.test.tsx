/**
 * Family Hospital UAT plan P06 / §9 — if the provider bar fails to render, the
 * page keeps the brand, Dashboard and Logout, and the failure is reported once
 * as a structured server event (digest only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next-auth/react", () => auth);
const actions = vi.hoisted(() => ({ reportNavigationRenderErrorAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => actions);

import { ProviderNavBoundary } from "@/components/layouts/ProviderNavBoundary";

function Broken(): never {
  throw new Error("bar exploded");
}

beforeEach(() => {
  vi.resetAllMocks();
  actions.reportNavigationRenderErrorAction.mockResolvedValue(undefined);
  // React and the boundary both log the caught error; keep the run quiet.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ProviderNavBoundary", () => {
  it("renders the bar untouched when it works", () => {
    render(<ProviderNavBoundary><nav aria-label="Provider">the real bar</nav></ProviderNavBoundary>);
    expect(screen.getByText("the real bar")).toBeInTheDocument();
    expect(actions.reportNavigationRenderErrorAction).not.toHaveBeenCalled();
  });

  it("keeps a way home and out when the bar throws, and reports it once with no message text", () => {
    render(<ProviderNavBoundary><Broken /></ProviderNavBoundary>);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/provider/dashboard", "/provider/dashboard"]);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    expect(actions.reportNavigationRenderErrorAction).toHaveBeenCalledTimes(1);
    expect(actions.reportNavigationRenderErrorAction).toHaveBeenCalledWith({ digest: null });
  });
});
