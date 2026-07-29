/**
 * PNOS F7.2 — provider contract-view projection (pure; no I/O).
 *
 * Implements the F7.1 CONTRACT_VISIBILITY_FIELD_POLICY: a per-field ALLOW-LIST
 * that carries ONLY the VISIBLE (+ CONDITIONAL) fields and NEVER an internal one
 * (extraction confidence, notes, credit limit, ownership/approval actors, the
 * scanned-agreement link, other parties). A new internal schema field cannot leak
 * by default because nothing is projected unless it is named here. The F7.2
 * "field leakage snapshot" test enforces this.
 */

/** Contract statuses a provider may see (in-force + historical). Negotiation states are hidden. */
export const CONTRACT_VIEW_STATUSES = ["ACTIVE", "EXPIRED", "TERMINATED", "SUPERSEDED"] as const;

export type ContractEffectiveLabel = "CURRENT" | "FUTURE" | "EXPIRED";

const str = (v: unknown): string | null => (v == null ? null : typeof v === "object" ? (v as { toString(): string }).toString() : String(v));

/** Effective label from a contract/version status + window (§2). */
export function effectiveLabel(status: string, from: Date | null, to: Date | null, now: Date): ContractEffectiveLabel {
  if (status === "EXPIRED" || status === "TERMINATED" || status === "SUPERSEDED") return "EXPIRED";
  if (from && from.getTime() > now.getTime()) return "FUTURE";
  if (to && to.getTime() < now.getTime()) return "EXPIRED";
  return "CURRENT";
}

// ── contract header ──────────────────────────────────────────────────────────
export interface ContractHeaderRow {
  id: string; contractNumber: string; title: string; contractType: string; status: string;
  branchScope: string; externalContractRef: string | null;
  startDate: Date; endDate: Date; signedDate: Date | null; autoRenew: boolean;
  currency: string; country: string | null; region: string | null;
  paymentTermDays: number; paymentTermType: string;
  submissionWindowDays: number | null; submissionWindowBasis: string | null;
  balanceBillingPolicy: string | null; taxInclusive: string; reconciliationCadence: string;
  unlistedServiceRule: string; unlistedDiscountPct: unknown;
  earlySettlementDiscountPct: unknown; earlySettlementWindowDays: number | null; invoiceDiscountPct: unknown;
}

export interface ContractHeaderView {
  id: string; contractNumber: string; title: string; contractType: string; status: string; effectiveLabel: ContractEffectiveLabel;
  branchScope: string; externalContractRef: string | null;
  startDate: Date; endDate: Date; signedDate: Date | null; autoRenew: boolean;
  currency: string; country: string | null; region: string | null;
  // commercial terms (VISIBLE)
  paymentTermDays: number; paymentTermType: string;
  submissionWindowDays: number | null; submissionWindowBasis: string | null;
  balanceBillingPolicy: string | null; taxInclusive: string; reconciliationCadence: string;
  // CONDITIONAL (subject to the F7.1 §10 Q1 sign-off — commercial confidentiality)
  conditional: { unlistedServiceRule: string; unlistedDiscountPct: string | null; earlySettlementDiscountPct: string | null; earlySettlementWindowDays: number | null; invoiceDiscountPct: string | null };
}

export function projectContractHeader(c: ContractHeaderRow, now: Date): ContractHeaderView {
  return {
    id: c.id, contractNumber: c.contractNumber, title: c.title, contractType: c.contractType, status: c.status,
    effectiveLabel: effectiveLabel(c.status, c.startDate, c.endDate, now),
    branchScope: c.branchScope, externalContractRef: c.externalContractRef,
    startDate: c.startDate, endDate: c.endDate, signedDate: c.signedDate, autoRenew: c.autoRenew,
    currency: c.currency, country: c.country, region: c.region,
    paymentTermDays: c.paymentTermDays, paymentTermType: c.paymentTermType,
    submissionWindowDays: c.submissionWindowDays, submissionWindowBasis: c.submissionWindowBasis,
    balanceBillingPolicy: c.balanceBillingPolicy, taxInclusive: c.taxInclusive, reconciliationCadence: c.reconciliationCadence,
    conditional: { unlistedServiceRule: c.unlistedServiceRule, unlistedDiscountPct: str(c.unlistedDiscountPct), earlySettlementDiscountPct: str(c.earlySettlementDiscountPct), earlySettlementWindowDays: c.earlySettlementWindowDays, invoiceDiscountPct: str(c.invoiceDiscountPct) },
    // NOTE: creditLimit, executionStatus, signatories, reviewDueDate, notes, documentUrl, *ById/*At,
    // currentVersionId, supersededById are DELIBERATELY not projected (INTERNAL — F7.1 §4).
  };
}

