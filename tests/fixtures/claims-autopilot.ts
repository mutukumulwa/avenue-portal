/**
 * Claims Autopilot F0.3 — golden claim scenarios (shared fixture/oracle set).
 *
 * These fixtures are the SINGLE SOURCE OF TRUTH for what a canonical submission
 * looks like and how it must be dispositioned. Every later layer references a
 * named scenario instead of re-inventing inputs:
 *   - F1.1 schema "Done when: the same schema accepts inputs representing every
 *     golden scenario."
 *   - F1.2/F1.3 normalization + fingerprints assert equal canonical output.
 *   - F4.4 AutoDecisionPlan asserts the oracle disposition/route/queue.
 *   - F5.x cross-rail equivalence (CA-070..079) feeds the SAME payload through
 *     each rail and asserts the SAME oracle.
 *
 * Rules honoured here:
 *   - Neutral synthetic IDs only; NO real patient data (F0.3 step 3).
 *   - Money is decimal STRINGS, never floats (hard prohibition). billedAmount
 *     equals quantity × unitCost exactly; totalBilled equals the line sum.
 *   - Oracles encode the TARGET behavior (D6): a business-rule failure is
 *     ACCEPT + ROUTE with a reason, not a thrown error. Where today's rails
 *     still throw (e.g. benefit-not-in-package in runClaimIntake), the divergence
 *     is intentional and closed in F3.2/F5.x.
 *
 * The `GoldenSubmission` shape mirrors CLAIMS_AUTOPILOT_EXECUTION_PLAN.md §7.1
 * `ClaimSubmissionV1`. When F1.1 lands the Zod schema, its inferred type should
 * be structurally compatible with `GoldenSubmission`; re-point this type at the
 * schema's inferred type at that point.
 */
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

// ── Neutral identifiers (no PHI) ──────────────────────────────────────────────
export const GOLDEN_IDS = {
  tenantId: "tnt_golden_0001",
  memberId: "mbr_golden_0001",
  memberNumber: "MBR-GOLD-0001",
  providerId: "prv_golden_0001",
  branchId: "brn_golden_0001",
  practitionerRef: "DOC-GOLD-01",
  baseCurrency: "UGX",
  foreignCurrency: "USD",
} as const;

// ── Route codes (§10.3) and queues (§10.4) — oracle-authoritative strings. ────
// F1.4/F4 reason catalogue MUST reproduce these exact codes. Kept here so the
// oracle is the source of truth rather than a downstream copy.
export const ROUTE = {
  AUTO_POLICY_NOT_LIVE: "AUTO_POLICY_NOT_LIVE",
  PREAUTH_REQUIRED: "PREAUTH_REQUIRED",
  PREAUTH_COVER_INSUFFICIENT: "PREAUTH_COVER_INSUFFICIENT",
  DOCUMENTS_INCOMPLETE: "DOCUMENTS_INCOMPLETE",
  DUPLICATE_REVIEW: "DUPLICATE_REVIEW",
  FRAUD_REVIEW: "FRAUD_REVIEW",
  SERVICE_NOT_MAPPED: "SERVICE_NOT_MAPPED",
  PRICING_INCOMPLETE: "PRICING_INCOMPLETE",
  BENEFIT_NOT_CONFIGURED: "BENEFIT_NOT_CONFIGURED",
  BENEFIT_LIMIT_REVIEW: "BENEFIT_LIMIT_REVIEW",
  FX_RATE_MISSING: "FX_RATE_MISSING",
  REIMBURSEMENT_PROOF_REVIEW: "REIMBURSEMENT_PROOF_REVIEW",
  INPATIENT_SHADOW_ONLY: "INPATIENT_SHADOW_ONLY",
} as const;

export const QUEUE = {
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
  AUTOPILOT_FAILURE: "AUTOPILOT_FAILURE",
} as const;

// ── Submission shape (mirrors §7.1) ───────────────────────────────────────────
export interface GoldenLine {
  sourceLineRef?: string;
  serviceCategory: ClaimLineCategory;
  cptCode?: string;
  drugCode?: string;
  icdCode?: string;
  description: string;
  quantity: number;
  unitCost: string; // decimal string
  billedAmount: string; // decimal string = quantity × unitCost
}

