import { prisma } from "@/lib/prisma";
import type { ProviderAccessContext } from "@/server/services/provider-access.service";
import { ProviderIntegrationConnectionAdmin, type ConnectionView } from "./connection-admin.service";
import { mapCaseServiceRecordV1, type CaseServiceRecordV1 } from "./mappers/case-service-v1";

/**
 * PNOS F9.9 — legacy HMS cutover support (the SAFE, buildable parts).
 *
 * The live legacy /api/v1/hms-batch route is deliberately LEFT UNTOUCHED — the
 * actual traffic flip is a pilot-sign-off-gated ops step. This service provides
 * the buildable, testable cutover safety mechanisms:
 *  - a REVIEWED-INPUT mapping from a legacy IntegrationConfig to a new provider
 *    connection (a human supplies the provider/branch the tenant-level config lacks);
 *  - a read-only SHADOW comparison that projects what the NEW rail would do for a
 *    batch WITHOUT mutating any domain data, so its outcome can be reconciled
 *    against the legacy apply BEFORE any flip;
 *  - a pure rollback-safe cutover-mode decision (default LEGACY).
 *
 * Stop (F9.9): no schema deletion; no legacy write path retired; no live flip.
 */

export type CutoverMode = "LEGACY" | "SHADOW" | "CONNECTION";

/**
 * Resolve the cutover mode from a flag value. Default (unset / false / unknown) is
 * LEGACY — so a mis-set or absent flag NEVER silently diverts live traffic. This is
 * the rollback-safe decision: flipping the flag back to false/unset restores LEGACY.
 */
export function resolveCutoverMode(flag: unknown): CutoverMode {
  if (flag === "CONNECTION" || flag === true) return "CONNECTION";
  if (flag === "SHADOW") return "SHADOW";
  return "LEGACY";
}

export interface ShadowOutcome {
  total: number;
  wouldApply: number;
  unmatched: number;
  rejected: number;
  perRecord: Array<{ index: number; outcome: "WOULD_APPLY" | "UNMATCHED" | "REJECTED"; reason?: string }>;
}

async function matchOpenCase(tenantId: string, providerId: string, providerBranchId: string, match: { caseNumber?: string; memberNumber?: string }) {
  const branch = providerBranchId ? { providerBranchId } : {};
  if (match.caseNumber) {
    return prisma.clinicalCase.findFirst({ where: { tenantId, caseNumber: match.caseNumber, providerId, status: { in: ["OPEN", "PENDING_CLOSURE"] }, ...branch }, select: { id: true } });
  }
  if (match.memberNumber) {
    const open = await prisma.clinicalCase.findMany({ where: { tenantId, providerId, status: { in: ["OPEN", "PENDING_CLOSURE"] }, member: { memberNumber: match.memberNumber }, ...branch }, select: { id: true }, take: 2 });
    return open.length === 1 ? open[0] : null;
  }
  return null;
}

export const LegacyHmsCutoverService = {
  resolveCutoverMode,

  /**
   * Reviewed-input mapping: create a DRAFT connection for the reviewer's provider
   * from a legacy IntegrationConfig's endpoint. The provider/branch come from the
   * reviewer's context (the tenant-level config has none) — anti-widening is the
   * F9.3 admin's (the provider is ctx.providerId, a branch must be held). GATED:
   * this is the reviewed migration mechanism; running it for real is an ops step.
   */
  async mapConfigToConnection(ctx: ProviderAccessContext, input: { configProvider: string; connectorType?: string; label?: string; providerBranchId?: string }): Promise<ConnectionView> {
    const config = await prisma.integrationConfig.findFirst({ where: { tenantId: ctx.tenantId, provider: input.configProvider }, select: { apiBaseUrl: true, provider: true } });
    return ProviderIntegrationConnectionAdmin.create(ctx, {
      label: input.label ?? `${config?.provider ?? input.configProvider} (migrated)`,
      connectorType: input.connectorType ?? "HMS_BATCH_V1",
      mode: config?.apiBaseUrl ? "BIDIRECTIONAL" : "PUSH",
      apiBaseUrl: config?.apiBaseUrl ?? null,
      providerBranchId: input.providerBranchId,
    });
  },

  /**
   * Read-only shadow projection: what the NEW rail (F9.5 mapper + matching) WOULD do
   * for this batch, WITHOUT any mutation. Used to reconcile against the legacy apply
   * before a flip. Matching/mapping is the divergence risk; both rails call the SAME
   * canonical CaseService at apply time, so a WOULD_APPLY here corresponds to a
   * legacy applied there.
   */
  async shadowCompare(tenantId: string, providerId: string, providerBranchId: string, entries: CaseServiceRecordV1[]): Promise<ShadowOutcome> {
    let wouldApply = 0, unmatched = 0, rejected = 0;
    const perRecord: ShadowOutcome["perRecord"] = [];
    for (let i = 0; i < entries.length; i++) {
      const mapped = mapCaseServiceRecordV1(entries[i]);
      if ("error" in mapped) {
        rejected++;
        perRecord.push({ index: i, outcome: "REJECTED", reason: mapped.error });
        continue;
      }
      const openCase = await matchOpenCase(tenantId, providerId, providerBranchId, mapped.match);
      if (!openCase) {
        unmatched++;
        perRecord.push({ index: i, outcome: "UNMATCHED" });
        continue;
      }
      wouldApply++;
      perRecord.push({ index: i, outcome: "WOULD_APPLY" });
    }
    return { total: entries.length, wouldApply, unmatched, rejected, perRecord };
  },
} as const;
