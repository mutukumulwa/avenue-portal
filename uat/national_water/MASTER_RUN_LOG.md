# National Water Outpatient UAT — Master Run Log

> Self-contained run of `NATIONAL_WATER_OUTPATIENT_UAT.md` (repo root) using the
> established UAT rigor. Deliverables root: `uat/national_water/`.

## ⏯ RESUME POINTER
- **Status: COMPLETE (2026-07-06).** Verdict **CONDITIONAL GO** (`GO_NO_GO_READINESS.md`). All preconditions P1–P9, Scenario A (15 steps), Scenario B, Audit & Controls checklist, and opening/closing balances done. 5 defects logged (NW-D01..05; NW-D02 High, NW-D03 Medium). Re-verification (Phase R) after fixes = the next leg if remediation lands.
- **Phase:** Provisioning (preconditions P1–P9), then Scenario A, Scenario B, audit/controls, verdict.
- **Environment:** LOCAL disposable stack `aicare_uat` (NOT the live Vercel/Supabase prod deploy — this run moves money end-to-end, so it must not touch production NWSC data).
  - App: `http://localhost:3000` via preview server `aicare-dev` (RUNNING). Worker RUNNING (env-export workaround, PID logged). Services: postgres@16 / redis / minio up.
  - DB: `postgresql://aicare:aicare@localhost:5432/aicare_uat`. **Read-only DB use for verification only — no DB mutations during the run.** Do NOT run `prisma migrate`.
  - Logins: all seeded users password `MedvexAdmin2024!`. Puppeteer: system Chrome. Harness: `scratchpad/nwlib.mjs`.
- **Next step:** run provisioning driver — Client + tier Package + NWSC scheme.

## Spine questions (verdict hinges on these)
1. **Can an eligible NWSC member's covered outpatient claim run end-to-end** — eligibility → visit/capture → diagnosis → claim → adjudication → APPROVED → settlement (with maker-checker) → and land correctly in member utilisation, provider payable, scheme fund, and GL?
2. **Can a non-covered / over-limit dependant claim be correctly DECLINED or PARTIALLY_APPROVED** with a clear reason, and the rejected amount kept out of settlement and out of benefit balances?
3. **Do the four balance surfaces stay correct and consistent** — member utilisation, provider payable, scheme/fund drawdown, and a balanced GL — after approval and settlement?
4. **Are the controls enforced** — actor traceability, facility/role scope, member privacy, employer scope, maker-checker on settlement, and blocked invalid transitions?

## Environment / product mapping notes (established before run)
- **No PROVIDER user role** in `UserRole` enum. Per runbook line 63, provider steps (check-in, diagnosis, claim capture) run as the narrowest available claims-capture account (`CLAIMS_OFFICER`). Logged as a gap (NW-D?).
- **No Visit/Encounter model** — claims are captured directly via the `/claims/new` wizard (carries member, provider, diagnosis, service lines). The runbook's visit→diagnosis→services→claim steps collapse into direct claim capture; documented as a model-mapping note, not a defect.
- **No UI to bind a scheme to a specific Client** — scheme always attaches to the operator default client. Employer scope + self-funded fund are enforced at Group/scheme level, so all scoping tests key off the NWSC **Group**. Logged as a gap.
- Settlement state machine: `PENDING → MAKER_SUBMITTED → CHECKER_APPROVED → SETTLED`. Claim: `… CAPTURED → UNDER_REVIEW → APPROVED/PARTIALLY_APPROVED/DECLINED → PAID`.

