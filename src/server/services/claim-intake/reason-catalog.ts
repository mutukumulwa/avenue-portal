/**
 * Claims Autopilot — route-code reason catalog (F3.2, §10.3/§10.4).
 *
 * D6: once a submission is authenticated and structurally valid, a business-rule
 * failure (coverage, benefit, PA, documents, pricing, fraud, ceiling, FX, …) is
 * NOT a thrown error — it is an ACCEPTED claim that ROUTES with a stable reason
 * code. Structural/security failures (unauthenticated, out-of-scope, malformed,
 * oversized, idempotency conflict) remain pre-claim rejections modelled by
 * `IntakeError` (F1.4). This catalog is the single registry mapping each route
 * code to its owning queue and audience-safe wording.
 *
 * PRIVACY: provider- and member-facing text must never reveal internal fraud
 * signals or another party's data (§11.5). Fraud routes to review with a generic
 * external message; only `internal` names the reason.
 */

/** Named operator queues (§10.4). `MANUAL_ADJUDICATION` = clean claim a human
 * adjudicates normally (e.g. above the auto-ceiling); `AUTOPILOT_FAILURE` =
 * exhausted technical failure. */
export const QUEUES = {
  ELIGIBILITY_REVIEW: "ELIGIBILITY_REVIEW",
  PROVIDER_NETWORK_REVIEW: "PROVIDER_NETWORK_REVIEW",
  CLINICAL_AUTH_REVIEW: "CLINICAL_AUTH_REVIEW",
  PROVIDER_QUERY: "PROVIDER_QUERY",
  PRICING_REVIEW: "PRICING_REVIEW",
  DUPLICATE_REVIEW: "DUPLICATE_REVIEW",
  FRAUD_REVIEW: "FRAUD_REVIEW",
  BENEFIT_REVIEW: "BENEFIT_REVIEW",
  CONFIGURATION_REVIEW: "CONFIGURATION_REVIEW",
  REIMBURSEMENT_REVIEW: "REIMBURSEMENT_REVIEW",
  MANUAL_ADJUDICATION: "MANUAL_ADJUDICATION",
  AUTOPILOT_FAILURE: "AUTOPILOT_FAILURE",
} as const;
export type Queue = (typeof QUEUES)[keyof typeof QUEUES];

/** Stable route codes (§10.3). */
export const ROUTE_CODES = {
  AUTO_POLICY_NOT_LIVE: "AUTO_POLICY_NOT_LIVE",
  AUTO_POLICY_OFF: "AUTO_POLICY_OFF",
  AUTO_POLICY_SCOPE_MISMATCH: "AUTO_POLICY_SCOPE_MISMATCH",
  ABOVE_AUTO_CEILING: "ABOVE_AUTO_CEILING",
  ELIGIBILITY_REVIEW: "ELIGIBILITY_REVIEW",
  PROVIDER_ENTITLEMENT_REVIEW: "PROVIDER_ENTITLEMENT_REVIEW",
  BENEFIT_NOT_CONFIGURED: "BENEFIT_NOT_CONFIGURED",
  PREAUTH_REQUIRED: "PREAUTH_REQUIRED",
  PREAUTH_COVER_INSUFFICIENT: "PREAUTH_COVER_INSUFFICIENT",
  DOCUMENTS_INCOMPLETE: "DOCUMENTS_INCOMPLETE",
  DUPLICATE_REVIEW: "DUPLICATE_REVIEW",
  FRAUD_REVIEW: "FRAUD_REVIEW",
  NO_CONTRACT: "NO_CONTRACT",
  SERVICE_NOT_MAPPED: "SERVICE_NOT_MAPPED",
  RATE_MISSING: "RATE_MISSING",
  PRICING_INCOMPLETE: "PRICING_INCOMPLETE",
  EXCLUSION_CONFIRMATION: "EXCLUSION_CONFIRMATION",
  BENEFIT_LIMIT_REVIEW: "BENEFIT_LIMIT_REVIEW",
  FX_RATE_MISSING: "FX_RATE_MISSING",
  REIMBURSEMENT_PROOF_REVIEW: "REIMBURSEMENT_PROOF_REVIEW",
  INPATIENT_SHADOW_ONLY: "INPATIENT_SHADOW_ONLY",
  PIPELINE_RETRY: "PIPELINE_RETRY",
  PIPELINE_FAILED: "PIPELINE_FAILED",
} as const;
export type RouteCode = (typeof ROUTE_CODES)[keyof typeof ROUTE_CODES];

export type OverrideType =
  | "NONE"
  | "MANUAL_APPROVAL"
  | "PRICING_OVERRIDE"
  | "PA_OVERRIDE"
  | "DUPLICATE_CLEAR"
  | "DOCUMENT_WAIVER"
  | "EXCLUSION_CONFIRM";

export interface ReasonEntry {
  /** Owning queue, or null when there is no human queue (shadow-only / transient). */
  queue: Queue | null;
  internal: string;
  provider: string;
  /** Member-safe text, or null when nothing should be surfaced to the member. */
  member: string | null;
  remedy: string;
  resubmissionAllowed: boolean;
  overrideAllowed: boolean;
  overrideType: OverrideType;
  /** true for a transient (retryable) technical state — not a human route. */
  transient?: boolean;
}

