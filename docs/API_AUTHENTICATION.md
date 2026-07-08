# B2B API authentication & key convention

How the `/api/v1/*` provider-facing surface is authenticated. These conventions
are set in UAT and carry forward to production. Origin: BD-06 (a shipped default
operator secret was a live, unscoped, cross-tenant credential).

## Principles

1. **Every secret is environment-only.** No credential is ever committed. A
   missing secret must **fail closed** — code must never fall back to an
   in-source default, because that default ships as a live, guessable key.
2. **Least privilege.** Prefer per-facility keys scoped to one provider over the
   tenant-wide operator key.
3. **Rotatable.** Any key can be replaced without a code change; the old value
   stops working the instant the new one is live.

A build guard (`scripts/lib/guard-rules.mjs` → `in-source-default-api-secret`,
run in `prebuild` + CI) fails the build if a default auth secret is ever
re-introduced, and `tests/api/api-auth-operator-key.test.ts` proves the operator
channel fails closed.

## Two credential channels

Both are resolved by `getApiCredential()` in [`src/lib/apiAuth.ts`](../src/lib/apiAuth.ts)
and accepted via `Authorization: Bearer <key>` or `x-api-key: <key>`.

### 1. Operator / global integration key — `API_KEY`

- A single strong random value, read from `process.env.API_KEY`. **No default.**
  Unset or empty ⇒ the operator channel is disabled and every call fails closed
  (401). Comparison is constant-time.
- Bound to one tenant via `OPERATOR_TENANT_ID` (see below) so it cannot span
  tenants. Use sparingly — the per-facility channel is preferred.
- Generate: `node scripts/generate-api-key.mjs`
- Set in Vercel (Production, Preview, Development) or `.env`. Rotate by replacing
  the value and redeploying.

### 2. Per-facility HMS key — `mvxk_…` (preferred)

- Provisioned per provider in **/settings** (`ProviderApiKeyService`). Only a
  bcrypt hash is stored; the plaintext is shown **once** at generation.
- Confines every request to that one provider (attribution + entitlement scope),
  independent of `API_KEY`. Revocable per key. Not an env var.

## `OPERATOR_TENANT_ID`

Binds the operator key to a single tenant. When set, operator requests to
eligibility / benefits / claims / preauth are confined to that tenant
(`operatorTenantWhere()`); when unset, the operator key keeps the legacy
tenant-wide scope (safe only while exactly one tenant exists).

- UAT value = the `Medvex` tenant id (the sole tenant; from the `Tenant` table).
- In production, set it to the operator tenant id for that environment.

## Provisioning checklist (new environment)

1. `node scripts/generate-api-key.mjs <env>` → set the value as `API_KEY`.
2. Set `OPERATOR_TENANT_ID` to the environment's operator tenant id.
3. Deploy. Confirm a bogus key → 401 and a valid per-facility key works.
4. Issue per-facility `mvxk_` keys to providers in /settings; keep operator-key
   use to internal/global integrations only.
