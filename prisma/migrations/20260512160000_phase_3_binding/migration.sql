-- CreateEnum
CREATE TYPE "AcceptanceMethod" AS ENUM ('PORTAL_CLICK', 'EMAIL_REPLY', 'SIGNED_LETTER', 'PAYMENT_INITIATED');

-- CreateEnum
CREATE TYPE "BindingDocType" AS ENUM ('MEMBERSHIP_CERTIFICATE', 'BENEFIT_SCHEDULE', 'WELCOME_PACK', 'SCHEME_BINDER', 'TERMS_AND_CONDITIONS');

-- CreateEnum
CREATE TYPE "FundDepositStatus" AS ENUM ('PENDING', 'PARTIALLY_RECEIVED', 'RECEIVED', 'WAIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemberStatus" ADD VALUE 'LAPSED_BEFORE_ACTIVATION';
ALTER TYPE "MemberStatus" ADD VALUE 'CANCELLED_COOLING_OFF';
ALTER TYPE "MemberStatus" ADD VALUE 'TERMINATED_FRAUD';
ALTER TYPE "MemberStatus" ADD VALUE 'TERMINATED_BREACH';
ALTER TYPE "MemberStatus" ADD VALUE 'TERMINATED_DEATH';
ALTER TYPE "MemberStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "bindingCheckerId" TEXT,
ADD COLUMN     "bindingMakerId" TEXT,
ADD COLUMN     "coverEndDate" TIMESTAMP(3),
ADD COLUMN     "coverStartDate" TIMESTAMP(3),
ADD COLUMN     "quotationId" TEXT,
ADD COLUMN     "underwritingDecisionId" TEXT;

-- CreateTable
CREATE TABLE "QuotationAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "method" "AcceptanceMethod" NOT NULL,
    "acceptedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "coolingOffEnds" TIMESTAMP(3),

    CONSTRAINT "QuotationAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBindingDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT,
    "groupId" TEXT,
    "documentType" "BindingDocType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipBindingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundDepositRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "selfFundedAccId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requiredAmount" DECIMAL(19,4) NOT NULL,
    "receivedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "minimumToActivate" DECIMAL(19,4) NOT NULL,
    "status" "FundDepositStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundDepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuotationAcceptance_quotationId_key" ON "QuotationAcceptance"("quotationId");

-- CreateIndex
CREATE INDEX "MembershipBindingDocument_tenantId_memberId_idx" ON "MembershipBindingDocument"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipBindingDocument_tenantId_groupId_idx" ON "MembershipBindingDocument"("tenantId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "FundDepositRequest_groupId_key" ON "FundDepositRequest"("groupId");

-- CreateIndex
CREATE INDEX "FundDepositRequest_tenantId_status_idx" ON "FundDepositRequest"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "QuotationAcceptance" ADD CONSTRAINT "QuotationAcceptance_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAcceptance" ADD CONSTRAINT "QuotationAcceptance_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

