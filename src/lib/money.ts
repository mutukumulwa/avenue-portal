/**
 * UAT-HF P01.05 — money parsing that cannot silently change a magnitude.
 *
 * DEF-018 (S2), the finding this file exists for: typing **"300k"** into a UGX
 * benefit-limit field silently became **300** — a 1000× understatement of a
 * member's cover, with no warning. The mechanism is a native `<input
 * type="number">`: the browser discards the trailing "k" and hands back "300".
 *
 * The run's own method note is worth keeping in view: that defect was only caught
 * because the tester typed with real keystrokes. Setting `.value`
 * programmatically bypasses the browser's keystroke filtering and would have
 * hidden the truncation entirely, turning a High defect into a false pass.
 *
 * So the rule here: a money input accepts an **explicitly supported grammar**, and
 * anything else is REJECTED with guidance — never coerced, never truncated,
 * never partially parsed. `parseFloat("300k")` returns 300 and is the enemy.
 *
 * Amounts are `Prisma.Decimal`, not `number`. UGX figures reach nine digits and
 * binary floating point is the wrong tool for money.
 */
import { Prisma } from "@prisma/client";
import { CURRENCY_CODE, OPERATIONAL_LOCALE } from "@/lib/locale-config";

export type Decimal = Prisma.Decimal;

export type MoneyParseFailure =
  | "EMPTY"
  | "NOT_A_NUMBER"
  | "MAGNITUDE_SUFFIX"
  | "NEGATIVE"
  | "TOO_MANY_DECIMALS"
  | "TOO_LARGE";

export type MoneyParseResult =
  | { ok: true; value: Decimal }
  | { ok: false; reason: MoneyParseFailure; message: string };

export interface ParseMoneyOptions {
  /** Allow negative amounts (credit notes, reversals). Default false. */
  allowNegative?: boolean;
  /** Maximum decimal places. Default 2. */
  maxDecimals?: number;
  /** Treat blank as 0 rather than an error. Default false. */
  blankIsZero?: boolean;
}

/** Digits, one optional decimal point, optional comma grouping. Nothing else. */
const SUPPORTED_GRAMMAR = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;

/** "300k", "1.2m", "5bn" — the exact shape that silently became 300. */
const MAGNITUDE_SUFFIX = /^-?[\d.,]+\s*(k|m|bn|b|thousand|million|billion)$/i;

/** Guard against absurd values reaching a Decimal column. */
const MAX_DIGITS = 15;

/** The grammar, in the words a form should show the user. */
export const MONEY_INPUT_HINT = "Numbers only, e.g. 300000 or 300,000. Do not use 'k' or 'm'.";

const FAILURE_MESSAGE: Record<MoneyParseFailure, string> = {
  EMPTY: "Enter an amount.",
  NOT_A_NUMBER: `Enter an amount as digits. ${MONEY_INPUT_HINT}`,
  // Named explicitly rather than lumped in with "not a number", because this is
  // the mistake that actually happened and the user needs to know what we did
  // NOT do with it.
  MAGNITUDE_SUFFIX: "Enter the full amount in figures — 'k' and 'm' are not accepted. For 300 thousand, enter 300000.",
  NEGATIVE: "Enter a positive amount.",
  TOO_MANY_DECIMALS: "Use at most 2 decimal places.",
  TOO_LARGE: "That amount is too large. Check for an extra digit.",
};

function failure(reason: MoneyParseFailure): MoneyParseResult {
  return { ok: false, reason, message: FAILURE_MESSAGE[reason] };
}

/**
 * Parse a money string. Never coerces; never truncates.
 *
 * A currency code prefix is tolerated ("UGX 300,000") because operators paste it,
 * but the code itself is ignored — the denomination belongs to the field, not to
 * what someone typed.
 */
