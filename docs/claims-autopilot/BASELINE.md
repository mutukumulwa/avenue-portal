# Claims Autopilot — Frozen Baseline (F0.1)

**Work package:** F0.1 — Freeze the automated and repository baseline
**Plan:** [`CLAIMS_AUTOPILOT_EXECUTION_PLAN.md`](../../CLAIMS_AUTOPILOT_EXECUTION_PLAN.md) §15 (M0), §16 F0.1
**Captured:** 2026-07-21
**Purpose:** a reproducible starting record that exists *before* any Claims Autopilot behavior change. Do not repair failures here; record them (§16 F0.1 "Do not").

---

## 1. Repository position

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD commit | `c56eaf1001a5ac81429d3a567d827854045cad3b` |
| HEAD subject | `docs(inpatient): A5 executed — six scenarios day-by-day, seven-ledger recon 6/6` |

### `git status --short` at baseline

The working tree carries pre-existing, **unrelated** UAT work that this epic must preserve untouched (§0.1 step 7; §19.5 "an unrelated dirty file must be overwritten" is a stop condition):

- Deleted/modified inpatient UAT templates under `uat/inpatient_longitudinal_2026-07-17/` (template CSVs superseded by run outputs).
- Untracked prior-UAT scripts: `scripts/uat-*.ts` (13 files — boda-cadence, contract-book, member-fixtures, partial-approval, readmission, verify-*, etc.).
- Untracked UAT evidence trees: `uat/inpatient_longitudinal_2026-07-17/runs/**`, `uat/uganda_top50_incident_chain_2026-07-19/**`.
- Untracked `CLAIMS_AUTOPILOT_EXECUTION_PLAN.md` (the specification this epic executes).

**None of the above belongs to Claims Autopilot.** All Claims Autopilot work lands under `src/server/services/claim-intake/`, `src/server/services/claim-autopilot/`, `docs/claims-autopilot/`, `tests/**`, `prisma/schema.prisma`, and named rail files only.

---

## 2. Automated verification (as-found, unmodified)

Commands from §18.2, run 2026-07-21 on the HEAD above.

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS** | No type errors. |
| `npx vitest run` | **PASS** | Test Files: 96 passed / 2 skipped (98). Tests: **791 passed / 9 skipped (800)**. Duration ~8.9 s. |
| `npm run brand:guard` | **PASS** | Brand/secret guard clean. |
| `npm run currency:guard` | **PASS** | 635 source files scanned, no hardcoded KES operational labels. |
| `npm run lint` | not run in this capture | eslint; run at each merge boundary per §18.2. |

This matches the plan's stated baseline (§4.2): "TypeScript passed; 791 tests passed and 9 skipped."

### 2.1 Skipped tests — accounted for

The 9 skipped tests are the two **real-database integration suites**, each guarded by `describe.skipIf(!URL_SET)` where `URL_SET` requires a live `DATABASE_URL`:

- `tests/integration/benefit-race.integration.test.ts` — P1-A concurrent-approval no-double-spend.
- `tests/integration/interim-settlement.integration.test.ts` — IPL-001 seven-ledger conservation.

No `DATABASE_URL` is configured in this environment, so both skip cleanly (expected, not a defect). The same `skipIf(!URL_SET)` gating is the sanctioned pattern for the real-DB packages this epic adds (F2.2, F4.5, F7.4). Their live evidence is captured in prior UAT runs (see §4).

---

## 3. Production data snapshot

**Not run.** No sanctioned read-only production/staging database is configured in this working environment, and the plan forbids running Prisma migrate/reset and discourages ad-hoc production reads (§0.1 step 2; §16 F0.1 step 5 "otherwise state 'not run'"). Production claim-count / creator-count telemetry will be captured during F8.1 against an approved environment.

---

## 4. Relevant prior evidence (linked, not copied)

Per §16 F0.1 step 6, link — do not copy credentials or patient data:

- Inpatient limits/settlement UAT (six-scenario, seven-ledger recon 6/6): `uat/inpatient_longitudinal_2026-07-17/runs/2026-07-18_local_02/`.
- Uganda Top-50 clinical-chain UAT (owned-TPA surface CONDITIONAL GO): `uat/uganda_top50_incident_chain_2026-07-19/`.
- Inpatient technical-debt register (cleared to prod main): `docs/INPATIENT_TECHNICAL_DEBT.md`.

These establish that the existing money spine (intake → adjudicate → maker/checker settle → balanced GL), contract ceiling, benefit/PA holds, fraud gate, and case interim/final reconciliation are live and proven — the "current strengths that must not regress" enumerated in §4.2.

---

## 5. Toolchain facts pinned for this epic

| Concern | Fact |
|---|---|
| Package name | `aicare` (v0.1.0) |
| ORM | Prisma `^7.7.0` with `@prisma/adapter-pg`; **schema is `db push`-managed** — never `migrate dev/reset` (`docs/INSTALL.md` §3). |
| Validation | Zod `^3.24.0`. |
| Money | `decimal.js` `^10.5.0` — mandatory for all money (D-hard-prohibition: no float money). |
| Queue | BullMQ `^5.73.5` + `ioredis`; worker = `tsx src/server/jobs/worker.ts`; heartbeat key `worker:heartbeat` TTL 180s. |
| Framework | Next.js `^15.2.3` — read `node_modules/next/dist/docs/` before route/action/cache changes (AGENTS.md). |
| Test runner | Vitest `^4.1.3`, jsdom env, `@` alias → `./src`, setup `tests/setup.ts`. |
| Schema size | `prisma/schema.prisma` = 6,366 lines (large; additive changes only). |

---

## 6. Baseline verdict

The repository is **green and stable** at `c56eaf1`. No pre-existing failures to split out. Claims Autopilot work proceeds from here in strict dependency order (F0.2 next), keeping this baseline reproducible: every package must leave `typecheck` + `vitest` + both guards green.
