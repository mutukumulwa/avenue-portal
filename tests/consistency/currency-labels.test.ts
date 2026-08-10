/**
 * SP-8 / WP-2.1 (DEF-021) — currency-label integrity on the package & tier
 * surface.
 *
 * The platform base currency is UGX; the three hard-coded `KES` labels
 * (`Contribution (KES/yr)` on the package detail + edit screens, and
 * `Contribution Rate (KES/yr)` on the benefit-tiers card) rendered the WRONG
 * currency on a UGX platform. This drift detector fails CI if any user-visible
 * `KES` literal returns to the package/scheme/tier display surfaces, and checks
 * those surfaces bind money to the shared formatter / base-currency source
 * rather than a hard-coded denomination.
 *
 * (The wider KES/UGX-literal sweep across billing/claims/reports — plan §6.10 —
 * ships with those surfaces; this test scopes to the Wave 2 subset.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

/** The package/scheme/tier display surfaces WP-2.1 owns. */
const SURFACE_FILES = [
  "src/app/(admin)/packages/[id]/page.tsx",
  "src/app/(admin)/packages/[id]/edit/PackageEditForm.tsx",
  "src/app/(admin)/packages/[id]/edit/SharedLimitsManager.tsx",
  "src/app/(admin)/packages/builder/page.tsx",
  "src/app/(admin)/packages/[id]/CoContributionRulesManager.tsx",
  "src/components/groups/BenefitTiersCard.tsx",
];

/** Files whose money labels/values must derive from the shared formatter. */
const MUST_USE_FORMATTER = [
  "src/app/(admin)/packages/[id]/page.tsx",
  "src/app/(admin)/packages/builder/page.tsx",
  "src/app/(admin)/packages/[id]/edit/PackageEditForm.tsx",
  "src/components/groups/BenefitTiersCard.tsx",
];

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("WP-2.1 — no hard-coded KES on the package/tier surface (DEF-021)", () => {
  it.each(SURFACE_FILES)("%s contains no user-visible KES literal", (rel) => {
    expect(read(rel).includes("KES")).toBe(false);
  });

  it.each(MUST_USE_FORMATTER)("%s binds money to the shared currency source", (rel) => {
    const src = read(rel);
    expect(src.includes("formatMoney") || src.includes("BASE_CURRENCY")).toBe(true);
  });
});
