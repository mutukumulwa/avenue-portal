import { z } from "zod";

/**
 * SP-1 — shared, client-safe helpers for the structured-rule schemas
 * (exclusion.ts / referral.ts). No server imports (these modules are pulled into
 * the "use client" package-edit managers), so the eval-time equivalents in
 * `src/server/services/eligibility/rules/util.ts` are intentionally mirrored here
 * for write-time validation.
 */

/** A single scope code (ICD/CPT/service). Trim → upper-case → 1–30 chars. */
export const codeField = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .refine((s) => s.length >= 1 && s.length <= 30, {
    message: "Each code must be 1–30 characters.",
  });

/** Required member-safe explanation: trim → collapse whitespace → 1–500 chars. */
export const memberSafeField = z
  .string({ required_error: "A member-safe explanation is required." })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1, { message: "A member-safe explanation is required." })
  .refine((s) => s.length <= 500, { message: "The explanation must be at most 500 characters." });

/** Case/whitespace-insensitive intersection of two code arrays. */
export function codeArraysIntersect(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const norm = (s: string) => s.trim().toUpperCase();
  const set = new Set(b.map(norm));
  return a.some((x) => set.has(norm(x)));
}

/** Do two effective windows overlap? Open (null) ends are unbounded. */
export function windowsOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const bEnd = bTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return aFrom.getTime() <= bEnd && bFrom.getTime() <= aEnd;
}
