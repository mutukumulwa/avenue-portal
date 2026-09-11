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
| P00.03 Freeze unreliable UAT records | DONE | see §3 | 4 claims + 1 pre-auth frozen, register marked, UAT paused |
| P01.01 Read-only tariff preflight | DONE | see §3 | production result **NO-GO (G2)** → P01.02 required |
| P01.02 Attach/reimport safely | DONE | see §3 | owner approved 2026-09-11; applied to production, receipt `cmtwmk5920000xavq6zrbs74p`; production preflight now PASS |
| P01.03 Standalone-tariff semantics | DONE | see §3 | readers aligned; four-reader parity test green |
| P02.01 Provider case-context resolver | DONE | see §3 | |
| P02.02 Member resolution surface | DONE | see §3 | the eligibility link itself is switched in P04.04 |
| P02.03 Provider-scoped service catalogue | DONE | see §3 | behind provider-scoped flag `providerTariffCatalog`, default OFF (P08.04 step 6) |
| P02.04 Revalidate selected tariffs on submit | DONE | see §3 | claims (eee198c) + pre-auth/amendment (P04 commit); migration not yet applied to any shared database |
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
Starting/ending SHA:     eee198c → P04 commit
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
Starting/ending SHA:     eee198c → P04 commit
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
Starting/ending SHA:     eee198c → P04 commit
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
Starting/ending SHA:     eee198c → P04 commit
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
Starting/ending SHA:     eee198c → P04 commit
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

