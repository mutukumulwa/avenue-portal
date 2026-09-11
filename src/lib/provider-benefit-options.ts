/**
 * Family Hospital UAT plan P03.05 / FH-12 — the ONE provider benefit list.
 *
 * Before this module the new-claim, correction and pre-auth forms each carried
 * their own array, and they disagreed: the claim forms offered seven benefits
 * and omitted INPATIENT and SURGICAL (the trial's inpatient and theatre work),
 * the pre-auth form offered nine. A benefit the member's package covers must be
 * selectable everywhere a provider files for it.
 *
 * Derived from the `BenefitCategory` enum: the label map is a `Record` over the
 * enum type, so adding an enum value fails typecheck until it is labelled here.
 *
 * DEC-FH-02 (default applied): CUSTOM is hidden from providers — it has no
 * tenant-defined label — and every other value is offered. Labels follow the
 * admin claim form's wording so staff and facilities see the same words.
 *
 * Type-only Prisma import: this module ships to the browser.
 */
import type { BenefitCategory, ServiceType } from "@prisma/client";

const BENEFIT_LABELS: Record<BenefitCategory, string> = {
  OUTPATIENT: "Outpatient",
  INPATIENT: "Inpatient",
  SURGICAL: "Surgical",
  MATERNITY: "Maternity",
  DENTAL: "Dental",
  OPTICAL: "Optical",
  CHRONIC_DISEASE: "Chronic Disease",
  MENTAL_HEALTH: "Mental Health",
  AMBULANCE_EMERGENCY: "Emergency/Ambulance",
  REHABILITATION: "Rehabilitation",
  WELLNESS_PREVENTIVE: "Wellness/Preventive",
  LAST_EXPENSE: "Last Expense",
  CUSTOM: "Custom",
};

/** DEC-FH-02: not offered to providers. */
export const HIDDEN_PROVIDER_BENEFITS: readonly BenefitCategory[] = ["CUSTOM"];

/** Business order: most frequent first. Every enum value appears exactly once. */
const ORDER: readonly BenefitCategory[] = [
  "OUTPATIENT",
  "INPATIENT",
  "SURGICAL",
  "MATERNITY",
  "DENTAL",
  "OPTICAL",
  "CHRONIC_DISEASE",
  "MENTAL_HEALTH",
  "AMBULANCE_EMERGENCY",
  "REHABILITATION",
  "WELLNESS_PREVENTIVE",
  "LAST_EXPENSE",
  "CUSTOM",
];

export const PROVIDER_BENEFIT_OPTIONS: ReadonlyArray<{ value: BenefitCategory; label: string }> = ORDER.filter(
  (b) => !HIDDEN_PROVIDER_BENEFITS.includes(b),
).map((value) => ({ value, label: BENEFIT_LABELS[value] }));

export const ALL_BENEFIT_CATEGORIES: readonly BenefitCategory[] = ORDER;

export function benefitLabel(value: BenefitCategory | string): string {
  return BENEFIT_LABELS[value as BenefitCategory] ?? String(value);
}

export function isProviderBenefit(value: unknown): value is BenefitCategory {
  return typeof value === "string" && PROVIDER_BENEFIT_OPTIONS.some((o) => o.value === value);
}

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  OUTPATIENT: "Outpatient",
  INPATIENT: "Inpatient",
  DAY_CASE: "Day Case",
  EMERGENCY: "Emergency",
};

export const PROVIDER_SERVICE_TYPE_OPTIONS: ReadonlyArray<{ value: ServiceType; label: string }> = (
  ["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"] as const
).map((value) => ({ value, label: SERVICE_TYPE_LABELS[value] }));

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" && PROVIDER_SERVICE_TYPE_OPTIONS.some((o) => o.value === value);
}
