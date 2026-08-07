# Diagnosis Gate — vendored source notes

Every protocol pack originates from a clinical-team workbook vendored here verbatim.
Nothing in this directory is edited by engineering: it is the immutable input the
converter (`scripts/diagnosis-gate/convert-workbook.ts`) reads. If a value is wrong,
the clinical team issues a new workbook version — we never patch the source in place.

---

## v0 — `ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx`

| | |
|---|---|
| Received | 2026-08-06, from the Medvex business/clinical team |
| Original filename | `ICD11_Codes_Mapped_with_Clinical_Features.xlsx` |
| SHA-256 | `c10fac270f4aa0589032ae977f2210a8d8bef6ebb6f48f1013a29d0d73485d10` |
| Size | 901 KB |
| Status | **Pre-fix baseline.** Not importable as-is — see "Known defects". Retained as the provenance root and as the fixture source for tests. |

### Sheets (exact names — read programmatically, never retyped)

| # | Sheet name | Rows (incl. header) | Cols | Content |
|---|---|---|---|---|
| 1 | `ICD11 Codes` | 18,727 | 2 | ICD-11 master: `Code`, `Name` |
| 2 | `Commonest` | 40 | 1 | The "top 40" condition list. **No header row** — row 1 is data (`Malaria`) |
| 3 | `Diagnoses Mapped to ICD` | 672 | 3 | `Common Diagnosis`, `Matched ICD11 Code`, `ICD11 Diagnosis` |
| 4 | `Clinical Diagnostic Features ` | 41 | 17 | **Note the trailing space in the sheet name.** Data starts col B; `Field`, `Diagnosis`, then 14 clinical columns |
| 5 | `Commonest Labs Rationale` | 23 | 15 | `Test_ID`…`Failure_Message` (see below) |
| 6 | `Claims filter` | 1 | 1 | **Empty.** The decision-logic sheet was never filled — semantics are defined in `DIAGNOSIS_GATE_SPEC.md` §Failure semantics instead |

`Commonest Labs Rationale` columns, in order:
`Test_ID, Test_Name, Department, Requires_Diagnosis, Min_Symptoms, Min_Signs,
Mandatory_Symptoms, Compatible_Symptoms, Mandatory_Signs, Compatible_Signs,
Supported_ICD11_Diagnoses, Red_Flag_Exceptions, Repeat_Window_Hours, Audit_Rule,
Failure_Message`

`Clinical Diagnostic Features ` columns (B→Q):
`Field, Diagnosis, Typical Symptoms, Typical Signs, Other Common Symptoms,
Other Common Signs, Red Flag Symptoms, Red Flag Signs, Typical Duration, Typical Onset,
Clinical Suspicion Rule, Diagnostic Confirmation Rule, Recommended Investigations,
Expected Findings, Differential Diagnoses, References`

### Measured ground truth (2026-08-06)

These numbers are the regression yardstick for the converter and validator. The C1.3
validation report against v0 **must** reproduce them; a divergence means the converter
is misreading the workbook, not that the workbook changed.

- **ICD-11 master**: 18,726 data rows.
- **Commonest**: 40 conditions.
- **Diagnoses Mapped to ICD**: 671 data rows over **37 distinct** condition names.
  - **669** rows carry a code; **all 669 validate** against the `ICD11 Codes` master (zero unknown codes).
  - **2** rows have a condition name but an **empty code**: `Vaginal Candidiasis`, `Tinea Capitis`.
  - **3** of the 40 conditions have **no mapping row at all**: `Acute Rhinosinusitis (Sinusitis)`, `Chronic Obstructive Pulmonary Disease (Copd)`, `Gastroduodenitis`.
  - Highest mapping counts (breadth signal, see catch-alls): Atopy 109, Arthritis 44, Contact Dertmatitis 42, Hypertension 34, Urticaria 33, Peptic Ulcer Disease 32, Conjuctivitis 31, Diabetes Mellitus 29, Eczema 29, Acne 22.
- **Clinical Diagnostic Features**: 40 data rows, **all 16 columns 100% populated** (no blanks).
- **Commonest Labs Rationale**: 22 tests, `LAB001`–`LAB022`.
  - `Requires_Diagnosis = Yes` on 16 of 22.
  - `Repeat_Window_Hours` present on all 22; range 4 h (Random Blood Sugar) → 2,160 h / 90 d (HbA1c, Lipid Profile, Hepatitis B).
  - `Supported_ICD11_Diagnoses` is **free text**, semicolon-separated, and includes non-diagnoses (`STI assessment`, `Occupational exposure`, `Pregnancy`).

