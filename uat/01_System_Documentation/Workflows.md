# Medvex TPA — Workflow Catalogue (as-built)

Describes how the system **currently behaves**, derived from code (services, routers, pages, jobs) and to be confirmed live in Phase 5. Status transitions quote the schema enums. Each workflow lists: trigger → actors → steps → rules → outputs → exceptions. Test execution status lives in `06_Test_Results/`, not here.

Legend: 🅰 admin console · 🅗 HR portal · 🅑 broker portal · 🅕 fund portal · 🅜 member portal · ⚙ background job · 🔌 API

---

## A. Onboarding & configuration

### A1. Operator provisioning (implementation team)
- **Trigger:** new environment. **Actors:** implementer.
- **Steps:** provision Postgres/Redis/MinIO → `.env` → `prisma db push` (migrations history is NOT reproducible — build-log warning) → `prisma db seed` (creates tenant, Default Client, house terminology, currencies+FX, auto-adjudication policy, riders, case-mix weights, tax rates, 15 users, 3 packages, 6 providers + tariffs, 3 brokers, 7 groups, ~250 members, demo claims/PAs/endorsements/invoices/quotations, ICD-10/CPT, chart of accounts, fraud rules, complaints…) → `npm run dev` + `npm run worker`.
- **Business rule:** there is **no clean-install path** that seeds only reference data without Kenyan demo data — flagged for readiness assessment.
- **Outputs:** working stack; login `admin@medvex.co.ug` / `MedvexAdmin2024!`.

### A2. Client (payer) management 🅰 ADMIN_ONLY
`/clients` list → `/clients/new` → detail → edit. Client = insurer/HMO/self-funded employer; carries status (`ClientStatus`), payer type, terminology overrides. Seeded: "Default Client".

### A3. User & role management 🅰 ADMIN_ONLY
`/settings`: invite user (email + role), inline role change, deactivate. Parallel fine-grained RBAC (Role/Permission/UserRoleAssignment with maker-checker PENDING_APPROVAL→ACTIVE) seeded from `prisma/seeds/rbac.ts`. Password policy in `src/lib/password-policy.ts`; reset via `/reset` + `PasswordResetToken`. 2FA (TOTP) config under `/settings/security`.

### A4. Terminology 🅰 — `/settings/terminology`: per-client vocabulary overrides (TerminologyEntry, scope + status + approval).
### A5. FX rates 🅰 — `/settings/fx-rates`: currencies + FxRate (base UGX).
### A6. Approval matrix 🅰 — `/settings/approval-matrix`: ApprovalMatrix + ApprovalStep per ApprovalActionType (CLAIM_PAYMENT fully wired; other types engine-ready, screens not all initiating — FEATURE_STATUS #8).
### A7. Auto-adjudication policy 🅰 — `/settings/auto-adjudication`: ceiling, categories (AutoAdjudicationPolicy; seed default ceiling UGX 100,000).
### A8. Drug exclusions 🅰 — `/settings/drug-exclusions` (DrugExclusion).
### A9. Compliance registers 🅰 — `/compliance` (licences, security deposits, directors, indemnity, levy computations); `/compliance/privacy` (consent, DSRs — DsrType/DsrStatus, breach incidents, processor register).

## B. Provider network & contracts

### B1. Provider management 🅰 ADMIN_ONLY
`/providers` list (tier OWN/PARTNER/PANEL) → `/providers/new` (form incl. Leaflet map pin) → detail (branches, tariffs, claims, contracts) → edit. ProviderTariff: CPT-coded, `TariffRateType` (FIXED, DISCOUNT_OFF_BILLED, MARKUP_OVER_COST, PER_DIEM auto-price; EXTERNAL_TARIFF_REF/NET_OF_EXTERNAL/CAPITATION/AVERAGE_COST_POOL → manual review).

