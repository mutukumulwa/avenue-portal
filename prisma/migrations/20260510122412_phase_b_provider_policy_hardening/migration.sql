-- CreateEnum
CREATE TYPE "EligibilityRule" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "PractitionerCredentialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReinstatementStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "PackageProviderEligibility" (
    "id" TEXT NOT NULL,
    "packageVersionId" TEXT NOT NULL,
    "providerId" TEXT,
    "providerTier" "ProviderTier",
    "inclusionType" "EligibilityRule" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageProviderEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Practitioner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practitioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerCredential" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentUrl" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "PractitionerCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PractitionerCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPractitioner" (
    "providerId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPractitioner_pkey" PRIMARY KEY ("providerId","practitionerId")
);

-- CreateTable
CREATE TABLE "MembershipReinstatementRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "lapsedDate" TIMESTAMP(3) NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReinstatementStatus" NOT NULL DEFAULT 'PENDING',
    "catchUpAmount" DECIMAL(14,2) NOT NULL,
    "periodsCovered" INTEGER NOT NULL,
    "resetWaitingPeriod" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "declineReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipReinstatementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageProviderEligibility_packageVersionId_idx" ON "PackageProviderEligibility"("packageVersionId");

-- CreateIndex
CREATE INDEX "PackageProviderEligibility_providerId_idx" ON "PackageProviderEligibility"("providerId");

-- CreateIndex
CREATE INDEX "Practitioner_tenantId_idx" ON "Practitioner"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Practitioner_tenantId_licenseNumber_key" ON "Practitioner"("tenantId", "licenseNumber");

-- CreateIndex
CREATE INDEX "PractitionerCredential_practitionerId_idx" ON "PractitionerCredential"("practitionerId");

-- CreateIndex
CREATE INDEX "PractitionerCredential_expiryDate_idx" ON "PractitionerCredential"("expiryDate");

-- CreateIndex
CREATE INDEX "ProviderPractitioner_practitionerId_idx" ON "ProviderPractitioner"("practitionerId");

-- CreateIndex
CREATE INDEX "MembershipReinstatementRequest_tenantId_status_idx" ON "MembershipReinstatementRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MembershipReinstatementRequest_memberId_idx" ON "MembershipReinstatementRequest"("memberId");

-- AddForeignKey
ALTER TABLE "PackageProviderEligibility" ADD CONSTRAINT "PackageProviderEligibility_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageProviderEligibility" ADD CONSTRAINT "PackageProviderEligibility_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practitioner" ADD CONSTRAINT "Practitioner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerCredential" ADD CONSTRAINT "PractitionerCredential_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPractitioner" ADD CONSTRAINT "ProviderPractitioner_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPractitioner" ADD CONSTRAINT "ProviderPractitioner_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipReinstatementRequest" ADD CONSTRAINT "MembershipReinstatementRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipReinstatementRequest" ADD CONSTRAINT "MembershipReinstatementRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipReinstatementRequest" ADD CONSTRAINT "MembershipReinstatementRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
