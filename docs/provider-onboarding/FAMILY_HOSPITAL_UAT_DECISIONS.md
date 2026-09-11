# Family Hospital UAT — decision record

Companion to `FAMILY_HOSPITAL_UAT_REMEDIATION_PLAN.md` (the plan) and
`FAMILY_HOSPITAL_UAT_IMPLEMENTATION_LOG.md` (the log). Task P00.01.

This file records **answers**, not credentials or personal medical data. No password, setup
token, member name, member number, or email address belongs here.

> Naming: the facility is **Family Healthcare** (provider `cmssrwr31000033vqpue454ou`). The plan
> and the email thread say "Family Hospital"; the provider row was renamed to its own form's
> name on 2026-08-28. Both names refer to the same facility.

---

## 1. Answers already given by the facility (plan §1.3)

Source: the email thread "Your Medvex access for Family Hospital" (messages of 2026-08-29 and
2026-09-10). Do not ask these again unless a contradictory source appears.

| Topic | Confirmed answer | How it is enforced |
|---|---|---|
| Front-desk user's email | The corrected Gmail address supplied on 2026-08-29 is authoritative (reconfirmed 2026-09-10). | Account already exists under the corrected address; no data change. |
| Duplicate prices | Use the lower of the two prices "for any duplicates" (2026-08-29, reconfirmed 2026-09-10). | P01.02 disposition rule `TRUE_DUPLICATE → keep lower rate`. Applied **only** to rows that are the same service; see §3.2 for rows that merely *look* alike. |
| Tax | All prices are tax-inclusive. | `ProviderContract.taxInclusive = INCLUSIVE` on PC-2026-202 (verified 2026-09-11). |
| Payment term | 30 days. | `paymentTermDays = 30` on PC-2026-202 (verified 2026-09-11). |
| Service codes | The facility does not use them and its system cannot export them; proceed without. | Description is the primary service identifier (plan §5). `cptCode`/`providerServiceCode` stay optional. |
| First eligibility failures | The first dataset was a Medvex data defect (unpinned package versions), fixed 2026-09-09; the facility confirms the new dataset clears it. | Closed; kept in regression coverage (P08.01). |

## 2. Provider inputs still outstanding (plan §1.4)

