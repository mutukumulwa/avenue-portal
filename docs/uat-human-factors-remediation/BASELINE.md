# UAT-HF-20260811-01: remediation baseline

Task **P00.01**. Everything a reviewer needs to reproduce the exact tested/current comparison, plus
the retest owner for every blocked step.

Nothing in this document changes product behaviour. It is a measurement of the starting point,
taken on 2026-08-12 on branch `codex/uat-hf-remediation`.

---

## 1. Build and environment facts

| Fact | Value | How verified |
|---|---|---|
| Source run | `outputs/019fe1e4-8895-7fc3-972b-3968d0231d7c/runs/UAT-HF-20260811-01/` | present on disk |
| Tested build | `53df0ab39815746d4d06c1e65657a5f3540281c4` (`main`) | `RUN_CLOSED.md`; `git cat-file -t 53df0ab` → commit |
| Tested deployment | Vercel `dpl_F3jo8GbcYPGMGfftwBodD2HkfiYK`, team `team_rtu3aHb4QVeumVyh6f2XUqCm` | `RESUME_POINTER.md` |
| Target URL | `https://avenue-portal.vercel.app` | `RESUME_POINTER.md` |
| Analysis workspace | `ff26e3b` on `fix/eligibility-uat-remediation` | `git rev-parse` |
| Remediation branch | `codex/uat-hf-remediation`, created from `ff26e3b` | this branch |
| Run window | 2026-08-11 20:34 EAT → 2026-08-12 12:23 EAT (closed) | `RUN_CLOSED.md` |
| Run timezone | EAT (UTC+03:00) | run documents |
| Node | v26.3.1 | `node -v` |
| npm | 11.16.0 | `npm -v` |
| Next | **15.5.15** | `node -p` on installed package |
| React | 19.2.4 | `node -p` on installed package |
| `eslint-config-next` | **16.2.2** — mismatched against Next 15 | `node -p` on installed package |
| Prisma CLI / client | 7.7.0 / 7.7.0 | `node -p` on installed packages |
| Vitest | 4.1.3 | `node -p` on installed package |
| ExcelJS | 4.4.0 — present, so `DEC-06` is buildable | `node -p` on installed package |
| Prisma migration head | `20260513010000_phase_10_lifecycle` (24 migrations) | `ls prisma/migrations` |
| Feature-flag surface | **none exists** | no flag module in `src/lib`; no `featureFlag`/`FEATURE_FLAG` reference in `src/lib` or `src/server` |
| Timezone constant | **none exists** | no `Africa/Nairobi` or `Africa/Kampala` string anywhere in `src/` |
| Worker topology | 20 job modules under `src/server/jobs/`, run by `npm run worker` (`tsx src/server/jobs/worker.ts`); separate env via `.env.worker.*` | `ls src/server/jobs`; `package.json` |
| Verification scripts | `typecheck`, `lint`, `brand:guard`, `currency:guard` (both run on `prebuild`). **There is no `test` script** — use `npx vitest run`. | `package.json` |

---

## 2. Evidence freeze — VERIFIED UNCHANGED

Plan P00.01 step 4. Independently recomputed rather than trusting the run's own claim.

| Check | Result |
|---|---|
| Registered evidence rows parsed from `04_EVIDENCE_INDEX.md` | 190 |
| SHA-256 recomputed and matching | **190 / 190** |
| Mismatched | **0** |
| Missing from disk | **0** |
| Unique files behind the 190 rows | 187 (three rows legitimately share byte-identical sign-in captures) |
| Files present in `evidence/` | 321 |
| Unregistered supplementary captures | 134 — matches the pack's own stated count |

**The source run is intact and may be treated as authoritative.** It must never be edited; a retest
takes a new run ID and directory.

---

## 3. What the 12 commits since the tested build already changed

`git diff --name-status 53df0ab ff26e3b` → **75 files, +3004 / −331**.

All 12 commits are the eligibility remediation described in `docs/eligibility-remediation/REMEDIATION_PLAN.md`:

| Commit | Phase | Subject |
|---|---|---|
| `0b63845` | — | executable remediation plan for the 2026-08-11 UAT |
| `f97b5b7` | 0 | provider-network seed + backfill + fixtures (GAP-001/002/003) |
| `9e7586e` | 1 | provider onboarding + first-login (GAP-005/006/014) |
| `07c1f97` | 2 | close the fail-open authorization holes (GAP-004/020) |
| `e81651b` | 3 | entitlement-scope every member resolution (GAP-020/024) |
| `094a639` | 4 | auto-decision gate integrity (GAP-021) |
| `4f1050f` | 5 | API-key governance UI + lifecycle (GAP-017/009/018) |
| `bd3b24f` | 6+9 | API-key scope enforcement, tenant confinement & resilience (GAP-009/015/016) |
| `02a62bc` | 7 | input safety (GAP-007/008/010/011/012) |
| `c069dd7` | 8 | frontend correctness (GAP-023/022/019) |
| `62e22a9` | 11 | regression tests for the new helpers + entitlement gate |
| `ff26e3b` | 4 companion | provider practitioner/credential seed (GAP-021) |

