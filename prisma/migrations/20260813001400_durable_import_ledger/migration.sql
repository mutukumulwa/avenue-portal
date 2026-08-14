-- UAT-HF P06.02 — durable member import job and row/family-unit ledger.
--
-- ImportBatch used to mean both "a confirm was reserved" and "the import
-- completed". A process death between those moments therefore replayed zeros as
-- though they were a terminal result. The explicit state machine and normalized
-- ledger make completion reconstructible rather than inferred.

CREATE TYPE "ImportBatchStatus" AS ENUM (
  'UPLOADED', 'PREFLIGHTED', 'QUEUED', 'PROCESSING',
  'SUCCEEDED', 'PARTIAL', 'FAILED', 'UNKNOWN'
);

CREATE TYPE "ImportUnitStatus" AS ENUM (
  'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CONFLICT', 'UNKNOWN'
);

CREATE TYPE "ImportRowStatus" AS ENUM (
  'REJECTED', 'QUEUED', 'PROCESSING', 'ACCEPTED', 'FAILED', 'CONFLICT', 'UNKNOWN'
);

ALTER TABLE "ImportBatch" ADD COLUMN "batchRef"       TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "sourceHash"     TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "status"         "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED';
ALTER TABLE "ImportBatch" ADD COLUMN "acceptedCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "rejectedCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "conflictCount"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "preflightedAt"  TIMESTAMP(3);
ALTER TABLE "ImportBatch" ADD COLUMN "queuedAt"       TIMESTAMP(3);
ALTER TABLE "ImportBatch" ADD COLUMN "processingAt"   TIMESTAMP(3);
ALTER TABLE "ImportBatch" ADD COLUMN "completedAt"    TIMESTAMP(3);
ALTER TABLE "ImportBatch" ADD COLUMN "failureCode"    TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "failureMessage" TEXT;

-- Historical batches have no row provenance. Give every one a stable, opaque
-- reference and preserve its existing SHA-256 idempotency key as source hash.
-- Completed aggregates become synthetic ledger rows below; ambiguous zero-count
-- reservations are UNKNOWN, never falsely SUCCEEDED.
UPDATE "ImportBatch"
   SET "batchRef"   = 'IMP-LEGACY-' || upper(substr(md5("id"), 1, 12)),
       "sourceHash" = "idempotencyKey",
       "status" = CASE
         WHEN "importedCount" + "failedCount" = "totalRows"
              AND "totalRows" > 0
           THEN CASE WHEN "importedCount" > 0 AND "failedCount" > 0 THEN 'PARTIAL'::"ImportBatchStatus"
                     WHEN "importedCount" > 0 THEN 'SUCCEEDED'::"ImportBatchStatus"
                     ELSE 'FAILED'::"ImportBatchStatus" END
         ELSE 'UNKNOWN'::"ImportBatchStatus"
       END,
       "acceptedCount" = "importedCount",
       -- Legacy `failedCount` combined preflight rejects and runtime failures.
       -- Do not invent a more specific classification that the old aggregate
       -- cannot prove; the synthetic row below uses the generic FAILED state.
       "rejectedCount" = 0,
       "completedAt" = CASE
         WHEN "importedCount" + "failedCount" = "totalRows" AND "totalRows" > 0
           THEN "updatedAt"
         ELSE NULL
       END,
       "failureCode" = CASE
         WHEN "importedCount" + "failedCount" = "totalRows" AND "totalRows" > 0 THEN NULL
         ELSE 'LEGACY_OUTCOME_UNKNOWN'
       END,
       "failureMessage" = CASE
         WHEN "importedCount" + "failedCount" = "totalRows" AND "totalRows" > 0 THEN NULL
         ELSE 'This legacy import has no row ledger, so its terminal outcome cannot be proven.'
       END;

ALTER TABLE "ImportBatch" ALTER COLUMN "batchRef" SET NOT NULL;
ALTER TABLE "ImportBatch" ALTER COLUMN "sourceHash" SET NOT NULL;

CREATE UNIQUE INDEX "ImportBatch_batchRef_key" ON "ImportBatch"("batchRef");
CREATE INDEX "ImportBatch_tenantId_status_createdAt_idx"
  ON "ImportBatch"("tenantId", "status", "createdAt");

