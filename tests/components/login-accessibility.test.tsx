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

import LoginPage from "@/app/(auth)/login/page";

beforeEach(() => vi.clearAllMocks());

const submit = () => fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);

describe("sign-in form accessibility", () => {
  it("associates every input with a real label", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByLabelText(/authenticator code/i)).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "something" } });
    submit();

    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i).getAttribute("aria-invalid")).toBe("true");
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the authenticator field optional for users without 2FA", () => {
    render(<LoginPage />);
    const totp = screen.getByLabelText(/authenticator code/i);
    expect(totp.hasAttribute("required")).toBe(false);
    expect(totp.getAttribute("aria-invalid")).toBeNull();
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

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "nobody@medvex.co.ug" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong-password" } });
    submit();

    await waitFor(() => {
      const text = screen.getAllByRole("alert").map((n) => n.textContent ?? "").join(" ");
      expect(text).not.toMatch(/no such|not found|unknown user|does not exist|incorrect password/i);
    });
  });
});
