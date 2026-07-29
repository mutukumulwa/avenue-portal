import type { MasterDataChangeCategory, MasterDataChangeRisk, MasterDataChangeStatus } from "@prisma/client";

/**
 * PNOS F7.4 — provider master-data change policy (pure; no I/O).
 *
 * The single source of truth for WHAT a provider may propose per category: the
 * allow-listed fields (anything else is rejected — a provider can never propose
 * an arbitrary column), which fields are SENSITIVE (masked in the request row +
 * never activated in F7.4 — bank), whether evidence is required, the risk class
 * (HIGH ⇒ maker ≠ checker + F7.5 independent verification), the SLA, whether an
 * approved change auto-activates through the default canonical applier, and the
 * owning record scope (the Provider row or a specific ProviderBranch). Also the
 * status transition table + the sensitive-value masker (the full value never
 * reaches this layer or the DB — §7.10 / F7.5).
 */

export interface CategoryPolicy {
  /** the ONLY fields a provider may propose for this category (real columns of the owning record). */
  allowedFields: string[];
  /** subset of allowedFields whose value is masked in the stored request and never auto-activated. */
  sensitiveFields: string[];
  requiresEvidence: boolean;
  risk: MasterDataChangeRisk;
  slaDays: number;
  /** true ⇒ the default applier activates the change on approval (F7.4); false ⇒ a dedicated owner / F7.5 / F7.11 activates later. */
  autoApply: boolean;
  /** which record the change targets — the Provider row, or a specific ProviderBranch (needs providerBranchId). */
  scope: "PROVIDER" | "BRANCH";
}

export const MASTER_DATA_CATEGORY_POLICY: Record<MasterDataChangeCategory, CategoryPolicy> = {
  CONTACT: { allowedFields: ["phone", "email", "address", "county", "contactPerson", "operatingHours", "isOpen24Hours"], sensitiveFields: [], requiresEvidence: false, risk: "LOW", slaDays: 5, autoApply: true, scope: "PROVIDER" },
  BRANCH: { allowedFields: ["name", "address", "county", "code"], sensitiveFields: [], requiresEvidence: false, risk: "LOW", slaDays: 5, autoApply: true, scope: "BRANCH" },
  PRACTITIONER: { allowedFields: ["fullName", "cadre", "licenseNumber", "specialty", "isPrimary"], sensitiveFields: [], requiresEvidence: true, risk: "MEDIUM", slaDays: 7, autoApply: false, scope: "PROVIDER" },
  CREDENTIAL: { allowedFields: ["licenceNumber", "licenceExpiry", "registrationNumber", "taxPin", "facilityLevel"], sensitiveFields: [], requiresEvidence: true, risk: "MEDIUM", slaDays: 7, autoApply: false, scope: "PROVIDER" },
  // Bank = the canonical sensitive change: every identity field is masked here and
  // NONE is auto-activated — F7.5 does maker/checker + out-of-band verification.
  BANK: { allowedFields: ["bankName", "branchName", "accountName", "accountNumber"], sensitiveFields: ["accountName", "accountNumber"], requiresEvidence: true, risk: "HIGH", slaDays: 10, autoApply: false, scope: "PROVIDER" },
  INTEGRATION: { allowedFields: ["connectorType", "mode", "endpoint", "cadence"], sensitiveFields: ["endpoint"], requiresEvidence: false, risk: "MEDIUM", slaDays: 7, autoApply: false, scope: "PROVIDER" },
  OTHER: { allowedFields: [], sensitiveFields: [], requiresEvidence: false, risk: "MEDIUM", slaDays: 7, autoApply: false, scope: "PROVIDER" },
};

export function requiresMakerChecker(risk: MasterDataChangeRisk): boolean {
  return risk === "HIGH";
}

/** Mask a sensitive value to a trailing hint — the full value NEVER persists (§7.10). */
export function maskSensitive(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

export interface ProposedProjection {
  /** the values to store on the request (sensitive fields already masked). */
  stored: Record<string, unknown>;
  /** fields present in the input that are NOT allowed for this category (a reject reason). */
  disallowed: string[];
  /** allowed fields whose value was masked before storage. */
  masked: string[];
}

/** Validate + mask a provider's proposed values against the category allow-list. */
export function projectProposedValues(category: MasterDataChangeCategory, proposed: Record<string, unknown> | null | undefined): ProposedProjection {
  const policy = MASTER_DATA_CATEGORY_POLICY[category];
  const input = proposed && typeof proposed === "object" ? proposed : {};
  const keys = Object.keys(input);
  const disallowed = keys.filter((k) => !policy.allowedFields.includes(k));
  const stored: Record<string, unknown> = {};
  const masked: string[] = [];
  for (const k of keys) {
    if (!policy.allowedFields.includes(k)) continue;
    if (policy.sensitiveFields.includes(k)) {
      stored[k] = maskSensitive(input[k]);
      masked.push(k);
    } else {
      stored[k] = input[k];
    }
  }
  return { stored, disallowed, masked };
}

/** Build the masked snapshot of the CURRENT values from the owning record (Provider or ProviderBranch). */
export function buildCurrentSnapshot(category: MasterDataChangeCategory, record: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const policy = MASTER_DATA_CATEGORY_POLICY[category];
  const src = record && typeof record === "object" ? record : {};
  const snap: Record<string, unknown> = {};
  for (const f of policy.allowedFields) {
    const v = f in src ? src[f] : null;
    snap[f] = policy.sensitiveFields.includes(f) ? (v == null ? null : maskSensitive(v)) : v ?? null;
  }
  return snap;
}

// ── status transitions ─────────────────────────────────────────────────────
export const MASTER_DATA_TRANSITIONS: Record<MasterDataChangeStatus, MasterDataChangeStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "INFORMATION_REQUIRED", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["INFORMATION_REQUIRED", "PENDING_CHECKER", "APPROVED", "REJECTED", "WITHDRAWN"],
  INFORMATION_REQUIRED: ["PROVIDER_RESPONDED", "REJECTED", "WITHDRAWN"],
  PROVIDER_RESPONDED: ["UNDER_REVIEW", "INFORMATION_REQUIRED", "PENDING_CHECKER", "APPROVED", "REJECTED", "WITHDRAWN"],
  PENDING_CHECKER: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function canTransitionMasterData(from: MasterDataChangeStatus, to: MasterDataChangeStatus): boolean {
  return MASTER_DATA_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isMasterDataTerminal(s: MasterDataChangeStatus): boolean {
  return s === "APPROVED" || s === "REJECTED" || s === "WITHDRAWN";
}

/** States from which the provider may still withdraw its own request. */
export const PROVIDER_WITHDRAWABLE_MASTER_DATA: MasterDataChangeStatus[] = ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"];

/** States a reviewer may act on to begin/continue review (not terminal, not pending-checker). */
export const REVIEWER_ACTIONABLE_MASTER_DATA: MasterDataChangeStatus[] = ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"];
