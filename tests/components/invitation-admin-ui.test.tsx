/**
 * Family Hospital UAT plan P05.04 steps 1–2 — the administration UIs.
 * No "Temporary Password" field anywhere; "Send invitation"; the outcome says
 * whether the email left; not-yet-set-up accounts show their link state and a
 * resend; the facility's invite offers only personas and branches it may grant.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const admin = vi.hoisted(() => ({ inviteUserAction: vi.fn(), resendInvitationAction: vi.fn() }));
vi.mock("@/app/(admin)/settings/actions", () => admin);
const provider = vi.hoisted(() => ({ inviteProviderUserAction: vi.fn(), manageProviderUserAction: vi.fn() }));
vi.mock("@/app/provider/users/actions", () => provider);

import { InviteUserModal } from "@/app/(admin)/settings/InviteUserModal";
import { ProviderUsersManager } from "@/app/provider/users/ProviderUsersManager";
import { describeInvitation } from "@/components/users/InvitationStatus";

beforeEach(() => vi.resetAllMocks());

function fillStaffInvite(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[name="firstName"]')!, { target: { value: "Grace" } });
  fireEvent.change(container.querySelector('input[name="lastName"]')!, { target: { value: "Akello" } });
  fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: "grace@x.test" } });
  fireEvent.change(container.querySelector('select[name="role"]')!, { target: { value: "CLAIMS_OFFICER" } });
}

describe("TPA InviteUserModal", () => {
  it("has no password field and sends an invitation", async () => {
    admin.inviteUserAction.mockResolvedValue({ ok: true, message: "Invitation sent to grace@x.test. The link expires in 24 hours.", deliveryFailed: false });
    const { container } = render(<InviteUserModal />);
    fireEvent.click(screen.getByRole("button", { name: /invite user/i }));
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/Temporary Password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/You never see or choose their password/)).toBeInTheDocument();
    fillStaffInvite(container);
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByText("Invitation sent to grace@x.test. The link expires in 24 hours.");
    expect(refresh).toHaveBeenCalled();
  });

  it("says plainly when the account exists but the email did not leave", async () => {
    admin.inviteUserAction.mockResolvedValue({ ok: true, message: "User created; invitation delivery failed — resend.", deliveryFailed: true });
    const { container } = render(<InviteUserModal />);
    fireEvent.click(screen.getByRole("button", { name: /invite user/i }));
    fillStaffInvite(container);
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await screen.findByText("User created; invitation delivery failed — resend.");
    expect(screen.getByText(/waiting to be set up/)).toBeInTheDocument();
  });
});

describe("Facility users page", () => {
  const baseUser = { id: "u1", name: "Grace A", email: "grace@x.test", isActive: true, isSelf: false, roles: [{ code: "PROVIDER_BILLER", label: "Biller" }], branchNames: ["Main"] };

  it("offers only the personas and branches passed in, and shows a pending account's link state with a resend", async () => {
    provider.manageProviderUserAction.mockResolvedValue({ ok: "A new setup link was sent. It expires in 24 hours." });
    render(
      <ProviderUsersManager
        users={[{ ...baseUser, pending: true, invitation: { status: "FAILED", issuedAt: "2026-09-11T06:00:00Z", lastAttemptAt: "2026-09-11T06:00:05Z", expiresAt: "2026-09-12T06:00:00Z", failureClass: "CONFIG" } }]}
        branches={[{ id: "br-1", name: "Main" }]}
        personaRoles={[{ code: "PROVIDER_FRONT_DESK", label: "Front Desk" }, { code: "PROVIDER_BILLER", label: "Biller" }]}
      />,
    );
    const role = screen.getByLabelText("Role");
    expect(within(role).getAllByRole("option").map((o) => (o as HTMLOptionElement).value).filter(Boolean)).toEqual(["PROVIDER_FRONT_DESK", "PROVIDER_BILLER"]);
    expect(screen.getByRole("checkbox", { name: "Main" })).toBeChecked(); // the only branch is preselected
    expect(screen.getByText("NOT SET UP")).toBeInTheDocument();
    expect(screen.getByText(/Delivery failed .* mail is not configured/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    await waitFor(() => expect(provider.manageProviderUserAction).toHaveBeenCalled());
    const fd = provider.manageProviderUserAction.mock.calls[0][1] as FormData;
    expect(fd.get("_op")).toBe("resend");
    expect(fd.get("targetUserId")).toBe("u1");
    await screen.findByText("A new setup link was sent. It expires in 24 hours.");
  });

  it("the invite form has no password field", () => {
    const { container } = render(<ProviderUsersManager users={[]} branches={[{ id: "br-1", name: "Main" }]} personaRoles={[{ code: "PROVIDER_BILLER", label: "Biller" }]} />);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeInTheDocument();
  });
});

describe("describeInvitation", () => {
  it("names every state in words", () => {
    const base = { issuedAt: "2026-09-11T06:00:00Z", lastAttemptAt: "2026-09-11T06:00:05Z", expiresAt: "2026-09-12T06:00:00Z", failureClass: null };
    expect(describeInvitation(null).label).toBe("No setup link sent yet");
    expect(describeInvitation({ ...base, status: "SENT" }).label).toMatch(/^Setup link sent .* · expires /);
    expect(describeInvitation({ ...base, status: "EXPIRED" }).label).toMatch(/^Setup link expired/);
    expect(describeInvitation({ ...base, status: "USED" }).label).toBe("Account set up");
    expect(describeInvitation({ ...base, status: "FAILED", failureClass: "ORIGIN" }).label).toMatch(/portal address is not configured/);
  });
});
