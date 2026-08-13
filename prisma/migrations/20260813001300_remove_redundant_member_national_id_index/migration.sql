-- UAT-HF P05.06 verification found a pre-existing P05.01 drift:
-- migration 007 created a non-unique index on exactly the same columns that
-- migration 008 then constrained with a unique index. `schema.prisma` correctly
-- models only the unique index, so the first index is redundant and appeared as
-- drift on every fresh migration deployment.
--
-- The unique index remains in place and serves the same tenant + national-ID
-- lookups, so dropping this duplicate does not remove query coverage or the
-- hard identity constraint.

DROP INDEX IF EXISTS "Member_tenantId_nationalIdNormalized_idx";
