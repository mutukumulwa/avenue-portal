-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PayerType" AS ENUM ('INSURER', 'HMO', 'EMPLOYER_SELF_FUNDED', 'GOVERNMENT_SCHEME', 'TPA_CLAIMS_MANAGER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "TerminologyScope" AS ENUM ('SYSTEM', 'HOUSE', 'CLIENT', 'LOCALE');

-- CreateEnum
CREATE TYPE "TerminologyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'CLAIMS_OFFICER', 'FINANCE_OFFICER', 'UNDERWRITER', 'CUSTOMER_SERVICE', 'MEDICAL_OFFICER', 'REPORTS_VIEWER', 'BROKER_USER', 'MEMBER_USER', 'HR_MANAGER', 'FUND_ADMINISTRATOR', 'PROVIDER_USER');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('PROSPECT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LAPSED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "FundingMode" AS ENUM ('INSURED', 'SELF_FUNDED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('CORPORATE', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "FamilySize" AS ENUM ('M', 'M_1', 'M_2', 'M_3', 'M_4', 'M_5', 'M_6', 'M_7', 'M_7_PLUS');

-- CreateEnum
CREATE TYPE "AdminFeeMethod" AS ENUM ('FLAT_PER_INSURED', 'PCT_OF_CLAIMS', 'PMPM', 'CASE_MGMT', 'PREAUTH', 'CROSS_BORDER', 'CARD_ISSUANCE', 'CARD_REPLACEMENT');

-- CreateEnum
CREATE TYPE "AdminFeeLedgerStatus" AS ENUM ('ACCRUED', 'INVOICED', 'WAIVED');

-- CreateEnum
CREATE TYPE "LicenceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "DsrType" AS ENUM ('ACCESS', 'CORRECTION', 'OBJECTION', 'ERASURE');

