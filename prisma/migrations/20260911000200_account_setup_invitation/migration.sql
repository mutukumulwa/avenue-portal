-- Family Hospital UAT plan P05.01 — AccountSetupInvitation.
--
-- A one-time account-setup link replaces the administrator-chosen temporary
-- password (FH-01). Only a SHA-256 hash of the link's token is stored
-- ("tokenHash", unique); the address it went to is kept only as a SHA-256 hash
-- ("emailHash") for per-address rate limiting. Delivery state (PENDING / SENT /
-- FAILED, attempts, a safe failure class) is recorded so a failed send is
-- visible and resendable rather than a false success.
--
-- Additive: a new enum and a new empty table with its indexes and foreign keys
-- (ON DELETE RESTRICT — users and tenants are never deleted). No existing table
-- or row changes.
--
-- Generated with `prisma migrate diff --from-config-datasource --to-schema`
-- against a database carrying every earlier migration: this is the whole diff.

-- CreateEnum
CREATE TYPE "AccountSetupDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AccountSetupInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "issuedVia" TEXT NOT NULL,
    "invitedById" TEXT,
    "deliveryStatus" "AccountSetupDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSetupInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountSetupInvitation_tokenHash_key" ON "AccountSetupInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountSetupInvitation_tenantId_userId_createdAt_idx" ON "AccountSetupInvitation"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountSetupInvitation_invitedById_createdAt_idx" ON "AccountSetupInvitation"("invitedById", "createdAt");

-- CreateIndex
CREATE INDEX "AccountSetupInvitation_emailHash_createdAt_idx" ON "AccountSetupInvitation"("emailHash", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountSetupInvitation" ADD CONSTRAINT "AccountSetupInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSetupInvitation" ADD CONSTRAINT "AccountSetupInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

