"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { OfflineAuthService } from "@/server/services/offline-auth.service";
import { OfflinePackService } from "@/server/services/offline-pack.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Issue an offline work code (WP-B2). Delivery is off-system by design: the
 * agent reads the code out over the phone and/or sends it by SMS. The system
 * records issuance, generates the facility's encrypted data pack, and shows
 * the code once for read-out.
 */
export async function issueOfflineCodeAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const providerId = formData.get("providerId") as string;
  if (!providerId) throw new Error("Choose the facility requesting offline work.");
  const validityHours = Math.min(168, Math.max(1, Number(formData.get("validityHours")) || 48));
  const maxOperations = formData.get("maxOperations") ? Number(formData.get("maxOperations")) : null;

  const auth = await OfflineAuthService.issueCode({
    tenantId,
    providerId,
    issuedById: session.user.id,
    reason: (formData.get("reason") as string) || undefined,
    contactName: (formData.get("contactName") as string) || undefined,
    contactPhone: (formData.get("contactPhone") as string) || undefined,
    validityHours,
    maxOperations,
  });

  // Encrypted pack up-front so the facility can pull it while still connected.
  try {
    await OfflinePackService.generateForAuthorization(auth.id);
  } catch (e) {
    console.error("[offline-auth] pack generation failed (code still issued):", e);
  }

  // TODO(WP-B5): optional SMS delivery once an SMS provider is configured
  // (secure-checkin/adapters/sms.ts is a stub). Phone read-out is primary.

  await writeAudit({
    userId: session.user.id,
    action: "OFFLINE_CODE_ISSUED",
    module: "OFFLINE",
    description: `Offline work code issued to ${auth.provider.name} (valid ${validityHours}h)`,
    metadata: { authId: auth.id, providerId, validityHours, contactPhone: auth.contactPhone },
  });

  revalidatePath("/offline-auth");
  redirect(`/offline-auth?issued=${auth.id}`);
}

export async function revokeOfflineCodeAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const id = formData.get("id") as string;
  const auth = await OfflineAuthService.revokeCode(session.user.tenantId, id, session.user.id);

  await writeAudit({
    userId: session.user.id,
    action: "OFFLINE_CODE_REVOKED",
    module: "OFFLINE",
    description: `Offline work code ${auth.code} revoked`,
    metadata: { authId: id },
  });

  revalidatePath("/offline-auth");
}
