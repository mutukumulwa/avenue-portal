import { prisma } from "@/lib/prisma";
import { auditChainService } from "./audit-chain.service";
import { computeReconciliation } from "./contract-analytics.service";

// ─── AVERAGE-COST RECONCILIATION (spec §15.12 / §16 Phase 5) ─────────────────
// Computes the recovery for an average-cost pool over a period (Old Mutual
// 1.1-1.3) and persists it as a COMPUTED proposal. Posting is a finance
// maker-checker action: the approver must differ from the computer, and nothing
// is auto-settled.

export class ContractReconciliationService {
  /** Compute a recovery proposal for a pool over a period. */
  static async compute(
    tenantId: string,
    input: { poolId: string; contractId?: string; periodStart: Date; periodEnd: Date; agreedAverage: number; computedById?: string },
  ) {
    const claims = await prisma.claim.aggregate({
      where: {
        tenantId,
        avgCostPoolId: input.poolId,
        dateOfService: { gte: input.periodStart, lte: input.periodEnd },
      },
      _count: { _all: true },
      _sum: { billedAmount: true },
    });
    const claimCount = claims._count._all;
    const billedTotal = Number(claims._sum.billedAmount ?? 0);
    const { agreedTotal, recovery } = computeReconciliation(input.agreedAverage, claimCount, billedTotal);

    const recon = await prisma.contractReconciliation.create({
      data: {
        tenantId,
        contractId: input.contractId,
        poolId: input.poolId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        agreedAverage: input.agreedAverage,
        claimCount,
        agreedTotal,
        billedTotal,
        recovery,
        status: "COMPUTED",
        computedById: input.computedById,
      },
    });

    if (input.computedById) {
      await auditChainService.append({
        actorId: input.computedById,
        action: "RECONCILIATION:COMPUTED",
        module: "PROVIDER_CONTRACT",
        entityType: "ContractReconciliation",
        entityId: recon.id,
        payload: { poolId: input.poolId, claimCount, billedTotal, agreedTotal, recovery },
        tenantId,
        description: `Average-cost reconciliation for pool ${input.poolId}: recovery ${recovery.toLocaleString()}`,
      });
    }
    return recon;
  }

  /** Finance approval — maker ≠ checker (spec §16 Phase 5, §19). */
  static async approve(tenantId: string, reconciliationId: string, approverId: string) {
    const recon = await prisma.contractReconciliation.findUnique({ where: { id: reconciliationId, tenantId } });
    if (!recon) throw new Error("Reconciliation not found");
    if (recon.status !== "COMPUTED") throw new Error(`Reconciliation is ${recon.status}, not COMPUTED.`);
    if (recon.computedById && recon.computedById === approverId) {
      throw new Error("Segregation of duties: the approver cannot be the person who computed the reconciliation.");
    }
    const updated = await prisma.contractReconciliation.update({
      where: { id: reconciliationId },
      data: { status: "APPROVED", approvedById: approverId, approvedAt: new Date() },
    });
    await auditChainService.append({
      actorId: approverId,
      action: "RECONCILIATION:APPROVED",
      module: "PROVIDER_CONTRACT",
      entityType: "ContractReconciliation",
      entityId: reconciliationId,
      payload: { recovery: Number(recon.recovery) },
      tenantId,
      description: `Reconciliation ${reconciliationId} approved for settlement`,
    });
    return updated;
  }

  static async list(tenantId: string) {
    return prisma.contractReconciliation.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
