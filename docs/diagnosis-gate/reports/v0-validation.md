# Protocol pack validation report

| | |
|---|---|
| Source | `ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx` |
| Generated | 2026-08-06 |
| Verdict | **NOT IMPORTABLE** — 66 blocking error(s) |
| Note | pack sha256 `d555ecc6e155e1d3…` · source sha256 `c10fac270f4aa058…` |

## What this report is

The Diagnosis Gate never guesses. Where the workbook is missing a value, spells a condition two different ways, or points at something that does not exist, the import stops and lists it here rather than inventing a rule. Everything below is a concrete edit to the workbook; once the errors are cleared the pack imports.

## Content counted

| Item | Count |
|---|---:|
| Groups | 40 |
| Catch All Groups | 0 |
| Memberships | 669 |
| Icd10 Memberships | 0 |
| Icd11 Memberships | 669 |
| Generated Crosswalk Memberships | 0 |
| Lab Rules | 22 |
| Rules Requiring Diagnosis | 16 |
| Rules With Repeat Window | 22 |
| Links | 10 |
| Supported Links | 10 |
| Confirmatory Links | 0 |
| Aliases | 22 |

## Blocking errors (66)

These must be fixed in the workbook before the pack can be imported.

| Rule | Issue | Count | Example |
|---|---|---:|---|
| C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | 29 | "HIV disease" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. _(Commonest Labs Rationale!A2 (Supported_ICD11_Diagnoses))_ |
| C | `UNRESOLVED_FEATURES_NAME` | 14 | "Allergic Rhinitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. _(Clinical Diagnostic Features!C4)_ |
| V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | 10 | Test "LAB001" (HIV) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. _(Commonest Labs Rationale!A2)_ |
| C | `CONDITION_UNMAPPED` | 5 | Condition "Acute Rhinosinusitis (Sinusitis)" has no rows on Diagnoses Mapped to ICD — no diagnosis code will ever resolve to it. _(Commonest!A4)_ |
| V9 | `GROUP_HAS_NO_CODES` | 5 | Group "CIG-004" (Acute Rhinosinusitis (Sinusitis)) has no diagnosis codes — no claim can ever resolve to it. _(Commonest!A4)_ |
| C | `MAPPING_CODE_EMPTY` | 2 | "Vaginal Candidiasis" has a mapping row with no ICD code. _(Diagnoses Mapped to ICD!A209)_ |
| C | `GROUP_CODES_NOT_AUTHORED` | 1 | The workbook has no permanent group-code column, so the codes in this pack were assigned by row order (CIG-001, CIG-002, …). Those codes would change the moment a row is inserted or re-sorted, which would silently re-point every rule and every historical flag. Add a stable code column (fix F1) before this pack is imported. _(Commonest)_ |

## Warnings (2)

These do not block import, but they mark content that is legal yet **inert** — a rule that cannot match a claim, or a group barred from live routing. Worth resolving before the shadow campaign, since inert rules make coverage look better than it is.

| Rule | Issue | Count | Example |
|---|---|---:|---|
| C | `CATCH_ALL_NOT_AUTHORED` | 1 | The workbook has no catch-all column, so no condition is flagged as a category (DG-D8). Candidates are listed in the proposals report for clinical confirmation. Until flagged, these remain ineligible for live routing only because live routing is off by default — not because the gate knows they are categories. _(Commonest)_ |
| V8 | `NO_CONFIRMATORY_LINKS` | 1 | No condition declares a confirmatory test, so rule R4 (confirmation-present) cannot fire for any claim in this pack. |

## Full error list

