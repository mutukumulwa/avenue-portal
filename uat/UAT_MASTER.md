# Avenue Portal — UAT Master Tracker

**Target:** https://avenue-portal.vercel.app/ (production Vercel deployment — what customers will test)
**Method:** UI-only, via browser. No direct SQL/API manipulation.
**Password for all seeded users:** `AvenueAdmin2024!`

## Status legend
- `[ ]` not tested
- `[x]` PASS
- `[F]` FAIL — see Defects log (uat/DEFECTS.md)
- `[B]` BLOCKED — see Defects log for blocker
- `[~]` PARTIAL — core path works, edge issue noted

## Resume pointer
> **CURRENT POSITION: ALL SECTIONS §1–§19 COMPLETE (first full pass, 2026-06-12). 18 defects logged in DEFECTS.md.**
> Remaining optional follow-ups: full calculator wizard walk (5.3), reimbursement claim submit (6.4), preauth admin approve/decline cycle (7.2), endorsement submit (8.2/15.3), broker quote create (16.2), member lifecycle termination actions (2.2), retest §17.4 + claims import after redeploy (DEFECT-014).
> Test artifacts created in prod: UAT Testmember AVH-2026-00250 (+card AV-UAT-99999, portal login, claim CLM-2026-00754 APPROVED, settlement batch Parklands Jun-2026), groups "UAT Test Co Ltd" ×2 + "UAT Prospect Ltd" + "Ursula Uattest", quote QUO-2026-00005, rate card "UAT Rate Card 2026", HR SR "UAT: test service request", member preauth PA-2026-00008, resolved complaint + dismissed fraud alert.
> Update this line after every workflow so an interrupted session can resume.
> Method note: Chrome extension unavailable → using Puppeteer (real browser, UI-only) via scripts in uat/*.mjs. Screenshots in uat/screenshots/.

## Test accounts
| Role | Email |
|---|---|
| SUPER_ADMIN | admin@avenue.co.ke |
| CLAIMS_OFFICER | claims@avenue.co.ke |
| FINANCE_OFFICER | finance@avenue.co.ke |
| UNDERWRITER | underwriter@avenue.co.ke |
| CUSTOMER_SERVICE | cs@avenue.co.ke |
| MEDICAL_OFFICER | medical@avenue.co.ke |
| FUND_ADMINISTRATOR | fund@avenue.co.ke |
| BROKER_USER | broker@kaib.co.ke |
| HR_MANAGER | emily.wambui@safaricom.co.ke |
| MEMBER_USER | member@avenue.co.ke |
| Member demos | member.demo.low / .nearcap / .family / .wallet / .preauth @avenue.co.ke |

---

## §1 Authentication & access control
- [x] 1.1 Login page loads on production URL
- [x] 1.2 Invalid credentials rejected with sane error ("Invalid email or password")
- [x] 1.3 Login as SUPER_ADMIN → lands on admin dashboard
- [x] 1.4 Login as each remaining role → correct portal (claims/finance/underwriter/cs/medical → /dashboard with role-trimmed nav; fund → /fund/dashboard; broker → /broker/dashboard; hr → /hr/dashboard; member → /member/dashboard). Note: fund redirect was slow on first try (transient stall on /post-login), passed on retry.
- [x] 1.5 Role separation: member → /dashboard blocked; HR → /member/dashboard blocked (Access Denied page)
- [x] 1.6 Logout works; /dashboard after logout redirects to /login

## §2 Admin — Members
- [x] 2.1 Members list loads (249 seeded), search filters (Wairimu → 11 of 249), status/relationship filters present
- [x] 2.2 Member detail renders: QR, limits (annual/utilised/remaining), transfers, portal login, device enrollment, family unit, lifecycle actions (cooling-off cancel, lapse, record death, termination w/ senior approval)
- [x] 2.3 Created member via UI → AVH-2026-00250 "UAT Testmember" (Safaricom PLC, ACTIVE). **UAT test record left in system** (id cmq9udg5o000004k3zr7kpgan)
- [x] 2.4 Edit member: changed phone, saved, persisted on reload
- [x] 2.5 Card: Issue Card → confirm dialog → "Card issued successfully" (AV-UAT-99999)
- [F] 2.6 Letters: **Generate & Download crashes** — server-side exception, Digest 2671985791. Reproduces on seeded member too. → DEFECT-001
- [x] 2.7 Onboarding: Start Onboarding creates 5-item checklist (KYC, portal, card, comms, network)
- [x] 2.8 Portal login: Create Login with temp password → account ACTIVE, reset available. (Note: dedicated /members/[id]/portal route is an empty scaffold → 404, but UI lives inline on detail page — DEFECT-002 S4)
- [~] 2.9 Transfer: inline form opens with destination group/effective date/reason + Confirm Transfer (render verified; not executed to avoid corrupting later group tests). Same scaffold note for /transfer route.
- [x] 2.10 Import page: CSV template download + full column guide
- [x] 2.11 Reinstatement queue renders (0 pending, sane empty state)

## §3 Admin — Groups & schemes
- [x] 3.1 Groups list loads (6 seeded groups + status filters)
- [x] 3.2 Safaricom detail: members 79, contribution, contact, 3 benefit tiers, broker, endorsements
- [x] 3.3 Created "UAT Test Co Ltd" via UI. **BUT double-submit created a duplicate** → DEFECT-003 (no double-submit guard / duplicate-name check). Two UAT Test Co Ltd rows left in system.
- [x] 3.4 Individual enrolment end-to-end → "Ursula Uattest" scheme created (funding-mode select incl. self-funded). Minor: detail header shows "— · —" for blank industry/county.
- [~] 3.5 Edit group form renders w/ all policy fields (save not exercised)
- [x] 3.6 Reprice workbench renders real actuarial data (Safaricom loss ratio 59.3%, prior claims 11.5M, Start Renewal Quote button)
- [x] 3.7 Self-funded admin panel inline on group detail (EABL: funding mode, admin fee, fund admins). Scaffold /self-funded route 404s → DEFECT-002 scope
- [x] 3.8 Tiers inline on group detail (EABL "Add Tier" empty state; Safaricom 3 tiers). Scaffold /tiers route 404s → DEFECT-002 scope

## §4 Admin — Packages & pricing
- [x] 4.1 Packages list (3 seeded, limits/contributions shown)
- [x] 4.2 Package detail (10 benefit categories, version v1) + edit form with benefit schedule
- [~] 4.3 Builder renders full form (creation not executed — covered by pattern; revisit if time)
- [x] 4.4 Rate matrix: created "UAT Rate Card 2026" via UI → matrix editor (9 family sizes × limit bands) works
- [F] 4.5 Pricing models: list renders BUT "Create Model" button is a dead placeholder (no handler in code) → DEFECT-004. No pricing model can be created via UI.

## §5 Admin — Quotations (sales pipeline)
- [x] 5.1 Quotations list (4 seeded + status filters, KPI cards)
- [x] 5.2 New Business Intake end-to-end → QUO-2026-00005 created, redirects to assessment. Add Life works (added principal to draft QUO-2026-00004; Lives 0→1). Note: Add Life correctly hidden once quote is SENT.
- [~] 5.3 Calculator: 5-step wizard renders (step 1 fields verified; full wizard walk not executed)
- [F] 5.4 Detail renders, but (a) **prospect name shows "Unnamed Prospect"/"—" for intake-created quotes** even though bind page shows it correctly → DEFECT-006; (b) **quotation PDF returns HTTP 500** ("Failed to generate PDF") for both seeded and new quotes → DEFECT-005
- [F] 5.5 Send to Client works (DRAFT→SENT timeline). Accept & Convert works (→ACCEPTED). **But "Create Group" silently fails** — POST 303, no group created, no error → DEFECT-007. Bind page renders 4-step maker-checker workflow (Acceptance → Create Members → Binder Approval → Debit Note); "Create Memberships" gives no feedback with 0 lives.
- [x] 5.6 Onboarding queue lists members w/ outstanding items (UAT Testmember 0/5)
- Cosmetic: "0 lifes" should be "lives" → DEFECT-008

## §6 Admin — Claims
- [x] 6.1 Claims list (753 seeded, KPI cards, filters)
- [x] 6.2 Claim detail: financial summary, diagnoses, line items, document attach, adjudication controls
- [x] 6.3 New claim wizard E2E → CLM-2026-00754 (member search, provider search, encounter, ICD-10 lookup w/ standard charges, consultation line, submit). Status RECEIVED on creation.
- [~] 6.4 Reimbursement claim page renders w/ explainer (full submission not executed)
- [x] 6.5 Claims import page (Excel template, column spec A–F+)
- [x] 6.6 Assessor queue renders (my queue / pending senior / unallocated)
- [x] 6.7 Adjudication E2E: Mark as Captured → line-item ✓ → Compute Outcome → claim APPROVED (5,000/5,000). **BUT clicking "Submit Decision" before Compute Outcome crashes with server exception** (Digest 2813583153) → DEFECT-009

## §7 Admin — Preauth & check-ins
- [x] 7.1 Preauth list (7 seeded, KPI cards)
- [~] 7.2 New preauth form renders w/ member select (approve/decline cycle not executed — detail page shows decision controls; seeded PA-MEXP-004 demonstrates DECLINED flow worked)
- [x] 7.3 Preauth detail: financials, diagnoses, procedures, clinical notes, document attach
- [x] 7.4 Check-ins list + detail (verification flow w/ reception code match, restart/cancel for expired)
- [~] 7.5 Visit detail not separately exercised (no visit links found on swept pages)

## §8 Admin — Endorsements
- [x] 8.1 Endorsements list (status + type filters, 8 endorsement types)
- [~] 8.2 New endorsement form renders (group select, 8 types, member fields, status-flow explainer). Full submit not executed.
- [x] 8.3 Endorsement detail: pro-rata financial impact (+KES 1,875 debit), change details, APPLIED status

## §9 Admin — Billing, settlement & finance
- [x] 9.1 Billing: invoices list, totals (39.6M billed / 38.4M collected / 1.2M outstanding)
- [x] 9.2 Funds overview renders. Note: all fund balances KES 0 + "1 scheme have a depleted fund balance" (data gap + grammar, see DEFECT-011/observations)
- [x] 9.3 GL (24 accounts, trial balance) + account ledger w/ account picker
- [x] 9.4 Reconciliation: upload page w/ statement format spec renders
- [F] 9.5 Settlement: batch created (Parklands Jun-2026, 1 claim KES 5,000) and checker approval works under finance user. **BUT (a) create-batch crashes post-action (Digest 3362540806), (b) maker self-approve crashes instead of friendly error, (c) final "Paid" button does nothing — batch can't reach SETTLED** → DEFECT-010

## §10 Admin — Brokers & providers
- [x] 10.1 Brokers: list, detail (tabs: overview/producers/KYC/schedules/ledger/payouts), edit + new forms (hierarchy types, IRA compliance)
- [x] 10.2 Providers: list (tiers OWN/PARTNER/PANEL), detail (CPT tariffs, claims count), new form w/ Leaflet map pin

## §11 Admin — Service desk
- [x] 11.1 Complaints: list w/ status KPIs, detail, **Mark Resolved with resolution note works** (INVESTIGATING → RESOLVED)
- [x] 11.2 Service requests queue renders (empty — "Inbox zero"); detail untested for lack of data (HR-raised SR tested in §15)

## §12 Admin — Fraud & overrides
- [x] 12.1 Fraud desk: heuristics fired on UAT claim automatically (After-Hours Outpatient Anomaly, score 60). Detail + **Dismiss Alert works** (open 9→8)
- [x] 12.2 Check-in audit renders (biometric/fallback/override stats)
- [x] 12.3 Overrides queue + patterns dashboard render (empty states sane)

## §13 Admin — Analytics & reports
- [x] 13.1 Strategic Purchasing console (portfolio MLR 101.2%, covered members, alerts)
- [x] 13.2 Alerts inbox, board-pack, parity, risk workbench all render
- [x] 13.3 Provider drill-down via report link works (Parklands cost/claims). No /analytics/providers index — by design (link-only).
- [F] 13.4 Renewals pipeline renders, **but its own drill-down link → in-shell 404** (/analytics/renewals/[groupId] for Patricia Wanjiru scheme) → DEFECT-012
- [x] 13.5 Scheme drill-down works (Bamburi MLR 144.3%, contribution vs claims)
- [x] 13.6 Reports hub: 34 reports / 5 categories; sampled 8 report types render; **CSV export verified** (membership → valid CSV incl. fresh UAT data)

## §14 Admin — Settings
- [x] 14.1 Settings home: Users & Roles list incl. invite + inline role select (newly created users appear)
- [x] 14.2 Approval matrix renders
- [x] 14.3 Audit log renders (14 records, user filter)
- [x] 14.4 Exceptions page renders

## §15 HR portal (emily.wambui@safaricom.co.ke)
- [x] 15.1 HR dashboard (79 members, trend chart, balance)
- [x] 15.2 Roster + member detail (UAT Testmember visible w/ admin-edited phone — cross-portal consistency ✓)
- [~] 15.3 Roster/new renders ("Request Member Addition" → endorsement; submit not executed)
- [x] 15.4 Roster import (CSV bulk-add endorsements)
- [x] 15.5 Endorsements list + detail
- [x] 15.6 Invoices
- [x] 15.7 Utilization dashboard (175 claims, premium totals)
- [x] 15.8 Support: **raised service request E2E** ("UAT: test service request" → OPEN in HR support desk)
- [x] 15.9 Profile renders
- Note: every HR page logs a 404 prefetch of /hr (no index page) → DEFECT-013

## §16 Broker portal (broker@kaib.co.ke)
- [x] 16.1 Broker dashboard (groups, members, commissions, renewals KPIs)
- [~] 16.2 Quotations list shows broker-scoped quotes (Antler); new-quote form renders (creation not executed)
- [x] 16.3 Quote detail accessible (via list)
- [x] 16.4 Groups list + detail (Safaricom, member roster)
- [x] 16.5 Submissions list + detail (END-2024-00002 tier change w/ pro-rata + JSON payload)
- [x] 16.6 Renewals (urgency buckets, overdue flag)
- [x] 16.7 Commissions ledger (empty state sane)
- [x] 16.8 Support page (contact channels)

## §17 Fund portal (fund@avenue.co.ke)
- [~] 17.1 Fund dashboard renders, but KPIs all KES 0 vs claims page 17.7M paid → DEFECT-015 (uninitialised fund account)
- [F] 17.2 Group fund overview renders BUT **Record Deposit crashes (Digest 2550466935) and does not persist** — fund accounts cannot be initialised → DEFECT-016
- [x] 17.3 Fund claims view (164 claims, totals)
- [F] 17.4 **Statement tab 404s in production** (page exists in origin/main — stale deployment) → DEFECT-014; export API also 404

## §18 Member portal (member@avenue.co.ke + demo members)
- [x] 18.1 Member dashboard (cover balance, QR member card, package/renewal)
- [x] 18.2 Benefits (annual cover usage vs year elapsed)
- [x] 18.3 Check-in page renders, graceful empty state ("ask front desk to initiate")
- [x] 18.4 Dependents (family benefit balance, covered members)
- [F] 18.5 Documents page renders BUT seeded document links 404 (/seed-docs/*.pdf missing from deployment) → DEFECT-017
- [x] 18.6 Facilities w/ cost preview by procedure
- [x] 18.7 Health vault (private workspace) — 1 stray 404'd resource
- [x] 18.8 Notifications inbox (3 unread, mark-all-read)
- [x] 18.9 Preauth: list + **new request submitted E2E → PA-2026-00008 UNDER REVIEW**. Note: submit button sits in "Submitting…" with no redirect for several seconds (UX polish)
- [x] 18.10 Profile
- [x] 18.11 Reinstatement (correct "membership active" state)
- [x] 18.12 Security (device/WebAuthn registration UI renders; biometric registration not testable headless)
- [x] 18.13 Support (helpline, WhatsApp)
- [x] 18.14 Utilization + claim drill-down (care cost detail w/ member share)
- [x] 18.15 Wallet (demo wallet member: outstanding KES 1,800, M-Pesa sandbox flow, payment-confirmation rule)

## §19 Cross-cutting
- [~] 19.1 Console errors tracked per page throughout; recurring ones logged (DEFECT-013 /hr prefetch, DEFECT-017 seed-docs). No JS runtime exceptions observed on happy paths.
- [x] 19.2 Bad URLs → 404 (default Next.js page — unbranded, polish item); unauthorized → branded Access Denied page
- [x] 19.3 Mobile 390px: member dashboard/benefits clean, swipe nav, PWA install prompt, no horizontal overflow
