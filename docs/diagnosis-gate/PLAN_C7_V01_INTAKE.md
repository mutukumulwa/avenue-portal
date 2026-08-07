# Diagnosis Gate — Phase C7: v0.1 Remediation Intake & Rule-Correctness Hardening

| | |
|---|---|
| **Plan** | Addendum to `/DIAGNOSIS_GATE_EXECUTION_PLAN.md` (phase C7, packages C7.1–C7.5) |
| **Version** | 1.0 — 2026-08-07 |
| **Status** | READY TO EXECUTE — no human gate blocks C7.1–C7.4; C7.5 records two spec decisions for the (still unsigned) DG-1.0 spec |
| **Trigger** | `ICD11_Codes_Mapped_with_Clinical_Features_v0.1_research_remediated.xlsx` (AI-remediated annex of workbook v0, received 2026-08-07, already at `docs/diagnosis-gate/source/`, sha256 `1d19d25e41a165f935100bbb…`) |
| **Branch** | `feat/diagnosis-gate` (continue; already tracks `origin/feat/diagnosis-gate`) |
| **Schema impact** | **NONE.** No Prisma change anywhere in C7 — `icdRelease` lives in the pack JSON meta and the pack row's existing `validationStats Json` (schema.prisma:8192). No `db push`, no prod DDL, no deploy ops step. |

Execution rules, hard prohibitions, W-invariants, environment runbook: **§0, §7, §8 of the
root plan apply unchanged.** Re-verify every anchor cited here before editing (§0.1.1);
all anchors below were re-verified 2026-08-07.

---

## 1. Why this phase exists

Analysis of the v0.1 annex (verified independently, not trusted) produced three findings
against **our own implementation** and one intake opportunity:

1. **R3 is incorrect for sub-day windows.** `Claim.dateOfService` is date-only in
   practice; 4 of 22 tests have windows < 24 h (RBS 4 h; RDT, smear, electrolytes 12 h).
   `stage-clinical.ts:349` does millisecond arithmetic on that field ⇒ same-day repeats
   always flag (false positive at 8 h apart under a 4 h window) and cross-midnight
   repeats 2 h apart never flag (false negative). Verified from v0 directly.
2. **R1 ambiguity resolution is order-dependent.** 85 ICD codes (12.7%) map to more than
   one condition (172 memberships — e.g. `CA09` ∈ Allergic Rhinitis, Nasopharyngitis,
   Pharyngitis). Verified by recomputation. `stage-clinical.ts:125` picks
   `[...distinct.values()][0]` — effectively DB row order — then marks `ambiguous`.
   Database ordering must never decide which clinical rules run. The validator has no
   rule for cross-group codes at all.
3. **The converter cannot open v0.1.** `exceljs` throws
   `Cannot read properties of undefined (reading 'sheets')` at
   `convert-workbook.ts:136` on this openpyxl-authored file, while openpyxl reads it
   fine. Any workbook the clinical team round-trips through Python tooling will hit this.
4. **The annex itself** supplies, in machine-readable form, most of what the red report
   asked for: stable `CIG-nnn` codes, an 80-row alias table with judgement calls
   segregated, resolved lab→group links, malaria confirmatory candidates, provider-safe
   messages, a filled claims-gate sheet, and an ICD release target. All rows are
   `PENDING_CLINICAL_SIGNOFF` — it proposes, it does not decide.

## 2. Decisions (append to the spec's decision log; spec numbering is authoritative)

