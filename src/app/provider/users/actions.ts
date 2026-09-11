"use server";

import { revalidatePath } from "next/cache";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderUserAdminService, ProviderUserAdminError } from "@/server/services/provider-user-admin.service";
import { AccountInvitationService } from "@/server/services/account-invitation.service";

/**
 * ELIG-GAP-005 — provider self-service user administration.
 *
 * One dispatch action for every mutation on the /provider/users page. Authority
 * comes entirely from the F1.3 ProviderAccessContext; each ProviderUserAdminService
 * method is fail-CLOSED (it calls requirePermission(provider.users.manage) and
 * rejects cross-provider targets / TPA roles / PROVIDER_LEGACY). We resolve the
 * context OUTSIDE the try (its requireProvider redirect must not be swallowed),
 * and only translate the service's typed errors into a friendly message.
 */
type Result = { error?: string; ok?: string } | null;

export async function manageProviderUserAction(_prev: Result, formData: FormData): Promise<Result> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const op = String(formData.get("_op") || "");
  const targetUserId = String(formData.get("targetUserId") || "");
  if (!targetUserId) return { error: "Missing user." };

  try {
    switch (op) {
      case "assign_role": {
        const roleCode = String(formData.get("roleCode") || "");
        if (!roleCode) return { error: "Select a role to assign." };
        await ProviderUserAdminService.assignRole(ctx, { targetUserId, roleCode });
        return revalidate("Role assigned.");
      }
      case "revoke_role": {
        const roleCode = String(formData.get("roleCode") || "");
        await ProviderUserAdminService.revokeRole(ctx, { targetUserId, roleCode });
        return revalidate("Role revoked.");
      }
      case "assign_branches": {
        const branchIds = formData.getAll("branchIds").map(String).filter(Boolean);
        if (branchIds.length === 0) return { error: "Select at least one branch." };
        await ProviderUserAdminService.assignBranches(ctx, { targetUserId, branchIds });
        return revalidate("Branch access updated.");
      }
      case "suspend": {
        const reason = String(formData.get("reason") || "") || undefined;
        await ProviderUserAdminService.suspendUser(ctx, { targetUserId, reason });
        return revalidate("User suspended.");
      }
      case "reactivate": {
        await ProviderUserAdminService.reactivateUser(ctx, { targetUserId });
        return revalidate("User reactivated.");
      }
      case "resend": {
        // Family Hospital UAT P05.04 step 2 — a new setup link; older ones stop working.
        const res = await AccountInvitationService.resend({ kind: "PROVIDER", ctx }, targetUserId);
        if (!res.ok) return { error: res.message };
        return revalidate(res.message);
      }
      default:
        return { error: "Unknown action." };
    }
  } catch (e) {
    if (e instanceof ProviderUserAdminError || isProviderAccessError(e)) return { error: e.message };
    throw e;
  }
}

function revalidate(ok: string): Result {
  revalidatePath("/provider/users");
  return { ok };
}

/**
 * Family Hospital UAT plan P05.04 — a facility administrator invites its own
 * staff through the SAME canonical AccountInvitationService the TPA uses. The
 * service allows only this facility, provider personas without administrative
 * access the administrator lacks, and branches the administrator can act at;
 * the invitee sets their own password from a one-time link.
 */
type InviteResult = { error?: string; ok?: boolean; message?: string; deliveryFailed?: boolean; resendUserId?: string } | null;

export async function inviteProviderUserAction(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const text = (name: string) => String(formData.get(name) ?? "");
  const res = await AccountInvitationService.invite(
    { kind: "PROVIDER", ctx },
    {
      email: text("email"),
      firstName: text("firstName"),
      lastName: text("lastName"),
      role: "PROVIDER_USER",
      providerRoleCode: text("providerRoleCode") || null,
      providerBranchIds: formData.getAll("providerBranchIds").map(String).filter(Boolean),
    },
  );
  revalidatePath("/provider/users");
  if (!res.ok) return { error: res.message, ...(res.existing?.canResend ? { resendUserId: res.existing.userId } : {}) };
  return { ok: true, message: res.message, deliveryFailed: res.delivery === "FAILED" };
}

