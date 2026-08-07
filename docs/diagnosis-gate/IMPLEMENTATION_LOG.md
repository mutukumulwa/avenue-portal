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

## C3.2 / C3.3 — Protocol library UI and governance end-to-end
- **Date / commits:** 2026-08-06 · (this commit)
- **What was built:** `/settings/clinical-protocols` (library: in-force summary, import form,
  version table) and `/settings/clinical-protocols/[id]` (lifecycle actions, contents,
  per-condition switches, test table with the provider-facing messages). Five server
  actions. Nav entry. Import accepts the **converter's pack.json**, not the workbook — the
  reviewed artifact stays small, diffable and deterministic.
- **★ THE WALKTHROUGH FOUND TWO REAL BUGS THAT EVERY OTHER CHECK MISSED.** `tsc`, `eslint`,
  `next build` and 1600+ tests were all green with both defects present. This is the entire
  justification for W8.
  1. **`NEXT_REDIRECT` reported as an error to the user.** Next.js implements `redirect()`
     by **throwing**. Every action had its success `done()` inside the `try`, so the redirect
     throw was caught by the `catch` and re-reported as the failure "NEXT_REDIRECT" — a red
     error banner on a successful submit. Fixed in all five actions by doing the work in the
     `try` and redirecting **after** it; the hazard is documented on the helper so the next
     action added here cannot repeat it.
  2. **W4 violation — the intended user could not reach the page.** The page was added under
     Setup, but `showSetup` in `AdminSidebar` is `ADMIN_ONLY`. A MEDICAL_OFFICER — the
     clinical content owner, the one role that holds `CLINICAL_PROTOCOL:MANAGE` — had no nav
     path to it. Moved to the **Clinical** group with a new `CLINICAL_ROLES` list that
     mirrors `ROLES.CLINICAL` **exactly**; deliberately not the broader `OPS`, because a nav
     link shown to a role the page rejects is the documented OBS-6 bug (a link that only
     leads to Access Denied).
- **Walkthrough performed (W8), against the throwaway DB on a separate port so no real data
  was touched.** Signed in as **medical@medvex.co.ug (MEDICAL_OFFICER, not an admin)** —
  deliberately, to prove the permission wiring works for a normal role:
  1. `/settings/clinical-protocols` renders; dormant state reads "No clinical content is in
     force. The diagnosis gate is dormant: every claim passes it untouched."
  2. The **import form is visible**, proving `CLINICAL_PROTOCOL:MANAGE` resolves for this role.
  3. "Clinical Protocols" appears in the **Clinical** nav group (after the W4 fix).
  4. Detail page shows status/approved/in-force/checksum + "Send for approval" → clicked →
     status became **pending approval** with "Waiting for a second clinician…".
  5. Signed in as **admin@medvex.co.ug** (a different user): `/approvals` listed
     **"Clinical protocol change"** — the human label, not a raw enum — with
     **"Level 1 of 1 — needs MEDICAL OFFICER"**, proving the matrix rule resolved.
  6. Clicked **Approve L1** → pack became **approved**, and **"Put in force" stayed `—`**,
     proving approval and activation remain distinct acts as designed.
  7. Clicked **Put this version in force** → **"In force"** badge, dated, with the green
     banner *"This version is now in force. The gate still records only — no claim is routed
     until the clinical gate is switched on."* (also confirming the NEXT_REDIRECT fix).
- **Audit-coverage harness caught a third issue (and was right to).** `audit-coverage.test.ts`
  requires every server action to audit or be catalogued. The actions **do** audit, but
  through a local helper the harness cannot see through. Fixed the honest way — renamed the
  helper `auditProtocol(` and registered that token, exactly mirroring the existing
  `auditPolicy(` precedent — **not** by adding an exclusion.
- **Verified:** `tsc` clean · `next build` clean with both routes emitted
  (`/settings/clinical-protocols`, `/settings/clinical-protocols/[id]`) · hermetic suite
  **1630 passed / 552 skipped / 0 failed**.
- **Pre-existing issue, NOT introduced here and deliberately not fixed:** `eslint` reports
  `react-hooks/set-state-in-effect` in `AdminSidebar.tsx` (~l.252, the auto-open
  `useEffect`). Confirmed pre-existing by stashing this branch's changes and re-running.
  Out of scope for this package; recorded so it is not mistaken for gate work.
- **W-checklist:** **W4 ✓** (reachable by the intended role — after the fix). **W5 ✓** (every
  action invoked by a shipped page). **W8 ✓** (walkthrough above). W7 owed by C3.4.
