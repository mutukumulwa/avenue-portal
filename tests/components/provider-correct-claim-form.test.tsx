/**
 * F5.8 — provider correction form (CorrectClaimForm), on the Family Hospital UAT
 * plan P04.02 shared controls.
 *
 * Kept: seeded from the earlier claim; member and branch fixed (the member's
 * number is never even in the page, and nothing identifying is sent); submit
 * gated on an explicit confirmation and double-click safe; a stale error is
 * surfaced accessibly and refreshes. New: no CPT box or global price; a line not
 * linked to the price list is labelled "Historical / unlisted" and sent as
 * "unchanged line N" until the user changes it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

const capture = vi.hoisted(() => ({ resolveCaseContextAction: vi.fn(), searchDiagnosesAction: vi.fn(), searchServiceCatalogAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => capture);
const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/provider/claims/[id]/correct/actions", () => ({ correctProviderClaimAction: action }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CorrectClaimForm, type CorrectionSeed } from "@/app/provider/claims/[id]/correct/CorrectClaimForm";
import { mutationFail } from "@/lib/mutation-contract";
import type { CaseContextDTO } from "@/lib/provider-capture-contract";

const seed: CorrectionSeed = {
  member: { memberRef: "mem-1", branchId: "br-1", displayName: "Test Member" },
  branchName: "Main Branch",
  serviceType: "OUTPATIENT",
  benefitCategory: "OUTPATIENT",
  serviceDate: "2026-07-20",
  attendingDoctor: "Dr X",
  diagnosis: { code: "E11.9", description: "Type 2 diabetes mellitus, unspecified", category: "Endocrine, nutritional and metabolic diseases" },
  lines: [
    { key: "seed-1", serviceCategory: "CONSULTATION", selected: null, unlisted: false, historical: true, historicalLineNumber: 1, description: "Consultation visit", quantity: "1", billedUnitPrice: "1,000" },
  ],
  originalBilled: "1000",
  currency: "UGX",
};
const DTO: CaseContextDTO = {
  memberRef: "mem-1", displayName: "Test Member", maskedMemberNumber: "•••• 0001",
  eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." }, schemeName: null, packageName: null,
  branch: { id: "br-1", name: "Main Branch" }, contract: { id: "con", number: "PC-1", versionId: "ver" }, currency: "UGX",
  serviceDate: "2026-07-20", benefitCategory: "OUTPATIENT", catalogueEnabled: true,
  unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
};

function renderForm() {
  render(<CorrectClaimForm predecessorClaimId="pred-1" predecessorNumber="CLM-1" today="2026-09-11" seed={seed} />);
}

beforeEach(() => {
  vi.resetAllMocks();
  cleanup();
  action.mockResolvedValue(undefined);
  capture.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
});

describe("F5.8 CorrectClaimForm", () => {
  it("seeds from the earlier claim and fixes the member (no editable number) and branch", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
    expect(capture.resolveCaseContextAction).toHaveBeenCalledWith(expect.objectContaining({ purpose: "CLAIM_CORRECTION", memberRef: "mem-1", branchId: "br-1", serviceDate: "2026-07-20" }));
    expect(screen.queryByLabelText(/member \/ card number/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cannot move the claim to another member/)).toHaveTextContent("Main Branch");
    expect(screen.getByLabelText(/line 1 service description/i)).toHaveValue("Consultation visit");
    expect(screen.getByText("Historical / unlisted")).toBeInTheDocument();
    expect((screen.getByLabelText(/billed unit price/i) as HTMLInputElement).value).toBe("1,000");
    expect(screen.queryByLabelText(/CPT/)).not.toBeInTheDocument();
  });

  it("requires confirmation, submits once, sends no identifying details, and marks the unchanged historical line", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
    const submit = screen.getByRole("button", { name: /submit correction/i });
    expect(submit).toBeDisabled(); // unconfirmed
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    fireEvent.click(submit); // second click — pending lock makes this a no-op
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const arg = action.mock.calls[0][0];
    expect(arg.predecessorClaimId).toBe("pred-1");
    expect(arg).not.toHaveProperty("memberNumber");
    expect(arg).not.toHaveProperty("branchName");
    expect(JSON.stringify(arg)).not.toContain("Test Member");
    expect(arg.lines).toEqual([{ selectedProviderTariffId: null, serviceCategory: "CONSULTATION", description: "Consultation visit", quantity: "1", billedUnitPrice: "1000", historicalLineNumber: 1 }]);
  });

  it("a changed historical line is sent as an ordinary unlisted line", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/billed unit price/i), { target: { value: "1,500" } });
    expect(screen.queryByText("Historical / unlisted")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit correction/i }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0].lines[0]).not.toHaveProperty("historicalLineNumber");
    expect(action.mock.calls[0][0].lines[0]).toMatchObject({ description: "Consultation visit", billedUnitPrice: "1500" });
  });

  it("re-formatting the price on leaving the box is not a change", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
    fireEvent.blur(screen.getByLabelText(/billed unit price/i));
    expect(screen.getByText("Historical / unlisted")).toBeInTheDocument();
  });

  it("surfaces a stale/decided error accessibly and refreshes", async () => {
    action.mockResolvedValueOnce({ ...mutationFail("CONFLICT", { message: "The claim was decided or replaced before this correction could be filed." }), refresh: true });
    renderForm();
    await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit correction/i }));
    const alert = await screen.findByRole("alert", { name: "" });
    expect(alert).toHaveTextContent(/decided or replaced/i);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the corrected total against the original, decimal-safe", async () => {
    renderForm();
    await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/billed unit price/i), { target: { value: "1,000.10" } });
    expect(screen.getByText(/Corrected total UGX 1,000.10 · was UGX 1,000 · \+UGX 0.10/)).toBeInTheDocument();
    const lines = screen.getByRole("list", { name: "Service lines" });
    expect(within(lines).getAllByRole("listitem")).toHaveLength(1);
  });
});
