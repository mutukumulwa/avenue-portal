/**
 * UAT-HF P06.05 acceptance — "missing group/file is blocked with named field
 * errors via keyboard and screen reader."
 *
 * DEF-069: "With a valid CSV attached (input.files.length = 1, 766 bytes) and
 * Target Group left at 'Select group…', clicking 'Parse & Validate' produced
 * nothing at all — no message, no highlight, no alert, no console output
 * visible to the user. The underlying state shows the browser was ready to
 * explain it ... The operator is left with a button that appears broken."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const parseImportAction = vi.hoisted(() => vi.fn());
const confirmImportAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/members/import/actions", () => ({ parseImportAction, confirmImportAction }));
const parseHRImportAction = vi.hoisted(() => vi.fn());
const confirmHRImportAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(hr)/hr/roster/import/actions", () => ({
  parseHRImportAction,
  confirmHRImportAction,
}));

import { MemberImportClient } from "@/app/(admin)/members/import/MemberImportClient";
import { HRMemberImportClient } from "@/app/(hr)/hr/roster/import/HRMemberImportClient";

const GROUPS = [{ id: "g1", name: "Staff" }];

beforeEach(() => vi.clearAllMocks());

/**
 * jsdom does not dispatch `submit` from a click on a submit button (form
 * submission is unimplemented there), so the event is fired on the form itself.
 * That is the same event the guard listens to.
 */
const submit = (container: HTMLElement) => {
  const form = container.querySelector("form");
  if (!form) throw new Error("no form rendered");
  fireEvent.submit(form);
};

describe("P06.05 DEF-069 — the button no longer appears broken", () => {
  it("explains what is missing instead of doing nothing", () => {
    const { container } = render(<MemberImportClient groups={GROUPS} />);
    submit(container);

    // The run got "nothing at all — no message, no highlight, no alert".
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Nothing was parsed/i);
    expect(alert).toHaveTextContent(/Target Group is required/i);
  });

  it("names every incomplete field, not just the first", () => {
    const { container } = render(<MemberImportClient groups={GROUPS} />);
    submit(container);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Target Group is required/i);
    expect(alert).toHaveTextContent(/CSV file is required/i);
  });

  it("marks the offending controls for assistive tech", () => {
    const { container } = render(<MemberImportClient groups={GROUPS} />);
    submit(container);
    expect(screen.getByLabelText(/Target Group/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("announces the summary assertively, so it is not missed", () => {
    const { container } = render(<MemberImportClient groups={GROUPS} />);
    submit(container);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("does not run the parse when the form is incomplete", () => {
    const { container } = render(<MemberImportClient groups={GROUPS} />);
    submit(container);
    expect(parseImportAction).not.toHaveBeenCalled();
  });

  it("says nothing before the first submit — no pre-emptive scolding", () => {
    render(<MemberImportClient groups={GROUPS} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("P06.05 the required file input is focusable", () => {
  it("is sr-only, not hidden", () => {
    // A required control with display:none cannot be focused, and the browser
    // then abandons validation for the WHOLE form without saying anything —
    // one of the two ways DEF-069's button could appear broken.
    render(<MemberImportClient groups={GROUPS} />);
    const file = screen.getByLabelText(/select a CSV file/i);
    expect(file).toHaveClass("sr-only");
    expect(file).not.toHaveClass("hidden");
  });

  it("has a real label association, not just a click target", () => {
    render(<MemberImportClient groups={GROUPS} />);
    // getByLabelText only resolves through a genuine label/for pairing.
    expect(screen.getByLabelText(/select a CSV file/i)).toHaveAttribute("type", "file");
  });

  it("shows the chosen file name back to the operator", () => {
    render(<MemberImportClient groups={GROUPS} />);
    const file = screen.getByLabelText(/select a CSV file/i) as HTMLInputElement;
    const csv = new File(["a,b\n1,2"], "roster.csv", { type: "text/csv" });
    fireEvent.change(file, { target: { files: [csv] } });
    expect(screen.getByText("roster.csv")).toBeInTheDocument();
  });

  it("the Target Group select is labelled", () => {
    render(<MemberImportClient groups={GROUPS} />);
    expect(screen.getByLabelText(/Target Group/i).tagName).toBe("SELECT");
  });
});

describe("P06.05 the HR import uses the same focusable file control", () => {
  it("has a real label and is visually hidden without display:none", () => {
    render(<HRMemberImportClient />);
    const file = screen.getByLabelText(/select a CSV file/i);
    expect(file).toHaveAttribute("type", "file");
    expect(file).toHaveClass("sr-only");
    expect(file).not.toHaveClass("hidden");
  });

  it("shows the chosen HR file name", () => {
    render(<HRMemberImportClient />);
    const file = screen.getByLabelText(/select a CSV file/i) as HTMLInputElement;
    fireEvent.change(file, {
      target: { files: [new File(["a,b\n1,2"], "hr-roster.csv", { type: "text/csv" })] },
    });
    expect(screen.getByText("hr-roster.csv")).toBeInTheDocument();
  });
});