// ── version ──────────────────────────────────────────────────────────────────
export interface VersionRow { versionNumber: number; status: string; effectiveFrom: Date; effectiveTo: Date | null; changeSummary: string | null }
export interface VersionView { versionNumber: number; effectiveFrom: Date; effectiveTo: Date | null; label: ContractEffectiveLabel; changeSummary: string | null }
export function projectVersion(v: VersionRow, now: Date): VersionView {
  return { versionNumber: v.versionNumber, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, label: effectiveLabel(v.status === "SUPERSEDED" ? "SUPERSEDED" : "ACTIVE", v.effectiveFrom, v.effectiveTo, now), changeSummary: v.changeSummary };
  // snapshot + validationReport + approver ids are INTERNAL (never projected).
}

// ── derived served-scope (applicability) ─────────────────────────────────────
export interface ApplicabilityRow { clientId: string; groupId: string | null; packageId: string | null; benefitCategory: string | null; memberCategory: string | null; networkTier: string | null; inclusionType: string; effectiveFrom: Date; effectiveTo: Date | null; isActive: boolean }
export interface ServedScope { clientId: string; groupId: string | null; packageId: string | null; benefitCategory: string | null; memberCategory: string | null; networkTier: string | null; effectiveFrom: Date; effectiveTo: Date | null }
/** The provider's served scope = active INCLUDE rows (EXCLUDE machinery is internal). */
export function projectServedScope(rows: ApplicabilityRow[]): ServedScope[] {
  return rows.filter((r) => r.isActive && r.inclusionType === "INCLUDE").map((r) => ({ clientId: r.clientId, groupId: r.groupId, packageId: r.packageId, benefitCategory: r.benefitCategory, memberCategory: r.memberCategory, networkTier: r.networkTier, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }));
}

// ── rate line ────────────────────────────────────────────────────────────────
export interface TariffRow {
  id: string; serviceName: string; standardDescription: string | null; providerDescription: string | null;
  cptCode: string | null; providerServiceCode: string | null; codingSystem: string | null;
  agreedRate: unknown; currency: string; rateType: string; tariffType: string;
  discountPct: unknown; markupPct: unknown; maxPayableAmount: unknown; minPayableAmount: unknown;
  unitOfMeasure: string; maxQuantityPerVisit: number | null; quantityLimit: number | null; frequencyLimit: number | null; frequencyPeriod: string | null;
  genderRestriction: string | null; ageMin: number | null; ageMax: number | null;
  requiresPreauth: boolean; requiresReferral: boolean;
  externalScheme: string | null; externalRebateAmount: unknown;
  rateMissing: boolean; effectiveFrom: Date; effectiveTo: Date | null;
}
export interface TariffView {
  id: string; service: string; cptCode: string | null; providerCode: string | null; codingSystem: string | null;
  rate: string | null; currency: string; rateType: string; tariffType: string;
  discountPct: string | null; markupPct: string | null; maxPayable: string | null; minPayable: string | null;
  unit: string; maxQuantityPerVisit: number | null; quantityLimit: number | null; frequencyLimit: number | null; frequencyPeriod: string | null;
  genderRestriction: string | null; ageMin: number | null; ageMax: number | null;
  requiresPreauth: boolean; requiresReferral: boolean;
  externalRebate: string | null;
  /** rateMissing (§5) → a safe flag, never the extraction detail. */
  rateUnderConfirmation: boolean;
  effectiveFrom: Date; effectiveTo: Date | null;
}
export function projectTariff(t: TariffRow): TariffView {
  return {
    id: t.id, service: t.standardDescription || t.serviceName, cptCode: t.cptCode, providerCode: t.providerServiceCode, codingSystem: t.codingSystem,
    rate: t.rateMissing ? null : str(t.agreedRate), currency: t.currency, rateType: t.rateType, tariffType: t.tariffType,
    discountPct: str(t.discountPct), markupPct: str(t.markupPct), maxPayable: str(t.maxPayableAmount), minPayable: str(t.minPayableAmount),
    unit: t.unitOfMeasure, maxQuantityPerVisit: t.maxQuantityPerVisit, quantityLimit: t.quantityLimit, frequencyLimit: t.frequencyLimit, frequencyPeriod: t.frequencyPeriod,
    genderRestriction: t.genderRestriction, ageMin: t.ageMin, ageMax: t.ageMax,
    requiresPreauth: t.requiresPreauth, requiresReferral: t.requiresReferral,
    externalRebate: str(t.externalRebateAmount),
    rateUnderConfirmation: t.rateMissing,
    effectiveFrom: t.effectiveFrom, effectiveTo: t.effectiveTo,
    // sourceRef (extraction {page,rawText,confidence}), notes, versionId/clientId/branchId scoping are INTERNAL (never projected).
  };
}