export interface GoldenSubmission {
  schemaVersion: "1";
  idempotencyKey: string;
  externalClaimRef?: string;
  externalEncounterRef?: string;
  invoiceNumber?: string;
  submittedAt?: string;
  sourceUpdatedAt?: string;
  member: { memberId?: string; memberNumber?: string };
  provider: { providerId?: string; branchId?: string; practitionerRef?: string };
  encounter: {
    serviceType: ServiceType;
    benefitCategory: BenefitCategory;
    serviceFrom: string;
    serviceTo?: string;
    admissionDate?: string;
    dischargeDate?: string;
    attendingDoctor?: string;
  };
  diagnoses: Array<{ code: string; description?: string; isPrimary: boolean }>;
  lines: GoldenLine[];
  currency?: string;
  preauthRefs?: string[];
  attachmentRefs?: Array<{ documentId?: string; externalRef?: string; category: string; sha256?: string }>;
  origin?: {
    batchId?: string;
    rowNumber?: number;
    deviceId?: string;
    caseId?: string;
    caseSliceSeq?: number;
    reimbursementRequestId?: string;
  };
  replacementOfClaimRef?: string;
  correctionReason?: string;
}

export type PolicyModeOutcome =
  | "AUTO_APPROVE"
  | "AUTO_PARTIAL"
  | "WOULD_APPROVE"
  | "WOULD_PARTIAL"
  | "ROUTE"
  | "REPLAY"
  | "CONFLICT"
  | "STRONG_LINK";

export interface GoldenOracle {
  /** Structural acceptance vs pre-claim rejection (D6, §7.3). */
  structural: "ACCEPT" | "REJECT";
  /** For structural REJECT: a stable hint at the failing path (not raw Zod). */
  structuralIssueHint?: string;
  /** Route code when the accepted claim cannot auto-decide (§10.3); null if auto-approvable. */
  routeCode: string | null;
  /** Owning queue (§10.4); null if auto-approvable. */
  assignedQueue: string | null;
  /** OFF always routes to the normal queue and skips automation (D2). */
  underOff: "ROUTE";
  /** SHADOW records a proposal and moves no money (D2). */
  underShadow: PolicyModeOutcome;
  /** LIVE may execute money through ClaimDecisionService when eligible (D2). */
  underLive: PolicyModeOutcome;
  /** True only for a clean, fully-priced, LIVE-eligible claim. */
  moneyMayMoveUnderLive: boolean;
  /** Decimal string; equals the sum of line billedAmounts. */
  totalBilled: string;
  /** Deterministic payable when known without a DB; else null (asserted in DB builders). */
  expectedTotalPayable: string | null;
  duplicateKind?: "EXACT_REPLAY" | "KEY_CONFLICT" | "STRONG_EVENT" | "FUZZY_SUSPECT";
  /** Acceptance-scenario IDs from §17 that this fixture backs. */
  acceptanceScenarioIds: string[];
  notes?: string;
}

export interface GoldenScenario {
  name: string;
  title: string;
  submission: GoldenSubmission;
  /** For duplicate/replay/conflict scenarios: the follow-up submission. */
  secondSubmission?: GoldenSubmission;
  oracle: GoldenOracle;
}

// ── Builders ──────────────────────────────────────────────────────────────────
let keySeq = 0;
function neutralKey(tag: string): string {
  keySeq += 1;
  return `golden-${tag}-${String(keySeq).padStart(4, "0")}`;
}

function line(over: Partial<GoldenLine> & Pick<GoldenLine, "description" | "quantity" | "unitCost">): GoldenLine {
  const qty = over.quantity;
  const unit = over.unitCost;
  const billed = over.billedAmount ?? (qty * Number(unit)).toFixed(2);
  return {
    serviceCategory: over.serviceCategory ?? ("CONSULTATION" as ClaimLineCategory),
    cptCode: over.cptCode,
    drugCode: over.drugCode,
    icdCode: over.icdCode,
    sourceLineRef: over.sourceLineRef,
    description: over.description,
    quantity: qty,
    unitCost: unit,
    billedAmount: billed,
  };
}

