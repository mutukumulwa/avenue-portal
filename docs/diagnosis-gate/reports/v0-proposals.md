# Proposals for clinical confirmation

These are **candidates only**. Nothing here is in the pack, and nothing here will ever enter the pack until the clinical team confirms it in the workbook. The converter proposes; it does not decide.

## Confirmatory test candidates (rule R4)

The workbook states confirmation in prose. Below, a test was proposed when every distinctive word of its name appears in the condition's confirmation rule. Until a machine-readable confirmatory column exists, **R4 cannot fire for any condition.**

| Condition | Group | Proposed test | Confirmation rule (verbatim) |
|---|---|---|---|
| Malaria | `CIG-001` | LAB003 — Malaria RDT | Positive Malaria RDT or blood smear |
| Malaria | `CIG-001` | LAB004 — Malaria Blood Smear | Positive Malaria RDT or blood smear |
| Diabetes Mellitus | `CIG-030` | LAB014 — HbA1c | Fasting glucose, HbA1c, OGTT or random glucose meeting ADA/WHO criteria |

## Catch-all candidates (DG-D8)

Conditions mapping to more than 40 ICD codes. Breadth is a signal, not a diagnosis of the problem — the clinical team decides whether each is a category that must never unlock the automated path.

| Condition | Group | ICD codes mapped |
|---|---|---:|
| Atopy | `CIG-002` | 109 |
| Arthritis | `CIG-033` | 44 |
| Contact Dertmatitis | `CIG-034` | 42 |
