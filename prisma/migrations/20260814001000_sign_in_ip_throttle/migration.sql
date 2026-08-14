-- UAT-HF P10.07 — per-source-IP sign-in throttle.
--
-- Mirrors the per-account throttle on "User" (DEF-002): the counter lives in the
-- database so the control is consistent across every serverless instance. One
-- row per address, rolled in place, so the table is bounded by distinct
-- addresses seen rather than by attempts made.

-- CreateTable
CREATE TABLE "SignInIpThrottle" (
    "ipAddress" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "blockedUntil" TIMESTAMP(3),
    "totalFailures" INTEGER NOT NULL DEFAULT 0,
    "totalBlocks" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignInIpThrottle_pkey" PRIMARY KEY ("ipAddress")
);

-- CreateIndex
CREATE INDEX "SignInIpThrottle_updatedAt_idx" ON "SignInIpThrottle"("updatedAt");

-- CreateIndex
CREATE INDEX "SignInIpThrottle_blockedUntil_idx" ON "SignInIpThrottle"("blockedUntil");
