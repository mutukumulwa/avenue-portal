-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('RECEIPT_PHOTO', 'MPESA_SMS', 'BANK_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReimbursementPaymentMethod" AS ENUM ('BANK_TRANSFER', 'MPESA');

-- CreateTable
CREATE TABLE "ReimbursementRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "totalPaidByMember" DECIMAL(19,4) NOT NULL,
    "proofType" "ProofType" NOT NULL,
    "proofFileUrl" TEXT NOT NULL,
    "mpesaConfirmationCode" TEXT,
    "mpesaVerified" BOOLEAN NOT NULL DEFAULT false,
    "mpesaNote" TEXT,
    "submittedWithinWindow" BOOLEAN NOT NULL DEFAULT true,
    "reimbursementWindowDays" INTEGER NOT NULL DEFAULT 90,
    "disbursementMethod" "ReimbursementPaymentMethod",
    "disbursedAt" TIMESTAMP(3),
    "disbursementRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReimbursementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReimbursementRequest_claimId_key" ON "ReimbursementRequest"("claimId");

-- CreateIndex
CREATE INDEX "ReimbursementRequest_tenantId_memberId_idx" ON "ReimbursementRequest"("tenantId", "memberId");

-- AddForeignKey
ALTER TABLE "ReimbursementRequest" ADD CONSTRAINT "ReimbursementRequest_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

