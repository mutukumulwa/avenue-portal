-- UAT-HF P09.05 / DEC-04 — deterministic provider-rule precedence (DEF-054).
--
-- Four additive columns on PackageProviderEligibility. Every one carries a
-- default, so existing rows keep exactly their current behaviour: priority 0,
-- active, no effective window (= always in force). No backfill is required and
-- no existing decision changes as a result of THIS migration.
--
-- `priority` breaks ties within a specificity rank. Specificity itself is
-- derived at evaluation time (a rule naming a provider outranks a tier rule),
-- not stored, so it cannot drift out of step with the rule it describes.

ALTER TABLE "PackageProviderEligibility"
  ADD COLUMN IF NOT EXISTS "priority"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveTo"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isActive"      BOOLEAN NOT NULL DEFAULT true;
