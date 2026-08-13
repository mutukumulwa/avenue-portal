-- UAT-HF P09.01 — DEC-03 change control for package versions (DEF-024).
--
-- "A single underwriter changed a live ACTIVE package (enabled DENTAL at UGX
-- 10,000) and the change took effect immediately as version v5 'Current', with
-- no approval requested, no Draft/Pending/Approved state, and no feedback
-- message of any kind ... the checker sees the same package with the same
-- 'Edit' control, so the checker is a second maker rather than a reviewer."
--
-- The approval engine already existed and demonstrably worked for claim
-- payments; configuration was simply never routed into it. This adds the
-- lifecycle state the routing needs, plus the action type.

CREATE TYPE "PackageVersionStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'REJECTED'
);

ALTER TABLE "PackageVersion" ADD COLUMN "status" "PackageVersionStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PackageVersion" ADD COLUMN "submittedById"   TEXT;
ALTER TABLE "PackageVersion" ADD COLUMN "submittedAt"     TIMESTAMP(3);
ALTER TABLE "PackageVersion" ADD COLUMN "approvedById"    TEXT;
ALTER TABLE "PackageVersion" ADD COLUMN "approvedAt"      TIMESTAMP(3);
ALTER TABLE "PackageVersion" ADD COLUMN "rejectionReason" TEXT;

-- Backfill by current-ness, so existing history keeps meaning something. A
-- DEFAULT of DRAFT would otherwise mark every live version as unapproved and
-- every historical one as never-shipped.
UPDATE "PackageVersion" v
   SET "status" = 'ACTIVE'
  FROM "Package" p
 WHERE p."currentVersionId" = v."id";

UPDATE "PackageVersion" v
   SET "status" = 'SUPERSEDED'
 WHERE NOT EXISTS (SELECT 1 FROM "Package" p WHERE p."currentVersionId" = v."id");

CREATE INDEX "PackageVersion_packageId_status_idx" ON "PackageVersion"("packageId", "status");

-- The engine's action type. PACKAGE_VERSION_ACTIVATION joins CLAIM_PAYMENT and
-- the two config types (AUTO_ADJ_POLICY_CHANGE, CLINICAL_PROTOCOL_CHANGE) that
-- were already routed through the matrix.
ALTER TYPE "ApprovalActionType" ADD VALUE IF NOT EXISTS 'PACKAGE_VERSION_ACTIVATION';
