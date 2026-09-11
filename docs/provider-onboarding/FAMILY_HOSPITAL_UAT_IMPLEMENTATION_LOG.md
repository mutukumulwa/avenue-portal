# Family Hospital UAT — implementation log

Executes `FAMILY_HOSPITAL_UAT_REMEDIATION_PLAN.md` (the plan). Decisions live in
`FAMILY_HOSPITAL_UAT_DECISIONS.md`. Evidence lives under `evidence/`.

**Never write a password, setup token, member name, member number, email address or diagnosis
description into this file.** Accounts are referred to by user id and role only.

---

## 1. Baseline (P00.01)

Recorded 2026-09-11.

| Item | Value |
|---|---|
| Starting commit | `3fa01593141f81a0b6d49787ce443e527fd5c764` (`3fa0159`, "docs(providers): trial intake sheet …"). `main` = `origin/main` = this commit. **Note:** the plan's header cites `3fa01593141f6866e5806ee77b9db30f8e2c465b`; that object does not exist in this repository (`git cat-file -t` fails). Only the 7- and 12-character prefixes match; the short SHA `3fa0159` is what the plan and the defect assessment actually inspected. |
| Execution branch / worktree | `codex/family-hospital-uat-remediation`, worktree `.claude/worktrees/family-hospital-uat`, created from `3fa0159`. `node_modules` and `.env` are symlinks to the main checkout (local `aicare_uat` database, never production). |
| Node / npm | v26.3.1 / 11.16.0 |
| Next / React / React DOM | 15.5.15 / 19.2.4 / 19.2.4 |
| Prisma CLI / client | 7.7.0 / 7.7.0 |
| Other | vitest 4.1.3 · zod 3.25.76 · decimal.js 10.6.0 · next-auth 5.0.0-beta.30 · nodemailer 7.0.13 |
| Schema migration head (repo) | `20260814002000_audit_log_nullable_actor` |
| Schema migration head (production) | `20260814002000_audit_log_nullable_actor` — 19 applied, 0 unfinished (`_prisma_migrations`, read-only query) |
| Production application | Vercel project `avenue-portal` (`prj_XtdfOga8W86q0IBYtecB91qlnbTA`); latest production deployment `dpl_Bi2rar91qArSjiKba7omX5E5rStw`, READY, built from `3fa01593141f81a0…` — production runs exactly the baseline. |
| Production database | Supabase project `otivyuroqraiijayvkze` ("AiCare", eu-central-1), Postgres 17.6. Tenant `cmr3ae8v30000nlvqxrqlfn38` (slug `medvex`). |
| Release flags (env, `src/lib/feature-flags.ts`) | Production values not readable with available tooling; code defaults are ENTITLEMENT_ENFORCEMENT off, IMPORT_DURABLE_LEDGER on, LIFECYCLE_COMMANDS on, OFFLINE_SYNC_TYPES on, PACKAGE_APPROVALS on, PRIVACY_REVEAL on. |
| Provider-access flags (`Tenant.config.providerAccess`) | **null** on the production tenant ⇒ all defaults: entitlement enforcement off, remittance V2 off, provider contract view off. |
| SMTP | **Not verified.** Vercel environment values are not readable with available tooling. Code (`notification.service.ts`) silently falls back to `smtp.mailtrap.io` with `test-user`/`test-pass` when `SMTP_HOST` is unset — the fallback P05.02 removes. Must be configured and smoke-tested before any invitation is sent (P08.04 step 3). |
| Worker | Not relied on. Earlier engagement records show the BullMQ worker unprovisioned in production; this remediation delivers invitations with the existing bounded inline sender (`sendEmailNowBounded`), not the queue. |

### Dirty main checkout at start (preserved, untouched)

The main checkout (`codex/uat-hf-remediation`, same commit) carried **77** uncommitted entries:
2 modified (`docs/provider-onboarding/FAMILY_HOSPITAL_TRIAL_INTAKE.md`,
`uat/inpatient_longitudinal_2026-07-17/INPATIENT_LONGITUDINAL_LIMITS_AND_SETTLEMENT_UAT_PLAN.md`),
6 deleted (the `uat/inpatient_longitudinal_2026-07-17/*_TEMPLATE.csv` files) and 69 untracked
(including this plan, `.next`, `outputs/`, `tmp/`, UAT scripts and diagnosis-gate sources). None
was reset, cleaned, stashed, or deleted. This work runs in the separate worktree above; the plan
file was **copied** (not moved) into it.

---

## 2. Task register

Status values: `NOT_STARTED` · `IN_PROGRESS` · `DONE` · `BLOCKED (<gate>)` · `READY — awaits approval`.

