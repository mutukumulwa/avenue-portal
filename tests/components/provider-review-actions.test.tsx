/**
 * F7.6 — TPA ReviewActions component: server-computed availability (a control the
 * status/category doesn't allow is NEVER rendered — direct-action enforcement stays
 * in the service) + accessibility of the sensitive bank-verify form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(admin)/provider-changes/actions", () => ({
  startReviewAction: vi.fn(), requestInfoAction: vi.fn(), approveAction: vi.fn(), rejectAction: vi.fn(), verifyBankAction: vi.fn(), activateBankAction: vi.fn(),
}));

import { ReviewActions } from "@/app/(admin)/provider-changes/[id]/ReviewActions";

beforeEach(() => vi.clearAllMocks());

describe("F7.6 ReviewActions availability", () => {
  it("SUBMITTED: start review + request info + reject, but no approve/verify/activate", () => {
    render(<ReviewActions id="m1" version={1} status="SUBMITTED" isBank={false} verified={false} activated={false} />);
    expect(screen.getByRole("button", { name: "Start review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Record verification/)).not.toBeInTheDocument();
  });

  it("UNDER_REVIEW: approve appears, start review does not", () => {
    render(<ReviewActions id="m1" version={1} status="UNDER_REVIEW" isBank={false} verified={false} activated={false} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
  });

  it("PENDING_CHECKER: the approve button is labelled as the checker step", () => {
    render(<ReviewActions id="m1" version={1} status="PENDING_CHECKER" isBank verified={false} activated={false} />);
    expect(screen.getByRole("button", { name: "Approve (checker)" })).toBeInTheDocument();
  });

  it("BANK + APPROVED + unverified: the verify form shows with accessible inputs; activate is hidden", () => {
    render(<ReviewActions id="m1" version={1} status="APPROVED" isBank verified={false} activated={false} />);
    expect(screen.getByLabelText("Verification method")).toBeInTheDocument();
    expect(screen.getByLabelText("Verification reference")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record verification" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate bank change" })).not.toBeInTheDocument();
  });

  it("BANK + APPROVED + verified + not activated: activate shows, verify form is gone", () => {
    render(<ReviewActions id="m1" version={1} status="APPROVED" isBank verified activated={false} />);
    expect(screen.getByRole("button", { name: "Activate bank change" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification method")).not.toBeInTheDocument();
  });

  it("terminal (APPROVED, non-bank): no review controls at all", () => {
    render(<ReviewActions id="m1" version={1} status="APPROVED" isBank={false} verified={false} activated={false} />);
    expect(screen.queryByRole("button", { name: /Approve|Reject|Start review/ })).not.toBeInTheDocument();
  });
});