function sumBilled(lines: GoldenLine[]): string {
  return lines.reduce((s, l) => s + Number(l.billedAmount), 0).toFixed(2);
}

interface BuildOpts {
  keyTag: string;
  serviceType?: ServiceType;
  benefitCategory?: BenefitCategory;
  serviceFrom?: string;
  lines: GoldenLine[];
  diagnoses?: GoldenSubmission["diagnoses"];
  currency?: string;
  overrides?: Partial<GoldenSubmission>;
}

/** A structurally valid base submission with neutral IDs. */
function build(opts: BuildOpts): GoldenSubmission {
  const base: GoldenSubmission = {
    schemaVersion: "1",
    idempotencyKey: neutralKey(opts.keyTag),
    member: { memberId: GOLDEN_IDS.memberId, memberNumber: GOLDEN_IDS.memberNumber },
    provider: {
      providerId: GOLDEN_IDS.providerId,
      branchId: GOLDEN_IDS.branchId,
      practitionerRef: GOLDEN_IDS.practitionerRef,
    },
    encounter: {
      serviceType: opts.serviceType ?? ("OUTPATIENT" as ServiceType),
      benefitCategory: opts.benefitCategory ?? ("OUTPATIENT" as BenefitCategory),
      serviceFrom: opts.serviceFrom ?? "2026-06-01",
      attendingDoctor: "Attending Clinician",
    },
    diagnoses: opts.diagnoses ?? [{ code: "J06.9", description: "Acute URTI", isPrimary: true }],
    lines: opts.lines,
    currency: opts.currency ?? GOLDEN_IDS.baseCurrency,
  };
  return { ...base, ...opts.overrides };
}

// ── The 18 golden scenarios (currency split into with/without FX ⇒ 19 fixtures) ─

/** 1. Clean contracted outpatient claim with two coded lines. */
const cleanLines = [
  line({ serviceCategory: "CONSULTATION" as ClaimLineCategory, cptCode: "99213", icdCode: "J06.9", description: "GP consultation", quantity: 1, unitCost: "1500.00", sourceLineRef: "L1" }),
  line({ serviceCategory: "LABORATORY" as ClaimLineCategory, cptCode: "85025", icdCode: "J06.9", description: "Full blood count", quantity: 1, unitCost: "2000.00", sourceLineRef: "L2" }),
];
export const cleanOutpatientTwoLines: GoldenScenario = {
  name: "cleanOutpatientTwoLines",
  title: "Clean contracted outpatient, two coded lines — auto-approvable",
  submission: build({ keyTag: "clean", lines: cleanLines }),
  oracle: {
    structural: "ACCEPT",
    routeCode: null,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "WOULD_APPROVE",
    underLive: "AUTO_APPROVE",
    moneyMayMoveUnderLive: true,
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null, // depends on seeded contract; asserted in DB builder
    acceptanceScenarioIds: ["CA-001", "CA-030", "CA-031", "CA-070", "CA-071", "CA-072"],
    notes: "The canonical clean claim reused across every cross-rail equivalence test.",
  },
};

/** 2. Contracted claim with a deterministic adjustment/shortfall. */
const shortfallLines = [
  // Billed above the (seeded) contract rate → payable = contracted, shortfall to writeoff/member.
  line({ serviceCategory: "CONSULTATION" as ClaimLineCategory, cptCode: "99214", icdCode: "I10", description: "Specialist consult (billed above tariff)", quantity: 1, unitCost: "8000.00", sourceLineRef: "L1" }),
];
export const contractedAdjustmentShortfall: GoldenScenario = {
  name: "contractedAdjustmentShortfall",
  title: "Contracted claim priced below billed — approved WITH line adjustment",
  submission: build({ keyTag: "shortfall", lines: shortfallLines, diagnoses: [{ code: "I10", description: "Essential hypertension", isPrimary: true }] }),
  oracle: {
    structural: "ACCEPT",
    routeCode: null,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "WOULD_APPROVE",
    underLive: "AUTO_APPROVE", // full claim approval; per-line APPROVED_WITH_ADJUSTMENT (not a partial decline)
    moneyMayMoveUnderLive: true,
    totalBilled: sumBilled(shortfallLines),
    expectedTotalPayable: null, // contract-determined; DB builder asserts contracted < billed with shortfall
    acceptanceScenarioIds: ["CA-037"],
    notes: "Distinguishes contract adjustment (approve at tariff, stamp shortfall) from partial decline.",
  },
};

