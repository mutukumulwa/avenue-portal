-- WP-C1 pre-auth attachment — data backfill (TPA_FEEDBACK_WORKPLAN.md).
--
-- The 1:1 Claim.preauthId FK is replaced by the many-per-claim
-- PreAuthorization.claimId FK. Before the schema push drops Claim."preauthId",
-- copy every remaining link onto the PA side so no attachment is lost, and
-- stamp attachedAt from the legacy convertedAt. Idempotent: safe to re-run.
--
-- MUST run BEFORE `prisma db push` applies the column drop. Prod deploys will
-- fail the build on this destructive change by design (scripts/db-sync.mjs);
-- apply this file by hand first, then re-deploy:
--   npx prisma db execute --file prisma/sql/backfill_preauth_attach_wp_c1.sql

-- 0. The new column, added here so this file can run BEFORE the schema push
--    (the push then sees it already exists and only drops Claim."preauthId").
ALTER TABLE "PreAuthorization" ADD COLUMN IF NOT EXISTS "attachedAt" TIMESTAMP(3);

-- 1. Copy claim links onto PAs that don't have one yet. Guarded so the file
--    stays runnable after the push has dropped Claim."preauthId".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Claim' AND column_name = 'preauthId'
  ) THEN
    UPDATE "PreAuthorization" pa
    SET    "claimId" = c.id
    FROM   "Claim" c
    WHERE  c."preauthId" = pa.id
      AND  pa."claimId" IS NULL;
  END IF;
END $$;

-- 2. Stamp attachedAt for all linked PAs missing it (legacy conversions).
UPDATE "PreAuthorization"
SET    "attachedAt" = COALESCE("attachedAt", "convertedAt", CURRENT_TIMESTAMP)
WHERE  "claimId" IS NOT NULL
  AND  "attachedAt" IS NULL;
