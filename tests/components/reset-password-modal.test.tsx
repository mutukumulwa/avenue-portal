import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The action itself is covered in tests/actions/settings-reset-password.test.ts;
// here we only verify the modal wiring around it.
vi.mock("@/app/(admin)/settings/actions", () => ({
  resetUserPasswordAction: vi.fn(async () => ({ ok: true })),
}));

import { ResetPasswordModal } from "@/app/(admin)/settings/ResetPasswordModal";

const props = { userId: "u1", userName: "Grace Okello", userEmail: "grace@medvex.co.ug" };

beforeEach(() => vi.clearAllMocks());

describe("ResetPasswordModal", () => {
  it("renders a closed row trigger only", () => {
    render(<ResetPasswordModal {...props} />);
    expect(screen.getByRole("button", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it("opens with the target user's identity and a policy-hinted password field", () => {
    render(<ResetPasswordModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByText(/grace okello/i)).toBeInTheDocument();
    expect(screen.getByText(/grace@medvex\.co\.ug/i)).toBeInTheDocument();

    const pw = screen.getByLabelText(/new password/i);
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toBeRequired();
    expect(pw).toHaveAttribute("minlength", "10");

    // The target user id rides a hidden field to the server action.
    const form = pw.closest("form")!;
    const hidden = form.querySelector('input[name="userId"]') as HTMLInputElement;
    expect(hidden.value).toBe("u1");

    // Direct-set semantics are documented in the modal (no change-on-first-login).
    expect(screen.getByText(/no change-on-first-login/i)).toBeInTheDocument();
    expect(screen.getByText(/signed out of any active session/i)).toBeInTheDocument();
  });

  it("closes on Cancel without touching the router", () => {
    render(<ResetPasswordModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
