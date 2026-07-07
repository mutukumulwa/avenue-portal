"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import {
  TenantSettingsService,
  type FraudApprovalGateMode,
} from "@/server/services/tenant-settings.service";
import type { FraudSeverity } from "@prisma/client";

const PATH = "/settings/claim-controls";

const SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const MODES = new Set(["CLEAR_ALERT_ONLY", "CLEAR_ALERT_OR_DUAL_APPROVAL"]);

/**
 * Save the OBS-7 fraud approval gate settings (Outstanding-Conditions Ticket 1).
 * Money-control change — the service records old→new in the audit log.
 */
export async function saveClaimControlsAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const requireFraudClearanceBeforeApproval = formData.get("requireFraudClearanceBeforeApproval") === "on";
  const thresholdRaw = ((formData.get("fraudApprovalSeverityThreshold") as string) || "MEDIUM").toUpperCase();
  const modeRaw = (formData.get("fraudApprovalGateMode") as string) || "CLEAR_ALERT_OR_DUAL_APPROVAL";

  let errorMsg = "";
  try {
    if (!SEVERITIES.has(thresholdRaw)) throw new Error("Invalid severity threshold.");
    if (!MODES.has(modeRaw)) throw new Error("Invalid gate mode.");
    await TenantSettingsService.updateClaimControls(
      tenantId,
      {
        requireFraudClearanceBeforeApproval,
        fraudApprovalSeverityThreshold: thresholdRaw as FraudSeverity,
        fraudApprovalGateMode: modeRaw as FraudApprovalGateMode,
      },
      session.user.id,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to save claim controls";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  redirect(`${PATH}?saved=1`);
}
