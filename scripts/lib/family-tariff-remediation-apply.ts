/**
 * Family Hospital UAT plan P01.02 — load, apply and roll back the tariff
 * remediation planned by `family-tariff-remediation-plan.ts`.
 *
 * Invariants (plan P01.02):
 *   - Nothing is ever deleted. Rows are deactivated (`isActive = false`);
 *     replacements are new rows.
 *   - The manifest a human reviewed is the manifest applied: the plan is
 *     recomputed inside the apply transaction from live rows and must hash to
 *     the reviewed `manifestHash`, or nothing is written.
 *   - Replacements validate before anything is deactivated, and the final state
 *     re-validates before commit. One transaction: all of it or none of it.
 *   - Idempotent: an `OperationReceipt` per batch; a rerun with the same batch
 *     reference is a replay that writes nothing, and replacement rows carry a
 *     fingerprint that is never created twice.
 *   - Rollback deactivates the batch's replacements and reactivates exactly the
 *     rows the batch deactivated (read from the batch's own audit rows).
 */
import { Prisma, type PrismaClient, type ProviderTariff } from "@prisma/client";
import { OperationReceiptService } from "../../src/server/services/operation-receipt.service";
import { loadCandidateTariffs, TariffResolutionIndex } from "../../src/server/services/contract-engine/tariff-selection";
import {
  planTariffRemediation,
  REMEDIATION_KIND,
  type RemediationManifest,
  type RemediationTariff,
} from "./family-tariff-remediation-plan";
import type { FamilyScope } from "./family-hospital-reviewed";

type Db = PrismaClient | Prisma.TransactionClient;

export const APPLY_OPERATION = "tariff.remediation.fh-p01-02.apply";
export const ROLLBACK_OPERATION = "tariff.remediation.fh-p01-02.rollback";
const AUDIT_CREATED = "TARIFF_REMEDIATION_CREATED";
const AUDIT_DEACTIVATED = "TARIFF_REMEDIATION_DEACTIVATED";
const AUDIT_APPLIED = "TARIFF_REMEDIATION_APPLIED";
const AUDIT_ROLLED_BACK = "TARIFF_REMEDIATION_ROLLED_BACK";

export class RemediationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "RemediationError";
  }
}

interface ContractTerms {
  id: string;
  contractNumber: string;
  currency: string;
  taxInclusive: string;
  status: string;
}

async function loadContract(db: Db, scope: FamilyScope): Promise<ContractTerms> {
  const c = await db.providerContract.findFirst({
    where: { id: scope.contractId, tenantId: scope.tenantId, providerId: scope.providerId },
    select: { id: true, contractNumber: true, currency: true, taxInclusive: true, status: true },
  });
  if (!c) throw new RemediationError("CONTRACT_NOT_FOUND", "The reviewed contract does not exist for this provider.");
  if (c.status !== "ACTIVE") throw new RemediationError("CONTRACT_NOT_ACTIVE", `Contract ${c.contractNumber} is ${c.status}.`);
  return { ...c, taxInclusive: String(c.taxInclusive) };
}

/** The payer the contract applies to — exactly one, or the context is ambiguous. */
async function loadClientId(db: Db, scope: FamilyScope): Promise<string> {
  const rows = await db.contractApplicability.findMany({
    where: { contractId: scope.contractId, isActive: true, inclusionType: "INCLUDE" },
    select: { clientId: true },
  });
  const ids = [...new Set(rows.map((r) => r.clientId))];
  if (ids.length !== 1) throw new RemediationError("PAYER_AMBIGUOUS", `Expected one INCLUDE payer, found ${ids.length}.`);
  return ids[0];
}

/** The engine's candidate set for the facility's context on `pricingDate`. */
export async function loadRemediationCandidates(db: Db, scope: FamilyScope, pricingDate: Date): Promise<ProviderTariff[]> {
  const clientId = await loadClientId(db, scope);
  return loadCandidateTariffs(db, {
    contractId: scope.contractId,
    pricingDate,
    providerBranchId: scope.branchId,
    clientId,
  });
}

export async function planForScope(db: Db, scope: FamilyScope, batchRef: string, pricingDate: Date): Promise<RemediationManifest> {
  const contract = await loadContract(db, scope);
  const candidates = await loadRemediationCandidates(db, scope, pricingDate);
  return planTariffRemediation({ batchRef, contractId: contract.id, currency: contract.currency, taxInclusive: contract.taxInclusive, candidates });
}

