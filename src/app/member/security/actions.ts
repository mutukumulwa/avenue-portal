"use server";

import { revalidatePath } from "next/cache";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function revokeCredentialAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  if (!session.user.memberId) throw new Error("No member profile is linked to this account.");

  const credentialId = String(formData.get("credentialId") ?? "");
  if (!credentialId) throw new Error("Credential is required.");

  await prisma.memberWebAuthnCredential.update({
    where: { id: credentialId, memberId: session.user.memberId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  revalidatePath("/member/security");
}
