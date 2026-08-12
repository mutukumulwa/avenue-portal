-- CreateEnum
CREATE TYPE "LimitScope" AS ENUM ('MEMBER', 'FAMILY');

-- CreateEnum
CREATE TYPE "TariffType" AS ENUM ('NEGOTIATED', 'PUBLISHED', 'GAZETTED');

-- AlterTable
ALTER TABLE "ProviderDiagnosisTariff" ADD COLUMN     "tariffType" "TariffType" NOT NULL DEFAULT 'NEGOTIATED';

-- AlterTable
ALTER TABLE "ProviderTariff" ADD COLUMN     "tariffType" "TariffType" NOT NULL DEFAULT 'NEGOTIATED';

-- CreateTable
CREATE TABLE "SharedLimitGroup" (
    "id" TEXT NOT NULL,
    "packageVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limitAmount" DECIMAL(14,2) NOT NULL,
    "appliesTo" "LimitScope" NOT NULL DEFAULT 'FAMILY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedLimitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitConfigSharedLimit" (
    "benefitConfigId" TEXT NOT NULL,
    "sharedLimitGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitConfigSharedLimit_pkey" PRIMARY KEY ("benefitConfigId","sharedLimitGroupId")
);

-- CreateTable
CREATE TABLE "ContributionRateTable" (
    "id" TEXT NOT NULL,
    "pricingModelId" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "familySize" TEXT NOT NULL,
    "location" TEXT,
    "baseRate" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionRateTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedLimitGroup_packageVersionId_idx" ON "SharedLimitGroup"("packageVersionId");

-- CreateIndex
CREATE INDEX "BenefitConfigSharedLimit_sharedLimitGroupId_idx" ON "BenefitConfigSharedLimit"("sharedLimitGroupId");

-- CreateIndex
CREATE INDEX "ContributionRateTable_pricingModelId_idx" ON "ContributionRateTable"("pricingModelId");

-- CreateIndex
CREATE INDEX "ContributionRateTable_pricingModelId_minAge_maxAge_idx" ON "ContributionRateTable"("pricingModelId", "minAge", "maxAge");

-- AddForeignKey
ALTER TABLE "SharedLimitGroup" ADD CONSTRAINT "SharedLimitGroup_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitConfigSharedLimit" ADD CONSTRAINT "BenefitConfigSharedLimit_benefitConfigId_fkey" FOREIGN KEY ("benefitConfigId") REFERENCES "BenefitConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitConfigSharedLimit" ADD CONSTRAINT "BenefitConfigSharedLimit_sharedLimitGroupId_fkey" FOREIGN KEY ("sharedLimitGroupId") REFERENCES "SharedLimitGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRateTable" ADD CONSTRAINT "ContributionRateTable_pricingModelId_fkey" FOREIGN KEY ("pricingModelId") REFERENCES "PricingModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
