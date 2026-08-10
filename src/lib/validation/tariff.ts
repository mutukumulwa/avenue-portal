import { z } from "zod";
import { money } from "./money";
import { windowsOverlap } from "./rule-scope";

/**
 * SP-1 — canonical validation for provider tariff rows (WP-N1 / N-009).
 *
 * The single source of truth imported by BOTH doors to the tariff tables:
 * the provider server actions (`upsertCptTariffAction` /
 * `upsertDiagnosisTariffAction`) and the tRPC procedure (`providers.addTariff`).
 * Client-safe (no server imports) so the "use client" tariff cards can render
 * field labels + a mirror check.
 *
 * Rules: a rate is strictly positive money (rejects 0 / negative / NaN /
 * Infinity, ≤ 2 decimal places — `money.positive()`); an optional
 * `effectiveTo` must be AFTER `effectiveFrom`. A diagnosis tariff must carry at
 * least one of bundled / per-day rate (a rate-less row prices nothing).
 */

export const FIELD_LABELS: Record<string, string> = {
  serviceName: "Service name",
  cptCode: "CPT code",
  agreedRate: "Agreed rate",
  currency: "Currency",
  clientId: "Client",
  icdCode: "Diagnosis (ICD)",
  diagnosisLabel: "Diagnosis label",
  bundledRate: "Bundled rate",
  perDayRate: "Per-day rate",
  effectiveFrom: "Effective from",
  effectiveTo: "Effective to",
};

export const TARIFF_CURRENCY_VALUES = ["UGX", "KES", "USD"] as const;

/**
 * A tariff rate: strictly positive money (`> 0`), finite, ≤ 2 decimal places.
 * Zero, negative, NaN, Infinity and non-numeric strings are all rejected — this
 * is the N-009 boundary the workbook probes.
 */
export const tariffRate = money.positive();

// ── CPT tariff ──────────────────────────────────────────────────────────────

export const cptTariffBaseSchema = z.object({
  serviceName: z
    .string({ required_error: `${FIELD_LABELS.serviceName} is required.` })
    .trim()
    .min(1, `${FIELD_LABELS.serviceName} is required.`)
    .max(200),
  cptCode: z.string().trim().max(20).optional().nullable(),
  agreedRate: tariffRate,
  currency: z.enum(TARIFF_CURRENCY_VALUES).default("UGX"),
  clientId: z.string().trim().min(1).optional().nullable(),
  effectiveFrom: z.coerce.date({
    errorMap: () => ({ message: `${FIELD_LABELS.effectiveFrom} is required.` }),
  }),
  effectiveTo: z.coerce.date().nullable().optional(),
});

/** Cross-field invariant: an effective window must be ordered. */
export const tariffDateRefinement = (
  data: { effectiveFrom: Date; effectiveTo?: Date | null },
  ctx: z.RefinementCtx,
): void => {
  if (data.effectiveTo && data.effectiveTo.getTime() <= data.effectiveFrom.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: `${FIELD_LABELS.effectiveTo} must be after ${FIELD_LABELS.effectiveFrom.toLowerCase()}.`,
    });
  }
};

export const cptTariffSchema = cptTariffBaseSchema.superRefine(tariffDateRefinement);
export type CptTariffInput = z.infer<typeof cptTariffSchema>;

/** tRPC door for `providers.addTariff` — same rules, plus the owning provider id. */
export const addTariffSchema = cptTariffBaseSchema
  .extend({ providerId: z.string().min(1) })
  .superRefine(tariffDateRefinement);

// ── Diagnosis tariff ─────────────────────────────────────────────────────────

export const diagnosisTariffBaseSchema = z.object({
  icdCode: z
    .string({ required_error: `${FIELD_LABELS.icdCode} is required.` })
    .trim()
    .min(1, `${FIELD_LABELS.icdCode} is required.`)
    .max(20),
  diagnosisLabel: z
    .string({ required_error: `${FIELD_LABELS.diagnosisLabel} is required.` })
    .trim()
    .min(1, `${FIELD_LABELS.diagnosisLabel} is required.`)
    .max(300),
  bundledRate: tariffRate.nullable().optional(),
  perDayRate: tariffRate.nullable().optional(),
  notes: z.string().max(1000).optional().nullable(),
  effectiveFrom: z.coerce.date({
    errorMap: () => ({ message: `${FIELD_LABELS.effectiveFrom} is required.` }),
  }),
  effectiveTo: z.coerce.date().nullable().optional(),
});

export const diagnosisTariffSchema = diagnosisTariffBaseSchema.superRefine((data, ctx) => {
  tariffDateRefinement(data, ctx);
  if (data.bundledRate == null && data.perDayRate == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bundledRate"],
      message: "Enter a bundled rate or a per-day rate (a diagnosis tariff must price something).",
    });
  }
});
export type DiagnosisTariffInput = z.infer<typeof diagnosisTariffSchema>;

// ── Overlap / conflict detection (write-time, N-010) ─────────────────────────

export interface TariffOverlapView {
  id?: string;
  cptCode: string | null;
  serviceName: string;
  clientId: string | null;
  contractId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive?: boolean;
}

/**
 * Two tariff rows cover the SAME code+scope when their client (per-client
 * override vs network master) and contract scope match AND they resolve the same
 * service — by CPT code when both carry one, else by normalized service name.
 * This mirrors how both resolvers select a row, so an overlap here is exactly an
 * ambiguity there.
 */
export function sameTariffScope(a: TariffOverlapView, b: TariffOverlapView): boolean {
  if ((a.clientId ?? null) !== (b.clientId ?? null)) return false;
  if ((a.contractId ?? null) !== (b.contractId ?? null)) return false;
  if (a.cptCode && b.cptCode) {
    return a.cptCode.trim().toUpperCase() === b.cptCode.trim().toUpperCase();
  }
  if (!a.cptCode && !b.cptCode) {
    return a.serviceName.trim().toLowerCase() === b.serviceName.trim().toLowerCase();
  }
  return false;
}

/**
 * Returns the first EXISTING active tariff whose code+scope matches `candidate`
 * AND whose effective window overlaps — or null. The write is rejected on a
 * conflict so a service never has two active rates for the same code+scope over
 * the same period (which would make pricing depend on row order).
 */
export function detectTariffOverlap(
  existing: TariffOverlapView[],
  candidate: TariffOverlapView,
): TariffOverlapView | null {
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (e.isActive === false) continue;
    if (!sameTariffScope(e, candidate)) continue;
    if (!windowsOverlap(e.effectiveFrom, e.effectiveTo, candidate.effectiveFrom, candidate.effectiveTo)) continue;
    return e;
  }
  return null;
}
