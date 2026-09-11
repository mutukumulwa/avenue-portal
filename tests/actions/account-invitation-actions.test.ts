/**
 * Family Hospital UAT plan P05.04 step 4 — both administration surfaces are
 * adapters over the ONE AccountInvitationService; P05.03 — the public setup
 * actions. Seam tests: authority comes from the session; no password field is
 * read; results never carry a token; the setup redirect follows success only.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const svc = vi.hoisted(() => ({ invite: vi.fn(), resend: vi.fn(), completeSetup: vi.fn(), checkToken: vi.fn(), requestNewLink: vi.fn() }));
vi.mock("@/server/services/account-invitation.service", () => ({ AccountInvitationService: svc, SETUP_LINK_INVALID_MESSAGE: "This setup link is not valid any more." }));

const session = vi.hoisted(() => ({ user: { id: "admin-1", tenantId: "t1", clientId: null as string | null } }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => session), ROLES: { ADMIN_ONLY: ["SUPER_ADMIN"] } }));
const providerCtx = vi.hoisted(() => ({ ctx: { tenantId: "t1", providerId: "prov-1", actorId: "fa-1", permissions: ["provider.users.manage"], allowedProviderBranchIds: ["br-1"] } }));
vi.mock("@/server/services/provider-access.service", () => ({ ProviderAccessService: { resolveUserContext: vi.fn(async () => providerCtx) }, isProviderAccessError: () => false }));
vi.mock("@/server/services/provider-user-admin.service", () => ({ ProviderUserAdminService: {}, ProviderUserAdminError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
const nav = vi.hoisted(() => ({ redirect: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: nav.revalidatePath }));

import { inviteUserAction, resendInvitationAction } from "@/app/(admin)/settings/actions";
import { requireRole } from "@/lib/rbac";
import { inviteProviderUserAction, manageProviderUserAction } from "@/app/provider/users/actions";
import { checkSetupLinkAction, completeAccountSetupAction, requestNewSetupLinkAction } from "@/app/(auth)/account-setup/actions";

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe("TPA Settings → Send invitation", () => {
  it("passes the session's tenant/actor and the form's binding — and no password", async () => {
    svc.invite.mockResolvedValue({ ok: true, userId: "u9", invitationId: "i9", delivery: "SENT", failureClass: null, expiresAt: new Date(), message: "Invitation sent to grace@x.test. The link expires in 24 hours." });
    const res = await inviteUserAction(null, form({ email: "grace@x.test", firstName: "Grace", lastName: "A", role: "PROVIDER_USER", providerId: "prov-1", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: ["br-1", "br-2"], password: "Should-Be-Ignored-1" }));
    expect(svc.invite).toHaveBeenCalledWith(
      { kind: "PLATFORM", tenantId: "t1", actorId: "admin-1", clientId: null },
      expect.objectContaining({ email: "grace@x.test", role: "PROVIDER_USER", providerId: "prov-1", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: ["br-1", "br-2"] }),
    );
    expect(JSON.stringify(svc.invite.mock.calls[0][1])).not.toContain("Should-Be-Ignored-1");
    expect(res).toEqual({ ok: true, message: "Invitation sent to grace@x.test. The link expires in 24 hours.", deliveryFailed: false });
  });

  it("a failed delivery is reported as exactly that", async () => {
    svc.invite.mockResolvedValue({ ok: true, userId: "u9", invitationId: "i9", delivery: "FAILED", failureClass: "CONFIG", expiresAt: new Date(), message: "User created; invitation delivery failed — resend." });
    expect(await inviteUserAction(null, form({ email: "g@x.test", firstName: "G", lastName: "A", role: "CLAIMS_OFFICER" }))).toEqual({ ok: true, message: "User created; invitation delivery failed — resend.", deliveryFailed: true });
  });

  it("an existing, not-yet-set-up account offers a resend", async () => {
    svc.invite.mockResolvedValue({ ok: false, code: "EXISTS", message: "An account with this email already exists and is waiting to be set up.", existing: { userId: "u5", canResend: true } });
    expect(await inviteUserAction(null, form({ email: "g@x.test", firstName: "G", lastName: "A", role: "CLAIMS_OFFICER" }))).toMatchObject({ error: expect.any(String), resendUserId: "u5" });
    svc.resend.mockResolvedValue({ ok: true, message: "A new setup link was sent. It expires in 24 hours." });
    expect(await resendInvitationAction(null, form({ userId: "u5" }))).toEqual({ ok: true, message: "A new setup link was sent. It expires in 24 hours." });
    expect(svc.resend).toHaveBeenCalledWith({ kind: "PLATFORM", tenantId: "t1", actorId: "admin-1", clientId: null }, "u5");
  });
});

describe("Facility Users → Invite a staff member", () => {
  it("uses the PROVIDER actor from the session and always role PROVIDER_USER", async () => {
    svc.invite.mockResolvedValue({ ok: true, userId: "u1", invitationId: "i1", delivery: "SENT", failureClass: null, expiresAt: new Date(), message: "Invitation sent." });
    await inviteProviderUserAction(null, form({ email: "a@b.test", firstName: "A", lastName: "B", role: "SUPER_ADMIN", providerId: "prov-OTHER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: "br-1" }));
    const [actor, input] = svc.invite.mock.calls[0];
    expect(actor).toEqual({ kind: "PROVIDER", ctx: providerCtx.ctx });
    expect(input.role).toBe("PROVIDER_USER");
    expect(input).not.toHaveProperty("providerId");
  });

  it("resend goes through the same service, scoped to the facility", async () => {
    svc.resend.mockResolvedValue({ ok: true, message: "A new setup link was sent. It expires in 24 hours." });
    expect(await manageProviderUserAction(null, form({ _op: "resend", targetUserId: "u1" }))).toEqual({ ok: "A new setup link was sent. It expires in 24 hours." });
    expect(svc.resend).toHaveBeenCalledWith({ kind: "PROVIDER", ctx: providerCtx.ctx }, "u1");
  });
});

describe("P08.01 — refusals and failed deliveries on both surfaces", () => {
  it("TPA invite and resend are for administrators only: the guard's redirect propagates and nothing is sent", async () => {
    const denied = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/unauthorized;307;" });
    vi.mocked(requireRole).mockRejectedValueOnce(denied).mockRejectedValueOnce(denied);
    await expect(inviteUserAction(null, form({ email: "g@x.test", firstName: "G", lastName: "A", role: "CLAIMS_OFFICER" }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(resendInvitationAction(null, form({ userId: "u5" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(svc.invite).not.toHaveBeenCalled();
    expect(svc.resend).not.toHaveBeenCalled();
  });

  it("a facility user without provider.users.manage is refused by the service, and the refusal is what they see", async () => {
    svc.invite.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "You do not have permission to invite staff." });
    expect(await inviteProviderUserAction(null, form({ email: "a@b.test", firstName: "A", lastName: "B", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: "br-1" }))).toEqual({ error: "You do not have permission to invite staff." });
    svc.resend.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "You do not have permission to invite staff." });
    expect(await manageProviderUserAction(null, form({ _op: "resend", targetUserId: "u1" }))).toEqual({ error: "You do not have permission to invite staff." });
  });

  it("another facility's user cannot be re-invited: the facility-scoped lookup finds nothing", async () => {
    svc.resend.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "User not found." });
    expect(await manageProviderUserAction(null, form({ _op: "resend", targetUserId: "user-of-another-facility" }))).toEqual({ error: "User not found." });
    expect(svc.resend).toHaveBeenCalledWith({ kind: "PROVIDER", ctx: providerCtx.ctx }, "user-of-another-facility");
  });

  it("a failed delivery is reported as such on the facility invite and on both resends", async () => {
    svc.invite.mockResolvedValue({ ok: true, userId: "u1", invitationId: "i1", delivery: "FAILED", failureClass: "CONNECTION", expiresAt: new Date(), message: "User created; invitation delivery failed — resend." });
    expect(await inviteProviderUserAction(null, form({ email: "a@b.test", firstName: "A", lastName: "B", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: "br-1" }))).toEqual({ ok: true, message: "User created; invitation delivery failed — resend.", deliveryFailed: true });
    const resent = { ok: true, userId: "u1", invitationId: "i2", delivery: "FAILED", failureClass: "TIMEOUT", expiresAt: new Date(), message: "A new setup link was created, but delivery failed — resend." };
    svc.resend.mockResolvedValue(resent);
    expect(await resendInvitationAction(null, form({ userId: "u1" }))).toEqual({ ok: true, message: resent.message });
    expect(await manageProviderUserAction(null, form({ _op: "resend", targetUserId: "u1" }))).toEqual({ ok: resent.message });
  });
});

describe("public account setup", () => {
  it("check answers yes/no only", async () => {
    svc.checkToken.mockResolvedValue(true);
    expect(await checkSetupLinkAction("tok")).toEqual({ valid: true });
  });

  it("redirects to sign-in only after a successful setup", async () => {
    svc.completeSetup.mockResolvedValue({ ok: true });
    await completeAccountSetupAction({ token: "tok", password: "Correct-Horse-7", confirm: "Correct-Horse-7" });
    expect(nav.redirect).toHaveBeenCalledWith("/login?setup=done");
  });

  it("an unusable link is one safe message — no redirect, nothing about the account", async () => {
    svc.completeSetup.mockResolvedValue({ ok: false, code: "INVALID_LINK", message: "anything" });
    expect(await completeAccountSetupAction({ token: "tok", password: "x", confirm: "x" })).toEqual({ ok: false, invalidLink: true, message: "This setup link is not valid any more." });
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("asking for a new link always gets the same answer", async () => {
    svc.requestNewLink.mockResolvedValue(undefined);
    expect(await requestNewSetupLinkAction("someone@x.test")).toEqual({ sent: true });
  });
});
