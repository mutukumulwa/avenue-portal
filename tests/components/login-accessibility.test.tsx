/**
 * WP-6 (DEF-004) — the sign-in form must present accessible, persistent,
 * associated validation and must not enumerate accounts.
 *
 * The UAT found blank submit relied on the browser's native "Please fill in
 * this field" bubble: transient, unstyled, not announced, and gone on blur.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn(async () => ({ ok: false, error: "CredentialsSignin" })) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

/**
 * UAT-HF P10.01 — sign-in is two steps now (DEF-011). The server decides
 * whether an authenticator code applies, so the code field does not exist on
 * step one at all. The default mock is the majority case: no authenticator.
 */
const beginSignIn = vi.hoisted(() => vi.fn(async () => ({ step: "PASSWORD_ONLY" as const })));
vi.mock("@/app/(auth)/login/actions", () => ({ beginSignInAction: beginSignIn }));

import LoginPage from "@/app/(auth)/login/page";

beforeEach(() => {
  vi.clearAllMocks();
  beginSignIn.mockResolvedValue({ step: "PASSWORD_ONLY" });
});

const submit = () =>
  fireEvent.submit(screen.getByRole("button", { name: /continue|verify code/i }).closest("form")!);

/** Get to the code step the way a user does: a real password submit. */
const reachCodeStep = async () => {
  beginSignIn.mockResolvedValue({ step: "CODE_REQUIRED" } as never);
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ops@medvex.co.ug" } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-password" } });
  submit();
  await waitFor(() => expect(screen.getByLabelText(/authenticator code/i)).toBeTruthy());
};

describe("sign-in form accessibility", () => {
  it("associates every input with a real label", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
  });

  it("P10.01: does not show an authenticator field before it is known to apply", () => {
    // The acceptance criterion: "users without TOTP never see an unexplained
    // optional field". The old form asked every user a question about
    // themselves that most of them could not answer.
    render(<LoginPage />);
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull();
  });

  it("P10.01: asks for the code only after the server says one is required", async () => {
    render(<LoginPage />);
    await reachCodeStep();

    const totp = screen.getByLabelText(/authenticator code/i);
    // Required here, and NOT described as optional — this step is reached only
    // when the account actually has an authenticator.
    expect(totp.hasAttribute("required")).toBe(true);
    expect(document.body.textContent).not.toMatch(/if 2FA enabled|leave blank/i);
  });

  it("P10.01: a rejected code does not blame the password", async () => {
    const { signIn } = await import("next-auth/react");
    render(<LoginPage />);
    await reachCodeStep();

    fireEvent.change(screen.getByLabelText(/authenticator code/i), { target: { value: "123456" } });
    submit();

    await waitFor(() => {
      const text = screen.getAllByRole("alert").map((n) => n.textContent ?? "").join(" ");
      // The password is known good by now, so "invalid email or password" would
      // be a lie the user cannot act on.
      expect(text).not.toMatch(/email or password/i);
      expect(text).toMatch(/authenticator code/i);
    });
    expect(signIn).toHaveBeenCalled();
  });

  it("P10.01: leaving the code step clears the code (DEF-012)", async () => {
    render(<LoginPage />);
    await reachCodeStep();

    fireEvent.change(screen.getByLabelText(/authenticator code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /use a different account/i }));

    await waitFor(() => expect(screen.queryByLabelText(/authenticator code/i)).toBeNull());
    // Going back and forward must not resurrect a spent code on a shared screen.
    await reachCodeStep();
    expect((screen.getByLabelText(/authenticator code/i) as HTMLInputElement).value).toBe("");
  });

  it("shows a persistent, announced error per invalid field on blank submit", async () => {
    render(<LoginPage />);
    submit();

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert").map((n) => n.textContent ?? "");
      expect(alerts.some((t) => /email/i.test(t))).toBe(true);
      expect(alerts.some((t) => /password/i.test(t))).toBe(true);
    });
  });

  it("marks invalid fields with aria-invalid and points at the message", async () => {
    render(<LoginPage />);
    submit();

    await waitFor(() => {
      const email = screen.getByLabelText(/email address/i);
      expect(email.getAttribute("aria-invalid")).toBe("true");
      const describedBy = email.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)?.textContent).toMatch(/email/i);
    });
  });

  it("moves focus to the first invalid field after submit", async () => {
    render(<LoginPage />);
    submit();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(/email address/i));
    });
  });

  it("rejects a malformed email without contacting the server", async () => {
    const { signIn } = await import("next-auth/react");
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "something" } });
    submit();

    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i).getAttribute("aria-invalid")).toBe("true");
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("never blocks a user without 2FA on a code they do not have", async () => {
    const { signIn } = await import("next-auth/react");
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "hr@medvex.co.ug" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-password" } });
    submit();

    // PASSWORD_ONLY signs straight in: one step, exactly as before, for the
    // great majority of users.
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull();
  });

  it("DEF-006: marks email and password as required to assistive tech", () => {
    render(<LoginPage />);
    for (const label of [/email address/i, /^password/i]) {
      const field = screen.getByLabelText(label);
      expect(field.hasAttribute("required")).toBe(true);
      expect(field.getAttribute("aria-required")).toBe("true");
    }
  });

  it("DEF-006: a valid field carries aria-invalid=\"false\" (not undefined) so state is explicit", () => {
    render(<LoginPage />);
    // Before any submit both required fields are pristine/valid — the attribute
    // must be present and false, not absent.
    expect(screen.getByLabelText(/email address/i).getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByLabelText(/^password/i).getAttribute("aria-invalid")).toBe("false");
  });

  it("does not enumerate accounts in the authentication error", async () => {
    render(<LoginPage />);

    beginSignIn.mockResolvedValue({ step: "REJECTED" } as never);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "nobody@medvex.co.ug" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "wrong-password" } });
    submit();

    await waitFor(() => {
      const text = screen.getAllByRole("alert").map((n) => n.textContent ?? "").join(" ");
      expect(text).not.toMatch(/no such|not found|unknown user|does not exist|incorrect password/i);
    });
  });
});