-- CreateEnum
CREATE TYPE "DsrStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'FULFILLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BreachSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudInvestigationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SUBSTANTIATED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FundTransactionType" AS ENUM ('DEPOSIT', 'TOP_UP', 'CLAIM_DEDUCTION', 'ADMIN_FEE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ServiceRequestCategory" AS ENUM ('MEMBER_QUERY', 'CLAIM_QUERY', 'INVOICE_QUERY', 'CARD_REQUEST', 'BENEFIT_QUERY', 'GENERAL');

-- CreateEnum
CREATE TYPE "ServiceRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'LAPSED', 'LAPSED_BEFORE_ACTIVATION', 'TERMINATED', 'CANCELLED_COOLING_OFF', 'TERMINATED_FRAUD', 'TERMINATED_BREACH', 'TERMINATED_DEATH', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MemberRelationship" AS ENUM ('PRINCIPAL', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING');

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
CREATE TYPE "MemberNotificationType" AS ENUM ('PREAUTH_STATUS', 'PAYMENT_STATUS', 'BENEFIT_ALERT', 'RENEWAL_REMINDER', 'DOCUMENT_AVAILABLE', 'CLAIM_STATUS', 'SUPPORT_MESSAGE', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "MemberNotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "MemberHealthFileCategory" AS ENUM ('LAB_RESULT', 'RADIOLOGY', 'PRESCRIPTION', 'DISCHARGE_SUMMARY', 'REFERRAL', 'VACCINATION', 'CLAIM_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "MemberHealthJournalType" AS ENUM ('NOTE', 'SYMPTOM', 'MEDICATION', 'QUESTION', 'VOICE_NOTE');

-- CreateEnum
CREATE TYPE "MemberHealthVisibility" AS ENUM ('PRIVATE', 'SHARED_WITH_DOCTOR');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('STAMP_DUTY', 'TRAINING_LEVY', 'PHCF');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('CLAIM_PAYMENT', 'PREAUTH_GOP', 'LIMIT_OVERRIDE', 'SCHEME_ACTIVATION', 'COMMISSION_CHANGE', 'MEMBER_ENDORSEMENT', 'PROVIDER_TARIFF_CHANGE', 'FUND_TOPUP', 'WRITEOFF_REFUND', 'AUTO_ADJ_POLICY_CHANGE', 'CLINICAL_PROTOCOL_CHANGE');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncOperationState" AS ENUM ('PENDING', 'SYNCED', 'CONFLICT', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfflineAuthStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('INDIVIDUAL', 'FAMILY', 'GROUP', 'CORPORATE');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('INPATIENT', 'OUTPATIENT', 'MATERNITY', 'DENTAL', 'OPTICAL', 'MENTAL_HEALTH', 'CHRONIC_DISEASE', 'SURGICAL', 'AMBULANCE_EMERGENCY', 'LAST_EXPENSE', 'WELLNESS_PREVENTIVE', 'REHABILITATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FundingModelType" AS ENUM ('FEE_FOR_SERVICE', 'CAPITATION', 'HYBRID');

-- CreateEnum
CREATE TYPE "LimitScope" AS ENUM ('MEMBER', 'FAMILY');

-- CreateEnum
CREATE TYPE "EndorsementType" AS ENUM ('MEMBER_ADDITION', 'MEMBER_DELETION', 'DEPENDENT_ADDITION', 'DEPENDENT_DELETION', 'PACKAGE_UPGRADE', 'PACKAGE_DOWNGRADE', 'AGE_BAND_CHANGE', 'BENEFIT_MODIFICATION', 'SALARY_CHANGE', 'GROUP_DATA_CHANGE', 'TIER_CHANGE', 'SCHEME_TRANSFER', 'CORRECTION', 'BENEFICIARY_UPDATE', 'BANKING_DETAILS_UPDATE', 'MID_TERM_RATE_CHANGE');

-- CreateEnum
CREATE TYPE "EndorsementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProRataType" AS ENUM ('CHARGE', 'CREDIT', 'ZERO');

-- CreateEnum
CREATE TYPE "ClaimSubmissionType" AS ENUM ('ORIGINAL', 'CORRECTION', 'RESUBMISSION', 'RECONSIDERATION');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('INCURRED', 'RECEIVED', 'CAPTURED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'DECLINED', 'PAID', 'APPEALED', 'APPEAL_APPROVED', 'APPEAL_DECLINED', 'VOID', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ClaimSource" AS ENUM ('MANUAL', 'REIMBURSEMENT', 'PREAUTH', 'SMART', 'SLADE360', 'HMS', 'BATCH', 'OFFLINE_SYNC', 'USSD', 'SMS');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'DAY_CASE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ClaimLineCategory" AS ENUM ('CONSULTATION', 'LABORATORY', 'PHARMACY', 'IMAGING', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimLineDecision" AS ENUM ('APPROVED', 'APPROVED_WITH_ADJUSTMENT', 'DECLINED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'MAKER_SUBMITTED', 'CHECKER_APPROVED', 'SETTLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReasonSeverity" AS ENUM ('REJECT', 'SHORTFALL', 'PEND', 'INFO');

-- CreateEnum
CREATE TYPE "PreauthStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'EXPIRED', 'ATTACHED', 'UTILISED', 'CONVERTED_TO_CLAIM', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'PENDING_CLOSURE', 'CLOSED_FILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('INPATIENT_ADMISSION', 'OUTPATIENT_EPISODE', 'MATERNITY', 'DAY_CASE', 'CHRONIC_CYCLE');

-- CreateEnum
CREATE TYPE "LouStatus" AS ENUM ('DRAFT', 'ISSUED', 'EXHAUSTED', 'UTILISED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('HOSPITAL', 'CLINIC', 'PHARMACY', 'LABORATORY', 'DENTAL', 'OPTICAL', 'REHABILITATION');

-- CreateEnum
CREATE TYPE "ProviderTier" AS ENUM ('OWN', 'PARTNER', 'PANEL');

-- CreateEnum
CREATE TYPE "PreauthIntakeStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'PROCESSING');

-- CreateEnum
CREATE TYPE "PreauthInfoRequestStatus" AS ENUM ('OPEN', 'RESPONDED', 'ACCEPTED', 'REOPENED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "TariffType" AS ENUM ('NEGOTIATED', 'PUBLISHED', 'GAZETTED');

-- CreateEnum
CREATE TYPE "TariffRateType" AS ENUM ('FIXED', 'DISCOUNT_OFF_BILLED', 'MARKUP_OVER_COST', 'PER_DIEM', 'EXTERNAL_TARIFF_REF', 'NET_OF_EXTERNAL', 'CAPITATION', 'AVERAGE_COST_POOL');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PER_ITEM', 'PER_HOUR', 'PER_DAY', 'PER_VISIT', 'PER_SESSION', 'PER_EPISODE', 'PER_ADMISSION', 'PER_PROCEDURE', 'PER_CONSULTATION', 'PER_KM_BAND');

-- CreateEnum
CREATE TYPE "FrequencyPeriod" AS ENUM ('DAY', 'VISIT', 'ADMISSION', 'YEAR');

-- CreateEnum
CREATE TYPE "CodingSystem" AS ENUM ('CPT', 'ICD10', 'LOCAL', 'SHA_PACKAGE');

-- CreateEnum
CREATE TYPE "PatientClass" AS ENUM ('OP', 'IP', 'OT');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('HEADLINE', 'LABORATORY', 'IMAGING', 'PHARMACY', 'THEATRE', 'PROFESSIONAL_FEES', 'OTHER');

-- CreateEnum
CREATE TYPE "ProviderContractStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PENDING_CLARIFICATION', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'SUPERSEDED', 'ARCHIVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('MASTER_SERVICE_AGREEMENT', 'RATE_SCHEDULE', 'PACKAGE_AGREEMENT', 'CASE_RATE_AGREEMENT', 'RECONCILIATION_AGREEMENT', 'ADDENDUM', 'GOVERNMENT_SCHEME_CONTRACT');

-- CreateEnum
CREATE TYPE "ContractBranchScope" AS ENUM ('ALL_BRANCHES', 'LISTED');

-- CreateEnum
CREATE TYPE "ContractExecutionStatus" AS ENUM ('FULLY_EXECUTED', 'PROVIDER_ONLY', 'UNSIGNED');

-- CreateEnum
CREATE TYPE "PaymentTermType" AS ENUM ('CALENDAR', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubmissionWindowBasis" AS ENUM ('SERVICE_DATE', 'DISCHARGE_DATE', 'INVOICE_DATE', 'MONTHLY_BATCH');

-- CreateEnum
CREATE TYPE "BalanceBillingPolicy" AS ENUM ('PROHIBITED', 'ALLOWED_NONCOVERED_WITH_CONSENT', 'ALLOWED');

-- CreateEnum
CREATE TYPE "ReconciliationCadence" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUAL');

-- CreateEnum
CREATE TYPE "TaxInclusivity" AS ENUM ('INCLUSIVE', 'EXCLUSIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContractVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "UnlistedServiceRule" AS ENUM ('PAY_AS_BILLED', 'DISCOUNT_OFF_BILLED', 'REFER_FOR_REVIEW', 'REJECT');

-- CreateEnum
CREATE TYPE "ExclusionLevel" AS ENUM ('CONTRACT', 'CATEGORY', 'TARIFF_LINE', 'DIAGNOSIS', 'PLAN', 'MEMBER_CATEGORY', 'DATE_RANGE');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('UPLOADED', 'PARSED', 'REVIEWED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('COMPUTED', 'APPROVED', 'REJECTED', 'SETTLED');

-- CreateEnum
CREATE TYPE "ContractRuleScope" AS ENUM ('CONTRACT', 'CATEGORY', 'LINE', 'PACKAGE');

-- CreateEnum
CREATE TYPE "PricingRuleKind" AS ENUM ('FIXED', 'DISCOUNT_OFF_BILLED', 'MARKUP_OVER_COST', 'MAX_CAP', 'MIN_FLOOR', 'PER_DIEM', 'PER_VISIT_CASE_RATE', 'PER_ADMISSION', 'PER_PROCEDURE', 'PER_CONSULTATION', 'PER_ITEM', 'PER_SESSION', 'PACKAGE', 'CAPITATION', 'NET_OF_EXTERNAL', 'EXTERNAL_TARIFF_REF', 'AVERAGE_COST_POOL', 'LOWER_OF', 'HIGHER_OF');

-- CreateEnum
CREATE TYPE "PackageTriggerType" AS ENUM ('PROCEDURE_CODE', 'DIAGNOSIS_CODE', 'SERVICE_DESCRIPTION');

-- CreateEnum
CREATE TYPE "ComplicationRule" AS ENUM ('EXCLUDED_BILL_SEPARATELY', 'INCLUDED', 'ESCALATE');

-- CreateEnum
CREATE TYPE "PackageComponentType" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PreauthTriggerType" AS ENUM ('SERVICE_LIST', 'AMOUNT_THRESHOLD', 'ADMISSION', 'LOS_BEYOND', 'ALWAYS');

-- CreateEnum
CREATE TYPE "PreauthConsequence" AS ENUM ('REJECT', 'ROUTE_MANUAL', 'PAY_WITH_PENALTY');

-- CreateEnum
CREATE TYPE "ContractDocumentType" AS ENUM ('INVOICE', 'ITEMISED_BILL', 'CLAIM_FORM', 'PRESCRIPTION', 'LAB_REQUEST', 'LAB_RESULT', 'DOCTOR_NOTES', 'DISCHARGE_SUMMARY', 'CARE_PLAN', 'MEDICAL_REPORT', 'REFERRAL_LETTER', 'PREAUTH_APPROVAL', 'THEATRE_NOTES', 'DELIVERY_NOTES', 'IMAGING_REPORT', 'RADIOLOGY_REPORT_STRUCTURED', 'OTHER');

-- CreateEnum
CREATE TYPE "DocConsequence" AS ENUM ('REJECT', 'ROUTE', 'PEND_PROVIDER');

-- CreateEnum
CREATE TYPE "EligibilityRule" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "TreatmentExclusionType" AS ENUM ('ABSOLUTE', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "TreatmentExclusionCategory" AS ENUM ('COSMETIC', 'EXPERIMENTAL', 'CONGENITAL', 'ELECTIVE', 'LIFESTYLE', 'DENTAL_ELECTIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "PractitionerCredentialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReinstatementStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM ('MASTER_BROKER', 'SUB_AGENT', 'TIED_AGENT', 'INDIVIDUAL_PRODUCER', 'BANCASSURANCE');

-- CreateEnum
CREATE TYPE "IntermediaryCategory" AS ENUM ('REGULATED_BROKER', 'REGULATED_AGENT', 'INTRODUCER', 'REFERRAL_PARTNER', 'INTERNAL_SALES', 'CORPORATE_AFFINITY', 'BANCASSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('COMMISSION', 'REFERRAL_FEE', 'ATTRIBUTION_ONLY', 'NONE');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('IRA_LICENSE', 'KRA_PIN_CERTIFICATE', 'CR12', 'PROFESSIONAL_INDEMNITY', 'BANK_CONFIRMATION', 'DIRECTORS_ID', 'TAX_COMPLIANCE_CERTIFICATE', 'ENGAGEMENT_LETTER', 'REFERRAL_AGREEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommissionScheduleType" AS ENUM ('FLAT_PERCENTAGE', 'TIERED_VOLUME', 'TIERED_LOSS_RATIO', 'HYBRID_FLAT_PLUS_OVERRIDE', 'PERFORMANCE_LINKED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TierMetric" AS ENUM ('GROSS_CONTRIBUTION_BAND', 'MEMBER_COUNT_BAND', 'LOSS_RATIO_BAND', 'RENEWAL_RETENTION_BAND');

-- CreateEnum
CREATE TYPE "CommissionState" AS ENUM ('PENDING_RECONCILIATION', 'EARNED', 'ACCRUED', 'PAYABLE', 'PAID', 'CLAWED_BACK', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PayoutBatchStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'PARTIAL_FAILURE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('PENDING_VALIDATION', 'PENDING_ASSESSMENT', 'ASSESSED', 'ASSESSED_PENDING_SENIOR_APPROVAL', 'DECLINED_BY_UNDERWRITING', 'WITHDRAWN_BY_SUBMITTER', 'DRAFT', 'SENT', 'REVISED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UWDecisionType" AS ENUM ('STANDARD', 'LOADED', 'EXCLUSION', 'WAITING_PERIOD', 'DECLINED');

-- CreateEnum
CREATE TYPE "LifeRole" AS ENUM ('PRINCIPAL', 'DEPENDANT');

-- CreateEnum
CREATE TYPE "DocumentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED', 'QUARANTINED', 'ERROR');

-- CreateEnum
CREATE TYPE "DocumentSourceType" AS ENUM ('OPERATOR', 'PROVIDER_USER', 'PROVIDER_API', 'CONNECTOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "DocumentTargetType" AS ENUM ('CLAIM', 'PREAUTH', 'CASE', 'INFORMATION_REQUEST', 'RECONSIDERATION', 'PAYMENT_QUERY', 'PROFILE_CHANGE', 'GROUP', 'ENDORSEMENT', 'QUOTATION', 'BROKER', 'MEMBER_HEALTH', 'OTHER');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "GLSourceType" AS ENUM ('INVOICE_ISSUED', 'PREMIUM_RECEIVED', 'CLAIM_APPROVED', 'CLAIM_PAID', 'CLAIM_VOID', 'SETTLEMENT_PAID', 'COMMISSION_EARNED', 'ENDORSEMENT_ADJUSTMENT', 'CO_CONTRIBUTION_COLLECTED', 'CO_CONTRIBUTION_WAIVED', 'MANUAL');

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

-- CreateEnum
CREATE TYPE "MemberCoContributionPaymentStatus" AS ENUM ('INITIATED', 'PENDING_CALLBACK', 'CONFIRMED', 'FAILED', 'TIMED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnalyticsEncounterType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'DAY_CASE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnalyticsAlertType" AS ENUM ('MLR_DRIFT', 'UTILIZATION_SPIKE', 'PROVIDER_ANOMALY', 'RENEWAL_RISK', 'MEMBER_RISK', 'CONTRIBUTION_SHORTFALL');

-- CreateEnum
CREATE TYPE "AnalyticsAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnalyticsAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "GroupRenewalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'QUOTE_ISSUED', 'NEGOTIATING', 'BOUND', 'LAPSED', 'CANCELLED', 'WITHDRAWN');

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

-- CreateEnum
CREATE TYPE "CancellationType" AS ENUM ('COOLING_OFF', 'STANDARD', 'SCHEME_CLOSURE');

-- CreateEnum
CREATE TYPE "TerminationType" AS ENUM ('FRAUD', 'BREACH', 'DEATH', 'NON_RENEWAL');

-- CreateEnum
CREATE TYPE "AcceptanceMethod" AS ENUM ('PORTAL_CLICK', 'EMAIL_REPLY', 'SIGNED_LETTER', 'PAYMENT_INITIATED');

-- CreateEnum
CREATE TYPE "BindingDocType" AS ENUM ('MEMBERSHIP_CERTIFICATE', 'BENEFIT_SCHEDULE', 'WELCOME_PACK', 'SCHEME_BINDER', 'TERMS_AND_CONDITIONS');

-- CreateEnum
CREATE TYPE "FundDepositStatus" AS ENUM ('PENDING', 'PARTIALLY_RECEIVED', 'RECEIVED', 'WAIVED');

-- CreateEnum
CREATE TYPE "QuotationLineType" AS ENUM ('BASE_CONTRIBUTION', 'LOADING_PER_LIFE', 'LOADING_SCHEME', 'DISCOUNT_GROUP_SIZE', 'DISCOUNT_LOYALTY', 'DISCOUNT_CUSTOM', 'STAMP_DUTY', 'TRAINING_LEVY', 'PHCF', 'CARD_ISSUANCE_FEE', 'SMART_CARD_FEE', 'WELCOME_PACK_FEE', 'CO_CONTRIBUTION_PROVISION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PricingFileType" AS ENUM ('EXCEL', 'PYTHON');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('RECEIPT_PHOTO', 'MPESA_SMS', 'BANK_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReimbursementPaymentMethod" AS ENUM ('BANK_TRANSFER', 'MPESA');

-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('BACK_DATED_AMENDMENT', 'BACK_DATED_COVER_START', 'RATE_DEVIATION_EXCEED', 'PRE_AUTH_OVER_BENEFIT_CAP', 'CLAIM_EXCLUDED_DIAGNOSIS', 'FORCE_APPROVE_FRAUD_CLAIM', 'WAIVE_CO_CONTRIBUTION', 'EXTEND_GRACE_PERIOD', 'MID_TERM_RATE_CHANGE', 'FRAUD_RULE_THRESHOLD_ADJUSTMENT', 'RESTORE_TERMINATED_MEMBERSHIP', 'PRIVILEGE_ESCALATION', 'PAY_MISSING_RATE', 'PAY_ABOVE_CONTRACT_RATE', 'PAY_DESPITE_EXPIRED_CONTRACT', 'PAY_DESPITE_MISSING_PREAUTH', 'PAY_DESPITE_MISSING_DOCS', 'PAY_DESPITE_LATE_SUBMISSION', 'APPLY_ALTERNATIVE_TARIFF', 'APPLY_PACKAGE_MANUALLY', 'SPLIT_CLAIM_LINE', 'RECLASSIFY_SERVICE_CATEGORY', 'MAP_SERVICE_TO_TARIFF', 'CREATE_TEMPORARY_RATE', 'ESCALATE_TO_CONTRACT_TEAM', 'ESCALATE_TO_PAYER', 'ESCALATE_TO_MEDICAL_REVIEW', 'CONTRACT_BACKDATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OverrideStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OverrideReasonCode" AS ENUM ('ADMINISTRATIVE_CORRECTION', 'EXCEPTIONAL_BUSINESS_CASE', 'REGULATORY_REQUIREMENT', 'CLIENT_RETENTION', 'CLINICAL_NECESSITY', 'SYSTEM_ERROR_CORRECTION', 'MANAGEMENT_INSTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "BlacklistReason" AS ENUM ('FRAUD_CONFIRMED', 'MISREPRESENTATION', 'TERMS_BREACH', 'COURT_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "CrossBorderCaseStatus" AS ENUM ('SOURCING', 'ESTIMATED', 'GOP_ISSUED', 'IN_TREATMENT', 'INVOICED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrossBorderLineKind" AS ENUM ('ESTIMATE', 'INVOICE');

-- CreateEnum
CREATE TYPE "WellnessProgramType" AS ENUM ('SCREENING', 'CHRONIC_DISEASE_MGMT', 'INCENTIVE');

-- CreateEnum
CREATE TYPE "WellnessEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN', 'LAPSED');

-- CreateEnum
CREATE TYPE "WellnessActivityType" AS ENUM ('SCREENING_COMPLETED', 'HEALTH_CHECK', 'VITALS_LOGGED', 'IMMUNIZATION', 'COACHING_SESSION', 'PHYSICAL_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimIntakeChannel" AS ENUM ('ADMIN_PORTAL', 'PROVIDER_PORTAL', 'API_V1', 'TRPC', 'CSV_IMPORT', 'OFFLINE_SYNC', 'REIMBURSEMENT', 'PREAUTH_CONVERSION', 'CASE_INTERIM', 'CASE_FINAL', 'SMART', 'SLADE360');

-- CreateEnum
CREATE TYPE "ClaimIntakeReceiptState" AS ENUM ('PROCESSING', 'SUCCEEDED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClaimProcessingTrigger" AS ENUM ('INITIAL', 'MANUAL_REPROCESS', 'DUPLICATE_CLEARED', 'DOCUMENTS_UPDATED', 'CONFIG_CHANGED', 'RECOVERY');

-- CreateEnum
CREATE TYPE "ClaimProcessingState" AS ENUM ('PENDING', 'RUNNING', 'ROUTED', 'SHADOW_COMPLETE', 'AUTO_DECIDED', 'RETRYABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "ClaimProcessingStageName" AS ENUM ('CONTEXT', 'ELIGIBILITY', 'CODING', 'DOCUMENTS', 'DUPLICATE', 'CLINICAL', 'CONTRACT', 'PREAUTH', 'BENEFIT', 'FRAUD', 'COST_SHARE', 'POLICY', 'DECISION', 'NOTIFICATION', 'AUDIT');

-- CreateEnum
CREATE TYPE "ClaimProcessingStageState" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'ROUTED', 'SKIPPED', 'RETRYABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "AutoAdjudicationMode" AS ENUM ('OFF', 'SHADOW', 'LIVE');

-- CreateEnum
CREATE TYPE "AutoAdjudicationPolicyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ReconsiderationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'TRIAGE', 'INFORMATION_REQUIRED', 'PROVIDER_RESPONDED', 'UNDER_REVIEW', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'UPHELD', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('PENDING', 'RELEASED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReconciliationExceptionType" AS ENUM ('LINE_HEADER_MISMATCH', 'CLAIM_BATCH_MISMATCH', 'VOUCHER_MISMATCH', 'MISSING_VOUCHER', 'OVER_DISBURSED', 'BASE_GL_MISMATCH');

-- CreateEnum
CREATE TYPE "ReconciliationInvestigationStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "PaymentQueryStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'INFORMATION_REQUIRED', 'PROVIDER_RESPONDED', 'RESOLVED', 'REJECTED', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentQueryCategory" AS ENUM ('MISSING_PAYMENT', 'SHORT_PAYMENT', 'WRONG_AMOUNT', 'WRONG_REFERENCE', 'DUPLICATE_PAYMENT', 'UNIDENTIFIED_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MasterDataChangeCategory" AS ENUM ('CONTACT', 'BRANCH', 'PRACTITIONER', 'CREDENTIAL', 'BANK', 'INTEGRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "MasterDataChangeStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED', 'PROVIDER_RESPONDED', 'PENDING_CHECKER', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MasterDataChangeRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ImprovementPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ACHIEVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImprovementActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ImprovementOwnerRole" AS ENUM ('NETWORK', 'PROVIDER');

-- CreateEnum
CREATE TYPE "PerformanceScoreStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FROZEN');

-- CreateEnum
CREATE TYPE "ProviderIntegrationMode" AS ENUM ('PUSH', 'PULL', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "ProviderIntegrationStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationCircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateEnum
CREATE TYPE "IntegrationDeliveryDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "IntegrationDeliveryStatus" AS ENUM ('RECEIVED', 'VALIDATING', 'ACCEPTED', 'PARTIAL', 'REJECTED', 'RETRYING', 'QUARANTINED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CapitationRateBasis" AS ENUM ('PMPM', 'PER_VISIT', 'FIXED_PERIOD');

-- CreateEnum
CREATE TYPE "CapitationArrangementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CapitationPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'FROZEN', 'PAID', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CapitationFunding" AS ENUM ('INCLUDED', 'CARVE_OUT');

-- CreateEnum
CREATE TYPE "ClinicalCodeSystem" AS ENUM ('ICD10', 'ICD11');

-- CreateEnum
CREATE TYPE "ClinicalMappingProvenance" AS ENUM ('AUTHORED', 'GENERATED_CROSSWALK');

-- CreateEnum
CREATE TYPE "ClinicalLabLinkType" AS ENUM ('SUPPORTED', 'CONFIRMATORY');

-- CreateEnum
CREATE TYPE "ClinicalAliasMatchType" AS ENUM ('CPT_CODE', 'SERVICE_CODE', 'NORMALIZED_NAME');

-- CreateEnum
CREATE TYPE "ClinicalProtocolPackStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ClinicalVerdict" AS ENUM ('TRUE_POSITIVE', 'FALSE_POSITIVE', 'UNSURE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#000523',
    "accentColor" TEXT NOT NULL DEFAULT '#06B9AB',
    "warmColor" TEXT NOT NULL DEFAULT '#F2715A',
    "fontHeading" TEXT NOT NULL DEFAULT 'Sora',
    "fontBody" TEXT NOT NULL DEFAULT 'Hanken Grotesk',
    "domain" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "operatorTenantId" TEXT NOT NULL,
    "parentClientId" TEXT,
    "type" "PayerType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "memberNumberPrefix" TEXT NOT NULL DEFAULT 'MVX',
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "warmColor" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminologyEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" "TerminologyScope" NOT NULL,
    "clientId" TEXT,
    "locale" TEXT,
    "key" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "context" TEXT,
    "status" "TerminologyStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminologyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminologyApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminologyApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailedLoginAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brokerId" TEXT,
    "memberId" TEXT,
    "groupId" TEXT,
    "providerId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminFeeAgreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "groupId" TEXT,
    "method" "AdminFeeMethod" NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminFeeAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminFeeLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "agreementId" TEXT,
    "method" "AdminFeeMethod" NOT NULL,
    "period" TEXT NOT NULL,
    "basis" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "status" "AdminFeeLedgerStatus" NOT NULL DEFAULT 'ACCRUED',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminFeeLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryLicence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuer" TEXT NOT NULL DEFAULT 'IRA-UG',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "LicenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityDeposit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "evidenceRef" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRegister" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "isResident" BOOLEAN NOT NULL DEFAULT false,
    "appointedAt" TIMESTAMP(3) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DirectorRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndemnityCover" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "sumInsured" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndemnityCover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceLevyComputation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "feesReceivedBasis" DECIMAL(65,30) NOT NULL,
    "ratePercent" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generatedReturnRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceLevyComputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lawfulBasis" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "DsrType" NOT NULL,
    "status" "DsrStatus" NOT NULL DEFAULT 'RECEIVED',
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "fulfilmentRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessorRegister" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "dataCategories" TEXT[],
    "location" TEXT,
    "dpaRef" TEXT,
    "subProcessors" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessorRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "severity" "BreachSeverity" NOT NULL,
    "notifiableBy" TIMESTAMP(3),
    "regulatorNotified" BOOLEAN NOT NULL DEFAULT false,
    "narrative" TEXT,
    "remediation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreachIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudInvestigation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT,
    "fraudAlertId" TEXT,
    "status" "FraudInvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "findings" TEXT,
    "outcome" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "FraudInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL DEFAULT '',
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
    "renewalStatus" "GroupRenewalStatus",
    "supersededByGroupId" TEXT,
    "renewalNoticeDispatchedAt" TIMESTAMP(3),
    "priorPeriodReconciled" BOOLEAN NOT NULL DEFAULT false,
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
    "coverStartDate" TIMESTAMP(3),
    "coverEndDate" TIMESTAMP(3),
    "benefitPeriodAnchor" TIMESTAMP(3),
    "birthNotificationDate" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "waitingPeriodEnd" TIMESTAMP(3),
    "smartCardNumber" TEXT,
    "slade360MemberId" TEXT,
    "underwritingDecisionId" TEXT,
    "bindingMakerId" TEXT,
    "bindingCheckerId" TEXT,
    "quotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCoveragePeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberCoveragePeriod_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "MemberNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "MemberNotificationType" NOT NULL,
    "priority" "MemberNotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberHealthFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "MemberHealthFileCategory" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "capturedAt" TIMESTAMP(3),
    "notes" TEXT,
    "visibility" "MemberHealthVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberHealthFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberVitalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "heartRate" INTEGER,
    "temperatureC" DECIMAL(65,30),
    "oxygenSaturation" INTEGER,
    "weightKg" DECIMAL(65,30),
    "bloodSugar" DECIMAL(65,30),
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberVitalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberHealthJournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "entryType" "MemberHealthJournalType" NOT NULL DEFAULT 'NOTE',
    "noteText" TEXT NOT NULL,
    "audioUrl" TEXT,
    "transcriptText" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibility" "MemberHealthVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberHealthJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberHealthShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "providerId" TEXT,
    "preauthId" TEXT,
    "checkInChallengeId" TEXT,
    "healthFileId" TEXT,
    "journalEntryId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberHealthShare_pkey" PRIMARY KEY ("id")
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
    "currency" TEXT NOT NULL DEFAULT 'UGX',
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
    "currency" TEXT NOT NULL DEFAULT 'UGX',
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
    "clientId" TEXT,
    "actionType" "ApprovalActionType" NOT NULL DEFAULT 'CLAIM_PAYMENT',
    "claimValueMin" DECIMAL(65,30),
    "claimValueMax" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "serviceType" "ServiceType",
    "benefitCategory" "BenefitCategory",
    "requiredRole" TEXT NOT NULL,
    "requiresDual" BOOLEAN NOT NULL DEFAULT false,
    "slaMinutes" INTEGER,
    "escalationTargetRole" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "requiredRole" TEXT NOT NULL,
    "slaMinutes" INTEGER,
    "escalationTargetRole" TEXT,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "actionType" "ApprovalActionType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "baseAmount" DECIMAL(65,30),
    "matrixId" TEXT,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "makerId" TEXT NOT NULL,
    "payload" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "source" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoAdjudicationPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxAutoApproveAmount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "requireCleanFraud" BOOLEAN NOT NULL DEFAULT true,
    "requirePreauthWhenNeeded" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mode" "AutoAdjudicationMode" NOT NULL DEFAULT 'OFF',
    "status" "AutoAdjudicationPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "allowAutoPartial" BOOLEAN NOT NULL DEFAULT false,
    "allowedSources" "ClaimSource"[] DEFAULT ARRAY[]::"ClaimSource"[],
    "allowedServiceTypes" "ServiceType"[] DEFAULT ARRAY[]::"ServiceType"[],
    "allowedBenefitCategories" "BenefitCategory"[] DEFAULT ARRAY[]::"BenefitCategory"[],
    "allowedProviderTiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxClaimAgeDays" INTEGER,
    "requireAllLinesPriced" BOOLEAN NOT NULL DEFAULT true,
    "requireDocumentsComplete" BOOLEAN NOT NULL DEFAULT true,
    "requireEligibilityClear" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "approvalRequestId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "deactivationReason" TEXT,
    "clinicalGateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requireClinicalGroup" BOOLEAN NOT NULL DEFAULT false,
    "repeatWindowShortPay" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoAdjudicationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "opKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deviceId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "state" "SyncOperationState" NOT NULL DEFAULT 'PENDING',
    "conflictReason" TEXT,
    "offlineAuthId" TEXT,
    "receiptId" TEXT,
    "resultClaimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "benefitConfigId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "reason" TEXT,
    "syncOperationId" TEXT,
    "state" "SyncOperationState" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilitySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientId" TEXT,
    "active" BOOLEAN NOT NULL,
    "balances" JSONB NOT NULL,
    "tariffRef" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EligibilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineWorkAuthorization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "reason" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "maxOperations" INTEGER,
    "status" "OfflineAuthStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "packId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineWorkAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineDataPack" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "tariffRef" TEXT,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "sizeBytes" INTEGER,

    CONSTRAINT "OfflineDataPack_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "BenefitRider" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitRider_pkey" PRIMARY KEY ("code")
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
    "coInsurancePct" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductibleAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fundingModel" "FundingModelType" NOT NULL DEFAULT 'FEE_FOR_SERVICE',
    "fundingOverrides" JSONB,
    "waitingPeriodDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "exclusions" TEXT[],

    CONSTRAINT "BenefitConfig_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "BenefitUsage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "benefitConfigId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountUsed" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "activeHoldAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductibleMet" DECIMAL(14,2) NOT NULL DEFAULT 0,
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
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "proRataCalculationId" TEXT,
    "makerId" TEXT,
    "approverId" TEXT,
    "backDated" BOOLEAN NOT NULL DEFAULT false,
    "overrideRecordId" TEXT,
    "requiresAssessment" BOOLEAN NOT NULL DEFAULT false,
    "assessmentDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Endorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProRataCalculation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endorsementId" TEXT NOT NULL,
    "previousContribution" DECIMAL(19,4) NOT NULL,
    "newContribution" DECIMAL(19,4) NOT NULL,
    "periodStartDate" TIMESTAMP(3) NOT NULL,
    "periodEndDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "daysRemaining" INTEGER NOT NULL,
    "totalDaysInPeriod" INTEGER NOT NULL,
    "prorataFactor" DECIMAL(10,8) NOT NULL,
    "adjustmentAmount" DECIMAL(19,4) NOT NULL,
    "adjustmentType" "ProRataType" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProRataCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT,
    "caseId" TEXT,
    "caseSliceSeq" INTEGER,
    "isInterimBill" BOOLEAN NOT NULL DEFAULT false,
    "sliceCutoffAt" TIMESTAMP(3),
    "sliceServiceFrom" TIMESTAMP(3),
    "sliceServiceTo" TIMESTAMP(3),
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
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "approvedBaseAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "billedBaseAmount" DECIMAL(19,4),
    "fxRateToBase" DECIMAL(19,8),
    "fxRateDate" TIMESTAMP(3),
    "benefitCategory" "BenefitCategory" NOT NULL,
    "benefitUsageId" TEXT,
    "contractedRate" DECIMAL(14,2),
    "contractedVariancePct" DECIMAL(5,4),
    "contractId" TEXT,
    "contractVersionId" TEXT,
    "contractFamilyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedQueue" TEXT,
    "avgCostPoolId" TEXT,
    "adjudicatorId" TEXT,
    "seniorAdjudicatorId" TEXT,
    "appealReviewerId" TEXT,
    "settlementBatchId" TEXT,
    "autoAdjDecision" TEXT,
    "autoAdjFailingGate" TEXT,
    "autoAdjPolicyId" TEXT,
    "autoAdjudicatedAt" TIMESTAMP(3),
    "intakeSchemaVersion" TEXT,
    "claimRevision" INTEGER NOT NULL DEFAULT 1,
    "strongEventFingerprint" TEXT,
    "suspectedDuplicateFingerprint" TEXT,
    "processingState" "ClaimProcessingState",
    "processingRouteCode" TEXT,
    "costShareDeductible" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costShareCoInsurance" DECIMAL(14,2) NOT NULL DEFAULT 0,
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
    "submissionType" "ClaimSubmissionType" NOT NULL DEFAULT 'ORIGINAL',
    "chainRootClaimId" TEXT,
    "supersedesClaimId" TEXT,
    "supersededByClaimId" TEXT,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugExclusion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "packageId" TEXT,
    "drugCode" TEXT NOT NULL,
    "drugName" TEXT,
    "reason" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjudicationReasonCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "internalDescription" TEXT NOT NULL,
    "providerDescription" TEXT NOT NULL,
    "memberDescription" TEXT NOT NULL,
    "contractRuleRefType" TEXT,
    "defaultSeverity" "ReasonSeverity" NOT NULL DEFAULT 'REJECT',
    "remedy" TEXT,
    "resubmissionAllowed" BOOLEAN NOT NULL DEFAULT false,
    "overrideAllowed" BOOLEAN NOT NULL DEFAULT false,
    "allowedOverrideTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredDocsForReconsideration" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escalationRoute" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdjudicationReasonCode_pkey" PRIMARY KEY ("id")
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
    "drugCode" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "billedAmount" DECIMAL(65,30) NOT NULL,
    "tariffRate" DECIMAL(65,30),
    "approvedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "exceptionRef" TEXT,
    "notes" TEXT,
    "adjudicationDecision" "ClaimLineDecision",
    "adjustedAmount" DECIMAL(14,2),
    "adjustmentReason" TEXT,
    "declineReason" TEXT,
    "serviceCategoryId" TEXT,
    "contractId" TEXT,
    "contractVersionId" TEXT,
    "matchedRuleType" TEXT,
    "matchedRuleId" TEXT,
    "payableSource" TEXT,
    "reasonCodeId" TEXT,
    "contractedAmount" DECIMAL(14,2),
    "shortfallAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "disallowedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "memberLiability" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payerLiability" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "providerWriteOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "externalRebateAmount" DECIMAL(14,2),
    "quantityApproved" INTEGER,
    "ruleTrace" JSONB,

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
    "utilisedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "gopNumber" TEXT,
    "gopIssuedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "declineReasonCode" TEXT,
    "declineNotes" TEXT,
    "declinedBy" TEXT,
    "declinedAt" TIMESTAMP(3),
    "escalationThresholdHours" INTEGER,
    "escalatedAt" TIMESTAMP(3),
    "escalatedToId" TEXT,
    "claimId" TEXT,
    "attachedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "caseId" TEXT,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "slaType" TEXT,
    "slaDeadlineAt" TIMESTAMP(3),
    "slaBreachedAt" TIMESTAMP(3),
    "parentPreAuthId" TEXT,
    "estimatedComponents" JSONB,
    "autoDecisionLog" JSONB,
    "fraudFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT,
    "caseType" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "admissionDate" TIMESTAMP(3),
    "expectedDischargeDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "primaryDiagnoses" JSONB,
    "attendingDoctor" TEXT,
    "benefitCategory" "BenefitCategory" NOT NULL,
    "estimatedCost" DECIMAL(14,2),
    "accruedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseServiceEntry" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "category" "ClaimLineCategory" NOT NULL,
    "serviceCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "enteredById" TEXT,
    "hmsBatchRef" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "billedInClaimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseServiceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterOfUndertaking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "louNumber" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "caseId" TEXT,
    "amountCeiling" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "status" "LouStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterOfUndertaking_pkey" PRIMARY KEY ("id")
);

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
    "legalName" TEXT,
    "registrationNumber" TEXT,
    "licenceNumber" TEXT,
    "licenceExpiry" TIMESTAMP(3),
    "taxPin" TEXT,
    "facilityLevel" TEXT,
    "bankDetailsRef" TEXT,
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
CREATE TABLE "ProviderApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedBranchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "rotationFamilyId" TEXT,
    "previousKeyId" TEXT,
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "allowedIpPolicyRef" TEXT,

    CONSTRAINT "ProviderApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEntitlementShadowSample" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientId" TEXT,
    "providerBranchId" TEXT,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "classification" TEXT NOT NULL,
    "currentAllowed" BOOLEAN NOT NULL,
    "targetAllowed" BOOLEAN NOT NULL,
    "errored" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEntitlementShadowSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreauthIntakeReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT,
    "clientId" TEXT,
    "memberId" TEXT,
    "providerBranchId" TEXT,
    "channel" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "PreauthIntakeStatus" NOT NULL,
    "preAuthorizationId" TEXT,
    "failureCode" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "credentialId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreauthIntakeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAuthorizationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "preAuthorizationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "priorStatus" TEXT,
    "newStatus" TEXT,
    "safeReasonCode" TEXT,
    "internalReasonRef" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "dataVersionRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreAuthorizationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreauthInfoRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "preAuthorizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientId" TEXT,
    "memberId" TEXT,
    "sequence" INTEGER NOT NULL,
    "status" "PreauthInfoRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requestedItems" TEXT[],
    "prompt" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "openedByActorType" TEXT NOT NULL,
    "openedByActorId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseNote" TEXT,
    "respondedByActorId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "decisionByActorId" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreauthInfoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT,
    "userId" TEXT,
    "memberId" TEXT,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "metadata" JSONB,
    "dedupeKey" TEXT,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEligibilityCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "credentialId" TEXT,
    "memberId" TEXT,
    "clientId" TEXT,
    "groupId" TEXT,
    "packageId" TEXT,
    "requestedServiceDate" TIMESTAMP(3) NOT NULL,
    "benefitCategory" TEXT,
    "resultCode" TEXT NOT NULL,
    "safeExplanation" TEXT,
    "contractId" TEXT,
    "enforcementApplied" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "displayValidUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEligibilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderBranch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "county" TEXT,
    "geoLatitude" DECIMAL(9,6),
    "geoLongitude" DECIMAL(9,6),
    "licenceNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUserBranchAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerBranchId" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredBy" TEXT,
    "retiredAt" TIMESTAMP(3),
    "retireReason" TEXT,

    CONSTRAINT "ProviderUserBranchAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTariff" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "contractId" TEXT,
    "versionId" TEXT,
    "branchId" TEXT,
    "clientId" TEXT,
    "cptCode" TEXT,
    "serviceName" TEXT NOT NULL,
    "agreedRate" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "tariffType" "TariffType" NOT NULL DEFAULT 'NEGOTIATED',
    "requiresPreauth" BOOLEAN NOT NULL DEFAULT false,
    "maxQuantityPerVisit" INTEGER,
    "serviceCategoryId" TEXT,
    "providerServiceCode" TEXT,
    "providerDescription" TEXT,
    "standardDescription" TEXT,
    "codingSystem" "CodingSystem",
    "rateType" "TariffRateType" NOT NULL DEFAULT 'FIXED',
    "discountPct" DECIMAL(5,2),
    "markupPct" DECIMAL(5,2),
    "maxPayableAmount" DECIMAL(14,2),
    "minPayableAmount" DECIMAL(14,2),
    "unitOfMeasure" "UnitOfMeasure" NOT NULL DEFAULT 'PER_ITEM',
    "quantityLimit" INTEGER,
    "frequencyLimit" INTEGER,
    "frequencyPeriod" "FrequencyPeriod",
    "genderRestriction" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "diagnosisRestriction" JSONB,
    "requiresReferral" BOOLEAN NOT NULL DEFAULT false,
    "rateMissing" BOOLEAN NOT NULL DEFAULT false,
    "externalScheme" TEXT,
    "externalRebateAmount" DECIMAL(14,2),
    "sourceRef" JSONB,
    "notes" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "patientClass" "PatientClass",
    "tier" "ServiceTier",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategoryAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceCategoryId" TEXT NOT NULL,
    "rawLabel" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCategoryAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMappingMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT,
    "contractId" TEXT,
    "normalizedText" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMappingMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDiagnosisTariff" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "contractId" TEXT,
    "icdCode" TEXT NOT NULL,
    "diagnosisLabel" TEXT NOT NULL,
    "bundledRate" DECIMAL(65,30),
    "perDayRate" DECIMAL(65,30),
    "tariffType" "TariffType" NOT NULL DEFAULT 'NEGOTIATED',
    "notes" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderDiagnosisTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderContract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL DEFAULT 'RATE_SCHEDULE',
    "status" "ProviderContractStatus" NOT NULL DEFAULT 'DRAFT',
    "branchScope" "ContractBranchScope" NOT NULL DEFAULT 'ALL_BRANCHES',
    "externalContractRef" TEXT,
    "parentContractId" TEXT,
    "parentDigitised" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reviewDueDate" TIMESTAMP(3),
    "signedDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "executionStatus" "ContractExecutionStatus" NOT NULL DEFAULT 'UNSIGNED',
    "signatories" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "country" TEXT,
    "region" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "paymentTermType" "PaymentTermType" NOT NULL DEFAULT 'CALENDAR',
    "creditLimit" DECIMAL(65,30),
    "invoiceDiscountPct" DECIMAL(65,30),
    "earlySettlementDiscountPct" DECIMAL(5,2),
    "earlySettlementWindowDays" INTEGER,
    "submissionWindowDays" INTEGER,
    "submissionWindowBasis" "SubmissionWindowBasis",
    "balanceBillingPolicy" "BalanceBillingPolicy",
    "taxInclusive" "TaxInclusivity" NOT NULL DEFAULT 'UNKNOWN',
    "reconciliationCadence" "ReconciliationCadence" NOT NULL DEFAULT 'NONE',
    "unlistedServiceRule" "UnlistedServiceRule" NOT NULL DEFAULT 'REFER_FOR_REVIEW',
    "unlistedDiscountPct" DECIMAL(65,30),
    "documentUrl" TEXT,
    "notes" TEXT,
    "supersededById" TEXT,
    "currentVersionId" TEXT,
    "contractOwnerId" TEXT,
    "createdById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ContractVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "snapshot" JSONB,
    "validationReport" JSONB,
    "changeSummary" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractApplicability" (
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "groupId" TEXT,
    "packageId" TEXT,
    "packageVersionId" TEXT,
    "benefitCategory" "BenefitCategory",
    "networkTier" "ProviderTier",
    "memberCategory" TEXT,
    "inclusionType" "EligibilityRule" NOT NULL DEFAULT 'INCLUDE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractBranch" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSourceDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "sourceRole" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderContractExclusion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "cptCode" TEXT,
    "serviceName" TEXT NOT NULL,
    "reason" TEXT,
    "level" "ExclusionLevel" NOT NULL DEFAULT 'TARIFF_LINE',
    "serviceCategoryId" TEXT,
    "icdCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "packageId" TEXT,
    "memberCategory" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "appliesToBranchId" TEXT,
    "sourceRef" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderContractExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractExtraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT,
    "sourceDocumentId" TEXT,
    "fileName" TEXT,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractorVersion" TEXT NOT NULL DEFAULT 'rule-based-v1',
    "entities" JSONB,
    "tariffCandidates" JSONB NOT NULL DEFAULT '[]',
    "ambiguities" JSONB NOT NULL DEFAULT '[]',
    "reviewAnswers" JSONB,
    "stats" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT,
    "poolId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "agreedAverage" DECIMAL(14,2) NOT NULL,
    "claimCount" INTEGER NOT NULL,
    "agreedTotal" DECIMAL(14,2) NOT NULL,
    "billedTotal" DECIMAL(14,2) NOT NULL,
    "recovery" DECIMAL(14,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'COMPUTED',
    "computedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "scope" "ContractRuleScope" NOT NULL DEFAULT 'CONTRACT',
    "serviceCategoryId" TEXT,
    "tariffLineId" TEXT,
    "ruleKind" "PricingRuleKind" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "packagePrice" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "netOfExternalScheme" TEXT,
    "externalRebateAmount" DECIMAL(14,2),
    "triggerType" "PackageTriggerType" NOT NULL DEFAULT 'PROCEDURE_CODE',
    "triggerCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "losAssumptionDays" INTEGER,
    "losCapDays" INTEGER,
    "complicationRule" "ComplicationRule" NOT NULL DEFAULT 'EXCLUDED_BILL_SEPARATELY',
    "unbundlingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "packageOverridesLineItems" BOOLEAN NOT NULL DEFAULT true,
    "genderRestriction" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageComponent" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "type" "PackageComponentType" NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT,
    "qtyCap" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreauthRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "scope" "ContractRuleScope" NOT NULL DEFAULT 'CONTRACT',
    "serviceCategoryId" TEXT,
    "tariffLineId" TEXT,
    "packageId" TEXT,
    "triggerType" "PreauthTriggerType" NOT NULL DEFAULT 'ALWAYS',
    "thresholdAmount" DECIMAL(14,2),
    "serviceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "admissionRequired" BOOLEAN NOT NULL DEFAULT false,
    "emergencyExempt" BOOLEAN NOT NULL DEFAULT false,
    "retrospectiveAllowed" BOOLEAN NOT NULL DEFAULT false,
    "retrospectiveWindowHours" INTEGER,
    "approvalSlaHours" INTEGER,
    "validityDays" INTEGER,
    "requiredDocumentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consequenceIfMissing" "PreauthConsequence" NOT NULL DEFAULT 'ROUTE_MANUAL',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreauthRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "scope" "ContractRuleScope" NOT NULL DEFAULT 'CONTRACT',
    "serviceCategoryId" TEXT,
    "tariffLineId" TEXT,
    "documentType" "ContractDocumentType" NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "appliesWhen" JSONB,
    "consequenceIfMissing" "DocConsequence" NOT NULL DEFAULT 'ROUTE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTariffTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(14,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalTariffTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverrideControl" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "overrideType" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "requestorRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approverRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dualApprovalThreshold" DECIMAL(14,2),
    "maxFinancialImpact" DECIMAL(14,2),
    "reasonCodeRequired" BOOLEAN NOT NULL DEFAULT true,
    "justificationMinLength" INTEGER NOT NULL DEFAULT 20,
    "requiredDocumentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyProvider" BOOLEAN NOT NULL DEFAULT false,
    "notifyPayer" BOOLEAN NOT NULL DEFAULT false,
    "updatesAutomation" BOOLEAN NOT NULL DEFAULT false,
    "createsContractReviewTask" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverrideControl_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "TreatmentExclusionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageVersionId" TEXT,
    "providerContractId" TEXT,
    "ruleCategory" "TreatmentExclusionCategory" NOT NULL,
    "exclusionType" "TreatmentExclusionType" NOT NULL DEFAULT 'ABSOLUTE',
    "benefitCategories" "BenefitCategory"[],
    "serviceCodes" TEXT[],
    "diagnosisCodes" TEXT[],
    "procedureCodes" TEXT[],
    "exceptionLogic" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceClause" TEXT,
    "internalNote" TEXT,
    "memberSafeExplanation" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentExclusionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageVersionId" TEXT NOT NULL,
    "benefitCategories" "BenefitCategory"[],
    "serviceCodes" TEXT[],
    "providerSpecialties" TEXT[],
    "requiresReferral" BOOLEAN NOT NULL DEFAULT true,
    "emergencyException" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceClause" TEXT,
    "memberSafeExplanation" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralRule_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brokerCode" TEXT,
    "legalName" TEXT,
    "tradingName" TEXT,
    "brokerType" "BrokerType" NOT NULL DEFAULT 'MASTER_BROKER',
    "intermediaryCategory" "IntermediaryCategory" NOT NULL DEFAULT 'REGULATED_BROKER',
    "requiresIraRegistration" BOOLEAN NOT NULL DEFAULT true,
    "canReceiveCommission" BOOLEAN NOT NULL DEFAULT true,
    "commissionBasis" "CommissionBasis" NOT NULL DEFAULT 'COMMISSION',
    "referralFeeAmount" DECIMAL(18,2),
    "sourceDescription" TEXT,
    "parentBrokerId" TEXT,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "licenseNumber" TEXT,
    "iraExpiryDate" TIMESTAMP(3),
    "kraPin" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "vatNumber" TEXT,
    "bankAccountReference" TEXT,
    "mpesaPaybillNumber" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
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
CREATE TABLE "BrokerKycDocument" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "fileUri" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "notes" TEXT,

    CONSTRAINT "BrokerKycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerProducer" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "producerName" TEXT NOT NULL,
    "producerCode" TEXT NOT NULL,
    "iraIndividualNumber" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerProducer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCommissionSchedule" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "scheduleName" TEXT NOT NULL,
    "scheduleType" "CommissionScheduleType" NOT NULL,
    "packageId" TEXT,
    "groupId" TEXT,
    "clientType" "ClientType",
    "newBusinessRate" DECIMAL(8,5) NOT NULL,
    "renewalRate" DECIMAL(8,5) NOT NULL,
    "overrideRate" DECIMAL(8,5),
    "grossCommissionCeiling" DECIMAL(8,5),
    "payoutCycleDays" INTEGER NOT NULL DEFAULT 30,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerCommissionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "tierOrder" INTEGER NOT NULL,
    "thresholdMetric" "TierMetric" NOT NULL,
    "thresholdMin" DECIMAL(18,2) NOT NULL,
    "thresholdMax" DECIMAL(18,2),
    "rate" DECIMAL(8,5) NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLedgerEntry" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "groupId" TEXT NOT NULL,
    "contributionReceiptId" TEXT,
    "membershipId" TEXT,
    "state" "CommissionState" NOT NULL,
    "stateAsOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grossCommission" DECIMAL(18,2) NOT NULL,
    "withholdingTax" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL,
    "iraAgentLevy" DECIMAL(18,2) NOT NULL,
    "netPayable" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "earnedPeriodStart" TIMESTAMP(3) NOT NULL,
    "earnedPeriodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "payoutBatchId" TEXT,
    "clawbackParentId" TEXT,
    "clawbackReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayoutBatch" (
    "id" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "batchDate" TIMESTAMP(3) NOT NULL,
    "totalGross" DECIMAL(18,2) NOT NULL,
    "totalWHT" DECIMAL(18,2) NOT NULL,
    "totalVAT" DECIMAL(18,2) NOT NULL,
    "totalLevy" DECIMAL(18,2) NOT NULL,
    "totalNet" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "PayoutBatchStatus" NOT NULL,
    "generatedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayoutBatch_pkey" PRIMARY KEY ("id")
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
    "currency" TEXT NOT NULL DEFAULT 'UGX',
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
    "currency" TEXT NOT NULL DEFAULT 'UGX',
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
    "tenantId" TEXT,
    "providerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "baseTotalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "claimCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementBatchId" TEXT,
    "journalEntryId" TEXT,

    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "currency" TEXT NOT NULL DEFAULT 'UGX',
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
    "clientType" "ClientType",
    "fundingMode" "FundingMode" NOT NULL DEFAULT 'INSURED',
    "headcount" INTEGER,
    "legalName" TEXT,
    "kraPinCorporate" TEXT,
    "billingContactEmail" TEXT,
    "requestedCoverStart" TIMESTAMP(3),
    "censusFileUrl" TEXT,
    "assignedAssessorId" TEXT,
    "assessorSlaDeadlineAt" TIMESTAMP(3),
    "assessorNotes" TEXT,
    "seniorApprovalNote" TEXT,
    "declineReason" TEXT,
    "isRenewal" BOOLEAN NOT NULL DEFAULT false,
    "priorQuotationId" TEXT,
    "packageId" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "dependentCount" INTEGER NOT NULL DEFAULT 0,
    "ageBands" JSONB,
    "ratePerMember" DECIMAL(14,2),
    "annualPremium" DECIMAL(14,2),
    "loadings" JSONB,
    "discounts" JSONB,
    "finalPremium" DECIMAL(14,2),
    "pricingNotes" TEXT,
    "validUntil" TIMESTAMP(3),
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
    "caseId" TEXT,
    "brokerId" TEXT,
    "quotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "providerId" TEXT,
    "providerBranchId" TEXT,
    "sourceType" "DocumentSourceType",
    "sourceActorId" TEXT,
    "storageKey" TEXT,
    "originalFileName" TEXT,
    "declaredMimeType" TEXT,
    "detectedMimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "scanStatus" "DocumentScanStatus",
    "scanEngine" TEXT,
    "scannedAt" TIMESTAMP(3),
    "retentionClass" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "supersededByDocumentId" TEXT,
    "uploadIntentId" TEXT,
    "scanAttempts" INTEGER NOT NULL DEFAULT 0,
    "scanLeaseUntil" TIMESTAMP(3),
    "scanReason" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentUploadIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetType" "DocumentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "expectedProviderId" TEXT,
    "expectedProviderBranchId" TEXT,
    "sourceType" "DocumentSourceType" NOT NULL,
    "sourceActorId" TEXT NOT NULL,
    "expectedMimeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxSizeBytes" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentUploadIntent_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
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
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "entityType" TEXT,
    "entityId" TEXT,
    "payloadHash" TEXT,
    "previousHash" TEXT,
    "chainSequence" BIGSERIAL NOT NULL,
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
    "clientId" TEXT,
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
CREATE TABLE "MemberCoContributionPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "coContributionTransactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" "MemberCoContributionPaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "idempotencyKey" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "mpesaReceipt" TEXT,
    "resultCode" TEXT,
    "resultDescription" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCoContributionPayment_pkey" PRIMARY KEY ("id")
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
    "grossCost" DECIMAL(18,2) NOT NULL,
    "benefitPaid" DECIMAL(18,2) NOT NULL,
    "memberCoContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rejectedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "caseMixWeight" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "usedDefaultCaseMix" BOOLEAN NOT NULL DEFAULT true,
    "status" "ClaimStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsEncounterFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "grossContribution" DECIMAL(18,2) NOT NULL,
    "paidContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsContributionFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMixWeight" (
    "id" TEXT NOT NULL,
    "icdFamily" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseMixWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "grossContribution" DECIMAL(18,2) NOT NULL,
    "paidContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "benefitPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memberCoContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "mlr" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "trailing12Mlr" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsMlrSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "grossCost" DECIMAL(18,2) NOT NULL,
    "adjustedCost" DECIMAL(18,2) NOT NULL,
    "averageCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "caseMixIndex" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "rejectionRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRiskProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "riskTier" "RiskTier" NOT NULL DEFAULT 'LOW',
    "riskScore" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "chronicTags" TEXT[],
    "utilizationToCap" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "projectedExceedDate" TIMESTAMP(3),
    "trailing12ClaimCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "trailing12ClaimCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberRiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalScenario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "renewalAnalysisId" TEXT NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "proposedRateAdj" DECIMAL(5,4) NOT NULL,
    "proposedCoContribAdj" DECIMAL(5,4),
    "proposedNetworkTier" TEXT,
    "projectedMlr" DECIMAL(5,4) NOT NULL,
    "projectedContribution" DECIMAL(19,4) NOT NULL,
    "isCommitted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalAnalysis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "trailing12Mlr" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "currentYearMlr" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "targetMlr" DECIMAL(10,4) NOT NULL DEFAULT 0.75,
    "currentContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "projectedClaims" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "recommendedContribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "recommendedAdjustmentPct" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "topIcdDrivers" JSONB NOT NULL DEFAULT '[]',
    "anonymizedTopUtilizers" JSONB NOT NULL DEFAULT '[]',
    "simulatorDefaults" JSONB NOT NULL DEFAULT '{}',
    "recommendationBasis" TEXT,
    "requiresActuarialReview" BOOLEAN NOT NULL DEFAULT false,
    "actuarialOpinionDocUrl" TEXT,
    "isLossLeader" BOOLEAN NOT NULL DEFAULT false,
    "lossLeaderJustification" TEXT,
    "lossLeaderApprovedById" TEXT,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "metricValue" DECIMAL(18,4),
    "thresholdValue" DECIMAL(18,4),
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

-- CreateTable
CREATE TABLE "QuotationLife" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "role" "LifeRole" NOT NULL,
    "principalLifeId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationalId" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "isChronic" BOOLEAN NOT NULL DEFAULT false,
    "iprsValidated" BOOLEAN NOT NULL DEFAULT false,
    "medicalHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationLife_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnderwritingDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "quotationLifeId" TEXT,
    "memberId" TEXT,
    "decision" "UWDecisionType" NOT NULL,
    "loadingMultiplier" DECIMAL(5,4),
    "excludedIcd10Codes" TEXT[],
    "waitingPeriodDays" INTEGER,
    "waitingPeriodCategories" TEXT[],
    "reasonCode" TEXT NOT NULL,
    "narrative" TEXT,
    "decidedById" TEXT NOT NULL,
    "seniorApprovedById" TEXT,
    "seniorApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnderwritingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipExclusion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "icd10Code" TEXT NOT NULL,
    "description" TEXT,
    "sourceDecisionId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitingPeriodApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "benefitCategories" TEXT[],
    "waitingPeriodDays" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sourceDecisionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "WaitingPeriodApplication_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "QuotationRiskProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "ageDistribution" JSONB NOT NULL,
    "genderSplit" JSONB NOT NULL,
    "dependantRatio" DECIMAL(5,4) NOT NULL,
    "icd10ChapterSummary" JSONB NOT NULL,
    "priorLossRatio" DECIMAL(5,4),
    "geographicDist" JSONB,
    "benchmarkMlr" DECIMAL(5,4),
    "preExistingFlags" JSONB,
    "blacklistMatches" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessorWorkQueueItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessorWorkQueueItem_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "QuotationAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "method" "AcceptanceMethod" NOT NULL,
    "acceptedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "coolingOffEnds" TIMESTAMP(3),

    CONSTRAINT "QuotationAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBindingDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT,
    "groupId" TEXT,
    "documentType" "BindingDocType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipBindingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundDepositRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "selfFundedAccId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requiredAmount" DECIMAL(19,4) NOT NULL,
    "receivedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "minimumToActivate" DECIMAL(19,4) NOT NULL,
    "status" "FundDepositStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundDepositRequest_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ProviderSettlementBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "cycleMonth" INTEGER NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "baseTotalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSettlementBatch_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverrideRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "overrideType" "OverrideType" NOT NULL,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "checker2Id" TEXT,
    "status" "OverrideStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCode" "OverrideReasonCode" NOT NULL,
    "justification" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "preState" JSONB,
    "postState" JSONB,
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "auditEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverrideRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalBlacklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "reason" "BlacklistReason" NOT NULL,
    "narrative" TEXT,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "relatedMemberId" TEXT,

    CONSTRAINT "InternalBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossBorderFacility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "specialties" TEXT[],
    "accreditation" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "isVetted" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossBorderFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossBorderCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "facilityId" TEXT,
    "preauthId" TEXT,
    "caseNumber" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "treatmentSummary" TEXT,
    "status" "CrossBorderCaseStatus" NOT NULL DEFAULT 'SOURCING',
    "estimatedAmount" DECIMAL(65,30),
    "estimatedCurrency" TEXT,
    "estimatedAmountUgx" DECIMAL(65,30),
    "gopAmount" DECIMAL(65,30),
    "gopCurrency" TEXT,
    "gopAmountUgx" DECIMAL(65,30),
    "approvedLimitUgx" DECIMAL(65,30),
    "gopWithinLimit" BOOLEAN,
    "invoiceReference" TEXT,
    "invoiceTotalUgx" DECIMAL(65,30),
    "invoicedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "adminFeeLedgerEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossBorderCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossBorderLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "CrossBorderLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "amountUgx" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrossBorderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "type" "WellnessProgramType" NOT NULL,
    "description" TEXT,
    "cadenceMonths" INTEGER,
    "fundedAmount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "targetConditions" TEXT[],
    "pointsReward" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "WellnessEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDueDate" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "WellnessActivityType" NOT NULL,
    "description" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimIntakeReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "channel" "ClaimIntakeChannel" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "strongEventFingerprint" TEXT,
    "suspectedDuplicateFingerprint" TEXT NOT NULL,
    "claimId" TEXT,
    "state" "ClaimIntakeReceiptState" NOT NULL DEFAULT 'PROCESSING',
    "outcomeCode" TEXT,
    "safeMessage" TEXT,
    "httpStatus" INTEGER,
    "correlationId" TEXT NOT NULL,
    "replayedFromReceiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimIntakeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimProcessingRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "claimRevision" INTEGER NOT NULL DEFAULT 1,
    "workflowVersion" TEXT NOT NULL DEFAULT 'v1',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "trigger" "ClaimProcessingTrigger" NOT NULL DEFAULT 'INITIAL',
    "supersedesRunId" TEXT,
    "modeResolved" TEXT,
    "policyId" TEXT,
    "state" "ClaimProcessingState" NOT NULL DEFAULT 'PENDING',
    "currentStage" "ClaimProcessingStageName",
    "routeCode" TEXT,
    "assignedQueue" TEXT,
    "safeMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimProcessingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimProcessingStage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "ClaimProcessingStageName" NOT NULL,
    "state" "ClaimProcessingStageState" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "reasonCode" TEXT,
    "safeMessage" TEXT,
    "result" JSONB,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimProcessingStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimAutopilotBreaker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "autoTriggered" BOOLEAN NOT NULL DEFAULT false,
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimAutopilotBreaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimReconsideration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT,
    "claimId" TEXT NOT NULL,
    "chainRootClaimId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "providerNarrative" TEXT NOT NULL,
    "requestedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "filingDeadline" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3),
    "status" "ReconsiderationStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedTeam" TEXT,
    "assignedReviewerId" TEXT,
    "originalAdjudicatorId" TEXT,
    "outcomeReasonCode" TEXT,
    "outcomeSafeExplanation" TEXT,
    "outcomeInternalNotes" TEXT,
    "supplementalClaimId" TEXT,
    "slaPolicy" TEXT,
    "slaVersion" TEXT,
    "dueAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimReconsideration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimReconsiderationLine" (
    "id" TEXT NOT NULL,
    "reconsiderationId" TEXT NOT NULL,
    "claimLineId" TEXT NOT NULL,
    "disputedCategory" TEXT,
    "narrative" TEXT,
    "originalBilled" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalAllowed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalMemberShare" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalWriteoff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requestedAllowed" DECIMAL(14,2),
    "requestedPayable" DECIMAL(14,2),
    "reviewerCorrectedEntitlement" DECIMAL(14,2),
    "alreadyApproved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "alreadyPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxIncrement" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "awardedIncrement" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outcomeReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimReconsiderationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimReconsiderationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconsiderationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "priorStatus" TEXT,
    "newStatus" TEXT,
    "safeReasonCode" TEXT,
    "internalReasonRef" TEXT,
    "message" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "dataVersionRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimReconsiderationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDisbursement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "settlementBatchId" TEXT NOT NULL,
    "voucherId" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "baseAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "fxRateRef" TEXT,
    "method" TEXT,
    "channel" TEXT,
    "maskedDestination" TEXT,
    "externalReference" TEXT,
    "valueDate" TIMESTAMP(3),
    "initiatedById" TEXT,
    "initiatedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "failedById" TEXT,
    "failedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "failureReasonSafe" TEXT,
    "failureReasonInternal" TEXT,
    "reversalOfDisbursementId" TEXT,
    "idempotencyKey" TEXT,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDisbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementReconciliationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "watermark" TIMESTAMP(3),
    "batchesChecked" INTEGER NOT NULL DEFAULT 0,
    "exceptionsFound" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementReconciliationException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "settlementBatchId" TEXT NOT NULL,
    "providerId" TEXT,
    "currency" TEXT NOT NULL,
    "type" "ReconciliationExceptionType" NOT NULL,
    "detail" TEXT NOT NULL,
    "expectedAmount" DECIMAL(19,4),
    "actualAmount" DECIMAL(19,4),
    "investigationStatus" "ReconciliationInvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "investigationNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementReconciliationException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPaymentQuery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT,
    "settlementBatchId" TEXT NOT NULL,
    "claimId" TEXT,
    "claimLineId" TEXT,
    "disbursementId" TEXT,
    "category" "PaymentQueryCategory" NOT NULL,
    "discrepancyAmount" DECIMAL(19,4),
    "discrepancyCurrency" TEXT,
    "providerNarrative" TEXT NOT NULL,
    "status" "PaymentQueryStatus" NOT NULL DEFAULT 'OPEN',
    "providerRequesterId" TEXT,
    "assignedTeam" TEXT,
    "assignedReviewerId" TEXT,
    "slaPolicy" TEXT,
    "slaVersion" TEXT,
    "dueAt" TIMESTAMP(3),
    "linkedReconsiderationId" TEXT,
    "resolutionCode" TEXT,
    "resolutionExplanation" TEXT,
    "resolutionInternalNote" TEXT,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPaymentQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPaymentQueryMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentQueryId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "audience" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "priorStatus" TEXT,
    "newStatus" TEXT,
    "body" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPaymentQueryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMasterDataChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT,
    "category" "MasterDataChangeCategory" NOT NULL,
    "riskLevel" "MasterDataChangeRisk" NOT NULL DEFAULT 'LOW',
    "currentSnapshot" JSONB NOT NULL,
    "proposedValues" JSONB NOT NULL,
    "evidenceDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerNarrative" TEXT,
    "status" "MasterDataChangeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "providerRequesterId" TEXT,
    "assignedReviewerId" TEXT,
    "makerId" TEXT,
    "makerAt" TIMESTAMP(3),
    "checkerId" TEXT,
    "checkerAt" TIMESTAMP(3),
    "verificationMethod" TEXT,
    "verificationReference" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "decisionCode" TEXT,
    "decisionExplanation" TEXT,
    "decisionInternalNote" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "slaPolicy" TEXT,
    "dueAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderMasterDataChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMasterDataChangeEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "audience" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "priorStatus" TEXT,
    "newStatus" TEXT,
    "body" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderMasterDataChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderImprovementPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "baselineMetricRef" TEXT,
    "networkOwnerId" TEXT,
    "providerOwnerId" TEXT,
    "status" "ImprovementPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderImprovementPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderImprovementAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerRole" "ImprovementOwnerRole" NOT NULL DEFAULT 'PROVIDER',
    "dueDate" TIMESTAMP(3),
    "status" "ImprovementActionStatus" NOT NULL DEFAULT 'OPEN',
    "evidenceDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderImprovementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderImprovementUpdate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "audience" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderImprovementUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPerformanceScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metricKey" TEXT NOT NULL,
    "definitionVersion" TEXT NOT NULL,
    "numerator" DECIMAL(18,4) NOT NULL,
    "denominator" DECIMAL(18,4) NOT NULL,
    "value" DECIMAL(18,6),
    "unit" TEXT NOT NULL DEFAULT 'RATE',
    "completeness" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "meetsMinimumSample" BOOLEAN NOT NULL DEFAULT false,
    "cohortKey" TEXT,
    "suppressedForAnonymity" BOOLEAN NOT NULL DEFAULT false,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "controlTotals" JSONB,
    "sourceWatermark" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PerformanceScoreStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "publicationVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPerformanceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceCohortBenchmark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metricKey" TEXT NOT NULL,
    "definitionVersion" TEXT NOT NULL,
    "cohortKey" TEXT NOT NULL,
    "providerCount" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'RATE',
    "minValue" DECIMAL(18,6),
    "p25" DECIMAL(18,6),
    "median" DECIMAL(18,6),
    "p75" DECIMAL(18,6),
    "p90" DECIMAL(18,6),
    "maxValue" DECIMAL(18,6),
    "publicationVersion" INTEGER NOT NULL DEFAULT 1,
    "publicationWatermark" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceCohortBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIntegrationConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "connectorVersion" TEXT NOT NULL DEFAULT '1',
    "mode" "ProviderIntegrationMode" NOT NULL DEFAULT 'PUSH',
    "apiBaseUrl" TEXT,
    "endpointAllowlistRef" TEXT,
    "secretRef" TEXT,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mappingVersion" TEXT,
    "cadence" TEXT,
    "cursor" TEXT,
    "status" "ProviderIntegrationStatus" NOT NULL DEFAULT 'DRAFT',
    "circuitState" "IntegrationCircuitState" NOT NULL DEFAULT 'CLOSED',
    "circuitOpenedAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "owners" TEXT,
    "supportInstructions" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderIntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIntegrationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT NOT NULL DEFAULT '',
    "direction" "IntegrationDeliveryDirection" NOT NULL DEFAULT 'INBOUND',
    "businessObjectType" TEXT NOT NULL,
    "externalBatchRef" TEXT,
    "externalRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "normalizedPayloadHash" TEXT NOT NULL,
    "recordCount" INTEGER,
    "amountTotal" DECIMAL(19,4),
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "quarantinedCount" INTEGER NOT NULL DEFAULT 0,
    "replayedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "IntegrationDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "canonicalReceiptRef" TEXT,
    "canonicalResultRef" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "quarantineReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderIntegrationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIntegrationRecordResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "recordIndex" INTEGER NOT NULL,
    "recordHash" TEXT NOT NULL,
    "businessObjectType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "canonicalEntityType" TEXT,
    "canonicalEntityId" TEXT,
    "canonicalReceiptRef" TEXT,
    "amount" DECIMAL(19,4),
    "safeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderIntegrationRecordResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIntegrationAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "resultClass" TEXT,
    "httpStatus" INTEGER,
    "safeErrorCode" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "nextAttemptAt" TIMESTAMP(3),
    "responseReceiptRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderIntegrationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIntegrationSecret" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "ProviderIntegrationSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitationArrangement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "groupId" TEXT,
    "packageId" TEXT,
    "label" TEXT NOT NULL,
    "rateBasis" "CapitationRateBasis" NOT NULL DEFAULT 'PMPM',
    "rate" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "cadence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "coveredServices" JSONB,
    "ffsCarveOuts" JSONB,
    "eligibilityDefinitionVersion" TEXT NOT NULL,
    "governingContractId" TEXT,
    "glPolicyRef" TEXT,
    "status" "CapitationArrangementStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitationArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitationPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "snapshotInstant" TIMESTAMP(3),
    "eligibleLifeCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleLifeControlHash" TEXT,
    "definitionVersion" TEXT NOT NULL,
    "rate" DECIMAL(19,4) NOT NULL,
    "grossAccrual" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "adjustmentTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "amountPayable" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "controlTotals" JSONB,
    "calculationVersion" INTEGER NOT NULL DEFAULT 0,
    "status" "CapitationPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "frozenAt" TIMESTAMP(3),
    "frozenById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "voucherId" TEXT,
    "disbursementId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitationAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "evidenceRef" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitationEligibleLife" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "coverageSourceVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitationEligibleLife_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitationEncounterLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "periodId" TEXT,
    "memberId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerBranchId" TEXT NOT NULL DEFAULT '',
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "funding" "CapitationFunding" NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitationEncounterLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalProtocolPack" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ClinicalProtocolPackStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sourceFileName" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "notes" TEXT,
    "validationStats" JSONB,
    "createdById" TEXT,
    "approvalRequestId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "deactivationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalProtocolPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalInterventionGroup" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isCatchAll" BOOLEAN NOT NULL DEFAULT false,
    "enabledForShadow" BOOLEAN NOT NULL DEFAULT true,
    "enabledForLive" BOOLEAN NOT NULL DEFAULT false,
    "confirmationLookbackHours" INTEGER,
    "sourceRow" TEXT,

    CONSTRAINT "ClinicalInterventionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalCodeMembership" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "codeSystem" "ClinicalCodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "provenance" "ClinicalMappingProvenance" NOT NULL DEFAULT 'AUTHORED',
    "note" TEXT,

    CONSTRAINT "ClinicalCodeMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalLabRule" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "department" TEXT,
    "requiresDiagnosis" BOOLEAN NOT NULL,
    "repeatWindowHours" INTEGER,
    "failureMessage" TEXT NOT NULL,
    "auditRule" TEXT,
    "sourceRow" TEXT,

    CONSTRAINT "ClinicalLabRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalLabRuleGroupLink" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "labRuleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "linkType" "ClinicalLabLinkType" NOT NULL,

    CONSTRAINT "ClinicalLabRuleGroupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalLineAlias" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "labRuleId" TEXT NOT NULL,
    "matchType" "ClinicalAliasMatchType" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ClinicalLineAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalShadowVerdict" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "routeCode" TEXT NOT NULL,
    "verdict" "ClinicalVerdict" NOT NULL,
    "note" TEXT,
    "reviewedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalShadowVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "rejects" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FundAdminGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FundAdminGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProducerSchemes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProducerSchemes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE INDEX "Client_operatorTenantId_idx" ON "Client"("operatorTenantId");

-- CreateIndex
CREATE INDEX "Client_operatorTenantId_status_idx" ON "Client"("operatorTenantId", "status");

-- CreateIndex
CREATE INDEX "Client_parentClientId_idx" ON "Client"("parentClientId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_operatorTenantId_slug_key" ON "Client"("operatorTenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Client_operatorTenantId_nameNormalized_key" ON "Client"("operatorTenantId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Client_operatorTenantId_memberNumberPrefix_key" ON "Client"("operatorTenantId", "memberNumberPrefix");

-- CreateIndex
CREATE INDEX "TerminologyEntry_tenantId_key_idx" ON "TerminologyEntry"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TerminologyEntry_tenantId_scope_key_idx" ON "TerminologyEntry"("tenantId", "scope", "key");

-- CreateIndex
CREATE INDEX "TerminologyEntry_tenantId_status_idx" ON "TerminologyEntry"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TerminologyEntry_clientId_idx" ON "TerminologyEntry"("clientId");

-- CreateIndex
CREATE INDEX "TerminologyApproval_tenantId_idx" ON "TerminologyApproval"("tenantId");

-- CreateIndex
CREATE INDEX "TerminologyApproval_entryId_idx" ON "TerminologyApproval"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "User_brokerId_key" ON "User"("brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberId_key" ON "User"("memberId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "AdminFeeAgreement_tenantId_clientId_idx" ON "AdminFeeAgreement"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "AdminFeeAgreement_tenantId_method_idx" ON "AdminFeeAgreement"("tenantId", "method");

-- CreateIndex
CREATE INDEX "AdminFeeLedgerEntry_tenantId_clientId_period_idx" ON "AdminFeeLedgerEntry"("tenantId", "clientId", "period");

-- CreateIndex
CREATE INDEX "AdminFeeLedgerEntry_tenantId_status_idx" ON "AdminFeeLedgerEntry"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RegulatoryLicence_tenantId_idx" ON "RegulatoryLicence"("tenantId");

-- CreateIndex
CREATE INDEX "RegulatoryLicence_tenantId_expiresAt_idx" ON "RegulatoryLicence"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "SecurityDeposit_tenantId_idx" ON "SecurityDeposit"("tenantId");

-- CreateIndex
CREATE INDEX "DirectorRegister_tenantId_idx" ON "DirectorRegister"("tenantId");

-- CreateIndex
CREATE INDEX "DirectorRegister_tenantId_isActive_idx" ON "DirectorRegister"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "IndemnityCover_tenantId_idx" ON "IndemnityCover"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceLevyComputation_tenantId_idx" ON "ComplianceLevyComputation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceLevyComputation_tenantId_period_key" ON "ComplianceLevyComputation"("tenantId", "period");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_memberId_idx" ON "ConsentRecord"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_memberId_purpose_idx" ON "ConsentRecord"("tenantId", "memberId", "purpose");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_tenantId_status_idx" ON "DataSubjectRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_tenantId_memberId_idx" ON "DataSubjectRequest"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "ProcessorRegister_tenantId_idx" ON "ProcessorRegister"("tenantId");

-- CreateIndex
CREATE INDEX "BreachIncident_tenantId_idx" ON "BreachIncident"("tenantId");

-- CreateIndex
CREATE INDEX "BreachIncident_tenantId_severity_idx" ON "BreachIncident"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "FraudRule_tenantId_clientId_idx" ON "FraudRule"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "FraudRule_tenantId_enabled_idx" ON "FraudRule"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FraudRule_tenantId_clientId_code_key" ON "FraudRule"("tenantId", "clientId", "code");

-- CreateIndex
CREATE INDEX "FraudInvestigation_tenantId_status_idx" ON "FraudInvestigation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FraudInvestigation_claimId_idx" ON "FraudInvestigation"("claimId");

-- CreateIndex
CREATE INDEX "Group_tenantId_idx" ON "Group"("tenantId");

-- CreateIndex
CREATE INDEX "Group_tenantId_status_idx" ON "Group"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Group_tenantId_fundingMode_idx" ON "Group"("tenantId", "fundingMode");

-- CreateIndex
CREATE INDEX "Group_brokerId_idx" ON "Group"("brokerId");

-- CreateIndex
CREATE INDEX "Group_clientId_idx" ON "Group"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_clientId_nameNormalized_key" ON "Group"("clientId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Group_tenantId_registrationNumber_key" ON "Group"("tenantId", "registrationNumber");

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
CREATE INDEX "Member_tenantId_status_enrollmentDate_idx" ON "Member"("tenantId", "status", "enrollmentDate");

-- CreateIndex
CREATE INDEX "Member_groupId_idx" ON "Member"("groupId");

-- CreateIndex
CREATE INDEX "Member_groupId_status_enrollmentDate_idx" ON "Member"("groupId", "status", "enrollmentDate");

-- CreateIndex
CREATE INDEX "Member_principalId_idx" ON "Member"("principalId");

-- CreateIndex
CREATE INDEX "Member_idNumber_idx" ON "Member"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_memberNumber_key" ON "Member"("tenantId", "memberNumber");

-- CreateIndex
CREATE INDEX "MemberCoveragePeriod_memberId_startDate_idx" ON "MemberCoveragePeriod"("memberId", "startDate");

-- CreateIndex
CREATE INDEX "MemberCoveragePeriod_tenantId_memberId_idx" ON "MemberCoveragePeriod"("tenantId", "memberId");

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
CREATE INDEX "MemberNotification_tenantId_idx" ON "MemberNotification"("tenantId");

-- CreateIndex
CREATE INDEX "MemberNotification_memberId_idx" ON "MemberNotification"("memberId");

-- CreateIndex
CREATE INDEX "MemberNotification_memberId_readAt_idx" ON "MemberNotification"("memberId", "readAt");

-- CreateIndex
CREATE INDEX "MemberNotification_tenantId_type_idx" ON "MemberNotification"("tenantId", "type");

-- CreateIndex
CREATE INDEX "MemberNotification_createdAt_idx" ON "MemberNotification"("createdAt");

-- CreateIndex
CREATE INDEX "MemberHealthFile_tenantId_idx" ON "MemberHealthFile"("tenantId");

-- CreateIndex
CREATE INDEX "MemberHealthFile_memberId_createdAt_idx" ON "MemberHealthFile"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberHealthFile_memberId_category_idx" ON "MemberHealthFile"("memberId", "category");

-- CreateIndex
CREATE INDEX "MemberVitalEntry_tenantId_idx" ON "MemberVitalEntry"("tenantId");

-- CreateIndex
CREATE INDEX "MemberVitalEntry_memberId_recordedAt_idx" ON "MemberVitalEntry"("memberId", "recordedAt");

-- CreateIndex
CREATE INDEX "MemberHealthJournalEntry_tenantId_idx" ON "MemberHealthJournalEntry"("tenantId");

-- CreateIndex
CREATE INDEX "MemberHealthJournalEntry_memberId_recordedAt_idx" ON "MemberHealthJournalEntry"("memberId", "recordedAt");

-- CreateIndex
CREATE INDEX "MemberHealthJournalEntry_memberId_entryType_idx" ON "MemberHealthJournalEntry"("memberId", "entryType");

-- CreateIndex
CREATE INDEX "MemberHealthShare_tenantId_idx" ON "MemberHealthShare"("tenantId");

-- CreateIndex
CREATE INDEX "MemberHealthShare_memberId_createdAt_idx" ON "MemberHealthShare"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberHealthShare_providerId_idx" ON "MemberHealthShare"("providerId");

-- CreateIndex
CREATE INDEX "MemberHealthShare_preauthId_idx" ON "MemberHealthShare"("preauthId");

-- CreateIndex
CREATE INDEX "MemberHealthShare_checkInChallengeId_idx" ON "MemberHealthShare"("checkInChallengeId");

-- CreateIndex
CREATE INDEX "MemberHealthShare_healthFileId_idx" ON "MemberHealthShare"("healthFileId");

-- CreateIndex
CREATE INDEX "MemberHealthShare_journalEntryId_idx" ON "MemberHealthShare"("journalEntryId");

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
CREATE INDEX "FundTransaction_selfFundedAccountId_postedAt_idx" ON "FundTransaction"("selfFundedAccountId", "postedAt");

-- CreateIndex
CREATE INDEX "FundTransaction_selfFundedAccountId_type_postedAt_idx" ON "FundTransaction"("selfFundedAccountId", "type", "postedAt");

-- CreateIndex
CREATE INDEX "FundTransaction_claimId_idx" ON "FundTransaction"("claimId");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_idx" ON "TaxRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_tenantId_taxType_effectiveFrom_key" ON "TaxRate"("tenantId", "taxType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ApprovalMatrix_tenantId_idx" ON "ApprovalMatrix"("tenantId");

-- CreateIndex
CREATE INDEX "ApprovalMatrix_tenantId_actionType_idx" ON "ApprovalMatrix"("tenantId", "actionType");

-- CreateIndex
CREATE INDEX "ApprovalMatrix_clientId_idx" ON "ApprovalMatrix"("clientId");

-- CreateIndex
CREATE INDEX "ApprovalStep_matrixId_idx" ON "ApprovalStep"("matrixId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_matrixId_level_key" ON "ApprovalStep"("matrixId", "level");

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_status_idx" ON "ApprovalRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_clientId_idx" ON "ApprovalRequest"("clientId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityType_entityId_idx" ON "ApprovalRequest"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalDecision_requestId_idx" ON "ApprovalDecision"("requestId");

-- CreateIndex
CREATE INDEX "FxRate_tenantId_baseCurrency_quoteCurrency_idx" ON "FxRate"("tenantId", "baseCurrency", "quoteCurrency");

-- CreateIndex
CREATE INDEX "AutoAdjudicationPolicy_tenantId_clientId_idx" ON "AutoAdjudicationPolicy"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "AutoAdjudicationPolicy_tenantId_isActive_idx" ON "AutoAdjudicationPolicy"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "SyncOperation_tenantId_state_idx" ON "SyncOperation"("tenantId", "state");

-- CreateIndex
CREATE INDEX "SyncOperation_tenantId_entityType_idx" ON "SyncOperation"("tenantId", "entityType");

-- CreateIndex
CREATE INDEX "SyncOperation_offlineAuthId_idx" ON "SyncOperation"("offlineAuthId");

-- CreateIndex
CREATE INDEX "SyncOperation_resultClaimId_idx" ON "SyncOperation"("resultClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOperation_tenantId_opKey_key" ON "SyncOperation"("tenantId", "opKey");

-- CreateIndex
CREATE INDEX "OfflineReservation_tenantId_memberId_idx" ON "OfflineReservation"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "OfflineReservation_tenantId_state_idx" ON "OfflineReservation"("tenantId", "state");

-- CreateIndex
CREATE INDEX "EligibilitySnapshot_tenantId_memberId_idx" ON "EligibilitySnapshot"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "OfflineWorkAuthorization_tenantId_providerId_status_idx" ON "OfflineWorkAuthorization"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "OfflineWorkAuthorization_tenantId_status_idx" ON "OfflineWorkAuthorization"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineWorkAuthorization_tenantId_code_key" ON "OfflineWorkAuthorization"("tenantId", "code");

-- CreateIndex
CREATE INDEX "OfflineDataPack_tenantId_providerId_generatedAt_idx" ON "OfflineDataPack"("tenantId", "providerId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Package_currentVersionId_key" ON "Package"("currentVersionId");

-- CreateIndex
CREATE INDEX "Package_tenantId_idx" ON "Package"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageVersion_packageId_versionNumber_key" ON "PackageVersion"("packageId", "versionNumber");

-- CreateIndex
CREATE INDEX "BenefitConfig_packageVersionId_idx" ON "BenefitConfig"("packageVersionId");

-- CreateIndex
CREATE INDEX "SharedLimitGroup_packageVersionId_idx" ON "SharedLimitGroup"("packageVersionId");

-- CreateIndex
CREATE INDEX "BenefitConfigSharedLimit_sharedLimitGroupId_idx" ON "BenefitConfigSharedLimit"("sharedLimitGroupId");

-- CreateIndex
CREATE INDEX "BenefitUsage_memberId_idx" ON "BenefitUsage"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitUsage_memberId_benefitConfigId_periodStart_key" ON "BenefitUsage"("memberId", "benefitConfigId", "periodStart");

-- CreateIndex
CREATE INDEX "Endorsement_tenantId_idx" ON "Endorsement"("tenantId");

-- CreateIndex
CREATE INDEX "Endorsement_groupId_idx" ON "Endorsement"("groupId");

-- CreateIndex
CREATE INDEX "Endorsement_groupId_status_idx" ON "Endorsement"("groupId", "status");

-- CreateIndex
CREATE INDEX "Endorsement_tenantId_status_idx" ON "Endorsement"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Endorsement_tenantId_endorsementNumber_key" ON "Endorsement"("tenantId", "endorsementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProRataCalculation_endorsementId_key" ON "ProRataCalculation"("endorsementId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_suspectedDuplicateFingerprint_idx" ON "Claim"("tenantId", "suspectedDuplicateFingerprint");

-- CreateIndex
CREATE INDEX "Claim_tenantId_providerId_memberId_dateOfService_benefitCat_idx" ON "Claim"("tenantId", "providerId", "memberId", "dateOfService", "benefitCategory");

-- CreateIndex
CREATE INDEX "Claim_tenantId_idx" ON "Claim"("tenantId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_status_idx" ON "Claim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Claim_tenantId_createdAt_idx" ON "Claim"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_tenantId_status_createdAt_idx" ON "Claim"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_memberId_idx" ON "Claim"("memberId");

-- CreateIndex
CREATE INDEX "Claim_providerId_idx" ON "Claim"("providerId");

-- CreateIndex
CREATE INDEX "Claim_chainRootClaimId_idx" ON "Claim"("chainRootClaimId");

-- CreateIndex
CREATE INDEX "Claim_supersedesClaimId_idx" ON "Claim"("supersedesClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_tenantId_claimNumber_key" ON "Claim"("tenantId", "claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_providerId_invoiceNumber_key" ON "Claim"("providerId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_tenantId_providerId_externalRef_key" ON "Claim"("tenantId", "providerId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_tenantId_strongEventFingerprint_key" ON "Claim"("tenantId", "strongEventFingerprint");

-- CreateIndex
CREATE INDEX "DrugExclusion_tenantId_drugCode_idx" ON "DrugExclusion"("tenantId", "drugCode");

-- CreateIndex
CREATE INDEX "DrugExclusion_tenantId_clientId_idx" ON "DrugExclusion"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "AdjudicationReasonCode_tenantId_idx" ON "AdjudicationReasonCode"("tenantId");

-- CreateIndex
CREATE INDEX "AdjudicationReasonCode_code_idx" ON "AdjudicationReasonCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AdjudicationReasonCode_tenantId_code_key" ON "AdjudicationReasonCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ClaimLine_claimId_idx" ON "ClaimLine"("claimId");

-- CreateIndex
CREATE INDEX "ClaimLine_contractId_idx" ON "ClaimLine"("contractId");

-- CreateIndex
CREATE INDEX "ClaimLine_reasonCodeId_idx" ON "ClaimLine"("reasonCodeId");

-- CreateIndex
CREATE INDEX "ClaimLine_serviceCategoryId_idx" ON "ClaimLine"("serviceCategoryId");

-- CreateIndex
CREATE INDEX "AdjudicationLog_claimId_idx" ON "AdjudicationLog"("claimId");

-- CreateIndex
CREATE INDEX "PreAuthorization_tenantId_idx" ON "PreAuthorization"("tenantId");

-- CreateIndex
CREATE INDEX "PreAuthorization_tenantId_status_idx" ON "PreAuthorization"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PreAuthorization_tenantId_status_createdAt_idx" ON "PreAuthorization"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PreAuthorization_memberId_idx" ON "PreAuthorization"("memberId");

-- CreateIndex
CREATE INDEX "PreAuthorization_claimId_idx" ON "PreAuthorization"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "PreAuthorization_tenantId_preauthNumber_key" ON "PreAuthorization"("tenantId", "preauthNumber");

-- CreateIndex
CREATE INDEX "ClinicalCase_tenantId_status_idx" ON "ClinicalCase"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClinicalCase_tenantId_providerId_status_idx" ON "ClinicalCase"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "ClinicalCase_memberId_idx" ON "ClinicalCase"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalCase_tenantId_caseNumber_key" ON "ClinicalCase"("tenantId", "caseNumber");

-- CreateIndex
CREATE INDEX "CaseServiceEntry_caseId_entryDate_idx" ON "CaseServiceEntry"("caseId", "entryDate");

-- CreateIndex
CREATE INDEX "CaseServiceEntry_hmsBatchRef_idx" ON "CaseServiceEntry"("hmsBatchRef");

-- CreateIndex
CREATE INDEX "CaseServiceEntry_billedInClaimId_idx" ON "CaseServiceEntry"("billedInClaimId");

-- CreateIndex
CREATE INDEX "LetterOfUndertaking_tenantId_status_idx" ON "LetterOfUndertaking"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LetterOfUndertaking_memberId_idx" ON "LetterOfUndertaking"("memberId");

-- CreateIndex
CREATE INDEX "LetterOfUndertaking_caseId_idx" ON "LetterOfUndertaking"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "LetterOfUndertaking_tenantId_louNumber_key" ON "LetterOfUndertaking"("tenantId", "louNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitHold_preAuthId_key" ON "BenefitHold"("preAuthId");

-- CreateIndex
CREATE INDEX "BenefitHold_tenantId_memberId_status_idx" ON "BenefitHold"("tenantId", "memberId", "status");

-- CreateIndex
CREATE INDEX "BenefitHold_tenantId_status_expiresAt_idx" ON "BenefitHold"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Provider_tenantId_idx" ON "Provider"("tenantId");

-- CreateIndex
CREATE INDEX "Provider_tenantId_tier_idx" ON "Provider"("tenantId", "tier");

-- CreateIndex
CREATE INDEX "ProviderApiKey_tenantId_idx" ON "ProviderApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "ProviderApiKey_providerId_idx" ON "ProviderApiKey"("providerId");

-- CreateIndex
CREATE INDEX "ProviderApiKey_keyPrefix_idx" ON "ProviderApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ProviderApiKey_rotationFamilyId_idx" ON "ProviderApiKey"("rotationFamilyId");

-- CreateIndex
CREATE INDEX "ProviderApiKey_expiresAt_idx" ON "ProviderApiKey"("expiresAt");

-- CreateIndex
CREATE INDEX "ProviderEntitlementShadowSample_tenantId_providerId_classif_idx" ON "ProviderEntitlementShadowSample"("tenantId", "providerId", "classification");

-- CreateIndex
CREATE INDEX "ProviderEntitlementShadowSample_createdAt_idx" ON "ProviderEntitlementShadowSample"("createdAt");

-- CreateIndex
CREATE INDEX "PreauthIntakeReceipt_tenantId_providerId_createdAt_idx" ON "PreauthIntakeReceipt"("tenantId", "providerId", "createdAt");

-- CreateIndex
CREATE INDEX "PreauthIntakeReceipt_requestHash_idx" ON "PreauthIntakeReceipt"("requestHash");

-- CreateIndex
CREATE INDEX "PreauthIntakeReceipt_preAuthorizationId_idx" ON "PreauthIntakeReceipt"("preAuthorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PreauthIntakeReceipt_tenantId_providerId_channel_idempotenc_key" ON "PreauthIntakeReceipt"("tenantId", "providerId", "channel", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PreAuthorizationEvent_tenantId_preAuthorizationId_createdAt_idx" ON "PreAuthorizationEvent"("tenantId", "preAuthorizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PreAuthorizationEvent_preAuthorizationId_sequence_key" ON "PreAuthorizationEvent"("preAuthorizationId", "sequence");

-- CreateIndex
CREATE INDEX "PreauthInfoRequest_tenantId_providerId_status_idx" ON "PreauthInfoRequest"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "PreauthInfoRequest_tenantId_status_dueAt_idx" ON "PreauthInfoRequest"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "PreauthInfoRequest_preAuthorizationId_idx" ON "PreauthInfoRequest"("preAuthorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PreauthInfoRequest_preAuthorizationId_sequence_key" ON "PreauthInfoRequest"("preAuthorizationId", "sequence");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_createdAt_idx" ON "NotificationOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_tenantId_providerId_channel_status_idx" ON "NotificationOutbox"("tenantId", "providerId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_tenantId_dedupeKey_key" ON "NotificationOutbox"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ProviderEligibilityCheck_tenantId_providerId_createdAt_idx" ON "ProviderEligibilityCheck"("tenantId", "providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderEligibilityCheck_memberId_idx" ON "ProviderEligibilityCheck"("memberId");

-- CreateIndex
CREATE INDEX "ProviderBranch_tenantId_providerId_idx" ON "ProviderBranch"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderBranch_providerId_isActive_idx" ON "ProviderBranch"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "ProviderUserBranchAssignment_tenantId_userId_activeTo_idx" ON "ProviderUserBranchAssignment"("tenantId", "userId", "activeTo");

-- CreateIndex
CREATE INDEX "ProviderUserBranchAssignment_providerId_providerBranchId_ac_idx" ON "ProviderUserBranchAssignment"("providerId", "providerBranchId", "activeTo");

-- CreateIndex
CREATE INDEX "ProviderUserBranchAssignment_userId_activeTo_idx" ON "ProviderUserBranchAssignment"("userId", "activeTo");

-- CreateIndex
CREATE INDEX "ProviderAlias_tenantId_providerId_idx" ON "ProviderAlias"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderAlias_tenantId_aliasName_idx" ON "ProviderAlias"("tenantId", "aliasName");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_idx" ON "ProviderTariff"("providerId");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_cptCode_idx" ON "ProviderTariff"("providerId", "cptCode");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_isActive_idx" ON "ProviderTariff"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "ProviderTariff_providerId_providerServiceCode_idx" ON "ProviderTariff"("providerId", "providerServiceCode");

-- CreateIndex
CREATE INDEX "ProviderTariff_contractId_idx" ON "ProviderTariff"("contractId");

-- CreateIndex
CREATE INDEX "ProviderTariff_versionId_idx" ON "ProviderTariff"("versionId");

-- CreateIndex
CREATE INDEX "ProviderTariff_branchId_idx" ON "ProviderTariff"("branchId");

-- CreateIndex
CREATE INDEX "ProviderTariff_clientId_idx" ON "ProviderTariff"("clientId");

-- CreateIndex
CREATE INDEX "ProviderTariff_serviceCategoryId_idx" ON "ProviderTariff"("serviceCategoryId");

-- CreateIndex
CREATE INDEX "ProviderTariff_contractId_rateMissing_idx" ON "ProviderTariff"("contractId", "rateMissing");

-- CreateIndex
CREATE INDEX "ServiceCategory_tenantId_idx" ON "ServiceCategory"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceCategory_tenantId_tier_idx" ON "ServiceCategory"("tenantId", "tier");

-- CreateIndex
CREATE INDEX "ServiceCategory_parentId_idx" ON "ServiceCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_tenantId_code_key" ON "ServiceCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ServiceCategoryAlias_tenantId_rawLabel_idx" ON "ServiceCategoryAlias"("tenantId", "rawLabel");

-- CreateIndex
CREATE INDEX "ServiceCategoryAlias_serviceCategoryId_idx" ON "ServiceCategoryAlias"("serviceCategoryId");

-- CreateIndex
CREATE INDEX "ServiceMappingMemory_tenantId_normalizedText_idx" ON "ServiceMappingMemory"("tenantId", "normalizedText");

-- CreateIndex
CREATE INDEX "ServiceMappingMemory_tariffId_idx" ON "ServiceMappingMemory"("tariffId");

-- CreateIndex
CREATE INDEX "ProviderDiagnosisTariff_providerId_idx" ON "ProviderDiagnosisTariff"("providerId");

-- CreateIndex
CREATE INDEX "ProviderDiagnosisTariff_providerId_icdCode_idx" ON "ProviderDiagnosisTariff"("providerId", "icdCode");

-- CreateIndex
CREATE INDEX "ProviderDiagnosisTariff_contractId_idx" ON "ProviderDiagnosisTariff"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderContract_supersededById_key" ON "ProviderContract"("supersededById");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderContract_currentVersionId_key" ON "ProviderContract"("currentVersionId");

-- CreateIndex
CREATE INDEX "ProviderContract_providerId_status_idx" ON "ProviderContract"("providerId", "status");

-- CreateIndex
CREATE INDEX "ProviderContract_tenantId_idx" ON "ProviderContract"("tenantId");

-- CreateIndex
CREATE INDEX "ProviderContract_tenantId_status_idx" ON "ProviderContract"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderContract_tenantId_providerId_status_idx" ON "ProviderContract"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "ProviderContract_parentContractId_idx" ON "ProviderContract"("parentContractId");

-- CreateIndex
CREATE INDEX "ProviderContract_endDate_idx" ON "ProviderContract"("endDate");

-- CreateIndex
CREATE INDEX "ProviderContract_reviewDueDate_idx" ON "ProviderContract"("reviewDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderContract_tenantId_contractNumber_key" ON "ProviderContract"("tenantId", "contractNumber");

-- CreateIndex
CREATE INDEX "ContractVersion_tenantId_idx" ON "ContractVersion"("tenantId");

-- CreateIndex
CREATE INDEX "ContractVersion_contractId_status_idx" ON "ContractVersion"("contractId", "status");

-- CreateIndex
CREATE INDEX "ContractVersion_contractId_effectiveFrom_idx" ON "ContractVersion"("contractId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_contractId_versionNumber_key" ON "ContractVersion"("contractId", "versionNumber");

-- CreateIndex
CREATE INDEX "ContractApplicability_contractId_idx" ON "ContractApplicability"("contractId");

-- CreateIndex
CREATE INDEX "ContractApplicability_clientId_idx" ON "ContractApplicability"("clientId");

-- CreateIndex
CREATE INDEX "ContractApplicability_contractId_clientId_idx" ON "ContractApplicability"("contractId", "clientId");

-- CreateIndex
CREATE INDEX "ContractBranch_contractId_idx" ON "ContractBranch"("contractId");

-- CreateIndex
CREATE INDEX "ContractBranch_branchId_idx" ON "ContractBranch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractBranch_contractId_branchId_key" ON "ContractBranch"("contractId", "branchId");

-- CreateIndex
CREATE INDEX "ContractSourceDocument_tenantId_idx" ON "ContractSourceDocument"("tenantId");

-- CreateIndex
CREATE INDEX "ContractSourceDocument_contractId_idx" ON "ContractSourceDocument"("contractId");

-- CreateIndex
CREATE INDEX "ProviderContractExclusion_contractId_idx" ON "ProviderContractExclusion"("contractId");

-- CreateIndex
CREATE INDEX "ProviderContractExclusion_contractId_cptCode_idx" ON "ProviderContractExclusion"("contractId", "cptCode");

-- CreateIndex
CREATE INDEX "ProviderContractExclusion_contractId_level_idx" ON "ProviderContractExclusion"("contractId", "level");

-- CreateIndex
CREATE INDEX "ContractExtraction_tenantId_idx" ON "ContractExtraction"("tenantId");

-- CreateIndex
CREATE INDEX "ContractExtraction_contractId_idx" ON "ContractExtraction"("contractId");

-- CreateIndex
CREATE INDEX "ContractReconciliation_tenantId_idx" ON "ContractReconciliation"("tenantId");

-- CreateIndex
CREATE INDEX "ContractReconciliation_tenantId_poolId_idx" ON "ContractReconciliation"("tenantId", "poolId");

-- CreateIndex
CREATE INDEX "ContractReconciliation_contractId_idx" ON "ContractReconciliation"("contractId");

-- CreateIndex
CREATE INDEX "PricingRule_contractId_isActive_idx" ON "PricingRule"("contractId", "isActive");

-- CreateIndex
CREATE INDEX "PricingRule_tenantId_idx" ON "PricingRule"("tenantId");

-- CreateIndex
CREATE INDEX "ContractPackage_contractId_isActive_idx" ON "ContractPackage"("contractId", "isActive");

-- CreateIndex
CREATE INDEX "ContractPackage_tenantId_idx" ON "ContractPackage"("tenantId");

-- CreateIndex
CREATE INDEX "PackageComponent_packageId_idx" ON "PackageComponent"("packageId");

-- CreateIndex
CREATE INDEX "PreauthRule_contractId_isActive_idx" ON "PreauthRule"("contractId", "isActive");

-- CreateIndex
CREATE INDEX "PreauthRule_tenantId_idx" ON "PreauthRule"("tenantId");

-- CreateIndex
CREATE INDEX "DocumentationRule_contractId_isActive_idx" ON "DocumentationRule"("contractId", "isActive");

-- CreateIndex
CREATE INDEX "DocumentationRule_tenantId_idx" ON "DocumentationRule"("tenantId");

-- CreateIndex
CREATE INDEX "ExternalTariffTable_tenantId_scheme_code_idx" ON "ExternalTariffTable"("tenantId", "scheme", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTariffTable_tenantId_scheme_code_effectiveFrom_key" ON "ExternalTariffTable"("tenantId", "scheme", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "OverrideControl_tenantId_idx" ON "OverrideControl"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OverrideControl_tenantId_overrideType_key" ON "OverrideControl"("tenantId", "overrideType");

-- CreateIndex
CREATE INDEX "PackageProviderEligibility_packageVersionId_idx" ON "PackageProviderEligibility"("packageVersionId");

-- CreateIndex
CREATE INDEX "PackageProviderEligibility_providerId_idx" ON "PackageProviderEligibility"("providerId");

-- CreateIndex
CREATE INDEX "TreatmentExclusionRule_packageVersionId_idx" ON "TreatmentExclusionRule"("packageVersionId");

-- CreateIndex
CREATE INDEX "TreatmentExclusionRule_providerContractId_idx" ON "TreatmentExclusionRule"("providerContractId");

-- CreateIndex
CREATE INDEX "TreatmentExclusionRule_tenantId_idx" ON "TreatmentExclusionRule"("tenantId");

-- CreateIndex
CREATE INDEX "ReferralRule_packageVersionId_idx" ON "ReferralRule"("packageVersionId");

-- CreateIndex
CREATE INDEX "ReferralRule_tenantId_idx" ON "ReferralRule"("tenantId");

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

-- CreateIndex
CREATE UNIQUE INDEX "Broker_brokerCode_key" ON "Broker"("brokerCode");

-- CreateIndex
CREATE INDEX "Broker_tenantId_idx" ON "Broker"("tenantId");

-- CreateIndex
CREATE INDEX "Broker_tenantId_status_idx" ON "Broker"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Broker_tenantId_intermediaryCategory_idx" ON "Broker"("tenantId", "intermediaryCategory");

-- CreateIndex
CREATE INDEX "Broker_tenantId_canReceiveCommission_idx" ON "Broker"("tenantId", "canReceiveCommission");

-- CreateIndex
CREATE INDEX "Broker_status_effectiveFrom_effectiveTo_idx" ON "Broker"("status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "Broker_parentBrokerId_idx" ON "Broker"("parentBrokerId");

-- CreateIndex
CREATE INDEX "BrokerKycDocument_brokerId_documentType_idx" ON "BrokerKycDocument"("brokerId", "documentType");

-- CreateIndex
CREATE INDEX "BrokerKycDocument_status_expiresAt_idx" ON "BrokerKycDocument"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerProducer_producerCode_key" ON "BrokerProducer"("producerCode");

-- CreateIndex
CREATE INDEX "BrokerProducer_brokerId_status_idx" ON "BrokerProducer"("brokerId", "status");

-- CreateIndex
CREATE INDEX "BrokerCommissionSchedule_brokerId_effectiveFrom_effectiveTo_idx" ON "BrokerCommissionSchedule"("brokerId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "BrokerCommissionSchedule_brokerId_status_idx" ON "BrokerCommissionSchedule"("brokerId", "status");

-- CreateIndex
CREATE INDEX "BrokerCommissionSchedule_groupId_idx" ON "BrokerCommissionSchedule"("groupId");

-- CreateIndex
CREATE INDEX "BrokerCommissionSchedule_packageId_idx" ON "BrokerCommissionSchedule"("packageId");

-- CreateIndex
CREATE INDEX "CommissionTier_scheduleId_tierOrder_idx" ON "CommissionTier"("scheduleId", "tierOrder");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_brokerId_state_earnedPeriodStart_idx" ON "CommissionLedgerEntry"("brokerId", "state", "earnedPeriodStart");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_groupId_earnedPeriodStart_idx" ON "CommissionLedgerEntry"("groupId", "earnedPeriodStart");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_payoutBatchId_idx" ON "CommissionLedgerEntry"("payoutBatchId");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_contributionReceiptId_idx" ON "CommissionLedgerEntry"("contributionReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayoutBatch_batchReference_key" ON "CommissionPayoutBatch"("batchReference");

-- CreateIndex
CREATE INDEX "CommissionPayoutBatch_status_batchDate_idx" ON "CommissionPayoutBatch"("status", "batchDate");

-- CreateIndex
CREATE INDEX "Commission_brokerId_idx" ON "Commission"("brokerId");

-- CreateIndex
CREATE INDEX "Commission_brokerId_period_idx" ON "Commission"("brokerId", "period");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_groupId_idx" ON "Invoice"("groupId");

-- CreateIndex
CREATE INDEX "Invoice_groupId_status_idx" ON "Invoice"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_groupId_idx" ON "Payment"("groupId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentVoucher_tenantId_idx" ON "PaymentVoucher"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentVoucher_providerId_idx" ON "PaymentVoucher"("providerId");

-- CreateIndex
CREATE INDEX "PaymentVoucher_settlementBatchId_idx" ON "PaymentVoucher"("settlementBatchId");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_idx" ON "Quotation"("tenantId");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_status_idx" ON "Quotation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Quotation_tenantId_assignedAssessorId_idx" ON "Quotation"("tenantId", "assignedAssessorId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_tenantId_quoteNumber_key" ON "Quotation"("tenantId", "quoteNumber");

-- CreateIndex
CREATE INDEX "ContributionRateTable_pricingModelId_idx" ON "ContributionRateTable"("pricingModelId");

-- CreateIndex
CREATE INDEX "ContributionRateTable_pricingModelId_minAge_maxAge_idx" ON "ContributionRateTable"("pricingModelId", "minAge", "maxAge");

-- CreateIndex
CREATE UNIQUE INDEX "Document_uploadIntentId_key" ON "Document"("uploadIntentId");

-- CreateIndex
CREATE INDEX "Document_tenantId_providerId_idx" ON "Document"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "Document_storageKey_idx" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_scanStatus_idx" ON "Document"("scanStatus");

-- CreateIndex
CREATE INDEX "Document_scanStatus_scanLeaseUntil_idx" ON "Document"("scanStatus", "scanLeaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUploadIntent_token_key" ON "DocumentUploadIntent"("token");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUploadIntent_finalizedDocumentId_key" ON "DocumentUploadIntent"("finalizedDocumentId");

-- CreateIndex
CREATE INDEX "DocumentUploadIntent_tenantId_targetType_targetId_idx" ON "DocumentUploadIntent"("tenantId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "DocumentUploadIntent_expiresAt_idx" ON "DocumentUploadIntent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerHeartbeat_host_key" ON "WorkerHeartbeat"("host");

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_lastSeenAt_idx" ON "WorkerHeartbeat"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_groupId_createdAt_idx" ON "ActivityLog"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_chainSequence_idx" ON "AuditLog"("tenantId", "chainSequence");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

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
CREATE INDEX "CoContributionRule_clientId_idx" ON "CoContributionRule"("clientId");

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
CREATE UNIQUE INDEX "MemberCoContributionPayment_checkoutRequestId_key" ON "MemberCoContributionPayment"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "MemberCoContributionPayment_tenantId_idx" ON "MemberCoContributionPayment"("tenantId");

-- CreateIndex
CREATE INDEX "MemberCoContributionPayment_memberId_idx" ON "MemberCoContributionPayment"("memberId");

-- CreateIndex
CREATE INDEX "MemberCoContributionPayment_coContributionTransactionId_idx" ON "MemberCoContributionPayment"("coContributionTransactionId");

-- CreateIndex
CREATE INDEX "MemberCoContributionPayment_status_idx" ON "MemberCoContributionPayment"("status");

-- CreateIndex
CREATE INDEX "MemberCoContributionPayment_expiresAt_idx" ON "MemberCoContributionPayment"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCoContributionPayment_tenantId_idempotencyKey_key" ON "MemberCoContributionPayment"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MemberAnnualCoContribution_tenantId_idx" ON "MemberAnnualCoContribution"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAnnualCoContribution_memberId_membershipYear_key" ON "MemberAnnualCoContribution"("memberId", "membershipYear");

-- CreateIndex
CREATE INDEX "FamilyAnnualCoContribution_tenantId_idx" ON "FamilyAnnualCoContribution"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyAnnualCoContribution_principalMemberId_membershipYear_key" ON "FamilyAnnualCoContribution"("principalMemberId", "membershipYear");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEncounterFact_sourceKey_key" ON "AnalyticsEncounterFact"("sourceKey");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_tenantId_encounterDate_idx" ON "AnalyticsEncounterFact"("tenantId", "encounterDate");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_tenantId_encounterMonth_idx" ON "AnalyticsEncounterFact"("tenantId", "encounterMonth");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_groupId_encounterDate_idx" ON "AnalyticsEncounterFact"("groupId", "encounterDate");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_providerId_encounterDate_idx" ON "AnalyticsEncounterFact"("providerId", "encounterDate");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_intermediaryId_encounterDate_idx" ON "AnalyticsEncounterFact"("intermediaryId", "encounterDate");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_memberId_encounterDate_idx" ON "AnalyticsEncounterFact"("memberId", "encounterDate");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_tenantId_status_encounterDate_idx" ON "AnalyticsEncounterFact"("tenantId", "status", "encounterDate");

-- CreateIndex
CREATE INDEX "AnalyticsEncounterFact_tenantId_icdFamily_encounterDate_idx" ON "AnalyticsEncounterFact"("tenantId", "icdFamily", "encounterDate");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsContributionFact_sourceKey_key" ON "AnalyticsContributionFact"("sourceKey");

-- CreateIndex
CREATE INDEX "AnalyticsContributionFact_tenantId_periodStart_idx" ON "AnalyticsContributionFact"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsContributionFact_groupId_periodStart_idx" ON "AnalyticsContributionFact"("groupId", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsContributionFact_intermediaryId_periodStart_idx" ON "AnalyticsContributionFact"("intermediaryId", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsContributionFact_tenantId_period_idx" ON "AnalyticsContributionFact"("tenantId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "CaseMixWeight_icdFamily_key" ON "CaseMixWeight"("icdFamily");

-- CreateIndex
CREATE INDEX "CaseMixWeight_isActive_idx" ON "CaseMixWeight"("isActive");

-- CreateIndex
CREATE INDEX "AnalyticsMlrSnapshot_tenantId_periodStart_idx" ON "AnalyticsMlrSnapshot"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsMlrSnapshot_groupId_periodStart_idx" ON "AnalyticsMlrSnapshot"("groupId", "periodStart");

-- CreateIndex
CREATE INDEX "AnalyticsMlrSnapshot_intermediaryId_periodStart_idx" ON "AnalyticsMlrSnapshot"("intermediaryId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsMlrSnapshot_scope_key" ON "AnalyticsMlrSnapshot"("tenantId", "grain", "period", "groupId", "packageId", "benefitTierId", "intermediaryId");

-- CreateIndex
CREATE INDEX "ProviderScorecard_tenantId_periodStart_idx" ON "ProviderScorecard"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "ProviderScorecard_providerId_periodStart_idx" ON "ProviderScorecard"("providerId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderScorecard_tenantId_providerId_period_key" ON "ProviderScorecard"("tenantId", "providerId", "period");

-- CreateIndex
CREATE INDEX "MemberRiskProfile_tenantId_riskTier_idx" ON "MemberRiskProfile"("tenantId", "riskTier");

-- CreateIndex
CREATE INDEX "MemberRiskProfile_groupId_riskTier_idx" ON "MemberRiskProfile"("groupId", "riskTier");

-- CreateIndex
CREATE INDEX "MemberRiskProfile_projectedExceedDate_idx" ON "MemberRiskProfile"("projectedExceedDate");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRiskProfile_memberId_key" ON "MemberRiskProfile"("memberId");

-- CreateIndex
CREATE INDEX "RenewalScenario_tenantId_renewalAnalysisId_idx" ON "RenewalScenario"("tenantId", "renewalAnalysisId");

-- CreateIndex
CREATE INDEX "RenewalAnalysis_tenantId_renewalDate_idx" ON "RenewalAnalysis"("tenantId", "renewalDate");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalAnalysis_groupId_renewalDate_key" ON "RenewalAnalysis"("groupId", "renewalDate");

-- CreateIndex
CREATE INDEX "AnalyticsAlert_tenantId_status_severity_createdAt_idx" ON "AnalyticsAlert"("tenantId", "status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsAlert_groupId_status_idx" ON "AnalyticsAlert"("groupId", "status");

-- CreateIndex
CREATE INDEX "AnalyticsAlert_providerId_status_idx" ON "AnalyticsAlert"("providerId", "status");

-- CreateIndex
CREATE INDEX "AnalyticsAlert_memberId_status_idx" ON "AnalyticsAlert"("memberId", "status");

-- CreateIndex
CREATE INDEX "AnalyticsAlert_intermediaryId_status_idx" ON "AnalyticsAlert"("intermediaryId", "status");

-- CreateIndex
CREATE INDEX "QuotationLife_quotationId_idx" ON "QuotationLife"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationLife_tenantId_nationalId_idx" ON "QuotationLife"("tenantId", "nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "UnderwritingDecision_quotationLifeId_key" ON "UnderwritingDecision"("quotationLifeId");

-- CreateIndex
CREATE INDEX "UnderwritingDecision_tenantId_quotationId_idx" ON "UnderwritingDecision"("tenantId", "quotationId");

-- CreateIndex
CREATE INDEX "UnderwritingDecision_tenantId_memberId_idx" ON "UnderwritingDecision"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipExclusion_tenantId_memberId_idx" ON "MembershipExclusion"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipExclusion_tenantId_memberId_icd10Code_idx" ON "MembershipExclusion"("tenantId", "memberId", "icd10Code");

-- CreateIndex
CREATE INDEX "WaitingPeriodApplication_tenantId_memberId_idx" ON "WaitingPeriodApplication"("tenantId", "memberId");

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

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRiskProfile_quotationId_key" ON "QuotationRiskProfile"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessorWorkQueueItem_quotationId_key" ON "AssessorWorkQueueItem"("quotationId");

-- CreateIndex
CREATE INDEX "AssessorWorkQueueItem_tenantId_assignedToId_completedAt_idx" ON "AssessorWorkQueueItem"("tenantId", "assignedToId", "completedAt");

-- CreateIndex
CREATE INDEX "AssessorWorkQueueItem_tenantId_slaBreached_idx" ON "AssessorWorkQueueItem"("tenantId", "slaBreached");

-- CreateIndex
CREATE INDEX "MembershipLapseRecord_tenantId_memberId_idx" ON "MembershipLapseRecord"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipLapseRecord_tenantId_catchupExpired_idx" ON "MembershipLapseRecord"("tenantId", "catchupExpired");

-- CreateIndex
CREATE INDEX "MembershipCancellationRecord_tenantId_memberId_idx" ON "MembershipCancellationRecord"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipTerminationRecord_tenantId_memberId_idx" ON "MembershipTerminationRecord"("tenantId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationAcceptance_quotationId_key" ON "QuotationAcceptance"("quotationId");

-- CreateIndex
CREATE INDEX "MembershipBindingDocument_tenantId_memberId_idx" ON "MembershipBindingDocument"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "MembershipBindingDocument_tenantId_groupId_idx" ON "MembershipBindingDocument"("tenantId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "FundDepositRequest_groupId_key" ON "FundDepositRequest"("groupId");

-- CreateIndex
CREATE INDEX "FundDepositRequest_tenantId_status_idx" ON "FundDepositRequest"("tenantId", "status");

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

-- CreateIndex
CREATE INDEX "ProviderSettlementBatch_tenantId_status_idx" ON "ProviderSettlementBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderSettlementBatch_tenantId_providerId_idx" ON "ProviderSettlementBatch"("tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSettlementBatch_tenantId_providerId_cycleMonth_cycl_key" ON "ProviderSettlementBatch"("tenantId", "providerId", "cycleMonth", "cycleYear", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ReimbursementRequest_claimId_key" ON "ReimbursementRequest"("claimId");

-- CreateIndex
CREATE INDEX "ReimbursementRequest_tenantId_memberId_idx" ON "ReimbursementRequest"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "Role_tenantId_isActive_idx" ON "Role"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_tenantId_userId_isActive_idx" ON "UserRoleAssignment"("tenantId", "userId", "isActive");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_tenantId_status_idx" ON "UserRoleAssignment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

-- CreateIndex
CREATE INDEX "OverrideRecord_tenantId_status_idx" ON "OverrideRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OverrideRecord_tenantId_makerId_idx" ON "OverrideRecord"("tenantId", "makerId");

-- CreateIndex
CREATE INDEX "OverrideRecord_tenantId_entityType_entityId_idx" ON "OverrideRecord"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "InternalBlacklist_tenantId_isActive_idx" ON "InternalBlacklist"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "InternalBlacklist_tenantId_nationalId_isActive_idx" ON "InternalBlacklist"("tenantId", "nationalId", "isActive");

-- CreateIndex
CREATE INDEX "CrossBorderFacility_tenantId_isActive_idx" ON "CrossBorderFacility"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "CrossBorderFacility_tenantId_country_idx" ON "CrossBorderFacility"("tenantId", "country");

-- CreateIndex
CREATE INDEX "CrossBorderCase_tenantId_clientId_idx" ON "CrossBorderCase"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "CrossBorderCase_tenantId_status_idx" ON "CrossBorderCase"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CrossBorderCase_memberId_idx" ON "CrossBorderCase"("memberId");

-- CreateIndex
CREATE INDEX "CrossBorderCase_facilityId_idx" ON "CrossBorderCase"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "CrossBorderCase_tenantId_caseNumber_key" ON "CrossBorderCase"("tenantId", "caseNumber");

-- CreateIndex
CREATE INDEX "CrossBorderLineItem_caseId_kind_idx" ON "CrossBorderLineItem"("caseId", "kind");

-- CreateIndex
CREATE INDEX "CrossBorderLineItem_tenantId_idx" ON "CrossBorderLineItem"("tenantId");

-- CreateIndex
CREATE INDEX "WellnessProgram_tenantId_isActive_idx" ON "WellnessProgram"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "WellnessProgram_tenantId_clientId_idx" ON "WellnessProgram"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "WellnessProgram_tenantId_type_idx" ON "WellnessProgram"("tenantId", "type");

-- CreateIndex
CREATE INDEX "WellnessEnrollment_tenantId_status_idx" ON "WellnessEnrollment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WellnessEnrollment_tenantId_nextDueDate_idx" ON "WellnessEnrollment"("tenantId", "nextDueDate");

-- CreateIndex
CREATE INDEX "WellnessEnrollment_memberId_idx" ON "WellnessEnrollment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessEnrollment_tenantId_programId_memberId_key" ON "WellnessEnrollment"("tenantId", "programId", "memberId");

-- CreateIndex
CREATE INDEX "WellnessActivity_enrollmentId_idx" ON "WellnessActivity"("enrollmentId");

-- CreateIndex
CREATE INDEX "WellnessActivity_tenantId_memberId_idx" ON "WellnessActivity"("tenantId", "memberId");

-- CreateIndex
CREATE INDEX "ClaimIntakeReceipt_tenantId_strongEventFingerprint_idx" ON "ClaimIntakeReceipt"("tenantId", "strongEventFingerprint");

-- CreateIndex
CREATE INDEX "ClaimIntakeReceipt_tenantId_suspectedDuplicateFingerprint_idx" ON "ClaimIntakeReceipt"("tenantId", "suspectedDuplicateFingerprint");

-- CreateIndex
CREATE INDEX "ClaimIntakeReceipt_tenantId_state_createdAt_idx" ON "ClaimIntakeReceipt"("tenantId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "ClaimIntakeReceipt_claimId_idx" ON "ClaimIntakeReceipt"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimIntakeReceipt_tenantId_scopeKey_channel_idempotencyKey_key" ON "ClaimIntakeReceipt"("tenantId", "scopeKey", "channel", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ClaimProcessingRun_tenantId_state_nextAttemptAt_idx" ON "ClaimProcessingRun"("tenantId", "state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ClaimProcessingRun_tenantId_assignedQueue_state_idx" ON "ClaimProcessingRun"("tenantId", "assignedQueue", "state");

-- CreateIndex
CREATE INDEX "ClaimProcessingRun_claimId_idx" ON "ClaimProcessingRun"("claimId");

-- CreateIndex
CREATE INDEX "ClaimProcessingRun_receiptId_idx" ON "ClaimProcessingRun"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimProcessingRun_claimId_claimRevision_workflowVersion_se_key" ON "ClaimProcessingRun"("claimId", "claimRevision", "workflowVersion", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimProcessingStage_runId_stage_key" ON "ClaimProcessingStage"("runId", "stage");

-- CreateIndex
CREATE INDEX "ClaimAutopilotBreaker_tenantId_isOpen_idx" ON "ClaimAutopilotBreaker"("tenantId", "isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAutopilotBreaker_tenantId_clientId_key" ON "ClaimAutopilotBreaker"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "ClaimReconsideration_tenantId_claimId_idx" ON "ClaimReconsideration"("tenantId", "claimId");

-- CreateIndex
CREATE INDEX "ClaimReconsideration_tenantId_status_idx" ON "ClaimReconsideration"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClaimReconsideration_tenantId_providerId_idx" ON "ClaimReconsideration"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ClaimReconsideration_tenantId_clientId_idx" ON "ClaimReconsideration"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimReconsideration_tenantId_idempotencyKey_key" ON "ClaimReconsideration"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ClaimReconsiderationLine_reconsiderationId_idx" ON "ClaimReconsiderationLine"("reconsiderationId");

-- CreateIndex
CREATE INDEX "ClaimReconsiderationLine_claimLineId_idx" ON "ClaimReconsiderationLine"("claimLineId");

-- CreateIndex
CREATE INDEX "ClaimReconsiderationEvent_tenantId_reconsiderationId_create_idx" ON "ClaimReconsiderationEvent"("tenantId", "reconsiderationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimReconsiderationEvent_reconsiderationId_sequence_key" ON "ClaimReconsiderationEvent"("reconsiderationId", "sequence");

-- CreateIndex
CREATE INDEX "ProviderDisbursement_tenantId_settlementBatchId_idx" ON "ProviderDisbursement"("tenantId", "settlementBatchId");

-- CreateIndex
CREATE INDEX "ProviderDisbursement_tenantId_providerId_idx" ON "ProviderDisbursement"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderDisbursement_tenantId_status_idx" ON "ProviderDisbursement"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDisbursement_tenantId_idempotencyKey_key" ON "ProviderDisbursement"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SettlementReconciliationRun_tenantId_startedAt_idx" ON "SettlementReconciliationRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "SettlementReconciliationException_tenantId_runId_idx" ON "SettlementReconciliationException"("tenantId", "runId");

-- CreateIndex
CREATE INDEX "SettlementReconciliationException_tenantId_settlementBatchI_idx" ON "SettlementReconciliationException"("tenantId", "settlementBatchId");

-- CreateIndex
CREATE INDEX "SettlementReconciliationException_tenantId_investigationSta_idx" ON "SettlementReconciliationException"("tenantId", "investigationStatus");

-- CreateIndex
CREATE INDEX "ProviderPaymentQuery_tenantId_settlementBatchId_idx" ON "ProviderPaymentQuery"("tenantId", "settlementBatchId");

-- CreateIndex
CREATE INDEX "ProviderPaymentQuery_tenantId_providerId_idx" ON "ProviderPaymentQuery"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderPaymentQuery_tenantId_status_idx" ON "ProviderPaymentQuery"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderPaymentQuery_tenantId_clientId_idx" ON "ProviderPaymentQuery"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPaymentQuery_tenantId_idempotencyKey_key" ON "ProviderPaymentQuery"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProviderPaymentQueryMessage_tenantId_paymentQueryId_created_idx" ON "ProviderPaymentQueryMessage"("tenantId", "paymentQueryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPaymentQueryMessage_paymentQueryId_sequence_key" ON "ProviderPaymentQueryMessage"("paymentQueryId", "sequence");

-- CreateIndex
CREATE INDEX "ProviderMasterDataChangeRequest_tenantId_providerId_idx" ON "ProviderMasterDataChangeRequest"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderMasterDataChangeRequest_tenantId_status_idx" ON "ProviderMasterDataChangeRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderMasterDataChangeRequest_tenantId_category_idx" ON "ProviderMasterDataChangeRequest"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderMasterDataChangeRequest_tenantId_idempotencyKey_key" ON "ProviderMasterDataChangeRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProviderMasterDataChangeEvent_tenantId_changeRequestId_crea_idx" ON "ProviderMasterDataChangeEvent"("tenantId", "changeRequestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderMasterDataChangeEvent_changeRequestId_sequence_key" ON "ProviderMasterDataChangeEvent"("changeRequestId", "sequence");

-- CreateIndex
CREATE INDEX "ProviderImprovementPlan_tenantId_providerId_idx" ON "ProviderImprovementPlan"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderImprovementPlan_tenantId_status_idx" ON "ProviderImprovementPlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderImprovementAction_tenantId_planId_idx" ON "ProviderImprovementAction"("tenantId", "planId");

-- CreateIndex
CREATE INDEX "ProviderImprovementUpdate_tenantId_planId_createdAt_idx" ON "ProviderImprovementUpdate"("tenantId", "planId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderImprovementUpdate_planId_sequence_key" ON "ProviderImprovementUpdate"("planId", "sequence");

-- CreateIndex
CREATE INDEX "ProviderPerformanceScore_tenantId_providerId_period_idx" ON "ProviderPerformanceScore"("tenantId", "providerId", "period");

-- CreateIndex
CREATE INDEX "ProviderPerformanceScore_tenantId_metricKey_period_idx" ON "ProviderPerformanceScore"("tenantId", "metricKey", "period");

-- CreateIndex
CREATE INDEX "ProviderPerformanceScore_tenantId_status_period_idx" ON "ProviderPerformanceScore"("tenantId", "status", "period");

-- CreateIndex
CREATE INDEX "ProviderPerformanceScore_tenantId_cohortKey_period_metricKe_idx" ON "ProviderPerformanceScore"("tenantId", "cohortKey", "period", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPerformanceScore_tenantId_period_providerId_provide_key" ON "ProviderPerformanceScore"("tenantId", "period", "providerId", "providerBranchId", "metricKey", "definitionVersion");

-- CreateIndex
CREATE INDEX "PerformanceCohortBenchmark_tenantId_period_metricKey_idx" ON "PerformanceCohortBenchmark"("tenantId", "period", "metricKey");

-- CreateIndex
CREATE INDEX "PerformanceCohortBenchmark_tenantId_cohortKey_period_idx" ON "PerformanceCohortBenchmark"("tenantId", "cohortKey", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceCohortBenchmark_tenantId_period_metricKey_defini_key" ON "PerformanceCohortBenchmark"("tenantId", "period", "metricKey", "definitionVersion", "cohortKey", "publicationVersion");

-- CreateIndex
CREATE INDEX "ProviderIntegrationConnection_tenantId_providerId_idx" ON "ProviderIntegrationConnection"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderIntegrationConnection_tenantId_status_idx" ON "ProviderIntegrationConnection"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProviderIntegrationConnection_tenantId_providerId_providerB_idx" ON "ProviderIntegrationConnection"("tenantId", "providerId", "providerBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIntegrationConnection_tenantId_providerId_providerB_key" ON "ProviderIntegrationConnection"("tenantId", "providerId", "providerBranchId", "connectorType", "mode");

-- CreateIndex
CREATE INDEX "ProviderIntegrationDelivery_tenantId_providerId_status_idx" ON "ProviderIntegrationDelivery"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "ProviderIntegrationDelivery_connectionId_status_idx" ON "ProviderIntegrationDelivery"("connectionId", "status");

-- CreateIndex
CREATE INDEX "ProviderIntegrationDelivery_status_nextAttemptAt_idx" ON "ProviderIntegrationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProviderIntegrationDelivery_tenantId_businessObjectType_rec_idx" ON "ProviderIntegrationDelivery"("tenantId", "businessObjectType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIntegrationDelivery_connectionId_idempotencyKey_key" ON "ProviderIntegrationDelivery"("connectionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProviderIntegrationRecordResult_tenantId_outcome_idx" ON "ProviderIntegrationRecordResult"("tenantId", "outcome");

-- CreateIndex
CREATE INDEX "ProviderIntegrationRecordResult_deliveryId_idx" ON "ProviderIntegrationRecordResult"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIntegrationRecordResult_deliveryId_recordHash_key" ON "ProviderIntegrationRecordResult"("deliveryId", "recordHash");

-- CreateIndex
CREATE INDEX "ProviderIntegrationAttempt_deliveryId_idx" ON "ProviderIntegrationAttempt"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIntegrationAttempt_deliveryId_attemptNumber_key" ON "ProviderIntegrationAttempt"("deliveryId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ProviderIntegrationSecret_connectionId_status_idx" ON "ProviderIntegrationSecret"("connectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIntegrationSecret_connectionId_version_key" ON "ProviderIntegrationSecret"("connectionId", "version");

-- CreateIndex
CREATE INDEX "CapitationArrangement_tenantId_providerId_status_idx" ON "CapitationArrangement"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "CapitationArrangement_tenantId_providerId_providerBranchId__idx" ON "CapitationArrangement"("tenantId", "providerId", "providerBranchId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CapitationPeriod_tenantId_status_period_idx" ON "CapitationPeriod"("tenantId", "status", "period");

-- CreateIndex
CREATE UNIQUE INDEX "CapitationPeriod_arrangementId_period_key" ON "CapitationPeriod"("arrangementId", "period");

-- CreateIndex
CREATE INDEX "CapitationAdjustment_periodId_idx" ON "CapitationAdjustment"("periodId");

-- CreateIndex
CREATE INDEX "CapitationAdjustment_tenantId_category_idx" ON "CapitationAdjustment"("tenantId", "category");

-- CreateIndex
CREATE INDEX "CapitationEligibleLife_periodId_included_idx" ON "CapitationEligibleLife"("periodId", "included");

-- CreateIndex
CREATE INDEX "CapitationEligibleLife_tenantId_memberId_idx" ON "CapitationEligibleLife"("tenantId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CapitationEligibleLife_periodId_memberId_key" ON "CapitationEligibleLife"("periodId", "memberId");

-- CreateIndex
CREATE INDEX "CapitationEncounterLink_tenantId_arrangementId_idx" ON "CapitationEncounterLink"("tenantId", "arrangementId");

-- CreateIndex
CREATE INDEX "CapitationEncounterLink_periodId_idx" ON "CapitationEncounterLink"("periodId");

-- CreateIndex
CREATE INDEX "CapitationEncounterLink_memberId_serviceDate_idx" ON "CapitationEncounterLink"("memberId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "CapitationEncounterLink_entityType_entityId_key" ON "CapitationEncounterLink"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ClinicalProtocolPack_tenantId_isActive_idx" ON "ClinicalProtocolPack"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ClinicalProtocolPack_tenantId_status_idx" ON "ClinicalProtocolPack"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalProtocolPack_tenantId_version_key" ON "ClinicalProtocolPack"("tenantId", "version");

-- CreateIndex
CREATE INDEX "ClinicalInterventionGroup_packId_idx" ON "ClinicalInterventionGroup"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalInterventionGroup_packId_groupCode_key" ON "ClinicalInterventionGroup"("packId", "groupCode");

-- CreateIndex
CREATE INDEX "ClinicalCodeMembership_packId_codeSystem_code_idx" ON "ClinicalCodeMembership"("packId", "codeSystem", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalCodeMembership_groupId_codeSystem_code_key" ON "ClinicalCodeMembership"("groupId", "codeSystem", "code");

-- CreateIndex
CREATE INDEX "ClinicalLabRule_packId_idx" ON "ClinicalLabRule"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalLabRule_packId_testCode_key" ON "ClinicalLabRule"("packId", "testCode");

-- CreateIndex
CREATE INDEX "ClinicalLabRuleGroupLink_packId_groupId_idx" ON "ClinicalLabRuleGroupLink"("packId", "groupId");

-- CreateIndex
CREATE INDEX "ClinicalLabRuleGroupLink_packId_linkType_idx" ON "ClinicalLabRuleGroupLink"("packId", "linkType");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalLabRuleGroupLink_labRuleId_groupId_linkType_key" ON "ClinicalLabRuleGroupLink"("labRuleId", "groupId", "linkType");

-- CreateIndex
CREATE INDEX "ClinicalLineAlias_labRuleId_idx" ON "ClinicalLineAlias"("labRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalLineAlias_packId_matchType_value_key" ON "ClinicalLineAlias"("packId", "matchType", "value");

-- CreateIndex
CREATE INDEX "ClinicalShadowVerdict_tenantId_ruleCode_verdict_idx" ON "ClinicalShadowVerdict"("tenantId", "ruleCode", "verdict");

-- CreateIndex
CREATE INDEX "ClinicalShadowVerdict_tenantId_createdAt_idx" ON "ClinicalShadowVerdict"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalShadowVerdict_claimId_ruleCode_reviewedById_key" ON "ClinicalShadowVerdict"("claimId", "ruleCode", "reviewedById");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_groupId_idx" ON "ImportBatch"("tenantId", "groupId");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_createdAt_idx" ON "ImportBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_tenantId_idempotencyKey_key" ON "ImportBatch"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "_FundAdminGroups_B_index" ON "_FundAdminGroups"("B");

-- CreateIndex
CREATE INDEX "_ProducerSchemes_B_index" ON "_ProducerSchemes"("B");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_operatorTenantId_fkey" FOREIGN KEY ("operatorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_parentClientId_fkey" FOREIGN KEY ("parentClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminologyEntry" ADD CONSTRAINT "TerminologyEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminologyEntry" ADD CONSTRAINT "TerminologyEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminologyApproval" ADD CONSTRAINT "TerminologyApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminologyApproval" ADD CONSTRAINT "TerminologyApproval_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TerminologyEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFeeAgreement" ADD CONSTRAINT "AdminFeeAgreement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFeeAgreement" ADD CONSTRAINT "AdminFeeAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFeeAgreement" ADD CONSTRAINT "AdminFeeAgreement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFeeLedgerEntry" ADD CONSTRAINT "AdminFeeLedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFeeLedgerEntry" ADD CONSTRAINT "AdminFeeLedgerEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFeeLedgerEntry" ADD CONSTRAINT "AdminFeeLedgerEntry_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "AdminFeeAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryLicence" ADD CONSTRAINT "RegulatoryLicence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityDeposit" ADD CONSTRAINT "SecurityDeposit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRegister" ADD CONSTRAINT "DirectorRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndemnityCover" ADD CONSTRAINT "IndemnityCover_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLevyComputation" ADD CONSTRAINT "ComplianceLevyComputation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessorRegister" ADD CONSTRAINT "ProcessorRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachIncident" ADD CONSTRAINT "BreachIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudRule" ADD CONSTRAINT "FraudRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudRule" ADD CONSTRAINT "FraudRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudInvestigation" ADD CONSTRAINT "FraudInvestigation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "MemberCoveragePeriod" ADD CONSTRAINT "MemberCoveragePeriod_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthFile" ADD CONSTRAINT "MemberHealthFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthFile" ADD CONSTRAINT "MemberHealthFile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVitalEntry" ADD CONSTRAINT "MemberVitalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVitalEntry" ADD CONSTRAINT "MemberVitalEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthJournalEntry" ADD CONSTRAINT "MemberHealthJournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthJournalEntry" ADD CONSTRAINT "MemberHealthJournalEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_healthFileId_fkey" FOREIGN KEY ("healthFileId") REFERENCES "MemberHealthFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "MemberHealthJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "ApprovalMatrix" ADD CONSTRAINT "ApprovalMatrix_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "ApprovalMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "ApprovalMatrix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoAdjudicationPolicy" ADD CONSTRAINT "AutoAdjudicationPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoAdjudicationPolicy" ADD CONSTRAINT "AutoAdjudicationPolicy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_offlineAuthId_fkey" FOREIGN KEY ("offlineAuthId") REFERENCES "OfflineWorkAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineReservation" ADD CONSTRAINT "OfflineReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilitySnapshot" ADD CONSTRAINT "EligibilitySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineWorkAuthorization" ADD CONSTRAINT "OfflineWorkAuthorization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineWorkAuthorization" ADD CONSTRAINT "OfflineWorkAuthorization_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineWorkAuthorization" ADD CONSTRAINT "OfflineWorkAuthorization_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProviderBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineWorkAuthorization" ADD CONSTRAINT "OfflineWorkAuthorization_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineDataPack" ADD CONSTRAINT "OfflineDataPack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineDataPack" ADD CONSTRAINT "OfflineDataPack_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageVersion" ADD CONSTRAINT "PackageVersion_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitConfig" ADD CONSTRAINT "BenefitConfig_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedLimitGroup" ADD CONSTRAINT "SharedLimitGroup_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitConfigSharedLimit" ADD CONSTRAINT "BenefitConfigSharedLimit_benefitConfigId_fkey" FOREIGN KEY ("benefitConfigId") REFERENCES "BenefitConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitConfigSharedLimit" ADD CONSTRAINT "BenefitConfigSharedLimit_sharedLimitGroupId_fkey" FOREIGN KEY ("sharedLimitGroupId") REFERENCES "SharedLimitGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endorsement" ADD CONSTRAINT "Endorsement_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProRataCalculation" ADD CONSTRAINT "ProRataCalculation_endorsementId_fkey" FOREIGN KEY ("endorsementId") REFERENCES "Endorsement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_providerBranchId_fkey" FOREIGN KEY ("providerBranchId") REFERENCES "ProviderBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClinicalCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_adjudicatorId_fkey" FOREIGN KEY ("adjudicatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_seniorAdjudicatorId_fkey" FOREIGN KEY ("seniorAdjudicatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "ProviderSettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_paymentVoucherId_fkey" FOREIGN KEY ("paymentVoucherId") REFERENCES "PaymentVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugExclusion" ADD CONSTRAINT "DrugExclusion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugExclusion" ADD CONSTRAINT "DrugExclusion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjudicationReasonCode" ADD CONSTRAINT "AdjudicationReasonCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_reasonCodeId_fkey" FOREIGN KEY ("reasonCodeId") REFERENCES "AdjudicationReasonCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClinicalCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_providerBranchId_fkey" FOREIGN KEY ("providerBranchId") REFERENCES "ProviderBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCase" ADD CONSTRAINT "ClinicalCase_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseServiceEntry" ADD CONSTRAINT "CaseServiceEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClinicalCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseServiceEntry" ADD CONSTRAINT "CaseServiceEntry_billedInClaimId_fkey" FOREIGN KEY ("billedInClaimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfUndertaking" ADD CONSTRAINT "LetterOfUndertaking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfUndertaking" ADD CONSTRAINT "LetterOfUndertaking_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfUndertaking" ADD CONSTRAINT "LetterOfUndertaking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfUndertaking" ADD CONSTRAINT "LetterOfUndertaking_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClinicalCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfUndertaking" ADD CONSTRAINT "LetterOfUndertaking_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitHold" ADD CONSTRAINT "BenefitHold_preAuthId_fkey" FOREIGN KEY ("preAuthId") REFERENCES "PreAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderApiKey" ADD CONSTRAINT "ProviderApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderApiKey" ADD CONSTRAINT "ProviderApiKey_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBranch" ADD CONSTRAINT "ProviderBranch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBranch" ADD CONSTRAINT "ProviderBranch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUserBranchAssignment" ADD CONSTRAINT "ProviderUserBranchAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUserBranchAssignment" ADD CONSTRAINT "ProviderUserBranchAssignment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUserBranchAssignment" ADD CONSTRAINT "ProviderUserBranchAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUserBranchAssignment" ADD CONSTRAINT "ProviderUserBranchAssignment_providerBranchId_fkey" FOREIGN KEY ("providerBranchId") REFERENCES "ProviderBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAlias" ADD CONSTRAINT "ProviderAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAlias" ADD CONSTRAINT "ProviderAlias_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContractVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProviderBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTariff" ADD CONSTRAINT "ProviderTariff_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategoryAlias" ADD CONSTRAINT "ServiceCategoryAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategoryAlias" ADD CONSTRAINT "ServiceCategoryAlias_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMappingMemory" ADD CONSTRAINT "ServiceMappingMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMappingMemory" ADD CONSTRAINT "ServiceMappingMemory_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "ProviderTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDiagnosisTariff" ADD CONSTRAINT "ProviderDiagnosisTariff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDiagnosisTariff" ADD CONSTRAINT "ProviderDiagnosisTariff_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContract" ADD CONSTRAINT "ProviderContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContract" ADD CONSTRAINT "ProviderContract_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContract" ADD CONSTRAINT "ProviderContract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "ProviderContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContract" ADD CONSTRAINT "ProviderContract_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ProviderContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContract" ADD CONSTRAINT "ProviderContract_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ContractVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApplicability" ADD CONSTRAINT "ContractApplicability_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApplicability" ADD CONSTRAINT "ContractApplicability_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBranch" ADD CONSTRAINT "ContractBranch_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBranch" ADD CONSTRAINT "ContractBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProviderBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSourceDocument" ADD CONSTRAINT "ContractSourceDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSourceDocument" ADD CONSTRAINT "ContractSourceDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContractExclusion" ADD CONSTRAINT "ProviderContractExclusion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractExtraction" ADD CONSTRAINT "ContractExtraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReconciliation" ADD CONSTRAINT "ContractReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPackage" ADD CONSTRAINT "ContractPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPackage" ADD CONSTRAINT "ContractPackage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreauthRule" ADD CONSTRAINT "PreauthRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreauthRule" ADD CONSTRAINT "PreauthRule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationRule" ADD CONSTRAINT "DocumentationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationRule" ADD CONSTRAINT "DocumentationRule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProviderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTariffTable" ADD CONSTRAINT "ExternalTariffTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideControl" ADD CONSTRAINT "OverrideControl_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageProviderEligibility" ADD CONSTRAINT "PackageProviderEligibility_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageProviderEligibility" ADD CONSTRAINT "PackageProviderEligibility_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentExclusionRule" ADD CONSTRAINT "TreatmentExclusionRule_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentExclusionRule" ADD CONSTRAINT "TreatmentExclusionRule_providerContractId_fkey" FOREIGN KEY ("providerContractId") REFERENCES "ProviderContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRule" ADD CONSTRAINT "ReferralRule_packageVersionId_fkey" FOREIGN KEY ("packageVersionId") REFERENCES "PackageVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_parentBrokerId_fkey" FOREIGN KEY ("parentBrokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerKycDocument" ADD CONSTRAINT "BrokerKycDocument_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerProducer" ADD CONSTRAINT "BrokerProducer_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerCommissionSchedule" ADD CONSTRAINT "BrokerCommissionSchedule_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BrokerCommissionSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BrokerCommissionSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "CommissionPayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_clawbackParentId_fkey" FOREIGN KEY ("clawbackParentId") REFERENCES "CommissionLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_assignedAssessorId_fkey" FOREIGN KEY ("assignedAssessorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRateTable" ADD CONSTRAINT "ContributionRateTable_pricingModelId_fkey" FOREIGN KEY ("pricingModelId") REFERENCES "PricingModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_endorsementId_fkey" FOREIGN KEY ("endorsementId") REFERENCES "Endorsement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_preauthId_fkey" FOREIGN KEY ("preauthId") REFERENCES "PreAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ClinicalCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "CoContributionRule" ADD CONSTRAINT "CoContributionRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "MemberCoContributionPayment" ADD CONSTRAINT "MemberCoContributionPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCoContributionPayment" ADD CONSTRAINT "MemberCoContributionPayment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCoContributionPayment" ADD CONSTRAINT "MemberCoContributionPayment_coContributionTransactionId_fkey" FOREIGN KEY ("coContributionTransactionId") REFERENCES "CoContributionTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAnnualCoContribution" ADD CONSTRAINT "MemberAnnualCoContribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAnnualCoContribution" ADD CONSTRAINT "MemberAnnualCoContribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAnnualCoContribution" ADD CONSTRAINT "FamilyAnnualCoContribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAnnualCoContribution" ADD CONSTRAINT "FamilyAnnualCoContribution_principalMemberId_fkey" FOREIGN KEY ("principalMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLife" ADD CONSTRAINT "QuotationLife_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderwritingDecision" ADD CONSTRAINT "UnderwritingDecision_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderwritingDecision" ADD CONSTRAINT "UnderwritingDecision_quotationLifeId_fkey" FOREIGN KEY ("quotationLifeId") REFERENCES "QuotationLife"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnderwritingDecision" ADD CONSTRAINT "UnderwritingDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberKycDocument" ADD CONSTRAINT "MemberKycDocument_kycRecordId_fkey" FOREIGN KEY ("kycRecordId") REFERENCES "MemberKycRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRiskProfile" ADD CONSTRAINT "QuotationRiskProfile_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorWorkQueueItem" ADD CONSTRAINT "AssessorWorkQueueItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessorWorkQueueItem" ADD CONSTRAINT "AssessorWorkQueueItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAcceptance" ADD CONSTRAINT "QuotationAcceptance_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAcceptance" ADD CONSTRAINT "QuotationAcceptance_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationVersion" ADD CONSTRAINT "QuotationVersion_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLineItem" ADD CONSTRAINT "QuotationLineItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSettlementBatch" ADD CONSTRAINT "ProviderSettlementBatch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementRequest" ADD CONSTRAINT "ReimbursementRequest_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRecord" ADD CONSTRAINT "OverrideRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRecord" ADD CONSTRAINT "OverrideRecord_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRecord" ADD CONSTRAINT "OverrideRecord_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalBlacklist" ADD CONSTRAINT "InternalBlacklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalBlacklist" ADD CONSTRAINT "InternalBlacklist_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderFacility" ADD CONSTRAINT "CrossBorderFacility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderCase" ADD CONSTRAINT "CrossBorderCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderCase" ADD CONSTRAINT "CrossBorderCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderCase" ADD CONSTRAINT "CrossBorderCase_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderCase" ADD CONSTRAINT "CrossBorderCase_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "CrossBorderFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderLineItem" ADD CONSTRAINT "CrossBorderLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossBorderLineItem" ADD CONSTRAINT "CrossBorderLineItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CrossBorderCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessProgram" ADD CONSTRAINT "WellnessProgram_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessProgram" ADD CONSTRAINT "WellnessProgram_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessEnrollment" ADD CONSTRAINT "WellnessEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessEnrollment" ADD CONSTRAINT "WellnessEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WellnessProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessEnrollment" ADD CONSTRAINT "WellnessEnrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessActivity" ADD CONSTRAINT "WellnessActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessActivity" ADD CONSTRAINT "WellnessActivity_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "WellnessEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessActivity" ADD CONSTRAINT "WellnessActivity_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimIntakeReceipt" ADD CONSTRAINT "ClaimIntakeReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimIntakeReceipt" ADD CONSTRAINT "ClaimIntakeReceipt_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimProcessingRun" ADD CONSTRAINT "ClaimProcessingRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimProcessingRun" ADD CONSTRAINT "ClaimProcessingRun_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimProcessingRun" ADD CONSTRAINT "ClaimProcessingRun_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ClaimIntakeReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimProcessingStage" ADD CONSTRAINT "ClaimProcessingStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ClaimProcessingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAutopilotBreaker" ADD CONSTRAINT "ClaimAutopilotBreaker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimReconsiderationLine" ADD CONSTRAINT "ClaimReconsiderationLine_reconsiderationId_fkey" FOREIGN KEY ("reconsiderationId") REFERENCES "ClaimReconsideration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimReconsiderationEvent" ADD CONSTRAINT "ClaimReconsiderationEvent_reconsiderationId_fkey" FOREIGN KEY ("reconsiderationId") REFERENCES "ClaimReconsideration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPaymentQueryMessage" ADD CONSTRAINT "ProviderPaymentQueryMessage_paymentQueryId_fkey" FOREIGN KEY ("paymentQueryId") REFERENCES "ProviderPaymentQuery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMasterDataChangeEvent" ADD CONSTRAINT "ProviderMasterDataChangeEvent_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ProviderMasterDataChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderImprovementAction" ADD CONSTRAINT "ProviderImprovementAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProviderImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderImprovementUpdate" ADD CONSTRAINT "ProviderImprovementUpdate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProviderImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderIntegrationDelivery" ADD CONSTRAINT "ProviderIntegrationDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ProviderIntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderIntegrationRecordResult" ADD CONSTRAINT "ProviderIntegrationRecordResult_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ProviderIntegrationDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderIntegrationAttempt" ADD CONSTRAINT "ProviderIntegrationAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ProviderIntegrationDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderIntegrationSecret" ADD CONSTRAINT "ProviderIntegrationSecret_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ProviderIntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitationPeriod" ADD CONSTRAINT "CapitationPeriod_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "CapitationArrangement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitationAdjustment" ADD CONSTRAINT "CapitationAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CapitationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitationEligibleLife" ADD CONSTRAINT "CapitationEligibleLife_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CapitationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalInterventionGroup" ADD CONSTRAINT "ClinicalInterventionGroup_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ClinicalProtocolPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCodeMembership" ADD CONSTRAINT "ClinicalCodeMembership_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ClinicalProtocolPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCodeMembership" ADD CONSTRAINT "ClinicalCodeMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClinicalInterventionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLabRule" ADD CONSTRAINT "ClinicalLabRule_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ClinicalProtocolPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLabRuleGroupLink" ADD CONSTRAINT "ClinicalLabRuleGroupLink_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ClinicalProtocolPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLabRuleGroupLink" ADD CONSTRAINT "ClinicalLabRuleGroupLink_labRuleId_fkey" FOREIGN KEY ("labRuleId") REFERENCES "ClinicalLabRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLabRuleGroupLink" ADD CONSTRAINT "ClinicalLabRuleGroupLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClinicalInterventionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLineAlias" ADD CONSTRAINT "ClinicalLineAlias_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ClinicalProtocolPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalLineAlias" ADD CONSTRAINT "ClinicalLineAlias_labRuleId_fkey" FOREIGN KEY ("labRuleId") REFERENCES "ClinicalLabRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FundAdminGroups" ADD CONSTRAINT "_FundAdminGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FundAdminGroups" ADD CONSTRAINT "_FundAdminGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProducerSchemes" ADD CONSTRAINT "_ProducerSchemes_A_fkey" FOREIGN KEY ("A") REFERENCES "BrokerProducer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProducerSchemes" ADD CONSTRAINT "_ProducerSchemes_B_fkey" FOREIGN KEY ("B") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

