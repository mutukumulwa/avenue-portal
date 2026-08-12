-- Broker Command Center foundation.
-- Compatibility-preserving: existing Broker and Commission records remain valid.

CREATE TYPE "BrokerType" AS ENUM ('MASTER_BROKER', 'SUB_AGENT', 'TIED_AGENT', 'INDIVIDUAL_PRODUCER', 'BANCASSURANCE');
CREATE TYPE "KycDocumentType" AS ENUM ('IRA_LICENSE', 'KRA_PIN_CERTIFICATE', 'CR12', 'PROFESSIONAL_INDEMNITY', 'BANK_CONFIRMATION', 'DIRECTORS_ID', 'TAX_COMPLIANCE_CERTIFICATE', 'OTHER');
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "CommissionScheduleType" AS ENUM ('FLAT_PERCENTAGE', 'TIERED_VOLUME', 'TIERED_LOSS_RATIO', 'HYBRID_FLAT_PLUS_OVERRIDE', 'PERFORMANCE_LINKED');
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED');
CREATE TYPE "TierMetric" AS ENUM ('GROSS_CONTRIBUTION_BAND', 'MEMBER_COUNT_BAND', 'LOSS_RATIO_BAND', 'RENEWAL_RETENTION_BAND');
CREATE TYPE "CommissionState" AS ENUM ('PENDING_RECONCILIATION', 'EARNED', 'ACCRUED', 'PAYABLE', 'PAID', 'CLAWED_BACK', 'ON_HOLD');
CREATE TYPE "PayoutBatchStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'PARTIAL_FAILURE');

ALTER TABLE "Broker"
  ADD COLUMN "brokerCode" TEXT,
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "tradingName" TEXT,
  ADD COLUMN "brokerType" "BrokerType" NOT NULL DEFAULT 'MASTER_BROKER',
  ADD COLUMN "parentBrokerId" TEXT,
  ADD COLUMN "iraExpiryDate" TIMESTAMP(3),
  ADD COLUMN "kraPin" TEXT,
  ADD COLUMN "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vatNumber" TEXT,
  ADD COLUMN "bankAccountReference" TEXT,
  ADD COLUMN "mpesaPaybillNumber" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "Broker"
SET
  "legalName" = COALESCE("legalName", "name"),
  "brokerCode" = COALESCE("brokerCode", 'BRK-' || upper(substr("id", 1, 8)));

CREATE UNIQUE INDEX "Broker_brokerCode_key" ON "Broker"("brokerCode");
CREATE INDEX "Broker_tenantId_status_idx" ON "Broker"("tenantId", "status");
CREATE INDEX "Broker_status_effectiveFrom_effectiveTo_idx" ON "Broker"("status", "effectiveFrom", "effectiveTo");
CREATE INDEX "Broker_parentBrokerId_idx" ON "Broker"("parentBrokerId");