| Task | Status | Commit | Notes |
|---|---|---|---|
| P00.01 Implementation record | DONE | see §3 | this file + decisions file |
| P00.02 Credential containment | READY — awaits approval | | exposed accounts identified; production mutation needs explicit approval |
| P00.03 Freeze unreliable UAT records | DONE | see §3 | 4 claims + 1 pre-auth frozen, register marked, UAT paused |
| P01.01 Read-only tariff preflight | DONE | see §3 | production result **NO-GO (G2)** → P01.02 required |
| P01.02 Attach/reimport safely | IN_PROGRESS | see §3 | manifest reviewed-ready; rehearsal proven; production apply awaits approval |
| P01.03 Standalone-tariff semantics | IN_PROGRESS | see §3 | readers aligned; catalogue parity test lands with P02.03 |
| P02.01 Provider case-context resolver | NOT_STARTED | | |
| P02.02 Member resolution surface | NOT_STARTED | | |
| P02.03 Provider-scoped service catalogue | NOT_STARTED | | |
| P02.04 Revalidate selected tariffs on submit | NOT_STARTED | | |
| P03.01 Provider member field | NOT_STARTED | | |
| P03.02 Diagnosis combobox | NOT_STARTED | | |
| P03.03 Category-first service combobox | NOT_STARTED | | |
| P03.04 Shared money input | NOT_STARTED | | |
| P03.05 Shared date and benefit fields | NOT_STARTED | | |
| P04.01 New claim | NOT_STARTED | | |
| P04.02 Correction and resubmission | NOT_STARTED | | |
| P04.03 New and amended pre-auth | NOT_STARTED | | |
| P04.04 Eligibility | NOT_STARTED | | |
| P04.05 Terminology completeness | NOT_STARTED | | DEC-FH-03 |
| P05.01 Account-setup token | NOT_STARTED | | |
| P05.02 Deliver invitations | NOT_STARTED | | |
| P05.03 Complete account setup | NOT_STARTED | | |
| P05.04 One canonical invitation service | NOT_STARTED | | |
| P06 Provider navigation | NOT_STARTED | | |
| P07.01 Clean up affected claims/pre-auths | NOT_STARTED | | DEC-FH-04 + production approval |
| P07.02 Fresh Family UAT fixtures | NOT_STARTED | | |
| P08.01 Automated coverage | NOT_STARTED | | |
| P08.02 Local verification | NOT_STARTED | | |
| P08.03 Browser verification matrix | NOT_STARTED | | |
| P08.04 Deployment sequence | NOT_STARTED | | reviews + production approval |
| P08.05 Rollback | NOT_STARTED | | |

---

## 3. Work units

Each completed task gets an entry in the plan §10 template. Commands that touched production are
marked **[PROD, read-only]**; none of the work below wrote to production.

### P00.01 — Implementation record

```text
Task ID:                 P00.01
Defects covered:         (record-keeping for all FH-xx)
Starting/ending SHA:     3fa01593141f81a0b6d49787ce443e527fd5c764 → first commit on codex/family-hospital-uat-remediation
Files changed:           docs/provider-onboarding/FAMILY_HOSPITAL_UAT_{IMPLEMENTATION_LOG,DECISIONS}.md,
                         docs/provider-onboarding/FAMILY_HOSPITAL_UAT_REMEDIATION_PLAN.md (copied verbatim)
Schema migration/backfill: none
Read-only preflight artifact: n/a
Automated tests added/changed: none
Commands and results:    node/npm/package versions and prisma migration head recorded in §1;
                         [PROD, read-only] _prisma_migrations head, Tenant.config.providerAccess;
                         Vercel get_project/list_deployments (production = 3fa0159, READY)
Browser scenarios and evidence paths: n/a
Feature/config changes:  none
Data mutations and operation IDs: none
Rollback tested:         n/a
Residual risk:           production SMTP and FLAG_* values not readable here — must be confirmed in P08.04
Reviewer/sign-off:       pending
```

### P00.02 — Credential containment (identification done; mutation awaits approval)

Exposure established from the email PDF (three plaintext passwords) and **[PROD, read-only]**
`User`/`AuditLog` queries. Accounts by id and role only:

| Account | Role | Exposed in | State (2026-09-11) | Exposed credential still valid? |
|---|---|---|---|---|
| `cmsss2cx60000devql25r1mlu` | PROVIDER_FACILITY_ADMIN | 19 Aug email (to the facility owner only); quoted in later CC'd replies | `mustChangePassword=false`; audit `PASSWORD_CHANGED_FIRST_LOGIN` 2026-08-21 18:44 UTC | **No** — replaced on first sign-in two days after issue and before the 28 Aug CC exposure. No action required; sessions are the owner's own. |
| `cmtcjniby00006fvqk38dm52i` | PROVIDER_BILLER | 28 Aug email (To owner, CC two further addresses) | never signed in, `mustChangePassword=true`; one `AUTH_SIGN_IN_FAILED` (BAD_PASSWORD) 2026-09-10 10:57 UTC | **Yes** |
| `cmtcllhjh00006zvqul8552tl` | PROVIDER_FRONT_DESK | 28 Aug email (same recipients) | never signed in, `mustChangePassword=true` | **Yes** |

