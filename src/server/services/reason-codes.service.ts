import { prisma } from "@/lib/prisma";
import type { ReasonSeverity } from "@prisma/client";

// ─── ADJUDICATION REASON-CODE CATALOG (spec §5.13 / §10.1) ───────────────────
// Seed catalog for `AdjudicationReasonCode`. No claim/line reaches DECLINED or a
// shortfall without one of these; provider-facing text never prints a bare
// "Rejected". Tenants may extend/override rows; these are the platform defaults.

export interface ReasonCodeSeed {
  code: string;
  category: string;
  internalDescription: string;
  providerDescription: string;
  memberDescription: string;
  contractRuleRefType?: string;
  defaultSeverity: ReasonSeverity;
  remedy?: string;
  resubmissionAllowed?: boolean;
  overrideAllowed?: boolean;
  allowedOverrideTypes?: string[];
  escalationRoute?: string;
}

export const REASON_CODE_CATALOG: ReasonCodeSeed[] = [
  // ── Contract ──
  { code: "CON-001", category: "Contract", internalDescription: "No active contract found for provider/payer/service date", providerDescription: "No active rate agreement covers this service date for your facility under this payer.", memberDescription: "We could not match your provider to an active agreement for this service.", defaultSeverity: "PEND", remedy: "Confirm/capture the contract for this provider and payer.", overrideAllowed: true, allowedOverrideTypes: ["CREATE_TEMPORARY_RATE"], escalationRoute: "NO_CONTRACT" },
  { code: "CON-002", category: "Contract", internalDescription: "Provider not contracted for this payer/scheme/plan", providerDescription: "Your facility is not contracted for this payer/scheme on the service date.", memberDescription: "Your provider is not in-network for your scheme for this service.", defaultSeverity: "PEND", remedy: "Confirm applicability with provider relations.", escalationRoute: "PROVIDER_NOT_CONTRACTED" },
  { code: "CON-003", category: "Contract", internalDescription: "Contract expired before service date", providerDescription: "The rate agreement had expired before this service date.", memberDescription: "The provider agreement had lapsed for this service date.", defaultSeverity: "PEND", remedy: "Renew/extend the contract or override.", overrideAllowed: true, allowedOverrideTypes: ["PAY_DESPITE_EXPIRED_CONTRACT"], escalationRoute: "CONTRACT_EXPIRED" },
  { code: "CON-004", category: "Contract", internalDescription: "Service date after contract termination", providerDescription: "This service was rendered after the agreement was terminated.", memberDescription: "The provider agreement had ended for this service date.", defaultSeverity: "REJECT", remedy: "Not payable; confirm termination date.", overrideAllowed: true, allowedOverrideTypes: ["PAY_DESPITE_EXPIRED_CONTRACT"], escalationRoute: "CONTRACT_EXPIRED" },
  { code: "CON-005", category: "Contract", internalDescription: "Contract suspended", providerDescription: "Your rate agreement is currently suspended.", memberDescription: "Your provider's agreement is temporarily suspended.", defaultSeverity: "PEND", remedy: "Compliance review of the suspension.", escalationRoute: "CONTRACT_SUSPENDED" },
  { code: "CON-006", category: "Contract", internalDescription: "Contract not approved (defensive)", providerDescription: "The matched agreement is not approved for pricing.", memberDescription: "We could not price this claim yet.", defaultSeverity: "PEND", escalationRoute: "NO_CONTRACT" },
  { code: "CON-007", category: "Contract", internalDescription: "Contract not yet effective on service date", providerDescription: "The rate agreement was not yet effective on this service date.", memberDescription: "The provider agreement had not started for this service date.", defaultSeverity: "PEND", overrideAllowed: true, allowedOverrideTypes: ["PAY_DESPITE_EXPIRED_CONTRACT"], escalationRoute: "CONTRACT_EXPIRED" },
  { code: "CON-008", category: "Contract", internalDescription: "Provider branch not covered by contract", providerDescription: "This branch is not covered by the rate agreement.", memberDescription: "This facility branch is not in-network for your scheme.", defaultSeverity: "PEND", remedy: "Confirm branch scope with the payer.", escalationRoute: "PROVIDER_NOT_CONTRACTED" },
  { code: "CON-010", category: "Contract", internalDescription: "Ambiguous contract match — manual resolution required", providerDescription: "More than one agreement matches; we are confirming the correct one.", memberDescription: "We are confirming the correct provider agreement.", defaultSeverity: "PEND", escalationRoute: "RATE_AMBIGUITY" },
  // ── Eligibility ──
  { code: "ELG-001", category: "Eligibility", internalDescription: "Member plan not covered by this provider contract", providerDescription: "The member's plan is not covered by your agreement.", memberDescription: "Your plan is not covered at this provider.", defaultSeverity: "REJECT", escalationRoute: "PROVIDER_NOT_CONTRACTED" },
  { code: "ELG-002", category: "Eligibility", internalDescription: "Benefit type not eligible under contract", providerDescription: "This benefit type is not eligible under your agreement.", memberDescription: "This benefit is not covered at this provider.", defaultSeverity: "REJECT" },
  { code: "ELG-003", category: "Eligibility", internalDescription: "Member category not in beneficiary schedule", providerDescription: "The member is not in the eligible beneficiary schedule.", memberDescription: "Your membership status does not cover this service.", defaultSeverity: "REJECT" },
  // ── Service ──
  { code: "SVC-001", category: "Service", internalDescription: "Service category outside contract scope", providerDescription: "This service category is outside the scope of your agreement.", memberDescription: "This service is not covered under the provider agreement.", defaultSeverity: "REJECT" },
  { code: "SVC-002", category: "Service", internalDescription: "Service not mapped to any contracted tariff — manual review", providerDescription: "This service is not on your rate schedule; we are reviewing pricing.", memberDescription: "We are reviewing the price for this service.", contractRuleRefType: "Tariff", defaultSeverity: "PEND", remedy: "Map the service or add a tariff line.", overrideAllowed: true, allowedOverrideTypes: ["MAP_SERVICE_TO_TARIFF", "CREATE_TEMPORARY_RATE"], escalationRoute: "SERVICE_NOT_MAPPED" },
  { code: "SVC-003", category: "Service", internalDescription: "Unlisted service not payable under contract", providerDescription: "This service is not payable under your agreement (unlisted-service rule = reject).", memberDescription: "This service is not covered under the provider agreement.", defaultSeverity: "REJECT", overrideAllowed: true, allowedOverrideTypes: ["PAY_MISSING_RATE"] },
  // ── Pricing ──
  { code: "PRC-001", category: "Pricing", internalDescription: "Claimed amount exceeds contracted rate — short-paid to contract", providerDescription: "Billed above the contracted rate; paid to the contracted amount. The difference is not payable and may not be billed to the member.", memberDescription: "This service was paid at the agreed rate; you owe nothing further.", contractRuleRefType: "Tariff", defaultSeverity: "SHORTFALL", remedy: "Bill to the contracted rate.", overrideAllowed: true, allowedOverrideTypes: ["PAY_ABOVE_CONTRACT_RATE"] },
  { code: "PRC-002", category: "Pricing", internalDescription: "Contracted rate missing/unreadable — manual pricing required", providerDescription: "The contracted rate for this line is being confirmed.", memberDescription: "We are confirming the price for this service.", contractRuleRefType: "Tariff", defaultSeverity: "PEND", remedy: "Price the rate-missing line from the source document.", overrideAllowed: true, allowedOverrideTypes: ["PAY_MISSING_RATE"], escalationRoute: "RATE_MISSING" },
  { code: "PRC-003", category: "Pricing", internalDescription: "Rate expired with no successor — priced under unlisted rule", providerDescription: "The rate for this line had expired; priced under the unlisted-service rule.", memberDescription: "This service was priced under the standard rule.", defaultSeverity: "INFO" },
  { code: "PRC-004", category: "Pricing", internalDescription: "Multiple conflicting rates — manual resolution", providerDescription: "More than one rate matches this service; we are confirming the correct one.", memberDescription: "We are confirming the correct price for this service.", defaultSeverity: "PEND", escalationRoute: "RATE_AMBIGUITY" },
  { code: "PRC-005", category: "Pricing", internalDescription: "Package rate applies — itemised component not separately payable", providerDescription: "This component is included in the package rate and is not separately payable.", memberDescription: "This item is included in the treatment package.", contractRuleRefType: "Package", defaultSeverity: "INFO" },
  { code: "PRC-006", category: "Pricing", internalDescription: "Unit-of-measure mismatch between bill and contract", providerDescription: "The billed unit differs from the contracted unit for this service.", memberDescription: "We are confirming how this service is priced.", defaultSeverity: "PEND", escalationRoute: "RATE_AMBIGUITY" },
  { code: "PRC-007", category: "Pricing", internalDescription: "Currency mismatch", providerDescription: "The billed currency differs from the contract currency.", memberDescription: "We are confirming the currency for this claim.", defaultSeverity: "PEND", escalationRoute: "RATE_AMBIGUITY" },
  // ── Limits ──
  { code: "LIM-001", category: "Limits", internalDescription: "Quantity exceeds contract limit", providerDescription: "The billed quantity exceeds the contract limit; the excess is not payable.", memberDescription: "Part of this service exceeded the covered quantity.", contractRuleRefType: "Tariff", defaultSeverity: "SHORTFALL" },
  { code: "LIM-002", category: "Limits", internalDescription: "Frequency exceeds contract limit (per day/admission/year)", providerDescription: "The frequency of this service exceeds the contract limit.", memberDescription: "This service exceeded how often it is covered.", contractRuleRefType: "Tariff", defaultSeverity: "SHORTFALL" },
  { code: "LIM-003", category: "Limits", internalDescription: "Annual utilisation limit exhausted", providerDescription: "The annual utilisation limit for this benefit has been reached.", memberDescription: "The annual limit for this benefit has been reached.", defaultSeverity: "REJECT" },
  // ── Exclusion ──
  { code: "EXC-001", category: "Exclusion", internalDescription: "Service excluded by contract", providerDescription: "This service is excluded by your agreement.", memberDescription: "This service is not covered under the provider agreement.", contractRuleRefType: "ContractExclusion", defaultSeverity: "REJECT" },
  { code: "EXC-002", category: "Exclusion", internalDescription: "Diagnosis excluded / indication restriction not met", providerDescription: "The diagnosis/indication does not meet the coverage restriction for this service.", memberDescription: "This service was not covered for the recorded condition.", defaultSeverity: "REJECT", resubmissionAllowed: true },
  { code: "EXC-003", category: "Exclusion", internalDescription: "Excluded for this plan/member category/date range", providerDescription: "This service is excluded for this plan/member category.", memberDescription: "This service is not covered under your plan.", defaultSeverity: "REJECT" },
  { code: "EXC-004", category: "Exclusion", internalDescription: "Unauthorised referral / self-referral", providerDescription: "This service requires a referral; self-referrals are not covered.", memberDescription: "This service needed a referral to be covered.", defaultSeverity: "REJECT", resubmissionAllowed: true },
  // ── Pre-auth ──
  { code: "AUTH-001", category: "Pre-auth", internalDescription: "Pre-authorisation required but missing", providerDescription: "This service required pre-authorisation, which was not obtained.", memberDescription: "This service needed prior approval.", contractRuleRefType: "PreauthRule", defaultSeverity: "PEND", remedy: "Obtain pre-authorisation (retro where permitted).", overrideAllowed: true, allowedOverrideTypes: ["PAY_DESPITE_MISSING_PREAUTH"], escalationRoute: "MISSING_PREAUTH" },
  { code: "AUTH-002", category: "Pre-auth", internalDescription: "Pre-authorisation expired / not valid on service date", providerDescription: "The pre-authorisation was not valid on the service date.", memberDescription: "The prior approval had expired.", defaultSeverity: "PEND", escalationRoute: "MISSING_PREAUTH" },
  { code: "AUTH-003", category: "Pre-auth", internalDescription: "Approved amount exceeded", providerDescription: "The billed amount exceeds the approved amount; paid up to the approval.", memberDescription: "Part of this exceeded the approved amount.", defaultSeverity: "SHORTFALL" },
  { code: "AUTH-004", category: "Pre-auth", internalDescription: "Approval does not cover this service", providerDescription: "The pre-authorisation does not cover this service.", memberDescription: "The prior approval did not cover this service.", defaultSeverity: "PEND", escalationRoute: "MISSING_PREAUTH" },
  // ── Documents ──
  { code: "DOC-001", category: "Documents", internalDescription: "Mandatory document missing — rejected per contract", providerDescription: "A required document is missing; the claim cannot be paid as submitted.", memberDescription: "A required document was missing for this claim.", contractRuleRefType: "DocumentationRule", defaultSeverity: "REJECT", resubmissionAllowed: true },
  { code: "DOC-002", category: "Documents", internalDescription: "Documents missing — pended for provider", providerDescription: "Required documents are missing; please submit them to proceed.", memberDescription: "We are awaiting documents for this claim.", defaultSeverity: "PEND", resubmissionAllowed: true, escalationRoute: "MISSING_DOCS" },
  { code: "DOC-004", category: "Documents", internalDescription: "Invoice not system-generated (handwritten) — not acceptable", providerDescription: "Handwritten invoices are not accepted; submit a system-generated invoice.", memberDescription: "The provider invoice was not in an accepted format.", defaultSeverity: "REJECT", resubmissionAllowed: true },
  // ── Submission ──
  { code: "SUB-001", category: "Submission", internalDescription: "Claim submitted outside contractual window", providerDescription: "This claim was submitted outside the contractual submission window.", memberDescription: "This claim was submitted late by the provider.", defaultSeverity: "PEND", overrideAllowed: true, allowedOverrideTypes: ["PAY_DESPITE_LATE_SUBMISSION"], escalationRoute: "MISSING_DOCS" },
  // ── Duplicate ──
  { code: "DUP-001", category: "Duplicate", internalDescription: "Duplicate provider invoice", providerDescription: "This invoice appears to duplicate a previously submitted invoice.", memberDescription: "This claim appears to be a duplicate.", defaultSeverity: "REJECT" },
  { code: "DUP-002", category: "Duplicate", internalDescription: "Second claim for same admission episode", providerDescription: "Only one claim is payable per admission episode; this duplicates an existing episode claim.", memberDescription: "This claim duplicates an existing admission claim.", defaultSeverity: "PEND", escalationRoute: "FWA_SUSPECT" },
  // ── Manual ──
  { code: "MAN-001", category: "Manual", internalDescription: "Ambiguous contract rule — routed for contract clarification", providerDescription: "A contract term needs clarification before this line can be priced.", memberDescription: "We are reviewing the terms for this service.", defaultSeverity: "PEND", escalationRoute: "CONTRACT_AMENDMENT_REQUIRED" },
];