- **Deviations:** the file-upload step of the import could not be automated in the preview
  pane (no file-upload tool for that surface), so the DRAFT for the walkthrough was created
  by calling the same service the action calls; the form's rendering and permission gating
  were verified visually, and the service path has 11 integration tests.

## C3.4 — Policy flags and claim-detail surfacing
- **Date / commits:** 2026-08-06 · (this commit)
- **What was built:**
  - `clinicalGateEnabled` + `requireClinicalGroup` as checkboxes on the **existing governed
    policy-draft form** (`/settings/auto-adjudication`). They ride the existing
    `AUTO_ADJ_POLICY_CHANGE` maker/checker path — they are policy fields, so switching the
    clinical gate on is already a governed money-control change. **No new mechanism was
    invented for them.** Both default off, so a policy drafted without touching them keeps
    the stage in record-only mode.
  - A **"Clinical gate" column** on the policy table ("May route" / "Records only", plus
    "governed diagnosis required"). A flag that can only be *set* is half-wired: without
    this the only way to know whether the gate may route is a database query.
  - **`ClinicalFindings`** on the claim detail's automation timeline. The stage chips only
    showed `CLINICAL — ROUTED`, which tells a reviewer nothing about *which* test was
    questioned. Findings now render in plain language ("Test not indicated by the
    diagnosis", "Repeated inside its clinical window", "No confirmatory test on record"),
    with the pack's own provider-facing message, the earlier claim numbers for a repeat,
    and an explicit "recorded only — this claim was not diverted" marker in shadow mode.
    It closes with the standing caveat that a clinical finding never declines a claim.
  - `getClaimProcessingTimeline` now also selects `result` and `safeMessage`. The stage
    result is safe by construction — codes, test names and claim numbers only, never a
    member identifier, amount, or clinical free text.
- **Verified:** `tsc` clean · `eslint` clean · hermetic suite **1630 passed / 552 skipped /
  0 failed** · `next build` clean with both routes emitted and 166 pages generated.
- **Flaky-build note (not a code defect):** one `next build` run died inside webpack's
  `WasmHash._updateWithBuffer` ("Cannot read properties of undefined"). A clean rebuild
  (`rm -rf .next`) succeeded, as did two earlier runs. It is a webpack/Node interaction,
  not a change here — recorded so a future run that hits it is not misread as a regression.
- **W-checklist:** **W7 ✓** — every behaviour flag is now editable in the admin UI by the
  intended role and readable in the policy table; none is env-var-only or DB-console-only.
  **W6 ✓** — every clinical route code renders on the claim with its own wording.
- **Deviations:** none.

---

# Phase C0–C3 complete — status summary

**All buildable packages up to the shadow campaign are done.** Nine commits, every one
green on `tsc` + `eslint` + the full suite.

- Hermetic suite: **1630 passed / 552 skipped / 0 failed** (baseline was 1569 passed).
- Diagnosis-gate real-DB suites: **51/51** across four files (opt-in via `AUTOPILOT_TEST_DB`).
- `next build` clean; both new routes emitted.

**The safety property still holds end to end:** deploying everything committed changes no
claim's outcome. The stage is inert with no pack in force; a pack requires import →
approval by a second clinician → deliberate activation; and even then findings are
recorded only until `clinicalGateEnabled` **and** the specific condition are switched on.
Proven, not asserted: the additive schema push against a populated database left an
existing **LIVE** autopilot policy running with `clinicalGateEnabled=false`.

**Next up (C1.4, C1.5, C4):** the WHO ICD-10↔11 crosswalk (may be BLOCKED-EXTERNAL), the
alias-coverage report (needs production-like claim data), then the C4 shadow campaign —
which is gated on **G-C0, the clinical owner signing the spec** and filling in the pilot
conditions (§6) and the numeric exit criteria (§7).

## C3.5 — Capability resolution (production authorisation fix)
- **Date / commits:** 2026-08-06 · (this commit)
- **★ WHY THIS PACKAGE EXISTS — the feature shipped INOPERABLE to production.** The C3.2
  UI gated every button on `rbacService.hasPermission`. Discovered while running the C3.1
  wiring script against production: it reported *"role MEDICAL_OFFICER not present,
  skipping"* for every role. Production has **0 `Role`, 0 `Permission`, 0
  `RolePermission`, 0 `UserRoleAssignment`** rows — the granular RBAC layer was never
  adopted there. The platform actually authorises on `User.role` + `requireRole` (214
  admin surfaces do; only ~6 services use capabilities). And `hasPermission` requires a
  `UserRoleAssignment` with **no SUPER_ADMIN bypass**, so it returned false for
  *everyone*: the page rendered, the import form was hidden, and every action refused.
  **This is the F76-GAP-02 failure reproduced through a different door** — it was invisible
  locally because the dev database *is* seeded, which is exactly why it survived tsc,
  eslint, 1630 tests, a clean build and a full UI walkthrough.
- **What was built:** `src/server/services/diagnosis-gate/authorisation.ts` —
  `hasClinicalCapability(userId, role, capability, tenantId)` with a three-step rule:
  1. granular grant → **allow**;
  2. user has ANY granular assignment → the granular model is in use for them, so its
     **deny is authoritative** (a deliberate revocation must not be undone by a fallback);
  3. otherwise → fall back to the platform's role model.
  Both pages and all five actions now use it; no `rbacService` reference remains in the
  gate UI.
- **Scoped deliberately.** `rbacService.hasPermission` itself is UNCHANGED. Altering it
  globally would silently change authorisation for blacklist, overrides, provider access
  and claim reconsideration — a security change well outside this engagement.
- **Not a loosening.** In an environment with no granular RBAC the capability is currently
  held by nobody, so the feature is dead; the fallback grants exactly what
  `prisma/seeds/rbac.ts` grants, so the two models agree. Maker ≠ checker is untouched —
  enforced on user identity, never on capabilities. The approval matrix is unaffected:
  `roleAuthorised` already works off the `User.role` enum.
- **Verified:** 26 new tests (`diagnosis-gate-authorisation.test.ts`) covering all three
  steps, including that **a granular deny beats the fallback even for SUPER_ADMIN**, that
  a claims officer can work the queue but cannot author or approve medicine, that unknown
  capabilities and null roles fail closed, and that a thrown assignment-count fails closed.
  Crucially it also asserts **the fallback table and the RBAC seed grant the same
  capabilities** — two models that disagree would authorise differently per environment,
  which is how this class of bug returns.
  `tsc` clean · `eslint` clean · hermetic **1656 passed / 552 skipped / 0 failed** ·
  DG real-DB **51/51** · `next build` clean.
- **W-checklist:** W1 revisited — the capability is now genuinely reachable by the
  intended role in an unseeded environment, which is what W1 was always meant to
  guarantee.
- **LESSON (recorded for the next feature):** "permission seeded + granted" is not
  sufficient. The question is *"does the target environment use this authorisation model
  at all?"* — verify against production's actual RBAC state, not the seeded dev database.

---

# Phase C7 — v0.1 intake & rule-correctness hardening

## C7.1 — R3/R4 day-level arithmetic + sub-day inertness (DG-D14)
- **Date / commits:** 2026-08-07 · (this commit)
- **Anchors re-verified:** R3 ms-arithmetic at `stage-clinical.ts:347–349`, R4 lookback
  `:371`, validator V4 window check, shadow `summarize` accumulators — all as recorded in
  `PLAN_C7_V01_INTAKE.md` §3.
- **★ THE BUG.** `Claim.dateOfService` is date-only, but R3/R4 did millisecond arithmetic
  on it. With v0's REAL windows (Malaria RDT 12 h, smear 12 h, electrolytes 12 h, RBS
  4 h) that meant **false positives** — any two same-day claims flagged, including ones
  8 h apart that a 12 h rule permits — **and false negatives**: two claims 2 h apart
  either side of midnight never flagged. Both directions wrong, on 4 of 22 tests.