| Input | State | Consequence until supplied |
|---|---|---|
| Claim-submission deadline | **UNKNOWN** — `submissionWindowDays` is null on PC-2026-202 | No late-submission decision is automated (the engine's window check is inert when null). Not invented. |
| Balance-billing / shortfall policy | **UNKNOWN** — `balanceBillingPolicy` is null on PC-2026-202 | Shortfalls route to provider write-off (engine default), never to the member. Not invented. |
| 20–50 de-identified recent bills, incl. inpatient | Not received | Trial cannot yet replay real bills. |
| Top services / diagnoses by volume | Not received | Fixture selection (P07.02) uses the price list only. |

## 3. Owner decision gates (plan §5.1)

The plan says: if a decision is not supplied, use the recommended default **except where
licensing or contractual authority is required — then stop**. Status below is as of the date
recorded; update the row, never delete it.

| Gate | Decision | Status | Applied value / reason |
|---|---|---|---|
| DEC-FH-01 | May a provider submit an unlisted service? | **Default applied** (no owner answer yet) | Yes — only where the contract's existing policy permits it (`unlistedServiceRule ≠ REJECT`). Family's contract is `REFER_FOR_REVIEW`, so an unlisted line is shown as "not in contracted tariff — manual review", needs a typed description and a billed price, and never receives a contracted rate. |
| DEC-FH-02 | Show `CUSTOM` as a benefit choice? | **Default applied** | Hidden from provider forms; every other `BenefitCategory` value is offered from one shared list. |
| DEC-FH-03 | Approved ICD source/version and licensing | **Owner answered 2026-09-11: no approved source yet** | No complete ICD-10 source is licensed. The deployed catalogue stays the 200-code demo subset (verified 2026-09-11). P04.05 ships the search control and the read-only coverage report, and the 200-code limit is disclosed to the facility for this UAT round. No import is built against an unapproved source. |
| DEC-FH-04 | Treatment of existing broken UAT claims/pre-auths | **Default recorded; execution needs production approval** | Withdraw/cancel with reason `TEST_DATA_INCORRECT_TARIFF`, retaining full audit history. Records enumerated in P00.03. Mutation happens only in P07 through supported lifecycle actions. |
| DEC-FH-05 | Setup-link lifetime | **Default applied** | 24 hours; a resend invalidates every older unused link for that user. |

### 3.1 Owner answers on production-affecting steps (2026-09-11, in session)

| Step | Question | Answer |
|---|---|---|
| P00.02 | Invalidate the two still-valid exposed temporary passwords (biller, front desk) now? | **Not yet.** They remain valid; P00.02 stays an open release blocker (plan §13, first gate). |
| P01.02 | When to apply manifest `FH-P0102-20260911` (SHA-256 `78982cfa…079a`) to production? | **Apply now**, then re-run the preflight on production. |
| DEC-FH-03 | Is there an approved ICD-10 release to load? | **None yet** — disclose the 200-code limit. |

## 4. Decisions surfaced by execution (not in the plan's gate list)

These arose from evidence gathered on 2026-09-11. Each is written so a reviewer can overturn it;
none changes money on its own.

### 4.1 DEC-FH-X1 — line-category mapping for the service filter (plan P01.02 step 3)

The claim line's `serviceCategory` is a descriptive enum (`CONSULTATION, LABORATORY, PHARMACY,
IMAGING, PROCEDURE, OTHER`); no pricing or decision code reads it (verified by search,
2026-09-11), so this mapping decides **what appears under which filter**, not what is paid.

Explicit mapping from the tenant taxonomy (`ServiceCategory.code`, walking to the nearest
ancestor that is listed; otherwise the effective tier):

| Taxonomy (Family row count) | Line category | Basis |
|---|---|---|
| `CONSULTATION`, `SPECIALIST_CONSULTATION` (1 + 1) | CONSULTATION | tier HEADLINE → CONSULTATION (plan) |
| `IP_SERVICES` (8: admission, bed, meals, nursing, observation, ward rounds) | **OTHER** | Deviation from the tier rule, deliberately: these are per-day inpatient accommodation charges, not consultations. Filing "Meals" under Consultation would be the "silently forced clinical category" the plan forbids. |
| `LABORATORY` (464) | LABORATORY | tier LABORATORY (plan) |
| `RADIOLOGY` (81) | IMAGING | tier IMAGING (plan) |
| `PHARMACY_DRUGS`, `PHARMACY_CONSUMABLES` (2,408 + 1,164) | PHARMACY | tier PHARMACY — "drugs + consumables" (plan) |
| `THEATRE`, `PROFESSIONAL_FEES` trees (0 for Family) | PROCEDURE | plan |
| `PROCEDURE`, `MINOR_PROCEDURE` (95) | PROCEDURE | Explicit: the category is literally "Procedure"; its fee tier (OTHER) is a band, not a clinical meaning. |
| `CONTRACT_PACKAGE` (85, episode-priced "Theatre & Packages") | OTHER | Generic meaning unclear (a package may be maternity, dialysis, surgery). Kept in OTHER rather than forced. |
| `DENTAL` (144) and every other code | OTHER | plan: unknowns → OTHER |

Because OTHER is broad, the search tells the user when their text matches services filed under a
different category, so a misfiled service is still findable without making category decorative.

### 4.2 DEC-FH-X2 — dispositions for price-list entries the engine cannot tell apart

Evidence: `docs/provider-onboarding/evidence/P01.01-preflight-*.md`. The contract engine matches
an uncoded line to a tariff by **exact normalised description** and takes the first row in
database order. 30 groups (60 rows) of Family's active tariffs normalise to the same text, so the
engine's choice among them depends on row order. The source workbook (`Family Healthcare Price
list.xlsx`) was read to classify each group:

| Class | Groups | Example | Disposition (P01.02) |
|---|---|---|---|
| Same service, same price, listed twice (mostly an IV fluid on both the Drugs and Consumables sheets; two maternity packages on both Procedures and Theatre & Packages) | 25 | `Dextrose 5% 500Ml` at 7,590 on both sheets | Keep the row the engine already selects (so adjudication behaviour is unchanged); deactivate the twin. No price changes. |
| Same service, two prices (duplicate) | 2 | `Neogen Locking Head Screw 3.5Mm(14Mm)` 143,000 vs `… 3.5Mm (14Mm)` 132,000 (same size, same unit, names differ by one space); `Surgical Extraction` 200,000 vs `Surgical Extraction -` 150,000 (adjacent rows 106–107 of the Dental sheet; the labels differ only by a trailing dash) | Facility's rule: keep the **lower** price, deactivate the higher. The Neogen pair is a clear duplicate. The Surgical Extraction pair is a *probable* duplicate — the trailing dash may be a truncated qualifier — so it is applied under the blanket rule **and listed for the facility to confirm**, exactly like the seven PROVISIONAL prices of 2026-08-28. |
| Different services that collide only in normalisation | 3 | `Azithromycin 500Mg` **Vial** 70,000 vs **Tab** 4,807; `Rabeprazole 20Mg (Rabeloc)` **Vial** 45,540 vs **Tab** 1,540; `Excision of Dermatosis papulosa nigra (>5 lesions)` vs `(<5 lesions)` | **Not duplicates — the lower-price rule must not be applied** (it would pay a tablet price for an injection). Replace each with a name the engine can distinguish, derived only from the facility's own data: the recorded unit (`Azithromycin 500Mg (Vial)` / `(Tab)`), or the symbol written literally (`(more than 5 lesions)` / `(less than 5 lesions)`); deactivate the originals. The replacement's `providerDescription` carries the new name too — keeping the raw text there would re-create the collision for HMS/CSV lines. |

The rules are applied by `scripts/lib/family-tariff-remediation-plan.ts`, not by hand, and the
production dry run reproduced exactly this table: manifest `FH-P0102-20260911`, SHA-256
`78982cfa5be38e2d9216c1e3aedb07339eb525ab611897716014009becc8079a` — 30 groups, 33 rows to
deactivate, 6 replacements, 4,424 active services afterwards, 0 collisions.

Until P01.02 is applied, the provider catalogue refuses to auto-price any row in these 30 groups
(it never chooses the first row), and the preflight exits non-zero.

### 4.3 DEC-FH-X3 — standalone tariffs are no longer a claims pricing fallback (plan P01.03)

The plan's required decision is applied globally: `ProviderContractsService.resolveClaimLineRates`
(which feeds the claim decision's approval ceiling, the contract PA gate, decision-time tariff
stamping, the adjudication variance alert and the admin contract panel) now reads exactly what the
contract engine reads — the engine's contract match and contract-bound rows only.

Measured impact on production (2026-09-11): **28 standalone tariff rows across 6 legacy
Kenyan-seed providers** (Medvex Hospital Parklands 8, Lancet Kenya Laboratories 6, Medvex Hospital
Thika 4, Aga Khan University Hospital 4 alongside 551 contract rows, Nairobi Hospital 3, City Eye
Hospital 3). Five of the six have no active contract. For their claims the approval ceiling moves
from "standalone tariff schedule" to the existing no-contract behaviour (reviewer judgement; the
engine already routes such claims to the NO_CONTRACT queue). No Ugandan provider and no Family row is
standalone. Standalone rows stay in the database as admin reference data.

When several active contracts match a claim (CON-010) the ceiling now fails closed — a
deterministic 0 with the message "Multiple active contracts match this claim — resolve which
contract applies before approving" — instead of the resolver silently taking the newest contract.

### 4.4 DEC-FH-X4 — the pre-auth auto-decision reads procedure codes in both stored shapes (plan P04.03)

The canonical pre-auth intake stores each procedure as `{ cptCode, description, quantity,
unitCost, total }` (`preauth-intake/contract.ts`); the old provider amendment writer stored
`{ code, description }`. The auto-decision (`preauthAdjudicationService.runAutoDecision`) read
only `p.code`, so for every PA created through the intake — provider portal, API, admin, member
app — its procedure codes were never screened: the never-auto list (gate 7) and the
procedure/service-code exclusion and referral rules (gates 3.5 and 4.5) could not fire.

P04.03 makes amendments use the intake's shape (with the capture provenance the plan requires),
which would have made amendment codes invisible too. The reader now takes `cptCode`, else
`code`. Effect: decisions can only become **more careful** — a coded PA can now be routed to a
human (never-auto list) or declined (a procedure exclusion) where before it passed; nothing is
approved that was not approved before (`ALWAYS_AUTO_PROCEDURE_CODES` is declared but unused).
Family's price list carries no codes, so Family PAs are unaffected. Test:
`tests/services/preauth-procedure-codes-gate.test.ts`.

### 4.5 DEC-FH-X5 — a pre-authorisation may name a planned date (plan P04.03)

The shared case resolver refuses a service date later than Kampala today for claims and
eligibility (the existing rule). A pre-authorisation is requested for a planned service, and the
pre-auth intake has always accepted a later expected date, so for `PREAUTH` the resolver accepts
it too. No new upper bound is introduced (none existed).