| id | Decision |
|---|---|
| **DG-D14** | A repeat window **shorter than 24 h is unenforceable on date-only claim data**. Import warns; the stage records the rule as inert and never evaluates it; the shadow report displays it as inert. Enforcing it (either way) on date-resolution data would be guessing. Day-level windows (≥ 24 h) are evaluated on **calendar-day arithmetic** (floor both dates to day, compare day difference to `floor(windowHours/24)`), not milliseconds. |
| **DG-D15** | **Ambiguity never selects a winner.** If a claim's diagnosis codes resolve to more than one group, NO rules are evaluated; the stage passes with `ambiguous: true` and ALL candidate group codes recorded. A new validator rule (V11) makes an unresolved cross-group membership a **blocking error** at import — the clinical team assigns each code to exactly one group (their own review queue already says this). No silent tie-break exists anywhere. |
| **DG-D16** | **Annex acceptance is status-gated.** When v0.1 annex sheets are present the converter consumes them, importing ONLY rows whose status is machine-verifiably settled: aliases with `Resolution_Status ∈ {DETERMINISTIC_NORMALIZATION, PRESERVED}` (never `SCOPE_REVIEW_REQUIRED`); confirmatory links ONLY when `Confirmatory_Status`/`Clinical_Approval_Status` says approved (v0.1 has none approved ⇒ none import — correct). Pending rows are reported, not imported. |
| **DG-D17** | Provider-facing text prefers `Provider_Message_v0_1` over v0's `Failure_Message` when present — v0 messages are sometimes clinician shorthand ("No fever/history of fever") unfit to show a provider. |
| **DG-D18** | The pack pins its **ICD release target** (`icdRelease`, e.g. "WHO ICD-11 MMS 2026-01") in pack meta, persisted inside the existing `validationStats` JSON. Recorded as a validation *target*, not a claim that codes were verified against that release. |
| **DG-D19** | The annex's `EMERGENCY_BYPASS` outcome is adopted **as a spec concept only**, parked in the C6 backlog: it requires structured emergency evidence ("never infer from free text alone" — their wording, kept). Not buildable in Rung 1. |

## 3. Verified anchors (2026-08-07; locate-if-moved per root plan §4)

| Anchor | Where |
|---|---|
| R3 window arithmetic to change | `src/server/services/claim-autopilot/stage-clinical.ts:347–349` (`repeatWindowHours == null \|\| <= 0` guard; ms `cutoff`) |
| R4 lookback arithmetic (same treatment: day-level for ≥24 h) | same file, `:371` |
| R1 first-match pick + ambiguous flag | same file, `:125` (`[...distinct.values()][0]`), `:134` |
| Validator rule seams (V9 at `:126`, V10 at `:178`, error split at `:215`) | `src/server/services/diagnosis-gate/pack-validate.ts` |
| Converter: `SHEET` consts `:49`, threshold `:61`, `readFile` `:136`, `--aliases` CLI `:147`, failureMessage verbatim `:311` | `scripts/diagnosis-gate/convert-workbook.ts` |
| `PackMeta` (`:76`) / `AliasMatchType` (`:26`) | `src/server/services/diagnosis-gate/pack-types.ts` |
| Shadow counters `ambiguous`/`dormant` (`:52–53`, `:110–124`) | `src/server/services/diagnosis-gate/clinical-gate-read.service.ts` |
| Ground-truth lock pattern (`skipIf(!present)` on `pack-v0.json`, `:275–278`) | `tests/services/diagnosis-gate-pack-validate.test.ts` |
| `validationStats Json?` | `prisma/schema.prisma:8192` |
| v0.1 annex ground truth (measured this session) | 17 sheets; `Conditions v0.1` 40 rows ×11 cols; `Name Aliases v0.1` 80 rows (53 DETERMINISTIC / 25 PRESERVED / 2 SCOPE_REVIEW_REQUIRED); `Lab Rules v0.1` 22×26 incl. `Supported_Group_Codes_Auto`, `Proposed_Confirmatory_Group`, `Provider_Message_v0_1`; `ICD Mapping Review` 671 rows (497 VALID / 172 AMBIGUOUS_CROSS_GROUP_BLOCK / 2 EMPTY_CODE_BLOCK); cross-group codes **85**; sub-day tests **4** (LAB003/004/012/019); original six v0 sheets byte-preserved except the features sheet name **lost its trailing space** |

**Anti-hallucination note for the executor:** the v0.1 numbers above are the regression
yardstick. If your run reproduces different counts, your parser is wrong — the file has
not changed (checksum-pin it in C7.4).

## 4. Packages

Order is mandatory: C7.1 → C7.2 are pure correctness (no annex dependency and must not
wait); C7.3 unblocks reading the file; C7.4 consumes it; C7.5 closes the docs.

---

