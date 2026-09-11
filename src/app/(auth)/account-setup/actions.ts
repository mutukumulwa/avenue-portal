"use server";

/**
 * Family Hospital UAT plan P05.03 — the public account-setup actions.
 *
 * Public by design: the caller is somebody holding a one-time link, not a
 * signed-in user. Every answer about a link is the same safe one whatever the
 * reason it cannot be used (used, replaced, expired, altered, suspended account,
 * other tenant), and nothing returned or logged contains the token, a password
 * or anything about the account. The redirect after success is outside every
 * try/catch (vendored redirecting.mdx: `redirect()` throws).
 *
 * `"use server"`: async function exports only (AGENTS.md).
 */
import { redirect } from "next/navigation";
import { AccountInvitationService, SETUP_LINK_INVALID_MESSAGE } from "@/server/services/account-invitation.service";

export async function checkSetupLinkAction(token: string): Promise<{ valid: boolean }> {
  return { valid: await AccountInvitationService.checkToken(token) };
}

export async function completeAccountSetupAction(input: {
  token: string;
  password: string;
  confirm: string;
}): Promise<{ ok: false; invalidLink: boolean; message: string } | void> {
  const raw = input && typeof input === "object" ? input : ({} as typeof input);
  const result = await AccountInvitationService.completeSetup(raw.token, raw.password, raw.confirm);
  if (!result.ok) {
    return { ok: false, invalidLink: result.code === "INVALID_LINK", message: result.code === "INVALID_LINK" ? SETUP_LINK_INVALID_MESSAGE : result.message };
  }
  redirect("/login?setup=done");
}

export async function requestNewSetupLinkAction(email: string): Promise<{ sent: true }> {
  await AccountInvitationService.requestNewLink(email);
  // Always the same answer: nothing says whether the address has an account.
  return { sent: true };
}