## Provisioned records (local aicare_uat)
| Entity | Name | ID / number | Notes |
|---|---|---|---|
| Client | National Water & Sewerage Corporation | `cmr9b2roy0000e8vqt0d6c0zp` | UGX, slug `nwsc-uat`; **not** linked to scheme (NW-D01) |
| Package (tier) | NWSC Staff Outpatient Care | `cmr9b2ujr0002e8vqzq8kat5p` | annualLimit 10,000,000 **KES** (tenant currency), FFS OP+IP |
| Scheme (Group) | National Water Staff Medical Scheme | `cmr9b2x8i0006e8vqnuryue07` | ACTIVE, eff 2026-07-01, bound to **default** client (NW-D01), fundingMode INSURED |
| Member (principal) | Daniel Kato | `MVX-2026-00256` / `cmr9b4db60008e8vqkb4toq06` | ACTIVE; portal login `daniel.kato.nwsc@test.local` / `MedvexAdmin2024!` (MEMBER_USER) |
| Member (spouse, linked) | Sarah Kato | `MVX-2026-00259` / `cmr9bhkt3000ie8vqjolv9s6c` | linked→Daniel via CSV import; **use for Scenario B** |
| Member (child, linked) | Miriam Kato | `MVX-2026-00260` / `cmr9bhkta000je8vqoxbzwkx8` | linked→Daniel; optional dependant |
| Member (spouse, ORPHAN) | Sarah Kato | `MVX-2026-00257` / `cmr9b5u3l000ae8vq6hazjlqy` | NW-D02 exhibit (Add-Dependent path lost principalId) |
| Member (child, ORPHAN) | Miriam Kato | `MVX-2026-00258` / `cmr9b5woy000ce8vqbsawlrch` | NW-D02 exhibit |

Note: MVX member-number prefix (not NWSC) is a downstream effect of NW-D01. Member numbers used to disambiguate the linked vs orphan Sarah/Miriam throughout.

## Opening balances (P9, captured pre-Scenario A)
| Balance | Opening value | Evidence |
|---|---:|---|
| Daniel outpatient annual limit | KES 10,000,000 | member page; `P9-daniel-benefits-open.png` |
| Daniel used / remaining | 0 / 10,000,000 | same |
| Sarah (linked 00259) used / remaining | 0 / 10,000,000 | `P9-sarah-benefits-open.png` |
| NWSC self-funded fund balance | KES 5,000,000 | `P9-fund-deposited2.png` |
| Nakasero / IHK provider payable | 0 / 0 | DB (no claims) |
| GL trial balance | Balanced (dr=cr=3,736,856.96) | DB |

## Scenario A — Approved outpatient visit (Daniel Kato @ Nakasero) — **PASS**
Claim **CLM-2026-00772** (`cmr9d9q97000687vqk5t29ano`), KES.
- A1 member portal: Daniel sees NWSC cover, package, KES 10.0M balance, dependants nav (`P5-daniel-portal-landing.png`).
- A2–A7 capture (as CLAIMS_OFFICER, standing in for Nakasero — no provider login): member Daniel + provider Nakasero, DOS 2026-07-05, diagnosis **J06.9**, 3 lines Consultation 50,000 / CBC 35,000 / Pharmacy 45,000 = **130,000**; claim created RECEIVED.
- A8–A9 adjudication: contract engine (PC-2026-005) AUTO-priced payable **130,000** — consultation+CBC matched tariffs **by description**, pharmacy pay-as-billed.
- A10 decision APPROVED → routed through **2-level approval matrix** (L1 UNDERWRITER, L2 UNDERWRITER-or-above); cleared L1 as underwriter@, L2 as admin@ (SoD held: a MEDICAL_OFFICER attempt at an UNDERWRITER level was correctly refused). Claim → **APPROVED 130,000**.
- Side effects at approval: **member utilisation +130,000** (usage row: amountUsed 130,000, claimCount 1, no stuck hold); **self-funded fund drawdown 5,000,000 → 4,870,000**; GL **CLAIM_APPROVED** Dr Claims incurred 130,000 / Cr Claims payable 130,000 (balanced).
- A11–A13 settlement: finance@ created Nakasero Jul-2026 batch (`cmr9dp4ez...`, 130,000, 1 claim) → **maker self-approve REFUSED** (stayed MAKER_SUBMITTED) → finance.approver@ approved (CHECKER_APPROVED) → finance@ Mark Paid → **SETTLED**; claim **PAID**; voucher **PV-2026-00002** (130,000, PROCESSED); GL **SETTLEMENT_PAID** Dr Claims payable 130,000 / Cr Bank 130,000 (balanced, dr=cr=3,996,856.96).

