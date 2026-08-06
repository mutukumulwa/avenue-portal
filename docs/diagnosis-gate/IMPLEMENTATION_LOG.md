# Diagnosis Gate — Implementation Log

Append one entry per work package (execution plan §0.1.4). Newest last.

Entry template:

```
## <Pkg> — <title>
- Date / commits:
- Anchors re-verified:
- What was built:
- Verified:
- W-checklist (§7): W1 … W8
- Deviations from plan:
```

---

## C0.3 — Branch / environment bootstrap
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:**
  - Branch topology confirmed: `feat/claims-autopilot` tip `69c1da4` **is an ancestor of
    `origin/main`** (`3ac6b2c`). Branched `feat/diagnosis-gate` from `origin/main` per plan
    §8.1. PNOS presence verified on the new branch (`docs/provider-network-os/PROGRESS.md`,
    `src/server/services/provider-performance/network.service.ts`).
  - **ANCHOR DRIFT #1 — permission convention.** Plan v1.0 §C3.1 specified dotted
    lowercase permission strings (`clinical.protocol.read`). Verified reality: the repo has
    **two** conventions — staff/admin caps in `prisma/seeds/rbac.ts` use `MODULE:ACTION`
    (`CLAIM:VIEW`, `MEMBER:TERMINATE`), while `prisma/seeds/provider-rbac.ts` uses the
    dotted form for the *provider portal* only. The Diagnosis Gate is a staff capability.
    Plan corrected in this commit: permissions are now `CLINICAL_PROTOCOL:VIEW`,
    `CLINICAL_PROTOCOL:MANAGE`, `CLINICAL_PROTOCOL:APPROVE`, `CLINICAL_GATE:REVIEW`.
    §4 anchor table gained four rows (staff seed, provider seed, enforcement helper,
    role sets).
  - **ANCHOR DRIFT #2 — spreadsheet library.** Plan v1.0 §C1.3 said to add `xlsx` if
    absent. Verified: `exceljs ^4.4.0` and `papaparse ^5.5.3` are already dependencies.
    Plan corrected to mandate `exceljs`; no new dependency will be added.
  - Enforcement helper confirmed: `rbacService.requirePermission(userId, code, tenantId)`
    (e.g. `src/server/services/blacklist.service.ts:29`).
  - `ROLES.CLINICAL` = SUPER_ADMIN / CLAIMS_OFFICER / MEDICAL_OFFICER already exists in
    `src/lib/rbac.ts:23` — reused for gate-review surfaces rather than defining a new set.
- **What was built:** branch `feat/diagnosis-gate` off `origin/main`; `docs/diagnosis-gate/`
  tree (`source/`, `reports/`, `baselines/`).
- **Verified — baseline on the fresh branch (regression yardstick):**
  - `npx tsc --noEmit` → **exit 0, no errors**.
  - `npx vitest run` (no `AUTOPILOT_TEST_DB`, per plan §8.4) → **190 files passed,
    79 skipped; 1569 tests passed, 501 skipped, 0 failed** (20.98 s). The 501 skips are the
    real-DB suites self-skipping correctly.
- **W-checklist:** n/a (no capability shipped).
- **Deviations:** none beyond the two logged anchor corrections.

## C0.2 — Vendor the source workbook
- **Date / commits:** 2026-08-06 · (this commit)
- **What was built:**
  - `docs/diagnosis-gate/source/ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx`
    (901 KB, SHA-256 `c10fac270f4aa0589032ae977f2210a8d8bef6ebb6f48f1013a29d0d73485d10`).
  - `docs/diagnosis-gate/source/SOURCE_NOTES.md` — exact sheet names (including the
    **trailing space** in `Clinical Diagnostic Features `), column lists, measured ground
    truth, the quantified F1 join-key defect (24/40 exact, 2/40 normalised-only, 14/40
    divergent with the full pair table), and the F1–F9 defect cross-reference.
- **Verified:** every number in SOURCE_NOTES was measured from the workbook in this
  session, not copied from the earlier review: 18,726 ICD-11 master rows · 40 conditions ·
  671 mapping rows over 37 distinct names · 669 codes all resolving against the master ·
  2 empty-code rows (Vaginal Candidiasis, Tinea Capitis) · 3 unmapped conditions (Acute
  Rhinosinusitis, COPD, Gastroduodenitis) · 40 clinical rows 100% populated · 22 lab tests.
  These are the regression yardstick for the C1.3 validator.
