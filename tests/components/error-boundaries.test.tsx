/**
 * UAT-HF P01.04 acceptance — "injected render, loader, and action-transport errors
 * never expose framework copy or blank the entire application; support can find the
 * log by correlation ID."
 *
 * DEF-050 was the S1 that took the whole Provider Contracts module down for every
 * user with no UI recovery path. DEF-070 was that one generic screen served every
 * cause with no reference on the client path, even though server errors carried
 * digests. These tests pin both.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ErrorRecovery } from "@/components/errors/ErrorRecovery";
import AppError from "@/app/error";
import AdminError from "@/app/(admin)/error";
import ContractsError from "@/app/(admin)/contracts/error";
import GlobalError from "@/app/global-error";

/** A server error as Next.js forwards it in production: generic message + digest. */
const serverError = () =>
  Object.assign(new Error("An error occurred in the Server Components render."), { digest: "3293912966" });

/** A CLIENT error: `message` here is the REAL exception text and must never render. */
const clientError = () => {
  const err = new Error("RangeError: Invalid time value at formatContractDate (member NWSC-2026-00001)");
  err.stack = "Error: RangeError\n    at ContractList (/app/contracts/page.tsx:42:11)";
  return err as Error & { digest?: string };
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("P01.04 error boundaries", () => {
  it("shows a task-shaped explanation, not framework copy", () => {
    render(<ErrorRecovery error={serverError()} reset={() => {}} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/nothing you were doing has been saved or changed/i)).toBeTruthy();
    // No framework internals.
    expect(document.body.textContent).not.toMatch(/Server Components render/i);
    expect(document.body.textContent).not.toMatch(/webpack|hydration|digest:/i);
  });

  it("NEVER renders the raw message or stack of a client error", () => {
    render(<ErrorRecovery error={clientError()} reset={() => {}} />);
    const text = document.body.textContent ?? "";
    // The real exception text can carry PII — here, a member number.
    expect(text).not.toContain("NWSC-2026-00001");
    expect(text).not.toContain("Invalid time value");
    expect(text).not.toContain("formatContractDate");
    expect(text).not.toContain("page.tsx");
  });

  it("shows the digest as the quotable reference (DEF-070)", () => {
    render(<ErrorRecovery error={serverError()} reset={() => {}} />);
    expect(screen.getByText("3293912966")).toBeTruthy();
    expect(screen.getByText(/quote this to support/i)).toBeTruthy();
  });

  it("still tells the user what to do when there is no digest", () => {
    render(<ErrorRecovery error={clientError()} reset={() => {}} />);
    expect(screen.getByText(/if this keeps happening, tell support/i)).toBeTruthy();
  });

  it("offers a retry that re-renders the segment", () => {
    const reset = vi.fn();
    render(<ErrorRecovery error={serverError()} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("always offers a way OUT, which is what DEF-050 lacked", () => {
    // The contracts module was reachable only through two crashing routes, so
    // "try again" alone would have left the operator stuck.
    render(<ErrorRecovery error={serverError()} area="provider contracts" homeHref="/dashboard" homeLabel="Back to dashboard" />);
    const exit = screen.getByRole("link", { name: /back to dashboard/i });
    expect(exit.getAttribute("href")).toBe("/dashboard");
  });

  it("names the area so the user knows what is broken and what is not", () => {
    render(<ErrorRecovery error={serverError()} area="provider contracts" />);
    expect(screen.getByText(/something went wrong loading provider contracts/i)).toBeTruthy();
  });

  it("reports the boundary event with the digest for support to find the log", () => {
    const spy = vi.spyOn(console, "error");
    render(<ErrorRecovery error={serverError()} area="provider contracts" />);
    expect(spy).toHaveBeenCalledWith(
      "[error-boundary]",
      expect.objectContaining({ area: "provider contracts", digest: "3293912966" }),
    );
  });

  it("omits the retry control when recovery is not offered", () => {
    render(<ErrorRecovery error={serverError()} />);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});

describe("P01.04 boundary files are wired to the right recovery", () => {
  it("the app boundary renders and can retry", () => {
    const reset = vi.fn();
    render(<AppError error={serverError()} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("the admin boundary exits to the dashboard, keeping the operator inside the product", () => {
    render(<AdminError error={serverError()} reset={() => {}} />);
    expect(screen.getByRole("link", { name: /back to dashboard/i }).getAttribute("href")).toBe("/dashboard");
  });

  it("the contracts boundary names the module (DEF-050 containment)", () => {
    render(<ContractsError error={serverError()} reset={() => {}} />);
    expect(screen.getByText(/something went wrong loading provider contracts/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toBeTruthy();
  });

  it("the global boundary stands alone — no next/link, no app stylesheet", () => {
    // It replaces the root layout, so the router and CSS may be exactly what
    // failed. A plain anchor and inline styles are deliberate.
    const { container } = render(<GlobalError error={serverError()} reset={() => {}} />);
    expect(screen.getByText(/medvex could not start/i)).toBeTruthy();
    const reload = screen.getByRole("link", { name: /reload medvex/i });
    expect(reload.getAttribute("href")).toBe("/");
    expect(container.querySelector("main")?.getAttribute("role")).toBe("alert");
    expect(screen.getByText("3293912966")).toBeTruthy();
  });
});