### B2. Digital contract capture 🅰 UNDERWRITING
`/contracts/new` (guided capture: parties, type FFS/CAPITATION/HYBRID, dates, payment terms, submission window, balance-billing policy, tax inclusivity, reconciliation cadence, unlisted-service rule) → ContractVersion DRAFT → add PricingRules / ContractPackages (surgical etc.) / PreauthRules / DocumentationRules / exclusions / capitation setup (amount + package lists) → validation gates (spec §13) → approve version (APPROVED) → ACTIVE within window; SUPERSEDED on replacement. `/contracts/queues` = review queues; `/contracts/analytics` = portfolio analytics; `/contracts/import` = bulk markdown ingestion + extraction review (`ContractExtraction`).

### B3. Contract-driven pricing (engine) ⚙/🅰
`contract-engine/engine.ts` prices claim lines from the ACTIVE contract version (rule precedence per spec §7). **Currently a read-only preview panel on claim detail** (FEATURE_STATUS #3) + ceiling enforcement on manual adjudication. Reconciliation records (`ContractReconciliation`) per cadence.

## C. Scheme / membership administration

### C1. Group (scheme) setup 🅰 OPS
`/groups/new` (corporate) or `/groups/new/individual`. FundingMode INSURED|SELF_FUNDED; benefit tiers (GroupBenefitTier); package binding; broker link; contribution rates.

### C2. Member enrolment 🅰 OPS
`/members/new` — group, tier, demographics, relationship (PRINCIPAL/SPOUSE/CHILD), IDs; status machine (`MemberStatus`: PENDING_ACTIVATION → ACTIVE → SUSPENDED/LAPSED/TERMINATED/DECEASED, cooling-off cancel). Member number auto (member-numbering.service). Cards (`/members/[id]/card`), letters (PDF), onboarding checklist (5 items), portal login provisioning, KYC records, transfers, lifecycle actions (lapse, death, terminate w/ approval), reinstatement queue (`/members/reinstatement`, member-initiated via 🅜).
- **Import:** `/members/import` CSV with template.

### C3. Endorsements (mid-term changes) 🅰/🅗
`/endorsements/new`: 8 types (`EndorsementType` incl. ADD_MEMBER, REMOVE_MEMBER, TIER_CHANGE, …) → status flow (`EndorsementStatus` DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED→APPLIED / REJECTED) → pro-rata computation (`ProRataCalculation`). HR can request via roster/new + CSV import → lands in admin queue.

### C4. Packages & benefits 🅰 UNDERWRITING
`/packages` → builder (categories from `BenefitCategory`, limits, funding model FFS|CAPITATION per config — WP-F1), versions (PackageVersion), riders, shared-limit groups, rate matrix (`/packages/rate-matrix`, family-size × limit-band cells).

## D. Sales pipeline

### D1. Quotation intake → assessment → build → bind 🅰 UNDERWRITING / 🅑
`/quotations/new` (intake) → QuotationStatus DRAFT→SENT→ACCEPTED→BOUND (+EXPIRED via ⚙ quotation-expiry job) → `[id]/assess` (risk profile, UW decisions incl. exclusions/waiting periods/loadings) → `[id]/build` (lines, versions, custom pricing files via hyperformula/pyodide) → `[id]/bind` (maker-checker: acceptance → create group+members → binder approval → debit note; binding.service + BindingDocuments; FundDepositRequest for self-funded). Broker portal can create quotes for own book.

### D2. Renewals 🅰 — `/groups/[id]/reprice` workbench (loss ratio, prior claims) → renewal scenario/analysis models; `/analytics/renewals` pipeline; ⚙ renewal-reminder job.

## E. Care events → claims

### E1. Member check-in (secure identity) 🅜/🅰
Provider/desk initiates CheckInChallenge → member verifies (WebAuthn biometric or reception-code fallback) → CheckInEvent (audited; fraud check-in audit board `/fraud/check-ins`). VisitVerification links to encounters.

### E2. Pre-authorization 🅰/🅜/🔌
Sources: admin `/preauth/new`, member portal request, B2B `/api/v1/preauth`. `PreauthStatus`: SUBMITTED→UNDER_REVIEW→APPROVED→(EXPIRED | ATTACHED→UTILISED) / DECLINED / CANCELLED. Medical-officer decision; escalation ⚙; **attach** (not convert) to claims — many PAs per claim (WP-C1/C2); cap warning when attached PA amounts exceed…; GOP/LOU issuance `/lou` (LetterOfUndertaking, LouStatus).

### E3. Clinical case management 🅰 (NEW Jul-2026)
`/cases` board (Open Cases) → `/cases/new` (CaseType INPATIENT_ADMISSION/OUTPATIENT_EPISODE/MATERNITY/DAY_CASE/CHRONIC_CYCLE) → CaseServiceEntry accumulation (incl. HMS batch ingestion: push 🔌 `/api/v1/hms-batch`, manual JSON upload; poll stubbed) → close → **files exactly one claim** (CaseStatus OPEN→PENDING_CLOSURE→CLOSED_FILED; service rule, schema allows many).

### E4. Claim intake 🅰/🔌
Channels (`ClaimSource`): MANUAL wizard `/claims/new` (member search → provider → encounter → ICD-10 + lines), REIMBURSEMENT `/claims/new/reimbursement` (member-paid; proof, payment method), BATCH `/claims/import` (Excel), B2B API, HMS, OFFLINE_SYNC, USSD/SMS, PREAUTH (legacy). Claim numbering CLM-YYYY-NNNNN.

### E5. Adjudication 🅰 CLINICAL
`ClaimStatus`: INCURRED→RECEIVED→CAPTURED→UNDER_REVIEW→APPROVED/PARTIALLY_APPROVED/DECLINED→PAID (+APPEALED→APPEAL_APPROVED/APPEAL_DECLINED, VOID). Steps: Mark Captured → line decisions (`ClaimLineDecision`) with reason codes (AdjudicationReasonCode, severity) → compute outcome → submit decision. Auto-adjudication service (policy ceiling) for eligible claims; contract panel preview; benefit holds (BenefitHold — June UAT found never placed, re-verify); co-contribution/copay computation (cost-share.service, CoContribution* models); fraud engine scan ⚙ + rules; drug exclusions; funding-model routing (capitated lines priced 0, pool-tagged — WP-F2). Approval matrix for payment above thresholds → `/approvals` console. Appeals + overrides (`/overrides`, OverrideRecord w/ reason codes; patterns dashboard).

### E6. Claims queues & SLA 🅰 (WP-A1..A3)
`/claims/queues` facility-first grouped lanes w/ SLA class (contract payment terms drive SLA — claims-sla.ts); `/claims` bounded, filterable, paginated list; assessor queue `/assessor-queue` (UNDERWRITING).

### E7. Provider settlement 🅕→🅰 FINANCE
`/settlement`: batch approved claims per provider (`ProviderSettlementBatch`, maker-checker, `SettlementStatus` DRAFT→PENDING_APPROVAL→APPROVED→SETTLED) → payment voucher → GL postings (gl.service; June UAT: no JE on settlement — re-verify).

### E8. Offline operation (headline capability)
- **Work codes** 🅰 `/offline-auth`: issue OfflineWorkAuthorization (code read out by phone; SMS stubbed) gating offline capture + sync.
- **Offline capture** 🅰 `/offline-capture`: point-of-care capture while disconnected.
- **Facility data packs** ⚙: encrypted OfflineDataPack generated daily (offline-pack.job).
- **Sync** 🔌 `/api/v1/sync`: store-and-forward SyncOperation with idempotency + eligibility snapshots + offline reservations.

## F. Finance

### F1. Billing & invoices 🅰 FINANCE — `/billing`: Invoice/Payment lifecycle (InvoiceStatus), group contribution billing (⚙ billing-run), receipts; admin fees `/billing/admin-fees` (AdminFeeAgreement PMPM/%claims/flat + accrual ⚙ + ledger).
### F2. General ledger 🅰 FINANCE — ChartOfAccount (24 seeded), JournalEntry/JournalLine (double-entry; GLSourceType), trial balance `/billing/gl`, account ledger `/billing/gl/ledger`; bank reconciliation `/billing/reconciliation` (statement upload → match).
### F3. Self-funded funds 🅕/🅰 — SelfFundedAccount per group; FundTransaction (deposit/drawdown); fund dashboard, statement + export; balance alerts ⚙; deposits recorded by fund admin; admin-fee agreements per scheme.
### F4. Broker commissions 🅰/🅑 — Commission schedules/tiers → CommissionLedgerEntry accrual ⚙ → payout batches (PayoutBatchStatus) → broker portal visibility. Broker KYC + IRA compliance (broker-compliance.service).
### F5. Member wallet & co-contributions 🅜 — CoContributionRule (copay by network tier), member payments via mobile-money callback (M-Pesa stub; MPESA_CALLBACK_SECRET), MemberCoContributionPayment, annual caps (member/family).

## G. Fraud, audit & exceptions

- **Fraud:** FraudRule engine (⚙ fraud-scan) → ClaimFraudAlert (severity) → `/fraud` triage → FraudInvestigation lifecycle. Check-in audit + override patterns as collusion telemetry.
- **Audit:** AuditLog + immutable audit-chain service; `/settings/audit-log` viewer (filter by user); ActivityLog on member/entity timelines.
- **Exceptions:** ExceptionLog + `/settings/exceptions` console (ExceptionStatus lifecycle).
- **Blacklist:** InternalBlacklist (provider/member/practitioner) w/ reasons.

## H. Analytics & reporting

- `/analytics` strategic purchasing (per-client MLR vs the Ugandan 109% loss-ratio narrative), alerts inbox, board-pack (+PDF via `/api/analytics/board-pack`), scheme/provider drill-downs, renewals, risk workbench, parity. Facts tables (AnalyticsEncounterFact, ContributionFact, MlrSnapshot, ProviderScorecard, MemberRiskProfile) refreshed ⚙.
- `/reports`: 34 report types, CSV + PDF export (`/api/reports/...`). ⚙ report-generation job for scheduled reports.

## I. Service & support

- **Service requests** `/service-requests` (category/priority/status; HR can raise via portal).
- **Complaints** `/complaints` (ComplaintStatus OPEN→INVESTIGATING→RESOLVED/DISMISSED).
- **Member support** 🅜 helpline/WhatsApp page; **Broker/HR support** pages.

## J. Cross-border care 🅰 — `/cross-border`: CrossBorderFacility registry + CrossBorderCase workflow (status machine, line items, FX conversion, coordination fees).

## K. Wellness 🅰 — `/wellness`: programs (SCREENING/CHRONIC_DISEASE_MGMT/INCENTIVE; cadence, funded amount, points) → enrolments → activities (points, cadence advance) → analytics.

## L. Member self-service 🅜 (see User_Roles #11)
Dashboard/benefits/dependents/documents/facilities (+cost preview)/health-vault (private files, vitals, journal, shares)/notifications/preauth (submit + track)/profile/reinstatement/security (WebAuthn devices)/support/utilization (claim drill-down)/wallet (co-contribution payments)/check-in.

## M. Notifications ⚙
MemberNotification (types/priorities) + NotificationTemplate; email via nodemailer; SMS/USSD stubs; in-app inboxes (member portal; admin dashboards). Escalations from ⚙ jobs (preauth, approvals, SLA breach, fund balance).

---

## Cross-cutting expectations to verify per workflow (Phase 5)
1. Audit entry written (AuditLog/ActivityLog) for every mutation.
2. Data propagates: lists, searches, dropdowns, dashboards, reports, exports.
3. Role gating enforced server-side (not just menu hiding).
4. Status machines cannot be driven out of order (negative tests).
5. Approval-matrix routing fires where wired; maker≠checker enforced.
6. Jobs: behaviour when worker is down is visible/recoverable.