- **W-checklist:** n/a (docs only).
- **Deviations:** none.

## C0.1 — Authority specification
- **Date / commits:** 2026-08-06 · (this commit)
- **What was built:** `docs/diagnosis-gate/DIAGNOSIS_GATE_SPEC.md` (DG-1.0, DRAFT).
  Decisions DG-D1…**DG-D13** (plan §3 had D1–D12; the spec adds **DG-D13** naming
  repeat-window short-pay as the sole money-touching rule with its own sign-off, and
  **DG-D12** was re-scoped to per-line evaluation with the catch-all bar promoted to
  DG-D8 — the spec's numbering is authoritative for clinical semantics; the plan's
  package sequencing is unchanged). Rules R1–R4 stated in clinical-readable language with
  their honest limits (R3 sees only claims that reach Medvex; R4 proves a test was
  *billed*, never that it was *positive*). §4 failure-semantics table replaces the
  workbook's empty `Claims filter` sheet. §6 pilot table and §7 exit criteria are
  deliberately blank for the clinical owner. §9 carries both sign-off blocks (G-C0 and
  the separate G-C5.2 finance+clinical block).
- **Verified:** every scope claim in §8 ("out of scope") matches the as-built findings —
  no symptom capture on any rail, no drug baskets, no results ingestion.
- **W-checklist:** n/a (docs only).
- **Deviations:** spec decision numbering diverges from plan §3 as described above; this
  is intentional and recorded so a future reader does not treat it as drift.
- **OPEN — human gate G-C0:** §6, §7 and §9 require the clinical owner. No pack may be
  activated and no shadow campaign may start until signed.

## C1.1 — Additive schema
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:** `ClaimProcessingStageName` and `ApprovalActionType` enums,
  `AutoAdjudicationPolicy` model, `ClaimProcessingStage` — all at the §4 locations.
  Schema-file convention checked before writing: newer additive clusters (PNOS capitation)
  keep `tenantId` as a **bare String** with no `Tenant` back-relation, while intra-cluster
  parent/child relations DO use `@relation(..., onDelete: Cascade)` (15 existing uses,
  e.g. `ApprovalMatrix`→item l.1596). The DG cluster follows both: bare `tenantId`
  (so no existing model is touched at all) + cascading pack→children relations.
- **What was built:**
  - 6 enums: `ClinicalCodeSystem`, `ClinicalMappingProvenance`, `ClinicalLabLinkType`,
    `ClinicalAliasMatchType`, `ClinicalProtocolPackStatus`, `ClinicalVerdict`.
  - 7 models: `ClinicalProtocolPack`, `ClinicalInterventionGroup`,
    `ClinicalCodeMembership`, `ClinicalLabRule`, `ClinicalLabRuleGroupLink`,
    `ClinicalLineAlias`, `ClinicalShadowVerdict`.
  - `CLINICAL` added to `ClaimProcessingStageName`, positioned **between DUPLICATE and
    CONTRACT** (DG §6.2 execution order).
  - `CLINICAL_PROTOCOL_CHANGE` appended to `ApprovalActionType`.
  - Three fields on `AutoAdjudicationPolicy`, all `@default(false)`:
    `clinicalGateEnabled`, `requireClinicalGroup`, `repeatWindowShortPay`.
    (Plan §6.1 listed the first two for C1.1 and deferred the third to C5.2; the **column**
    is added now — additive and inert — so C5.2 ships behaviour only and never needs a
    second production schema change on the money path. The flag stays unread until C5.2.)
- **Verified:**
  - `npx prisma format` + `validate` → valid.
  - **Additive proof against a POPULATED pre-change database** (the PNOS lesson — a fresh
    push proves nothing about migration safety): built `dg_prev` from
    `git show origin/main:prisma/schema.prisma`, inserted a Tenant + an **APPROVED/LIVE**
    `AutoAdjudicationPolicy` row with a 75,000 ceiling, then pushed the new schema
    **without `--accept-data-loss`**. Result: succeeded unprompted (200 ms, no data-loss
    warning); the policy row survived with `mode=LIVE` and its ceiling intact; all three
    new columns materialised as `false`; all 7 DG tables created.
    ⇒ **A tenant already running LIVE automation stays record-only after deployment.**
  - `npx prisma generate` + `npx tsc --noEmit` → exit 0.
  - `npx vitest run` → **1570 passed / 501 skipped / 0 failed**.
