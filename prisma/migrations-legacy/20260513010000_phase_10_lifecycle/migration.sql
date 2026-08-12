-- CreateEnum
CREATE TYPE "CancellationType" AS ENUM ('COOLING_OFF', 'STANDARD', 'SCHEME_CLOSURE');

-- CreateEnum
CREATE TYPE "TerminationType" AS ENUM ('FRAUD', 'BREACH', 'DEATH', 'NON_RENEWAL');

-- CreateTable
CREATE TABLE "MembershipLapseRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "lapseDate" TIMESTAMP(3) NOT NULL,
    "unpaidAmount" DECIMAL(14,2) NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL,
    "catchupDeadline" TIMESTAMP(3) NOT NULL,
    "reinstatedAt" TIMESTAMP(3),
    "catchupExpired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipLapseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCancellationRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cancellationType" "CancellationType" NOT NULL,
    "requestedById" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isCoolingOff" BOOLEAN NOT NULL,
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adminFeeDeducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "benefitsClawedBack" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCancellationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTerminationRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "terminationType" "TerminationType" NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "narrative" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "proRataRefund" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipTerminationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipLapseRecord_tenantId_memberId_idx" ON "MembershipLapseRecord"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipLapseRecord_tenantId_catchupExpired_idx" ON "MembershipLapseRecord"("tenantId", "catchupExpired");

-- CreateIndex
CREATE INDEX "MembershipCancellationRecord_tenantId_memberId_idx" ON "MembershipCancellationRecord"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipTerminationRecord_tenantId_memberId_idx" ON "MembershipTerminationRecord"("tenantId", "memberId");

