-- CreateEnum
CREATE TYPE "ClaimLineDecision" AS ENUM ('APPROVED', 'APPROVED_WITH_ADJUSTMENT', 'DECLINED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'MAKER_SUBMITTED', 'CHECKER_APPROVED', 'SETTLED', 'REJECTED');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "adjudicatorId" TEXT,
ADD COLUMN     "appealReviewerId" TEXT,
ADD COLUMN     "contractedRate" DECIMAL(14,2),
ADD COLUMN     "contractedVariancePct" DECIMAL(5,4),
ADD COLUMN     "seniorAdjudicatorId" TEXT,
ADD COLUMN     "settlementBatchId" TEXT;

-- AlterTable
ALTER TABLE "ClaimLine" ADD COLUMN     "adjudicationDecision" "ClaimLineDecision",
ADD COLUMN     "adjustedAmount" DECIMAL(14,2),
ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "declineReason" TEXT;

-- CreateTable
CREATE TABLE "ProviderSettlementBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "cycleMonth" INTEGER NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderSettlementBatch_tenantId_status_idx" ON "ProviderSettlementBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderSettlementBatch_tenantId_providerId_idx" ON "ProviderSettlementBatch"("tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSettlementBatch_tenantId_providerId_cycleMonth_cycl_key" ON "ProviderSettlementBatch"("tenantId", "providerId", "cycleMonth", "cycleYear");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_adjudicatorId_fkey" FOREIGN KEY ("adjudicatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_seniorAdjudicatorId_fkey" FOREIGN KEY ("seniorAdjudicatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "ProviderSettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSettlementBatch" ADD CONSTRAINT "ProviderSettlementBatch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- NOTE: double-capture partial unique index deferred — apply after removing duplicate seed data:
-- CREATE UNIQUE INDEX "claim_double_capture_idx"
--   ON "Claim"("providerId","memberId","dateOfService","benefitCategory")
--   WHERE "status" != 'VOID' AND "isReimbursement" = false;
-- Until then, duplicate detection is enforced at the service layer (checkDoubleCaptureInService).