- **Test change (deliberate, not a fix-to-green):**
  `tests/services/claim-processing-schema.test.ts` asserted the stage enum has exactly
  **14** members — a canary guarding the autopilot's canonical stage list (§6.5). The
  Diagnosis Gate legitimately adds a 15th, so the assertion was updated to 15 with
  `CLINICAL` in the expected list, and a **new** assertion was added that CLINICAL sits
  after DUPLICATE and before CONTRACT (order is semantically load-bearing, so the guard
  is now stronger than before rather than merely relaxed).
- **W-checklist:** n/a — no capability shipped yet. W7 (UI toggles for the three policy
  flags) is owed by C3.4 and is tracked there; the columns are unreachable until then.
- **Deviations:** `repeatWindowShortPay` column added one package earlier than the plan
  scheduled it, as explained above. No behaviour attached.
- **Environment landmine (record for future sessions):** on this macOS host
  `pg_ctl start` fails with *"postmaster became multithreaded during startup"* unless
  `LC_ALL=C LANG=C` are exported first. Also **Prisma is 7.7.0**: `db push --skip-generate`
  no longer exists, and the datasource URL is read from `prisma.config.ts`
  (`env("DIRECT_URL")`), not from a `datasource` block env reference.

## C1.3 — Converter, validator, and the v0 red report
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:** `exceljs ^4.4.0` present (no dependency added); scripts run via
  `npx tsx` with `@/` path aliases (pattern: `scripts/backfill-coverage-periods.ts`).
- **What was built:**
  - `src/server/services/diagnosis-gate/pack-types.ts` — the canonical pack format plus the
    normalisation helpers (`normaliseAliasValue`, `normaliseCode`, `looseNameKey`) that the
    converter and the C2 stage MUST share; if they ever diverge, rules silently stop
    matching, so both sides import from one place. `canonicalisePack`/`serialisePack` sort
    every collection so a pack is byte-deterministic and diffs cleanly in git.
  - `src/server/services/diagnosis-gate/pack-validate.ts` — rules V0–V10 returning located,
    machine-coded issues, plus `renderValidationMarkdown`. ERRORS block import; WARNINGS
    mark content that is legal but **inert** (a rule with no alias can never fire) — a
    distinction that matters because inert rules make coverage look better than it is.
  - `scripts/diagnosis-gate/convert-workbook.ts` — xlsx → pack.json + report (+ optional
    proposals). Reads the exact sheet names including the trailing space.
- **What the converter deliberately REFUSES to infer (the whole point of C1.3):**
  1. **Group codes.** No code column exists, so it assigns provisional `CIG-001…` by row
     order *and raises a blocking error*, because those codes would shift the instant a row
     is inserted, silently re-pointing every rule and every historical flag.
  2. **Name spellings.** It matches names differing only in case/punctuation
     (`OtitisExterna` ↔ `Otitis Externa`) and refuses `Tonsilitis`→`Tonsillitis` or
     `Acne`→`Acne Vulgaris` — those are content decisions. An optional `--aliases` file
     exists for clinical-team-confirmed variants; it is NOT populated by engineering.
  3. **Confirmatory links.** The workbook states confirmation in prose. The converter
     emits *proposals* by a stated token-overlap measure and leaves the pack's
     confirmatory links empty ⇒ **R4 is provably inert on v0**, which is itself a finding.
  4. **Catch-all flags.** No column exists; it proposes candidates by an explicit
     breadth threshold (>40 codes) and never sets the flag.
