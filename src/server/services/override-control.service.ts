import { prisma } from "@/lib/prisma";

// OverrideControl governance defaults (spec §9.3). Ships conservative: every
// contract-claims override is one-off, dual approval kicks in at KES 100,000
// financial impact, payer is notified on the two provider-payment-impacting
// types, and only the two designated types may create reusable automation.

const DUAL_APPROVAL_THRESHOLD = 100_000;

// The digital-contract claims override types (spec §9.1) and their governance.
const CONTRACT_OVERRIDE_TYPES: Array<{
  overrideType: string;
  notifyPayer?: boolean;
  updatesAutomation?: boolean;
  createsContractReviewTask?: boolean;
  maxFinancialImpact?: number;
}> = [
  { overrideType: "PAY_MISSING_RATE" },
  { overrideType: "PAY_ABOVE_CONTRACT_RATE", notifyPayer: true },
  { overrideType: "PAY_DESPITE_EXPIRED_CONTRACT", notifyPayer: true },
  { overrideType: "PAY_DESPITE_MISSING_PREAUTH" },
  { overrideType: "PAY_DESPITE_MISSING_DOCS" },
  { overrideType: "PAY_DESPITE_LATE_SUBMISSION" },
  { overrideType: "APPLY_ALTERNATIVE_TARIFF" },
  { overrideType: "APPLY_PACKAGE_MANUALLY" },
  { overrideType: "SPLIT_CLAIM_LINE" },
  { overrideType: "RECLASSIFY_SERVICE_CATEGORY" },
  { overrideType: "MAP_SERVICE_TO_TARIFF", updatesAutomation: true },
  { overrideType: "CREATE_TEMPORARY_RATE", updatesAutomation: true, createsContractReviewTask: true },
  { overrideType: "ESCALATE_TO_CONTRACT_TEAM" },
  { overrideType: "ESCALATE_TO_PAYER", notifyPayer: true },
  { overrideType: "ESCALATE_TO_MEDICAL_REVIEW" },
  { overrideType: "CONTRACT_BACKDATE" },
];

export class OverrideControlService {
  /** Idempotent per-tenant seed of the conservative override-control defaults. */
  static async seedForTenant(tenantId: string) {
    for (const t of CONTRACT_OVERRIDE_TYPES) {
      await prisma.overrideControl.upsert({
        where: { tenantId_overrideType: { tenantId, overrideType: t.overrideType } },
        create: {
          tenantId,
          overrideType: t.overrideType,
          allowed: true,
          dualApprovalThreshold: DUAL_APPROVAL_THRESHOLD,
          maxFinancialImpact: t.maxFinancialImpact,
          reasonCodeRequired: true,
          justificationMinLength: 20,
          notifyPayer: t.notifyPayer ?? false,
          updatesAutomation: t.updatesAutomation ?? false,
          createsContractReviewTask: t.createsContractReviewTask ?? false,
        },
        update: {
          dualApprovalThreshold: DUAL_APPROVAL_THRESHOLD,
          notifyPayer: t.notifyPayer ?? false,
          updatesAutomation: t.updatesAutomation ?? false,
          createsContractReviewTask: t.createsContractReviewTask ?? false,
        },
      });
    }
    return CONTRACT_OVERRIDE_TYPES.length;
  }

  static async resolve(tenantId: string, overrideType: string) {
    return prisma.overrideControl.findUnique({ where: { tenantId_overrideType: { tenantId, overrideType } } });
  }
}
