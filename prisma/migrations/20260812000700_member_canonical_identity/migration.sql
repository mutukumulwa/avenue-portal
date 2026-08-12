-- UAT-HF P05.01 — canonical identity and concurrency fields on Member.
--
-- DEF-030: a member enrolled with "0772555042" is stored as "+256772555042" and
-- then cannot be found by the number they were enrolled with. The run's words:
-- "Storage normalises the local form; search does not."
-- DEF-064: "the dash-less form of the same number returns 0 results" while the
-- dashed form resolves to exactly one member.
--
-- This migration is ADDITIVE ONLY and adds no constraint. The unique index on
-- (tenantId, nationalIdNormalized) is a SEPARATE migration, applied only after
-- scripts/reports/member-identity-preflight.ts reports zero collisions — a
-- unique that fails mid-deploy on real duplicates is worse than no unique.

ALTER TABLE "Member" ADD COLUMN "nationalIdNormalized" TEXT;
ALTER TABLE "Member" ADD COLUMN "phoneNormalized" TEXT;
ALTER TABLE "Member" ADD COLUMN "emailNormalized" TEXT;
ALTER TABLE "Member" ADD COLUMN "memberNumberNormalized" TEXT;
ALTER TABLE "Member" ADD COLUMN "searchNameNormalized" TEXT;
ALTER TABLE "Member" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Backfill. Each expression mirrors its TypeScript counterpart in
-- src/lib/normalize.ts; tests/lib/normalize-parity.test.ts pins them together so
-- the two cannot drift into producing different keys for the same person.

-- normalizeNationalId: trim, uppercase, strip ALL internal whitespace.
UPDATE "Member"
   SET "nationalIdNormalized" = NULLIF(regexp_replace(upper(btrim("idNumber")), '\s+', '', 'g'), '')
 WHERE "idNumber" IS NOT NULL;

-- normalizePhone: Uganda E.164. 0XXXXXXXXX / 256XXXXXXXXX / +256XXXXXXXXX all
-- fold to +256XXXXXXXXX. Anything else stays NULL rather than being stored
-- wrong — an unparseable number is not a phone identity.
UPDATE "Member"
   SET "phoneNormalized" = CASE
     WHEN regexp_replace("phone", '[\s()\-+]', '', 'g') ~ '^0\d{9}$'
       THEN '+256' || substring(regexp_replace("phone", '[\s()\-+]', '', 'g') from 2)
     WHEN regexp_replace("phone", '[\s()\-+]', '', 'g') ~ '^256\d{9}$'
       THEN '+' || regexp_replace("phone", '[\s()\-+]', '', 'g')
     ELSE NULL
   END
 WHERE "phone" IS NOT NULL;

-- normalizeEmail: trim + casefold.
UPDATE "Member"
   SET "emailNormalized" = NULLIF(lower(btrim("email")), '')
 WHERE "email" IS NOT NULL;

-- Member number without punctuation, uppercased: "UX26-2026-00037" -> "UX26202600037".
UPDATE "Member"
   SET "memberNumberNormalized" = NULLIF(regexp_replace(upper("memberNumber"), '[^A-Z0-9]', '', 'g'), '');

-- Search name: first + other + last, casefolded, whitespace collapsed to one space.
UPDATE "Member"
   SET "searchNameNormalized" = NULLIF(
     btrim(regexp_replace(lower(
       coalesce("firstName", '') || ' ' || coalesce("otherNames", '') || ' ' || coalesce("lastName", '')
     ), '\s+', ' ', 'g')), '');

CREATE INDEX "Member_tenantId_phoneNormalized_idx" ON "Member"("tenantId", "phoneNormalized");
CREATE INDEX "Member_tenantId_emailNormalized_idx" ON "Member"("tenantId", "emailNormalized");
CREATE INDEX "Member_tenantId_memberNumberNormalized_idx" ON "Member"("tenantId", "memberNumberNormalized");
CREATE INDEX "Member_tenantId_searchNameNormalized_idx" ON "Member"("tenantId", "searchNameNormalized");
CREATE INDEX "Member_tenantId_nationalIdNormalized_idx" ON "Member"("tenantId", "nationalIdNormalized");