Planned containment (not yet executed): for the two never-activated accounts, replace
`passwordHash` with a cost-12 bcrypt hash of 32 random bytes that is never displayed, stored or
logged; keep `mustChangePassword=true`; increment `sessionVersion`; write an audit row containing
only account id, operation id, operator and outcome. Both then stay visibly pending until the P05
invitation reaches them individually. The old email is not forwarded. The corrected front-desk
address is the one already on the account (confirmed by the facility on 2026-08-29 and 2026-09-10).

Also noted for the owner: plaintext copies of the two exposed passwords exist on the operator's
machine (`~/family-healthcare-{shinah,linet}-temp-password.txt`, mode 0600). They become dead values
after containment; deleting them is the owner's call.

### P00.03 — Freeze unreliable UAT records

```text
Task ID:                 P00.03
Defects covered:         FH-13 (and evidence for FH-02)
Starting/ending SHA:     3fa0159 → P00 commit
Files changed:           docs/provider-onboarding/evidence/P00.03-suspect-trial-records.md
Schema migration/backfill: none
Read-only preflight artifact: evidence/P00.03-suspect-trial-records.md
Automated tests added/changed: none
Commands and results:    [PROD, read-only] every Claim / ClaimLine / ClaimIntakeReceipt /
                         ClaimProcessingRun / PreAuthorization / BenefitHold row for provider
                         cmssrwr31000033vqpue454ou → 4 claims (CLM-2026-00308…00311), 1 pre-auth
                         (PA-2026-00007). All 16 claim lines: unitCost = CPTCode.averageCost exactly;
                         0 description hits in Family's tariff; no rule/tariff matched.
Browser scenarios and evidence paths: n/a
Feature/config changes:  none
Data mutations and operation IDs: none (frozen; cleanup is P07.01)
Rollback tested:         n/a
Residual risk:           the records stay RECEIVED / UNDER_REVIEW until P07; they are excluded from
                         every business conclusion by the register entry in the evidence file
Reviewer/sign-off:       pending
```

### P01.01 — Read-only Family tariff preflight

```text
Task ID:                 P01.01
Defects covered:         FH-03
Starting/ending SHA:     P00 commit → P01 commit
Files changed:           scripts/reports/family-hospital-tariff-preflight.ts,
                         scripts/lib/family-hospital-reviewed.ts,
                         src/server/services/contract-engine/tariff-selection.ts (shared with P01.03),
                         src/lib/claim-line-category.ts
Schema migration/backfill: none
Read-only preflight artifact: evidence/P01.01-preflight-2026-09-11T06-40-48-286Z.{md,json}
Automated tests added/changed: tests/services/tariff-selection.test.ts (215),
                         tests/lib/claim-line-category.test.ts (18)
Commands and results:    npm run typecheck → clean
                         [PROD, read-only] DATABASE_URL=<session pooler> npx tsx
                           scripts/reports/family-hospital-tariff-preflight.ts --out
                           docs/provider-onboarding/evidence --expected-logical 4424
                           → exit 2, NO-GO: G1 PASS, G2 FAIL, G3 PASS, G4 PASS, G5 PASS (9/9
                           engine prechecks), G6 PASS
Browser scenarios and evidence paths: n/a
Feature/config changes:  none
Data mutations and operation IDs: none — every query runs in one SET TRANSACTION READ ONLY
                         transaction (the engine precheck is reused as-is; it only reads)
Rollback tested:         n/a
Residual risk:           the expected logical count 4,424 is derived from the DEC-FH-X2 dispositions
                         and needs the owner's review before it counts as "reviewed"
Reviewer/sign-off:       pending
```

Facts proved by the production run: exactly one ACTIVE contract (PC-2026-202, v1 ACTIVE); all
4,451 rows on that contract **and** its current version, active, network-wide, payer-wide, UGX, rate
type FIXED, no null/zero/negative rate, no code, all categorised; effective 2026-08-28 onwards;
tax-inclusive / 30 days / UGX on the contract; balance billing and submission window UNKNOWN. The
only blocker is G2: **30 groups (60 rows) the engine cannot tell apart** — 25 equivalent twins, 5
conflicts — so the engine-resolvable service count is 4,421, not 4,424. (The run on 06:20 UTC by an
earlier, uncommitted revision of the script reported the same verdict; it was superseded by the
06:40 run of the committed revision and removed.)

