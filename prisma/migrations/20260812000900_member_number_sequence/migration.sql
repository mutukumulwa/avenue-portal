-- UAT-HF P05.02 — atomic member numbering.
--
-- `nextMemberNumber` was max-plus-one: read the highest number, add one, write.
-- Two enrolments running at once read the same maximum, mint the same number,
-- and the unique on (tenantId, memberNumber) turns the race into a P2002 in the
-- operator's face. The constraint was holding the line, not preventing the bug.
--
-- One row per (tenant, prefix, year). Allocation is a single
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING, atomic without a transaction,
-- an advisory lock, or a retry loop.

CREATE TABLE "MemberNumberSequence" (
    "id"        TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "prefix"    TEXT         NOT NULL,
    "year"      INTEGER      NOT NULL,
    "lastValue" INTEGER      NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNumberSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberNumberSequence_tenantId_prefix_year_key"
    ON "MemberNumberSequence"("tenantId", "prefix", "year");
CREATE INDEX "MemberNumberSequence_tenantId_idx"
    ON "MemberNumberSequence"("tenantId");

ALTER TABLE "MemberNumberSequence"
    ADD CONSTRAINT "MemberNumberSequence_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed each series from the highest number ALREADY minted, so the allocator can
-- never hand out a live number. The suffix is taken numerically, not lexically:
-- past 99999 the zero-pad widens and '…-100000' sorts BEFORE '…-99999' as text,
-- which would collapse the maximum and re-mint numbers that are in use. This is
-- the same trap `maxByNumericSuffix` exists to avoid on the read path.
INSERT INTO "MemberNumberSequence" ("id", "tenantId", "prefix", "year", "lastValue", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "tenantId",
    split_part("memberNumber", '-', 1)                       AS prefix,
    split_part("memberNumber", '-', 2)::int                  AS year,
    MAX(split_part("memberNumber", '-', 3)::int)             AS "lastValue",
    CURRENT_TIMESTAMP
  FROM "Member"
 WHERE "memberNumber" ~ '^[A-Z][A-Z0-9]{2,5}-[0-9]{4}-[0-9]+$'
 GROUP BY "tenantId", split_part("memberNumber", '-', 1), split_part("memberNumber", '-', 2)::int;