function assertClean(rows: RemediationTariff[], expectedLogical: number, stage: string): void {
  const index = new TariffResolutionIndex(rows);
  const verdicts = [...index.verdictMap().values()];
  const bad = verdicts.filter((v) => v.status !== "SELECTABLE").length;
  const collisions = index.textKeyGroups().length;
  const logical = verdicts.filter((v) => v.engineTariffId === v.tariffId).length;
  if (bad !== 0 || collisions !== 0 || logical !== expectedLogical) {
    throw new RemediationError(
      "VALIDATION_FAILED",
      `${stage}: ${bad} non-selectable row(s), ${collisions} description-key collision(s), ${logical} logical services (expected ${expectedLogical}).`,
    );
  }
}

export interface ApplyResult {
  status: "APPLIED" | "REPLAYED";
  receiptId: string;
  created: string[];
  deactivated: string[];
}

/** Marks an error as raised inside the transaction callback, i.e. rolled back. */
class RolledBack extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * Reserve the receipt OUTSIDE the business transaction (the established pattern,
 * src/app/(admin)/members/new/actions.ts): `reserve` resolves an existing key by
 * catching a unique violation, which inside a Postgres transaction would abort
 * the whole transaction. The business transaction then marks the receipt
 * SUCCEEDED atomically with its writes. An error thrown inside the callback is
 * known to have rolled back (receipt → FAILED, the batch may be retried); an
 * error at commit is recorded as UNKNOWN, which deliberately blocks a retry.
 */
async function withReceipt<T>(
  prisma: PrismaClient,
  reserve: Parameters<typeof OperationReceiptService.reserve>[0],
  onReplay: (receiptId: string) => T,
  work: (tx: Prisma.TransactionClient, receiptId: string) => Promise<T>,
): Promise<T> {
  const reservation = await OperationReceiptService.reserve(reserve, prisma);
  if (reservation.status === "REPLAY") return onReplay(reservation.receipt.id);
  if (reservation.status !== "RESERVED") {
    throw new RemediationError(`RECEIPT_${reservation.status}`, `${reserve.operationType} ${reserve.idempotencyKey} cannot run: receipt is ${reservation.status}.`);
  }
  const receiptId = reservation.receipt.id;
  try {
    return await prisma.$transaction(
      async (tx) => {
        try {
          return await work(tx, receiptId);
        } catch (err) {
          throw new RolledBack(err);
        }
      },
      { timeout: 180_000, maxWait: 30_000 },
    );
  } catch (err) {
    if (err instanceof RolledBack) {
      const code = err.cause instanceof RemediationError ? err.cause.code : "ROLLED_BACK";
      await OperationReceiptService.markFailed(receiptId, code, prisma).catch(() => undefined);
      throw err.cause;
    }
    await OperationReceiptService.markUnknown(receiptId, "COMMIT_OUTCOME_UNKNOWN", prisma).catch(() => undefined);
    throw err;
  }
}

/**
 * Apply the reviewed manifest. `expectedManifestHash` is the hash printed by the
 * dry run that a reviewer approved.
 */
