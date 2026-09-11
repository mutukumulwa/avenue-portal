# P01.01 — Family tariff preflight

Generated 2026-09-11T06:35:38.050Z · runtime TZ UTC · Kampala today 2026-09-11 · **PASS — every hard gate passes**

Read-only. Reviewed IDs: tenant `cmr3ae8v30000nlvqxrqlfn38`, provider `cmssrwr31000033vqpue454ou`, branch `cmssrwr92000133vqi0blzcay`, contract `cmtclkbiy00005kvqphfr7xiz`.

## Hard gates

| Gate | Result | Check | Evidence |
|---|---|---|---|
| G1 | PASS | Exactly one intended provider and active trial contract resolve | provider cmssrwr31000033vqpue454ou (ACTIVE); ACTIVE contracts PC-2026-202; current version v1 ACTIVE |
| G2 | PASS | Every imported source row reconciles to one outcome; logical services equal the reviewed post-duplicate count | original-load rows 4451 (expected 4451) + P01.02 replacements 12; reconciled 4463/4463; logical services 4424 (reviewed expectation 4424); duplicates 0; conflicts 0; description-key collisions across all fields: 0 conflicting, 0 equivalent |
| G3 | PASS | No missing, zero, negative or non-UGX rate | non-positive 0; non-UGX 0; ≠ contract currency 0; rateMissing 0 |
| G4 | PASS | Every user-visible tariff row is in the exact scope the engine evaluates | active rows outside the engine's candidate set 0; active contract rows not on the current version 0 |
| G5 | PASS | Contract, branch, client and date resolution are unambiguous | branch cmssrwr92000133vqi0blzcay active; INCLUDE clients 1; prechecks 9/9 matched cmtclkbiy00005kvqphfr7xiz |
| G6 | PASS | Facility-confirmed terms are on the contract (tax-inclusive, 30 days, UGX) | taxInclusive INCLUSIVE; paymentTermDays 30; currency UGX |

## 1. Provider, branch, payer, contract, version

- Provider: `cmssrwr31000033vqpue454ou` — Family Healthcare — contractStatus ACTIVE
- Branches: `cmssrwr92000133vqi0blzcay` "Main" (active)
- Contracts for provider: PC-2026-202 `cmtclkbiy00005kvqphfr7xiz` ACTIVE UGX 2026-08-28→2027-08-27
- Reviewed contract: PC-2026-202 · ACTIVE · execution FULLY_EXECUTED · branch scope ALL_BRANCHES · currency UGX · 2026-08-28 → 2027-08-27
- Terms: taxInclusive **INCLUSIVE** · payment 30 days · unlisted rule REFER_FOR_REVIEW · balance billing **UNKNOWN (not supplied)** · submission window **UNKNOWN (not supplied)**
- Current version: `cmtclkkmd00045kvqpo4oazbz` v1 ACTIVE from 2026-08-28
- Applicability: INCLUDE client `cmtcl1o100000wbvq1munvvfi` active from 2026-08-28

## 2. Row counts

- Total `ProviderTariff` rows for the provider: **4463** (source load: 4451); active 4424
- Engine candidate rows (contract, branch, client) — yesterday 2026-09-10: 4424; today 2026-09-11: 4424; future 2026-10-11: 4424
- Active/effective logical services (engine view, today): **4424**

## 3. Grouped counts (all rows)

**contractId:** `cmtclkbiy00005kvqphfr7xiz` 4463

**versionId:** `cmtclkkmd00045kvqpo4oazbz` 4463

**branchId:** `(all branches)` 4463

**clientId:** `(all payers)` 4463

**currency:** `UGX` 4463

**isActive:** `false` 39 · `true` 4424

**effective window:** `2026-08-28→open` 4463

**rate type:** `FIXED` 4463

**unit of measure:** `PER_CONSULTATION` 2 · `PER_DAY` 8 · `PER_EPISODE` 85 · `PER_ITEM` 4269 · `PER_PROCEDURE` 99

## 4. Rates (active rows)

- Null 0 (column is NOT NULL) · zero/negative 0 · rateMissing 0 · non-UGX 0
- Min 50.6 · median 26565 · max 13543200 (UGX)
- Rows carrying a PROVISIONAL note (7 confirmed-by-rule prices of 2026-08-28): 7

## 5. Duplicates and conflicts

By (normalised name, category, scope, effective dates): exact-duplicate groups 0 · conflict groups 0.

**Engine view** (what adjudication can actually tell apart — it ignores category): 0 collision group(s). Row outcomes below.

## 6. Attachment

- Standalone (contractId null): 0 · attached to another contract: 0 · on reviewed contract but not current version: 0

## 7. Codes despite the confirmed no-code policy

- Rows with a CPT code: 0 · with a provider service code: 0

## 8. Category mapping (active rows → claim-line category, DEC-FH-X1)

| Taxonomy code | Rows | Line category | Basis |
|---|---|---|---|
| PHARMACY_DRUGS | 2407 | PHARMACY | TIER |
| PHARMACY_CONSUMABLES | 1141 | PHARMACY | TIER |
| LABORATORY | 464 | LABORATORY | TIER |
| DENTAL | 143 | OTHER | TIER |
| PROCEDURE | 95 | PROCEDURE | EXPLICIT |
| CONTRACT_PACKAGE | 83 | OTHER | TIER |
| RADIOLOGY | 81 | IMAGING | TIER |
| IP_SERVICES | 8 | OTHER | EXPLICIT |
| CONSULTATION | 1 | CONSULTATION | TIER |
| SPECIALIST_CONSULTATION | 1 | CONSULTATION | TIER |

Unmapped (OTHER by default, needs review): 0

## 9. Engine contract context — sample members × branch × dates

Sample members are the first three ACTIVE members of the applicable payer by opaque id (no member numbers or names in this report).

| Member (opaque) | Date | Matched | Contract | Reason |
|---|---|---|---|---|
| `cmtwkxi6s00027mvqk7phdjsx` | yesterday 2026-09-10 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6s00027mvqk7phdjsx` | today 2026-09-11 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6s00027mvqk7phdjsx` | future 2026-10-11 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6v00037mvqqx4mgj25` | yesterday 2026-09-10 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6v00037mvqqx4mgj25` | today 2026-09-11 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6v00037mvqqx4mgj25` | future 2026-10-11 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6w00047mvqftm0dg2y` | yesterday 2026-09-10 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6w00047mvqftm0dg2y` | today 2026-09-11 | yes | cmtclkbiy00005kvqphfr7xiz |  |
| `cmtwkxi6w00047mvqftm0dg2y` | future 2026-10-11 | yes | cmtclkbiy00005kvqphfr7xiz |  |

## 10. Would the engine load these rows?

The candidate sets above were produced by `loadCandidateTariffs` — the function `ContractEngine.evaluateClaim` calls (src/server/services/contract-engine/engine.ts). A row is loaded by the engine for this context if and only if its outcome below is not `OUT_OF_SCOPE_*`.

## Row outcomes (reconciliation — every row exactly once)

| Source → outcome | Rows |
|---|---|
| original load → OUT_OF_SCOPE_INACTIVE | 33 |
| original load → SELECTABLE | 4418 |
| P01.02 replacement → OUT_OF_SCOPE_INACTIVE | 6 |
| P01.02 replacement → SELECTABLE | 6 |
| **Total** | **4463** |

Description-key collisions across serviceName / standardDescription / providerDescription (what HMS and CSV lines are matched against): 0 conflicting, 0 equivalent.