CREATE TABLE "ImportUnit" (
  "id"             TEXT NOT NULL,
  "batchId"        TEXT NOT NULL,
  "unitKey"        TEXT NOT NULL,
  "principalKey"   TEXT,
  "status"         "ImportUnitStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "leaseOwner"     TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "failureCode"    TEXT,
  "failureMessage" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRow" (
  "id"                TEXT NOT NULL,
  "batchId"           TEXT NOT NULL,
  "unitId"            TEXT,
  "rowNumber"         INTEGER NOT NULL,
  "recordCount"       INTEGER NOT NULL DEFAULT 1,
  "sourceInput"       JSONB NOT NULL,
  "normalizedInput"   JSONB NOT NULL,
  "preflightError"    TEXT,
  "preflightWarnings" JSONB NOT NULL DEFAULT '[]',
  "status"            "ImportRowStatus" NOT NULL,
  "resultEntityType"  TEXT,
  "resultEntityId"    TEXT,
  "failureCode"       TEXT,
  "failureMessage"    TEXT,
  "terminalAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportUnit_batchId_unitKey_key" ON "ImportUnit"("batchId", "unitKey");
CREATE INDEX "ImportUnit_batchId_status_idx" ON "ImportUnit"("batchId", "status");
CREATE INDEX "ImportUnit_status_leaseExpiresAt_idx" ON "ImportUnit"("status", "leaseExpiresAt");
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");
CREATE INDEX "ImportRow_unitId_status_idx" ON "ImportRow"("unitId", "status");

ALTER TABLE "ImportUnit" ADD CONSTRAINT "ImportUnit_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "ImportUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve reconstructible historical aggregates without inventing member PII
-- or result entity IDs. One synthetic unit and up to two synthetic rows are
-- enough for the ledger-derived counts to equal the old batch totals.
INSERT INTO "ImportUnit" (
  "id", "batchId", "unitKey", "status", "completedAt", "createdAt", "updatedAt"
)
SELECT 'legacy-unit-' || "id", "id", 'legacy-summary',
       CASE WHEN "status" = 'SUCCEEDED' THEN 'SUCCEEDED'::"ImportUnitStatus"
            WHEN "status" = 'PARTIAL' THEN 'FAILED'::"ImportUnitStatus"
            WHEN "status" = 'FAILED' THEN 'FAILED'::"ImportUnitStatus"
            ELSE 'UNKNOWN'::"ImportUnitStatus" END,
       "completedAt", "createdAt", "updatedAt"
  FROM "ImportBatch";

INSERT INTO "ImportRow" (
  "id", "batchId", "unitId", "rowNumber", "recordCount", "sourceInput", "normalizedInput",
  "status", "terminalAt", "createdAt", "updatedAt"
)
SELECT 'legacy-accepted-' || "id", "id", 'legacy-unit-' || "id", 1, "importedCount",
       jsonb_build_object('legacySummary', true, 'count', "importedCount"),
       jsonb_build_object('legacySummary', true, 'count', "importedCount"),
       'ACCEPTED'::"ImportRowStatus", "completedAt", "createdAt", "updatedAt"
  FROM "ImportBatch" WHERE "importedCount" > 0;

INSERT INTO "ImportRow" (
  "id", "batchId", "unitId", "rowNumber", "recordCount", "sourceInput", "normalizedInput",
  "preflightError", "status", "failureCode", "failureMessage", "terminalAt",
  "createdAt", "updatedAt"
)
SELECT 'legacy-failed-' || "id", "id", 'legacy-unit-' || "id", 2, "failedCount",
       jsonb_build_object('legacySummary', true, 'count', "failedCount"),
       jsonb_build_object('legacySummary', true, 'count', "failedCount"),
       NULL,
       'FAILED'::"ImportRowStatus", 'LEGACY_AGGREGATE_FAILURE',
       'Individual legacy failure rows and their classifications were not persisted.', "completedAt",
       "createdAt", "updatedAt"
  FROM "ImportBatch" WHERE "failedCount" > 0;

INSERT INTO "ImportRow" (
  "id", "batchId", "unitId", "rowNumber", "recordCount", "sourceInput", "normalizedInput",
  "status", "failureCode", "failureMessage", "createdAt", "updatedAt"
)
SELECT 'legacy-unknown-' || "id", "id", 'legacy-unit-' || "id", 3,
       GREATEST("totalRows" - "importedCount" - "failedCount", 1),
       jsonb_build_object('legacySummary', true), jsonb_build_object('legacySummary', true),
       'UNKNOWN'::"ImportRowStatus", 'LEGACY_OUTCOME_UNKNOWN',
       'This legacy import has no row ledger, so its terminal outcome cannot be proven.',
       "createdAt", "updatedAt"
  FROM "ImportBatch" WHERE "status" = 'UNKNOWN';