- **Verified — the v0 run reproduces the recorded ground truth exactly:**
  `groups=40 · memberships=669 · labRules=22 · aliases=22 · links=10 · errors=66 ·
  warnings=2 · verdict NOT IMPORTABLE` (expected — v0 is the pre-fix baseline).
  Error breakdown cross-checks against `SOURCE_NOTES.md`: `UNRESOLVED_FEATURES_NAME`=**14**
  (exactly the 14 divergent names measured), `MAPPING_CODE_EMPTY`=**2** (Vaginal
  Candidiasis, Tinea Capitis), `GROUP_HAS_NO_CODES`=**5** (the 3 unmapped conditions + the
  2 empty-code ones), `GROUP_CODES_NOT_AUTHORED`=1, `UNRESOLVED_SUPPORTED_DIAGNOSIS`=**29**
  and `REQUIRES_DIAGNOSIS_NO_SUPPORT`=**10** (the F4 free-text defect, now quantified).
  Note `CONDITION_UNMAPPED`=5 rather than 3: the two empty-code conditions legitimately end
  up with zero memberships as well.
  - **Determinism proven:** three runs, byte-identical `pack-v0.json` each time.
  - Proposals report found the right confirmatory candidates (LAB003 Malaria RDT + LAB004
    Malaria Blood Smear from *"Positive Malaria RDT or blood smear"*) and the right
    catch-all candidates (Atopy 109, Arthritis 44, Contact Dertmatitis 42).
  - 28 unit tests (`tests/services/diagnosis-gate-pack-validate.test.ts`): a good pack
    passes; each V-rule broken individually and caught; normalisation asserts the
    *negative* cases (misspellings and synonyms must NOT match); serialisation order-
    independence; and a **ground-truth lock** on the vendored pack (40/669/22/0-confirmatory)
    so converter drift fails the build.
  - `npx tsc --noEmit` clean · `npx eslint` clean · full suite **1598 passed / 501 skipped
    / 0 failed**.
- **W-checklist:** n/a — offline tooling, no user-facing capability yet. W5/W8 for the
  import path are owed by C3.2, which reuses `validatePack` unchanged.
- **Deviations:** the plan sketched V1–V8; V9 (group with no codes) and V10 (rule with no
  alias) were added because both describe content that imports cleanly yet can never fire —
  exactly the silent-inertness the shadow campaign must not be fooled by.
- **FINDING FOR THE CLINICAL TEAM (new, not in the 2026-08-05 fix list):** the workbook has
  **no machine-readable confirmatory-test column**, so R4 cannot operate at all until one
  is added. The prose `Diagnostic Confirmation Rule` is not sufficient. This is now the
  second-highest-value workbook fix after F1 (stable group codes).

## C1.2 — Protocol pack service and governed lifecycle
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:** `policy-approval.ts` (submit/apply shape, safe payload, SoD
  defence-in-depth, replay-safety) and the approval dispatch in
  `approval-request.service.ts` — the APPROVED/REJECTED branches for
  `AUTO_ADJ_POLICY_CHANGE` sit at ~l.240/251 exactly as recorded. `ApprovalDecision`
  cascades from `ApprovalRequest`, `ApprovalStep` from `ApprovalMatrix`.
- **Schema addendum (additive, re-proved):** `activatedById`, `deactivatedById`,
  `deactivationReason` on `ClinicalProtocolPack`. Without them the lifecycle would have
  had unattributed activation and no withdrawal path — i.e. a hanging workflow, which
  §7 forbids. Re-ran the populated-DB push (`dg_prev`, no `--accept-data-loss`): clean,
  probe LIVE policy still intact.
- **What was built:** `src/server/services/diagnosis-gate/protocol-pack.service.ts` —
  `createDraftFromImport`, `submitForApproval`, `applyApprovedPackChange`, `activate`,
  `deactivate`, `getActivePack`, `setGroupEnablement`, `listPacks`, `loadPackContent`,
  `diffPacks`. Wired **both** dispatch branches (APPROVED + REJECTED) for
  `CLINICAL_PROTOCOL_CHANGE` in `approval-request.service.ts`, so the chain is live end
  to end rather than a service nobody calls (W5).