const GENERIC_MEMBER_REVIEW = "Your claim was received and is being reviewed. We'll update you once it's assessed.";

export const REASON_CATALOG: Record<RouteCode, ReasonEntry> = {
  AUTO_POLICY_NOT_LIVE: { queue: QUEUES.MANUAL_ADJUDICATION, internal: "No approved LIVE automation policy resolves for this client — claim routes to a human.", provider: "This claim was received and will be assessed by our team.", member: GENERIC_MEMBER_REVIEW, remedy: "A claims officer will adjudicate this claim.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  AUTO_POLICY_OFF: { queue: QUEUES.MANUAL_ADJUDICATION, internal: "Automation is OFF for this client — claim routes to a human.", provider: "This claim was received and will be assessed by our team.", member: GENERIC_MEMBER_REVIEW, remedy: "A claims officer will adjudicate this claim.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  AUTO_POLICY_SCOPE_MISMATCH: { queue: QUEUES.MANUAL_ADJUDICATION, internal: "Claim source/service/benefit/provider/currency/age is outside the live policy scope.", provider: "This claim was received and will be assessed by our team.", member: GENERIC_MEMBER_REVIEW, remedy: "A claims officer will adjudicate this claim.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  ABOVE_AUTO_CEILING: { queue: QUEUES.MANUAL_ADJUDICATION, internal: "Payable exceeds the approved policy per-claim ceiling — no auto split/approval.", provider: "This claim was received and will be assessed by our team.", member: GENERIC_MEMBER_REVIEW, remedy: "A claims officer will review and decide this claim.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  ELIGIBILITY_REVIEW: { queue: QUEUES.ELIGIBILITY_REVIEW, internal: "Member/group coverage could not be confirmed for the service date.", provider: "Member eligibility for the service date needs confirmation.", member: "We're confirming your cover for this service date.", remedy: "Confirm the member's coverage window / status for the service date.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  PROVIDER_ENTITLEMENT_REVIEW: { queue: QUEUES.PROVIDER_NETWORK_REVIEW, internal: "Provider/branch is not entitled to serve this member's package.", provider: "This facility may not be in-network for this member's plan.", member: "We're confirming this facility for your plan.", remedy: "Confirm provider/branch network entitlement for the package.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  BENEFIT_NOT_CONFIGURED: { queue: QUEUES.BENEFIT_REVIEW, internal: "The claimed benefit category is not configured in the member's package.", provider: "The billed benefit is not part of this member's plan.", member: "The service billed is not part of your plan.", remedy: "Bill against a benefit in the member's package, or configure the benefit.", resubmissionAllowed: true, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  PREAUTH_REQUIRED: { queue: QUEUES.CLINICAL_AUTH_REVIEW, internal: "Service requires a valid pre-authorization; none is present or it is expired.", provider: "A valid pre-authorization is required for this service.", member: "This service needs prior approval before we can settle it.", remedy: "Obtain an approved pre-authorization for this facility, then resubmit.", resubmissionAllowed: true, overrideAllowed: true, overrideType: "PA_OVERRIDE" },
  PREAUTH_COVER_INSUFFICIENT: { queue: QUEUES.CLINICAL_AUTH_REVIEW, internal: "Pre-authorization remaining cover is below the eligible amount.", provider: "The pre-authorization does not fully cover this claim.", member: "Your prior approval doesn't fully cover this service.", remedy: "Extend the pre-authorization cover, then resubmit.", resubmissionAllowed: true, overrideAllowed: true, overrideType: "PA_OVERRIDE" },
  DOCUMENTS_INCOMPLETE: { queue: QUEUES.PROVIDER_QUERY, internal: "Contract/policy-required documentation is missing or of the wrong category.", provider: "Required supporting documents are missing or incorrect.", member: GENERIC_MEMBER_REVIEW, remedy: "Attach the required documents and resubmit.", resubmissionAllowed: true, overrideAllowed: true, overrideType: "DOCUMENT_WAIVER" },
  DUPLICATE_REVIEW: { queue: QUEUES.DUPLICATE_REVIEW, internal: "A content-similar claim exists without an authoritative shared identity.", provider: "A similar claim was found and needs review before processing.", member: GENERIC_MEMBER_REVIEW, remedy: "Confirm this is a distinct service or reference the original claim.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "DUPLICATE_CLEAR" },
  FRAUD_REVIEW: { queue: QUEUES.FRAUD_REVIEW, internal: "Open fraud alert — blocked from auto-approval pending investigation.", provider: "This claim requires additional manual review before a decision.", member: GENERIC_MEMBER_REVIEW, remedy: "Investigate and clear the alert, then reprocess.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  NO_CONTRACT: { queue: QUEUES.PRICING_REVIEW, internal: "No governing provider contract prices this claim.", provider: "No active contract prices this service — pending pricing review.", member: GENERIC_MEMBER_REVIEW, remedy: "Attach/activate a governing contract, then reprocess.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "PRICING_OVERRIDE" },
  SERVICE_NOT_MAPPED: { queue: QUEUES.PRICING_REVIEW, internal: "A line's service category could not be deterministically mapped.", provider: "A billed line could not be matched to a priced service.", member: GENERIC_MEMBER_REVIEW, remedy: "Provide a valid service/CPT/drug code and resubmit.", resubmissionAllowed: true, overrideAllowed: true, overrideType: "PRICING_OVERRIDE" },
  RATE_MISSING: { queue: QUEUES.PRICING_REVIEW, internal: "A mapped service has no enforceable contract/tariff rate.", provider: "A billed line has no agreed rate on file.", member: GENERIC_MEMBER_REVIEW, remedy: "Add the missing tariff/contract rate, then reprocess.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "PRICING_OVERRIDE" },
  PRICING_INCOMPLETE: { queue: QUEUES.PRICING_REVIEW, internal: "At least one line could not be deterministically priced (e.g. uncoded).", provider: "One or more lines could not be priced automatically.", member: GENERIC_MEMBER_REVIEW, remedy: "Code/price the outstanding line(s), then reprocess.", resubmissionAllowed: true, overrideAllowed: true, overrideType: "PRICING_OVERRIDE" },
  EXCLUSION_CONFIRMATION: { queue: QUEUES.BENEFIT_REVIEW, internal: "A line matches an exclusion rule needing human confirmation.", provider: "A billed item may be excluded and needs review.", member: GENERIC_MEMBER_REVIEW, remedy: "Confirm or overturn the exclusion.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "EXCLUSION_CONFIRM" },
  BENEFIT_LIMIT_REVIEW: { queue: QUEUES.BENEFIT_REVIEW, internal: "Benefit configured but remaining availability is insufficient.", provider: "The member's benefit limit may be insufficient for this claim.", member: "This may exceed your remaining benefit limit.", remedy: "Review remaining benefit and decide the payable amount.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
  FX_RATE_MISSING: { queue: QUEUES.CONFIGURATION_REVIEW, internal: "Non-base currency claim has no effective FX rate to normalise.", provider: "No exchange rate is on file for this claim's currency.", member: GENERIC_MEMBER_REVIEW, remedy: "Add an effective FX rate for the currency/date, then reprocess.", resubmissionAllowed: false, overrideAllowed: false, overrideType: "NONE" },
  REIMBURSEMENT_PROOF_REVIEW: { queue: QUEUES.REIMBURSEMENT_REVIEW, internal: "Reimbursement — always manual proof-of-payment verification (D13).", provider: "Member reimbursements are verified manually.", member: "We're verifying your payment proof for this reimbursement.", remedy: "Verify proof, payment destination and window, then decide.", resubmissionAllowed: false, overrideAllowed: false, overrideType: "NONE" },
  INPATIENT_SHADOW_ONLY: { queue: null, internal: "Inpatient case claim — evaluated in shadow only until the inpatient release gate (D14).", provider: "This inpatient claim is being processed through the case workflow.", member: GENERIC_MEMBER_REVIEW, remedy: "Handle via the case workflow; live automation is not enabled for inpatient in v1.", resubmissionAllowed: false, overrideAllowed: false, overrideType: "NONE" },
  PIPELINE_RETRY: { queue: null, internal: "A dependency failed transiently; the run is retryable.", provider: "This claim was received and is still being processed.", member: GENERIC_MEMBER_REVIEW, remedy: "Automatic retry in progress; no action needed.", resubmissionAllowed: false, overrideAllowed: false, overrideType: "NONE", transient: true },
  PIPELINE_FAILED: { queue: QUEUES.AUTOPILOT_FAILURE, internal: "Processing exhausted its retries — unrecoverable technical failure.", provider: "This claim was received; our team is completing processing.", member: GENERIC_MEMBER_REVIEW, remedy: "Investigate the failure and reprocess or adjudicate manually.", resubmissionAllowed: false, overrideAllowed: true, overrideType: "MANUAL_APPROVAL" },
};

/** Type guard: is this string a catalogued route code? (F6.1) */
export function isRouteCode(code: string): code is RouteCode {
  return code in REASON_CATALOG;
}

export function getReason(code: RouteCode): ReasonEntry {
  return REASON_CATALOG[code];
}

export function queueFor(code: RouteCode): Queue | null {
  return REASON_CATALOG[code].queue;
}

export function reasonForAudience(code: RouteCode, audience: "internal" | "provider" | "member"): string | null {
  const e = REASON_CATALOG[code];
  return audience === "internal" ? e.internal : audience === "provider" ? e.provider : e.member;
}

// ── Stage-ready domain finding (§F3.2 step 2; consumed by F4.2 stages) ────────
// A deterministic gate returns PASS or ROUTE(code) rather than throwing — this
// is how a business-rule failure becomes an accepted+routed claim (D6). Kept
// here as the shared vocabulary; wired into the processing runner in F4.2.
export type StageDisposition =
  | { kind: "PASS" }
  | { kind: "ROUTE"; code: RouteCode; detail?: string };

export const PASS: StageDisposition = { kind: "PASS" };
export function route(code: RouteCode, detail?: string): StageDisposition {
  return { kind: "ROUTE", code, detail };
}