### Overlap with this programme — do not reimplement

| HF plan task | Already partly served by | Note |
|---|---|---|
| **P03.01** deploy provider entitlement data before fail-closed evaluation | `f97b5b7` (`prisma/seeds/provider-network.ts`, `scripts/backfill-provider-rbac.ts`, `scripts/uat-eligibility-fixtures.ts`), `ff26e3b` (`scripts/seed-provider-practitioners.ts`) | The seed/backfill/fixture scripts P03.01 asks for **already exist**. P03.01 is now about *running* them and proving zero unresolved gaps, not writing them. |
| **P03.02/P03.03** canonical eligibility contract | `07c1f97`, `e81651b`, `bd3b24f` touch `provider-eligibility` paths, `apiAuth`, `rbac`, and every `/api/v1/*` route | Fail-open holes are closed. The *divergent read paths* the HF run found are not. |
| **P10.01** password/TOTP challenge split | `9e7586e` added `src/app/change-password/**` and `mustChangePassword` | First-login forced change exists; the TOTP challenge split does not. |
| **P04.04** finish or reject every sync entity type | `bd3b24f` modified `src/server/services/sync.service.ts` and `/api/v1/sync` | Scope was tenant confinement, **not** the `SYNCED` default branch. DEF-067 stands. |
| **P01.05** date helpers | `c069dd7` added `src/lib/dates.ts` + `tests/lib/dates.test.ts` | A date helper module already exists — P01.05 must **extend** it, not create a rival. |

---

## 4. The branch does not typecheck — and the plan misdiagnoses why

`npm run typecheck` fails with **5 errors**, all `mustChangePassword`:

```
src/app/(admin)/settings/actions.ts(130,9)   TS2353
src/app/(admin)/settings/actions.ts(301,7)   TS2353
src/app/change-password/actions.ts(54,27)    TS2353
src/lib/auth-credentials.ts(86,11)           TS2353
src/lib/auth-credentials.ts(226,32)          TS2339
```

**Plan §1.2 says the schema does not expose the field. It does.**

| Layer | State |
|---|---|
| `prisma/schema.prisma:338` | `mustChangePassword Boolean @default(false)` — **present**, committed in `9e7586e` |
| Generated Prisma client | **stale** — built 2026-08-11 20:26, before that commit; 0 occurrences of the field |
| `prisma/migrations/**` | **no migration contains the column** |
| Production database | **column absent** — independently corroborated by `RESUME_POINTER.md`, which records the run's provisioner failing until the client was regenerated from `main`'s schema |

So there is no design decision to make in P00.03. The work is: regenerate the client, add the
missing migration, keep the callers. Recorded in `IMPLEMENTATION_LOG.md` under plan corrections.

---

## 5. Schema deployment is not migration-based — this breaks a P00.04 assumption

`npm run build` runs `node scripts/db-sync.mjs && next build`. That script runs **`prisma db push`**
on Vercel production deploys (guarded on `VERCEL_ENV === "production"` and `DIRECT_URL`, and
deliberately without `--accept-data-loss`).

Consequences that P00.04 must confront:

1. **Migrations are not applied in production at all.** The head is `20260513010000_phase_10_lifecycle`,
   dated 2026-05-13 — roughly three months stale. `schema.prisma` is the real authority.
   A migration added for `mustChangePassword` would be correct hygiene but **inert in production**
   until the deployment mechanism changes.
2. **CHECK constraints live outside both.** `prisma/sql/2026-08-10_onboarding_invariants.sql` is, by
   its own header, "their ONLY source of truth", applied by hand over the direct 5432 connection
   because `db push` cannot manage CHECK constraints and the prod pooler on 6543 cannot run DDL.
   It holds three constraints: `caps_family_gte_individual`, `caps_positive`, and
   **`exclusion_owner_xor`**.
3. **The adjacent finding in plan §1.2 is confirmed, and its mechanism is now precise.** `db push`
   manages the FK relation — `SET NULL` on `TreatmentExclusionRule.packageVersionId` when a
   `PackageVersion` is deleted — while the XOR CHECK lives only in the hand-applied SQL. The two
   contradict, so every package-version deletion fails unless its exclusion rules are removed
   first. The run hit this while restoring production state.