### P01.02 — Remediation manifest and disposable-database rehearsal

```text
Task ID:                 P01.02
Defects covered:         FH-03 (data), FH-02 (engine parity for Family)
Starting/ending SHA:     P01 commit
Files changed:           scripts/family-hospital-tariff-remediation.ts,
                         scripts/lib/family-tariff-remediation-{plan,apply}.ts,
                         scripts/uat/family-tariff-rehearsal-copy.ts
Schema migration/backfill: none (data only; production apply NOT yet run)
Read-only preflight artifact: evidence/P01.02-manifest-FH-P0102-20260911.{md,json}
Automated tests added/changed: tests/scripts/family-tariff-remediation-plan.test.ts (11)
Commands and results:    [PROD, read-only] dry run --batch-ref FH-P0102-20260911 → exit 0,
                           manifest SHA-256 78982cfa5be38e2d9216c1e3aedb07339eb525ab611897716014009becc8079a:
                           30 groups (25 EQUIVALENT_DUPLICATE, 2 TRUE_DUPLICATE, 2 DISTINCT_BY_UNIT,
                           1 DISTINCT_BY_SYMBOL), deactivate 33, create 6, 4,424 active after,
                           simulated post-state 4,424 selectable / 0 shadowed / 0 ambiguous / 0 collisions
                         Disposable database: Postgres 17 cluster in the session scratchpad
                           (localhost:54331/fh_rehearsal), schema by `prisma migrate deploy`
                           (all migrations), Family configuration + 4,451 tariff rows copied with
                           their real ids by scripts/uat/family-tariff-rehearsal-copy.ts
                           ([PROD, read-only] source); 3 synthetic members + synthetic operator.
                         evidence/P01.02-rehearsal/:
                           1 preflight before → NO-GO G2 (identical to production)
                           2 dry run → SAME manifest hash as production (78982cfa…)
                           3 --apply → APPLIED, 6 created, 33 deactivated (4,457 rows, 4,424 active)
                           4 --apply rerun, same batch → FIRST ATTEMPT FAILED ("current transaction
                             is aborted") with no data change: OperationReceiptService.reserve
                             resolves an existing key by catching a unique violation, which aborts
                             an enclosing Postgres transaction. Fixed by reserving outside the
                             business transaction (the pattern in members/new/actions.ts); rerun →
                             REPLAYED, no writes, counts unchanged
                           5 preflight after apply → PASS, every gate (4,418 original + 6
                             replacements selectable; 33 superseded retained inactive)
                           6 --rollback → ROLLED_BACK: 6 replacements off, exactly 33 rows back on
                           7 --rollback rerun → REPLAYED
                           8 preflight after rollback → NO-GO G2 with the identical pre-state numbers
                           9 re-apply with a new batch (FH-P0102-20260911-R2, hash 75b648eb…) →
                             APPLIED, preflight PASS; both replacement generations retained
                           Receipts: apply SUCCEEDED, rollback SUCCEEDED (ROLLED_BACK:6/33),
                             apply-R2 SUCCEEDED
Browser scenarios and evidence paths: n/a
Feature/config changes:  none
Data mutations and operation IDs: disposable database only. Production: none.
Rollback tested:         YES — on the disposable database, steps 6–8 above
Residual risk:           production apply requires the owner's review of the manifest (hash above)
                         and explicit approval; the Surgical Extraction pair is applied under the
                         blanket lower-price rule but should be confirmed with the facility
Reviewer/sign-off:       pending
```

### P01.03 — Standalone-tariff semantics (in progress)

Done so far (tests: 32 impacted unit suites green, 306 passed / 21 skipped real-DB):

- The engine's candidate query, day bounds, normaliser and code/description selection moved
  verbatim into `contract-engine/tariff-selection.ts`; `engine.ts` calls them (30 existing engine and
  precedence tests unchanged and green).
- `ProviderContractsService.resolveClaimLineRates` now uses the engine's contract match (`precheck`),
  the engine's candidate rows (contract-bound only) and the engine's selection; callers pass the
  claim's branch and `admissionDate ?? dateOfService`. It reports `contractResolution`.
- `ClaimDecisionService.assessCeiling` fails closed on CON-010 (deterministic 0 with a specific
  message). Impact recorded as DEC-FH-X3.
- Tests: `provider-tariff-desc-match` (BD-04) re-pointed at the engine path with unchanged
  assertions; `provider-tariff-client` (G5.4) moved from standalone to contract-bound rows, plus two
  new cases (standalone never prices; CON-010 reported, not picked); `claim-decision.service` gains
  the CON-010 case.

Remaining: the cross-reader parity test including the provider catalogue (P02.03) and the stored
capture snapshot (P02.04).
