/**
 * Family Hospital UAT plan P04.04 / FH-09 — the eligibility form shows the
 * server's Kampala date instead of a blank box, keeps the date and benefit
 * after an input error or a failed request, uses the one benefit list with its
 * business labels, and hands off to a claim with only the check's id.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const action = vi.hoisted(() => ({ checkEligibilityAction: vi.fn() }));
vi.mock("@/app/provider/eligibility/actions", () => action);

import { EligibilityCheckForm } from "@/app/provider/eligibility/EligibilityCheckForm";
import { EMPTY_ELIGIBILITY_STATE } from "@/app/provider/eligibility/contract";

const ELIGIBLE = {
  found: true, resultCode: "ELIGIBLE", memberId: "mem-1",
  member: { firstName: "Julius", lastName: "Mugerwa", memberNumber: "MTC-2026-00001" },
  schemeName: "Provider Onboarding Trial Scheme", packageName: "Medvex Premier", requiresPreauth: false,
  safeExplanation: "", serviceDate: "2026-09-10", displayValidUntil: "", enforcementApplied: false, checkId: "chk_abc123def456",
  disclaimer: "This is a point-in-time eligibility check, not a guarantee of payment.",
  decision: { reasonCode: "ELIGIBLE", memberSafeExplanation: "Cover is active.", operatorGuidance: "Proceed." },
};

beforeEach(() => vi.resetAllMocks());

const date = () => screen.getByLabelText(/Service date/) as HTMLInputElement;
const check = () => fireEvent.click(screen.getByRole("button", { name: /Check/ }));

describe("EligibilityCheckForm", () => {
  it("shows the Kampala date the server computed — not a blank box", () => {
    render(<EligibilityCheckForm today="2026-09-11" />);
    expect(date().value).toBe("2026-09-11");
    expect(screen.getByText("Kampala date. Today is filled in.")).toBeInTheDocument();
  });

  it("offers the one benefit list, with business labels", () => {
    render(<EligibilityCheckForm today="2026-09-11" />);
    const benefit = screen.getByLabelText(/^Benefit/);
    expect(within(benefit).getByRole("option", { name: "Any" })).toBeInTheDocument();
    expect(within(benefit).getByRole("option", { name: "Emergency/Ambulance" })).toBeInTheDocument();
    expect(within(benefit).getByRole("option", { name: "Surgical" })).toBeInTheDocument();
    expect(within(benefit).queryByRole("option", { name: /Custom/i })).not.toBeInTheDocument();
  });

  it("keeps the entered date and benefit after an input error", async () => {
    action.checkEligibilityAction.mockResolvedValue({ ...EMPTY_ELIGIBILITY_STATE, inputError: "Enter the member or card number to check.", submitted: { serviceDate: "2026-09-01", benefit: "SURGICAL" } });
    render(<EligibilityCheckForm today="2026-09-11" />);
    fireEvent.change(date(), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText(/^Benefit/), { target: { value: "SURGICAL" } });
    check();
    await screen.findByText("Enter the member or card number to check.");
    await waitFor(() => expect(date().value).toBe("2026-09-01"));
    expect((screen.getByLabelText(/^Benefit/) as HTMLSelectElement).value).toBe("SURGICAL");
  });

  it("a request that never came back says 'could not check' and keeps the date", async () => {
    action.checkEligibilityAction.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<EligibilityCheckForm today="2026-09-11" />);
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
    fireEvent.change(date(), { target: { value: "2026-09-02" } });
    check();
    await screen.findByText(/We could not check cover just now/);
    await waitFor(() => expect(date().value).toBe("2026-09-02"));
  });

  it("hands off to a claim with the check's id only — no member number or id in the link", async () => {
    action.checkEligibilityAction.mockResolvedValue({ ...EMPTY_ELIGIBILITY_STATE, result: ELIGIBLE, submitted: { serviceDate: "2026-09-10", benefit: "" } });
    render(<EligibilityCheckForm today="2026-09-11" />);
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
    check();
    const link = await screen.findByRole("link", { name: /File a claim for this member/ });
    expect(link).toHaveAttribute("href", "/provider/claims/new?from=chk_abc123def456");
    expect(link.getAttribute("href")).not.toMatch(/MTC|mem-1|memberId/);
  });
});
