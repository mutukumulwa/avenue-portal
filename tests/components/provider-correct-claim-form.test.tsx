/**
 * F5.8 — provider correction form (CorrectClaimForm).
 *
 * Pre-fills from the predecessor; member + branch are read-only (a correction can never
 * re-identify the claim — they are never even sent); submit is gated on an explicit
 * confirmation and is double-click safe; an error is surfaced accessibly. The server
 * action is mocked (its authorization is covered by the action + service tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/provider/claims/[id]/correct/actions", () => ({ correctProviderClaimAction: action }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CorrectClaimForm, type CorrectionPrefill } from "@/app/provider/claims/[id]/correct/CorrectClaimForm";

const prefill: CorrectionPrefill = {
  memberNumber: "ALP-001",
  memberName: "Test Member",
  branchName: "Main Branch",
  serviceType: "OUTPATIENT",
  benefitCategory: "OUTPATIENT",
  dateOfService: "2026-07-20",
  attendingDoctor: "Dr X",
  primaryDiagnosisCode: "E11.9",
  originalBilled: 1000,
  currency: "UGX",
  lines: [{ serviceCategory: "CONSULTATION", description: "Consultation visit", cptCode: "99213", quantity: 1, unitCost: 1000 }],
};
const icd = [{ code: "E11.9", description: "Type 2 diabetes" }];
const cpt = [{ code: "99213", description: "Office visit", averageCost: 1000, category: "CONSULTATION" }];

function renderForm() {
  render(<CorrectClaimForm predecessorClaimId="pred-1" predecessorNumber="CLM-1" prefill={prefill} icdOptions={icd} cptOptions={cpt} />);
}

beforeEach(() => { vi.clearAllMocks(); cleanup(); action.mockResolvedValue(undefined); });

describe("F5.8 CorrectClaimForm", () => {
  it("prefills from the predecessor and locks member + branch (cannot be altered)", () => {
    renderForm();
    const member = screen.getByLabelText(/member \/ card number/i);
    expect(member).toHaveValue("ALP-001");
    expect(member).toBeDisabled();
    const branch = screen.getByLabelText(/^branch/i);
    expect(branch).toHaveValue("Main Branch");
    expect(branch).toBeDisabled();
    expect(screen.getByLabelText(/line 1 description/i)).toHaveValue("Consultation visit");
    expect(screen.getByLabelText(/line 1 unit cost/i)).toHaveValue(1000);
  });

  it("requires confirmation before submit, then submits once (double-click safe) with no identity fields", async () => {
    renderForm();
    const submit = screen.getByRole("button", { name: /submit correction/i });
    expect(submit).toBeDisabled(); // unconfirmed
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    fireEvent.click(submit); // second click — the transition/disable makes this a no-op
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const arg = action.mock.calls[0][0];
    expect(arg.predecessorClaimId).toBe("pred-1");
    expect(arg).not.toHaveProperty("memberNumber");
    expect(arg).not.toHaveProperty("branchName");
    expect(arg.lineItems.length).toBe(1);
  });

  it("surfaces a stale/decided error accessibly and refreshes", async () => {
    action.mockResolvedValueOnce({ error: "The claim was decided or replaced before this correction could be filed.", refresh: true });
    renderForm();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit correction/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/decided or replaced/i);
    expect(refresh).toHaveBeenCalled();
  });
});