/** 3. One coded + one uncoded line — uncoded line cannot be priced. */
const mixedLines = [
  line({ serviceCategory: "CONSULTATION" as ClaimLineCategory, cptCode: "99213", icdCode: "J06.9", description: "GP consultation", quantity: 1, unitCost: "1500.00", sourceLineRef: "L1" }),
  line({ serviceCategory: "OTHER" as ClaimLineCategory, description: "Unspecified sundry (no code)", quantity: 1, unitCost: "1200.00", sourceLineRef: "L2" }),
];
export const oneCodedOneUncoded: GoldenScenario = {
  name: "oneCodedOneUncoded",
  title: "Mixed coded + uncoded line — routes (uncoded cannot live-auto-approve)",
  submission: build({ keyTag: "mixed", lines: mixedLines }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.PRICING_INCOMPLETE,
    assignedQueue: QUEUE.PRICING_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(mixedLines),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-036", "CA-038"],
    notes: "D5: every line must be deterministically resolved; an uncoded line routes the WHOLE claim in v1.",
  },
};

/** 4. PA-required service with no PA present. */
const surgicalLine = [line({ serviceCategory: "PROCEDURE" as ClaimLineCategory, cptCode: "47562", icdCode: "K80.2", description: "Laparoscopic cholecystectomy", quantity: 1, unitCost: "450000.00", sourceLineRef: "L1" })];
export const missingPaRequiredService: GoldenScenario = {
  name: "missingPaRequiredService",
  title: "PA-required surgical service with no pre-auth — routes PREAUTH_REQUIRED",
  submission: build({ keyTag: "no-pa", serviceType: "INPATIENT" as ServiceType, benefitCategory: "SURGICAL" as BenefitCategory, lines: surgicalLine, diagnoses: [{ code: "K80.2", description: "Calculus of gallbladder", isPrimary: true }] }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.PREAUTH_REQUIRED,
    assignedQueue: QUEUE.CLINICAL_AUTH_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(surgicalLine),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-040"],
    notes: "D6: NOT a structural reject — the claim persists and routes so the provider gets a next action.",
  },
};

/** 5. Expired PA. */
export const expiredPa: GoldenScenario = {
  name: "expiredPa",
  title: "PA present but expired — routes PREAUTH_REQUIRED",
  submission: build({ keyTag: "pa-expired", serviceType: "INPATIENT" as ServiceType, benefitCategory: "SURGICAL" as BenefitCategory, lines: surgicalLine, diagnoses: [{ code: "K80.2", description: "Calculus of gallbladder", isPrimary: true }], overrides: { preauthRefs: ["PA-EXPIRED-0001"] } }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.PREAUTH_REQUIRED,
    assignedQueue: QUEUE.CLINICAL_AUTH_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(surgicalLine),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-040"],
    notes: "An expired PA is no valid PA; no hold is consumed.",
  },
};

/** 6. PA present but insufficient cover for the eligible amount. */
export const insufficientPaCover: GoldenScenario = {
  name: "insufficientPaCover",
  title: "PA cover below eligible amount — routes PREAUTH_COVER_INSUFFICIENT",
  submission: build({ keyTag: "pa-short", serviceType: "INPATIENT" as ServiceType, benefitCategory: "SURGICAL" as BenefitCategory, lines: surgicalLine, diagnoses: [{ code: "K80.2", description: "Calculus of gallbladder", isPrimary: true }], overrides: { preauthRefs: ["PA-PARTIAL-0001"] } }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.PREAUTH_COVER_INSUFFICIENT,
    assignedQueue: QUEUE.CLINICAL_AUTH_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(surgicalLine),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-040"],
  },
};

/** 7. Missing required document. */
export const missingRequiredDocument: GoldenScenario = {
  name: "missingRequiredDocument",
  title: "Contract-required document absent — routes DOCUMENTS_INCOMPLETE",
  submission: build({ keyTag: "no-doc", lines: cleanLines, overrides: { attachmentRefs: [] } }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.DOCUMENTS_INCOMPLETE,
    assignedQueue: QUEUE.PROVIDER_QUERY,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-039"],
    notes: "Document requirement is contract/service-date effective; no arbitrary URL is fetched.",
  },
};

