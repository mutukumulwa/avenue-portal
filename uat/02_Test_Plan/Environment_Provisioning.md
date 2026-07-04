# Test Environment Provisioning Record — 2026-07-04

## Decision: parallel clean database, not a destructive wipe

**Why a clean environment was necessary:** the shared dev DB (`aicare`) had accumulated months of build-time test artifacts (in-browser E2E leftovers: a wellness program, a clinical case, an offline work code, 2 provider contracts, extra members/claims/groups, a second Client and auto-adjudication policy). It was not a known state.

**Why not wipe in place:** `prisma migrate reset` is **forbidden** on this codebase — the 23 migrations are historical and do not reproduce the schema (recent modules applied via `db push`/hand-written psql; MEDVEX_BUILD_LOG §1). Wiping the only known-good integrated DB would be unrecoverable if the seed proved incomplete. Instead:

1. **Snapshot taken:** `pg_dump -Fc` → `uat/04_Evidence/DB_Snapshots/aicare_pre_uat_2026-07-04.dump` (984 KB). Restores the pre-engagement state at any time.
2. **Clean rebuild in parallel DB `aicare_uat`:** `CREATE DATABASE aicare_uat` → `prisma db push` (schema OK, 587 ms) → `prisma db seed` (full run, no errors) → **gap found:** ServiceCategory (0/47), AdjudicationReasonCode (0/40), OverrideControl (0/16) missing → seeded by the *separate, undocumented-in-README* `npx tsx scripts/seed-reason-codes.ts` (40+16+47 rows + 107 aliases created).
3. **App repointed:** `.env` DATABASE_URL/DIRECT_URL → `aicare_uat` (original preserved as `.env.backup-pre-uat-2026-07-04`).

## State before / after

| | `aicare` (before, untouched) | `aicare_uat` (UAT baseline) |
|---|---|---|
| Users | 15 | 15 |
| Members | 250 | 249 |
| Claims | 761 | 759 |
| Groups | 7 | 6 |
| Providers | 6 | 6 |
| ProviderContract | 2 (dev artifacts) | 0 (to be created via app from real contract data) |
| ClinicalCase / WellnessProgram / OfflineWorkAuthorization | 1/1/1 (dev artifacts) | 0/0/0 |
| ServiceCategory / ReasonCodes / OverrideControls | 47/40/16 | 47/40/16 (via script) |
| ICD10/CPT/CoA/Terminology/FX/Tax/Templates | ✔ | ✔ identical |
| Client | 2 (1 dev artifact) | 1 (Default Client) |

## Risks / assumptions created
- The `aicare_uat` baseline **includes the vendor's Kenyan demo book** (Safaricom/KCB/EABL/Bamburi/Twiga + 249 members + 759 claims). There is no seed path without it (PR-001). Treated as the "ported legacy book" for testing; new UAT entities are created via the UI on top.
- Redis + MinIO are **shared** with prior dev use (queues may hold old jobs; buckets hold old objects). Acceptable; noted for any evidence anomalies.
- Worker must run (`npm run worker`) for time-based behaviour.

## Reproduction (for the next agent)
```bash
psql postgresql://aicare:aicare@localhost:5432/postgres -c "CREATE DATABASE aicare_uat OWNER aicare;"
DATABASE_URL=...aicare_uat DIRECT_URL=...aicare_uat npx prisma db push
DATABASE_URL=...aicare_uat DIRECT_URL=...aicare_uat npx prisma db seed
DATABASE_URL=...aicare_uat DIRECT_URL=...aicare_uat npx tsx scripts/seed-reason-codes.ts
# .env now points at aicare_uat; original in .env.backup-pre-uat-2026-07-04
# restore pre-engagement state: pg_restore -d aicare uat/04_Evidence/DB_Snapshots/aicare_pre_uat_2026-07-04.dump
```

## Findings raised from this phase
- **PR-001** (High): no reproducible clean-install path — migrations unusable, seed mixes demo data, reason-code/taxonomy seeding is a separate undocumented script, prod build does implicit `db push`.
