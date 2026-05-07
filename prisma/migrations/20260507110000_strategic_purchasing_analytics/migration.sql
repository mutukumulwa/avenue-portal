-- Strategic purchasing analytics foundation.

CREATE TYPE "AnalyticsEncounterType" AS ENUM (
  'OUTPATIENT',
  'INPATIENT',
  'DAY_CASE',
  'EMERGENCY'
);

CREATE TYPE "RiskTier" AS ENUM (
  'LOW',
  'MODERATE',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "AnalyticsAlertType" AS ENUM (
  'MLR_DRIFT',
  'UTILIZATION_SPIKE',
  'PROVIDER_ANOMALY',
  'RENEWAL_RISK',
  'MEMBER_RISK',
  'CONTRIBUTION_SHORTFALL'
);

CREATE TYPE "AnalyticsAlertSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

CREATE TYPE "AnalyticsAlertStatus" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED'
);

CREATE TABLE "AnalyticsEncounterFact" (
  "id" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceClaimId" TEXT NOT NULL,
  "sourceClaimLineId" TEXT,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "packageId" TEXT,
  "benefitTierId" TEXT,
  "intermediaryId" TEXT,
  "memberId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerTier" "ProviderTier",
  "providerType" "ProviderType",
  "isInternalProvider" BOOLEAN NOT NULL DEFAULT false,
  "encounterDate" TIMESTAMP(3) NOT NULL,
  "encounterMonth" TIMESTAMP(3) NOT NULL,
  "encounterType" "AnalyticsEncounterType" NOT NULL,
  "benefitCategory" "BenefitCategory",
  "icdCode" TEXT,
  "icdFamily" TEXT,
  "memberAge" INTEGER,
  "memberAgeBand" TEXT,
  "memberGender" "Gender",
  "memberRelationship" "MemberRelationship",
  "familySizeBand" TEXT,
  "memberCounty" TEXT,
  "groupCounty" TEXT,
  "providerCounty" TEXT,
  "grossCost" DECIMAL(18, 2) NOT NULL,
  "benefitPaid" DECIMAL(18, 2) NOT NULL,
  "memberCoContribution" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "rejectedAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "caseMixWeight" DECIMAL(10, 4) NOT NULL DEFAULT 1,
  "usedDefaultCaseMix" BOOLEAN NOT NULL DEFAULT true,
  "status" "ClaimStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsEncounterFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsContributionFact" (
  "id" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceInvoiceId" TEXT,
  "sourcePaymentId" TEXT,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "packageId" TEXT,
  "benefitTierId" TEXT,
  "intermediaryId" TEXT,
  "period" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "memberCount" INTEGER NOT NULL,
  "grossContribution" DECIMAL(18, 2) NOT NULL,
  "paidContribution" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "outstandingAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsContributionFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaseMixWeight" (
  "id" TEXT NOT NULL,
  "icdFamily" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "weight" DECIMAL(10, 4) NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CaseMixWeight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsMlrSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT,
  "packageId" TEXT,
  "benefitTierId" TEXT,
  "intermediaryId" TEXT,
  "grain" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "grossContribution" DECIMAL(18, 2) NOT NULL,
  "paidContribution" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "grossCost" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "benefitPaid" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "memberCoContribution" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "mlr" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "trailing12Mlr" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsMlrSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderScorecard" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "providerName" TEXT NOT NULL,
  "providerTier" "ProviderTier",
  "providerType" "ProviderType",
  "claimCount" INTEGER NOT NULL,
  "memberCount" INTEGER NOT NULL,
  "grossCost" DECIMAL(18, 2) NOT NULL,
  "adjustedCost" DECIMAL(18, 2) NOT NULL,
  "averageCost" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "caseMixIndex" DECIMAL(10, 4) NOT NULL DEFAULT 1,
  "rejectionRate" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderScorecard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberRiskProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "riskTier" "RiskTier" NOT NULL DEFAULT 'LOW',
  "riskScore" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "chronicTags" TEXT[],
  "utilizationToCap" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "projectedExceedDate" TIMESTAMP(3),
  "trailing12ClaimCost" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "trailing12ClaimCount" INTEGER NOT NULL DEFAULT 0,
  "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberRiskProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RenewalAnalysis" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "renewalDate" TIMESTAMP(3) NOT NULL,
  "trailing12Mlr" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "currentYearMlr" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "targetMlr" DECIMAL(10, 4) NOT NULL DEFAULT 0.75,
  "currentContribution" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "projectedClaims" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "recommendedContribution" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "recommendedAdjustmentPct" DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "topIcdDrivers" JSONB NOT NULL DEFAULT '[]',
  "anonymizedTopUtilizers" JSONB NOT NULL DEFAULT '[]',
  "simulatorDefaults" JSONB NOT NULL DEFAULT '{}',
  "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RenewalAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsAlert" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT,
  "providerId" TEXT,
  "memberId" TEXT,
  "intermediaryId" TEXT,
  "type" "AnalyticsAlertType" NOT NULL,
  "severity" "AnalyticsAlertSeverity" NOT NULL DEFAULT 'INFO',
  "status" "AnalyticsAlertStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metricKey" TEXT,
  "metricValue" DECIMAL(18, 4),
  "thresholdValue" DECIMAL(18, 4),
  "context" JSONB NOT NULL DEFAULT '{}',
  "acknowledgedById" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsEncounterFact_sourceKey_key" ON "AnalyticsEncounterFact"("sourceKey");
CREATE INDEX "AnalyticsEncounterFact_tenantId_encounterDate_idx" ON "AnalyticsEncounterFact"("tenantId", "encounterDate");
CREATE INDEX "AnalyticsEncounterFact_tenantId_encounterMonth_idx" ON "AnalyticsEncounterFact"("tenantId", "encounterMonth");
CREATE INDEX "AnalyticsEncounterFact_groupId_encounterDate_idx" ON "AnalyticsEncounterFact"("groupId", "encounterDate");
CREATE INDEX "AnalyticsEncounterFact_providerId_encounterDate_idx" ON "AnalyticsEncounterFact"("providerId", "encounterDate");
CREATE INDEX "AnalyticsEncounterFact_intermediaryId_encounterDate_idx" ON "AnalyticsEncounterFact"("intermediaryId", "encounterDate");
CREATE INDEX "AnalyticsEncounterFact_memberId_encounterDate_idx" ON "AnalyticsEncounterFact"("memberId", "encounterDate");
CREATE INDEX "AnalyticsEncounterFact_tenantId_status_encounterDate_idx" ON "AnalyticsEncounterFact"("tenantId", "status", "encounterDate");
CREATE INDEX "AnalyticsEncounterFact_tenantId_icdFamily_encounterDate_idx" ON "AnalyticsEncounterFact"("tenantId", "icdFamily", "encounterDate");

CREATE UNIQUE INDEX "AnalyticsContributionFact_sourceKey_key" ON "AnalyticsContributionFact"("sourceKey");
CREATE INDEX "AnalyticsContributionFact_tenantId_periodStart_idx" ON "AnalyticsContributionFact"("tenantId", "periodStart");
CREATE INDEX "AnalyticsContributionFact_groupId_periodStart_idx" ON "AnalyticsContributionFact"("groupId", "periodStart");
CREATE INDEX "AnalyticsContributionFact_intermediaryId_periodStart_idx" ON "AnalyticsContributionFact"("intermediaryId", "periodStart");
CREATE INDEX "AnalyticsContributionFact_tenantId_period_idx" ON "AnalyticsContributionFact"("tenantId", "period");

CREATE UNIQUE INDEX "CaseMixWeight_icdFamily_key" ON "CaseMixWeight"("icdFamily");
CREATE INDEX "CaseMixWeight_isActive_idx" ON "CaseMixWeight"("isActive");

CREATE UNIQUE INDEX "AnalyticsMlrSnapshot_tenantId_grain_period_groupId_packageId_benefitTierId_intermediaryId_key" ON "AnalyticsMlrSnapshot"("tenantId", "grain", "period", "groupId", "packageId", "benefitTierId", "intermediaryId");
CREATE INDEX "AnalyticsMlrSnapshot_tenantId_periodStart_idx" ON "AnalyticsMlrSnapshot"("tenantId", "periodStart");
CREATE INDEX "AnalyticsMlrSnapshot_groupId_periodStart_idx" ON "AnalyticsMlrSnapshot"("groupId", "periodStart");
CREATE INDEX "AnalyticsMlrSnapshot_intermediaryId_periodStart_idx" ON "AnalyticsMlrSnapshot"("intermediaryId", "periodStart");

CREATE UNIQUE INDEX "ProviderScorecard_tenantId_providerId_period_key" ON "ProviderScorecard"("tenantId", "providerId", "period");
CREATE INDEX "ProviderScorecard_tenantId_periodStart_idx" ON "ProviderScorecard"("tenantId", "periodStart");
CREATE INDEX "ProviderScorecard_providerId_periodStart_idx" ON "ProviderScorecard"("providerId", "periodStart");

CREATE UNIQUE INDEX "MemberRiskProfile_memberId_key" ON "MemberRiskProfile"("memberId");
CREATE INDEX "MemberRiskProfile_tenantId_riskTier_idx" ON "MemberRiskProfile"("tenantId", "riskTier");
CREATE INDEX "MemberRiskProfile_groupId_riskTier_idx" ON "MemberRiskProfile"("groupId", "riskTier");
CREATE INDEX "MemberRiskProfile_projectedExceedDate_idx" ON "MemberRiskProfile"("projectedExceedDate");

CREATE UNIQUE INDEX "RenewalAnalysis_groupId_renewalDate_key" ON "RenewalAnalysis"("groupId", "renewalDate");
CREATE INDEX "RenewalAnalysis_tenantId_renewalDate_idx" ON "RenewalAnalysis"("tenantId", "renewalDate");

CREATE INDEX "AnalyticsAlert_tenantId_status_severity_createdAt_idx" ON "AnalyticsAlert"("tenantId", "status", "severity", "createdAt");
CREATE INDEX "AnalyticsAlert_groupId_status_idx" ON "AnalyticsAlert"("groupId", "status");
CREATE INDEX "AnalyticsAlert_providerId_status_idx" ON "AnalyticsAlert"("providerId", "status");
CREATE INDEX "AnalyticsAlert_memberId_status_idx" ON "AnalyticsAlert"("memberId", "status");
CREATE INDEX "AnalyticsAlert_intermediaryId_status_idx" ON "AnalyticsAlert"("intermediaryId", "status");