export class ReasonCodeService {
  /** Upsert the default catalog for a tenant (idempotent). */
  static async seedForTenant(tenantId: string) {
    for (const r of REASON_CODE_CATALOG) {
      await prisma.adjudicationReasonCode.upsert({
        where: { tenantId_code: { tenantId, code: r.code } },
        create: {
          tenantId,
          code: r.code,
          category: r.category,
          internalDescription: r.internalDescription,
          providerDescription: r.providerDescription,
          memberDescription: r.memberDescription,
          contractRuleRefType: r.contractRuleRefType,
          defaultSeverity: r.defaultSeverity,
          remedy: r.remedy,
          resubmissionAllowed: r.resubmissionAllowed ?? false,
          overrideAllowed: r.overrideAllowed ?? false,
          allowedOverrideTypes: r.allowedOverrideTypes ?? [],
          escalationRoute: r.escalationRoute,
        },
        update: {
          category: r.category,
          internalDescription: r.internalDescription,
          providerDescription: r.providerDescription,
          memberDescription: r.memberDescription,
          contractRuleRefType: r.contractRuleRefType,
          defaultSeverity: r.defaultSeverity,
          remedy: r.remedy,
          resubmissionAllowed: r.resubmissionAllowed ?? false,
          overrideAllowed: r.overrideAllowed ?? false,
          allowedOverrideTypes: r.allowedOverrideTypes ?? [],
          escalationRoute: r.escalationRoute,
        },
      });
    }
    return REASON_CODE_CATALOG.length;
  }

  /** Resolve a reason-code row by code for a tenant. */
  static async resolve(tenantId: string, code: string) {
    return prisma.adjudicationReasonCode.findUnique({ where: { tenantId_code: { tenantId, code } } });
  }
}
