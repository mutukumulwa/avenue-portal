# GO / NO-GO — Comprehensive UAT (2026-07-15) — STANDING VERDICT

## Verdict: 🟡 **CONDITIONAL GO** — spine verified strong; breadth + launch conditions outstanding.

Target: live `https://avenue-portal.vercel.app` (build `db60142`). Method: `uat` skill, UI/API-driven,
**no DB injects** (DB used read-only for one export-scope check). Decided by the four spine questions
and blockers — **no Critical/High defect was found in this pass**; one Medium (CU-001).

This verdict covers **what was exercised this pass** (money spine, concurrency re-verify, RBAC/isolation,
API auth, money-control config, analytics/reports render, scale). A **full GO** requires clearing the
untested-risk register below.

---

## Spine questions (decide the verdict)
| # | Question | Status | Evidence (this pass, live) |
|---|----------|--------|----------|
| **S1** | Money leaves only per contract, exactly once? | 🟢 **verified strong** | Uncoded line ceiling=0, full-billed approval **refused** server-side; **FG-C7** double Mark-Paid → exactly **1 voucher (PV-2026-00009) + 1 JE**; GL trial balance **Balanced**; approval matrix (amount-band, dual ≥200k); auto-adjudication ceiling 100k + clean-fraud gate; double-capture detection routes dup claims. |
| **S2** | PII/health data readable only by the entitled? | 🟢 **verified strong** (N3 caveat) | `requireRole` uniform & **route-level** (branded Access-Denied) across 7 roles; IDOR blocked (member cross-claim 404, provider cross-facility 404, positive controls pass); **all 7 B2B API rails 401** on no/bogus/burned-default key; **authenticated scope PASS** (Aga Khan key: Default-Client members 200, NWSC 404 = cross-client isolation); scoped roles isolated; staff capability route-enforced. **Caveat: N3 cross-employer exposure re-confirmed live** (shared Default Client — DOB readable across 6 employers; open business decision). |
| **S3** | Core revenue workflow runs end-to-end? | 🟡 **partial** | Pipeline proven **across records** (fresh intake→capture→adjudicate; separate approve→settle→PAID→GL). Single fresh-record **full** chain not completed (uncoded test claim needs a senior override to pay); quote→bind and enrol→…→settle full chains not run this pass. |
| **S4** | Controls fail closed under attack/concurrency? | 🟢 **verified strong** | FG-C7 stale-retry refused (no double-pay); over-ceiling approval refused; FG-C5 pre-coverage rejected; fraud detection + auto-adjudication fraud-gating; double-capture. |

## Fork-B fix re-verification scoreboard
| Fix | Deployed | Live re-verified this pass? | Result |
|-----|----------|-----------------------------|--------|
| FG-C5 point-in-time coverage | yes | ✅ YES | PASS both directions (2020 reject banner / 2026-07-14 accept → CLM-2026-00307) |
| FG-C7 Mark-Paid atomicity | yes | ✅ YES | PASS — stale 2nd Mark-Paid refused; exactly 1 voucher + 1 JE |
| FG-C6 endorsement concurrency | yes | ⏳ not this pass | shares proven FG-C7 atomic-guard pattern (unit-verified) |
| FG-C8 PA decision concurrency | yes | ⏳ not this pass | same pattern |
| FG-C9 case-close concurrency | yes | ⏳ not this pass | same pattern |
| FG-C10 live hold-expiry | yes | ⏳ not this pass | — |
| FG-C11 bind/amend/settle-approve | yes | ⏳ not this pass (approveSettlementBatch exercised indirectly via M3) | same pattern |
| FG-C1 offline pack scope | yes (prior D-14) | carried | prior FIXED-VERIFIED |
| BD-06 default operator key | yes | ✅ YES | burned key `av-slade360-dev-key` → 401 on all rails |
| BD-07 unpriced-line ceiling | yes | ✅ YES | uncoded line ceiling 0, full-billed refused |

## Blocking issues
**None found this pass.** No Critical or High defect surfaced across the money spine, isolation,
concurrency (FG-C7), or config controls exercised.

## Defects
| ID | Sev | Title | Status |
|----|-----|-------|--------|
| CU-001 | Medium | Report **on-screen** views capped their KPI summaries to the table sample (membership 2,999→100, claims 307→100, member-statements 2,997→200, + 12 latent); CSV exports were always correct. | **✅ FIXED-VERIFIED LIVE (all 16 reports)** — `1297d5b` (membership) + `1f76727` (claims/preauth/billing/utilization/endorsements/quotations/member-statements/admissions/admission-visits/commission/levies/fees/admin-fee/quotation-funnel/comparison-services); aggregate/count-based KPIs + "Showing first N of Total" note; dpl_AEFWvWs1 READY. Live: claims 308, member-statements 2,997, membership 2,999; small reports (quotations 3) no regression |