- **Design decisions worth recording:**
  - **Approval and activation are separate acts.** The autopilot's policy change
    activates on approval; clinical content does not. Approving correctness and
    switching the live book over have different blast radii, and the clinical owner
    should be able to approve today and cut over on Monday. Both actors are recorded.
  - **Packs are immutable.** There is no edit-a-rule path anywhere in the service. Fixing
    content means a new version from a new workbook, so every flag a claim ever received
    traces to the exact content set in force at that moment.
  - **Ids are generated client-side** (`randomUUID`) so the whole pack — groups,
    memberships, rules, links, aliases — lands via `createMany` inside one transaction.
  - **`enabledForLive: false` is forced at write time**, not merely defaulted in the UI,
    so DG-D5/DG-D8 hold of the data itself.
  - **Re-importing content identical to the active pack is refused**, so version history
    stays meaningful.
  - **ICD-10 codes are existence-checked here** against the platform's `ICD10Code` table
    — the offline converter cannot do that. ICD-11 has no platform table, so the
    converter's check against the workbook master remains the authority (validator warns
    rather than silently trusting).
- **Verified:** `tests/integration/diagnosis-gate-pack-lifecycle.integration.test.ts` —
  **11/11 green against a real database.** Proves: a pack with blocking errors cannot be
  imported (and leaves zero rows); DRAFT import writes all content with nothing in force;
  submit→approve→activate; the importer cannot approve their own content; approval alone
  does not put content in force; re-approval/re-activation are replay-safe; identical
  content is refused; v2 supersedes v1 with **exactly one pack in force**;
  **CONCURRENT activation** (`Promise.all`) still leaves exactly one; a catch-all can
  never be switched live while a specific condition can; an unapproved pack cannot be
  activated; withdrawal requires a reason and leaves **no** active pack; `diffPacks`
  surfaces a renamed condition. The approval payload was asserted **not** to contain
  clinical content. Teardown verified hermetic (0 packs, 0 tenants left behind).
  `tsc` clean · `eslint` clean · hermetic suite **1598 passed / 512 skipped / 0 failed**
  (skips rose by 11 — the new DB suite self-skipping correctly without the opt-in env).
- **W-checklist:** W2 partially — the dispatch and the `PRECONDITION_FAILED` message for
  a missing matrix rule are in place; the matrix *seed*, the dropdown entry and the
  label map are C3.1's. W5 closed for the approval chain. W1/W4/W7/W8 owed by C3.
- **Deviations:** three additive audit columns added mid-package (justified above).

## C2.1 — CLINICAL stage skeleton, route codes, queue, R1 scope resolution
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:** `EVALUATION_STAGES` (l.263+), `StageOutcome`/`EvalContext`
  exports, `loadClaim` select, `REASON_CATALOG` — all as recorded in plan §4.
- **What was built:**
  - `QUEUES.CLINICAL_REVIEW` + 4 route codes with full catalog entries. `REASON_CATALOG`
    is typed `Record<RouteCode, ReasonEntry>`, so **TypeScript itself enforces W6** — a
    route code cannot exist without provider/member/remedy wording.
  - `src/server/services/claim-autopilot/stage-clinical.ts` — `stageClinical`,
    `extractDiagnosisCodes`, `lineMatchKeys`, plus the record-only/route plumbing.
  - Registered `CLINICAL` between DUPLICATE and CONTRACT; extended `LoadedClaim` and the
    `loadClaim` select with `diagnoses` and `claimLines[].description` (additive select).
    Extended the `EvalContext` policy type with the two optional gate flags.
- **CRITICAL FINDING — `Claim.diagnoses` carries TWO shapes in the live table.** The
  canonical intake path (`claim-intake/persist.ts:79` `diagnosesJson`) writes
  `{ icdCode }`, while `claims.service.ts:471`, `reimbursement.service.ts:126` and
  `claim-intake.ts:85` write `{ code }`. The claim detail screen already hedges
  (`claims/[id]/page.tsx:307` reads `d.code ?? d.icdCode`). Reading only one key would
  make R1 silently resolve nothing for a whole class of claims — and **silent
  non-resolution is indistinguishable from "no problems found"**, the exact failure mode
  that would make the gate look healthy while doing nothing. `extractDiagnosisCodes`
  therefore reads both, prefers a non-blank `code`, normalises, and is fuzz-tested
  against every malformed value the JSON column can hold.
