-- CreateEnum
CREATE TYPE "OperationReceiptState" AS ENUM ('RECEIVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "OperationReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" "OperationReceiptState" NOT NULL DEFAULT 'RECEIVED',
    "entityType" TEXT,
    "entityId" TEXT,
    "entityRef" TEXT,
    "resultCode" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OperationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationReceipt_tenantId_state_createdAt_idx" ON "OperationReceipt"("tenantId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "OperationReceipt_tenantId_entityType_entityId_idx" ON "OperationReceipt"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationReceipt_tenantId_actorId_operationType_idempotency_key" ON "OperationReceipt"("tenantId", "actorId", "operationType", "idempotencyKey");

