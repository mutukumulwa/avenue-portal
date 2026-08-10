import { z } from "zod";
import { money } from "./money";

/**
 * SP-1 — canonical validation for annual co-contribution caps (DEF-027).
 *
 * The single source of truth for the cap write rules, imported by BOTH doors to
 * the same table: the server action (`upsertAnnualCapAction`) and the tRPC
 * procedure (`coContribution.upsertCap`). Previously each door validated
 * separately (or not at all), so a family cap below the individual cap could be
 * persisted from either one — the run-03 stop-line.
 *
 * Decisions applied:
 *   D4 — family cap is OPTIONAL (null = no family cap); when present it must be
 *        >= the individual cap.
 *   D5 — money is Decimal(12,2): finite, positive, at most 2 decimal places.
 */

/** Human labels so every consumer renders field errors consistently. */
export const FIELD_LABELS: Record<string, string> = {
  individualCap: "Individual annual cap",
  familyCap: "Family annual cap",
};

/**
 * Base object WITHOUT the cross-field rule. Exported on its own because a
 * `.superRefine()` returns a `ZodEffects`, which has no `.extend()` — the tRPC
 * procedure needs to add `packageId` and then re-attach the shared refinement
 * (see `capsRefinement`). Keeping the object and the refinement separate lets
 * both doors share the exact same field + cross-field rules.
 */
export const capsBaseSchema = z.object({
  individualCap: money.positive(),
  familyCap: money.positive().nullable(),
});

/**
 * Cross-field invariant (D4): a present family cap must be >= the individual
 * cap. Attaches the error to the `familyCap` field so the form can render it
 * next to the offending input.
 */
export const capsRefinement = (
  data: { individualCap: number; familyCap: number | null },
  ctx: z.RefinementCtx,
): void => {
  if (data.familyCap != null && data.familyCap < data.individualCap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["familyCap"],
      message: `${FIELD_LABELS.familyCap} cannot be below the ${FIELD_LABELS.individualCap.toLowerCase()}.`,
    });
  }
};

/** The action's schema: caps only, with the cross-field rule applied. */
export const capsSchema = capsBaseSchema.superRefine(capsRefinement);

export type CapsInput = z.infer<typeof capsSchema>;