P00.04's acceptance criterion — "fresh and upgraded disposable databases converge with zero drift"
via `migrate deploy` — describes a deployment model this repository does not use. **This needs a
signed decision before P00.04 can start**; raised as `DEC-13` in `DECISIONS.md` §2.

---

## 6. The 31 blocked steps, with retest owner

A blocked step is unverified scope, not a pass. Each must be rerun after its blocker clears.

### 6.1 Blocked by a product defect — 21 steps

| Blocker | Steps | Count | Retest after |
|---|---|---|---|
| **DEF-053** eligibility returns nothing for every member | E-002 s1, E-002 s4, E-003 s1, E-003 s4, E-004 s3, E-005 s3, E-008 s4, O-013 s4 | 8 | **P03.01–P03.04**, re-gated by P03.06 |
| **DEF-050** contract detail/list crash | P-002 s4, P-003 s3, P-004 s1, P-004 s2, P-004 s3, P-004 s4, X-005 s3 | 7 | **P02.01–P02.03** |
| **DEF-044** no renewal workflow | L-006 s2, L-006 s4 | 2 | **P08.05** |
| **DEF-046 + DEF-047** endorsements can never be approved | L-007 s4 | 1 | **P08.02–P08.04** |
| **DEF-010** silent lockout, no operator unlock | A-003 s4 | 1 | **P10.02** |
| **DEF-032** newborn cover start unconfirmable | M-009 s4 | 1 | **P05.06** |
| **DEF-074** form renders no in-DOM error elements | X-002 s4 | 1 | **P06.05 / P11.01** |

### 6.2 Blocked by run governance — 3 steps

| Blocker | Steps | Retest after |
|---|---|---|
| **DEF-001** no accountable business / network-fault / data-reset / privacy owner | R-001 s2, R-003 s2, Z-004 s4 | **P00.05** |

### 6.3 Blocked by test-harness or fixture capability — 7 steps

**No product fix can unblock these.** They are recorded here because the plan's P12.05 GO criterion
demands "456/456 terminal with zero blocked", which is unreachable until the harness gains these
capabilities. This is P00.05 scope and is the main reason P00.05 is not merely paperwork.

| Step | Why it blocked | Capability the retest needs |
|---|---|---|
| A-005 s4 | No mailbox available; run rules forbid entering a live reset code | A **mail sink** the run can read, so password-reset completion is provable |
| F-006 s4 | Headless browser had **no download interception**, so the "Download reject list" file could not be retrieved, corrected and re-uploaded | Download interception in the harness |
| Q-003 s4 | Same root cause — filenames are only observable by performing a download | Download interception in the harness |
| E-003 s1, E-003 s3 | **No exhausted-benefit fixture exists** — every controlled member shows Utilised UGX 0, and building one needs adjudicated claims | A seeded exhausted-benefit member (E-003 s1 also carries DEF-053) |
| O-006 s4 | Offline *reload* of an already-rendered page cannot distinguish a service-worker cache hit from surviving DOM | A **cold offline navigation** method, not an offline reload |
| N-006 s1 | Fixture ordering: the workbook consumes controlled member TD-006 before M-001 creates it | Reorder the scenario index so creators precede consumers |
| Q-005 s1 | Condition did not arise — no genuinely disabled control exists in the HR portal | Scenario redesign; arguably **N/A**, not Blocked |

> Note on E-003: step 1 appears in both 6.1 and 6.3 because it carries DEF-053 *and* the fixture
> gap. Clearing DEF-053 alone will not unblock it. Total distinct blocked steps remains 31.

---

## 7. Verification commands for this programme

Per plan rule §2.14. There is no `npm test`.

```bash
npm run typecheck
```

```bash
npx eslint <changed-files>
```

```bash
npx vitest run <test-files>
```

Full `npx vitest run` at phase gates only. Repository-wide `npm run lint` is not usable until
P00.02 excludes `.next`, `.claude/worktrees`, and `outputs` — it currently traverses generated
worktrees and does not finish in useful time.

---

## 8. Working-tree caution

The checkout carries ~70 dirty entries that belong to the user and are **not** part of this
programme: uncommitted planning documents, the `outputs/` evidence tree, ~15 new `scripts/uat-*.ts`,
25 stale `* 2.ts`-style duplicate files, and 7 deleted CSV templates under
`uat/inpatient_longitudinal_2026-07-17/`.

Every commit on this branch stages **named files only**. `git add -A` and `git add .` are forbidden.

The branch was created in place rather than as a separate git worktree. Plan rule §2.3 exists to
stop analysis debris being committed; surgical staging serves that intent, and a separate worktree
would have forced either a duplicated `node_modules` or a symlink that P00.02's dependency
reinstall would corrupt for the main checkout. The 7 tracked-dirty files cannot collide with any
file P00 touches.