### Join-key integrity (the F1 defect, quantified)

The three content sheets link by **diagnosis display name**, and the spellings diverge.
Exact-string join `Commonest` ↔ `Clinical Diagnostic Features `:

- **24 / 40** match exactly.
- **2 / 40** match only after normalisation (case/space-insensitive):
  `OtitisExterna` ↔ `Otitis Externa`; `Viraemia of unknown origin` ↔ `Viraemia Of Unknown Origin`.
- **14 / 40** do not match even normalised — genuine spelling/wording divergence:

| `Commonest` | `Clinical Diagnostic Features ` |
|---|---|
| Alergic Rhinitis | Allergic Rhinitis |
| Upper Rerspiratory Tract Infection | Upper Respiratory Tract Infection (Urti) |
| Tonsilitis | Tonsillitis |
| Adeno-tonsilitis | Adenotonsillitis |
| Urinary Tract Infection | Urinary Tract Infection (Uti) |
| Pelvic Inflammatory disease | Pelvic Inflammatory Disease (Pid) |
| Peptic Ulcer Disease | Peptic Ulcer Disease (Pud) |
| Gasto-esophageal reflux disease | Gastro-Oesophageal Reflux Disease (Gerd) |
| Bactaeraemia of unknown origin | Bacteraemia Of Unknown Origin |
| Contact Dertmatitis | Contact Dermatitis |
| Eczema | Eczema (Atopic Dermatitis) |
| Acne | Acne Vulgaris |
| Atopic Conjuctivitis | Atopic Conjunctivitis |
| Conjuctivitis | Conjunctivitis |

Exact-string join `Commonest` ↔ `Diagnoses Mapped to ICD`: **37 / 40** (the 3 unmapped
conditions above; no spelling divergence on this pair).

**Consequence:** name-based joining is unsafe. Packs key on `groupCode` (DG-D2); the
converter resolves names to group codes through an explicit alias table and reports
every unresolved name as a validation error rather than guessing (plan §0.2).

### Known defects carried into the C1.3 validation report

Cross-referenced to the fix list sent to the clinical team on 2026-08-05:

| Fix | Defect in v0 | Validator rule |
|---|---|---|
| F1 | Join keys are misspelled display names (16/40 divergent) | V1 / unresolved-name error |
| F2 | Content is ICD-11; platform and provider feeds are ICD-10 | V3 (ICD-10 memberships absent until C1.4 crosswalk) |
| F3 | 3 conditions unmapped, 2 rows with empty codes | V1, V2 |
| F4 | `Supported_ICD11_Diagnoses` free text incl. non-diagnoses | V4 / unresolved-link error |
| F5 | Symptom & sign vocabulary uncontrolled | not validated in Rung 1 (C6 scope) |
| F6 | No drug/treatment sheet (pharmacy is the stated #1 problem) | out of Rung-1 scope; noted in report |
| F7 | Catch-alls: `Atopy` (109 codes), `Viraemia/Bacteraemia of unknown origin` | V7 → `isCatchAll`, permanently excluded from live (DG-D12) |
| F8 | `Claims filter` sheet empty | resolved in the spec, not the workbook |
| F9 | References are global (WHO, Hutchison's, Davidson's); no local STG anchor; no named owner/version | governance section of the spec |

---

## v0.1 — `ICD11_Codes_Mapped_with_Clinical_Features_v0.1_research_remediated.xlsx`

| | |
|---|---|
| Received | 2026-08-07, produced for the Medvex team by cross-referencing v0 against public sources |
| SHA-256 | `1d19d25e41a165f935100bbb4952de45454cf30944b27c6aceeda614777845e2` |
| Status | **Annex, not a replacement.** Still **NOT IMPORTABLE** — 109 blocking errors (down from v0's 151). Report: `../reports/v0.1-validation.md`. |

### What it did and did not change

v0.1 **preserves all six v0 sheets byte-for-byte** and adds eleven annex sheets alongside
them. It is therefore additive: converting v0 still produces the identical pack
(`pack-v0.json`), which is asserted by a test rather than assumed.

The four annex sheets the converter reads:

| Sheet | What the converter takes from it |
|---|---|
| `Conditions v0.1` | `Group_Code` (authored, stable — the F1 ask), `Canonical_Name`, `Original_v0_Name`, `Proposed_Is_Catch_All` |
| `Name Aliases v0.1` | alias → group code, **only** where `Resolution_Status` is a normalisation, never a scope decision |
| `Lab Rules v0.1` | `Supported_Group_Codes_Auto` (resolved links), `Provider_Message_v0_1`, and the confirmatory proposal + its two status columns |
| `Source Register` | the WHO ICD release string, recorded as a stated target (DG-D18) |

The remaining annex sheets (`Claims Gate v0.1`, red-flag and symptom vocabularies, the
change log) are **not** read. They describe chart data the claim rails do not carry, or
restate decisions that live in the spec.

### Status gating — what the annex proposed but the converter refused (DG-D16)

The annex marks its own confidence. Content that is not signed off is **reported, never
imported**, because accepting it would let a spreadsheet column stand in for a clinician's
signature:

| Annex content | Rows | Imported? |
|---|---:|---|
| Aliases marked `DETERMINISTIC_NORMALIZATION` / `PRESERVED` | 78 | ✅ yes — spelling and punctuation only |
| Aliases marked `SCOPE_REVIEW_REQUIRED` | 2 | ❌ no — deciding two labels mean one condition is clinical |
| Confirmatory tests marked `AUTHORITATIVE_CANDIDATE_PENDING_CLINICAL_SIGNOFF` | 2 | ❌ no — **R4 still fires for nothing** |
| Every row's `Clinical_Approval_Status` | 22 | all `PENDING_CLINICAL_SIGNOFF` |

### Measured effect on the validation report

| Issue | v0 | v0.1 | Why |
|---|---:|---:|---|
| `GROUP_CODES_NOT_AUTHORED` | 1 | **0** | conditions now carry authored `CIG-001`…`CIG-040` |
| `UNRESOLVED_SUPPORTED_DIAGNOSIS` | 29 | **0** | supported diagnoses resolved to group codes, no free text left to guess at |
| `UNRESOLVED_FEATURES_NAME` | 14 | **2** | 12 were spelling; the 2 that remain are the `SCOPE_REVIEW_REQUIRED` pair |
| `CODE_IN_MULTIPLE_GROUPS` (V11) | 85 | **85** | unchanged — v0.1 did not remap a single ICD code |
| `REQUIRES_DIAGNOSIS_NO_SUPPORT` (V6) | 10 | **10** | unchanged |
| `CONDITION_UNMAPPED` / `GROUP_HAS_NO_CODES` | 5 / 5 | **5 / 5** | unchanged — same five conditions |
| `MAPPING_CODE_EMPTY` | 2 | **2** | unchanged |
| `CATCH_ALL_GROUP` (warning) | 0 | **3** | `Atopy`, `Viraemia of Unknown Origin`, `Bacteraemia of Unknown Origin` now flagged, and so permanently barred from live routing |
| `REPEAT_WINDOW_SUBDAY_UNENFORCEABLE` (warning) | 4 | **4** | unchanged |
| **Total blocking errors** | **151** | **109** | |

All 22 failure messages were rewritten into provider-facing wording and are taken in
preference to v0's clinician shorthand (DG-D17) — e.g. `"HIV test lacks documented
indication"` became `"Clinical indication is not sufficiently documented in the available
claim data for HIV."`

**What v0.1 does not fix:** the 85 overlapping ICD codes are the single largest blocker
and are untouched. Until each code belongs to exactly one condition, a claim carrying one
resolves to nothing and no clinical rule is evaluated for it. That is a clinical
assignment decision, not a data-cleaning one.

### Symptom/sign columns are deliberately not imported in Rung 1

`Typical Symptoms`, `Typical Signs`, `Red Flag *`, `Typical Duration`, `Typical Onset`,
`Clinical Suspicion Rule`, `Min_Symptoms`, `Min_Signs`, `Mandatory_*`, `Compatible_*`
describe the **patient chart**. No claim rail (provider portal, B2B API, HMS batch)
carries symptom or sign data, so these columns are **read but not imported** — the
converter records their presence in the report and drops them from the pack. They
become live only under the C6 backlog (structured capture or free-text extraction),
which is gated on G-C4. Importing them now would create rules that can never fire and
would misrepresent the gate's real coverage.
