-- CreateEnum
CREATE TYPE "DomainEventProjectionState" AS ENUM ('PENDING', 'PROJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "domainEventId" TEXT;

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityRef" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "reasonCode" TEXT,
    "reasonNote" TEXT,
    "correlationId" TEXT,
    "operationReceiptId" TEXT,
    "projectionState" "DomainEventProjectionState" NOT NULL DEFAULT 'PENDING',
    "projectedAt" TIMESTAMP(3),
    "projectionAttempts" INTEGER NOT NULL DEFAULT 0,
    "projectionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainEvent_tenantId_entityType_entityId_occurredAt_idx" ON "DomainEvent"("tenantId", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_projectionState_createdAt_idx" ON "DomainEvent"("projectionState", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_tenantId_eventType_occurredAt_idx" ON "DomainEvent"("tenantId", "eventType", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLog_domainEventId_key" ON "ActivityLog"("domainEventId");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DomainEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Immutability (UAT-HF P01.03) ────────────────────────────────────────────
-- A domain event is the record of what happened. Prisma cannot express "these
-- columns are append-only", so the database enforces it: the projection
-- bookkeeping columns may change, nothing else may, and nothing may be deleted.
--
-- Without this, "immutable" is a comment, and the audit trail the run found
-- missing (DEF-040: a termination and a UGX 1,196,212.33 refund absent from the
-- member's activity log) could be quietly rewritten later.
--
-- Idempotent: safe to re-run.
CREATE OR REPLACE FUNCTION domain_event_is_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DomainEvent is append-only: row % may not be deleted', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."tenantId"           IS DISTINCT FROM OLD."tenantId"
  OR NEW."eventType"          IS DISTINCT FROM OLD."eventType"
  OR NEW."entityType"         IS DISTINCT FROM OLD."entityType"
  OR NEW."entityId"           IS DISTINCT FROM OLD."entityId"
  OR NEW."entityRef"          IS DISTINCT FROM OLD."entityRef"
  OR NEW."actorId"            IS DISTINCT FROM OLD."actorId"
  OR NEW."actorName"          IS DISTINCT FROM OLD."actorName"
  OR NEW."actorRole"          IS DISTINCT FROM OLD."actorRole"
  OR NEW."description"        IS DISTINCT FROM OLD."description"
  OR NEW."occurredAt"         IS DISTINCT FROM OLD."occurredAt"
  OR NEW."payload"::text      IS DISTINCT FROM OLD."payload"::text
  OR NEW."reasonCode"         IS DISTINCT FROM OLD."reasonCode"
  OR NEW."reasonNote"         IS DISTINCT FROM OLD."reasonNote"
  OR NEW."correlationId"      IS DISTINCT FROM OLD."correlationId"
  OR NEW."operationReceiptId" IS DISTINCT FROM OLD."operationReceiptId"
  OR NEW."createdAt"          IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'DomainEvent is append-only: only projection state may change on row %', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS domain_event_append_only ON "DomainEvent";
CREATE TRIGGER domain_event_append_only
  BEFORE UPDATE OR DELETE ON "DomainEvent"
  FOR EACH ROW EXECUTE FUNCTION domain_event_is_append_only();
