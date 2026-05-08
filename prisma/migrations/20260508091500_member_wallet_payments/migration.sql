-- Member wallet / M-Pesa sandbox payment attempts for co-contribution collection.

CREATE TYPE "MemberCoContributionPaymentStatus" AS ENUM (
    'INITIATED',
    'PENDING_CALLBACK',
    'CONFIRMED',
    'FAILED',
    'TIMED_OUT',
    'CANCELLED'
);

CREATE TABLE "MemberCoContributionPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "coContributionTransactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" "MemberCoContributionPaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "idempotencyKey" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "mpesaReceipt" TEXT,
    "resultCode" TEXT,
    "resultDescription" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCoContributionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberCoContributionPayment_checkoutRequestId_key" ON "MemberCoContributionPayment"("checkoutRequestId");
CREATE UNIQUE INDEX "MemberCoContributionPayment_tenantId_idempotencyKey_key" ON "MemberCoContributionPayment"("tenantId", "idempotencyKey");
CREATE INDEX "MemberCoContributionPayment_tenantId_idx" ON "MemberCoContributionPayment"("tenantId");
CREATE INDEX "MemberCoContributionPayment_memberId_idx" ON "MemberCoContributionPayment"("memberId");
CREATE INDEX "MemberCoContributionPayment_coContributionTransactionId_idx" ON "MemberCoContributionPayment"("coContributionTransactionId");
CREATE INDEX "MemberCoContributionPayment_status_idx" ON "MemberCoContributionPayment"("status");
CREATE INDEX "MemberCoContributionPayment_expiresAt_idx" ON "MemberCoContributionPayment"("expiresAt");

ALTER TABLE "MemberCoContributionPayment"
    ADD CONSTRAINT "MemberCoContributionPayment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemberCoContributionPayment"
    ADD CONSTRAINT "MemberCoContributionPayment_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemberCoContributionPayment"
    ADD CONSTRAINT "MemberCoContributionPayment_coContributionTransactionId_fkey"
    FOREIGN KEY ("coContributionTransactionId") REFERENCES "CoContributionTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
