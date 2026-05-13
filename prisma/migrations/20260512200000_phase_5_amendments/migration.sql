-- CreateEnum
CREATE TYPE "ProRataType" AS ENUM ('CHARGE', 'CREDIT', 'ZERO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EndorsementType" ADD VALUE 'BENEFICIARY_UPDATE';
ALTER TYPE "EndorsementType" ADD VALUE 'BANKING_DETAILS_UPDATE';
ALTER TYPE "EndorsementType" ADD VALUE 'MID_TERM_RATE_CHANGE';

-- AlterTable
ALTER TABLE "Endorsement" ADD COLUMN     "afterSnapshot" JSONB,
ADD COLUMN     "approverId" TEXT,
ADD COLUMN     "assessmentDecisionId" TEXT,
ADD COLUMN     "backDated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "beforeSnapshot" JSONB,
ADD COLUMN     "makerId" TEXT,
ADD COLUMN     "overrideRecordId" TEXT,
ADD COLUMN     "proRataCalculationId" TEXT,
ADD COLUMN     "requiresAssessment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProRataCalculation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endorsementId" TEXT NOT NULL,
    "previousContribution" DECIMAL(19,4) NOT NULL,
    "newContribution" DECIMAL(19,4) NOT NULL,
    "periodStartDate" TIMESTAMP(3) NOT NULL,
    "periodEndDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "daysRemaining" INTEGER NOT NULL,
    "totalDaysInPeriod" INTEGER NOT NULL,
    "prorataFactor" DECIMAL(10,8) NOT NULL,
    "adjustmentAmount" DECIMAL(19,4) NOT NULL,
    "adjustmentType" "ProRataType" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProRataCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProRataCalculation_endorsementId_key" ON "ProRataCalculation"("endorsementId");

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProRataCalculation" ADD CONSTRAINT "ProRataCalculation_endorsementId_fkey" FOREIGN KEY ("endorsementId") REFERENCES "Endorsement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

