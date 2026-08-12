-- Member in-app notifications for member experience flows.

CREATE TYPE "MemberNotificationType" AS ENUM (
    'PREAUTH_STATUS',
    'PAYMENT_STATUS',
    'BENEFIT_ALERT',
    'RENEWAL_REMINDER',
    'DOCUMENT_AVAILABLE',
    'CLAIM_STATUS',
    'SUPPORT_MESSAGE',
    'SECURITY_ALERT'
);

CREATE TYPE "MemberNotificationPriority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH'
);

CREATE TABLE "MemberNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "MemberNotificationType" NOT NULL,
    "priority" "MemberNotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberNotification_tenantId_idx" ON "MemberNotification"("tenantId");
CREATE INDEX "MemberNotification_memberId_idx" ON "MemberNotification"("memberId");
CREATE INDEX "MemberNotification_memberId_readAt_idx" ON "MemberNotification"("memberId", "readAt");
CREATE INDEX "MemberNotification_tenantId_type_idx" ON "MemberNotification"("tenantId", "type");
CREATE INDEX "MemberNotification_createdAt_idx" ON "MemberNotification"("createdAt");

ALTER TABLE "MemberNotification"
    ADD CONSTRAINT "MemberNotification_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemberNotification"
    ADD CONSTRAINT "MemberNotification_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
