-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "KycDocType" AS ENUM ('NATIONAL_ID_COPY', 'PASSPORT_COPY', 'KRA_PIN', 'CHRONIC_CONDITION_DOCS', 'PHOTO', 'BIRTH_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('DIGITAL', 'PHYSICAL', 'SMART');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('PENDING_ISSUANCE', 'ISSUED', 'DISPATCHED', 'DELIVERED', 'ACTIVATED', 'LOST', 'DAMAGED', 'REPLACED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OnboardingItemType" AS ENUM ('KYC_COMPLETION', 'PORTAL_PROVISIONING', 'DIGITAL_CARD_GENERATED', 'PHYSICAL_CARD_DISPATCHED', 'WELCOME_COMMUNICATION_SENT', 'PROVIDER_NOTIFIED', 'BIOMETRIC_ENROLLED');

-- CreateEnum
CREATE TYPE "OnboardingItemStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "MemberKycRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "govIdType" TEXT,
    "govIdNumber" TEXT,
    "iprsValidated" BOOLEAN NOT NULL DEFAULT false,
    "iprsCheckedAt" TIMESTAMP(3),
    "iprsNote" TEXT,
    "biometricEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "biometricType" TEXT,
    "photoUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberKycRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberKycDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kycRecordId" TEXT NOT NULL,
    "docType" "KycDocType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MemberKycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cardType" "CardType" NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'PENDING_ISSUANCE',
    "cardNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "replacedByCardId" TEXT,
    "replacementReason" TEXT,
    "replacementFeeInvoiceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "itemType" "OnboardingItemType" NOT NULL,
    "status" "OnboardingItemStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberKycRecord_memberId_key" ON "MemberKycRecord"("memberId");

-- CreateIndex
CREATE INDEX "MemberKycRecord_tenantId_status_idx" ON "MemberKycRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MemberKycDocument_kycRecordId_idx" ON "MemberKycDocument"("kycRecordId");

-- CreateIndex
CREATE INDEX "MembershipCard_tenantId_memberId_isActive_idx" ON "MembershipCard"("tenantId", "memberId", "isActive");

-- CreateIndex
CREATE INDEX "MembershipCard_tenantId_status_idx" ON "MembershipCard"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OnboardingChecklistItem_tenantId_memberId_idx" ON "OnboardingChecklistItem"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "OnboardingChecklistItem_tenantId_status_idx" ON "OnboardingChecklistItem"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChecklistItem_memberId_itemType_key" ON "OnboardingChecklistItem"("memberId", "itemType");

-- AddForeignKey
ALTER TABLE "MemberKycDocument" ADD CONSTRAINT "MemberKycDocument_kycRecordId_fkey" FOREIGN KEY ("kycRecordId") REFERENCES "MemberKycRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

