import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F1.8 — provider contract/applicability readiness report (READ-ONLY).
 *
 * Deny-by-default entitlement (D3) may only be activated after the applicability
 * data is proven complete. This service classifies every active provider's
 * contract + ContractApplicability state so network operations can review and
 * sign off (F1.9 backfill / F1.11 enforcement gate). It mutates NOTHING and is
 * rerunnable; it produces safe repair input, never automatic assumptions.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type ApplicabilityClassification =
  | "COMPLETE" //             active contract + effective INCLUDE applicability
  | "MISSING_APPLICABILITY" // active contract but NO effective INCLUDE rule (the common D3 gap)
  | "NO_ACTIVE_CONTRACT" //   provider active but every contract is expired/future/none
  | "CONTRADICTORY" //        same client/group carries both INCLUDE and EXCLUDE
  | "ORPHANED_RULES" //       applicability references a missing client
  | "INACTIVE_PROVIDER"; //   provider itself is not ACTIVE — out of gate scope

export interface ProviderReadinessSummary {
  providerContractStatus: string;
  activeContracts: number;
  expiredContracts: number;
  futureContracts: number;
  effectiveIncludeRules: number;
  effectiveExcludeRules: number;
  contradictions: number;
  orphanRules: number;
}

/**
 * Pure classifier — deterministic, unit-testable. Priority order matters:
 * data defects (orphan/contradiction) are surfaced before the "missing" verdict.
 */
export function classifyApplicability(s: ProviderReadinessSummary): ApplicabilityClassification {
  if (s.providerContractStatus !== "ACTIVE") return "INACTIVE_PROVIDER";
  if (s.orphanRules > 0) return "ORPHANED_RULES";
  if (s.contradictions > 0) return "CONTRADICTORY";
  if (s.activeContracts === 0) return "NO_ACTIVE_CONTRACT";
  if (s.effectiveIncludeRules === 0) return "MISSING_APPLICABILITY";
  return "COMPLETE";
}

export interface ProviderReadinessRow extends ProviderReadinessSummary {
  providerId: string;
  providerName: string;
  tenantId: string;
  classification: ApplicabilityClassification;
}

export interface ReadinessReport {
  generatedFor: { tenantId?: string };
  rows: ProviderReadinessRow[];
  totals: Record<ApplicabilityClassification, number>;
  gateReady: boolean; // true only when every active provider is COMPLETE
}

export const ProviderApplicabilityReadinessService = {
  classify: classifyApplicability,

  /** Build the readiness report. Read-only. Optionally scoped to one tenant. */
  async report(opts: { tenantId?: string } = {}, db: Db = prisma): Promise<ReadinessReport> {
    const now = new Date();
    const providers = await db.provider.findMany({
      where: { ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
      select: { id: true, name: true, tenantId: true, contractStatus: true },
      orderBy: [{ tenantId: "asc" }, { name: "asc" }],
    });

    const rows: ProviderReadinessRow[] = [];
    for (const p of providers) {
      const contracts = await db.providerContract.findMany({
        where: { providerId: p.id, tenantId: p.tenantId },
        select: { id: true, status: true, startDate: true, endDate: true },
      });
      const isActiveContract = (c: { status: string; startDate: Date; endDate: Date }) =>
        c.status === "ACTIVE" && c.startDate <= now && c.endDate >= now;
      const activeContracts = contracts.filter(isActiveContract);
      const expiredContracts = contracts.filter((c) => c.status === "EXPIRED" || c.endDate < now).length;
      const futureContracts = contracts.filter((c) => c.startDate > now || c.status === "APPROVED").length;

      // Effective applicability on the provider's ACTIVE contracts only.
      const activeIds = activeContracts.map((c) => c.id);
      const applic = activeIds.length
        ? await db.contractApplicability.findMany({
            where: {
              contractId: { in: activeIds }, isActive: true,
              effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            select: { clientId: true, groupId: true, inclusionType: true },
          })
        : [];
      const includeRules = applic.filter((a) => a.inclusionType === "INCLUDE");
      const excludeRules = applic.filter((a) => a.inclusionType === "EXCLUDE");

      // Contradiction: a (client, group) key with BOTH include and exclude.
      const key = (a: { clientId: string; groupId: string | null }) => `${a.clientId}:${a.groupId ?? "*"}`;
      const incKeys = new Set(includeRules.map(key));
      const contradictions = new Set(excludeRules.map(key).filter((k) => incKeys.has(k))).size;

      // Orphan: applicability referencing a client id that does not resolve.
      const clientIds = [...new Set(applic.map((a) => a.clientId))];
      const existing = clientIds.length
        ? await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true } })
        : [];
      const existingSet = new Set(existing.map((c) => c.id));
      const orphanRules = applic.filter((a) => !existingSet.has(a.clientId)).length;

      const summary: ProviderReadinessSummary = {
        providerContractStatus: p.contractStatus,
        activeContracts: activeContracts.length,
        expiredContracts, futureContracts,
        effectiveIncludeRules: includeRules.length,
        effectiveExcludeRules: excludeRules.length,
        contradictions, orphanRules,
      };
      rows.push({ providerId: p.id, providerName: p.name, tenantId: p.tenantId, ...summary, classification: classifyApplicability(summary) });
    }

    const totals = rows.reduce((acc, r) => {
      acc[r.classification] = (acc[r.classification] ?? 0) + 1;
      return acc;
    }, {} as Record<ApplicabilityClassification, number>);

    // The gate is ready only when every ACTIVE provider is COMPLETE.
    const gateReady = rows.filter((r) => r.classification !== "INACTIVE_PROVIDER").every((r) => r.classification === "COMPLETE");

    return { generatedFor: { tenantId: opts.tenantId }, rows, totals, gateReady };
  },
} as const;
