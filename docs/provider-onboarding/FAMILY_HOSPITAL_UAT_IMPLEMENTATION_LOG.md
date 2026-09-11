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
| P00.02 Credential containment | BLOCKED (owner: "not yet", 2026-09-11) | | exposed accounts identified; two exposed passwords remain valid by owner decision — release gate §13.1 open |
| P00.03 Freeze unreliable UAT records | DONE | see §3 | 4 claims + 1 pre-auth frozen, register marked; withdrawn/cancelled by P07.01 on 2026-09-11 |
| P01.01 Read-only tariff preflight | DONE | see §3 | production result **NO-GO (G2)** → P01.02 required |
| P01.02 Attach/reimport safely | DONE | see §3 | owner approved 2026-09-11; applied to production, receipt `cmtwmk5920000xavq6zrbs74p`; production preflight now PASS |
| P01.03 Standalone-tariff semantics | DONE | see §3 | readers aligned; four-reader parity test green |
| P02.01 Provider case-context resolver | DONE | see §3 | |
| P02.02 Member resolution surface | DONE | see §3 | the eligibility link itself is switched in P04.04 |
| P02.03 Provider-scoped service catalogue | DONE | see §3 | flag `providerTariffCatalog` switched ON for Family only, 2026-09-11 12:49 UTC (P08.04 step 6) |
| P02.04 Revalidate selected tariffs on submit | DONE | see §3 | claims (eee198c) + pre-auth/amendment (2c73ad5); migration `20260911000100` applied to production 2026-09-11 12:29 UTC (P08.04 step 4) |
| P03.01 Provider member field | DONE | see §3 | |
| P03.02 Diagnosis combobox | DONE | see §3 | |
| P03.03 Category-first service combobox | DONE | see §3 | |
| P03.04 Shared money input | DONE | see §3 | |
| P03.05 Shared date and benefit fields | DONE | see §3 | "every form reads the list" is guarded with P04 |
| P04.01 New claim | DONE | see §3 | |
| P04.02 Correction and resubmission | DONE | see §3 | |
| P04.03 New and amended pre-auth | DONE | see §3 | DEC-FH-X4, DEC-FH-X5 |
| P04.04 Eligibility | DONE | see §3 | |
| P04.05 Terminology completeness | DONE | see §3 | DEC-FH-03 = no source: report only, production run saved |
| P05.01 Account-setup token | DONE | see §3 | migration `20260911000200` applied to production 2026-09-11 12:29 UTC; DEC-FH-X7/X8 |
| P05.02 Deliver invitations | DONE | see §3 | production SMTP + `NEXT_PUBLIC_APP_URL` unverified (P08.04 step 3) |
| P05.03 Complete account setup | DONE | see §3 | |
| P05.04 One canonical invitation service | DONE | see §3 | DEC-FH-X6 |
| P06 Provider navigation | DONE | see §3 | DEC-FH-X9 (grouping, for provider UX review) |
| P07.01 Clean up affected claims/pre-auths | DONE — applied to production 2026-09-11 13:08 UTC, operation receipt `cmtwz26hw0000azvq4z9v45gv` | see §3 | DEC-FH-04, DEC-FH-X10; DEC-FH-X11 open |
| P07.02 Fresh Family UAT fixtures | DONE (verified read-only); two actors await setup links (P08.04 step 9) | see §3 | |
| P08.01 Automated coverage | DONE | see §3 | every mandatory case mapped to a test; gaps filled (88276513) |
| P08.02 Local verification | DONE | see §3 | typecheck · vitest · eslint · build:local all pass on 88276513 |
| P08.03 Browser verification matrix | PARTIAL — navigation row done; signed-in rows need a human sign-in | see §3 | the executor does not type passwords; runs at P08.04 step 7 |
| P08.04 Deployment sequence | IN PROGRESS — steps 4–6 and 8 done 2026-09-11 (owner-approved); steps 1–3, 7 and 9 open | see §3 | reviews, SMTP, browser smoke, invites — each awaits the owner |
| P08.05 Rollback | DONE (documented; P01.02 rollback rehearsed) | see §3 | |

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
machine (two `~/family-healthcare-*-temp-password.txt` files, mode 0600). They become dead values
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
Automated tests added/changed: tests/scripts/family-tariff-remediation-plan.test.ts (10; an earlier
                         revision of this entry said 11 — the file has always had 10)
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
Residual risk:           the Surgical Extraction pair is applied under the blanket lower-price rule
                         and should be confirmed with the facility (provider communication, §12)
Reviewer/sign-off:       owner approved the production apply in session, 2026-09-11
```

**Production apply (owner-approved 2026-09-11):**

```text
[PROD, write] DATABASE_URL=<session pooler> npx tsx scripts/family-hospital-tariff-remediation.ts \
  --apply --batch-ref FH-P0102-20260911 \
  --manifest-hash 78982cfa5be38e2d9216c1e3aedb07339eb525ab611897716014009becc8079a \
  --operator-user-id cmr3aezx7000mnlvqgoljdyqi     (the Medvex operations admin account)
→ exit 0, APPLIED; OperationReceipt cmtwmk5920000xavq6zrbs74p (SUCCEEDED / APPLIED);
  6 created, 33 deactivated; in-transaction post-state validation passed.
  Output: evidence/P01.02-production-apply.json
[PROD, read-only] preflight re-run → evidence/P01.01-preflight-2026-09-11T07-19-05-633Z.{md,json}
  → exit 0, PASS on G1–G6: 4,451 original rows (4,418 selectable + 33 superseded, retained
  inactive) + 6 replacements = 4,424 logical services; 0 description-key collisions.
[PROD, read-only] independent SQL check → 4,457 rows / 4,424 active; the 6 replacements active at
  their original rates (Azithromycin 500Mg (Tab) 4,807 / (Vial) 70,000; Rabeprazole 20Mg (Rabeloc)
  (Tab) 1,540 / (Vial) 45,540; Excision … (less than 5 lesions) 270,000 / (more than 5 lesions)
  500,000); 40 audit rows for the batch (6 + 33 + 1); receipt SUCCEEDED; 0 active name collisions.
Rollback (if ever needed): --rollback --batch-ref FH-P0102-20260911 --operator-user-id <id>
  (rehearsed; restores exactly the 33 prior rows and retires the 6 replacements, deletes nothing).
```

### P01.03 — Standalone-tariff semantics

```text
Task ID:                 P01.03
Defects covered:         FH-02, FH-03 (one reader for every pricing surface)
Starting/ending SHA:     2374ab6 → 5442e19 (readers), eee198c (parity test)
Files changed:           src/server/services/contract-engine/{tariff-selection,engine}.ts,
                         src/server/services/provider-contracts.service.ts,
                         src/server/services/claims.service.ts, claim-adjudication.service.ts,
                         claim-decision.service.ts; tests/services/tariff-parity.test.ts
Schema migration/backfill: none
Read-only preflight artifact: n/a
Automated tests added/changed: provider-tariff-desc-match (BD-04) re-pointed at the engine path with
                         unchanged assertions; provider-tariff-client (G5.4) moved to contract-bound
                         rows + 2 cases (standalone never prices; CON-010 reported, not picked);
                         claim-decision.service + CON-010 case; tariff-parity (8, new)
Commands and results:    npm run typecheck → clean; 32 impacted unit suites green at 5442e19
Browser scenarios and evidence paths: n/a
Feature/config changes:  none
Data mutations and operation IDs: none
Rollback tested:         n/a (code only)
Residual risk:           DEC-FH-X3 — 28 standalone rows of 6 seed providers no longer price any claim
Reviewer/sign-off:       pending
```

- The engine's candidate query, day bounds, normaliser and code/description selection moved
  verbatim into `contract-engine/tariff-selection.ts`; `engine.ts` calls them (30 existing engine and
  precedence tests unchanged and green).
- `ProviderContractsService.resolveClaimLineRates` now uses the engine's contract match (`precheck`),
  the engine's candidate rows (contract-bound only) and the engine's selection; callers pass the
  claim's branch and `admissionDate ?? dateOfService`. It reports `contractResolution`.
- `ClaimDecisionService.assessCeiling` fails closed on CON-010 (deterministic 0 with a specific
  message). Impact recorded as DEC-FH-X3.
- `tests/services/tariff-parity.test.ts` feeds one fixture — five Family rows plus three decoys with
  the same service names (a standalone row, a row on another contract, an inactive row) — to the
  provider catalogue, the submit-time canonicaliser, `ProviderContractsService.resolveClaimLineRates`
  and `ContractEngine`, through a mock database that evaluates the engine's real `where` clauses. All
  four select the same row at the same rate; no decoy surfaces in search or is accepted at submit; a
  billed price above the contracted rate is kept while the contracted rate is re-read from the row.

### P02.01 — Provider case-context resolver

```text
Task ID:                 P02.01
Defects covered:         FH-04, FH-02 (currency comes from the contract), FH-12 (benefit validated)
Starting/ending SHA:     2267607 → eee198c
Files changed:           src/server/services/provider-case-context.service.ts (server-only),
                         src/lib/provider-capture-contract.ts (client-safe types),
                         src/lib/provider-benefit-options.ts
Schema migration/backfill: none
Automated tests added/changed: tests/services/provider-case-context.service.test.ts (23)
Commands and results:    npm run typecheck → clean; suite green
Feature/config changes:  none
Data mutations and operation IDs: none (each resolve writes the same ProviderEligibilityCheck evidence
                         row the eligibility screen writes — no new kind of record)
