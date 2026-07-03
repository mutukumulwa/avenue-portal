import { prisma } from "@/lib/prisma";
import { ContractEngine } from "./engine";
import type { EngineClaimResult } from "./types";

// ─── CONTRACT ENGINE ADJUDICATION INTEGRATION (spec §8.3) ────────────────────
// Persists the engine's per-line decision provenance onto ClaimLine and the
// claim-level contract match onto Claim. Every adjudicated line stores
// contract/version/rule/reason (acceptance §16 Phase 2). This writes provenance
// only — it does NOT overwrite the human adjudicator's approvedAmount; the
// engine's payable lives in the dedicated contract fields for transparency and
// for the auto-adjudication gates (which are opt-in, see auto-adjudication).

export interface PersistOutcome {
  persisted: boolean;
  linesUpdated: number;
  result: EngineClaimResult | null;
}

export class ContractEngineIntegration {
  /**
   * Evaluate a claim and persist provenance. Safe to call after intake/
   * adjudication — never throws to the caller when `swallow` is set (default),
   * so it cannot lose a claim.
   */
  static async evaluateAndPersist(tenantId: string, claimId: string, opts: { swallow?: boolean } = {}): Promise<PersistOutcome> {
    const swallow = opts.swallow ?? true;
    try {
      const result = await ContractEngine.evaluateClaimById(tenantId, claimId);
      if (!result) return { persisted: false, linesUpdated: 0, result: null };

      // Resolve reason codes → ids for this tenant.
      const codes = new Set<string>();
      if (result.reasonCode) codes.add(result.reasonCode);
      for (const l of result.lines) if (l.reasonCode) codes.add(l.reasonCode);
      const reasonRows = codes.size
        ? await prisma.adjudicationReasonCode.findMany({ where: { tenantId, code: { in: [...codes] } }, select: { id: true, code: true } })
        : [];
      const reasonIdByCode = new Map(reasonRows.map(r => [r.code, r.id]));

      // Only real ClaimLines carry provenance; synthetic engine lines
      // (case-rate / package-*) are reflected in the claim-level fields.
      const realLineIds = new Set((await prisma.claimLine.findMany({ where: { claimId }, select: { id: true } })).map(l => l.id));

      let linesUpdated = 0;
      await prisma.$transaction(async tx => {
        for (const l of result.lines) {
          if (!realLineIds.has(l.lineId)) continue;
          await tx.claimLine.update({
            where: { id: l.lineId },
            data: {
              contractId: result.contractId,
              contractVersionId: result.contractVersionId,
              matchedRuleType: l.matchedRuleType,
              matchedRuleId: l.matchedRuleId,
              payableSource: l.payableSource,
              reasonCodeId: l.reasonCode ? reasonIdByCode.get(l.reasonCode) ?? null : null,
              contractedAmount: l.contractedAmount ?? null,
              shortfallAmount: l.shortfallAmount,
              disallowedAmount: l.disallowedAmount,
              memberLiability: l.memberLiability,
              payerLiability: l.payerLiability,
              providerWriteOff: l.providerWriteOff,
              externalRebateAmount: l.externalRebateAmount ?? null,
              quantityApproved: l.quantityApproved,
              ruleTrace: l.trace as never,
            },
          });
          linesUpdated++;
        }
        await tx.claim.update({
          where: { id: claimId },
          data: {
            contractId: result.contractId,
            contractVersionId: result.contractVersionId,
            contractFamilyIds: result.contractFamilyIds,
            assignedQueue: result.assignedQueue,
            avgCostPoolId: result.avgCostPoolTag,
          },
        });
      });

      return { persisted: true, linesUpdated, result };
    } catch (e) {
      if (!swallow) throw e;
      console.error(`[contract-engine] persist failed for claim ${claimId}:`, e);
      return { persisted: false, linesUpdated: 0, result: null };
    }
  }
}