export function parseMoney(input: unknown, options: ParseMoneyOptions = {}): MoneyParseResult {
  const { allowNegative = false, maxDecimals = 2, blankIsZero = false } = options;

  if (input === null || input === undefined) return blankIsZero ? { ok: true, value: new Prisma.Decimal(0) } : failure("EMPTY");

  // A number that already survived a typed path is fine; a NaN is not.
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return failure("NOT_A_NUMBER");
    return parseMoney(input.toString(), options);
  }
  if (typeof input !== "string") return failure("NOT_A_NUMBER");

  let text = input.trim();
  if (text === "") return blankIsZero ? { ok: true, value: new Prisma.Decimal(0) } : failure("EMPTY");

  // Strip a leading/trailing currency code — "UGX 300,000" / "300000 UGX".
  // Whitespace is REQUIRED as the separator. Without it, any three-letter input
  // is eaten: "abc" would strip to "" and report EMPTY, and "2 million" would
  // lose its trailing "ion" and stop looking like a magnitude suffix.
  text = text.replace(/^[A-Za-z]{3}\s+/, "").replace(/\s+[A-Za-z]{3}$/, "").trim();
  if (text === "") return failure("EMPTY");

  // Check the magnitude suffix BEFORE the general grammar, so the user is told
  // precisely what went wrong instead of a generic "not a number".
  if (MAGNITUDE_SUFFIX.test(text)) return failure("MAGNITUDE_SUFFIX");

  if (!SUPPORTED_GRAMMAR.test(text)) return failure("NOT_A_NUMBER");

  const unGrouped = text.replace(/,/g, "");
  const [, decimals = ""] = unGrouped.split(".");
  if (decimals.length > maxDecimals) return failure("TOO_MANY_DECIMALS");

  let value: Decimal;
  try {
    value = new Prisma.Decimal(unGrouped);
  } catch {
    return failure("NOT_A_NUMBER");
  }

  if (!value.isFinite()) return failure("NOT_A_NUMBER");
  if (value.isNegative() && !allowNegative) return failure("NEGATIVE");
  if (value.abs().toFixed(0).replace("-", "").length > MAX_DIGITS) return failure("TOO_LARGE");

  return { ok: true, value };
}

/**
 * Format for readback beside an input, e.g. "UGX 300,000".
 *
 * DEF-018's remedy is not only rejecting "300k" — it is showing the user what the
 * system understood, so a magnitude error is visible before it is saved.
 */
export function formatMoneyReadback(value: Decimal | number | string, currency: string = CURRENCY_CODE): string {
  let decimal: Decimal;
  try {
    decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    return "—";
  }
  const hasFraction = !decimal.isInteger();
  return new Intl.NumberFormat(OPERATIONAL_LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "code",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(decimal.toNumber());
}

// ── percentages ─────────────────────────────────────────────────────────────

export type PercentParseResult =
  | { ok: true; value: Decimal }
  | { ok: false; reason: "EMPTY" | "NOT_A_NUMBER" | "OUT_OF_RANGE"; message: string };

/**
 * Parse a co-contribution percentage.
 *
 * DEF-021: "A 0% co-contribution is rejected as if missing, contradicting the
 * field's own 0-100 range." That is the classic truthiness bug — `if (!value)`
 * treats 0 as absent. Zero is a legitimate, meaningful percentage, so this
 * function returns it as a value and never as an error. Callers must use nullish
 * checks (`?? `, `=== undefined`), never truthiness.
 */
export function parsePercent(input: unknown): PercentParseResult {
  if (input === null || input === undefined) {
    return { ok: false, reason: "EMPTY", message: "Enter a percentage between 0 and 100." };
  }
  const text = String(input).trim().replace(/%$/, "").trim();
  if (text === "") return { ok: false, reason: "EMPTY", message: "Enter a percentage between 0 and 100." };
  // A leading sign is accepted here on purpose so that "-1" is answered with the
  // field's own range message rather than "enter a number" (DEF-021 recorded
  // 101 / -1 / blank all being refused with explicit range messages).
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, reason: "NOT_A_NUMBER", message: "Enter a percentage as a number, e.g. 10." };
  }
  const value = new Prisma.Decimal(text);
  if (value.lessThan(0) || value.greaterThan(100)) {
    return { ok: false, reason: "OUT_OF_RANGE", message: "Enter a percentage between 0 and 100." };
  }
  return { ok: true, value };
}