Rollback tested:         n/a (code only)
Residual risk:           none identified beyond P08 review
Reviewer/sign-off:       pending
```

What it does, in the plan's order: permission per purpose (claim / correction / pre-auth /
eligibility); tenant, provider, actor and branches from the session only; branch chosen among the
user's allowed branches (auto when there is one, `BRANCH_REQUIRED` when several, `FORBIDDEN`
otherwise); service date strict `YYYY-MM-DD`, never after the Kampala operating date; member by exact
normalised number inside the entitlement scope; eligibility through `ProviderEligibilityService.check`;
contract through `ContractLifecycleService.precheck` with the member's client. Outcomes are distinct:
`RESOLVED`, `NOT_FOUND` (identical for "no such member" and "not yours" — nothing to enumerate),
`INELIGIBLE` (shown, cannot proceed), `AMBIGUOUS_CONTRACT` (CON-010), `NO_ACTIVE_CONTRACT`,
`FORBIDDEN`, `BRANCH_REQUIRED`, `INVALID` (date or benefit), `UNAVAILABLE`. The DTO carries an opaque member reference, name, masked
number (last four), eligibility state and reason, scheme/package names, branch, contract/version,
currency, service date, benefit, whether the price list is searchable, and the unlisted-service
policy — no DOB, phone, email, address or diagnoses. `handoffFromEligibilityCheck` turns an
eligibility check id (own tenant + provider, ELIGIBLE, under 24 h old, allowed branch) into a
reference that is re-resolved like any other.

### P02.02 — Member resolution without identifiers in URLs

```text
Task ID:                 P02.02
Defects covered:         FH-04
Starting/ending SHA:     2267607 → eee198c
Files changed:           src/app/provider/capture-actions.ts ("use server": resolveCaseContextAction,
                         searchServiceCatalogAction, searchDiagnosesAction — async exports only),
                         src/server/services/capture-telemetry.ts,
                         tests/audit-coverage/catalogue.ts (the three actions are READ_ONLY)
Schema migration/backfill: none
Automated tests added/changed: covered by the resolver suite and tests/components/provider-member-field
Commands and results:    typecheck clean; audit-coverage suite green
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           the eligibility page's "File a claim" link still carries ?memberId= until P04.04
Reviewer/sign-off:       pending
```

Server Actions are POSTs; the member number travels in the request body only. Every action
re-authenticates and rebuilds the provider context (`ProviderAccessService.resolveUserContext`); a
`ProviderAccessError` becomes a safe `FORBIDDEN` result, and Next's redirect is re-thrown. Telemetry is
one structured line per call with a whitelist of keys (correlation id, tenant/provider/actor ids,
purpose, outcome, reason code, duration, counts) — never a member number, name or query text.

### P02.03 — Provider-scoped service catalogue

```text
Task ID:                 P02.03
Defects covered:         FH-02, FH-06, FH-07 (server side)
Starting/ending SHA:     2267607 → eee198c
Files changed:           src/server/services/provider-service-catalog.service.ts (server-only),
                         src/server/services/provider-access-settings.service.ts (flag),
                         src/lib/tariff-display.ts (unit label; the "Unit: Vial" parser, moved
                         verbatim from the P01.02 planner — same regex, so the manifest is unchanged),
                         scripts/lib/family-tariff-remediation-plan.ts (delegates to it)
Schema migration/backfill: none
Automated tests added/changed: tests/services/provider-service-catalog.service.test.ts (21),
                         tests/services/provider-access-settings.test.ts (+3),
                         tests/services/provider-eligibility.service.test.ts (parse shape gains the
                         two new flag fields)
Commands and results:    typecheck clean; suites green
Feature/config changes:  NEW Tenant.config.providerAccess.providerTariffCatalog (global) and
                         tariffCatalogProviderIds (allow-list) — default OFF, not set anywhere yet
Data mutations and operation IDs: none
Residual risk:           the index is cached per server instance for 60 s (never on submit, which
                         always re-reads); a deactivation shows in search within a minute
Reviewer/sign-off:       pending
```

Rows come from `loadCandidateTariffs` — the engine's own query — and are judged by the shared
`TariffResolutionIndex`: a row the engine would shadow or cannot tell apart is listed but
unselectable, with the reason; a missing rate, a non-FIXED/PER_DIEM rate type or a currency other than
the contract's is unselectable too. Search needs two meaningful characters, is inside the chosen
category, matches description first and code second, ranks deterministically and caps at 20 (50
max). When nothing matches in the category the response names the categories where it did match. No
`CPTCode.averageCost` is read. 120 searches a minute per user (the repository's in-memory limiter, so
per server instance); beyond that the action refuses and writes one
`PROVIDER_CATALOGUE_SEARCH_THROTTLED` audit row per window, not one per keystroke.

With the flag OFF (today, everywhere) the catalogue refuses searches and the case says so: lines are
captured by description with "Contract rate unavailable — manual review" — the plan's P08.05 rollback
state — and never with a global price.

### P02.04 — Revalidate every selected tariff on submission (claims done; pre-auth with P04.03)

```text
Task ID:                 P02.04
Defects covered:         FH-02, FH-07 (authority)
Starting/ending SHA:     2267607 → eee198c
Files changed:           prisma/schema.prisma, prisma/migrations/20260911000100_claim_line_selected_tariff/,
                         src/server/services/provider-service-catalog.service.ts (canonicalizeLines),
                         src/server/services/claim-intake.ts, claim-intake/persist.ts,
                         claim-replacement/{submission,service}.ts, claim-resubmission/submit.service.ts,
                         claim-decision.service.ts
Schema migration/backfill: ADDITIVE — ClaimLine.selectedProviderTariffId TEXT NULL, index, FK →
                         ProviderTariff ON DELETE RESTRICT. No backfill (existing lines stay null =
                         "not captured from the price list"). Generated with prisma migrate diff
                         against a throwaway database carrying every earlier migration. NOT applied
                         to the local shared database or production; production sizing read-only:
                         64 ClaimLine rows.
Automated tests added/changed: claim-intake-persist (+3), claim-decision.service (+1),
                         provider-service-catalog (canonicaliser cases), tariff-parity