### C7.1 — R3/R4 day-level arithmetic + sub-day inertness (correctness)

**Objective.** Repeat/lookback windows evaluate on calendar days; sub-day windows become
visibly inert instead of silently wrong.

**Build spec.**
- `pack-types.ts`: export `const MIN_ENFORCEABLE_WINDOW_HOURS = 24` and
  `windowDays(hours: number): number` (= `Math.floor(hours / 24)`) — one shared
  definition, converter and stage both import it (the same divergence-by-construction
  rule as `normaliseAliasValue`).
- `stage-clinical.ts` R3 (`:347`): skip rules with `repeatWindowHours < 24` — but record
  the skip: add `inertRules?: Array<{ rule: "R3"; testCode: string; reason: "SUBDAY_WINDOW_DATE_ONLY_DATA" }>`
  to `ClinicalStageResult` so the shadow report can count what it is *not* checking.
  For ≥ 24 h: `dayDiff = floorDay(claim.dateOfService) − floorDay(prior.dateOfService)`
  (UTC floor); prior is a repeat when `0 ≤ dayDiff ≤ windowDays(hours)` **and** prior is
  "earlier" under the existing total order (`fetchPriorLines` tie-break unchanged — the
  same-service-date single-flag property must survive; its test pins it).
- R4 lookback (`:371`): same day-level arithmetic; `confirmationLookbackHours` of 72 ⇒ 3
  days. Sub-day lookback values (none exist in v0/v0.1) get the same inert treatment.
