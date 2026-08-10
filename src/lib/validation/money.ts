import { z } from "zod";

/**
 * SP-1 — shared money field (kills defect class C2 at the entry boundary).
 *
 * Coerces the raw value (a FormData string OR a JSON number) to a number, then
 * requires it be finite (rejects NaN/Infinity), non-negative, and at most two
 * decimal places (D5: money is stored Decimal(…,2)). Because it coerces, the
 * SAME schema validates the server action, the tRPC procedure, and any API
 * route that writes the entity — one rule, every door.
 *
 * Callers layer on intent:
 *   - `.positive()`  where zero is invalid (e.g. annual caps),
 *   - `.nullable()`  where the field is optional (null = not set).
 *
 * Never use a bare `z.number()` for money — it accepts NaN, Infinity, and
 * fractional cents, and it will not coerce a FormData string.
 */
export const money = z.coerce.number().finite().nonnegative().multipleOf(0.01);

/** Percent scale 0–100 (D5: "10 means 10%", never a 0–1 fraction). Stored
 *  Decimal; entry/display is always the whole-percent value. Kept here so the
 *  benefit-config wave (WP-2.x) reuses one definition. */
export const percent = z.coerce.number().finite().min(0).max(100).multipleOf(0.01);