## Scenario B — Partial-decline dependant visit (Sarah Kato @ IHK) — **PASS (with NW-D03 caveat)**
Primary exhibit **CLM-2026-00775** (`cmr9eaknt...`), KES. (CLM-00773 = an earlier APPROVED@40,000 artifact from a double-submit; CLM-00774 abandoned in CAPTURED.)
- B1–B5: Sarah **MVX-2026-00259** (linked dependant) resolved ACTIVE; claim opened against **Sarah, not Daniel**, at IHK; diagnosis **H52.4 Presbyopia**; lines Ophthalmological Exam 40,000 + Fitting Spectacle Frames 8,000 = 48,000.
- B6 adjudication: engine (PC-2026-006, unlisted=REJECT) → **PARTIALLY APPROVED, payable 40,000** — exam matched tariff (AUTO APPROVED 40,000), spectacle frames **DECLINED EXC-001** (8,000 write-off).
- B8 decision **PARTIALLY_APPROVED** (40,000) via the 2-level matrix → claim **PARTIALLY_APPROVED**. (Note: submitting the decision requires setting the action *before* the single Submit-Decision click — see driving note; product supports PARTIALLY_APPROVED.)
- B9 settlement: IHK Jul-2026 batch total **80,000** (CLM-00775 + CLM-00773 at approved 40,000 each) — **not** the 96,000 billed; rejected 8,000/claim excluded. Batch taken to **SETTLED** (finance@ maker → finance.approver@ checker → Mark Paid), GL balanced.
- B10 member view: Daniel's Care History shows the partial (40,000 / 8,000) and reason; family filter lists only Kato members.
- B11 rejected report: **FAIL — NW-D03** (partial's excluded line absent from Exclusion & Rejected report).
- Side effects: Sarah usage +40,000 per approved claim only (excluded 8,000 never counted); fund drawn by approved amounts only.

## Audit & Controls checklist
| Control | Result | Evidence |
|---|---|---|
| Actor traceability | **PASS** | AuditLog/AdjudicationLog attribute every claim/settlement/approval action to the correct user |
| Facility access (provider scope) | **N/A — gap** | No PROVIDER role/portal; provider steps run as claims-capture account (logged) |
| Member privacy | **PASS** | Daniel's portal shows only his family; unrelated members not visible |
| Dependant linkage | **FAIL (NW-D02) / PASS via import** | Add-Dependent orphans; CSV import links correctly |
| Employer scope | **PASS** | NWSC HR sees only NWSC's 5 members; no cross-employer leakage |
| Claims/finance separation | **PASS** | CLAIMS_OFFICER → `/unauthorized` on `/settlement` |
| Maker-checker | **PASS** | Settlement maker self-approve refused; claim & contract chains enforce SoD |
| Claim status transitions | **PASS** | Valid transitions logged; large decisions routed through approval matrix |
| Rejection reason | **PARTIAL** | EXC-001 in engine + claim AdjudicationLog; line-level fields blank (NW-D04) & report gap (NW-D03) |
| Ledger integrity | **PASS** | GL balanced after every approval and settlement |

## Closing balances
| Balance | Opening | Closing | Change |
|---|---:|---:|---|
| Daniel used / remaining | 0 / 10,000,000 | 130,000 / 9,870,000 | +130,000 approved |
| Sarah (00259) used / remaining | 0 / 10,000,000 | 80,000 / 9,920,000 | +80,000 (2×40,000 approved; excluded 8,000 lines not counted) |
| NWSC self-funded fund | 5,000,000 | 4,790,000 | −210,000 (payer share only) |
| Nakasero settled | 0 | 130,000 (SETTLED, PV-2026-00002) | approved payable |
| IHK settled | 0 | 80,000 (SETTLED) | approved payable only |
| GL trial balance | Balanced (3,736,856.96) | Balanced (4,076,856.96) | diff 0 throughout |

**Verdict: CONDITIONAL GO** — see `GO_NO_GO_READINESS.md`. Blockers: NW-D02 (dependant orphaning), NW-D03 (rejection report gap). Conditions: provider-portal scope, NW-D01 client binding, approval-matrix bands.

## Chronological log
(entries appended per module below)
