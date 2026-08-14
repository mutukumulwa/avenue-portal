"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCachedSession } from "@/lib/auth";
import { validatePassword, PASSWORD_BCRYPT_COST } from "@/lib/password-policy";
import { writeAudit } from "@/lib/audit";

/**
 * ELIG-GAP-006 — first-login credential replacement.
 *
 * A user whose password was set by an administrator (invite or reset) carries
 * `mustChangePassword`, which requireRole confines to this page. Here they prove
 * the temporary password and set their own. The sessionVersion bump invalidates
 * the temporary-password session, so the prior credential is dead immediately
 * and the user re-authenticates with the new one.
 *
 * NOTE: redirect() throws NEXT_REDIRECT — it is deliberately NOT wrapped in
 * try/catch (that would swallow the navigation).
 */
export async function changePasswordAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await getCachedSession();
  if (!session?.user) redirect("/login");

  const currentPassword = (formData.get("currentPassword") as string | null) || "";
  const newPassword = (formData.get("newPassword") as string | null) || "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) || "";

  if (!currentPassword || !newPassword) return { error: "Enter your temporary password and a new password." };
  if (newPassword !== confirmPassword) return { error: "The new passwords do not match." };
  const pwError = validatePassword(newPassword);
  if (pwError) return { error: pwError };

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, tenantId: session.user.tenantId },
    select: { id: true, tenantId: true, passwordHash: true },
  });
  if (!user) redirect("/login");

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { error: "Your temporary password is incorrect." };

  const reused = await bcrypt.compare(newPassword, user.passwordHash);
  if (reused) return { error: "Choose a password different from the temporary one." };

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_BCRYPT_COST);
  await prisma.user.update({
    where: { id: user.id },
    // Clear the flag AND supersede the temporary-password session in one write.
    data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
  });

  await writeAudit({
    userId: user.id,
    action: "PASSWORD_CHANGED_FIRST_LOGIN",
    module: "AUTH",
    description: "User replaced an administrator-set temporary password at first login",
    metadata: {},
  });

  // Temporary-password session is now stale — sign in again with the new password.
  redirect("/login?passwordChanged=1");
}
