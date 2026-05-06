import { CommissionService } from "../services/commission.service";

export async function runCommissionReconciliationJob(period?: string) {
  const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
  console.info(`[commission-reconciliation] Reconciling broker commissions for ${targetPeriod}`);

  const result = await CommissionService.reconcilePayments({ period: targetPeriod });
  console.info(
    `[commission-reconciliation] Processed ${result.paymentsProcessed} payment(s), reconciled ${result.pendingReconciled} pending ledger entr${result.pendingReconciled === 1 ? "y" : "ies"}.`,
  );

  return result;
}

