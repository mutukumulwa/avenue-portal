# UAT_MASTER — Comprehensive Tracker (2026-07-15)

Legend: `[ ]` not tested · `[x]` PASS · `[F]` FAIL (defect ID) · `[B]` BLOCKED (reason) ·
`[~]` PARTIAL (what was/wasn't exercised)

Target: https://avenue-portal.vercel.app · build `db60142` · no DB injects · UI/API-driven.

## STATUS SUMMARY (2026-07-15)
| Module | Status | Note |
|---|---|---|
| M2 ceiling/uncoded | `[x]` PASS | uncoded→ceiling 0, full-billed refused (S1) |
| M3 settlement + FG-C7 | `[x]` PASS | 1 voucher + 1 JE; stale-retry refused |
| M8 FG-C5 coverage | `[x]` PASS | 2020 reject / 2026-07-14 accept |
| M9 RBAC sweep | `[x]` PASS | 12 roles; uniform route-guard |
| M10 IDOR | `[~]` PARTIAL | member+provider IDOR blocked; broker/HR/fund scope ok; N3 open |
| M11.8 API auth | `[x]` PASS | all 7 rails 401 (no/bogus/burned key) |
| M11.2–7 authed scope | `[ ]` pending | needs provider key |
| M18 fraud desk | `[x]` PASS (functional) | dedup/after-hours/over-tariff |
| M20 money controls | `[~]` fraud gate OFF (CU-OBS-1); matrix + auto-adj OK |
| M22 analytics | `[~]` renders, unpopulated (CU-OBS-6) |
| M23 reports | `[F]` CU-001 (on-screen cap); export OK |
| M27 scale | `[x]` member registry 2,999 accurate |
| M1 chained lifecycle | `[~]` PARTIAL | intake→capture→adjudicate; full chain needs override |
| M4–M7, M12–M17, M19, M21, M24, M25, M26 | `[ ]` pending | see GO_NO_GO untested register |
| FG-C6/C8/C9/C10/C11 live | `[ ]` pending | share proven FG-C7 pattern |

Legend detail unchanged below.


---

## Band 1 — Money spine & concurrency (S1, S4)

### M1 — Money spine E2E (chained lifecycle)
- [ ] M1.1 Onboard a client (or reuse) → group → package/contract wired
- [ ] M1.2 Enroll a member through the UI (card/coverage active)
- [ ] M1.3 Preauth request → benefit hold placed (verify reservation side effect)
- [ ] M1.4 Approve preauth (as approver role) → hold stands
- [ ] M1.5 Submit claim against the preauth → intake accepted
- [ ] M1.6 Adjudicate → decision within contract ceiling
- [ ] M1.7 Settlement batch (maker) → approve (checker) → Mark Paid
- [ ] M1.8 Verify: 1 voucher, GL JE posted & balanced, hold consumed not orphaned, audit rows, notification

### M2 — Adjudication correctness (ceiling / co-pay / exclusion / unpriced)
- [ ] M2.1 Claim within ceiling → pays contract amount
- [ ] M2.2 Claim over ceiling → capped at ceiling (not billed)
- [ ] M2.3 Mixed coded+uncoded lines → ceiling = Σ priced only (BD-07 shape)
- [ ] M2.4 Excluded service / drug-exclusion → declined line
- [ ] M2.5 Co-pay applied correctly
- [ ] M2.6 Partial approval excludes correct lines; GL reflects only approved

### M3 — Settlement + Mark-Paid + GL (incl. FG-C7)
- [ ] M3.1 Maker creates batch; checker approves (SoD enforced)
- [ ] M3.2 Mark Paid → exactly 1 voucher + 1 balanced JE (Dr 2010 / Cr 1010)
- [ ] M3.3 **FG-C7 re-verify:** retry / second-session Mark Paid → CONFLICT, no 2nd voucher/JE
- [ ] M3.4 Supplementary batch (sequence) works; second batch per provider+cycle allowed
- [ ] M3.5 Only approved amounts post to GL

### M4 — Preauth lifecycle + benefit hold (incl. FG-C8, FG-C10)
- [ ] M4.1 PA request places hold; available limit drops by hold
- [ ] M4.2 PA approve/decline terminal; **FG-C8** concurrent 2nd decision → stale reject, no phantom hold
- [ ] M4.3 PA expiry releases hold; **FG-C10** available limit reflects expiry live (worker-independent)
- [ ] M4.4 Approved PA consumed by claim (hold → usage, not double-counted)

### M5 — Endorsements + pro-rata + GL (incl. FG-C6)
- [ ] M5.1 Member-add endorsement → pro-rata invoice + GL adjust
- [ ] M5.2 **FG-C6** concurrent 2nd approve → rejected, no double GL / double invoice
- [ ] M5.3 Member-remove endorsement → correct credit/pro-rata

### M6 — Cases / LOU / closeAndFile (incl. FG-C9)
- [ ] M6.1 Open case → add services → close & file → exactly one claim
- [ ] M6.2 **FG-C9** concurrent 2nd close → no duplicate claim
- [ ] M6.3 LOU issue / close

### M7 — Quotations → bind → convert (incl. FG-C11)
- [ ] M7.1 New quotation → build → assess → **bind** → group created
- [ ] M7.2 **FG-C11** double-bind → single membership set; double amendment-apply → single pro-rata
- [ ] M7.3 Quote lifecycle states honoured

### M8 — Point-in-time coverage (FG-C5 + adjacent)
- [ ] M8.1 **FG-C5** service date < coverage start → rejected at `/claims/new` (friendly banner)
- [ ] M8.2 In-window service date → accepted
- [ ] M8.3 **Adjacent:** reimbursement rail `/claims/new/reimbursement` — same gate, error surfaced?
- [ ] M8.4 **Adjacent:** B2B `/api/v1/claims` cover-start parity

## Band 2 — Isolation (S2)

### M9 — RBAC sweep (12 roles × routes)
- [ ] M9.SUPER_ADMIN · [ ] M9.CLAIMS_OFFICER · [ ] M9.FINANCE_OFFICER · [ ] M9.UNDERWRITER
- [ ] M9.CUSTOMER_SERVICE · [ ] M9.MEDICAL_OFFICER · [ ] M9.REPORTS_VIEWER · [ ] M9.BROKER_USER
- [ ] M9.MEMBER_USER · [ ] M9.HR_MANAGER · [ ] M9.FUND_ADMINISTRATOR · [ ] M9.PROVIDER_USER
- For each: lands on correct surface · nav trimmed · forbidden route → branded denial (not data/crash) · data scope holds

### M10 — Data isolation deep (IDOR)
- [ ] M10.1 HR sees only own group; cross-group member → 404/denied
- [ ] M10.2 Broker sees only own book; foreign group → denied
- [ ] M10.3 Fund sees only own scheme
- [ ] M10.4 Member sees only self; cross-member card/health-vault → denied; benefits param ignored
- [ ] M10.5 Provider sees only own facility's claims/members
- [ ] M10.6 **N3** cross-employer exposure — confirm documented OPEN state (not regression)

### M11 — Provider portal + B2B API
- [ ] M11.1 Provider portal: dashboard / claims / eligibility / settlements / api-keys
- [ ] M11.2 `/api/v1/eligibility` — auth + client-entitlement scope
- [ ] M11.3 `/api/v1/benefits` — auth + scope
- [ ] M11.4 `/api/v1/claims` — auth + facility-bind + validation (neg/malformed)
- [ ] M11.5 `/api/v1/preauth` — auth + scope
- [ ] M11.6 `/api/v1/sync` — auth (offline ingest)
- [ ] M11.7 `/api/v1/hms-batch` — auth + facility-bind (FG-C3/C4; dormant, 401 expected)
- [ ] M11.8 No-key / bogus-key on every rail → 401 (both header forms)

## Band 3 — Portals end-to-end (S3)

### M12 — Member portal (incl. Family F check-in)
- [ ] benefits · [ ] check-in (F: challenge/one-time/facility-bound) · [ ] preauth (new/list/detail)
- [ ] wallet (M-Pesa) · [ ] health-vault · [ ] dependents · [ ] documents · [ ] utilization · [ ] support · [ ] security (WebAuthn)

### M13 — HR portal
- [ ] dashboard · [ ] roster (list/new/import/detail) · [ ] endorsements (new/list/detail) · [ ] invoices · [ ] utilization · [ ] support · [ ] profile

### M14 — Broker portal
- [ ] dashboard · [ ] quotations (new/list/detail) · [ ] groups · [ ] commissions · [ ] renewals · [ ] submissions · [ ] support

### M15 — Fund portal
- [ ] dashboard · [ ] scheme view · [ ] claims · [ ] statement export

## Band 4 — Config & distribution (S1, S3)

### M16 — Underwriting: packages / rate-matrix / pricing / contracts
- [ ] packages (list/builder/[id]/edit) · [ ] rate-matrix · [ ] pricing-models
- [ ] contracts (new/import/[id]/queues/analytics) · [ ] fee-schedule service-category tiering (tabs populated)

### M17 — Providers onboarding + provider contracts
- [ ] providers (list/new/[id]) · [ ] provider contracts ([contractId])

### M18 — Fraud + fraud-gate-settlement
- [ ] fraud (rules/investigations/check-ins/[id]) · [ ] OBS-H1: fraud alert gates settlement (not just advisory)

### M19 — Overrides / approvals / queues
- [ ] overrides (list/[id]/patterns) · [ ] approvals · [ ] assessor-queue · [ ] onboarding-queue · [ ] approval-matrix enforced

### M20 — Settings sweep
- [ ] approval-matrix · [ ] auto-adjudication · [ ] claim-controls (fraud gate toggle) · [ ] fx-rates · [ ] drug-exclusions
- [ ] integrations · [ ] notifications · [ ] pricing-models · [ ] security · [ ] terminology · [ ] audit-log · [ ] exceptions

### M21 — Tenant onboarding
- [ ] /settings/tenants create + re-provision · [ ] slug-lock fail-closed (non-platform-admin denied)

## Band 5 — Reporting, analytics, hygiene, scale

### M22 — Analytics
- [ ] dashboard · [ ] alerts · [ ] board-pack · [ ] parity · [ ] renewals · [ ] risk · [ ] schemes/[id] · [ ] providers/[id]

### M23 — Reports + export tie-out
- [ ] each reportType renders · [ ] CSV export contains fresh UAT records · [ ] PDF export renders · [ ] figures tie to source

### M24 — Cross-cutting hygiene
- [ ] console/network errors tracked per page · [ ] 404 branded · [ ] /unauthorized branded · [ ] mobile viewport spot-check · [ ] empty states

### M25 — Input-boundary & injection
- [ ] negative/oversized amounts (UI + API) · [ ] malformed payloads → 400 not 500 · [ ] XSS/SQLi-shaped inputs neutralised · [ ] double-submit guards

### M26 — Conservation tie-out (Family Q)
- [ ] paid claims vs GL vs vouchers (note OBS-Q1/Q2 seed-data caveat)

### M27 — Scale
- [ ] lists / search / dropdowns / exports hold at 2,999-member volume (no inject; verify existing volume)

---

## Cross-cutting suites (tracked continuously, not a single line)
- RBAC sweep (M9) · console/network hygiene (M24) · exports/propagation (M23) · empty states (M24) · mobile (M24).
