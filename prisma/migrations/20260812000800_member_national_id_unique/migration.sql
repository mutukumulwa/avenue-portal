-- UAT-HF P05.01 — the one hard identity constraint (DEC-07).
--
-- ⚠️ GATED. Apply only after
--     npx tsx scripts/reports/member-identity-preflight.ts
-- reports zero collisions. It exits non-zero when any tenant holds two members
-- with the same normalized national ID, and this index will fail on exactly
-- those rows — mid-deploy, after the additive migration has already landed.
--
-- Separate from 20260812000700 on purpose: that one is additive and always
-- safe; this one depends on the state of the data.
--
-- NULLs are distinct in a Postgres unique index, so members with no national ID
-- (newborns under CT-033, and anyone enrolled before an ID was recorded) are
-- unaffected however many of them there are. That is the "unique tenant +
-- non-null national ID only" the plan asks for, with no partial index needed.
--
-- Phone, email and name+DOB are deliberately NOT unique. DEC-07: "Shared
-- household numbers are legitimate and common — a principal and their
-- dependants routinely share one number." Twins share a name and a birthday.

CREATE UNIQUE INDEX "Member_tenantId_nationalIdNormalized_key"
    ON "Member"("tenantId", "nationalIdNormalized");