## Standing conditions (survive even if all defects clear)
1. ~~**Fraud approval gate is OFF** (CU-OBS-1)~~ **RESOLVED 2026-07-15** — the fraud approval gate was
   **ENABLED** at Medium severity (cleared only by OPS/fraud/medical, audited); persisted + verified.
   Fraud-flagged claims (≥Medium) now hold from approval until cleared.
2. **Prod is a seeded demo dataset, not a clean production load** (OBS-Q1/Q2 carried; fund shows negative
   balance with 0 deposits, CU-OBS-5). A real-prod cutover needs a clean load + conservation tie-out
   (Family Q cannot pass on this data).
3. **N3 cross-employer exposure** (carried OPEN) — shared "Medvex — Default Client" pools 6 employers;
   any of 190 client-entitled providers can read any of the ~249 members. Business decision, not a
   regression. Re-quantify + sign-off pending.
4. **Analytics unpopulated** (CU-OBS-6) — aggregation job hasn't run on this env; analytics correctness
   unverifiable until it does.
5. Operator API-key rotation + real-prod env config = cutover tasks (out of app scope).

## Untested-risk register — MOSTLY CLEARED across legs 2–3 (see MASTER_RUN_LOG)
**Now covered (live):** authenticated B2B scope + injection + N3 (task 8 ✅ — E2E-D02 cross-client
isolation PASS, N3 re-confirmed, negative/oversized/malformed/XSS/SQLi all rejected, idempotency PASS);
member portal (preauth auto-approve, wallet, health-vault ✅; **Family-F check-in BLOCKED** — 2-actor +
WebAuthn); M19 override + approval-matrix **enforcement** (≥200k dual + maker≠checker ✅); M24 mobile ✅;
M16 contract tiering ✅; M7 quote→bind (4-step maker-checker + census-integrity gate, present/gated);
M6 cases (present/gated); settings sweep (security/fx/integrations/drug-exclusions/audit ✅); CU-001
refined (membership-report-specific, not systemic).

**Genuinely still not driven (low residual):**
- Individual FG-C6/C8/C9/C10/C11 **live-races** (credited by the proven FG-C7 atomic-guard pattern;
  not re-raced to avoid foreign-record GL/invoice/group mutations).
- **Family-F check-in** deep security (replay/one-time/facility-bound) — needs 2-actor + WebAuthn, not
  tool-drivable.
- Full **bind** (needs a census-populated quote) → group; case **open→close** end-to-end.
- HR roster add/import; broker quote create→submit; fund statement export; providers onboarding (M17);
  cross-border/complaints/service-requests; notifications/terminology/pricing-models render.
- **Conservation (M26):** blocked by seed data. **Reports PDF export** + tie-out on other reportTypes.
- **Scale:** member registry renders 2,999 (accurate); load not stress-tested.

## Scope caveat
Modules exercised with live evidence: **M2, M3, M4 (member PA auto-approve), M5 (endorsements module),
M8, M9, M10 (member/provider), M11.8, M12 (member portal: preauth/wallet/health-vault/benefits;
check-in BLOCKED), M16 (contract tiering), M18, M19 (approval-matrix enforcement + override), M20 (fraud
gate/approval matrix/auto-adjudication/drug-exclusions/audit-log), M21 (tenant onboarding), M22, M23,
M24 (mobile), M27** + fork-B FG-C5/FG-C7/BD-06/BD-07/33e005b. Partial: **M1 (single-record full chain).**
Pending: **M6 (cases/LOU), M7 (quote→bind), M13–M15 (HR/broker/fund deep workflows), M17 (providers
onboarding), authenticated B2B scope (M11.2–7) + N3 re-quantify, M25 (injection depth), M26 (conservation
— blocked by seed data)**, and the individual FG-C6/C8/C9/C10/C11 live-races (credited by the proven
FG-C7 atomic-guard pattern; not individually driven to avoid foreign-record financial mutations).

**Leg 2 note (continuation of untested register):** added M4/M5/M12/M19/M24 coverage; **no new blocker**;
strengthened S1 (dual-approval + maker≠checker SoD enforced live) and S3 (member self-service PA works).
New observations CU-OBS-12/13/14. Verdict unchanged: **CONDITIONAL GO**.
