-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "BenefitUsage" ADD COLUMN     "activeHoldAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PreAuthorization" ADD COLUMN     "autoDecisionLog" JSONB,
ADD COLUMN     "estimatedComponents" JSONB,
ADD COLUMN     "fraudFlags" JSONB,
ADD COLUMN     "isEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentPreAuthId" TEXT,
ADD COLUMN     "slaBreachedAt" TIMESTAMP(3),
ADD COLUMN     "slaDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "slaType" TEXT;

-- CreateTable
CREATE TABLE "BenefitHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "preAuthId" TEXT NOT NULL,
    "benefitCategory" TEXT NOT NULL,
    "heldAmount" DECIMAL(14,2) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "convertedToClaimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BenefitHold_preAuthId_key" ON "BenefitHold"("preAuthId");

-- CreateIndex
CREATE INDEX "BenefitHold_tenantId_memberId_status_idx" ON "BenefitHold"("tenantId", "memberId", "status");

-- CreateIndex
CREATE INDEX "BenefitHold_tenantId_status_expiresAt_idx" ON "BenefitHold"("tenantId", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "BenefitHold" ADD CONSTRAINT "BenefitHold_preAuthId_fkey" FOREIGN KEY ("preAuthId") REFERENCES "PreAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

