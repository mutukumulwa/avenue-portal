# Outstanding Conditions UAT — Execution Log

**Target:** https://avenue-portal.vercel.app · **Started:** 2026-07-07
**Build under test:** commit `8b3574e` (deploy `dpl_7noR…`, state READY, aliased to avenue-portal.vercel.app). Successful build ⇒ `db-sync` applied the new OBS-2/OBS-7 schema columns.
**Method:** front-end led via Chrome, actors as themselves. DB/logs only to verify side effects.

## Environment facts
- Admin: `admin@medvex.co.ug` / `MedvexAdmin2024!` (SUPER_ADMIN, James Kamau)
- Claims officer: `claims@medvex.co.ug` / `MedvexAdmin2024!` (Grace Wanjiku)
- Medical/fraud reviewer: `medical@medvex.co.ug` / `MedvexAdmin2024!` (Dr. Sarah Achieng)
- Finance maker: `finance@medvex.co.ug` / `MedvexAdmin2024!` (Peter Ochieng)
- Fraud trigger (synchronous on intake, `FraudService.evaluateClaim`): a claim billed **> 150,000** with **no linked PA** ⇒ HIGH "High Value Without Pre-Authorization" alert (score 85). Base UGX.

## Tracker (final)
| Suite | Status | Notes |
|---|---|---|
| A. OBS-7 fraud approval gate | **PASS (spine answered)** | Block + clearance + dual-approval routing all verified live |
| B1–B2. Currency label sweep | PARTIAL PASS + observations | Authoritative money surfaces UGX; residual KES labels on capture/list/fraud surfaces |
| B3–B5. FX & mixed-currency settlement | BLOCKED (data/policy) | Needs KES FX rate config + FX policy sign-off + a KES claim path; unit tests are compensating proof |
| C. GL coverage | PARTIAL | Fresh-flow GL blocked by expected 2-level matrix (needs 2 approver personas); coverage CLI available |
| D. Scale/load | BLOCKED-WINDOW | Won't load-test shared prod without approval; CI stress regression (1/46/100/250) is compensating proof |

## Suite A — OBS-7 fraud approval gate (executed as admin `admin@medvex.co.ug`)
| # | Result | Evidence |
|---|---|---|
| A1.1 setting visible | **PASS** | `/settings/claim-controls` renders; sidebar Setup → "Claim Money Controls" (ss_9420e7l5n) |
| A1.2 default | **PASS** | Default gate **OFF** (unchecked), threshold Medium, mode Clear-alert-OR-dual-approval |
| A3.1 set ON | **PASS** | Toggle ON → "Claim controls saved." persisted + audited (ss_0989f4y7a) |
| A3.2 flagged claim | **PASS** | Created **CLM-2026-00286** (Mark Kato / Aga Khan / UGX 200,000 / no PA) → 4 synchronous fraud alerts (1 HIGH "High Value Without Pre-Authorization" + 3 MEDIUM). Adjudicate panel showed the fraud-clearance banner listing all 4 |
| A3.3 approval blocked | **PASS** | Submit Decision → blocked with exact `enforceFraudGate` message; claim stayed **CAPTURED**, Approved **UGX 0** (ss_8716ce7kc) |
| A3.4 no premature exposure | **PASS** | No approval, no payable, no GL; status unchanged |
| A4.2 clearance | **PASS** | Reviewer dismissed all 4 alerts with reasons (resolved=true + audit) via Fraud console |
| A4.3 approve after clearance | **PASS** | Post-clearance the fraud banner disappeared and approval **passed the fraud gate** — it advanced to the next control (approval-matrix fail-closed for 200k) (ss_4257l1tqm) |
| Bonus — dual-approval routing | **PASS** | Approvals console shows the `ClaimFraudClearance` request distinct from the value-approval `Claim` request — no collision, validating the dedicated-entityType design (ss_1349wu3yb) |

**Spine answered:** a fraud-flagged claim CANNOT be approved/paid while the gate is ON and alerts are open; clearing the alerts satisfies the gate. Setting reverted to OFF (default) after testing.

## OBS-2 observations (found in UAT) — **FIXED 2026-07-07**
The Ticket-3 sweep fixed GL/settlement/formatMoney; these **presentation** surfaces also hardcoded KES on the UGX tenant (stored data + GL were already correct UGX). All now fixed — labels use the row's `claim.currency` where available, base UGX on pre-submit intake:
- OBS-OC-1 ✅ Claim intake wizard — `ProcedureSearch.tsx` ("Unit Cost (UGX)", per-line + total UGX), `DiagnosisSearch.tsx`, `ClaimForm.tsx` ("Total: UGX"), `ReimbursementClaimForm.tsx`.
- OBS-OC-2 ✅ Claims list — headers now neutral ("Billed"/"Approved") with **per-row `{claim.currency}`** prefixed (multi-currency-safe).
- OBS-OC-3 ✅ Claim detail "Service Line Items" card + tariff-variance banner — now `{claim.currency}`.
- OBS-OC-4 ✅ Diagnosis picker tariff — UGX (base).
- OBS-OC-5 ✅ Fraud desk / fraud-case notes — `fraud.service.ts` note generation now uses `claim.currency`; `fraud/[id]/page.tsx` formatter uses `claim.currency`. (Pre-existing alerts keep their old stored note text; new alerts are correct.)
- Bonus ✅ Co-contribution form label, reimbursement audit note.

Static guard `scripts/check-currency-labels.mjs` extended (JSX `KES {` + `(KES)` patterns) and now covers these surfaces — regressions fail the build. Verified: tsc clean, 513 tests green, guard green.

Authoritative money surfaces verified correct in UAT: claim Financial Summary (**UGX 200,000**), Adjudicate "Approved Amount (**UGX**)", stored claim currency UGX.

## Execution timeline
