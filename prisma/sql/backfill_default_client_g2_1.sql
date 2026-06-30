-- G2.1 multi-client tenancy — data backfill.
--
-- Creates exactly one default Client per Tenant (the operator's directly
-- administered book) and points every existing scheme (Group) at it, so the new
-- client-scoped model has no orphan schemes. Idempotent: safe to re-run.
--
-- Run with:
--   npx prisma db execute --file prisma/sql/backfill_default_client_g2_1.sql \
--     --schema prisma/schema.prisma

-- 1. One default Client per Tenant. Deterministic id ('cl_' || tenant id) keeps
--    the insert idempotent and the mapping traceable.
INSERT INTO "Client" (
  id, "operatorTenantId", type, name, slug, currency,
  status, "isActive", "effectiveFrom", "createdAt", "updatedAt"
)
SELECT
  'cl_' || t.id,
  t.id,
  'INSURER'::"PayerType",
  t.name || ' — Default Client',
  'default',
  'UGX',
  'ACTIVE'::"ClientStatus",
  true,
  now(), now(), now()
FROM "Tenant" t
ON CONFLICT (id) DO NOTHING;

-- 2. Point every scheme that has no client yet at its tenant's default Client.
UPDATE "Group"
SET "clientId" = 'cl_' || "tenantId"
WHERE "clientId" IS NULL;