export async function applyRemediation(
  prisma: PrismaClient,
  input: { scope: FamilyScope; batchRef: string; expectedManifestHash: string; operatorUserId: string; pricingDate: Date },
): Promise<ApplyResult> {
  const { scope, batchRef, expectedManifestHash, operatorUserId, pricingDate } = input;

  const operator = await prisma.user.findFirst({ where: { id: operatorUserId, tenantId: scope.tenantId, isActive: true }, select: { id: true } });
  if (!operator) throw new RemediationError("OPERATOR_UNKNOWN", "The operator must be an active user of this tenant.");

  return withReceipt<ApplyResult>(
    prisma,
    { tenantId: scope.tenantId, actorId: operatorUserId, operationType: APPLY_OPERATION, idempotencyKey: batchRef, request: { contractId: scope.contractId, manifestHash: expectedManifestHash } },
    (receiptId) => ({ status: "REPLAYED", receiptId, created: [], deactivated: [] }),
    async (tx, receiptId) => {
      // 1. The live plan must be exactly the reviewed plan.
      const manifest = await planForScope(tx, scope, batchRef, pricingDate);
      if (manifest.manifestHash !== expectedManifestHash) {
        throw new RemediationError("MANIFEST_CHANGED", `The database no longer matches the reviewed manifest (now ${manifest.manifestHash}).`);
      }
      if (manifest.totals.unresolvedGroups > 0) {
        throw new RemediationError("UNRESOLVED_GROUPS", `${manifest.totals.unresolvedGroups} group(s) need a human decision; nothing applied.`);
      }

      const candidates = await loadRemediationCandidates(tx, scope, pricingDate);
      const byId = new Map(candidates.map((t) => [t.id, t]));
      const created: string[] = [];

      // 2. Replacements first (idempotent on fingerprint).
      for (const group of manifest.groups) {
        for (const rep of group.replacements) {
          const existing = await tx.providerTariff.findFirst({
            where: { providerId: scope.providerId, sourceRef: { path: ["fingerprint"], equals: rep.fingerprint } },
            select: { id: true },
          });
          if (existing) continue;
          const from = byId.get(rep.supersedesId);
          if (!from) throw new RemediationError("SOURCE_ROW_MISSING", `Row ${rep.supersedesId} is no longer a candidate.`);
          const row = await tx.providerTariff.create({
            data: {
              providerId: from.providerId,
              contractId: from.contractId,
              versionId: from.versionId,
              branchId: from.branchId,
              clientId: from.clientId,
              cptCode: from.cptCode,
              serviceName: rep.serviceName,
              agreedRate: from.agreedRate,
              currency: from.currency,
              tariffType: from.tariffType,
              requiresPreauth: from.requiresPreauth,
              maxQuantityPerVisit: from.maxQuantityPerVisit,
              serviceCategoryId: from.serviceCategoryId,
              providerServiceCode: from.providerServiceCode,
              providerDescription: rep.providerDescription,
              standardDescription: from.standardDescription,
              codingSystem: from.codingSystem,
              rateType: from.rateType,
              discountPct: from.discountPct,
              markupPct: from.markupPct,
              maxPayableAmount: from.maxPayableAmount,
              minPayableAmount: from.minPayableAmount,
              unitOfMeasure: from.unitOfMeasure,
              quantityLimit: from.quantityLimit,
              frequencyLimit: from.frequencyLimit,
              frequencyPeriod: from.frequencyPeriod,
              genderRestriction: from.genderRestriction,
              ageMin: from.ageMin,
              ageMax: from.ageMax,
              diagnosisRestriction: from.diagnosisRestriction === null ? Prisma.DbNull : (from.diagnosisRestriction as Prisma.InputJsonValue),
              requiresReferral: from.requiresReferral,
              rateMissing: from.rateMissing,
              externalScheme: from.externalScheme,
              externalRebateAmount: from.externalRebateAmount,
              notes: from.notes,
              effectiveFrom: from.effectiveFrom,
              effectiveTo: from.effectiveTo,
              isActive: true,
              sourceRef: {
                kind: REMEDIATION_KIND,
                batchRef,
                fingerprint: rep.fingerprint,
                supersedes: [from.id],
                disposition: group.disposition,
                manifestHash: manifest.manifestHash,
                original: { serviceName: from.serviceName, providerDescription: from.providerDescription, notes: from.notes },
              },
            },
            select: { id: true },
          });
          created.push(row.id);
          await tx.auditLog.create({
            data: {
              userId: operatorUserId,
              tenantId: scope.tenantId,
              action: AUDIT_CREATED,
              module: "PROVIDERS",
              entityType: "ProviderTariff",
              entityId: row.id,
              description: `P01.02 ${group.disposition}: replacement for ${from.id} (batch ${batchRef})`,
              metadata: { batchRef, disposition: group.disposition, supersedes: from.id, manifestHash: manifest.manifestHash },
            },
          });
        }
      }

      // 3. Validate the replacement batch BEFORE deactivating anything: every
      //    replacement present, active, same price as the row it supersedes.
      const withReplacements = await loadRemediationCandidates(tx, scope, pricingDate);
      const live = new Map(withReplacements.map((t) => [t.id, t]));
      for (const group of manifest.groups) {
        for (const rep of group.replacements) {
          const row = withReplacements.find((t) => (t.sourceRef as { fingerprint?: string } | null)?.fingerprint === rep.fingerprint);
          const from = byId.get(rep.supersedesId)!;
          if (!row || !row.agreedRate.equals(from.agreedRate) || row.currency !== from.currency || row.serviceName !== rep.serviceName) {
            throw new RemediationError("REPLACEMENT_INVALID", `Replacement for ${rep.supersedesId} did not validate.`);
          }
        }
      }

      // 4. Deactivate (never delete).
      const deactivateIds = manifest.groups.flatMap((g) => g.deactivateIds).filter((id) => live.get(id)?.isActive);
      for (const group of manifest.groups) {
        for (const id of group.deactivateIds) {
          if (!deactivateIds.includes(id)) continue;
          await tx.providerTariff.update({ where: { id }, data: { isActive: false } });
          await tx.auditLog.create({
            data: {
              userId: operatorUserId,
              tenantId: scope.tenantId,
              action: AUDIT_DEACTIVATED,
              module: "PROVIDERS",
              entityType: "ProviderTariff",
              entityId: id,
              description: `P01.02 ${group.disposition}: deactivated (batch ${batchRef})`,
              metadata: { batchRef, disposition: group.disposition, groupKey: group.key, manifestHash: manifest.manifestHash },
            },
          });
        }
      }

      // 5. The final state must be clean before commit.
      const after = await loadRemediationCandidates(tx, scope, pricingDate);
      assertClean(after, manifest.totals.logicalServicesAfter, "post-apply state");

      await tx.auditLog.create({
        data: {
          userId: operatorUserId,
          tenantId: scope.tenantId,
          action: AUDIT_APPLIED,
          module: "PROVIDERS",
          entityType: "ProviderContract",
          entityId: scope.contractId,
          description: `P01.02 tariff remediation applied (batch ${batchRef}): ${created.length} created, ${deactivateIds.length} deactivated`,
          metadata: { batchRef, manifestHash: manifest.manifestHash, created: created.length, deactivated: deactivateIds.length, activeAfter: after.length },
        },
      });
      await OperationReceiptService.succeed(receiptId, { entityType: "ProviderContract", entityId: scope.contractId, resultCode: "APPLIED" }, tx);
      return { status: "APPLIED" as const, receiptId, created, deactivated: deactivateIds };
    },
  );
}

