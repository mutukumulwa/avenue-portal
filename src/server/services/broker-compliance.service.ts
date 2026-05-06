import { prisma } from "@/lib/prisma";

export type BrokerComplianceSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type BrokerComplianceFlag = {
  code: string;
  title: string;
  severity: BrokerComplianceSeverity;
  notes: string;
  count?: number;
};

const REGULATED_KYC_TYPES = ["IRA_LICENSE", "KRA_PIN_CERTIFICATE", "BANK_CONFIRMATION"] as const;
const PAYOUT_KYC_TYPES = ["KRA_PIN_CERTIFICATE", "BANK_CONFIRMATION"] as const;
const REFERRAL_KYC_TYPES = ["KRA_PIN_CERTIFICATE", "BANK_CONFIRMATION", "REFERRAL_AGREEMENT"] as const;

export class BrokerComplianceService {
  static async evaluateBroker(brokerId: string, tenantId: string): Promise<BrokerComplianceFlag[]> {
    const broker = await prisma.broker.findUnique({
      where: { id: brokerId, tenantId },
      include: {
        groups: { select: { id: true, name: true, status: true } },
        kycDocuments: { select: { documentType: true, status: true, expiresAt: true } },
        commissionLedger: {
          select: {
            id: true,
            state: true,
            contributionReceiptId: true,
            earnedPeriodStart: true,
            scheduleId: true,
            netPayable: true,
          },
        },
      },
    });

    if (!broker) return [];

    const flags: BrokerComplianceFlag[] = [];
    const now = new Date();
    const fortyFiveDaysFromNow = new Date(now);
    fortyFiveDaysFromNow.setDate(fortyFiveDaysFromNow.getDate() + 45);

    if (broker.requiresIraRegistration && !broker.licenseNumber) {
      flags.push({
        code: "SOURCE-KYC-001",
        title: "Missing IRA license number",
        severity: "HIGH",
        notes: "This business source is marked as IRA-regulated but has no IRA license number captured.",
      });
    }

    if (broker.requiresIraRegistration && broker.iraExpiryDate && broker.iraExpiryDate < now) {
      flags.push({
        code: "SOURCE-KYC-002",
        title: "Expired IRA license",
        severity: "CRITICAL",
        notes: `IRA license expired on ${broker.iraExpiryDate.toISOString().slice(0, 10)}.`,
      });
    } else if (broker.requiresIraRegistration && broker.iraExpiryDate && broker.iraExpiryDate <= fortyFiveDaysFromNow) {
      flags.push({
        code: "SOURCE-KYC-003",
        title: "IRA license expiring soon",
        severity: "MEDIUM",
        notes: `IRA license expires on ${broker.iraExpiryDate.toISOString().slice(0, 10)}.`,
      });
    }

    const verifiedKycTypes = new Set(
      broker.kycDocuments
        .filter(doc => doc.status === "VERIFIED")
        .map(doc => doc.documentType),
    );
    const requiredKycTypes = broker.requiresIraRegistration
      ? REGULATED_KYC_TYPES
      : broker.commissionBasis === "REFERRAL_FEE"
        ? REFERRAL_KYC_TYPES
        : broker.canReceiveCommission
          ? PAYOUT_KYC_TYPES
          : [];
    const missingKyc = requiredKycTypes.filter(type => !verifiedKycTypes.has(type));
    if (missingKyc.length > 0) {
      flags.push({
        code: "SOURCE-KYC-004",
        title: "Missing required verified KYC",
        severity: "HIGH",
        notes: `Missing verified documents: ${missingKyc.map(type => type.replaceAll("_", " ")).join(", ")}.`,
        count: missingKyc.length,
      });
    }

    const expiredKycDocs = broker.kycDocuments.filter(doc => doc.expiresAt && doc.expiresAt < now);
    if (expiredKycDocs.length > 0) {
      flags.push({
        code: "SOURCE-KYC-005",
        title: "Expired KYC documents",
        severity: "HIGH",
        notes: `${expiredKycDocs.length} KYC document${expiredKycDocs.length === 1 ? "" : "s"} expired.`,
        count: expiredKycDocs.length,
      });
    }

    const activeGroups = broker.groups.filter(group => group.status === "ACTIVE");
    if (broker.status !== "ACTIVE" && activeGroups.length > 0) {
      flags.push({
        code: "SOURCE-OPS-001",
        title: "Inactive source with active schemes",
        severity: "CRITICAL",
        notes: `${activeGroups.length} active scheme${activeGroups.length === 1 ? "" : "s"} remain assigned to an inactive business source.`,
        count: activeGroups.length,
      });
    }

    if (!broker.canReceiveCommission && broker.commissionLedger.some(entry => Number(entry.netPayable) > 0)) {
      flags.push({
        code: "SOURCE-COMM-000",
        title: "Non-payable source has payable ledger entries",
        severity: "CRITICAL",
        notes: "This source is marked attribution-only/non-payable but has positive ledger amounts.",
      });
    }

    const pendingReconciliation = broker.commissionLedger.filter(entry => entry.state === "PENDING_RECONCILIATION");
    if (pendingReconciliation.length > 0) {
      flags.push({
        code: "SOURCE-COMM-001",
        title: "Pending commission reconciliation",
        severity: "MEDIUM",
        notes: `${pendingReconciliation.length} ledger entr${pendingReconciliation.length === 1 ? "y is" : "ies are"} waiting for schedule reconciliation.`,
        count: pendingReconciliation.length,
      });
    }

    const orphanScheduleEntries = broker.commissionLedger.filter(entry =>
      ["EARNED", "ACCRUED", "PAYABLE", "PAID"].includes(entry.state) && !entry.scheduleId,
    );
    if (orphanScheduleEntries.length > 0) {
      flags.push({
        code: "SOURCE-COMM-002",
        title: "Commission entries without schedules",
        severity: "HIGH",
        notes: `${orphanScheduleEntries.length} non-pending ledger entr${orphanScheduleEntries.length === 1 ? "y has" : "ies have"} no schedule attached.`,
        count: orphanScheduleEntries.length,
      });
    }

    const receiptCounts = new Map<string, number>();
    for (const entry of broker.commissionLedger) {
      if (!entry.contributionReceiptId) continue;
      receiptCounts.set(entry.contributionReceiptId, (receiptCounts.get(entry.contributionReceiptId) ?? 0) + 1);
    }
    const duplicateReceiptCount = Array.from(receiptCounts.values()).filter(count => count > 1).length;
    if (duplicateReceiptCount > 0) {
      flags.push({
        code: "SOURCE-COMM-003",
        title: "Duplicate contribution receipt commissions",
        severity: "HIGH",
        notes: `${duplicateReceiptCount} contribution receipt${duplicateReceiptCount === 1 ? "" : "s"} appear more than once in this broker's ledger.`,
        count: duplicateReceiptCount,
      });
    }

    return flags.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }
}

function severityRank(severity: BrokerComplianceSeverity) {
  switch (severity) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    default:
      return 1;
  }
}
