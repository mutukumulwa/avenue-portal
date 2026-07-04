# Seed Data Strategy — 2026-07 engagement

**Rule:** all scenario data below is created **through the application** (forms/imports), never via SQL. Baseline (vendor seed incl. Kenyan demo book) documented in `Environment_Provisioning.md`. SQL is used read-only for verification evidence.

Naming convention: every UAT-created record carries the prefix **"UAT-"** or "(UAT)" so it is distinguishable from the vendor demo book in lists, reports and exports.

## Planned seed set (mapped to the real contract corpus)

| # | Entity | Source | Creation path | Enables |
|---|---|---|---|---|
| S1 | Provider **LifeCare Hospitals (UAT)** | contract corpus | `/providers/new` (SUPER_ADMIN) | provider lists/search/dropdowns, contracts, claims |
| S2 | Provider branches: Bungoma, Kikuyu (min. 2) | SHA contracts | provider detail → branches | branch-scoped contracts |
| S3 | Contract **UAT CIC FFS tariff 2025** | `contract-mds/FFS RATES/CIC Insurance tariff.md` | `/contracts/import` paste → extraction review → commit | import/extraction workflow, tariff schedule, contract detail tiers |
| S4 | Contract **UAT Jubilee OP capitation** | `JUBILEE CAPITATION.md` | `/contracts/new` guided capture (KES 3,600/visit; exclusions MRI/CT, ECHO, dialysis, optical/dental, wellness; payment 10 BUSINESS days; recon MONTHLY; unlisted → REFER_FOR_REVIEW) | capitation setup, exclusions, SLA-from-contract |
| S5 | ~~Contract UAT SHA facility (Kikuyu)~~ **DESCOPED 2026-07-04** | `SHA-KIKUYU CONTRACT_.md` | — | its differentiator (branch-scoped applicability) is untestable: branches can't be created in the UI (PR-007); remaining terms already covered by S3/S4 |
| S6 | Client **UAT Payer — CIC (self-test)** | — | `/clients/new` | multi-client tenancy surface |
| S7 | Group **UAT Lifecare Staff Ltd** (INSURED) + benefit tier(s) | — | `/groups/new` | scheme setup |
| S8 | ~5 members (principal + spouse + child + 2 principals) | — | `/members/new` (×2) + `/members/import` CSV (×3) | both enrolment paths |
| S9 | Pre-auth → claim → adjudication → settlement chain on S1 provider | — | `/preauth/new`, `/claims/new`, case `/cases/new` | full clinical/financial cycle against real contract terms |
| S10 | Offline work code + offline capture | — | `/offline-auth` | offline workflow |
| S11 | Wellness program **UAT Annual Screening** | — | `/wellness` | wellness module |
| S12 | Endorsement (add member via HR portal) | — | HR roster/new | HR → admin queue |
| S13 | User **uat.reports@medvex.co.ug** (REPORTS_VIEWER) | — | `/settings` invite | only role with no seeded account |

## 360° propagation checks (per entity)
Each seeded entity gets a propagation sweep recorded in `06_Test_Results/Workflow_Test_Results.md`: appears in list / search / dropdowns / detail / dashboards / relevant reports / exports / audit log; visible to permitted roles; hidden from non-permitted roles.

## Assumptions
- Jubilee capitation effective window set to 2026-01-01 → 2026-12-31 (letter has no explicit term) — documented deviation.
- KES used as contract currency (matches corpus; platform base UGX exercises FX display).
- Vendor demo book (Safaricom etc.) remains in place as the "legacy ported book" backdrop.
