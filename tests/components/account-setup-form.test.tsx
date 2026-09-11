/**
 * Family Hospital UAT plan P05.03 — the account-setup page's client boundary.
 * The token is read from the fragment, the fragment is removed at once with
 * history.replaceState, the token is never rendered, and every unusable link
 * gets one safe message with a way to ask for a new link.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({ checkSetupLinkAction: vi.fn(), completeAccountSetupAction: vi.fn(), requestNewSetupLinkAction: vi.fn() }));
vi.mock("@/app/(auth)/account-setup/actions", () => actions);

import { AccountSetupForm } from "@/app/(auth)/account-setup/AccountSetupForm";

const TOKEN = "Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"; // 43 url-safe characters

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", `/account-setup#token=${TOKEN}`);
  actions.checkSetupLinkAction.mockResolvedValue({ valid: true });
  actions.completeAccountSetupAction.mockResolvedValue(undefined);
  actions.requestNewSetupLinkAction.mockResolvedValue({ sent: true });
});

describe("AccountSetupForm", () => {
  it("removes the token from the address bar at once and never renders it", async () => {
    const spy = vi.spyOn(window.history, "replaceState");
    const { container } = render(<AccountSetupForm />);
    await waitFor(() => expect(screen.getByLabelText(/New password/)).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith(null, "", "/account-setup");
    expect(window.location.hash).toBe("");
    expect(actions.checkSetupLinkAction).toHaveBeenCalledWith(TOKEN);
    expect(container.innerHTML).not.toContain(TOKEN);
    expect(document.documentElement.innerHTML).not.toContain(TOKEN);
  });

  it("sends the password twice with the token and shows a policy problem without losing the link", async () => {
    actions.completeAccountSetupAction.mockResolvedValueOnce({ ok: false, invalidLink: false, message: "Password must include a digit." });
    render(<AccountSetupForm />);
    await waitFor(() => expect(screen.getByLabelText(/New password/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "NoDigitsHere" } });
    fireEvent.change(screen.getByLabelText(/Type it again/), { target: { value: "NoDigitsHere" } });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));
    await screen.findByText("Password must include a digit.");
    expect(actions.completeAccountSetupAction).toHaveBeenCalledWith({ token: TOKEN, password: "NoDigitsHere", confirm: "NoDigitsHere" });
    expect(screen.getByLabelText(/New password/)).toBeInTheDocument();
  });

  it("a link the server rejects shows one safe message and a request-new-link form", async () => {
    actions.checkSetupLinkAction.mockResolvedValue({ valid: false });
    render(<AccountSetupForm />);
    await screen.findByText(/This setup link is not valid any more/);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "grace@facility.test" } });
    fireEvent.click(screen.getByRole("button", { name: /Send me a new link/ }));
    await screen.findByText(/If an invitation is waiting for that address, a new link is on its way/);
    expect(actions.requestNewSetupLinkAction).toHaveBeenCalledWith("grace@facility.test");
  });

  it("no token in the fragment is the same safe answer — no server call", async () => {
    window.history.replaceState(null, "", "/account-setup");
    render(<AccountSetupForm />);
    await screen.findByText(/This setup link is not valid any more/);
    expect(actions.checkSetupLinkAction).not.toHaveBeenCalled();
  });

  it("a link spent between checking and submitting falls back to the same safe answer", async () => {
    actions.completeAccountSetupAction.mockResolvedValueOnce({ ok: false, invalidLink: true, message: "This setup link is not valid any more." });
    render(<AccountSetupForm />);
    await waitFor(() => expect(screen.getByLabelText(/New password/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "Correct-Horse-7" } });
    fireEvent.change(screen.getByLabelText(/Type it again/), { target: { value: "Correct-Horse-7" } });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));
    await screen.findByText(/This setup link is not valid any more/);
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
  });
});