// ── requirements + exclusions + capitation ───────────────────────────────────
export interface PreauthRuleRow { triggerType: string; thresholdAmount: unknown; admissionRequired: boolean; emergencyExempt: boolean; retrospectiveAllowed: boolean; retrospectiveWindowHours: number | null; approvalSlaHours: number | null; validityDays: number | null; requiredDocumentTypes: string[]; consequenceIfMissing: string }
export function projectPreauthRule(r: PreauthRuleRow) {
  return { triggerType: r.triggerType, thresholdAmount: str(r.thresholdAmount), admissionRequired: r.admissionRequired, emergencyExempt: r.emergencyExempt, retrospectiveAllowed: r.retrospectiveAllowed, retrospectiveWindowHours: r.retrospectiveWindowHours, approvalSlaHours: r.approvalSlaHours, validityDays: r.validityDays, requiredDocumentTypes: r.requiredDocumentTypes, consequenceIfMissing: r.consequenceIfMissing };
}
export interface DocRuleRow { documentType: string; mandatory: boolean; appliesWhen: unknown; consequenceIfMissing: string }
export function projectDocRule(r: DocRuleRow) {
  return { documentType: r.documentType, mandatory: r.mandatory, appliesWhen: r.appliesWhen ?? null, consequenceIfMissing: r.consequenceIfMissing };
}
export interface ExclusionRow { cptCode: string | null; serviceName: string; reason: string | null; level: string; icdCodes: string[]; dateFrom: Date | null; dateTo: Date | null }
export function projectExclusion(r: ExclusionRow) {
  return { cptCode: r.cptCode, service: r.serviceName, reason: r.reason, level: r.level, icdCodes: r.icdCodes, dateFrom: r.dateFrom, dateTo: r.dateTo };
  // sourceRef is INTERNAL.
}
export interface PricingRuleRow { ruleKind: string; params: unknown }
/** Capitation/typed pricing → a provider-safe summary; never poolId or internal keys. */
export function projectCapitationRule(r: PricingRuleRow): { ruleKind: string; rate: string | null; basis: string | null; carveOutCodes: string[] } | null {
  if (!["CAPITATION", "PER_VISIT_CASE_RATE", "AVERAGE_COST_POOL"].includes(r.ruleKind)) return null;
  const p = (r.params && typeof r.params === "object" ? (r.params as Record<string, unknown>) : {}) as Record<string, unknown>;
  const carve = Array.isArray(p.carveOutCodes) ? (p.carveOutCodes as unknown[]).filter((x): x is string => typeof x === "string") : [];
  return { ruleKind: r.ruleKind, rate: p.rate != null ? String(p.rate) : null, basis: typeof p.basis === "string" ? p.basis : typeof p.payBasis === "string" ? p.payBasis : null, carveOutCodes: carve };
  // poolId + all other params keys are INTERNAL.
}