/** 8. Benefit not configured on the member's package. */
export const benefitNotConfigured: GoldenScenario = {
  name: "benefitNotConfigured",
  title: "Benefit category not in package — routes BENEFIT_NOT_CONFIGURED",
  submission: build({ keyTag: "benefit-missing", benefitCategory: "DENTAL" as BenefitCategory, lines: [line({ serviceCategory: "PROCEDURE" as ClaimLineCategory, cptCode: "D2140", description: "Amalgam filling", quantity: 1, unitCost: "3000.00", sourceLineRef: "L1" })] }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.BENEFIT_NOT_CONFIGURED,
    assignedQueue: QUEUE.BENEFIT_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: "3000.00",
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-042", "CA-012"],
    notes: "TARGET behavior: today runClaimIntake THROWS here; F3.2 converts it to accept+route.",
  },
};

/** 9. Benefit configured but insufficient remaining limit. */
export const benefitInsufficient: GoldenScenario = {
  name: "benefitInsufficient",
  title: "Benefit limit exhausted — routes BENEFIT_LIMIT_REVIEW",
  submission: build({ keyTag: "benefit-short", lines: [line({ serviceCategory: "LABORATORY" as ClaimLineCategory, cptCode: "80053", icdCode: "J06.9", description: "Comprehensive metabolic panel", quantity: 1, unitCost: "50000.00", sourceLineRef: "L1" })] }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.BENEFIT_LIMIT_REVIEW,
    assignedQueue: QUEUE.BENEFIT_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: "50000.00",
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-042"],
  },
};

/** 10. Open fraud alert on the claim. */
export const openFraudAlert: GoldenScenario = {
  name: "openFraudAlert",
  title: "Open fraud alert — routes FRAUD_REVIEW even if financial checks pass",
  submission: build({ keyTag: "fraud", lines: cleanLines }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.FRAUD_REVIEW,
    assignedQueue: QUEUE.FRAUD_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-043", "CA-044"],
    notes: "Commit-time fraud gate also re-checks (CA-044): a signal appearing before commit reroutes.",
  },
};

/** 11. Exact replay — same key + same normalized payload. */
const replayBase = build({ keyTag: "replay", lines: cleanLines });
export const exactReplay: GoldenScenario = {
  name: "exactReplay",
  title: "Same key + same payload — replay returns original receipt, no 2nd claim",
  submission: replayBase,
  secondSubmission: { ...replayBase }, // identical, same idempotencyKey
  oracle: {
    structural: "ACCEPT",
    routeCode: null,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "REPLAY",
    underLive: "REPLAY",
    moneyMayMoveUnderLive: false, // the REPLAY creates nothing new
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    duplicateKind: "EXACT_REPLAY",
    acceptanceScenarioIds: ["CA-020", "CA-021", "CA-024"],
    notes: "Both responses reference the same receipt/claim; exactly one financial effect.",
  },
};

/** 12. Same key, different payload — idempotency conflict. */
const conflictFirst = build({ keyTag: "conflict", lines: cleanLines });
const conflictSecond: GoldenSubmission = {
  ...conflictFirst,
  idempotencyKey: conflictFirst.idempotencyKey, // SAME key
  lines: [
    line({ serviceCategory: "CONSULTATION" as ClaimLineCategory, cptCode: "99213", icdCode: "J06.9", description: "GP consultation", quantity: 1, unitCost: "1500.00", sourceLineRef: "L1" }),
    line({ serviceCategory: "LABORATORY" as ClaimLineCategory, cptCode: "85025", icdCode: "J06.9", description: "Full blood count", quantity: 1, unitCost: "9999.00", sourceLineRef: "L2" }), // CHANGED amount
  ],
};
export const sameKeyDifferentPayload: GoldenScenario = {
  name: "sameKeyDifferentPayload",
  title: "Same key + different payload — 409 conflict, original unchanged",
  submission: conflictFirst,
  secondSubmission: conflictSecond,
  oracle: {
    structural: "ACCEPT",
    routeCode: null,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "CONFLICT",
    underLive: "CONFLICT",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    duplicateKind: "KEY_CONFLICT",
    acceptanceScenarioIds: ["CA-022"],
    notes: "IDEMPOTENCY_KEY_REUSED; the original receipt/claim is never mutated.",
  },
};

