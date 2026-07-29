/**
 * F5.6 — provider withdrawal UI (WithdrawClaimButton).
 *
 * The consequence-stating confirmation is an accessible alert dialog; a catalog reason
 * is required; the confirm is disabled until a reason is chosen and while the request is
 * in flight (double-click safe); Escape/backdrop cancel; a stale/decided claim surfaces
 * the server message and refreshes. The server action is mocked (its authorization is
 * covered by the action + service tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within, waitFor, act, cleanup } from "@testing-library/react";

const action = vi.hoisted(() => vi.fn(async () => ({ ok: true }) as unknown));
vi.mock("@/app/provider/claims/[id]/actions", () => ({ withdrawProviderClaimAction: action }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { WithdrawClaimButton } from "@/app/provider/claims/[id]/WithdrawClaimButton";

const reasons = [
  { code: "SUBMITTED_IN_ERROR", label: "Submitted in error" },
  { code: "DUPLICATE_SUBMISSION", label: "Duplicate submission" },
];

function openDialog() {
  render(<WithdrawClaimButton claimId="c1" claimNumber="CLM-1" reasons={reasons} />);
  fireEvent.click(screen.getByRole("button", { name: /withdraw claim/i })); // the trigger (only button so far)
  return screen.getByRole("alertdialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  action.mockResolvedValue({ ok: true });
});

describe("F5.6 WithdrawClaimButton", () => {
  it("opens an accessible alert dialog (modal, labelled, described, labelled reason)", () => {
    const dialog = openDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/withdraw claim CLM-1/i);
    expect(dialog).toHaveAccessibleDescription(/permanent/i);
    expect(within(dialog).getByLabelText(/reason/i)).toBeInTheDocument();
  });

  it("requires a reason before the confirm is enabled", () => {
    const dialog = openDialog();
    const confirm = within(dialog).getByRole("button", { name: /withdraw claim/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "DUPLICATE_SUBMISSION" } });
    expect(confirm).toBeEnabled();
  });

  it("closes on Escape without calling the action", () => {
    openDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("is double-click safe — a second click while pending is a no-op", async () => {
    let resolve!: (v: unknown) => void;
    action.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "SUBMITTED_IN_ERROR" } });
    const confirm = within(dialog).getByRole("button", { name: /withdraw/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled()); // pending → disabled
    fireEvent.click(confirm); // ignored (disabled)
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ok: true }); });
  });

  it("on success closes the dialog and refreshes the detail", async () => {
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "SUBMITTED_IN_ERROR" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /withdraw claim/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledWith({ claimId: "c1", reasonCode: "SUBMITTED_IN_ERROR", note: undefined });
    expect(refresh).toHaveBeenCalled();
  });

  it("on a stale/decided error shows the message and refreshes to resync", async () => {
    action.mockResolvedValueOnce({ error: "An approved claim cannot be withdrawn.", refresh: true });
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "SUBMITTED_IN_ERROR" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /withdraw claim/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/cannot be withdrawn/i);
    expect(refresh).toHaveBeenCalled();
  });
});
