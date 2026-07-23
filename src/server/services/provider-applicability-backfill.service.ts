import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F1.9 — backfill provider ContractApplicability from a REVIEWED input
 * (GATED). The mechanism is fully built and tested here; a production --apply
 * only runs against network-operations signed-off input (spec F1.9 step 1).
 *
 * Rules the mechanism enforces so backfill never invents business facts:
 *  - every row must name an explicit clientId — there is NO "all clients"
 *    default (spec F1.9 test);
 *  - every referenced provider/contract/client/group/package must resolve, and
 *    the contract must belong to the provider and be ACTIVE;
 *  - apply is idempotent (an equivalent effective row is skipped, never duped);
 *  - rollback is additive RETIREMENT (isActive=false), never deletion.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface ReviewedApplicabilityRow {
  tenantId: string;
  providerId: string;
  contractId: string;
  clientId: string;
  groupId?: string | null;
  packageId?: string | null;
  inclusionType: "INCLUDE" | "EXCLUDE";
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
}

export type RowStatus =
  | "VALID" //          passes validation, not yet present → would insert
  | "ALREADY_EXISTS" // an equivalent effective row is already present → skip
  | "MISSING_CLIENT" // no explicit clientId (no "all clients" default allowed)
  | "INVALID_PROVIDER"
  | "INVALID_CONTRACT" // contract missing, wrong provider, or not ACTIVE
  | "INVALID_CLIENT"
  | "INVALID_GROUP"
  | "INVALID_PACKAGE"
  | "INVALID_INPUT"; //  bad inclusionType / effectiveFrom

export interface RowResult {
  index: number;
  status: RowStatus;
  reason?: string;
}

export interface BackfillReport {
  total: number;
  results: RowResult[];
  counts: Record<RowStatus, number>;
  applied: number; // rows actually written (0 on dry-run)
}

function emptyCounts(): Record<RowStatus, number> {
  return { VALID: 0, ALREADY_EXISTS: 0, MISSING_CLIENT: 0, INVALID_PROVIDER: 0, INVALID_CONTRACT: 0, INVALID_CLIENT: 0, INVALID_GROUP: 0, INVALID_PACKAGE: 0, INVALID_INPUT: 0 };
}

async function classifyRow(db: Db, r: ReviewedApplicabilityRow, now: Date): Promise<RowResult & { effectiveFrom?: Date; effectiveTo?: Date | null }> {
  if (!r.clientId) return { index: -1, status: "MISSING_CLIENT", reason: "row has no explicit clientId (no all-clients default allowed)" };
  if (r.inclusionType !== "INCLUDE" && r.inclusionType !== "EXCLUDE") return { index: -1, status: "INVALID_INPUT", reason: "inclusionType must be INCLUDE or EXCLUDE" };
  const effectiveFrom = new Date(r.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) return { index: -1, status: "INVALID_INPUT", reason: "invalid effectiveFrom" };
  const effectiveTo = r.effectiveTo == null ? null : new Date(r.effectiveTo);
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) return { index: -1, status: "INVALID_INPUT", reason: "invalid effectiveTo" };

  const provider = await db.provider.findFirst({ where: { id: r.providerId, tenantId: r.tenantId }, select: { id: true } });
  if (!provider) return { index: -1, status: "INVALID_PROVIDER", reason: "provider not in tenant" };

  const contract = await db.providerContract.findFirst({ where: { id: r.contractId, tenantId: r.tenantId, providerId: r.providerId }, select: { status: true } });
  if (!contract) return { index: -1, status: "INVALID_CONTRACT", reason: "contract missing or not owned by provider" };
  if (contract.status !== "ACTIVE") return { index: -1, status: "INVALID_CONTRACT", reason: `contract status is ${contract.status}, expected ACTIVE` };

  const client = await db.client.findUnique({ where: { id: r.clientId }, select: { id: true } });
  if (!client) return { index: -1, status: "INVALID_CLIENT", reason: "client not found" };

  if (r.groupId) {
    const group = await db.group.findFirst({ where: { id: r.groupId, clientId: r.clientId }, select: { id: true } });
    if (!group) return { index: -1, status: "INVALID_GROUP", reason: "group not found under this client" };
  }
  if (r.packageId) {
    const pkg = await db.package.findFirst({ where: { id: r.packageId, tenantId: r.tenantId }, select: { id: true } });
    if (!pkg) return { index: -1, status: "INVALID_PACKAGE", reason: "package not in tenant" };
  }

  const existing = await db.contractApplicability.findFirst({
    where: { contractId: r.contractId, clientId: r.clientId, groupId: r.groupId ?? null, inclusionType: r.inclusionType, isActive: true },
    select: { id: true },
  });
  if (existing) return { index: -1, status: "ALREADY_EXISTS", effectiveFrom, effectiveTo };

  return { index: -1, status: "VALID", effectiveFrom, effectiveTo };
}