| # | Rule | Issue | Detail | Where |
|---:|---|---|---|---|
| 1 | C | `GROUP_CODES_NOT_AUTHORED` | The workbook has no permanent group-code column, so the codes in this pack were assigned by row order (CIG-001, CIG-002, …). Those codes would change the moment a row is inserted or re-sorted, which would silently re-point every rule and every historical flag. Add a stable code column (fix F1) before this pack is imported. | `Commonest` |
| 2 | C | `MAPPING_CODE_EMPTY` | "Vaginal Candidiasis" has a mapping row with no ICD code. | `Diagnoses Mapped to ICD!A209` |
| 3 | C | `MAPPING_CODE_EMPTY` | "Tinea Capitis" has a mapping row with no ICD code. | `Diagnoses Mapped to ICD!A619` |
| 4 | C | `CONDITION_UNMAPPED` | Condition "Acute Rhinosinusitis (Sinusitis)" has no rows on Diagnoses Mapped to ICD — no diagnosis code will ever resolve to it. | `Commonest!A4` |
| 5 | C | `CONDITION_UNMAPPED` | Condition "Chronic Obstructive Pulmonary Disease (Copd)" has no rows on Diagnoses Mapped to ICD — no diagnosis code will ever resolve to it. | `Commonest!A12` |
| 6 | C | `CONDITION_UNMAPPED` | Condition "Vaginal Candidiasis" has no rows on Diagnoses Mapped to ICD — no diagnosis code will ever resolve to it. | `Commonest!A20` |
| 7 | C | `CONDITION_UNMAPPED` | Condition "Gastroduodenitis" has no rows on Diagnoses Mapped to ICD — no diagnosis code will ever resolve to it. | `Commonest!A27` |
| 8 | C | `CONDITION_UNMAPPED` | Condition "Tinea Capitis" has no rows on Diagnoses Mapped to ICD — no diagnosis code will ever resolve to it. | `Commonest!A37` |
| 9 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "HIV disease" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A2 (Supported_ICD11_Diagnoses)` |
| 10 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "STI assessment" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A2 (Supported_ICD11_Diagnoses)` |
| 11 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Occupational exposure" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A2 (Supported_ICD11_Diagnoses)` |
| 12 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Pregnancy" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A3 (Supported_ICD11_Diagnoses)` |
| 13 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Ectopic pregnancy" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A3 (Supported_ICD11_Diagnoses)` |
| 14 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Anaemia" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A6 (Supported_ICD11_Diagnoses)` |
| 15 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Infection" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A6 (Supported_ICD11_Diagnoses)` |
| 16 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Sepsis" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A6 (Supported_ICD11_Diagnoses)` |
| 17 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Infection" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A7 (Supported_ICD11_Diagnoses)` |
| 18 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Inflammatory disease" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A7 (Supported_ICD11_Diagnoses)` |
| 19 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "UTI" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A8 (Supported_ICD11_Diagnoses)` |
| 20 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Sepsis" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A10 (Supported_ICD11_Diagnoses)` |
| 21 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Bacteraemia" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A10 (Supported_ICD11_Diagnoses)` |
| 22 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "PUD" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A11 (Supported_ICD11_Diagnoses)` |
| 23 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "PUD" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A12 (Supported_ICD11_Diagnoses)` |
| 24 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Dyslipidaemia" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A16 (Supported_ICD11_Diagnoses)` |
| 25 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Diabetes" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A16 (Supported_ICD11_Diagnoses)` |
| 26 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "AKI" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A17 (Supported_ICD11_Diagnoses)` |
| 27 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "CKD" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A17 (Supported_ICD11_Diagnoses)` |
| 28 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "AKI" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A18 (Supported_ICD11_Diagnoses)` |
| 29 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "CKD" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A18 (Supported_ICD11_Diagnoses)` |
| 30 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "AKI" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A19 (Supported_ICD11_Diagnoses)` |
| 31 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "CKD" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A19 (Supported_ICD11_Diagnoses)` |
| 32 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Electrolyte disorder" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A20 (Supported_ICD11_Diagnoses)` |
| 33 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Hepatitis" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A21 (Supported_ICD11_Diagnoses)` |
| 34 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Liver disease" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A21 (Supported_ICD11_Diagnoses)` |
| 35 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Jaundice" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A22 (Supported_ICD11_Diagnoses)` |
| 36 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Hepatitis" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A22 (Supported_ICD11_Diagnoses)` |
| 37 | C | `UNRESOLVED_SUPPORTED_DIAGNOSIS` | "Viral hepatitis screening" does not match any condition on Commonest. Spellings differ between sheets; the converter matches case and punctuation only and will not guess a correction. | `Commonest Labs Rationale!A23 (Supported_ICD11_Diagnoses)` |
| 38 | C | `UNRESOLVED_FEATURES_NAME` | "Allergic Rhinitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C4` |
| 39 | C | `UNRESOLVED_FEATURES_NAME` | "Upper Respiratory Tract Infection (Urti)" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C7` |
| 40 | C | `UNRESOLVED_FEATURES_NAME` | "Tonsillitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C10` |
| 41 | C | `UNRESOLVED_FEATURES_NAME` | "Adenotonsillitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C14` |
| 42 | C | `UNRESOLVED_FEATURES_NAME` | "Urinary Tract Infection (Uti)" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C18` |
| 43 | C | `UNRESOLVED_FEATURES_NAME` | "Pelvic Inflammatory Disease (Pid)" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C20` |
| 44 | C | `UNRESOLVED_FEATURES_NAME` | "Peptic Ulcer Disease (Pud)" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C22` |
| 45 | C | `UNRESOLVED_FEATURES_NAME` | "Gastro-Oesophageal Reflux Disease (Gerd)" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C24` |
| 46 | C | `UNRESOLVED_FEATURES_NAME` | "Bacteraemia Of Unknown Origin" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C31` |
| 47 | C | `UNRESOLVED_FEATURES_NAME` | "Contact Dermatitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C33` |
| 48 | C | `UNRESOLVED_FEATURES_NAME` | "Eczema (Atopic Dermatitis)" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C34` |
| 49 | C | `UNRESOLVED_FEATURES_NAME` | "Acne Vulgaris" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C35` |
| 50 | C | `UNRESOLVED_FEATURES_NAME` | "Atopic Conjunctivitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C38` |
| 51 | C | `UNRESOLVED_FEATURES_NAME` | "Conjunctivitis" on Clinical Diagnostic Features does not match any condition on Commonest. Its clinical detail cannot be attached to a group. | `Clinical Diagnostic Features!C39` |
| 52 | V9 | `GROUP_HAS_NO_CODES` | Group "CIG-004" (Acute Rhinosinusitis (Sinusitis)) has no diagnosis codes — no claim can ever resolve to it. | `Commonest!A4` |
| 53 | V9 | `GROUP_HAS_NO_CODES` | Group "CIG-012" (Chronic Obstructive Pulmonary Disease (Copd)) has no diagnosis codes — no claim can ever resolve to it. | `Commonest!A12` |
| 54 | V9 | `GROUP_HAS_NO_CODES` | Group "CIG-020" (Vaginal Candidiasis) has no diagnosis codes — no claim can ever resolve to it. | `Commonest!A20` |
| 55 | V9 | `GROUP_HAS_NO_CODES` | Group "CIG-027" (Gastroduodenitis) has no diagnosis codes — no claim can ever resolve to it. | `Commonest!A27` |
| 56 | V9 | `GROUP_HAS_NO_CODES` | Group "CIG-037" (Tinea Capitis) has no diagnosis codes — no claim can ever resolve to it. | `Commonest!A37` |
| 57 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB001" (HIV) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A2` |
| 58 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB006" (C-Reactive Protein) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A7` |
| 59 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB009" (Blood Culture) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A10` |
| 60 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB016" (Renal Function Tests) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A17` |
| 61 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB017" (Urea (BUN)) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A18` |
| 62 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB018" (Creatinine) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A19` |
| 63 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB019" (Electrolytes) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A20` |
| 64 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB020" (Liver Function Tests) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A21` |
| 65 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB021" (Bilirubin) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A22` |
| 66 | V6 | `REQUIRES_DIAGNOSIS_NO_SUPPORT` | Test "LAB022" (Hepatitis B) requires a diagnosis but lists no supported condition — R2 would flag every claim billing it. | `Commonest Labs Rationale!A23` |