- **Verified:**
  - `tests/services/diagnosis-gate-stage-helpers.test.ts` (18 tests) — both shapes, mixed
    arrays, blank-`code` fallback, normalisation, and 11 malformed inputs; plus proof that
    `lineMatchKeys` normalises a description **identically to** `normaliseAliasValue` at
    import time (if these ever diverge, no line is ever recognised and every rule is
    silently inert).
  - `tests/integration/diagnosis-gate-stage-scope.integration.test.ts` — **13/13 green
    against a real DB.** The first test is the deployment-safety proof: **with no pack in
    force the stage is completely inert even with both gate flags switched fully on.**
    Also proves an **ICD-10 claim resolves against ICD-11-authored content** (DG-D3 — the
    case that actually matters in production), primary-over-secondary preference,
    line-level fallback, ambiguity flagged rather than silently resolved, out-of-scope
    passing by default (DG-D11) and routing only under strict mode, strict mode being
    inert while the gate is record-only, per-condition shadow disablement, and the pack
    version being stamped on every evaluation so a finding is attributable to the exact
    content in force.
  - Reason-catalog guard extended: the 23-code canary became 27 (truthful — the gate adds
    4) and gained DG assertions: every clinical finding is overridable; **member wording
    never reveals that a clinician's test selection was questioned**; the three protocol
    findings share the clinical queue while out-of-scope goes to ordinary adjudication.
  - `tsc` clean · `eslint` clean · hermetic suite **1616 passed / 525 skipped / 0 failed**.
- **DEPLOYMENT PREREQUISITE discovered by test:** importing any pack containing ICD-10
  memberships requires the platform's `ICD10Code` table to be populated, because
  `createDraftFromImport` existence-checks against it. On an empty database the import is
  (correctly) refused. This is a hard precondition for C1.4's crosswalk output and must be
  verified before a crosswalked pack is imported in any environment.
- **W-checklist:** W6 ✓ (type-enforced). W3 partially — claims stamped with the new queue
  will render in `/claims/queues` because that screen groups dynamically; asserted in
  C2.2–C2.4 once a rule can actually fire. W1/W2/W4/W5/W7/W8 owed by C3.
- **Deviations:** none. R2/R3/R4 are stubs here by design — the plumbing that decides
  *whether findings are acted on* is what C2.1 proves.

## C2.2 / C2.3 / C2.4 — rules R2, R3, R4
- **Date / commits:** 2026-08-06 · (this commit)
- **Packaging note:** the plan scheduled these as three packages; they ship as one commit
  because all three depend on the same alias-matching and history-fetch machinery, and
  splitting them would have meant writing that machinery twice. Tests are still organised
  per rule.
- **What was built** (in `stage-clinical.ts`): `matchLinesToRules` (alias → test
  recognition), `fetchPriorLines` (bounded member history), `ruleAliasKeys`, and the R2/R3/R4
  evaluation.
- **Design decisions worth recording:**
  - **History matching happens in JS, not SQL.** Aliases are stored normalised (uppercase,
    whitespace-collapsed) while `ClaimLine.description` is raw. Normalising inside the query
    would need raw SQL and could drift from `normaliseAliasValue`; reusing `lineMatchKeys`
    on both sides makes the two agree **by construction**. One bounded query (≤50 claims,
    widest window) serves both R3 and R4.
  - **"Earlier" is a total order** — service date, then `createdAt`, then id. Without the
    tie-break, two claims sharing a service date would either both flag (double-counting one
    repeat) or both stay silent (missing it). This is asserted directly.
  - **R2 checks only tests the pack marks `requiresDiagnosis`.** A test that may reasonably
    be ordered without a stated diagnosis is never flagged.
  - **R4 is per-claim, R2/R3 are per-line.** An unrecognised line therefore raises no R2/R3
    finding but does not satisfy R4 either — proven explicitly.
