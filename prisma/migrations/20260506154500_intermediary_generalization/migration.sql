-- Widen broker management into business-source/intermediary management.

CREATE TYPE "IntermediaryCategory" AS ENUM (
  'REGULATED_BROKER',
  'REGULATED_AGENT',
  'INTRODUCER',
  'REFERRAL_PARTNER',
  'INTERNAL_SALES',
  'CORPORATE_AFFINITY',
  'BANCASSURANCE',
  'OTHER'
);

CREATE TYPE "CommissionBasis" AS ENUM (
  'COMMISSION',
  'REFERRAL_FEE',
  'ATTRIBUTION_ONLY',
  'NONE'
);

ALTER TYPE "KycDocumentType" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_LETTER';
ALTER TYPE "KycDocumentType" ADD VALUE IF NOT EXISTS 'REFERRAL_AGREEMENT';

ALTER TABLE "Broker"
  ADD COLUMN "intermediaryCategory" "IntermediaryCategory" NOT NULL DEFAULT 'REGULATED_BROKER',
  ADD COLUMN "requiresIraRegistration" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canReceiveCommission" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "commissionBasis" "CommissionBasis" NOT NULL DEFAULT 'COMMISSION',
  ADD COLUMN "referralFeeAmount" DECIMAL(18, 2),
  ADD COLUMN "sourceDescription" TEXT;

CREATE INDEX "Broker_tenantId_intermediaryCategory_idx" ON "Broker"("tenantId", "intermediaryCategory");
CREATE INDEX "Broker_tenantId_canReceiveCommission_idx" ON "Broker"("tenantId", "canReceiveCommission");