ALTER TABLE "Broker"
  ADD CONSTRAINT "Broker_parentBrokerId_fkey"
  FOREIGN KEY ("parentBrokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BrokerKycDocument" (
  "id" TEXT NOT NULL,
  "brokerId" TEXT NOT NULL,
  "documentType" "KycDocumentType" NOT NULL,
  "fileUri" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedById" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "expiresAt" TIMESTAMP(3),
  "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "notes" TEXT,
  CONSTRAINT "BrokerKycDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrokerProducer" (
  "id" TEXT NOT NULL,
  "brokerId" TEXT NOT NULL,
  "producerName" TEXT NOT NULL,
  "producerCode" TEXT NOT NULL,
  "iraIndividualNumber" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrokerProducer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_ProducerSchemes" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "BrokerCommissionSchedule" (
  "id" TEXT NOT NULL,
  "brokerId" TEXT NOT NULL,
  "scheduleName" TEXT NOT NULL,
  "scheduleType" "CommissionScheduleType" NOT NULL,
  "packageId" TEXT,
  "groupId" TEXT,
  "clientType" "ClientType",
  "newBusinessRate" DECIMAL(8,5) NOT NULL,
  "renewalRate" DECIMAL(8,5) NOT NULL,
  "overrideRate" DECIMAL(8,5),
  "grossCommissionCeiling" DECIMAL(8,5),
  "payoutCycleDays" INTEGER NOT NULL DEFAULT 30,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrokerCommissionSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionTier" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "tierOrder" INTEGER NOT NULL,
  "thresholdMetric" "TierMetric" NOT NULL,
  "thresholdMin" DECIMAL(18,2) NOT NULL,
  "thresholdMax" DECIMAL(18,2),
  "rate" DECIMAL(8,5) NOT NULL,
  CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionLedgerEntry" (
  "id" TEXT NOT NULL,
  "brokerId" TEXT NOT NULL,
  "scheduleId" TEXT,
  "groupId" TEXT NOT NULL,
  "contributionReceiptId" TEXT,
  "membershipId" TEXT,
  "state" "CommissionState" NOT NULL,
  "stateAsOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grossCommission" DECIMAL(18,2) NOT NULL,
  "withholdingTax" DECIMAL(18,2) NOT NULL,
  "vatAmount" DECIMAL(18,2) NOT NULL,
  "iraAgentLevy" DECIMAL(18,2) NOT NULL,
  "netPayable" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "earnedPeriodStart" TIMESTAMP(3) NOT NULL,
  "earnedPeriodEnd" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "paymentReference" TEXT,
  "payoutBatchId" TEXT,
  "clawbackParentId" TEXT,
  "clawbackReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionPayoutBatch" (
  "id" TEXT NOT NULL,
  "batchReference" TEXT NOT NULL,
  "batchDate" TIMESTAMP(3) NOT NULL,
  "totalGross" DECIMAL(18,2) NOT NULL,
  "totalWHT" DECIMAL(18,2) NOT NULL,
  "totalVAT" DECIMAL(18,2) NOT NULL,
  "totalLevy" DECIMAL(18,2) NOT NULL,
  "totalNet" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "status" "PayoutBatchStatus" NOT NULL,
  "generatedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "disbursedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionPayoutBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrokerProducer_producerCode_key" ON "BrokerProducer"("producerCode");
CREATE UNIQUE INDEX "_ProducerSchemes_AB_unique" ON "_ProducerSchemes"("A", "B");
CREATE INDEX "_ProducerSchemes_B_index" ON "_ProducerSchemes"("B");
CREATE UNIQUE INDEX "CommissionPayoutBatch_batchReference_key" ON "CommissionPayoutBatch"("batchReference");

CREATE INDEX "BrokerKycDocument_brokerId_documentType_idx" ON "BrokerKycDocument"("brokerId", "documentType");
CREATE INDEX "BrokerKycDocument_status_expiresAt_idx" ON "BrokerKycDocument"("status", "expiresAt");
CREATE INDEX "BrokerProducer_brokerId_status_idx" ON "BrokerProducer"("brokerId", "status");
CREATE INDEX "BrokerCommissionSchedule_brokerId_effectiveFrom_effectiveTo_idx" ON "BrokerCommissionSchedule"("brokerId", "effectiveFrom", "effectiveTo");
CREATE INDEX "BrokerCommissionSchedule_brokerId_status_idx" ON "BrokerCommissionSchedule"("brokerId", "status");
CREATE INDEX "BrokerCommissionSchedule_groupId_idx" ON "BrokerCommissionSchedule"("groupId");
CREATE INDEX "BrokerCommissionSchedule_packageId_idx" ON "BrokerCommissionSchedule"("packageId");
CREATE INDEX "CommissionTier_scheduleId_tierOrder_idx" ON "CommissionTier"("scheduleId", "tierOrder");
CREATE INDEX "CommissionLedgerEntry_brokerId_state_earnedPeriodStart_idx" ON "CommissionLedgerEntry"("brokerId", "state", "earnedPeriodStart");
CREATE INDEX "CommissionLedgerEntry_groupId_earnedPeriodStart_idx" ON "CommissionLedgerEntry"("groupId", "earnedPeriodStart");
CREATE INDEX "CommissionLedgerEntry_payoutBatchId_idx" ON "CommissionLedgerEntry"("payoutBatchId");
CREATE INDEX "CommissionLedgerEntry_contributionReceiptId_idx" ON "CommissionLedgerEntry"("contributionReceiptId");
CREATE INDEX "CommissionPayoutBatch_status_batchDate_idx" ON "CommissionPayoutBatch"("status", "batchDate");

ALTER TABLE "BrokerKycDocument" ADD CONSTRAINT "BrokerKycDocument_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerProducer" ADD CONSTRAINT "BrokerProducer_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "_ProducerSchemes" ADD CONSTRAINT "_ProducerSchemes_A_fkey" FOREIGN KEY ("A") REFERENCES "BrokerProducer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProducerSchemes" ADD CONSTRAINT "_ProducerSchemes_B_fkey" FOREIGN KEY ("B") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerCommissionSchedule" ADD CONSTRAINT "BrokerCommissionSchedule_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BrokerCommissionSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BrokerCommissionSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "CommissionPayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_clawbackParentId_fkey" FOREIGN KEY ("clawbackParentId") REFERENCES "CommissionLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