Commands and results:    npx prisma generate; typecheck clean; suites green
Feature/config changes:  none
Data mutations and operation IDs: none
Rollback tested:         not yet — the migration is rehearsed with the P08 deployment sequence
Residual risk:           see "shared Prisma client" below
Reviewer/sign-off:       pending (schema/security review, P08.04 step 1)
```

`canonicalizeLines` re-reads every selected tariff id inside the case's contract/version, branch,
client and date, and takes name, category, codes, contracted rate and currency from that row; a
stale, inactive, expired, future, foreign, wrong-category, wrong-currency or unselectable id is a
field error "Select the service again". An unlisted line is allowed only where the contract's policy
allows one (REFER_FOR_REVIEW), needs a plain description, carries no tariff id and no contracted rate,
and — when the catalogue is on — may not be the exact name of a listed service. The billed quantity and
unit price are kept as typed (decimal-validated). Intake persists `selectedProviderTariffId` and the
captured rate in the existing `tariffRate` snapshot through server-built `PersistOrigin` provenance
(a line number the claim does not have is refused); decision-time tariff stamping leaves captured lines
alone. `runClaimIntake` now sums decimals (no float), passes the case currency and the provenance;
replacement and resubmission accept the same.

**Shared Prisma client (side effect to know about).** This worktree's `node_modules` is a symlink to
the main checkout's, so `npx prisma generate` here also regenerated the main checkout's client with
the new `ClaimLine` column. Until the migration is applied to a database, code in the main checkout
that reads `ClaimLine` rows from a database without the column fails with "column does not exist".
Running `npx prisma generate` in the main checkout restores its client (and this worktree must then
regenerate before its own tests).

### P03 — Shared provider form controls

```text
Task IDs:                P03.01–P03.05
Defects covered:         FH-04, FH-05, FH-06, FH-07, FH-09 (control), FH-10, FH-12
Starting/ending SHA:     2267607 → eee198c
Files changed:           src/components/provider/{ProviderMemberField,AsyncCombobox,DiagnosisCombobox,
                         ServiceLineEditor,CaseFields,capture-styles}.tsx/.ts,
                         src/components/forms/MoneyInput.tsx, src/lib/money.ts,
                         src/server/services/provider-diagnosis-search.service.ts,
                         src/app/provider/eligibility/contract.ts (reads the canonical benefit list),
                         vitest.config.ts ("server-only" resolves to Next's empty module in tests)
Schema migration/backfill: none
Automated tests added/changed: tests/components/provider-member-field (10), provider-diagnosis-combobox
                         (8), provider-service-line-editor (11), provider-money-input (8),
                         provider-case-fields (9); tests/lib/money (+ grouping/canonical/format
                         cases, 55 total), provider-benefit-options (3);
                         tests/services/provider-diagnosis-search.service (8)
Commands and results:    typecheck clean; eslint clean on every changed file (one pre-existing
                         warning in provider-access-settings.test.ts); the 15 P01–P03 suites: 253
                         passed; the wider impacted set (claims, contract engine, pre-auth intake,
                         provider services, audit coverage, scripts): 1,030 passed / 326 skipped
                         (real-database suites that self-skip without a test database)
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           none of these controls is on a page yet — P04 wires them
Reviewer/sign-off:       pending (provider UX review, P08.04 step 1)
```

- **Member field (P03.01):** states empty, resolving, eligible, ineligible, not found, stale,
  unavailable, forbidden-safe, branch-required — each in words, not colour; result in an `aria-live`
  region; the error takes focus after an explicit lookup. Looks up on "Find member" or on leaving the
  box with a plausible number, never per keystroke; a date or benefit change makes the case stale; a
  superseded reply is ignored. Testing found a real defect in the first cut — a successful lookup
  re-ran the mount-time lookup (a second evidence row); fixed, with a regression test.
- **Diagnosis combobox (P03.02):** one shared WAI-ARIA combobox (`AsyncCombobox`) — two characters,
  debounce, request sequence guard, arrows/Home/End/Enter/Escape, clear button; code, description and
  category only. The server searches `ICD10Code` by every word across code, description and category,
  selects no price column, caps at 20, and re-validates the code at submit.
- **Service line editor (P03.03):** category → search inside it → read-only unit/codes → quantity →
  billed price (suggested from the contract, editable) → contracted rate (a separate fact) → line
  total and pre-authorisation warning. A category change remounts the search and clears a selection
  from another category; an unselectable row is visible but disabled; "Service not on the price list"
  gives a description-first line labelled for manual review. The submission shape is the tariff id,
  category, quantity and billed price — never a rate, name or currency.
- **Money (P03.04):** `600000`, `600,000`, `600 000` (space, NBSP, narrow NBSP) accepted consistently;
  mixed or wrong grouping, negatives, letters, too many decimals refused with a reason; formatted
  `en-UG` on blur; invalid text left as typed; canonical decimal string for submission.
- **Date and benefit (P03.05):** the date field shows the server's Kampala date and uses it as `max`;
  the test pins 21:00–23:59 UTC, where the old `toISOString()` default showed yesterday. One benefit
  list derived from the enum (CUSTOM hidden, DEC-FH-02) with the admin form's labels.

### P04.01 — New claim

```text
Task ID:                 P04.01
Defects covered:         FH-02, FH-04, FH-05, FH-06, FH-07, FH-09, FH-10, FH-12
Starting/ending SHA:     eee198c → 2c73ad5
Files changed:           src/app/provider/claims/new/{page.tsx,ProviderClaimForm.tsx,actions.ts},
                         src/server/services/provider-claim-capture.service.ts (new, server-only),
                         src/components/provider/claim-form-support.ts (new),
                         src/components/provider/{ServiceLineEditor,ProviderMemberField}.tsx,
                         src/lib/provider-capture-contract.ts, src/server/services/claim-intake.ts
Schema migration/backfill: none (uses eee198c's column)
Automated tests added/changed: tests/services/provider-claim-capture.service.test.ts (21),
                         tests/actions/provider-claim-submit-action.test.ts (7),
                         tests/components/provider-claim-form.test.tsx (7)
Commands and results:    typecheck clean; eslint clean on changed files; suites green
Browser scenarios and evidence paths: P08.03
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           the page shows the price-list search only when providerTariffCatalog is on
                         for the facility (default OFF, P08.04 step 6); until then lines are
                         described and priced by hand, labelled "Contract rate unavailable —
                         manual review"
Reviewer/sign-off:       pending
```

- **Page:** no ICD/CPT preload; the default date is `operatingTodayISO()` computed on the server;
  `?from=<eligibility check id>` is read under the user's tenant and provider and re-resolved (the
  old `?memberId=` prefill is gone).
- **Form:** member field, Kampala date, benefit list, service type, clinician, diagnosis search,
  category-first service lines, error summary linking every field (line errors link to the
  line's own control). Services open only for an eligible, resolved case; a new case on another
  contract/branch clears price-list selections with a notice; search boxes remount per case so no
  result from an old case survives. Submission is locked while pending; the draft key (an
  `op_…` operation id) is renewed after any refusal that saved nothing and kept after an unknown
  outcome, so a retry replays rather than files twice.
- **Action:** `ProviderClaimCaptureService.prepare` re-resolves the case for purpose CLAIM (the
  browser cannot choose the purpose), refuses anything but RESOLVED (§8.2 item 4: an ineligible
  member, a member not in the facility's scope, a contract other than the one the form priced
  with), re-reads the diagnosis from the catalogue and canonicalises every line. The decimal
  duplicate soft-block (BD-02) stays. `runClaimIntake` gets the server's member, branch, benefit,
  date, currency and line provenance. A replay of a receipt that produced no claim is no longer
  shown as a filed claim (`receiptState` is now part of the intake outcome). Success revalidates
  the claims list and dashboard and redirects with the claim number — no member reference in any
  URL.
- Kept: ELIG-GAP-019 (a number typed before hydration) moved into the shared member field;
  ELIG-GAP-020 (permission before any lookup); the example member number is the illustrative
  `EXAMPLES.memberNumber` (the old claim form still showed a real client's format, DEF-057).

### P04.02 — Claim correction and resubmission

```text
Task ID:                 P04.02
Defects covered:         FH-02, FH-05, FH-06, FH-07, FH-11 (correction/resubmission path), FH-12
Starting/ending SHA:     eee198c → 2c73ad5
Files changed:           src/app/provider/claims/[id]/correct/{page.tsx,CorrectClaimForm.tsx,actions.ts},
                         src/app/provider/claims/[id]/resubmit/{page.tsx,actions.ts},
                         src/server/services/provider-claim-seed.ts (new, server-only),
                         src/server/services/provider-claim-replacement-support.ts (new, server-only),
                         src/server/services/provider-service-catalog.service.ts (carried lines)
Schema migration/backfill: none
Automated tests added/changed: tests/actions/provider-claim-correct-action.test.ts (rewritten, 8),
                         tests/actions/provider-claim-resubmit-action.test.ts (rewritten, 4),
                         tests/components/provider-correct-claim-form.test.tsx (rewritten, 6),
                         tests/services/provider-claim-seed.test.ts (3),
                         tests/services/claim-replacement-submission.test.ts (3),
                         tests/services/provider-service-catalog.service.test.ts (+5 carried-line cases)
Commands and results:    typecheck clean; suites green
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           a correction of a claim whose member is no longer eligible on the
                         claim's date is refused, like any submission (§8.2 item 4)
Reviewer/sign-off:       pending
```

- The three pinned suites were rewritten to the new contract with their F5.8/F5.10 invariants
  kept: the member and provider are never passed to the replacement services (they come from the
  earlier claim); the case is re-resolved for the **earlier claim's** member whatever the form
  sends; confirmation, double-click safety and refresh-on-stale are unchanged. The one invariant
  changed on purpose: the command now carries `providerBranchId` — the branch the SERVER resolved,
  which the services use only when the earlier claim has none (a replacement never changes an
  existing branch; `claim-replacement-submission.test.ts`).
- Lines are seeded from immutable stored data (`provider-claim-seed.ts`): a price-list line as its
  stored selection (name and captured rate); every other line — every claim filed before this
  change — as **"Historical / unlisted"**. An unchanged historical line is sent as "line N,
  unchanged"; the server compares it with the stored line and carries it exactly as it was (no
  re-pricing, stored codes kept). Any real change turns it into an ordinary unlisted line judged
  afresh for the new date and contract; re-formatting "1000" as "1,000" is not a change. An
  earlier claim in another currency cannot be carried — the price must be entered again.
- Errors: unknown failures are UNKNOWN_OUTCOME (never the raw text, which the old actions returned);
  a reused draft key is a conflict; a stale earlier claim refreshes the page.

### P04.03 — New and amended pre-authorisation

```text
Task ID:                 P04.03
Defects covered:         FH-02, FH-04, FH-05, FH-06, FH-07, FH-10, FH-11 (pre-auth path), FH-12
Starting/ending SHA:     eee198c → 2c73ad5
Files changed:           src/app/provider/preauth/new/{page.tsx,ProviderPreauthForm.tsx,actions.ts},
                         src/app/provider/preauth/[id]/{AmendPreauthForm.tsx,actions.ts,page.tsx},
                         src/server/services/provider-preauth-capture.service.ts (new, server-only),
                         src/server/services/preauth-intake/{contract,service}.ts,
                         src/server/services/preauth-adjudication.service.ts,
                         src/server/services/provider-case-context.service.ts (DEC-FH-X5),
                         src/components/provider/CaseFields.tsx (date `max` optional)
Schema migration/backfill: none (provenance lives in the PA's procedures JSON snapshot)
Automated tests added/changed: tests/actions/provider-preauth-action.test.ts (rewritten, 8),
                         tests/actions/provider-preauth-amend-action.test.ts (rewritten, 8),
                         tests/components/provider-preauth-form.test.tsx (3),
                         tests/services/preauth-intake-provenance.test.ts (4),
                         tests/services/preauth-procedure-codes-gate.test.ts (3),
                         tests/services/provider-case-context.service.test.ts (+1)
Commands and results:    typecheck clean; suites green
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           amendments still have no server-side idempotency (unchanged; the form
                         locks while pending)
Reviewer/sign-off:       pending
```

- The form uses the same member field, benefit list, diagnosis search and money parsing as a
  claim; each requested service is priced from the price list in ESTIMATE mode — the contracted
  rate is suggested, the estimate stays editable, and both are shown separately. "600,000" is
  600000 (the old `<input type="number">` read it as empty, so the estimate was 0 — FH-10).
- The action submits through the canonical `PreauthIntakeService` on PROVIDER_PORTAL with the
  member id the server resolved, decimal-text procedures and estimate, and the procedure
  provenance (`selectedProviderTariffId`, `contractedUnitRate`, `currency`) as a new **trusted**
  argument — the intake builds procedures from known fields only, so a payload cannot inject
  provenance (tested). A refused request comes back as field errors, and the form renews its
  draft key: before, a corrected resend with the same key was an uncaught
  `PreauthIntakeConflict`.
- Amendments are prepared for the parent's member, date and benefit (fixed by the server) and
  stored in the intake's procedure shape with the same provenance; the additional cost is decimal
  text. That made the auto-decision's `p.code`-only reader visibly wrong — DEC-FH-X4.
- The PA detail page shows stored decimals (no float rounding), the snapshot's currency, and the
  contracted rate apart from the estimate.

### P04.04 — Eligibility

```text
Task ID:                 P04.04
Defects covered:         FH-09, FH-12 (labels), the eligibility → claim hand-off
Starting/ending SHA:     eee198c → 2c73ad5
Files changed:           src/app/provider/eligibility/{page.tsx,EligibilityCheckForm.tsx}
Schema migration/backfill: none
Automated tests added/changed: tests/components/provider-eligibility-form.test.tsx (5)
Commands and results:    suites green (the existing action suite unchanged and green)
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           none identified
Reviewer/sign-off:       pending
```

The server's behaviour is untouched (plan step 3). The date box shows `operatingTodayISO()` from
the server with a "Kampala date" hint; the entered date and benefit survive an input error or a
request that never came back (the latter is shown as "could not check", not a crash). The benefit
select had a latent reset bug — React resets a form after its action and a `<select>` returns to
the option chosen at mount — fixed by remounting on the submitted value. Benefit labels come from
the canonical module. "File a claim" now links `?from=<check id>` (opaque, expiring, tenant- and
provider-scoped, re-resolved by P02) instead of `?memberId=`.

### P04.05 — Terminology completeness (DEC-FH-03: no approved source)

```text
Task ID:                 P04.05
Defects covered:         FH-14
Starting/ending SHA:     eee198c → 2c73ad5
Files changed:           scripts/reports/icd-terminology-coverage.ts (new)
Schema migration/backfill: none — no import (DEC-FH-03)
Read-only preflight artifact: evidence/P04.05-icd-coverage-2026-09-11T08-57-15-411Z.{md,json}
Automated tests added/changed: none (report script; run locally then on production)
Commands and results:    local aicare_uat → same verdict;
                         [PROD, read-only] DATABASE_URL=<session pooler> npx tsx
                           scripts/reports/icd-terminology-coverage.ts --out docs/provider-onboarding/evidence
                           → exit 0. 200 rows; no source, version or active/inactive column; all
                           200 codes are exactly the repository demo seed (prisma/seed.ts); 181
                           three-character categories; no duplicate codes or descriptions;
                           representative set: 20 of 22 exact (B54 present; R50.9 and K35.8 absent)
Feature/config changes:  none
Data mutations and operation IDs: none
Residual risk:           the facility will not find codes outside the 200-code demo set; per
                         DEC-FH-03 this is disclosed for this UAT round (provider communication,
                         P08 / plan §12) and complete ICD-10 coverage is not claimed
Reviewer/sign-off:       pending
```

### P04 — also changed

- `src/app/provider/contracts/[id]/{page.tsx,export/route.ts}`: the provider contract view (dark
  behind `providerContractView`) derived its default "rates as at" date with
  `toISOString().slice(0, 10)` — the UTC day. Now `operatingTodayISO()` (plan §7 "Dates: all
  provider form defaults").
- `tests/consistency/provider-capture-forms.test.ts` (14): the P04 phase acceptance as a ratchet —
  no provider page or component touches `CPTCode`/`averageCost`, preloads ICD codes, renders a
  native diagnosis select/datalist, keeps its own benefit array, derives a calendar date with
  `toISOString()`, or puts `?memberId=`/`?memberNumber=` in a URL; every capture form uses the
  shared member field, line editor and (where it has one) the diagnosis combobox.
- Full suite at this point: `npx vitest run` → 369 files passed / 88 skipped; 4,686 tests passed /
  599 skipped (the skipped suites need a test database — run in P08.01/P08.02).

### P05 — Invitations replace the temporary-password handoff

```text
Task IDs:                P05.01–P05.04
Defects covered:         FH-01
Starting/ending SHA:     2c73ad5 → 43d3a02
Files changed:           prisma/schema.prisma (AccountSetupInvitation + AccountSetupDeliveryStatus),
                         prisma/migrations/20260911000200_account_setup_invitation/,
                         src/server/services/account-invitation.service.ts (new, server-only),
                         src/server/services/provider-user-admin.service.ts (assertGrantablePersona),
                         src/server/services/notification.service.ts (no fallback transport),
                         src/lib/queue.ts (sendEmailBounded + safe failure classes),
                         src/lib/public-origin.ts (new),
                         src/app/(auth)/account-setup/{page.tsx,AccountSetupForm.tsx,actions.ts} (new),
                         src/app/(auth)/login/page.tsx ("account set up" notice),
                         src/app/(admin)/settings/{actions.ts,InviteUserModal.tsx,page.tsx},
                         src/app/provider/users/{actions.ts,page.tsx,ProviderUsersManager.tsx},
                         src/components/users/InvitationStatus.tsx (new),
                         tests/audit-coverage/catalogue.ts
Schema migration/backfill: ADDITIVE — a new enum and a new empty table (indexes, FKs ON DELETE
                         RESTRICT). No existing row changes. Generated with prisma migrate diff
                         against a throwaway database carrying every earlier migration; applied
                         there with `prisma migrate deploy`; the post-apply diff is empty.
Automated tests added/changed: tests/integration/account-invitation.integration.test.ts (9, real DB),
                         tests/actions/account-invitation-actions.test.ts (9),
                         tests/components/account-setup-form.test.tsx (5),
                         tests/components/invitation-admin-ui.test.tsx (5),
                         tests/lib/public-origin.test.ts (4), tests/services/notification-transport.test.ts (3),
                         tests/lib/send-email-bounded.test.ts (+7),
                         tests/components/invite-user-provider-personas.test.tsx (mock gains the resend action)
Commands and results:    typecheck clean; eslint clean; full default suite 374 files / 4,719 tests
                         passed (608 skipped); account-invitation integration 9/9 and the F1.5
                         provider-user-admin DB suite 6/6 against the throwaway database
Browser scenarios and evidence paths: P08.03
Feature/config changes:  none in code; DEPLOYMENT REQUIREMENTS: SMTP_HOST (+ SMTP_PORT, SMTP_USER,
                         SMTP_PASS as the relay needs) and NEXT_PUBLIC_APP_URL (https) must be set —
                         without them every invitation is created and recorded FAILED (CONFIG /
                         ORIGIN) and can be resent once configured
Data mutations and operation IDs: none outside throwaway databases
Rollback tested:         not yet (deployment sequence, P08)
Residual risk:           (1) the TPA "Reset password" modal still lets an administrator choose a
                         temporary password — outside P05's named scope, left as is and flagged;
                         (2) DEC-FH-X6's Admin-can-create-a-biller residual; (3) sending a link to
                         the two exposed Family accounts invalidates their temporary passwords
                         (DEC-FH-X8) — the P00.02 containment happens then, not before
Reviewer/sign-off:       pending (schema/security review, P08.04 step 1)
```

- **Token and account (P05.01).** 256-bit random token, base64url, only its SHA-256 stored (unique
  index); 24-hour expiry (DEC-FH-05); single use enforced by a conditional update, so two parallel
  submissions cannot both succeed. A new account's password is a bcrypt(12) hash of 32 random bytes
  nobody sees, with `mustChangePassword`; account, persona, branches, invitation and the
  `USER_INVITED` audit row are one transaction. Duplicate address: inside the administrator's scope
  the existing account and its pending state are shown with a resend; a facility administrator
  learns nothing about an address used by another facility or by TPA staff. Resend revokes older
  unused links and replaces the account's secret (DEC-FH-X8), rate-limited (DEC-FH-X7).
- **Delivery (P05.02).** After commit, one message to that person, bounded at 8 s, built from
  `NEXT_PUBLIC_APP_URL` (or `NEXTAUTH_URL`) only — never a request header — with the token in the
  URL fragment. The Mailtrap / `test-user` / `test-pass` fallback is gone: without `SMTP_HOST` a send
  is an explicit `EmailConfigurationError` (the test runner alone gets a JSON transport). Status
  PENDING → SENT / FAILED with attempts, last attempt and a safe class (CONFIG, ORIGIN, AUTH,
  CONNECTION, TIMEOUT, REJECTED, UNKNOWN); a mail server's own error text is never logged or stored
  (`sendEmailNowBounded`, used by password reset, now logs the class only — it logged the raw message,
  which can carry an address). The administrator sees "User created; invitation delivery failed —
  resend." Telemetry: `invitation_delivery`, `invitation_activation`.
- **Setup (P05.03).** `/account-setup#token=…`: the client reads the token, removes the fragment with
  `history.replaceState` before anything else, keeps the token in a ref (never state, a field or the
  HTML), asks the server yes/no, then posts password + confirmation with the token. The server checks
  again and, in one transaction, sets the password, clears `mustChangePassword`, spends the link,
  revokes its siblings, bumps `sessionVersion`, clears lockout counters and writes
  `ACCOUNT_SETUP_COMPLETED`; the redirect to `/login?setup=done` is outside every try/catch. Used,
  replaced, expired, altered, suspended-account and cross-tenant links all get one message and a
  "send me a new link" form, which answers identically whatever the address and re-issues only for
  accounts already invited through this service.
- **Surfaces (P05.04).** TPA Settings: no password field, "Send invitation", outcome shown, and for
  every account not yet set up its link state (sent/failed with reason/expired) and "Resend link".
  Facility Users page: "Invite a staff member" (personas and branches the administrator may grant —
  DEC-FH-X6), the same state and resend per account. Both call `AccountInvitationService`.

**Real-database verification (P08.01 groundwork, 2026-09-11).** On a throwaway Postgres 17 with
every migration applied and `prisma/seed.ts` run, all 97 opt-in suites (`AUTOPILOT_TEST_DB`):

- first run: 6 failures only on this branch — autopilot execution/breaker tests refused by contract
  enforcement because the seed's providers had an active contract with no rates attached (their
  rates were standalone). Fixed in the seed, not the tests (DEC-FH-X3 addendum).
- after the seed fix: 90 files / 593 tests pass; 16 tests in 6 files fail, and **the same 16 fail
  on the baseline commit `3fa0159`** (a detached checkout of it, with the same factory fix below, run
  against a database migrated to this branch's head and seeded with the seed as it was):
  claim-intake API (8), autopilot campaign S4/S5 (2), offline sync isolation (1), pre-auth intake (3),
  provider eligibility (1), RBAC catalogue (1). Pre-existing; not touched here.
- test infrastructure fix: `tests/factories/provider-network.ts` created two schemes under one client
  without `nameNormalized`, so every factory-based opt-in suite failed at setup on the unique
  `(clientId, nameNormalized)`; it now computes the value as every scheme create path does.

- seed fix: `prisma/seeds/provider-network.ts` (DEC-FH-X3 addendum).
- test robustness: the four capture-form component suites run several debounced searches per test and
  one timed out once under the full parallel run (never alone); they now allow 5 s per async wait
  (`configure({ asyncUtilTimeout: 5000 })`). No assertion changed.

### P06 — Provider navigation

```text
Task IDs:                P06
Defects covered:         FH-08
Starting/ending SHA:     43d3a02 → 53b70cd
Files changed:           src/components/layouts/provider-nav-model.ts (groups as the information
                         architecture; resolveActiveProviderNavHref),
                         src/components/layouts/ProviderNav.tsx (rewritten),
                         src/app/provider/layout.tsx (passes groups, not a flattened row),
                         src/app/globals.css (scroll offset under the sticky provider header)
Schema migration/backfill: none
Automated tests added/changed: tests/components/provider-nav.test.tsx (16, new),
                         tests/components/provider-nav-model.test.ts (+5, incl. every permission
                         combination), tests/components/portal-identity.test.tsx (provider cases
                         follow the identity into the account menu)
Commands and results:    typecheck clean; eslint clean on the changed files;
                         `npx vitest run tests/components tests/consistency` → 43 files / 401 tests passed
Browser scenarios and evidence paths: below (Chromium in the Browser pane; measured with scripts,
                         not by eye)
Feature/config changes:  none
Data mutations and operation IDs: throwaway database only (a persona assignment and the contract-view
                         flag for one seeded provider in fh_gate_head2 — see "Browser run")
Rollback tested:         not applicable (presentation only; revert the commit)
Residual risk:           keyboard activation of a menu button with Enter/Space could not be
                         injected by the browser tool (its key events carry no text, so no native
                         button fires); the buttons are native <button>s and every other key path
                         (Tab, Escape, arrows) was exercised in the browser. Grouping awaits provider
                         UX review (DEC-FH-X9).
Reviewer/sign-off:       pending (provider UX review, P08.04 step 1)
```

- **Cause.** Every destination (15 for a facility administrator with contracts on), the identity block
  and Logout sat in one fixed-height `flex` row with no wrapping beside the brand; with that many items
  the row ran over the brand and Dashboard could not be clicked. Below 768 px the same items became a
  horizontally scrolling strip under the logo.
- **Information architecture.** Direct links: Dashboard, Eligibility, Claims, Pre-auth. Menus: Care &
  claims (Inbox, Cases, New Claim), Finance, Contracts & Services, Reports, Administration. Account
  menu: identity (name, persona, facility), Facility profile, Logout (DEC-FH-X9). The grouping is one
  table in the model — `computeProviderNav` still filters by exact permission (fail-closed) and the
  `contractView` flag, and emits a group only when it has an item. The browser still receives only
  `{key, label, href, iconKey}`; routes stay server-authorized.
- **Layout.** The brand and account menu share the top row with nothing else; the account button
  shows name and persona at every width (DEF-001/002) and truncates rather than pushing. From 1280 px
  a second row holds the direct links and menus (it may wrap, never overflow). Below 1280 px one Menu
  button opens a panel listing every group as a labelled section — nothing is laid out beneath the
  logo — capped to the viewport and scrolling inside itself.
- **Behaviour.** Disclosure pattern (button + list of links, `aria-expanded`/`aria-controls`). One
  disclosure open at a time. Escape closes and returns focus to its button; a press outside closes;
  tabbing out closes (a blur with no destination is ignored, because Safari does not focus clicked
  controls); choosing an entry closes and returns focus to the button; navigating closes whatever is
  open (the open state records the path it was opened on, like the P11.02 drawer). Up/Down/Home/End
  move within an open panel. Visible focus ring on every control. Current page: the longest matching
  destination gets `aria-current="page"` (or `"true"` on a page beneath it) and its menu button is
  marked and highlighted.
- **Sticky-header offset.** The header is 57 px (compact) or 106 px (desktop) and sticky, so an error
  summary's `#field` jump or a focus move would land a field under it. `scroll-padding-top` is now
  5.5 rem / 8.5 rem on pages with the provider header only (`html:has([data-provider-shell])`).
  Measured: the jumped-to field lands at 136 px under a 106 px header (1280 px) and at 88 px under
  57 px (360 px).
- **Model tests.** A facility administrator gets exactly the table above and all 15 destinations;
  over **every** combination of the 13 permissions × the contract flag (16,384 cases) each permitted
  route is in exactly one group, no group is empty, nothing permitted is missing, and group order and
  labels come from the one table. Active-destination resolution: detail pages, `New Claim` over
  `Claims`, segment boundaries, and hidden destinations.
- **Component tests.** Brand and Dashboard are separate links; four direct links and five closed
  menus; every destination reachable from exactly one place; Escape/outside/tab-away; arrow keys;
  one menu at a time; choosing closes and returns focus; navigation closes; current page and its menu
  marked; account menu identity, Facility profile and Logout; compact panel lists every group and
  returns focus; a biller sees no empty menu; no permission code reaches the markup.

**Browser run (2026-09-11, Chromium, Next dev server on this branch).** Signing in needs a password
typed into the login form, which this executor does not do, so the run used a temporary page (never
committed, deleted after) that mounts `ProviderNav` in a layout exactly as `src/app/provider/layout.tsx`
does, with the facility administrator's computed groups (all 15 destinations, contracts on), a
48-character facility name and a 34-character user name — the widest realistic case. At each width a
script checked: document wider than the viewport; any two of Menu/brand/account (and their contents)
overlapping; any bar item or menu entry outside the viewport, clipped, overlapping another, or covered
at its centre (`elementFromPoint`); Dashboard and brand each clickable; every menu's panel inside the
viewport.

| Width × height | Mode | Result |
|---|---|---|
| 1920 × 1080 | two rows | no overflow, no overlap, 9 bar items on one line, 6 panels inside the viewport |
| 1440 × 900 | two rows | same |
| 1280 × 800 | two rows | same (row 1,058 px of 1,233 px available) |
| 1024 × 768 | compact | no overflow, no overlap; Menu panel (14 entries) and account panel inside |
| 768 × 1024 | compact | first run: the account button overflowed by 4 px (it kept its width inside a shrinking box) — **fixed** (the box is now a flex container, so the name truncates); re-run clean |
| 360 × 740 | compact | first look: "Medvex" ran into the account button (the brand shrank below its mark) — **fixed** (the mark never shrinks below `sm`; the avatar gives way instead); re-run clean; every panel entry ≥ 44 px tall; the panel scrolls to its last entry |
| 320 × 640 | compact | clean |
| 640 × 400 and 960 × 540 (a 1280 × 800 and a 1920 × 1080 screen at 200 % zoom) | compact | clean; the Menu panel fills to the viewport bottom and scrolls; the account panel fits |

Keyboard and pointer, in the browser: Escape closed "Care & claims" and returned focus to its button
with the teal focus ring (`:focus-visible` true); with the menu open, Tab went Inbox → Cases → New
Claim and the next Tab moved to "Finance" and closed it; choosing Finance → Settlements navigated,
closed the menu, left focus on "Finance", marked it `aria-current="true"` and Settlements
`aria-current="page"`; a pointer press on the page closed an open menu and a press inside it did not.
The dev server ran against the throwaway database `fh_gate_head2`, where one seeded provider user was
given the facility-administrator persona and its provider the contract-view flag — no shared or
production data was touched.

### P07.01 — Withdraw and cancel the trial records (prepared; production apply pending)

```text
Task ID:                 P07.01
Defects covered:         FH-13 (records), FH-02 (their prices)
Starting/ending SHA:     53b70cd → 295d9ea
Files changed:           src/server/services/claim-withdrawal/{catalog.ts,service.ts} (operator path,
                         DEC-FH-X10), scripts/family-hospital-trial-record-cleanup.ts (new),
                         scripts/lib/family-trial-record-cleanup.ts (new),
                         scripts/lib/family-hospital-reviewed.ts (the reviewed P00.03 set)
Schema migration/backfill: none
Read-only preflight artifact: evidence/P07.01-dry-run-2026-09-11T10-43-51-208Z.{md,json}
Automated tests added/changed: tests/services/claim-withdrawal.service.test.ts (+4, real DB),
                         tests/services/claim-withdrawal-policy.test.ts (+1),
                         tests/scripts/family-trial-record-cleanup.test.ts (2, real DB)
Commands and results:    [PROD, read-only] reconciliation SELECT (Supabase SQL) → the P00.03 set is
                           unchanged: CLM-2026-00308…00311 RECEIVED, no decision, no money record,
                           no fund movement, no lifecycle log; PA-2026-00007 UNDER_REVIEW, no hold;
                           no other Family claim or pre-auth
                         [PROD, read-only] DATABASE_URL=<session pooler> npx tsx
                           scripts/family-hospital-trial-record-cleanup.ts → exit 0,
                           "--apply would proceed": 4 × WITHDRAW, 1 × CANCEL
                         throwaway DB (fh_gate_head2): claim-withdrawal suite 25/25,
                           cleanup suite 2/2; typecheck and eslint clean
Browser scenarios and evidence paths: n/a
Feature/config changes:  none
Data mutations and operation IDs: none in production yet
Rollback tested:         n/a — withdrawal and cancellation are terminal by design; nothing is deleted
Residual risk:           the operator path is new code and must pass review before it writes to
                         production (DEC-FH-X10); all-status totals keep counting the records
                         (DEC-FH-X11, open)
Reviewer/sign-off:       pending — owner approval for the production apply
```

- **Path.** Claims: `ClaimWithdrawalService.withdrawAsOperator` (DEC-FH-X10). Pre-auth: the canonical
  `preauthAdjudicationService.cancelPreAuth`, the admin page's action. Reason on every record:
  `TEST_DATA_INCORRECT_TARIFF`. Never a direct status write; nothing deleted.
- **Safety.** The script acts on the reviewed ids only and refuses — before writing — if any of them
  moved, carries money, or if Family holds any record the set does not name. The operator must be an
  active user of the tenant with a claims-operations **and** clinical role. An operation receipt keyed
  by the batch ref replays a finished run; every step is itself idempotent, so a failed run can be
  re-run safely. The JSON/Markdown record lists before/after status, operation id, operator, reason,
  and the audit and lifecycle rows — record ids only, no patient data.
- **To apply (after approval):**

  ```text
  DATABASE_URL=<session pooler> npx tsx scripts/family-hospital-trial-record-cleanup.ts \
    --apply --batch-ref FH-P0701-<yyyymmdd> --operator-user-id cmr3aezx7000mnlvqgoljdyqi
  ```

  then re-run the dry run (every record ALREADY_DONE) and the P00.03 register moves to "withdrawn /
  cancelled".
- **Step 5 (what still counts them).** Checked in code: after the apply they are not pending anywhere
  (TPA "Pending claims"/"Pending pre-auths", facility "Awaiting adjudication"), not approved, not paid,
  and provider performance scores already exclude WITHDRAWN. All-status totals still include them —
  see DEC-FH-X11.

**Applied 2026-09-11 (owner-approved in chat):**

```text
[PROD, write] DATABASE_URL=<session pooler> npx tsx scripts/family-hospital-trial-record-cleanup.ts \
  --apply --batch-ref FH-P0701-20260911 --operator-user-id cmr3aezx7000mnlvqgoljdyqi
→ exit 0, APPLIED; operation receipt cmtwz26hw0000azvq4z9v45gv (SUCCEEDED, WITHDRAWN:4;CANCELLED:1)
  CLM-2026-00308 … 00311  RECEIVED → WITHDRAWN   (lifecycle logs cmtwz27ip…, cmtwz2957…, cmtwz2aoy…,
                                                   cmtwz2c8o…; audit CLAIM:WITHDRAW cmtwz285h…,
                                                   cmtwz29pf…, cmtwz2b9c…, cmtwz2csw…)
  PA-2026-00007           UNDER_REVIEW → CANCELLED (audit PREAUTH:CANCELLED cmtwz2dns…)
  Record: evidence/P07.01-applied-2026-09-11T13-08-21-633Z.{md,json} (full ids)
[PROD, read-only] afterwards: the 4 claims WITHDRAWN, never decided, approved 0; the pre-auth
  CANCELLED; 0 fund movements, 0 benefit holds; 4 CLAIM_WITHDRAWN in-app notices queued for the
  facility; Family now has 0 pending claims and 0 pending pre-auths. Nothing was deleted.
```

Step 5 (what still counts them): pending counts (TPA and facility dashboards) no longer include
them; all-status totals still do — DEC-FH-X11, open.
*Later the same day:* the owner decided DEC-FH-X11 and it was implemented — see its section at the
end of this log.

### P07.02 — Fresh Family UAT fixtures

```text
Task ID:                 P07.02
Defects covered:         FH-13 (rerun baseline)
Starting/ending SHA:     53b70cd → 295d9ea
Files changed:           scripts/reports/family-hospital-uat-fixtures.ts (new),
                         scripts/lib/family-hospital-reviewed.ts (FAMILY_P0702_FIXTURES);
                         test data in seven capture test files and one source comment now use a
                         fictitious member ("Amani Testmember", TST-2026-…) instead of a trial
                         member's name and numbers
Schema migration/backfill: none
Read-only preflight artifact: evidence/P07.02-uat-fixtures-2026-09-11T10-54-03-750Z.{md,json}
Automated tests added/changed: none new (the eight renamed-data files pass: 70 tests)
Commands and results:    [PROD, no persisted change] DATABASE_URL=<session pooler> npx tsx
                           scripts/reports/family-hospital-uat-fixtures.ts → exit 0, every fixture
                           verified. Direct reads ran in a SET TRANSACTION READ ONLY transaction; the
                           eligibility service (which records each check) ran inside a transaction
                           the script always rolls back — [PROD, read-only] afterwards: 0 eligibility
                           checks and 0 shadow samples persisted
Browser scenarios and evidence paths: P08.03
Feature/config changes:  none
Data mutations and operation IDs: none
Rollback tested:         n/a
Residual risk:           the biller and front-desk accounts are not set up until they receive a
                         setup link (P08.04 step 9, owner approval; also performs P00.02's
                         containment, DEC-FH-X8); price-list search on the capture forms stays off
                         for Family until `providerTariffCatalog` is enabled (P08.04 step 6)
Reviewer/sign-off:       pending
```

Verified on 2026-09-11 (Kampala) at Family's branch, against contract PC-2026-202 (ACTIVE, UGX, tax
inclusive, unlisted rule REFER_FOR_REVIEW; 4,424 rows in the engine's candidate set):

- **Members.** The three the plan names — all ACTIVE, cover from 2026-08-01, **ELIGIBLE** through
  `ProviderEligibilityService.check`, and the engine's contract pre-check matches PC-2026-202 for
  each. (Masked numbers and ids only in the evidence.)
- **Services** — expected values from the tariff rows; the engine resolves each service to its own
  row (SELECTABLE); every row is FIXED, UGX, no discount/markup, no pre-auth flag:

  | Area | Service (price-list name) | Line category | Unit | Contracted rate |
  |---|---|---|---|---|
  | Consultation | General Doctor Consult | CONSULTATION | per consultation | UGX 25,000 |
  | Laboratory | Full Blood Count / Complete Blood Count | LABORATORY | per item | UGX 22,000 |
  | Imaging | X-Ray: Chest PA/AP | IMAGING | per item | UGX 60,000 |
  | Pharmacy | Paracetamol 500Mg (Fremol) | PHARMACY | per item | UGX 250 |
  | Procedure | Excision of Dermatosis papulosa nigra (less than 5 lesions) — a P01.02 replacement row | PROCEDURE | per procedure | UGX 270,000 |
  | Inpatient bed | Bed Fee – SEMI PRIVATE | OTHER | per day | UGX 65,000 |
  | Maternity | Normal delivery \| General room (package) | OTHER | per episode | UGX 680,000 |

  For a line billed at a different price, the contracted rate above is what the claim must carry,
  and the difference is the recorded variance (P02.04).
- **Unlisted.** "Physiotherapy session" matches no row (none contains "physiotherapy"); under
  REFER_FOR_REVIEW (DEC-FH-01) it is accepted with a typed description and billed price, marked "not
  in contracted tariff — manual review", with no contracted rate and no CPT price.
- **Actors.** One account per role, each with Family's branch: facility administrator (set up),
  biller and front desk (**not set up** — they need individual setup links).
- **No patient PII in fixtures.** The evidence carries masked numbers and opaque ids. The capture
  component tests had used a trial member's name and numbers, as stored in production, as sample
  data; they now use a fictitious member.

### P06 — addendum: a way home when the bar fails (plan §9)

Plan §9.1 lists "navigation render errors" among the structured events; nothing emitted one.
`ProviderNavBoundary` (dd26506) wraps the provider bar in the layout: if the bar throws, the page
keeps the brand, Dashboard and Logout in its place, and the failure is reported once — to the
browser console like every boundary, and through `reportNavigationRenderErrorAction` as a
`navigation_render_error` log event carrying the session's opaque ids and the framework digest only
(anything else the browser sends is dropped). Tests: tests/components/provider-nav-boundary.test.tsx
(2), tests/actions/report-navigation-render-error.test.ts (3); audit catalogue entry READ_ONLY.

### P08.01 — Required automated coverage

```text
Task ID:                 P08.01
Defects covered:         all FH-xx (test evidence)
Starting/ending SHA:     295d9ea → 88276513
Files changed:           tests only (+ the P06 addendum above)
Automated tests added/changed: see the list below
Commands and results:    each changed file green on its own; full default suite 380 files / 4,786 tests
Reviewer/sign-off:       pending
```

Every mandatory case in the plan's P08.01 table was mapped to an existing test (file and `it`
title), with the security rule "an adjacent cross-tenant/provider case" and the mutation rule "a
failed delivery/validation or stale-data case" checked per path. The gaps found, and what now
covers them:

| Gap | Now covered by |
|---|---|
| Unauthenticated callers (no test at all) | capture lookups, claim submit, resubmission, pre-auth submit: the sign-in redirect propagates and nothing runs; TPA invite/resend: the role guard's redirect propagates |
| Capture lookup actions untested at the action layer | tests/actions/provider-capture-actions.test.ts — non-provider → FORBIDDEN; session scope; only typed, named fields reach the services; the service's DTO passes through unchanged |
| Trial-member eligibility (none) | eligibility-decision-parity: pinned trial member ELIGIBLE on the rerun date; the 2026-09-09 unpinned defect fails closed; not eligible before cover began |
| Setup token hash/expiry/replay only in the DB suite | tests/services/account-invitation-token.test.ts — SHA-256 lookup only; malformed token refused before lookup; expired/used/revoked/suspended/set-up/cross-tenant rows all refused; spent link writes nothing |
| Tariff search by date/branch/provider | tariff-parity: expired, future-dated, other-branch and other-provider rows absent from search and refused at submit; on a date both rows were effective the ambiguity blocks both |
| SUB/RES/PA lacked a cross-facility case | a body naming another facility changes nothing; a foreign branch or claim is refused |
| Invitation actions: wrong permission; failed delivery on facility invite/resend | action tests + real-DB test (a biller cannot invite or resend) |
| Catalogue DTO checked only loosely | exact row and result keys asserted |
| Currency mismatch at intake | the filed claim takes the contract's currency and the server's canonical line whatever the body says (the canonicaliser's refusal of a foreign-currency row was already covered) |
| Amendment revalidation; amend form; member-field states; resubmit UI | prepareLines tests (parent's case, stale tariff, changed version, ineligible); AmendPreauthForm (3); member field loading/forbidden/unavailable/no-contract; correction form in resubmit mode |

Two form tests now wait for the submit button to leave "Submitting…" before clicking again; one had
failed once under the full parallel run (never alone) because the outcome rendered a moment before
the pending state cleared. No assertion changed.

### P08.02 — Mandatory local verification (HEAD 88276513)

```text
npm run typecheck                                   → exit 0
npx vitest run                                      → 380 files passed, 90 skipped (opt-in DB);
                                                      4,786 tests passed, 615 skipped
npx eslint <147 files changed since 3fa0159>        → 0 errors, 5 warnings — the same 5 warnings
                                                      exist on 3fa0159 (unused vars in
                                                      claim-adjudication/preauth-adjudication services,
                                                      one unused eslint-disable in a test)
SCHEMA_DEPLOY_MODE=skip npm run build:local         → exit 0, "Compiled successfully"; the one
                                                      compile warning is bullmq's dynamic require,
                                                      present on 3fa0159
Opt-in real-DB suites (fresh Postgres 17, every migration + prisma/seed.ts, files run one at a
time): 91 files / 599 tests passed; 16 tests in 6 files fail — exactly the 16 that fail on the
baseline 3fa0159 (P05 entry). A parallel run on another fresh database showed 14 more failures in
seven files, every one of which passes when run on its own: those suites share the seeded tenant
and race each other (claim-number and processing-run uniqueness); not caused by this branch.
The account-invitation suite gained one test afterwards: 10/10.
```

`build:local` writes to ~/Library/Caches/avenue-portal/next-build, the same directory the main
checkout's `.next` points at. After the last build the worktree's `.next` link was removed and the
generated route types this branch's builds left there (`types/app`, `types/validator.ts`,
`types/routes.d.ts`) were deleted, so the main checkout's typecheck does not pick up this branch's
routes; the next build or dev run in the main checkout regenerates them.

### P08.03 — Browser verification matrix

| Actor | Scenario | Status |
|---|---|---|
| Facility admin | Every provider destination at all target widths | **Done** (P06): 320–1920 and two 200 % zoom sizes, measured by script; keyboard, Escape, outside press, focus return |
| Platform admin | Invite a Family biller; successful and failed mail; resend | **Not run** — needs a signed-in platform administrator |
| Family admin | Invite front desk; attempt cross-provider / stronger persona | **Not run** — needs a signed-in facility administrator |
| Front desk | Each trial member with the blank-initial date | **Not run** — needs a signed-in front-desk user |
| Biller | Typed member; diagnosis by code and text; category + partial description; billed ≠ contracted; unlisted; `600,000`; correction/resubmission | **Not run** — needs a signed-in biller |

Why: signing in means typing a password into the login form, which this executor does not do on
anyone's behalf — not even for a local test account. The automated suites cover each row's
behaviour (component, action and real-DB tests above), but the plan asks for the browser. These rows
run at P08.04 step 7 with internal accounts, by a person who signs in — the executor can drive the
rest of each scenario once signed in, in the in-app browser against a local server and a throwaway
database. Evidence rule for the run (plan P08.03): no names, member numbers, emails, tokens or
credentials in screenshots.

### P08.04 — Deployment sequence (runbook; nothing below has been run against production)

Read-only preflight already done (2026-09-11):

- `_prisma_migrations` on production ends at `20260814002000_audit_log_nullable_actor`, the last
  migration this branch inherits; its two new migrations are pending and additive —
  `20260911000100_claim_line_selected_tariff` (nullable column + index + FK; ClaimLine has 64 rows)
  and `20260911000200_account_setup_invitation` (new enum + new table). Neither object exists yet.
- `origin/main` (3fa0159) is an ancestor of the branch: a fast-forward merge.
- `SCHEMA_DEPLOY_MODE=migrate` is live in Vercel (2026-08-14), so the build applies the two
  migrations with `prisma migrate deploy`.

| Step | What | Needs |
|---|---|---|
| 1 | Reviews: schema/security (the two migrations, DEC-FH-X10's operator withdrawal, invitations and setup tokens, the new Server Actions), contract/pricing (catalogue, canonicaliser, provenance, DEC-FH-X3), provider UX (capture forms, navigation DEC-FH-X9) | human reviewers |
| 2 | Supabase backup/PITR point noted; re-run the read-only migration check above | owner |
| 3 | Vercel production env: `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`), `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL=https://<production origin>`; then one invitation to a controlled internal address must arrive and its link must work | owner (secrets); approval to send the test mail |
| 4 | Merge the branch into `main` (fast-forward) and let Vercel deploy with `SCHEMA_DEPLOY_MODE=migrate`; confirm the build log applied exactly the two migrations and `_prisma_migrations` shows them finished | approval |
| 5 | P01.01 preflight against production (read-only) — must still PASS | — |
| 6 | Tenant `config.providerAccess.tariffCatalogProviderIds += Family`, through the settings change the flag is designed for, only after step 5 passes | approval |
| 7 | Browser matrix (P08.03) with internal accounts | a person signs in |
| 8 | P07.01 apply (`--apply --batch-ref FH-P0701-<yyyymmdd> --operator-user-id cmr3aezx7000mnlvqgoljdyqi`), then the dry run again | approval |
| 9 | Invite the Family biller and front desk individually from Settings (this also retires their exposed temporary passwords — DEC-FH-X8, the P00.02 containment); confirm receipt without asking for any password | approval (sends email to the facility) |

§9 support notes: invitation state is on TPA Settings and the facility Users page (sent / failed with
reason / expired, with Resend); the tariff state is `scripts/reports/family-hospital-tariff-preflight.ts`.
Alerts to configure in the log platform (not in code): repeated `invitation_delivery` with
`deliveryStatus: FAILED`, and any `stale_tariff_rejected` / `catalogue_ambiguity` spike.

### P08.05 — Rollback (none of it re-enables KES-as-UGX pricing)

1. **Catalogue problem:** remove Family from `tariffCatalogProviderIds` —
   `npx tsx scripts/provider-access-flag.ts --tenant-id cmr3ae8v30000nlvqxrqlfn38 --provider-id
   cmssrwr31000033vqpue454ou --flag tariffCatalog --disable --apply --operator-user-id <id> --reason
   "<incident>"`. Capture falls back to the
   description-first manual price path ("contract rate unavailable — manual review"); no global
   price returns. If that path is also unsafe, pause Family's capture (provider status), not the
   code.
2. **Setup-link defect:** revoke unused invitations (`revokedAt`, reason) — never delete; activated
   accounts go through the normal suspension/session-revocation path.
3. **Tariff data:** `npx tsx scripts/family-hospital-tariff-remediation.ts --rollback --batch-ref
   FH-P0102-20260911 --operator-user-id <id>` — rehearsed; restores exactly the 33 prior rows and
   retires the 6 replacements, deletes nothing.
4. **Application:** promote the previous Vercel deployment. The two migrations are additive and stay
   (the old code ignores the new column and table); no audit, receipt or invitation row is reversed.
5. **Record:** incident note with correlation ids, affected provider, user-safe wording — no
   passwords, tokens or patient data.
6. **P07.01 is terminal by design** (WITHDRAWN / CANCELLED); it is not rolled back.

**Executed 2026-09-11 (owner instruction "push to main"):**

```text
Step 4  git push origin HEAD:main — fast-forward 3fa01593..fa145975 (13 commits)
        Vercel production deployment dpl_FLLdKPm6RE4Bvtj6cVucJ88nAg12, READY 12:31:52 UTC,
        aliased to avenue-portal.vercel.app. Build log: [db-sync] SCHEMA_DEPLOY_MODE="migrate" →
        prisma migrate deploy → "Applying migration 20260911000100_claim_line_selected_tariff",
        "Applying migration 20260911000200_account_setup_invitation", "All migrations have been
        successfully applied"; next build "Compiled successfully" (the same bullmq warning as local).
        [PROD, read-only] _prisma_migrations: both finished 12:29:39 / 12:29:40 UTC, not rolled
        back; ClaimLine.selectedProviderTariffId + index + FK present (64 lines, unchanged);
        AccountSetupInvitation table + unique token-hash index + 2 FKs present, 0 rows.
        Smoke: /login 200, /account-setup 200 ("Set up your account — Medvex"),
        /provider/dashboard 307 → /login, /api/health {"ok":true,"db":"up","version":"fa14597"}
        (workerFresh:false — the background worker has not reported since 2026-07-28; invitation
        mail is sent directly, not through it). Vercel runtime errors since the deploy: none.
        GitHub: brand guard passed on fa14597; verification gate started.
Step 5  [PROD, read-only] scripts/reports/family-hospital-tariff-preflight.ts --expected-logical 4424
        → PASS on G1–G6, 4,424 logical services (evidence/P01.01-preflight-2026-09-11T12-30-26-196Z)
        [PROD, read-only] P07.01 dry run after the deploy → unchanged, "--apply would proceed"
```

Step 6  (owner-approved in chat) scripts/provider-access-flag.ts --tenant-id cmr3ae8v30000nlvqxrqlfn38
        --provider-id cmssrwr31000033vqpue454ou --flag tariffCatalog --enable --apply
        --operator-user-id cmr3aezx7000mnlvqgoljdyqi --reason "…preflight PASS…; owner approved"
        → changed: [] → [Family]; read back through ProviderAccessSettingsService: live for Family.
        [PROD, read-only] Tenant.config.providerAccess = {"tariffCatalogProviderIds":[Family]} and
        the tenant's other settings untouched; audit row cmtwye41z000003vq4bnl5jc4
        PROVIDER_ACCESS_FLAG_CHANGED by the operator, hash-chained. Takes effect without a deploy;
        every other facility is unchanged (no tenant-wide flag). Undo: the same command with
        --disable. Before this there was no way to set the flag but a hand-written JSON update —
        the script (with tests/scripts/provider-access-flag.test.ts) makes it one audited step.

Not done, and recorded as such: step 1 — the owner chose to deploy without the separate
schema/security, pricing and UX reviews; step 2 — no backup was taken separately (both migrations
only add a nullable column and a new table; nothing existing was rewritten); step 3 — production
SMTP and `NEXT_PUBLIC_APP_URL` are still unverified. **Consequence now live:** the TPA "Invite user"
form no longer sets a password, so until step 3 is done every new account is created with a FAILED
setup-link delivery and can only be finished with Resend once mail works. Steps 7–9 still await the
owner.

### Provider communication (plan §12) — drafted, not sent

`FAMILY_HOSPITAL_RERUN_MESSAGE_DRAFT.md` covers the §12 checklist (setup links instead of the old
passwords, description-and-category search without codes, reviewed UGX prices, the withdrawn trial
records, the member dataset, the five workflows, the outstanding policy answers and bill sample),
plus the 200-code diagnosis limit (DEC-FH-03) and the Surgical Extraction pair to confirm (P01.02).
It is not to be sent until the owner approves it and P08.04 steps 3–9 have made it true.

### Release gates (plan §13) — status on 2026-09-11

| Gate | Status |
|---|---|
| Exposed passwords invalidated | **Open** — owner "not yet"; closes at P08.04 step 9 (DEC-FH-X8) |
| Individual accounts; truthful invites; replay/expiry proven | Accounts exist; invitation behaviour proven in tests; delivery awaits SMTP (step 3) |
| Read-only tariff preflight | **PASS** on production after P01.02 |
| Catalogue and engine select the same tariff/rate for every fixture | **PASS** (parity tests; P07.02 engine resolution on production data) |
| No CPT `averageCost` auto-price / KES-as-UGX | **PASS** in code (consistency ratchet); live after deploy |
| Direct claim entry resolves a typed trial member and revalidates | **PASS** in tests; browser pending |
| Diagnosis search by text/code, no price | **PASS** in tests; 200-code limit disclosed (DEC-FH-03) |
| Category filters Family description search; codes optional | **PASS** in tests; live for Family since 12:49 UTC (step 6) |
| `600,000` accepted and persisted | **PASS** in tests |
| Kampala date default, correct around UTC midnight | **PASS** in tests |
| Inpatient/surgical benefits from one list | **PASS** in tests |
| Navigation at all widths, keyboard, touch, 200 % | **PASS** (P06 browser run) |
| Old claims/pre-auths withdrawn/cancelled with history | **PASS** — 4 withdrawn, 1 cancelled, nothing deleted (step 8, 13:08 UTC) |
| Typecheck, tests, lint, build | **PASS** (P08.02) |
| Internal browser smoke tests | **Open** — step 7 |
| Family's users complete UAT; Abel signs off | **Open** — after the rerun |

**Verdict: NO-GO for a Family rerun today** — the open gates are the credential containment, the
deployment itself (steps 1–6), the internal browser smoke run, and the P07.01 cleanup. Each is an
owner-approved or human step; nothing further is blocked on code.

**Update 2026-09-11, after the deploy (steps 4–6) and the P07.01 apply (step 8):** those two gates
are closed. Still open: the credential containment (P00.02; the owner's last answer here is
"not yet"), the internal browser smoke run (step 7), and Family's UAT and sign-off. Step 3 is still
not done: until production mail is verified, every new TPA invitation records a FAILED delivery.

---

## DEC-FH-X11 — withdrawn and superseded claims out of totals (owner decision, 2026-09-11)

Owner, in chat: "dont think they should count in totals given that they have been withdrawn. they
should be in logs", then "also exclude superseded claims from totals". Rule and reasoning:
`FAMILY_HOSPITAL_UAT_DECISIONS.md` §4.11; one definition, `src/lib/claim-totals.ts`.

**Inventory.** A read-only sweep of every claim count, sum, average and ratio in `src/` found 32
places that took every status. Each was classed TOTAL (changed), LOG (unchanged: lists, detail and
timeline pages, recent activity, per-status buckets, case slices, rejection rows, the claims CSV),
OPERATIONAL (unchanged: work queues, paging, analytics access scoping, the double-capture gate,
resubmission eligibility, intake fingerprint links, contract re-sweep) or RISK (unchanged: fraud
rules, velocity and split-billing checks, the pre-auth fraud gate). Settlement-batch and fund-
deduction figures cannot contain these claims (both statuses are pre-decision only).

**Changed — each now leaves WITHDRAWN and SUPERSEDED claims out:**

| Surface | Figures |
|---|---|
| TPA dashboard | Claims This Month, the monthly volume and billed/approved charts, the loss ratio. Pending Claims and recent activity unchanged. |
| Facility dashboard | Total claims, paid to date. Recent claims unchanged. |
| TPA claims list | The Total card, which says "Excludes N withdrawn or superseded". Rows, paging and "N claims" keep every claim; a status filter that asks for WITHDRAWN counts them. |
| Reports (page and CSV) | Claims Summary KPIs (the record count still counts every claim); Admissions (count, billed, providers, average stay); OPD visits (visits, members, average, billed); Claims Experience; Service Cost Comparison; Exclusion & Rejected KPIs (its rows still list them). |
| `reports.claimsSummary` (tRPC), weekly report job | Count, billed, approved, paid, loss ratio, by category. `byStatus` and the claim list keep every claim. |
| Analytics | No encounter facts are written for them, and facts written before a claim left the totals are deleted on the next refresh — so MLR snapshots, provider scorecards, risk profiles, renewals, alerts and the five analytics reports follow. The claim is untouched. |
| Contract analytics | Claims by contract, short-paid, amendment backlog, leakage, turnaround. Queue load (a work count) unchanged. |
| Average-cost pool reconciliation | The claim count and billed total of a new computation. No reconciliation exists on production, so nothing recorded changes. |
| Claim counts | HR utilization (count, approved spend, loss ratio, by category), self-funded scheme claims, member page, provider page and providers list, contract "Claims priced", and the providers/contracts tRPC reads. |
| Member app | Care-history totals and counts (every encounter still listed). |
| Inpatient case reconciliation | Approved, paid and outstanding to date, member share, slice count (every slice still listed). |

Also corrected on the way: the member page's "Total Claims" was the length of the 20-claim list it
shows, so it never exceeded 20; it is now a count of the member's claims.

**Evidence.**

```text
local throwaway Postgres (seeded, 791 claims; nothing written — one rolled-back transaction)
  moved 2 received/under-review claims to WITHDRAWN and SUPERSEDED, re-ran the dashboard SQL and
  the Prisma filters: Claims This Month 791 → 789, monthly volume Σ 791 → 789, loss-ratio billed
  base and the claims aggregate −88,400 (exactly the two claims' billed), record count 791 → 791,
  a provider's filtered _count 225 → 223; after rollback 0 such rows.
npm run typecheck                              → exit 0
npx vitest run (full)                          → 385 files passed, 90 skipped; 4,824 tests passed
  new: tests/lib/claim-totals.test.ts (3), tests/services/claim-totals.test.ts (9),
       tests/consistency/claim-totals-surfaces.test.tsx (19: each page's figure read off the
       rendered page), tests/consistency/claim-totals-dashboard.test.ts (3),
       tests/services/contract-analytics.test.ts (+1)
  with the rule emptied (no excluded statuses) 22 of those fail; restored.
npx eslint <changed files>                     → 0 errors (4 warnings, all already in those files)
SCHEMA_DEPLOY_MODE=skip npm run build:local    → exit 0, compiled successfully (only the known
                                                 bullmq and workspace-lockfile warnings)
```

**What moves on production.** Production holds four such claims — Family's trial records
CLM-2026-00308…00311, WITHDRAWN, UGX 33,900 billed, 0 approved — and no superseded claim. After the
deploy: Family's "Total claims" 4 → 0; the TPA dashboard's Claims This Month, the September volume
and billed bars and the loss-ratio billed base drop by those four; the claims list's Total card
drops by four and says so; Family's claim count on the provider pages drops by four. The four stay
in every list, report table, export and timeline. Analytics are unaffected today (no facts were ever
written for these claims; the last refresh was 2026-07-28, when the worker last ran).
