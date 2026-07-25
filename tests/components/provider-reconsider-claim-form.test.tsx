/**
 * F5.13 — provider reconsideration form. Shows the frozen original amounts + safe reasons
 * per line (accessible table), computes the requested delta EXACTLY, and gates submit on a
 * line + positive delta + reason + narrative + declaration. Stale gate ⇒ error + refresh.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/provider/claims/[id]/reconsider/actions", () => ({ reconsiderProviderClaimAction: action }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ReconsiderClaimForm, type ReconsiderLineView } from "@/app/provider/claims/[id]/reconsider/ReconsiderClaimForm";

const lines: ReconsiderLineView[] = [
  { id: "l1", description: "Consultation", cptCode: "99213", billed: 1000, allowed: 600, payable: 600, disallowed: 400, safeReason: "Paid to contract rate" },
  { id: "l2", description: "Lab test", cptCode: "80050", billed: 500, allowed: 500, payable: 500, disallowed: 0, safeReason: null },
];
const reasons = [{ code: "UNDERPAID_RATE", label: "Paid below the agreed rate", providerDescription: "The allowed amount is below the contracted rate." }];

function renderForm() {
  render(<ReconsiderClaimForm claimId="c1" claimNumber="CLM-1" currency="UGX" filingDeadline="2026-08-30T23:59:59.999Z" lines={lines} reasons={reasons} />);
}
function fillValid() {
  fireEvent.click(screen.getByLabelText(/dispute consultation/i));
  fireEvent.change(screen.getByLabelText(/requested allowed for consultation/i), { target: { value: "900" } });
  fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: "UNDERPAID_RATE" } });
  fireEvent.change(screen.getByLabelText(/^narrative/i), { target: { value: "The contracted rate is 900." } });
  fireEvent.click(screen.getByRole("checkbox", { name: /i declare/i }));
}

beforeEach(() => { vi.clearAllMocks(); cleanup(); action.mockResolvedValue(undefined); });

describe("F5.13 ReconsiderClaimForm", () => {
  it("shows the frozen original amounts + safe reasons per line in an accessible table", () => {
    renderForm();
    const table = screen.getByRole("table");
    expect(table).toHaveAccessibleName(/select the claim lines/i);
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Paid to contract rate")).toBeInTheDocument();
    expect(screen.getByText(/UGX 1,000\.00/)).toBeInTheDocument(); // frozen billed
  });

  it("computes the exact requested delta from selected lines", () => {
    renderForm();
    fireEvent.click(screen.getByLabelText(/dispute consultation/i));
    fireEvent.change(screen.getByLabelText(/requested allowed for consultation/i), { target: { value: "900" } });
    expect(screen.getByTestId("total-delta")).toHaveTextContent("UGX 300.00");
    fireEvent.click(screen.getByLabelText(/dispute lab test/i));
    fireEvent.change(screen.getByLabelText(/requested allowed for lab test/i), { target: { value: "750" } });
    expect(screen.getByTestId("total-delta")).toHaveTextContent("UGX 550.00"); // 300 + 250, exact
  });

  it("requires a line, a positive delta, a reason, a narrative, and the declaration", async () => {
    renderForm();
    const btn = screen.getByRole("button", { name: /submit reconsideration/i });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/dispute consultation/i));
    fireEvent.change(screen.getByLabelText(/requested allowed for consultation/i), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: "UNDERPAID_RATE" } });
    fireEvent.change(screen.getByLabelText(/^narrative/i), { target: { value: "The contracted rate is 900." } });
    expect(btn).toBeDisabled(); // declaration not yet checked
    fireEvent.click(screen.getByRole("checkbox", { name: /i declare/i }));
    expect(btn).toBeEnabled();

    fireEvent.click(btn);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const arg = action.mock.calls[0][0];
    expect(arg.claimId).toBe("c1");
    expect(arg.requestedAmount).toBe(300);
    expect(arg.lines).toEqual([{ claimLineId: "l1", requestedAllowed: 900 }]);
  });

  it("surfaces a stale gate accessibly and refreshes", async () => {
    action.mockResolvedValueOnce({ error: "The window to reconsider this decision has passed.", refresh: true });
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: /submit reconsideration/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/window to reconsider/i);
    expect(refresh).toHaveBeenCalled();
  });
});
