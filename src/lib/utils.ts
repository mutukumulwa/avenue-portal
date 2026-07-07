import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Base (reporting) currency for the platform — UGX (AD-2 / OBS-2). Money whose
 * denomination is not otherwise known defaults to base.
 */
export const BASE_CURRENCY = "UGX";

type Money = number | string | { toString(): string };

/**
 * Shared money presentation helper (Outstanding-Conditions Ticket 3). Always
 * pass the row's actual currency so a KES claim renders as KES and a UGX claim
 * as UGX — never assume a single hardcoded denomination. Falls back to a
 * "CODE 1,234" format for currencies Intl doesn't recognise, and never throws.
 */
export function formatMoney(
  amount: Money,
  currency: string = BASE_CURRENCY,
  options?: { showDecimals?: boolean },
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  const safe = Number.isFinite(num) ? num : 0;
  const digits = options?.showDecimals ? 2 : 0;
  const code = (currency || BASE_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: code,
      currencyDisplay: "code", // explicit ISO code (UGX/KES) — clearer than symbols on financial surfaces
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safe);
  } catch {
    return `${code} ${safe.toLocaleString("en-UG", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  }
}

/** Format an amount already expressed in base currency (UGX). */
export function formatBaseMoney(amount: Money, options?: { showDecimals?: boolean }): string {
  return formatMoney(amount, BASE_CURRENCY, options);
}

/**
 * Back-compatible currency formatter. The denomination now defaults to base
 * currency (UGX) rather than a hardcoded KES; pass an explicit currency for
 * foreign-denominated rows.
 */
export function formatCurrency(amount: Money, currency: string = BASE_CURRENCY): string {
  return formatMoney(amount, currency);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function generateMemberNumber() {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  // Sync fallback (no DB). Persisted members use member-numbering.service
  // nextMemberNumber() which applies the client-configurable prefix (G9.6).
  return `MVX-${year}-${randomSuffix}`;
}
