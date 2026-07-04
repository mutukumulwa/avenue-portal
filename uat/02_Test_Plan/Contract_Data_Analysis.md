# Contract Data Analysis — `Contracts/` folder (2026-07-04)

## Inventory

| Set | Files | Content | Quality |
|---|---|---|---|
| `SHA CONTRACTS/` | 7 PDFs (+ md in `contract-mds/`) | Social Health Authority ⇄ LifeCare facility contracts per branch (Meru, Eldoret ×2, Mlolongo, Kikuyu, Bungoma, Migori). Full legal contracts (~3,600 md lines each) with General Conditions: claim submission windows (7 days), balance-billing prohibitions (GCC 12.15/12.16), tax-inclusive rates, e-contracting portal clauses | OCR good; long legal text; schedules present |
| `FFS RATES/` | 17 PDFs (+ md) | Commercial payer ⇄ LifeCare rate letters & agreements: CIC (pricelist tariff + surgical package), Jubilee (surgical + **outpatient capitation @ KES 3,600/visit, 5 exclusions, 10-working-day payment, monthly recon**), Britam (2024 contracts + surgical packages), Madison (dental, FCM agreement, signed packages), Old Mutual (**average-cost discount agreement**), APA surgical, GA, Amanah, KCB dental, Parliamentary rates, Butali rates | OCR noisy in tables (typos like "PUNTURE", merged columns, stray chars) — a genuine test of the extractor's review workflow |
| `Masters/` | 10 xlsx/csv (+ md) | LifeCare canonical masters: Services & Procedures (final), Lab, Radiology (×2), Inventory (×2), Doctors (3 registers), Specialty | Structured tables; the app's 47 ServiceCategory taxonomy + 107 aliases were derived from these (WP-E2) |

## Key observations

1. **The digital contract module was designed from exactly these documents** — schema comments cite "SHA 7 days", "Jubilee 10 working days", "Old Mutual quarterly", GCC 12.15/12.16. This folder is the intended production onboarding corpus, not incidental test data.
2. **Provider entity:** all documents concern **LifeCare Hospitals (K) Ltd**, a chain with branches Bungoma, Migori, Eldoret, Mlolongo, Meru, Kikuyu, Nairobi (Laiboni Centre HQ). The seeded demo providers do NOT include LifeCare → we create it via the UI (provider + branches), which is precisely what an implementation team would do.
3. **Payers:** SHA (statutory) + 10 commercial insurers. In TPA terms these are *client payers* — but note the platform's Client model represents payers Medvex administers **for**; the LifeCare contracts are provider-side agreements, so they map to `ProviderContract` (payer recorded on the contract), not to `Client` rows. One new Client will still be created via UI to exercise multi-client workflows.
4. **Data enabling each workflow:**
   - `contracts/import` extraction review → CIC pricelist markdown (large messy tariff table = realistic extraction stress).
   - Guided capture `/contracts/new` → Jubilee capitation letter (capitation amount, package exclusions, payment terms BUSINESS/10, reconciliation MONTHLY).
   - Contract applicability/branch scope → SHA per-branch contracts.
   - Unlisted-service rule, balance billing, submission windows → SHA GCC + Jubilee letter.
   - Tier-grouped fee schedule UI → Masters-derived ServiceCategory taxonomy (already seeded).
5. **Anonymisation:** not required for local testing (documents are the client's own working set; no member/patient PII in the rate letters — they are provider-payer commercial terms). One SHA contract contains signatory names; we will not reproduce those in seeded records beyond contract titles.
6. **Ambiguities / gaps:**
   - OCR tables have obvious value corruption (e.g. "3,000.60", split rows) — where a value is ambiguous the extraction review answers will mark it for manual review rather than guessing (this is the workflow the product intends).
   - The Jubilee letter gives an effective date only implicitly (letter date 14/09/2022; review 2,800→3,600). We will set effective 2025-01-01→2025-12-31 for UAT determinism and note the assumption.
   - Currencies are KES throughout; platform base is UGX — exercises the FX/multi-currency path (contract currency field).

## What we will and won't use

- **Use:** CIC Insurance tariff (import path), Jubilee capitation (guided capture), SHA-Kikuyu key terms (guided capture, branch-scoped), Masters (already in taxonomy).
- **Defer:** remaining 14 FFS letters and 6 SHA contracts — same shapes; adding them multiplies volume, not coverage. Listed as available extension corpus.
