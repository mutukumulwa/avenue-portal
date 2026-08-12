-- ============================================================================
-- Onboarding invariants — last-line-of-defense CHECK constraints (SP-4).
-- WP-0.1 / DEF-027 (the run-03 stop-line). Plan:
--   uat/UAT_ELIGIBILITY_REMEDIATION_EXECUTION_PLAN_2026-08-10.md §3 SP-4, §4.
--
-- CHECK constraints are NOT expressible in the Prisma schema, so `prisma db
-- push` will never manage them — this file is their ONLY source of truth. It is
-- idempotent (guarded `IF NOT EXISTS` blocks); safe to re-run.
--
-- TABLE NAME NOTE: the Prisma model `AnnualCoContributionCap` has no `@@map`,
-- so the physical table is "AnnualCoContributionCap" (NOT the
-- "PackageCoContributionCaps" placeholder used in the plan's example SQL —
-- corrected here after reading prisma/schema.prisma:5384).
--
-- APPLY (deploy step — do NOT run against prod/UAT from CI). Use the DIRECT
-- (5432) connection; the prod pooler on 6543 cannot run DDL:
--   DATABASE_URL=<direct 5432 url> \
--     npx prisma db execute --file prisma/sql/2026-08-10_onboarding_invariants.sql \
--       --schema prisma/schema.prisma
--
-- BEFORE APPLYING: run each preflight audit below. Every one MUST return zero
-- rows. Any row is a pre-existing violation (expected only as UAT leftovers —
-- run-03 restored 300,000 / 600,000) that must be repaired through a governed
-- flow (with reason + audit) before the constraint can be added. Record the
-- audit output in the run log.
-- ============================================================================

-- ── AnnualCoContributionCap: a present family cap must be >= the individual cap
-- preflight audit (MUST return zero rows):
--   SELECT id, "individualCap", "familyCap"
--   FROM   "AnnualCoContributionCap"
--   WHERE  "familyCap" IS NOT NULL AND "familyCap" < "individualCap";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caps_family_gte_individual'
      AND conrelid = '"AnnualCoContributionCap"'::regclass
  ) THEN
    ALTER TABLE "AnnualCoContributionCap"
      ADD CONSTRAINT caps_family_gte_individual
      CHECK ("familyCap" IS NULL OR "familyCap" >= "individualCap");
  END IF;
END $$;

-- ── AnnualCoContributionCap: caps must be strictly positive
-- preflight audit (MUST return zero rows):
--   SELECT id, "individualCap", "familyCap"
--   FROM   "AnnualCoContributionCap"
--   WHERE  "individualCap" <= 0
--      OR  ("familyCap" IS NOT NULL AND "familyCap" <= 0);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caps_positive'
      AND conrelid = '"AnnualCoContributionCap"'::regclass
  ) THEN
    ALTER TABLE "AnnualCoContributionCap"
      ADD CONSTRAINT caps_positive
      CHECK ("individualCap" > 0 AND ("familyCap" IS NULL OR "familyCap" > 0));
  END IF;
END $$;

-- ── TreatmentExclusionRule: exactly ONE owner (package version XOR provider
-- contract) — the Wave 2 rules model's dual-ownership invariant (WP-2.3 /
-- N-012). Enforced in code (resolveExclusionOwner) at every write path; this is
-- the DB backstop. Table is new in this deploy, so no preflight rows can exist;
-- for re-runs the preflight audit (MUST return zero rows) is:
--   SELECT id FROM "TreatmentExclusionRule"
--   WHERE  ("packageVersionId" IS NULL) = ("providerContractId" IS NULL);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exclusion_owner_xor'
      AND conrelid = '"TreatmentExclusionRule"'::regclass
  ) THEN
    ALTER TABLE "TreatmentExclusionRule"
      ADD CONSTRAINT exclusion_owner_xor
      CHECK (("packageVersionId" IS NULL) <> ("providerContractId" IS NULL));
  END IF;
END $$;