export const ProviderApplicabilityBackfillService = {
  /** Validate every row and report classification. Writes nothing. */
  async dryRun(rows: ReviewedApplicabilityRow[], db: Db = prisma): Promise<BackfillReport> {
    const now = new Date();
    const counts = emptyCounts();
    const results: RowResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const c = await classifyRow(db, rows[i], now);
      counts[c.status]++;
      results.push({ index: i, status: c.status, reason: c.reason });
    }
    return { total: rows.length, results, counts, applied: 0 };
  },

  /** Apply the VALID rows idempotently, with audit. Non-valid rows are skipped. */
  async apply(rows: ReviewedApplicabilityRow[], actorId: string, db: Db = prisma): Promise<BackfillReport> {
    const now = new Date();
    const counts = emptyCounts();
    const results: RowResult[] = [];
    let applied = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const c = await classifyRow(db, r, now);
      counts[c.status]++;
      results.push({ index: i, status: c.status, reason: c.reason });
      if (c.status !== "VALID") continue;
      const row = await db.contractApplicability.create({
        data: { contractId: r.contractId, clientId: r.clientId, groupId: r.groupId ?? null, packageId: r.packageId ?? null, inclusionType: r.inclusionType, effectiveFrom: c.effectiveFrom!, effectiveTo: c.effectiveTo ?? null, isActive: true },
      });
      await db.auditLog.create({
        data: { userId: actorId, tenantId: r.tenantId, action: "PROVIDER_APPLICABILITY_BACKFILLED", module: "PROVIDERS", description: "Reviewed applicability rule added", entityType: "CONTRACT_APPLICABILITY", entityId: row.id, metadata: { providerId: r.providerId, contractId: r.contractId, clientId: r.clientId, groupId: r.groupId ?? null, inclusionType: r.inclusionType } },
      });
      applied++;
    }
    return { total: rows.length, results, counts, applied };
  },

  /**
   * Rollback = additive retirement (isActive=false), NEVER deletion. Retires the
   * applicability rows matching the given batch signature.
   */
  async retire(rows: ReviewedApplicabilityRow[], actorId: string, db: Db = prisma): Promise<{ retired: number }> {
    let retired = 0;
    for (const r of rows) {
      const res = await db.contractApplicability.updateMany({
        where: { contractId: r.contractId, clientId: r.clientId, groupId: r.groupId ?? null, inclusionType: r.inclusionType, isActive: true },
        data: { isActive: false },
      });
      if (res.count > 0) {
        retired += res.count;
        await db.auditLog.create({
          data: { userId: actorId, tenantId: r.tenantId, action: "PROVIDER_APPLICABILITY_RETIRED", module: "PROVIDERS", description: "Backfilled applicability rule retired (rollback)", entityType: "CONTRACT_APPLICABILITY", entityId: r.contractId, metadata: { providerId: r.providerId, clientId: r.clientId, inclusionType: r.inclusionType } },
        });
      }
    }
    return { retired };
  },
} as const;
