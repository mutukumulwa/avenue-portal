"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { generateSecret, otpauthUri, verifyTotp, TOTP_ENFORCED_ROLES, totpEnforcementActive } from "@/lib/totp";

/**
 * Begin 2FA enrolment (R81): generate + store a secret (not yet enabled) and
 * return the otpauth URI + base32 secret for the authenticator app.
 */
export async function startTotpEnrolmentAction(): Promise<{ secret: string; uri: string; error?: string }> {
  const session = await requireRole(ROLES.ANY_STAFF, { allow2faEnrolment: true });
  const secret = generateSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });
  return {
    secret,
    uri: otpauthUri(secret, session.user.email ?? session.user.id),
  };
}

/** Confirm enrolment by verifying a code, then enable 2FA. */
export async function confirmTotpAction(
  _prev: { enabled?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ enabled?: boolean; error?: string }> {
  const session = await requireRole(ROLES.ANY_STAFF, { allow2faEnrolment: true });
  const code = ((formData.get("code") as string) || "").trim();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true },
  });
  if (!user?.totpSecret) return { error: "Start enrolment first." };
  if (!verifyTotp(user.totpSecret, code)) return { error: "Incorrect code — try again." };

  await prisma.user.update({ where: { id: session.user.id }, data: { totpEnabled: true } });
  await writeAudit({
    userId: session.user.id,
    action: "TWO_FACTOR_ENABLED",
    module: "SECURITY",
    description: "Two-factor authentication enabled",
  });
  revalidatePath("/settings/security");
  return { enabled: true };
}

/** Disable 2FA and clear the secret. */
export async function disableTotpAction(): Promise<{ disabled: boolean }> {
  const session = await requireRole(ROLES.ANY_STAFF, { allow2faEnrolment: true });
  // WP-8 (DEC-09): two-factor is COMPULSORY for money-moving roles — the
  // server refuses to disable it regardless of what the UI offers.
  if (totpEnforcementActive() && TOTP_ENFORCED_ROLES.has(session.user.role ?? "")) {
    return { disabled: false };
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: null, totpEnabled: false },
  });
  await writeAudit({
    userId: session.user.id,
    action: "TWO_FACTOR_DISABLED",
    module: "SECURITY",
    description: "Two-factor authentication disabled",
  });
  revalidatePath("/settings/security");
  return { disabled: true };
}
