-- Dashboard and navigation performance indexes.
-- These target the filters/orderings used by auth-protected dashboards and high-traffic lists.

CREATE INDEX IF NOT EXISTS "Member_tenantId_status_enrollmentDate_idx"
  ON "Member" ("tenantId", "status", "enrollmentDate");

CREATE INDEX IF NOT EXISTS "Member_groupId_status_enrollmentDate_idx"
  ON "Member" ("groupId", "status", "enrollmentDate");

CREATE INDEX IF NOT EXISTS "ActivityLog_groupId_createdAt_idx"
  ON "ActivityLog" ("groupId", "createdAt");

CREATE INDEX IF NOT EXISTS "Invoice_groupId_status_idx"
  ON "Invoice" ("groupId", "status");

CREATE INDEX IF NOT EXISTS "Invoice_tenantId_status_idx"
  ON "Invoice" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Endorsement_groupId_status_idx"
  ON "Endorsement" ("groupId", "status");

CREATE INDEX IF NOT EXISTS "Claim_tenantId_createdAt_idx"
  ON "Claim" ("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Claim_tenantId_status_createdAt_idx"
  ON "Claim" ("tenantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "PreAuthorization_tenantId_status_createdAt_idx"
  ON "PreAuthorization" ("tenantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "FundTransaction_selfFundedAccountId_postedAt_idx"
  ON "FundTransaction" ("selfFundedAccountId", "postedAt");

CREATE INDEX IF NOT EXISTS "FundTransaction_selfFundedAccountId_type_postedAt_idx"
  ON "FundTransaction" ("selfFundedAccountId", "type", "postedAt");
