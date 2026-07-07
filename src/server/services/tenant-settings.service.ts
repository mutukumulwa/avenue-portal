import { prisma } from "@/lib/prisma";
import type { FraudSeverity, Prisma } from "@prisma/client";

/**
 * tenant-settings.service.ts — typed access to per-tenant money-control
 * settings stored in `Tenant.config` (Outstanding-Conditions Ticket 1).
 *
 * `Tenant.config` is an untyped JSON blob. Rather than scatter `as any` reads
 * across services, all claim-control settings are read/written through here so
 * defaults are applied in one place and a config with missing/garbage keys can
 * never crash a decision. Nothing is stored until an admin explicitly changes a
 * setting; absent keys resolve to the safe defaults below.
 *
 * Fraud-gate defaults (per the development plan §2):
 *   requireFraudClearanceBeforeApproval = false  → no silent policy change for
 *     existing tenants; the UAT tenant opts in.
 *   fraudApprovalSeverityThreshold      = MEDIUM  → LOW/noise alerts never
 *     freeze routine claims unless product raises the bar.
 *   fraudApprovalGateMode = CLEAR_ALERT_OR_DUAL_APPROVAL → either the fraud team
 *     clears the alert, or a completed dual-approval chain authorises payment.
 */

export type FraudApprovalGateMode = "CLEAR_ALERT_ONLY" | "CLEAR_ALERT_OR_DUAL_APPROVAL";

export interface ClaimControlSettings {
  requireFraudClearanceBeforeApproval: boolean;
  fraudApprovalSeverityThreshold: FraudSeverity;
  fraudApprovalGateMode: FraudApprovalGateMode;
}

export const CLAIM_CONTROL_DEFAULTS: ClaimControlSettings = {
  requireFraudClearanceBeforeApproval: false,
  fraudApprovalSeverityThreshold: "MEDIUM",
  fraudApprovalGateMode: "CLEAR_ALERT_OR_DUAL_APPROVAL",
};

// Severity ordering — a claim is gated when an unresolved alert is at or above
// the configured threshold. Kept local so the mapping is explicit and testable.
const SEVERITY_RANK: Record<FraudSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const VALID_SEVERITIES = new Set(Object.keys(SEVERITY_RANK));
const VALID_GATE_MODES = new Set<FraudApprovalGateMode>([
  "CLEAR_ALERT_ONLY",
  "CLEAR_ALERT_OR_DUAL_APPROVAL",
]);

export class TenantSettingsService {
  /** True when `severity` is at or above `threshold` in the fraud ranking. */
  static severityAtLeast(severity: FraudSeverity, threshold: FraudSeverity): boolean {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
  }

  /**
   * Resolve the tenant's claim-control settings, applying defaults for any
   * absent or malformed key. Never throws on a bad config — a garbage value
   * falls back to its default so a mis-edited blob cannot break adjudication.
   */
  static async getClaimControls(tenantId: string): Promise<ClaimControlSettings> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    });
    return this.parseClaimControls(tenant?.config);
  }

  /** Pure parse+validate of a raw `Tenant.config` value (unit-testable). */
  static parseClaimControls(config: unknown): ClaimControlSettings {
    const claims =
      config && typeof config === "object" && "claims" in config
        ? (config as Record<string, unknown>).claims
        : undefined;
    const raw = (claims && typeof claims === "object" ? claims : {}) as Record<string, unknown>;

    const threshold = raw.fraudApprovalSeverityThreshold;
    const mode = raw.fraudApprovalGateMode;

    return {
      requireFraudClearanceBeforeApproval:
        typeof raw.requireFraudClearanceBeforeApproval === "boolean"
          ? raw.requireFraudClearanceBeforeApproval
          : CLAIM_CONTROL_DEFAULTS.requireFraudClearanceBeforeApproval,
      fraudApprovalSeverityThreshold:
        typeof threshold === "string" && VALID_SEVERITIES.has(threshold)
          ? (threshold as FraudSeverity)
          : CLAIM_CONTROL_DEFAULTS.fraudApprovalSeverityThreshold,
      fraudApprovalGateMode:
        typeof mode === "string" && VALID_GATE_MODES.has(mode as FraudApprovalGateMode)
          ? (mode as FraudApprovalGateMode)
          : CLAIM_CONTROL_DEFAULTS.fraudApprovalGateMode,
    };
  }

  /**
   * Merge a partial claim-control patch into `Tenant.config.claims`, preserving
   * every other config key, and write an audit entry capturing old→new. Returns
   * the fully-resolved settings after the change.
   */
  static async updateClaimControls(
    tenantId: string,
    patch: Partial<ClaimControlSettings>,
    actorId: string,
  ): Promise<ClaimControlSettings> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    });
    if (!tenant) throw new Error("Tenant not found");

    const before = this.parseClaimControls(tenant.config);
    const after: ClaimControlSettings = { ...before, ...sanitise(patch, before) };

    const baseConfig =
      tenant.config && typeof tenant.config === "object" && !Array.isArray(tenant.config)
        ? (tenant.config as Record<string, unknown>)
        : {};
    const nextConfig = { ...baseConfig, claims: { ...(baseConfig.claims as object), ...after } };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { config: nextConfig as Prisma.InputJsonValue },
    });

    // Audit the money-control change (old/new + actor). Written directly rather
    // than via writeAudit() so this is callable outside a request context.
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "TENANT_CLAIM_CONTROL_UPDATED",
        module: "SETTINGS",
        description:
          `Claim controls changed — ` +
          `fraud clearance gate ${before.requireFraudClearanceBeforeApproval ? "ON" : "OFF"}→${after.requireFraudClearanceBeforeApproval ? "ON" : "OFF"}, ` +
          `threshold ${before.fraudApprovalSeverityThreshold}→${after.fraudApprovalSeverityThreshold}, ` +
          `mode ${before.fraudApprovalGateMode}→${after.fraudApprovalGateMode}.`,
        metadata: {
          requireFraudClearanceBeforeApproval_old: before.requireFraudClearanceBeforeApproval,
          requireFraudClearanceBeforeApproval_new: after.requireFraudClearanceBeforeApproval,
          fraudApprovalSeverityThreshold_old: before.fraudApprovalSeverityThreshold,
          fraudApprovalSeverityThreshold_new: after.fraudApprovalSeverityThreshold,
          fraudApprovalGateMode_old: before.fraudApprovalGateMode,
          fraudApprovalGateMode_new: after.fraudApprovalGateMode,
        },
      },
    });

    return after;
  }
}

/** Drop keys whose values are the wrong type — keep the prior value for those. */
function sanitise(
  patch: Partial<ClaimControlSettings>,
  before: ClaimControlSettings,
): Partial<ClaimControlSettings> {
  const out: Partial<ClaimControlSettings> = {};
  if (typeof patch.requireFraudClearanceBeforeApproval === "boolean") {
    out.requireFraudClearanceBeforeApproval = patch.requireFraudClearanceBeforeApproval;
  }
  if (
    typeof patch.fraudApprovalSeverityThreshold === "string" &&
    VALID_SEVERITIES.has(patch.fraudApprovalSeverityThreshold)
  ) {
    out.fraudApprovalSeverityThreshold = patch.fraudApprovalSeverityThreshold;
  }
  if (
    typeof patch.fraudApprovalGateMode === "string" &&
    VALID_GATE_MODES.has(patch.fraudApprovalGateMode)
  ) {
    out.fraudApprovalGateMode = patch.fraudApprovalGateMode;
  }
  void before;
  return out;
}