/** 13. Strong cross-rail duplicate — same authoritative invoice across channels. */
const strongInvoice = "INV-GOLD-STRONG-0001";
const strongFirst = build({ keyTag: "strong-a", lines: cleanLines, overrides: { invoiceNumber: strongInvoice, externalClaimRef: strongInvoice } });
const strongSecond = build({ keyTag: "strong-b", lines: cleanLines, overrides: { invoiceNumber: strongInvoice, externalClaimRef: strongInvoice } }); // different key/channel, same invoice
export const strongCrossRailDuplicate: GoldenScenario = {
  name: "strongCrossRailDuplicate",
  title: "Same authoritative invoice across rails — 2nd receipt links to 1st claim",
  submission: strongFirst,
  secondSubmission: strongSecond,
  oracle: {
    structural: "ACCEPT",
    routeCode: null,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "STRONG_LINK",
    underLive: "STRONG_LINK",
    moneyMayMoveUnderLive: false, // the link creates no new claim/effect
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    duplicateKind: "STRONG_EVENT",
    acceptanceScenarioIds: ["CA-026"],
    notes: "Strong fingerprint (tenant+provider+invoice) links; a suspected/fuzzy match may NEVER take this branch.",
  },
};

/** 14. Fuzzy similar-but-legitimate second visit. */
const fuzzyFirst = build({ keyTag: "fuzzy-a", serviceFrom: "2026-06-01", lines: cleanLines });
const fuzzySecond = build({ keyTag: "fuzzy-b", serviceFrom: "2026-06-15", lines: cleanLines }); // same content, later legit visit, no authoritative id
export const fuzzySecondVisit: GoldenScenario = {
  name: "fuzzySecondVisit",
  title: "Content-similar legitimate 2nd visit — routes DUPLICATE_REVIEW, never auto-linked",
  submission: fuzzyFirst,
  secondSubmission: fuzzySecond,
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.DUPLICATE_REVIEW,
    assignedQueue: QUEUE.DUPLICATE_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    duplicateKind: "FUZZY_SUSPECT",
    acceptanceScenarioIds: ["CA-027"],
    notes: "Persists and routes with safe candidate refs; the original claim is untouched.",
  },
};

/** 15a. Non-base currency, no effective FX rate. */
const fxLines = [line({ serviceCategory: "CONSULTATION" as ClaimLineCategory, cptCode: "99213", icdCode: "J06.9", description: "Consultation (USD)", quantity: 1, unitCost: "40.00", sourceLineRef: "L1" })];
export const nonBaseCurrencyNoFx: GoldenScenario = {
  name: "nonBaseCurrencyNoFx",
  title: "Foreign currency, no effective FX rate — routes FX_RATE_MISSING",
  submission: build({ keyTag: "fx-missing", lines: fxLines, currency: GOLDEN_IDS.foreignCurrency }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.FX_RATE_MISSING,
    assignedQueue: QUEUE.CONFIGURATION_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(fxLines),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-010"],
  },
};

/** 15b. Non-base currency WITH a valid effective FX rate. */
export const nonBaseCurrencyWithFx: GoldenScenario = {
  name: "nonBaseCurrencyWithFx",
  title: "Foreign currency with valid FX — original + base preserved, may auto-approve",
  submission: build({ keyTag: "fx-ok", lines: fxLines, currency: GOLDEN_IDS.foreignCurrency }),
  oracle: {
    structural: "ACCEPT",
    routeCode: null,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "WOULD_APPROVE",
    underLive: "AUTO_APPROVE",
    moneyMayMoveUnderLive: true,
    totalBilled: sumBilled(fxLines),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-011"],
    notes: "Original amount, base amount, rate, source and effective date must reconcile exactly.",
  },
};

