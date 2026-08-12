-- CreateEnum
CREATE TYPE "UWDecisionType" AS ENUM ('STANDARD', 'LOADED', 'EXCLUSION', 'WAITING_PERIOD', 'DECLINED');

-- CreateEnum
CREATE TYPE "LifeRole" AS ENUM ('PRINCIPAL', 'DEPENDANT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuotationStatus" ADD VALUE 'PENDING_VALIDATION';
ALTER TYPE "QuotationStatus" ADD VALUE 'PENDING_ASSESSMENT';
ALTER TYPE "QuotationStatus" ADD VALUE 'ASSESSED';
ALTER TYPE "QuotationStatus" ADD VALUE 'ASSESSED_PENDING_SENIOR_APPROVAL';
ALTER TYPE "QuotationStatus" ADD VALUE 'DECLINED_BY_UNDERWRITING';
ALTER TYPE "QuotationStatus" ADD VALUE 'WITHDRAWN_BY_SUBMITTER';

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "assessorNotes" TEXT,
ADD COLUMN     "assessorSlaDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "assignedAssessorId" TEXT,
ADD COLUMN     "billingContactEmail" TEXT,
ADD COLUMN     "censusFileUrl" TEXT,
ADD COLUMN     "clientType" "ClientType",
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "fundingMode" "FundingMode" NOT NULL DEFAULT 'INSURED',
ADD COLUMN     "headcount" INTEGER,
ADD COLUMN     "isRenewal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kraPinCorporate" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "priorQuotationId" TEXT,
ADD COLUMN     "requestedCoverStart" TIMESTAMP(3),
ADD COLUMN     "seniorApprovalNote" TEXT,
ALTER COLUMN "memberCount" SET DEFAULT 0,
ALTER COLUMN "ratePerMember" DROP NOT NULL,
ALTER COLUMN "ratePerMember" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "annualPremium" DROP NOT NULL,
ALTER COLUMN "annualPremium" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "finalPremium" DROP NOT NULL,
ALTER COLUMN "finalPremium" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "validUntil" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuotationLife" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "role" "LifeRole" NOT NULL,
    "principalLifeId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationalId" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "isChronic" BOOLEAN NOT NULL DEFAULT false,
    "iprsValidated" BOOLEAN NOT NULL DEFAULT false,
    "medicalHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationLife_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnderwritingDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "quotationLifeId" TEXT,
    "memberId" TEXT,
    "decision" "UWDecisionType" NOT NULL,
    "loadingMultiplier" DECIMAL(5,4),
    "excludedIcd10Codes" TEXT[],
    "waitingPeriodDays" INTEGER,
    "waitingPeriodCategories" TEXT[],
    "reasonCode" TEXT NOT NULL,
    "narrative" TEXT,
    "decidedById" TEXT NOT NULL,
    "seniorApprovedById" TEXT,
    "seniorApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnderwritingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipExclusion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "icd10Code" TEXT NOT NULL,
    "description" TEXT,
    "sourceDecisionId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitingPeriodApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "benefitCategories" TEXT[],
    "waitingPeriodDays" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sourceDecisionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "WaitingPeriodApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationRiskProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "ageDistribution" JSONB NOT NULL,
    "genderSplit" JSONB NOT NULL,
    "dependantRatio" DECIMAL(5,4) NOT NULL,
    "icd10ChapterSummary" JSONB NOT NULL,
    "priorLossRatio" DECIMAL(5,4),
    "geographicDist" JSONB,
    "benchmarkMlr" DECIMAL(5,4),
    "preExistingFlags" JSONB,
    "blacklistMatches" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessorWorkQueueItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessorWorkQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationLife_quotationId_idx" ON "QuotationLife"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationLife_tenantId_nationalId_idx" ON "QuotationLife"("tenantId", "nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "UnderwritingDecision_quotationLifeId_key" ON "UnderwritingDecision"("quotationLifeId");

-- CreateIndex
CREATE INDEX "UnderwritingDecision_tenantId_quotationId_idx" ON "UnderwritingDecision"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "UnderwritingDecision_tenantId_memberId_idx" ON "UnderwritingDecision"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipExclusion_tenantId_memberId_idx" ON "MembershipExclusion"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipExclusion_tenantId_memberId_icd10Code_idx" ON "MembershipExclusion"("tenantId", "memberId", "icd10Code");

-- CreateIndex
CREATE INDEX "WaitingPeriodApplication_tenantId_memberId_idx" ON "WaitingPeriodApplication"("tenantId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRiskProfile_quotationId_key" ON "QuotationRiskProfile"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessorWorkQueueItem_quotationId_key" ON "AssessorWorkQueueItem"("quotationId");

-- CreateIndex
CREATE INDEX "AssessorWorkQueueItem_tenantId_assignedToId_completedAt_idx" ON "AssessorWorkQueueItem"("tenantId", "assignedToId", "completedAt");

-- CreateIndex
CREATE INDEX "AssessorWorkQueueItem_tenantId_slaBreached_idx" ON "AssessorWorkQueueItem"("tenantId", "slaBreached");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_status_idx" ON "Quotation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_assignedAssessorId_idx" ON "Quotation"("tenantId", "assignedAssessorId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_assignedAssessorId_fkey" FOREIGN KEY ("assignedAssessorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLife" ADD CONSTRAINT "QuotationLife_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderwritingDecision" ADD CONSTRAINT "UnderwritingDecision_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderwritingDecision" ADD CONSTRAINT "UnderwritingDecision_quotationLifeId_fkey" FOREIGN KEY ("quotationLifeId") REFERENCES "QuotationLife"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderwritingDecision" ADD CONSTRAINT "UnderwritingDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRiskProfile" ADD CONSTRAINT "QuotationRiskProfile_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorWorkQueueItem" ADD CONSTRAINT "AssessorWorkQueueItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorWorkQueueItem" ADD CONSTRAINT "AssessorWorkQueueItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