- **Verified:** `tests/integration/diagnosis-gate-rules.integration.test.ts` — **18/18 green
  against a real DB**, and **42/42 across all three DG DB suites** run together.
  - R2: supported test passes · unsupported test flags **quoting the pack's own provider
    wording** and naming the offending line · a no-diagnosis-required test is never flagged ·
    recognition by CPT code as well as by name · unrecognised line raises no test-level finding.
  - R3: repeat inside the window flags and cites the earlier claim number · no flag once the
    window elapses · **VOID/DECLINED history ignored** (an unpaid test is not a repeat) ·
    matches history whose wording differs only in case/spacing · **flags across different
    providers** (the control is per member, not per facility) · **same service date ⇒ exactly
    one of the two claims flags the other**.
  - R4: passes with the confirmatory test on the claim · flags when absent · accepts one
    billed earlier inside the condition's lookback · stays silent for a condition with no
    confirmatory test declared.
  - Record-only: findings recorded but claim PASSes with the gate off; still PASSes with the
    gate on while the condition is not live (DG-D5); ROUTES only when **both** are live, and
    the full finding set is preserved even when routing.
  - `tsc` clean · `eslint` clean · hermetic suite **1616 passed / 543 skipped / 0 failed**.
- **Test-design lessons (recorded so the next DB suite avoids them):**
  1. **The V6 validator rejected the first fixture** — a `requiresDiagnosis` test with no
     SUPPORTED link would flag every claim billing it. The fixture was corrected so H. pylori
     is supported *for gastritis*: "unsupported" must always mean "unsupported for THIS
     diagnosis", never "supported for nothing". The validator caught a genuinely bad rule set.
  2. **Cross-test history pollution.** All tests shared one member and one service date, so
     claims created by earlier tests sat inside later tests' lookback windows and silently
     changed their results. Each test now gets its **own service-date window, 90 days apart**
     (the widest rule looks back 720 h).
  3. Real-DB suites here follow the repo convention of using **seeded** fixtures; the tenant
     is derived **from the member** rather than `tenant.findFirstOrThrow()`, so a leftover
     fixture tenant cannot be picked. `Claim` requires `procedures`; `ClaimLine` requires
     `lineNumber`.
- **W-checklist:** W3 ✓ — a routed claim now carries `assignedQueue = CLINICAL_REVIEW`, which
  `/claims/queues` renders dynamically (verified by construction; click-path walkthrough in C3).
- **Deviations:** three plan packages merged into one commit, as noted above.

## C2.5 — Shadow read model
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:** `auditChainService.append` signature (`actorId/action/module/
  entityType/entityId/payload/tenantId/description`) matched the PNOS export precedent
  (`network.service.ts:97`, action `NETWORK_ANALYTICS:EXPORT`).
- **What was built:** `clinical-gate-read.service.ts` — `summarize`, `listHits`,
  `recordVerdict`, `exportCsv`.
- **Why a read model and not a second pipeline:** the stage persists its findings whether
  or not it acts on them, so the shadow dataset comes from the **same code path that would
  enforce**. There is no parallel simulation that can drift from production behaviour —
  what is measured is what will happen.
- **The load-bearing arithmetic decision:** **dormant evaluations are excluded from every
  rate.** A row where no pack was in force (or the condition was switched off) is not
  evidence that the rules found nothing. Counting them as clean claims would flatter the
  hit rate, the would-route rate and the false-positive rate simultaneously, and could
  make a barely-exercised gate look ready to go live. `dormant` is reported separately so
  the reviewer can see how much of the traffic the gate actually looked at.
- **`wouldRouteRate` is computed against IN-SCOPE claims only** — it is the guard against
  the failure the spec names in §7 (E3): a rule that fires on a third of claims is not a
  control, it is a re-routing of the book to the same humans it was meant to free.
- **Verified:** `tests/integration/diagnosis-gate-shadow-read.integration.test.ts` —
  **9/9 green**; **51/51 across all four DG DB suites** together.
  Proves: dormant exclusion (2 dormant / 1 out-of-scope / 5 in-scope from 8 rows) ·
  would-route rate 2/5 measured against in-scope only · per-rule claims vs findings counted
  separately (a claim with two findings for one rule counts once as a claim, twice as
  findings) · **no false-positive rate is reported until something has actually been
  reviewed** (null, not zero) · ambiguity and per-condition/per-test breakdowns · bounded
  pagination with an over-large page size capped at 200 rather than dumping · **no member
  identifier in either the list payload or the CSV** · a reviewer changing their mind
  updates rather than double-counting · an existing verdict is shown back rather than asked
  twice · the CSV export writes an audit-chain entry because the data leaves the platform.
  `tsc` clean · `eslint` clean · hermetic suite **1616 passed / 552 skipped / 0 failed**.