/** 16. Reimbursement with proof — always manual (D13). */
export const reimbursementWithProof: GoldenScenario = {
  name: "reimbursementWithProof",
  title: "Member reimbursement with proof — always routes REIMBURSEMENT_PROOF_REVIEW",
  submission: build({
    keyTag: "reimb",
    lines: cleanLines,
    overrides: {
      origin: { reimbursementRequestId: "RR-GOLD-0001" },
      attachmentRefs: [{ externalRef: "receipt-gold-0001", category: "RECEIPT", sha256: "0".repeat(64) }],
    },
  }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.REIMBURSEMENT_PROOF_REVIEW,
    assignedQueue: QUEUE.REIMBURSEMENT_REVIEW,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: sumBilled(cleanLines),
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-045", "CA-076"],
    notes: "D13: reimbursements never enter live approval in v1, regardless of policy.",
  },
};

/** 17. Interim inpatient slice — shadow-only until inpatient release gate (D14). */
export const interimInpatientSlice: GoldenScenario = {
  name: "interimInpatientSlice",
  title: "Interim inpatient slice — forced SHADOW (INPATIENT_SHADOW_ONLY)",
  submission: build({
    keyTag: "case-interim",
    serviceType: "INPATIENT" as ServiceType,
    benefitCategory: "INPATIENT" as BenefitCategory,
    lines: [line({ serviceCategory: "PROCEDURE" as ClaimLineCategory, cptCode: "99231", icdCode: "J18.9", description: "Inpatient day — ward + review", quantity: 3, unitCost: "60000.00", sourceLineRef: "S1" })],
    diagnoses: [{ code: "J18.9", description: "Pneumonia, unspecified", isPrimary: true }],
    overrides: { origin: { caseId: "case-gold-0001", caseSliceSeq: 1 }, preauthRefs: ["PA-CASE-0001"] },
  }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.INPATIENT_SHADOW_ONLY,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "ROUTE", // evaluated but never live in v1
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: "180000.00",
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-046", "CA-078"],
    notes: "One case slice ⇒ one canonical claim; case/claim/line amounts conserve. PA read-through preserved.",
  },
};

/** 18. Final case residual — shadow-only until inpatient release gate (D14). */
export const finalCaseResidual: GoldenScenario = {
  name: "finalCaseResidual",
  title: "Final inpatient residual — forced SHADOW; prior slices not double-billed",
  submission: build({
    keyTag: "case-final",
    serviceType: "INPATIENT" as ServiceType,
    benefitCategory: "INPATIENT" as BenefitCategory,
    lines: [line({ serviceCategory: "PROCEDURE" as ClaimLineCategory, cptCode: "99238", icdCode: "J18.9", description: "Residual — discharge day + pharmacy", quantity: 1, unitCost: "45000.00", sourceLineRef: "F1" })],
    diagnoses: [{ code: "J18.9", description: "Pneumonia, unspecified", isPrimary: true }],
    overrides: { origin: { caseId: "case-gold-0001" }, preauthRefs: ["PA-CASE-0001"] },
  }),
  oracle: {
    structural: "ACCEPT",
    routeCode: ROUTE.INPATIENT_SHADOW_ONLY,
    assignedQueue: null,
    underOff: "ROUTE",
    underShadow: "ROUTE",
    underLive: "ROUTE",
    moneyMayMoveUnderLive: false,
    totalBilled: "45000.00",
    expectedTotalPayable: null,
    acceptanceScenarioIds: ["CA-046", "CA-079"],
    notes: "Residual is deterministic; prior interim slices for the same case are not re-billed.",
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────
export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  cleanOutpatientTwoLines,
  contractedAdjustmentShortfall,
  oneCodedOneUncoded,
  missingPaRequiredService,
  expiredPa,
  insufficientPaCover,
  missingRequiredDocument,
  benefitNotConfigured,
  benefitInsufficient,
  openFraudAlert,
  exactReplay,
  sameKeyDifferentPayload,
  strongCrossRailDuplicate,
  fuzzySecondVisit,
  nonBaseCurrencyNoFx,
  nonBaseCurrencyWithFx,
  reimbursementWithProof,
  interimInpatientSlice,
  finalCaseResidual,
];

export const goldenByName: Record<string, GoldenScenario> = Object.fromEntries(
  GOLDEN_SCENARIOS.map((s) => [s.name, s]),
);