- **What was built:**
  - `pack-types.ts`: `MIN_ENFORCEABLE_WINDOW_HOURS`, `windowDays`, `isSubDayWindow`,
    `floorToUtcDay`, `dayDifference` — one shared definition, imported by both the stage
    and the validator (the same divergence-by-construction rule as `normaliseAliasValue`).
  - R3/R4 compare **whole UTC calendar days**, the resolution the data actually has.
    Windows < 24 h are **not evaluated** and are recorded as `inertRules` on the stage
    result — a rule we could not check must never look like a rule that found nothing.
  - **Correctness detail beyond the plan:** an unverifiable R4 *lookback* now also
    suppresses the missing-confirmation finding (`lookbackUnverifiable`). Asserting "no
    confirmatory test on record" after failing to check the record would state something
    we do not know. Inert rules ride the result whether or not any hit was found.
  - Validator **V12** `REPEAT_WINDOW_SUBDAY_UNENFORCEABLE` (WARNING — legal but inert
    content, the V10 philosophy) + `subdayWindowRules` stat.
  - Shadow read model: `inertRules` breakdown on `ShadowSummary` and `inertEvaluations`
    per `RuleSummary`, so coverage numbers cannot silently exclude unchecked rules.
- **Test rewrite — deliberate, and the honest option.** Five existing R3 tests used
  Malaria RDT (12 h) and RBS (4 h): they were **asserting behaviour that was wrong**.
  Rather than mutate the fixture's windows to keep old assertions green — which would
  have hidden the defect — the enforceable-path tests moved to LAB010 (720 h = 30 days,
  day-level) and the sub-day cases became explicit inertness tests. The fixture keeps
  v0's real values, so the suite now demonstrates the bug it fixes.