export interface RollbackResult {
  status: "ROLLED_BACK" | "REPLAYED";
  receiptId: string;
  deactivatedReplacements: string[];
  reactivated: string[];
}

/** Undo one applied batch: deactivate its replacements, reactivate what it deactivated. */
export async function rollbackRemediation(
  prisma: PrismaClient,
  input: { scope: FamilyScope; batchRef: string; operatorUserId: string },
): Promise<RollbackResult> {
  const { scope, batchRef, operatorUserId } = input;
  const operator = await prisma.user.findFirst({ where: { id: operatorUserId, tenantId: scope.tenantId, isActive: true }, select: { id: true } });
  if (!operator) throw new RemediationError("OPERATOR_UNKNOWN", "The operator must be an active user of this tenant.");

  return withReceipt<RollbackResult>(
    prisma,
    { tenantId: scope.tenantId, actorId: operatorUserId, operationType: ROLLBACK_OPERATION, idempotencyKey: batchRef, request: { contractId: scope.contractId, batchRef } },
    (receiptId) => ({ status: "REPLAYED", receiptId, deactivatedReplacements: [], reactivated: [] }),
    async (tx, receiptId) => {
      const batchAudit = await tx.auditLog.findMany({
        where: { tenantId: scope.tenantId, action: { in: [AUDIT_CREATED, AUDIT_DEACTIVATED] }, metadata: { path: ["batchRef"], equals: batchRef } },
        select: { action: true, entityId: true },
      });
      if (batchAudit.length === 0) throw new RemediationError("BATCH_NOT_FOUND", `No applied batch ${batchRef} to roll back.`);
      const createdIds = batchAudit.filter((a) => a.action === AUDIT_CREATED).map((a) => a.entityId!);
      const deactivatedIds = batchAudit.filter((a) => a.action === AUDIT_DEACTIVATED).map((a) => a.entityId!);

      const turnedOff = await tx.providerTariff.updateMany({ where: { id: { in: createdIds }, providerId: scope.providerId, isActive: true }, data: { isActive: false } });
      const turnedOn = await tx.providerTariff.updateMany({ where: { id: { in: deactivatedIds }, providerId: scope.providerId, isActive: false }, data: { isActive: true } });
      // Exactly the batch's rows, or nothing: a state someone changed by hand
      // since the apply is a reason to stop, not to half-restore.
      if (turnedOff.count !== createdIds.length || turnedOn.count !== deactivatedIds.length) {
        throw new RemediationError(
          "ROLLBACK_STATE_DRIFTED",
          `Expected to deactivate ${createdIds.length} and reactivate ${deactivatedIds.length}; found ${turnedOff.count} and ${turnedOn.count} in the expected state.`,
        );
      }
      for (const [id, what] of [...createdIds.map((id) => [id, "replacement deactivated"]), ...deactivatedIds.map((id) => [id, "prior row reactivated"])]) {
        await tx.auditLog.create({
          data: {
            userId: operatorUserId,
            tenantId: scope.tenantId,
            action: AUDIT_ROLLED_BACK,
            module: "PROVIDERS",
            entityType: "ProviderTariff",
            entityId: id,
            description: `P01.02 rollback of batch ${batchRef}: ${what}`,
            metadata: { batchRef, effect: what },
          },
        });
      }
      await OperationReceiptService.succeed(
        receiptId,
        { entityType: "ProviderContract", entityId: scope.contractId, resultCode: `ROLLED_BACK:${turnedOff.count}/${turnedOn.count}` },
        tx,
      );
      return { status: "ROLLED_BACK" as const, receiptId, deactivatedReplacements: createdIds, reactivated: deactivatedIds };
    },
  );
}