- **W-checklist:** W5 owed by C4.2 (the dashboard that calls this). Nothing here is
  reachable from the UI yet — recorded as an open thread, not a completed one.
- **Test-fixture notes for future suites:** `ClaimIntakeReceipt` requires `scopeKey`,
  `schemaVersion`, `suspectedDuplicateFingerprint`, `correlationId`, and `state`
  (PROCESSING|SUCCEEDED|REJECTED|FAILED — not `status`); `channel` is
  `ClaimIntakeChannel` (`ADMIN_PORTAL`, not `PORTAL`).

## C3.1 — Permissions, approval-matrix action, ensure-script
- **Date / commits:** 2026-08-06 · (this commit)
- **Anchors re-verified:** `prisma/seeds/rbac.ts` (`PERMISSIONS` array + `ROLE_PERMISSIONS`
  map; `ALL_PERMISSION_CODES` is computed after the array, so SUPER_ADMIN picks up new
  entries automatically), `approval-matrix.service.ts` `seedForTenant` (~l.124),
  `ApprovalMatrixManager.tsx` l.29, `approvals/page.tsx` l.17, `RolePermission`
  (composite key `@@id([roleId, permissionId])`, **requires `grantedById`**).
- **What was built:**
  - Four staff permissions in the catalog: `CLINICAL_PROTOCOL:VIEW/MANAGE/APPROVE` and
    `CLINICAL_GATE:REVIEW`.
  - Role grants: **MEDICAL_OFFICER** gets all four (the clinical content owner);
    **CLAIMS_OFFICER** gets VIEW + REVIEW only — working the clinical queue must not
    imply authoring or approving medicine.
  - Default matrix rule `CLINICAL_PROTOCOL_CHANGE → MEDICAL_OFFICER`, band-less.
    **Deliberately NOT the money checker (FINANCE_OFFICER) that `AUTO_ADJ_POLICY_CHANGE`
    uses:** what is being approved here is medicine. Maker ≠ checker is enforced per
    request on identity, so a MEDICAL_OFFICER checker means "a second clinician".
  - Dropdown entry + approvals-queue label.
  - `scripts/diagnosis-gate/ensure-tenant-wiring.ts` for **existing** tenants.
- **Verified:**
  - Ensure-script run against the seeded DB: dry-run → run (**4 permissions, 10 role
    grants, 1 matrix rule**) → **second run a clean no-op** ("Everything was already
    wired"). Idempotency proven by execution, not by inspection.
  - **Dry-run accuracy bug found and fixed during verification:** the first dry run
    reported *0 role grants* on a fresh system, because grants are skipped when the
    permission row does not exist yet — and on a dry run it never will. A dry run that
    silently under-reports is worse than none, since ops would size the change from it.
    It now reports the grants it would make.
  - `tests/services/diagnosis-gate-wiring.test.ts` (13 hermetic tests) pins the three
    places that must agree: catalog, role grants, and the action (enum + seed + dropdown
    + label map + **both** dispatch branches). Also asserts CLAIMS_OFFICER does **not**
    hold MANAGE/APPROVE, and that the ensure-script mirrors the seed.
  - `tsc` clean · `eslint` clean · hermetic suite **1630 passed / 552 skipped / 0 failed**.
- **Canary updated (truthfully, and strengthened):** `approval-matrix.service.test.ts`
  asserted `seedForTenant` creates exactly 4 rules; it now creates 5. Updated to 5, the
  `create` assertion widened to 2 calls with an explicit `CLINICAL_PROTOCOL_CHANGE →
  MEDICAL_OFFICER` check, the re-provision case extended to a third `count` mock, and a
  **new** case added for the real upgrade path: a tenant that predates the gate, where
  bands and the policy rule exist and only the clinical rule is missing.
- **W-checklist:** **W1 ✓** (catalogued, granted, and backfilled for existing tenants).
  **W2 ✓** (enum + seed + dropdown + label map + dispatch, with a test for each).
  W4/W5/W7/W8 remain owed by C3.2–C3.4 — no UI ships in this package.
