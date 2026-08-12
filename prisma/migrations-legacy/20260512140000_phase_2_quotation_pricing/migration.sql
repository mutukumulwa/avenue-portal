-- CreateEnum
CREATE TYPE "QuotationLineType" AS ENUM ('BASE_CONTRIBUTION', 'LOADING_PER_LIFE', 'LOADING_SCHEME', 'DISCOUNT_GROUP_SIZE', 'DISCOUNT_LOYALTY', 'DISCOUNT_CUSTOM', 'STAMP_DUTY', 'TRAINING_LEVY', 'PHCF', 'CARD_ISSUANCE_FEE', 'SMART_CARD_FEE', 'WELCOME_PACK_FEE', 'CO_CONTRIBUTION_PROVISION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PricingFileType" AS ENUM ('EXCEL', 'PYTHON');

-- CreateTable
CREATE TABLE "QuotationVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "lineType" "QuotationLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quotationLifeId" TEXT,
    "lifeName" TEXT,
    "ageBand" TEXT,
    "baseAmount" DECIMAL(19,4) NOT NULL,
    "adjustmentPct" DECIMAL(5,4),
    "netAmount" DECIMAL(19,4) NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isVisibleToSubmitter" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuotationLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilySizeMatrixCell" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "familySize" TEXT NOT NULL,
    "benefitLimitBand" TEXT NOT NULL,
    "contributionAmount" DECIMAL(19,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FamilySizeMatrixCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPricingModelFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "groupId" TEXT,
    "fileType" "PricingFileType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "lastTestedAt" TIMESTAMP(3),
    "lastTestResult" JSONB,

    CONSTRAINT "CustomPricingModelFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPricingRunLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "modelFileId" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB,
    "executionMs" INTEGER,
    "succeeded" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPricingRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationVersion_tenantId_quotationId_idx" ON "QuotationVersion"("tenantId", "quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationVersion_quotationId_versionNumber_key" ON "QuotationVersion"("quotationId", "versionNumber");

-- CreateIndex
CREATE INDEX "QuotationLineItem_tenantId_quotationId_idx" ON "QuotationLineItem"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "FamilySizeMatrixCell_tenantId_rateCardId_isActive_idx" ON "FamilySizeMatrixCell"("tenantId", "rateCardId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FamilySizeMatrixCell_rateCardId_familySize_benefitLimitBand_key" ON "FamilySizeMatrixCell"("rateCardId", "familySize", "benefitLimitBand", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CustomPricingModelFile_tenantId_isActive_idx" ON "CustomPricingModelFile"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "CustomPricingRunLog_tenantId_quotationId_idx" ON "CustomPricingRunLog"("tenantId", "quotationId");

-- AddForeignKey
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLineItem" ADD CONSTRAINT "QuotationLineItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

