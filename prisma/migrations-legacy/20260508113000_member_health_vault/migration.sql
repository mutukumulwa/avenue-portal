-- Member health vault, vitals, journals, and future explicit sharing.

CREATE TYPE "MemberHealthFileCategory" AS ENUM (
  'LAB_RESULT',
  'RADIOLOGY',
  'PRESCRIPTION',
  'DISCHARGE_SUMMARY',
  'REFERRAL',
  'VACCINATION',
  'CLAIM_SUPPORT',
  'OTHER'
);

CREATE TYPE "MemberHealthJournalType" AS ENUM (
  'NOTE',
  'SYMPTOM',
  'MEDICATION',
  'QUESTION',
  'VOICE_NOTE'
);

CREATE TYPE "MemberHealthVisibility" AS ENUM (
  'PRIVATE',
  'SHARED_WITH_DOCTOR'
);

CREATE TABLE "MemberHealthFile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" "MemberHealthFileCategory" NOT NULL DEFAULT 'OTHER',
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileSize" INTEGER,
  "mimeType" TEXT,
  "capturedAt" TIMESTAMP(3),
  "notes" TEXT,
  "visibility" "MemberHealthVisibility" NOT NULL DEFAULT 'PRIVATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberHealthFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberVitalEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "systolicBp" INTEGER,
  "diastolicBp" INTEGER,
  "heartRate" INTEGER,
  "temperatureC" DECIMAL(65,30),
  "oxygenSaturation" INTEGER,
  "weightKg" DECIMAL(65,30),
  "bloodSugar" DECIMAL(65,30),
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberVitalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberHealthJournalEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "entryType" "MemberHealthJournalType" NOT NULL DEFAULT 'NOTE',
  "noteText" TEXT NOT NULL,
  "audioUrl" TEXT,
  "transcriptText" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "visibility" "MemberHealthVisibility" NOT NULL DEFAULT 'PRIVATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberHealthJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberHealthShare" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sharedByUserId" TEXT NOT NULL,
  "providerId" TEXT,
  "preauthId" TEXT,
  "checkInChallengeId" TEXT,
  "healthFileId" TEXT,
  "journalEntryId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemberHealthShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberHealthFile_tenantId_idx" ON "MemberHealthFile"("tenantId");
CREATE INDEX "MemberHealthFile_memberId_createdAt_idx" ON "MemberHealthFile"("memberId", "createdAt");
CREATE INDEX "MemberHealthFile_memberId_category_idx" ON "MemberHealthFile"("memberId", "category");

CREATE INDEX "MemberVitalEntry_tenantId_idx" ON "MemberVitalEntry"("tenantId");
CREATE INDEX "MemberVitalEntry_memberId_recordedAt_idx" ON "MemberVitalEntry"("memberId", "recordedAt");

CREATE INDEX "MemberHealthJournalEntry_tenantId_idx" ON "MemberHealthJournalEntry"("tenantId");
CREATE INDEX "MemberHealthJournalEntry_memberId_recordedAt_idx" ON "MemberHealthJournalEntry"("memberId", "recordedAt");
CREATE INDEX "MemberHealthJournalEntry_memberId_entryType_idx" ON "MemberHealthJournalEntry"("memberId", "entryType");

CREATE INDEX "MemberHealthShare_tenantId_idx" ON "MemberHealthShare"("tenantId");
CREATE INDEX "MemberHealthShare_memberId_createdAt_idx" ON "MemberHealthShare"("memberId", "createdAt");
CREATE INDEX "MemberHealthShare_providerId_idx" ON "MemberHealthShare"("providerId");
CREATE INDEX "MemberHealthShare_preauthId_idx" ON "MemberHealthShare"("preauthId");
CREATE INDEX "MemberHealthShare_checkInChallengeId_idx" ON "MemberHealthShare"("checkInChallengeId");
CREATE INDEX "MemberHealthShare_healthFileId_idx" ON "MemberHealthShare"("healthFileId");
CREATE INDEX "MemberHealthShare_journalEntryId_idx" ON "MemberHealthShare"("journalEntryId");

ALTER TABLE "MemberHealthFile" ADD CONSTRAINT "MemberHealthFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberHealthFile" ADD CONSTRAINT "MemberHealthFile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemberVitalEntry" ADD CONSTRAINT "MemberVitalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberVitalEntry" ADD CONSTRAINT "MemberVitalEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemberHealthJournalEntry" ADD CONSTRAINT "MemberHealthJournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberHealthJournalEntry" ADD CONSTRAINT "MemberHealthJournalEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_healthFileId_fkey" FOREIGN KEY ("healthFileId") REFERENCES "MemberHealthFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemberHealthShare" ADD CONSTRAINT "MemberHealthShare_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "MemberHealthJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
