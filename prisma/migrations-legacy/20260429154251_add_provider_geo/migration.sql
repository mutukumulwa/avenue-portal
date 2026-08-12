-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'CLAIMS_OFFICER', 'FINANCE_OFFICER', 'UNDERWRITER', 'CUSTOMER_SERVICE', 'MEDICAL_OFFICER', 'REPORTS_VIEWER', 'BROKER_USER', 'MEMBER_USER', 'HR_MANAGER', 'FUND_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('PROSPECT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LAPSED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "FundingMode" AS ENUM ('INSURED', 'SELF_FUNDED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('CORPORATE', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "AdminFeeMethod" AS ENUM ('FLAT_PER_INSURED', 'PCT_OF_CLAIMS');

-- CreateEnum
CREATE TYPE "FundTransactionType" AS ENUM ('DEPOSIT', 'TOP_UP', 'CLAIM_DEDUCTION', 'ADMIN_FEE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ServiceRequestCategory" AS ENUM ('MEMBER_QUERY', 'CLAIM_QUERY', 'INVOICE_QUERY', 'CARD_REQUEST', 'BENEFIT_QUERY', 'GENERAL');

-- CreateEnum
CREATE TYPE "ServiceRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'LAPSED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "MemberRelationship" AS ENUM ('PRINCIPAL', 'SPOUSE', 'CHILD', 'PARENT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AuthenticatorAttachment" AS ENUM ('PLATFORM', 'CROSS_PLATFORM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WebAuthnRegistrationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebAuthnEnrollmentApprovalStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckInChallengeStatus" AS ENUM ('PENDING', 'SIGNED', 'CODE_CONFIRMED', 'EXPIRED', 'FAILED', 'CANCELLED', 'FALLBACK_STARTED');

-- CreateEnum
CREATE TYPE "CheckInFlow" AS ENUM ('BIOMETRIC', 'IN_APP_CONFIRMATION', 'SMS_OTP', 'PHOTO_KNOWLEDGE', 'EMERGENCY_OVERRIDE');

-- CreateEnum
CREATE TYPE "CheckInOutcome" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'EXPIRED', 'OVERRIDDEN', 'FLAGGED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "CheckInNotificationStatus" AS ENUM ('PENDING', 'SEEN', 'ACTIONED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('STAMP_DUTY', 'TRAINING_LEVY', 'PHCF');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('INDIVIDUAL', 'FAMILY', 'GROUP', 'CORPORATE');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('INPATIENT', 'OUTPATIENT', 'MATERNITY', 'DENTAL', 'OPTICAL', 'MENTAL_HEALTH', 'CHRONIC_DISEASE', 'SURGICAL', 'AMBULANCE_EMERGENCY', 'LAST_EXPENSE', 'WELLNESS_PREVENTIVE', 'REHABILITATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EndorsementType" AS ENUM ('MEMBER_ADDITION', 'MEMBER_DELETION', 'DEPENDENT_ADDITION', 'DEPENDENT_DELETION', 'PACKAGE_UPGRADE', 'PACKAGE_DOWNGRADE', 'AGE_BAND_CHANGE', 'BENEFIT_MODIFICATION', 'SALARY_CHANGE', 'GROUP_DATA_CHANGE', 'TIER_CHANGE', 'SCHEME_TRANSFER', 'CORRECTION');

-- CreateEnum
CREATE TYPE "EndorsementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('INCURRED', 'RECEIVED', 'CAPTURED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'DECLINED', 'PAID', 'APPEALED', 'APPEAL_APPROVED', 'APPEAL_DECLINED', 'VOID');

-- CreateEnum
CREATE TYPE "ClaimSource" AS ENUM ('MANUAL', 'REIMBURSEMENT', 'PREAUTH', 'SMART', 'SLADE360', 'HMS', 'BATCH');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'DAY_CASE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ClaimLineCategory" AS ENUM ('CONSULTATION', 'LABORATORY', 'PHARMACY', 'IMAGING', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "PreauthStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'EXPIRED', 'CONVERTED_TO_CLAIM', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('HOSPITAL', 'CLINIC', 'PHARMACY', 'LABORATORY', 'DENTAL', 'OPTICAL', 'REHABILITATION');

-- CreateEnum
CREATE TYPE "ProviderTier" AS ENUM ('OWN', 'PARTNER', 'PANEL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'REVISED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "GLSourceType" AS ENUM ('INVOICE_ISSUED', 'PREMIUM_RECEIVED', 'CLAIM_APPROVED', 'CLAIM_PAID', 'COMMISSION_EARNED', 'ENDORSEMENT_ADJUSTMENT', 'CO_CONTRIBUTION_COLLECTED', 'CO_CONTRIBUTION_WAIVED', 'MANUAL');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CoContributionType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'HYBRID', 'NONE');

-- CreateEnum
CREATE TYPE "NetworkTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateEnum
CREATE TYPE "CoContributionCollectionStatus" AS ENUM ('PENDING', 'COLLECTED', 'PARTIAL', 'WAIVED', 'DEFERRED', 'REFUNDED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "CoContributionPaymentMethod" AS ENUM ('CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'OFFSET');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#292A83',
    "accentColor" TEXT NOT NULL DEFAULT '#435BA1',
    "warmColor" TEXT NOT NULL DEFAULT '#F5C6B6',
    "fontHeading" TEXT NOT NULL DEFAULT 'Quicksand',
    "fontBody" TEXT NOT NULL DEFAULT 'Lato',
    "domain" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brokerId" TEXT,
    "memberId" TEXT,
    "groupId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "registrationNumber" TEXT,
    "contactPersonName" TEXT NOT NULL,
    "contactPersonPhone" TEXT NOT NULL,
    "contactPersonEmail" TEXT NOT NULL,
    "address" TEXT,
    "county" TEXT,
    "packageId" TEXT NOT NULL,
    "packageVersionId" TEXT,
    "brokerId" TEXT,
    "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'ANNUAL',
    "contributionRate" DECIMAL(65,30) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'PENDING',
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "clientType" "ClientType" NOT NULL DEFAULT 'CORPORATE',
    "fundingMode" "FundingMode" NOT NULL DEFAULT 'INSURED',
    "adminFeeMethod" "AdminFeeMethod",
    "adminFeeRate" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "ServiceRequestCategory" NOT NULL,
    "priority" "ServiceRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "body" TEXT NOT NULL,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBenefitTier" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "contributionRate" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupBenefitTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "idNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "relationship" "MemberRelationship" NOT NULL DEFAULT 'PRINCIPAL',
    "principalId" TEXT,
    "packageId" TEXT NOT NULL,
    "packageVersionId" TEXT,
    "benefitTierId" TEXT,
    "enrollmentDate" TIMESTAMP(3) NOT NULL,
    "activationDate" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "waitingPeriodEnd" TIMESTAMP(3),
    "smartCardNumber" TEXT,
    "slade360MemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberWebAuthnCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceName" TEXT,
    "deviceModel" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "attachment" "AuthenticatorAttachment" NOT NULL DEFAULT 'UNKNOWN',
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSoftCredential" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntil" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberWebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnRegistrationChallenge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "status" "WebAuthnRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebAuthnRegistrationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnEnrollmentApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "WebAuthnEnrollmentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebAuthnEnrollmentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInChallenge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "workstationId" TEXT,
    "initiatedById" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CheckInChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "signedCredentialId" TEXT,
    "visitCodeHash" TEXT,
    "visitCodeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT,
    "challengeId" TEXT,
    "flow" "CheckInFlow" NOT NULL,
    "outcome" "CheckInOutcome" NOT NULL,
    "initiatedById" TEXT,
    "overrideById" TEXT,
    "credentialId" TEXT,
    "photoEvidenceUrl" TEXT,
    "faceMatchScore" DECIMAL(5,2),
    "knowledgeQuestionKeys" TEXT[],
    "geoLatitude" DECIMAL(9,6),
    "geoLongitude" DECIMAL(9,6),
    "ipAddressHash" TEXT,
    "userAgentHash" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reasonCode" TEXT,
    "notesHash" TEXT,
    "previousEventHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCheckInNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "credentialId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CheckInNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "seenAt" TIMESTAMP(3),
    "actionedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCheckInNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitVerification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "challengeId" TEXT,
    "flow" "CheckInFlow" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT,
    "overrideReason" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "VisitVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfFundedAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minimumBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeposited" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalClaims" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAdminFees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "heldCategories" "BenefitCategory"[],
    "adminFeeInvoiceId" TEXT,
    "periodStartDate" TIMESTAMP(3) NOT NULL,
    "periodEndDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfFundedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "selfFundedAccountId" TEXT NOT NULL,
    "type" "FundTransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "claimId" TEXT,
    "invoiceId" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "flatAmount" DECIMAL(10,2),
    "percentage" DECIMAL(6,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalMatrix" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimValueMin" DECIMAL(65,30),
    "claimValueMax" DECIMAL(65,30),
    "serviceType" "ServiceType",
    "benefitCategory" "BenefitCategory",
    "requiredRole" TEXT NOT NULL,
    "requiresDual" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PackageType" NOT NULL DEFAULT 'GROUP',
    "annualLimit" DECIMAL(65,30) NOT NULL,
    "perVisitLimit" DECIMAL(65,30),
    "contributionAmount" DECIMAL(65,30) NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "minAge" INTEGER NOT NULL DEFAULT 0,
    "maxAge" INTEGER NOT NULL DEFAULT 65,
    "dependentMaxAge" INTEGER NOT NULL DEFAULT 24,
    "exclusions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageVersion" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "facilityAccess" TEXT[],
    "pricingModelUrl" TEXT,
    "pricingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitConfig" (
    "id" TEXT NOT NULL,
    "packageVersionId" TEXT NOT NULL,
    "category" "BenefitCategory" NOT NULL,
    "customCategoryName" TEXT,
    "annualSubLimit" DECIMAL(65,30) NOT NULL,
    "perVisitLimit" DECIMAL(65,30),
    "copayPercentage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "waitingPeriodDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "exclusions" TEXT[],

    CONSTRAINT "BenefitConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitUsage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "benefitConfigId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountUsed" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Endorsement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endorsementNumber" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" "EndorsementType" NOT NULL,
    "status" "EndorsementStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "memberId" TEXT,
    "toGroupId" TEXT,
    "toBenefitTierId" TEXT,
    "changeDetails" JSONB NOT NULL,
    "proratedAmount" DECIMAL(65,30),
    "previousPremium" DECIMAL(65,30),
    "newPremium" DECIMAL(65,30),
    "premiumDelta" DECIMAL(65,30),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "rejectionReason" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Endorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "preauthId" TEXT,
    "source" "ClaimSource" NOT NULL DEFAULT 'MANUAL',
    "serviceType" "ServiceType" NOT NULL,
    "dateOfService" TIMESTAMP(3) NOT NULL,
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "lengthOfStay" INTEGER,
    "attendingDoctor" TEXT,
    "diagnoses" JSONB NOT NULL,
    "procedures" JSONB NOT NULL,
    "billedAmount" DECIMAL(65,30) NOT NULL,
    "approvedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "copayAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "excessAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "memberLiability" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "benefitCategory" "BenefitCategory" NOT NULL,
    "benefitUsageId" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'RECEIVED',
    "assignedReviewerId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStartedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "turnaroundDays" INTEGER,
    "declineReasonCode" TEXT,
    "declineNotes" TEXT,
    "appealDate" TIMESTAMP(3),
    "appealNotes" TEXT,
    "appealDecision" TEXT,
    "appealDecidedAt" TIMESTAMP(3),
    "isReimbursement" BOOLEAN NOT NULL DEFAULT false,
    "reimbursementBankName" TEXT,
    "reimbursementAccountNo" TEXT,
    "reimbursementMpesaPhone" TEXT,
    "reimbursedAt" TIMESTAMP(3),
    "smartClaimRef" TEXT,
    "slade360ClaimRef" TEXT,
    "externalRef" TEXT,
    "hasException" BOOLEAN NOT NULL DEFAULT false,
    "paymentVoucherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLine" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "serviceCategory" "ClaimLineCategory" NOT NULL DEFAULT 'CONSULTATION',
    "description" TEXT NOT NULL,
    "icdCode" TEXT,
    "cptCode" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "billedAmount" DECIMAL(65,30) NOT NULL,
    "tariffRate" DECIMAL(65,30),
    "approvedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "exceptionRef" TEXT,
    "notes" TEXT,

    CONSTRAINT "ClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjudicationLog" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjudicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAuthorization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "preauthNumber" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "status" "PreauthStatus" NOT NULL DEFAULT 'SUBMITTED',
    "diagnoses" JSONB NOT NULL,
    "procedures" JSONB NOT NULL,
    "estimatedCost" DECIMAL(65,30) NOT NULL,
    "clinicalNotes" TEXT,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'OUTPATIENT',
    "expectedDateOfService" TIMESTAMP(3),
    "benefitCategory" "BenefitCategory" NOT NULL,
    "benefitRemaining" DECIMAL(65,30),
    "approvedAmount" DECIMAL(65,30),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "declineReasonCode" TEXT,
    "declineNotes" TEXT,
    "declinedBy" TEXT,
    "declinedAt" TIMESTAMP(3),
    "escalationThresholdHours" INTEGER,
    "escalatedAt" TIMESTAMP(3),
    "escalatedToId" TEXT,
    "claimId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "tier" "ProviderTier" NOT NULL DEFAULT 'PARTNER',
    "address" TEXT,
    "county" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contactPerson" TEXT,
    "geoLatitude" DECIMAL(9,6),
    "geoLongitude" DECIMAL(9,6),
    "isOpen24Hours" BOOLEAN NOT NULL DEFAULT false,
    "operatingHours" JSONB,
    "servicesOffered" TEXT[],
    "contractStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "creditLimit" DECIMAL(65,30),
    "contractNotes" TEXT,
    "smartProviderId" TEXT,
    "slade360ProviderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTariff" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "cptCode" TEXT,
    "serviceName" TEXT NOT NULL,
    "agreedRate" DECIMAL(65,30) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDiagnosisTariff" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "icdCode" TEXT NOT NULL,
    "diagnosisLabel" TEXT NOT NULL,
    "bundledRate" DECIMAL(65,30),
    "perDayRate" DECIMAL(65,30),
    "notes" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderDiagnosisTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "licenseNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dateOnboarded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstYearCommissionPct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "renewalCommissionPct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "flatFeePerMember" DECIMAL(65,30),
    "commissionStructure" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "groupId" TEXT,
    "contributionReceived" DECIMAL(65,30) NOT NULL,
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "commissionAmount" DECIMAL(65,30) NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "ratePerMember" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL,
    "stampDuty" DECIMAL(10,2) NOT NULL DEFAULT 40,
    "trainingLevy" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "phcf" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentVoucher" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "claimCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "groupId" TEXT,
    "brokerId" TEXT,
    "createdBy" TEXT NOT NULL,
    "prospectName" TEXT,
    "prospectContact" TEXT,
    "prospectEmail" TEXT,
    "prospectIndustry" TEXT,
    "packageId" TEXT,
    "memberCount" INTEGER NOT NULL,
    "dependentCount" INTEGER NOT NULL DEFAULT 0,
    "ageBands" JSONB,
    "ratePerMember" DECIMAL(65,30) NOT NULL,
    "annualPremium" DECIMAL(65,30) NOT NULL,
    "loadings" JSONB,
    "discounts" JSONB,
    "finalPremium" DECIMAL(65,30) NOT NULL,
    "pricingNotes" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "pricingModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingModel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT,
    "parameters" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "category" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "groupId" TEXT,
    "endorsementId" TEXT,
    "claimId" TEXT,
    "preauthId" TEXT,
    "brokerId" TEXT,
    "quotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT,
    "memberId" TEXT,
    "endorsementId" TEXT,
    "preauthId" TEXT,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ICD10Code" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "chapterCode" TEXT,
    "standardCharge" DECIMAL(65,30),

    CONSTRAINT "ICD10Code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CPTCode" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serviceCategory" TEXT NOT NULL DEFAULT 'CONSULTATION',
    "averageCost" DECIMAL(65,30),

    CONSTRAINT "CPTCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityRef" TEXT,
    "claimId" TEXT,
    "exceptionCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "raisedById" TEXT NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "subtype" TEXT,
    "normalBalance" "NormalBalance" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "sourceType" "GLSourceType" NOT NULL,
    "sourceId" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "postedById" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "apiBaseUrl" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimFraudAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "severity" "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimFraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoContributionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "benefitCategory" "BenefitCategory",
    "networkTier" "NetworkTier" NOT NULL DEFAULT 'TIER_1',
    "type" "CoContributionType" NOT NULL,
    "fixedAmount" DECIMAL(12,2),
    "percentage" DECIMAL(5,2),
    "perVisitCap" DECIMAL(12,2),
    "perEncounterCap" DECIMAL(12,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoContributionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualCoContributionCap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "individualCap" DECIMAL(12,2) NOT NULL,
    "familyCap" DECIMAL(12,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualCoContributionCap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoContributionTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "coContributionRuleId" TEXT,
    "serviceCost" DECIMAL(12,2) NOT NULL,
    "calculatedAmount" DECIMAL(12,2) NOT NULL,
    "cappedAmount" DECIMAL(12,2) NOT NULL,
    "annualCapApplied" BOOLEAN NOT NULL DEFAULT false,
    "finalAmount" DECIMAL(12,2) NOT NULL,
    "planShare" DECIMAL(12,2) NOT NULL,
    "amountCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "capsApplied" TEXT[],
    "collectionStatus" "CoContributionCollectionStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "CoContributionPaymentMethod",
    "mpesaTransactionRef" TEXT,
    "mpesaPhoneNumber" TEXT,
    "receiptNumber" TEXT,
    "waiverReason" TEXT,
    "waiverApprovedBy" TEXT,
    "waiverApprovedAt" TIMESTAMP(3),
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "CoContributionTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAnnualCoContribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "membershipYear" INTEGER NOT NULL,
    "totalCoContribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "capReached" BOOLEAN NOT NULL DEFAULT false,
    "capReachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAnnualCoContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyAnnualCoContribution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "principalMemberId" TEXT NOT NULL,
    "membershipYear" INTEGER NOT NULL,
    "totalCoContribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "capReached" BOOLEAN NOT NULL DEFAULT false,
    "capReachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyAnnualCoContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FundAdminGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FundAdminGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "User_brokerId_key" ON "User"("brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberId_key" ON "User"("memberId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Group_tenantId_idx" ON "Group"("tenantId");

-- CreateIndex
CREATE INDEX "Group_tenantId_status_idx" ON "Group"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Group_tenantId_fundingMode_idx" ON "Group"("tenantId", "fundingMode");

-- CreateIndex
CREATE INDEX "Group_brokerId_idx" ON "Group"("brokerId");

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_idx" ON "ServiceRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceRequest_groupId_idx" ON "ServiceRequest"("groupId");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "GroupBenefitTier_groupId_idx" ON "GroupBenefitTier"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBenefitTier_groupId_name_key" ON "GroupBenefitTier"("groupId", "name");

-- CreateIndex
CREATE INDEX "Member_tenantId_idx" ON "Member"("tenantId");

-- CreateIndex
CREATE INDEX "Member_tenantId_status_idx" ON "Member"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Member_groupId_idx" ON "Member"("groupId");

-- CreateIndex
CREATE INDEX "Member_principalId_idx" ON "Member"("principalId");

-- CreateIndex
CREATE INDEX "Member_idNumber_idx" ON "Member"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_memberNumber_key" ON "Member"("tenantId", "memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MemberWebAuthnCredential_credentialId_key" ON "MemberWebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "MemberWebAuthnCredential_tenantId_idx" ON "MemberWebAuthnCredential"("tenantId");

-- CreateIndex
CREATE INDEX "MemberWebAuthnCredential_memberId_idx" ON "MemberWebAuthnCredential"("memberId");

-- CreateIndex
CREATE INDEX "MemberWebAuthnCredential_tenantId_status_idx" ON "MemberWebAuthnCredential"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WebAuthnRegistrationChallenge_tenantId_idx" ON "WebAuthnRegistrationChallenge"("tenantId");

-- CreateIndex
CREATE INDEX "WebAuthnRegistrationChallenge_memberId_idx" ON "WebAuthnRegistrationChallenge"("memberId");

-- CreateIndex
CREATE INDEX "WebAuthnRegistrationChallenge_status_idx" ON "WebAuthnRegistrationChallenge"("status");

-- CreateIndex
CREATE INDEX "WebAuthnRegistrationChallenge_expiresAt_idx" ON "WebAuthnRegistrationChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnEnrollmentApproval_tokenHash_key" ON "WebAuthnEnrollmentApproval"("tokenHash");

-- CreateIndex
CREATE INDEX "WebAuthnEnrollmentApproval_tenantId_idx" ON "WebAuthnEnrollmentApproval"("tenantId");

-- CreateIndex
CREATE INDEX "WebAuthnEnrollmentApproval_memberId_idx" ON "WebAuthnEnrollmentApproval"("memberId");

-- CreateIndex
CREATE INDEX "WebAuthnEnrollmentApproval_status_idx" ON "WebAuthnEnrollmentApproval"("status");

-- CreateIndex
CREATE INDEX "WebAuthnEnrollmentApproval_expiresAt_idx" ON "WebAuthnEnrollmentApproval"("expiresAt");

-- CreateIndex
CREATE INDEX "CheckInChallenge_tenantId_idx" ON "CheckInChallenge"("tenantId");

-- CreateIndex
CREATE INDEX "CheckInChallenge_memberId_idx" ON "CheckInChallenge"("memberId");

-- CreateIndex
CREATE INDEX "CheckInChallenge_providerId_idx" ON "CheckInChallenge"("providerId");

-- CreateIndex
CREATE INDEX "CheckInChallenge_status_idx" ON "CheckInChallenge"("status");

-- CreateIndex
CREATE INDEX "CheckInChallenge_expiresAt_idx" ON "CheckInChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "CheckInEvent_tenantId_idx" ON "CheckInEvent"("tenantId");

-- CreateIndex
CREATE INDEX "CheckInEvent_memberId_idx" ON "CheckInEvent"("memberId");

-- CreateIndex
CREATE INDEX "CheckInEvent_providerId_idx" ON "CheckInEvent"("providerId");

-- CreateIndex
CREATE INDEX "CheckInEvent_challengeId_idx" ON "CheckInEvent"("challengeId");

-- CreateIndex
CREATE INDEX "CheckInEvent_flow_idx" ON "CheckInEvent"("flow");

-- CreateIndex
CREATE INDEX "CheckInEvent_outcome_idx" ON "CheckInEvent"("outcome");

-- CreateIndex
CREATE INDEX "CheckInEvent_reviewRequired_idx" ON "CheckInEvent"("reviewRequired");

-- CreateIndex
CREATE INDEX "CheckInEvent_createdAt_idx" ON "CheckInEvent"("createdAt");

-- CreateIndex
CREATE INDEX "MemberCheckInNotification_tenantId_idx" ON "MemberCheckInNotification"("tenantId");

-- CreateIndex
CREATE INDEX "MemberCheckInNotification_memberId_idx" ON "MemberCheckInNotification"("memberId");

-- CreateIndex
CREATE INDEX "MemberCheckInNotification_challengeId_idx" ON "MemberCheckInNotification"("challengeId");

-- CreateIndex
CREATE INDEX "MemberCheckInNotification_status_idx" ON "MemberCheckInNotification"("status");

-- CreateIndex
CREATE INDEX "MemberCheckInNotification_expiresAt_idx" ON "MemberCheckInNotification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisitVerification_challengeId_key" ON "VisitVerification"("challengeId");

-- CreateIndex
CREATE INDEX "VisitVerification_tenantId_idx" ON "VisitVerification"("tenantId");

-- CreateIndex
CREATE INDEX "VisitVerification_memberId_idx" ON "VisitVerification"("memberId");

-- CreateIndex
CREATE INDEX "VisitVerification_providerId_idx" ON "VisitVerification"("providerId");

-- CreateIndex
CREATE INDEX "VisitVerification_openedAt_idx" ON "VisitVerification"("openedAt");

-- CreateIndex
CREATE INDEX "VisitVerification_reviewRequired_idx" ON "VisitVerification"("reviewRequired");

-- CreateIndex
CREATE UNIQUE INDEX "SelfFundedAccount_groupId_key" ON "SelfFundedAccount"("groupId");

-- CreateIndex
CREATE INDEX "SelfFundedAccount_tenantId_idx" ON "SelfFundedAccount"("tenantId");

-- CreateIndex
CREATE INDEX "FundTransaction_tenantId_idx" ON "FundTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "FundTransaction_selfFundedAccountId_idx" ON "FundTransaction"("selfFundedAccountId");

-- CreateIndex
CREATE INDEX "FundTransaction_claimId_idx" ON "FundTransaction"("claimId");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_idx" ON "TaxRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_tenantId_taxType_effectiveFrom_key" ON "TaxRate"("tenantId", "taxType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ApprovalMatrix_tenantId_idx" ON "ApprovalMatrix"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Package_currentVersionId_key" ON "Package"("currentVersionId");

-- CreateIndex
CREATE INDEX "Package_tenantId_idx" ON "Package"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageVersion_packageId_versionNumber_key" ON "PackageVersion"("packageId", "versionNumber");

-- CreateIndex
CREATE INDEX "BenefitConfig_packageVersionId_idx" ON "BenefitConfig"("packageVersionId");

-- CreateIndex
CREATE INDEX "BenefitUsage_memberId_idx" ON "BenefitUsage"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitUsage_memberId_benefitConfigId_periodStart_key" ON "BenefitUsage"("memberId", "benefitConfigId", "periodStart");

-- CreateIndex
CREATE INDEX "Endorsement_tenantId_idx" ON "Endorsement"("tenantId");

-- CreateIndex
CREATE INDEX "Endorsement_groupId_idx" ON "Endorsement"("groupId");

-- CreateIndex
CREATE INDEX "Endorsement_tenantId_status_idx" ON "Endorsement"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Endorsement_tenantId_endorsementNumber_key" ON "Endorsement"("tenantId", "endorsementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_preauthId_key" ON "Claim"("preauthId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_providerId_memberId_dateOfService_benefitCat_idx" ON "Claim"("tenantId", "providerId", "memberId", "dateOfService", "benefitCategory");

-- CreateIndex
CREATE INDEX "Claim_tenantId_idx" ON "Claim"("tenantId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_status_idx" ON "Claim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Claim_memberId_idx" ON "Claim"("memberId");

-- CreateIndex
CREATE INDEX "Claim_providerId_idx" ON "Claim"("providerId");

-- CreateIndex
CREATE INDEX "Claim_preauthId_idx" ON "Claim"("preauthId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_tenantId_claimNumber_key" ON "Claim"("tenantId", "claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_providerId_invoiceNumber_key" ON "Claim"("providerId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "ClaimLine_claimId_idx" ON "ClaimLine"("claimId");

-- CreateIndex
CREATE INDEX "AdjudicationLog_claimId_idx" ON "AdjudicationLog"("claimId");

-- CreateIndex
CREATE INDEX "PreAuthorization_tenantId_idx" ON "PreAuthorization"("tenantId");

-- CreateIndex
CREATE INDEX "PreAuthorization_tenantId_status_idx" ON "PreAuthorization"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PreAuthorization_memberId_idx" ON "PreAuthorization"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PreAuthorization_tenantId_preauthNumber_key" ON "PreAuthorization"("tenantId", "preauthNumber");

-- CreateIndex
CREATE INDEX "Provider_tenantId_idx" ON "Provider"("tenantId");

-- CreateIndex
CREATE INDEX "Provider_tenantId_tier_idx" ON "Provider"("tenantId", "tier");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_idx" ON "ProviderTariff"("providerId");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_cptCode_idx" ON "ProviderTariff"("providerId", "cptCode");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_isActive_idx" ON "ProviderTariff"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "ProviderDiagnosisTariff_providerId_idx" ON "ProviderDiagnosisTariff"("providerId");

-- CreateIndex
CREATE INDEX "ProviderDiagnosisTariff_providerId_icdCode_idx" ON "ProviderDiagnosisTariff"("providerId", "icdCode");

-- CreateIndex
CREATE INDEX "Broker_tenantId_idx" ON "Broker"("tenantId");

-- CreateIndex
CREATE INDEX "Commission_brokerId_idx" ON "Commission"("brokerId");

-- CreateIndex
CREATE INDEX "Commission_brokerId_period_idx" ON "Commission"("brokerId", "period");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_groupId_idx" ON "Invoice"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_groupId_idx" ON "Payment"("groupId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_idx" ON "Quotation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_tenantId_quoteNumber_key" ON "Quotation"("tenantId", "quoteNumber");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ExceptionLog_tenantId_idx" ON "ExceptionLog"("tenantId");

-- CreateIndex
CREATE INDEX "ExceptionLog_tenantId_status_idx" ON "ExceptionLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExceptionLog_entityType_entityId_idx" ON "ExceptionLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ExceptionLog_claimId_idx" ON "ExceptionLog"("claimId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_tenantId_idx" ON "ChartOfAccount"("tenantId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_tenantId_type_idx" ON "ChartOfAccount"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_tenantId_code_key" ON "ChartOfAccount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_idx" ON "JournalEntry"("tenantId");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_sourceType_sourceId_idx" ON "JournalEntry"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_status_idx" ON "JournalEntry"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tenantId_entryNumber_key" ON "JournalEntry"("tenantId", "entryNumber");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_tenantId_provider_key" ON "IntegrationConfig"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "ClaimFraudAlert_tenantId_idx" ON "ClaimFraudAlert"("tenantId");

-- CreateIndex
CREATE INDEX "ClaimFraudAlert_claimId_idx" ON "ClaimFraudAlert"("claimId");

-- CreateIndex
CREATE INDEX "ClaimFraudAlert_resolved_idx" ON "ClaimFraudAlert"("resolved");

-- CreateIndex
CREATE INDEX "Complaint_tenantId_idx" ON "Complaint"("tenantId");

-- CreateIndex
CREATE INDEX "Complaint_memberId_idx" ON "Complaint"("memberId");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "CoContributionRule_tenantId_idx" ON "CoContributionRule"("tenantId");

-- CreateIndex
CREATE INDEX "CoContributionRule_packageId_idx" ON "CoContributionRule"("packageId");

-- CreateIndex
CREATE INDEX "CoContributionRule_packageId_benefitCategory_networkTier_idx" ON "CoContributionRule"("packageId", "benefitCategory", "networkTier");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualCoContributionCap_packageId_key" ON "AnnualCoContributionCap"("packageId");

-- CreateIndex
CREATE INDEX "AnnualCoContributionCap_tenantId_idx" ON "AnnualCoContributionCap"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CoContributionTransaction_claimId_key" ON "CoContributionTransaction"("claimId");

-- CreateIndex
CREATE INDEX "CoContributionTransaction_tenantId_idx" ON "CoContributionTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "CoContributionTransaction_memberId_idx" ON "CoContributionTransaction"("memberId");

-- CreateIndex
CREATE INDEX "CoContributionTransaction_collectionStatus_idx" ON "CoContributionTransaction"("collectionStatus");

-- CreateIndex
CREATE INDEX "MemberAnnualCoContribution_tenantId_idx" ON "MemberAnnualCoContribution"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAnnualCoContribution_memberId_membershipYear_key" ON "MemberAnnualCoContribution"("memberId", "membershipYear");

-- CreateIndex
CREATE INDEX "FamilyAnnualCoContribution_tenantId_idx" ON "FamilyAnnualCoContribution"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyAnnualCoContribution_principalMemberId_membershipYear_key" ON "FamilyAnnualCoContribution"("principalMemberId", "membershipYear");

-- CreateIndex
CREATE INDEX "_FundAdminGroups_B_index" ON "_FundAdminGroups"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBenefitTier" ADD CONSTRAINT "GroupBenefitTier_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBenefitTier" ADD CONSTRAINT "GroupBenefitTier_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_benefitTierId_fkey" FOREIGN KEY ("benefitTierId") REFERENCES "GroupBenefitTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWebAuthnCredential" ADD CONSTRAINT "MemberWebAuthnCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWebAuthnCredential" ADD CONSTRAINT "MemberWebAuthnCredential_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnRegistrationChallenge" ADD CONSTRAINT "WebAuthnRegistrationChallenge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnRegistrationChallenge" ADD CONSTRAINT "WebAuthnRegistrationChallenge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnEnrollmentApproval" ADD CONSTRAINT "WebAuthnEnrollmentApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnEnrollmentApproval" ADD CONSTRAINT "WebAuthnEnrollmentApproval_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnEnrollmentApproval" ADD CONSTRAINT "WebAuthnEnrollmentApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInChallenge" ADD CONSTRAINT "CheckInChallenge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInChallenge" ADD CONSTRAINT "CheckInChallenge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInChallenge" ADD CONSTRAINT "CheckInChallenge_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInChallenge" ADD CONSTRAINT "CheckInChallenge_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInChallenge" ADD CONSTRAINT "CheckInChallenge_signedCredentialId_fkey" FOREIGN KEY ("signedCredentialId") REFERENCES "MemberWebAuthnCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CheckInChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_overrideById_fkey" FOREIGN KEY ("overrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "MemberWebAuthnCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCheckInNotification" ADD CONSTRAINT "MemberCheckInNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCheckInNotification" ADD CONSTRAINT "MemberCheckInNotification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCheckInNotification" ADD CONSTRAINT "MemberCheckInNotification_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CheckInChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCheckInNotification" ADD CONSTRAINT "MemberCheckInNotification_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "MemberWebAuthnCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitVerification" ADD CONSTRAINT "VisitVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitVerification" ADD CONSTRAINT "VisitVerification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitVerification" ADD CONSTRAINT "VisitVerification_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitVerification" ADD CONSTRAINT "VisitVerification_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CheckInChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitVerification" ADD CONSTRAINT "VisitVerification_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfFundedAccount" ADD CONSTRAINT "SelfFundedAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfFundedAccount" ADD CONSTRAINT "SelfFundedAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_selfFundedAccountId_fkey" FOREIGN KEY ("selfFundedAccountId") REFERENCES "SelfFundedAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundTransaction" ADD CONSTRAINT "FundTransaction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalMatrix" ADD CONSTRAINT "ApprovalMatrix_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageVersion" ADD CONSTRAINT "PackageVersion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitConfig" ADD CONSTRAINT "BenefitConfig_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitUsage" ADD CONSTRAINT "BenefitUsage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitUsage" ADD CONSTRAINT "BenefitUsage_benefitConfigId_fkey" FOREIGN KEY ("benefitConfigId") REFERENCES "BenefitConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_toGroupId_fkey" FOREIGN KEY ("toGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_toBenefitTierId_fkey" FOREIGN KEY ("toBenefitTierId") REFERENCES "GroupBenefitTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_preauthId_fkey" FOREIGN KEY ("preauthId") REFERENCES "PreAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_paymentVoucherId_fkey" FOREIGN KEY ("paymentVoucherId") REFERENCES "PaymentVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjudicationLog" ADD CONSTRAINT "AdjudicationLog_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDiagnosisTariff" ADD CONSTRAINT "ProviderDiagnosisTariff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_pricingModelId_fkey" FOREIGN KEY ("pricingModelId") REFERENCES "PricingModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_endorsementId_fkey" FOREIGN KEY ("endorsementId") REFERENCES "Endorsement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_preauthId_fkey" FOREIGN KEY ("preauthId") REFERENCES "PreAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_endorsementId_fkey" FOREIGN KEY ("endorsementId") REFERENCES "Endorsement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_preauthId_fkey" FOREIGN KEY ("preauthId") REFERENCES "PreAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionLog" ADD CONSTRAINT "ExceptionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionLog" ADD CONSTRAINT "ExceptionLog_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionLog" ADD CONSTRAINT "ExceptionLog_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionLog" ADD CONSTRAINT "ExceptionLog_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimFraudAlert" ADD CONSTRAINT "ClaimFraudAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimFraudAlert" ADD CONSTRAINT "ClaimFraudAlert_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoContributionRule" ADD CONSTRAINT "CoContributionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoContributionRule" ADD CONSTRAINT "CoContributionRule_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualCoContributionCap" ADD CONSTRAINT "AnnualCoContributionCap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualCoContributionCap" ADD CONSTRAINT "AnnualCoContributionCap_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoContributionTransaction" ADD CONSTRAINT "CoContributionTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoContributionTransaction" ADD CONSTRAINT "CoContributionTransaction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoContributionTransaction" ADD CONSTRAINT "CoContributionTransaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoContributionTransaction" ADD CONSTRAINT "CoContributionTransaction_coContributionRuleId_fkey" FOREIGN KEY ("coContributionRuleId") REFERENCES "CoContributionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAnnualCoContribution" ADD CONSTRAINT "MemberAnnualCoContribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAnnualCoContribution" ADD CONSTRAINT "MemberAnnualCoContribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAnnualCoContribution" ADD CONSTRAINT "FamilyAnnualCoContribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAnnualCoContribution" ADD CONSTRAINT "FamilyAnnualCoContribution_principalMemberId_fkey" FOREIGN KEY ("principalMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FundAdminGroups" ADD CONSTRAINT "_FundAdminGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FundAdminGroups" ADD CONSTRAINT "_FundAdminGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
