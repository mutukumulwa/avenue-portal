/**
 * Family Hospital UAT plan P03.01 / FH-04 / §8.2 — the provider member field.
 * Typing a number and choosing "Find member" shows the member's name; every
 * state is text, not colour; a change of date or benefit invalidates the case;
 * a superseded response is ignored; the number never goes into the URL.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const actions = vi.hoisted(() => ({ resolveCaseContextAction: vi.fn(), searchDiagnosesAction: vi.fn(), searchServiceCatalogAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => actions);

import { ProviderMemberField } from "@/components/provider/ProviderMemberField";
import type { CaseContextDTO } from "@/lib/provider-capture-contract";

const DTO: CaseContextDTO = {
  memberRef: "mem-1",
  displayName: "Julius Mugerwa",
  maskedMemberNumber: "•••• 0001",
  eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." },
  schemeName: "Provider Onboarding Trial Scheme",
  packageName: "Medvex Premier",
  branch: { id: "br-main", name: "Main" },
  contract: { id: "con-1", number: "PC-2026-202", versionId: "ver-1" },
  currency: "UGX",
  serviceDate: "2026-09-11",
  benefitCategory: "OUTPATIENT",
  catalogueEnabled: true,
  unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
};

function setup(props: Partial<React.ComponentProps<typeof ProviderMemberField>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <ProviderMemberField purpose="CLAIM" serviceDate="2026-09-11" benefitCategory="OUTPATIENT" onChange={onChange} memberNumberExample="ABC-2026-00001" {...props} />,
  );
  return { onChange, ...utils };
}

beforeEach(() => vi.clearAllMocks());

describe("ProviderMemberField", () => {
  it("resolves a typed number on 'Find member' and shows the name, masked number and cover", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    expect(screen.getByText("•••• 0001")).toBeInTheDocument();
    expect(screen.getByText("Covered on this date")).toBeInTheDocument();
    expect(actions.resolveCaseContextAction).toHaveBeenCalledWith(expect.objectContaining({ purpose: "CLAIM", memberNumber: "MTC-2026-00001", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" }));
    expect(onChange).toHaveBeenLastCalledWith({ context: DTO, outcome: "RESOLVED" });
    // The member number is never put into the address bar.
    expect(window.location.href).not.toContain("MTC-2026-00001");
  });

  it("one lookup is exactly one call — a successful result does not trigger another", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
    setup();
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(actions.resolveCaseContextAction).toHaveBeenCalledTimes(1);
  });

  it("resolves on leaving the box once a plausible number is typed", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
    setup();
    const input = screen.getByLabelText(/Member \/ card number/);
    fireEvent.change(input, { target: { value: "MTC-2026-00001" } });
    fireEvent.blur(input);
    await waitFor(() => expect(actions.resolveCaseContextAction).toHaveBeenCalledTimes(1));
  });

  it("shows an ineligible member as such — in words, not only colour", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({
      outcome: "INELIGIBLE",
      context: { ...DTO, eligibility: { eligible: false, reasonCode: "LAPSED", message: "Cover lapsed before this date." } },
      message: "Cover lapsed before this date.",
      correlationId: "c",
    });
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00005" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Not eligible on this date")).toBeInTheDocument());
    expect(screen.getByText("Cover lapsed before this date.")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "INELIGIBLE" }));
  });

  it("a not-found result is announced and takes focus after an explicit lookup", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "NOT_FOUND", message: "No member found for that number. Check the card and try again.", fieldErrors: { memberNumber: "No member found." }, correlationId: "c" });
    setup();
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-99999" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("No member found.")).toBeInTheDocument());
    expect(document.activeElement?.textContent).toContain("No member found.");
    expect(screen.getByLabelText(/Member \/ card number/)).toHaveAttribute("aria-invalid", "true");
  });

  it("a change of service date makes the resolved case stale", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
    const { onChange, rerender } = setup();
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    rerender(<ProviderMemberField purpose="CLAIM" serviceDate="2026-09-10" benefitCategory="OUTPATIENT" onChange={onChange} memberNumberExample="ABC-2026-00001" />);
    expect(screen.queryByText("Julius Mugerwa")).not.toBeInTheDocument();
    expect(screen.getByText(/changed\. Find the member again/)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ context: null, outcome: null });
  });

  it("editing the number discards the previous member at once", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
    const { onChange } = setup();
    const input = screen.getByLabelText(/Member \/ card number/);
    fireEvent.change(input, { target: { value: "MTC-2026-00001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    fireEvent.change(input, { target: { value: "MTC-2026-0000" } });
    expect(screen.queryByText("Julius Mugerwa")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ context: null, outcome: null });
  });

  it("ignores a slow response for an older number", async () => {
    let releaseOld!: (v: unknown) => void;
    actions.resolveCaseContextAction
      .mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }))
      .mockResolvedValueOnce({ outcome: "RESOLVED", context: { ...DTO, displayName: "Sylvia Nakato", memberRef: "mem-5" }, correlationId: "c" });
    setup();
    const input = screen.getByLabelText(/Member \/ card number/);
    fireEvent.change(input, { target: { value: "MTC-2026-00001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    fireEvent.change(input, { target: { value: "MTC-2026-00005" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Sylvia Nakato")).toBeInTheDocument());
    await act(async () => releaseOld({ outcome: "RESOLVED", context: DTO, correlationId: "c" }));
    expect(screen.queryByText("Julius Mugerwa")).not.toBeInTheDocument();
    expect(screen.getByText("Sylvia Nakato")).toBeInTheDocument();
  });

  it("resolves an eligibility hand-off reference on mount without any number in the page", async () => {
    actions.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
    setup({ handoff: { memberRef: "mem-1", branchId: "br-main" } });
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    expect(actions.resolveCaseContextAction).toHaveBeenCalledWith(expect.objectContaining({ memberRef: "mem-1", memberNumber: undefined, branchId: "br-main" }));
  });

  it("asks for a branch when the user has several, then resolves with the chosen one", async () => {
    actions.resolveCaseContextAction
      .mockResolvedValueOnce({ outcome: "BRANCH_REQUIRED", message: "Choose the branch where the patient is being seen.", branches: [{ id: "br-a", name: "A" }, { id: "br-b", name: "B" }], correlationId: "c" })
      .mockResolvedValueOnce({ outcome: "RESOLVED", context: { ...DTO, branch: { id: "br-b", name: "B" } }, correlationId: "c" });
    setup();
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    const branch = await screen.findByLabelText(/Branch where the patient is seen/);
    fireEvent.change(branch, { target: { value: "br-b" } });
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    expect(actions.resolveCaseContextAction).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: "br-b" }));
  });
});
