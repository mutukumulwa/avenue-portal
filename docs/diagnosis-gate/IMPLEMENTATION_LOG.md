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
