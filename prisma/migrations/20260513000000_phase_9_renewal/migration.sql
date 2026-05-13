-- CreateEnum
CREATE TYPE "GroupRenewalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'QUOTE_ISSUED', 'NEGOTIATING', 'BOUND', 'LAPSED', 'CANCELLED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "priorPeriodReconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "renewalNoticeDispatchedAt" TIMESTAMP(3),
ADD COLUMN     "renewalStatus" "GroupRenewalStatus",
ADD COLUMN     "supersededByGroupId" TEXT;

-- AlterTable
ALTER TABLE "RenewalAnalysis" ADD COLUMN     "actuarialOpinionDocUrl" TEXT,
ADD COLUMN     "isLossLeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lossLeaderApprovedById" TEXT,
ADD COLUMN     "lossLeaderJustification" TEXT,
ADD COLUMN     "recommendationBasis" TEXT,
ADD COLUMN     "requiresActuarialReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RenewalScenario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "renewalAnalysisId" TEXT NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "proposedRateAdj" DECIMAL(5,4) NOT NULL,
    "proposedCoContribAdj" DECIMAL(5,4),
    "proposedNetworkTier" TEXT,
    "projectedMlr" DECIMAL(5,4) NOT NULL,
    "projectedContribution" DECIMAL(19,4) NOT NULL,
    "isCommitted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenewalScenario_tenantId_renewalAnalysisId_idx" ON "RenewalScenario"("tenantId", "renewalAnalysisId");