- **Verified:** DG DB suites **56/56** (was 51; rules file 22, was 18) incl. a **30/31-day
  boundary test** (inclusive at the edge, excluded the day after — where an off-by-one
  silently changes a clinical rule), three inertness cases, and the same-service-date
  single-flag determinism test still green. Validator unit **35** (was 28) incl. a
  parametrised 4/12/23 h warn vs 24/72/720 h no-warn boundary. `tsc` + `eslint` clean;
  hermetic **1663 passed / 557 skipped / 0 failed**. **`pack-v0.json` re-run
  byte-identical** (converter untouched) and the v0 report now carries
  `V12 × 4` — exactly the four sub-day tests predicted from the source.
- **Housekeeping:** removed two byte-identical iCloud duplicate files
  (`authorisation 2.ts`, `diagnosis-gate-authorisation.test 2.ts`) verified identical
  before deletion.
- **W-checklist:** n/a (no new user-facing capability; the shadow dashboard renders the
  new counts through existing C4.2 surfaces — no UI shipped in this package).

## C7.2 — R1 no-winner ambiguity + validator V11 (DG-D15)
- **Date / commits:** 2026-08-07 · (this commit)
- **Anchors re-verified:** `resolveGroup` first-match pick at `stage-clinical.ts:125`,
  `ambiguous` flag at `:134`, base-result assembly, validator V9 seam.
- **★ THE BUG.** `resolveGroup` returned `[...distinct.values()][0]` — the FIRST group the
  database happened to return — then set `ambiguous: true` as a note. So which condition's
  clinical rules ran was decided by row order, which is not even stable across queries.
  This is not a rare edge: **85 ICD codes (12.7% of v0's mappings, 172 memberships)** sit
  in more than one condition. `CA09` is in Allergic Rhinitis, Nasopharyngitis AND
  Pharyngitis — clinically defensible, since ICD hierarchies overlap, but it leaves the
  engine no principled way to choose. Verified by recomputing from v0 directly.
- **What was built:**
  - `resolveGroup` returns `ResolvedGroup | AmbiguousGroups | null`. On ambiguity it
    returns every candidate (sorted by group code, so the record is stable across runs)
    and **the stage evaluates no rules at all** — it PASSes with `ambiguous: true` and
    `candidateGroups`. No tie-break exists anywhere in the code.
  - **Strict mode counts ambiguity as unresolved:** `requireClinicalGroup` routes
    `CLINICAL_SCOPE_REVIEW`, because matching several conditions is not a governed
    resolution.
  - Validator **V11** `CODE_IN_MULTIPLE_GROUPS` (**ERROR** — DG-D15), reported **per code,
    not per membership**, so 85 conflicts read as 85 decisions rather than 172 rows.
    Names every owning condition in the message. Stat: `crossGroupCodes`.
  - Shadow `listHits` carries `candidateGroups`; the claim-detail panel renders a plain
    explanation ("Clinical checks not run — the diagnosis matches more than one governed
    condition… This is a gap in the protocol content, not a finding about the claim"),
    plus a "Not checked" line for C7.1's inert rules. A reviewer seeing an empty clinical
    section would otherwise reasonably assume the claim had been examined and found clean.
- **Verified:** DG DB **58/58** (scope file 15, was 12). The old "flags an ambiguous
  resolution" test was **rewritten**, not patched: it now asserts PASS with zero ruleHits,
  **no `groupCode` claimed**, and both candidates named — plus a new test that candidate
  ordering is stable regardless of diagnosis order, and one for strict-mode routing.
  Validator unit **38** (was 35) incl. per-code-not-per-membership and a guard that the
  same code under ICD-10 and ICD-11 is normal dual-accept content, not a conflict.
  `tsc` + `eslint` clean; hermetic **1666 passed / 559 skipped / 0 failed**.
- **v0 report regenerated:** now carries **V11 × 85** (exactly the number independently
  recomputed from the workbook) and V12 × 4. Total blocking errors 66 → **151**. That rise
  is the point: V11 surfaces a defect that was previously invisible *and* silently
  degrading every affected claim to "no rules evaluated". `pack-v0.json` byte-identical —
  this is a validator change, not a conversion change.
- **W-checklist:** W6 ✓ (the ambiguous state renders on the claim with its own wording).