- `pack-validate.ts`: new **V12** `REPEAT_WINDOW_SUBDAY_UNENFORCEABLE` (**WARNING** —
  legal content, inert rule; mirrors V10's philosophy) for `0 < repeatWindowHours < 24`;
  stats gain `subdayWindowRules`.
- `clinical-gate-read.service.ts`: `summarize` counts `inertRuleHits` per test from the
  recorded `inertRules`, surfaced in `RuleSummary`/`ShadowSummary` so E4-style coverage
  numbers cannot silently exclude the 4 tests.

**Tests.** Unit (validator V12: 4 h and 12 h warn, 24 h and 720 h do not; boundary 23 h
warns, 24 h does not). DB suite (`diagnosis-gate-rules.integration.test.ts` — new cases,
existing epoch-window pattern): same-day repeat under a 12 h window → **no flag, inert
recorded**; 90-day window (HbA1c) flags at 89 days, passes at 91; cross-midnight 2 h
apart under an inert 12 h window → no flag, inert recorded; existing 18 tests stay green
(the day-level change must not alter any current assertion — all existing fixtures use
≥ 24 h effective gaps except the "inside window" cases, which use 720 h/12 h: **re-check
each existing R3 fixture against day-level semantics and adjust epochs, not assertions,
where an hour-based gap becomes same-day**).

**Acceptance.** tsc/eslint clean; DG DB suites green; hermetic suite green; shadow
summary shows the 4 v0-derived tests as inert once a pack containing them is active
(asserted in the shadow-read DB suite with a seeded `inertRules` stage row).

---

### C7.2 — R1 no-winner ambiguity + validator V11 (correctness)

**Objective.** Ambiguity stops selecting a group; cross-group codes become an import-time
clinical decision.

**Build spec.**
- `stage-clinical.ts` `resolveGroup` (`:98–136`): when `distinct.size > 1` return a new
  shape `{ ambiguous: true, candidates: [{groupCode, groupName}, …] }`; the stage then
  (step 5/6 of §6.2) evaluates **no rules**, PASSes with
  `{ ambiguous: true, candidateGroups: [...] }` in the result (replaces the current
  pick-first-then-flag at `:125`). `requireClinicalGroup` strict mode treats ambiguous
  as **unresolved** (routes `CLINICAL_SCOPE_REVIEW`) — an ambiguous diagnosis is not a
  governed resolution.
- `pack-validate.ts`: new **V11** `CODE_IN_MULTIPLE_GROUPS` (**ERROR** — DG-D15; one
  error per code, not per membership, listing the group codes; mirrors the summarise
  bucketing so 85 codes ⇒ 85 rows in the full list, not 172). Stats gain
  `crossGroupCodes`.
- `clinical-gate-read.service.ts`: `ambiguous` claims are already counted (`:110`);
  additionally exclude them from `inScope` rule denominators? **No** — keep them
  in-scope (they resolved to governed content) but never rule-evaluated; document in the
  service header. Surface `candidateGroups` in `listHits` detail rows when present.
- `AutomationPanel` `ClinicalFindings`: render the ambiguous case ("diagnosis matches
  more than one governed condition — not evaluated") so a reviewer isn't shown silence.

**Tests.** Unit (V11: two-group code errors once with both names; single-group clean).
DB (stage-scope suite): the existing "flags an ambiguous resolution" test is **rewritten**
to the new semantics — ambiguous ⇒ PASS, no ruleHits even when an unsupported test is
billed, candidates listed; strict mode ⇒ `CLINICAL_SCOPE_REVIEW`. Ground-truth: fixture
pack gains a deliberately cross-group code to drive these.

**Acceptance.** As C7.1, plus: grep proves `[...distinct.values()][0]` is gone.

---

### C7.3 — Converter reader hardening

**Objective.** The CLI opens openpyxl-authored files.

**Build spec.** Diagnose the `exceljs` failure on the vendored v0.1 first (≤ 30 min
timebox — likely its workbook-XML expectations). Two acceptable outcomes, in order of
preference: (a) a tolerant-open fix/wrapper around exceljs; (b) add **SheetJS `xlsx` as
a devDependency used by the CLI converter only** — the server never parses xlsx (C3.2
imports pack.json), so the runtime dependency posture is unchanged. Outcome (b) amends
the C0.3 "use exceljs, do not add xlsx" correction — record the reversal and its reason
in the log explicitly. Either way: identical parsed output for v0 (byte-identical
`pack-v0.json` on re-run — the determinism check IS the regression test) and a
successful open of v0.1.

**Acceptance.** `pack-v0.json` re-run byte-identical; v0.1 opens; converter unit surface
unchanged.

---

### C7.4 — Annex-format intake (v0.1 sheets) + v0.1 red report

**Objective.** The converter consumes the annex under DG-D16/D17/D18, producing the
structured v0.1 report that goes back to the team.

**Build spec** (`convert-workbook.ts`; annex detected by presence of `Conditions v0.1`):
- **Groups** from `Conditions v0.1`: `Group_Code` (authored ⇒ `GROUP_CODES_NOT_AUTHORED`
  error no longer fires), `Canonical_Name`, `Proposed_Is_Catch_All` (TRUE ⇒
  `isCatchAll: true` — it remains a *proposal* in workbook terms but imports as the
  safe value; DG-D8 keeps catch-alls permanently non-live regardless).
- **Aliases** from `Name Aliases v0.1` per DG-D16 (statuses `DETERMINISTIC_NORMALIZATION`
  + `PRESERVED` accepted; `SCOPE_REVIEW_REQUIRED` reported as pending, never imported).
  The CLI `--aliases` flag stays for non-annex workbooks; annex table wins when both
  exist (log a warning if both supplied).
- **Lab rules** from `Lab Rules v0.1`: SUPPORTED links from `Supported_Group_Codes_Auto`
  (semicolon-split, must resolve to defined groups — else conversion error, never a
  guess); confirmatory links from `Proposed_Confirmatory_Group` **only when approved**
  (v0.1: none are ⇒ zero confirmatory links import; the two malaria candidates appear in
  the proposals report with their `AUTHORITATIVE_CANDIDATE_PENDING_CLINICAL_SIGNOFF`
  status and WHO source); `failureMessage` prefers `Provider_Message_v0_1` (DG-D17).
- **Meta**: `PackMeta` gains optional `icdRelease?: string` read from the annex README /
  Source Register (`WHO ICD-11 MMS 2026-01`); `serialisePack` includes it (canonical
  ordering unchanged otherwise); `createDraftFromImport` already persists the whole
  stats object — add `icdRelease` into `validationStats` (no schema change).
- **Vendor + report:** checksum-pin the v0.1 file in `SOURCE_NOTES.md` (annex structure,
  measured counts, DG-D16 acceptance table); run the converter →
  `docs/diagnosis-gate/reports/v0.1-validation.md` + `v0.1-proposals.md`; commit the
  deterministic `pack-v0.1.json`.

**Expected v0.1 report invariants** (pin in a ground-truth-lock test mirroring `:275`):
40 groups **with authored CIG codes**; `GROUP_CODES_NOT_AUTHORED` **absent**;
`UNRESOLVED_FEATURES_NAME` **0** (aliases resolve all 40 feature rows);
**V11 fires for 85 codes**; `CONDITION_UNMAPPED`/`GROUP_HAS_NO_CODES` persist for the
same 5 conditions; `MAPPING_CODE_EMPTY` 2; V12 warns on the 4 sub-day tests;
confirmatory links **0**; catch-alls **3** (CIG-002/031/032). Verdict remains **NOT
IMPORTABLE** — correctly: the remaining blockers are precisely the open clinical
decisions in their own review queue. If any invariant differs at run time, stop and
reconcile before committing (do not adjust the test to match unexplained output).

**Acceptance.** Determinism (two runs byte-identical for BOTH packs); v0 conversion
byte-identical to the committed `pack-v0.json` (annex path must not disturb the legacy
path); all lock tests green; tsc/eslint/hermetic suite green.

---

### C7.5 — Docs, spec amendments, comms

**Objective.** Close the loop on paper.

- Spec (`DIAGNOSIS_GATE_SPEC.md`, still DRAFT/unsigned so amendable without re-signing):
  append DG-D14…D19 to §2; note `EMERGENCY_BYPASS` in §8 (out of scope, C6) and the §4
  table's `NOT_EVALUATED ≠ clinical pass` language (already true of the shadow model).
- Root plan: add phase C7 to the §19 package index; PROGRESS.md rows C7.1–C7.5;
  IMPLEMENTATION_LOG entries per package (per-package protocol §0.1.4 as always).
- `reports/v0.1-validation.md` framing paragraph for the clinical team: what the annex
  settled, what the 6 remaining decision sets are (their own Clinical Review Queue),
  explicit statement that **nothing from the annex is in force and none of its
  judgement calls were accepted without their sign-off**.
- Memory update at end of phase.

**Acceptance.** Docs consistent (grep: no reference to picking the "first" group
anywhere; sub-day semantics stated in spec + SOURCE_NOTES).

## 5. What C7 deliberately does NOT do

- **No import/activation of v0.1 content** — it stays NOT IMPORTABLE by its own open
  decisions; G-C0 unchanged.
- **No schema change, no prod DDL, no deploy ops step.**
- **No LOINC alias type, no emergency-bypass build, no ICD-10 mapping generation** —
  the annex explicitly warns against raw-string ICD-10 matching, which C1.4 already
  honours (crosswalk-or-blocked, never string-match).
- **No adoption of annex judgement calls** (`SCOPE_REVIEW_REQUIRED` aliases,
  confirmatory candidates, catch-all proposals beyond the safe-direction import of
  `isCatchAll: true`).

## 6. Risks

| Risk | Mitigation |
|---|---|
| Day-level change silently alters existing R3 behaviour | Existing 18-test DB suite must stay green with epochs (not assertions) adjusted; the same-date single-flag determinism test is the canary |
| Annex parsing drifts from the measured ground truth | §3 counts are pinned; lock test per C7.4; stop-and-reconcile rule |
| SheetJS fallback changes parsed values subtly | v0 byte-identical `pack-v0.json` re-run is the gate for ANY reader change |
| Ambiguity no-eval reduces apparent coverage in shadow | Deliberate and surfaced (`ambiguous` + `candidateGroups` in the report) — a smaller true number beats a larger false one |

## 7. Sizing

C7.1 ≈ C7.2 ≈ one focused package each (the tests dominate); C7.3 timeboxed diagnosis +
small; C7.4 the largest (converter + fixtures + report); C7.5 docs. Together ≈ one
C2-phase-sized day of work, all on the existing branch, all behaviourally inert in
production for the usual reason: no pack is in force.
