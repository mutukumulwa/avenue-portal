# AiCare — Outstanding Features & Implementation Backlog

**Last updated:** 2026-05-18
**Status:** Features extracted from archived spec documents. Each item records its source workstream so context can be recovered from the archive.

This file is the single living backlog. When an item is implemented, mark it done and record the PR/phase. When new features are identified, add them here with their source.

---

## How to use this file

- **Source** — which archived spec document this came from
- **Priority** — P0 (blocks go-live), P1 (important), P2 (nice-to-have / v2)
- Items without a priority are unclassified; assign before starting work

---

## 1. Terminology Engine (Module 2 — Competitive Hardening Sprint)

**Source:** `TERMINOLOGY_ENGINE_HANDOFF.md`, `AICARE_COMPETITIVE_HARDENING_SPEC.md` §2

This entire module is unimplemented. AiCare must present platform vocabulary that varies by client (e.g. "membership" not "policy", "contribution" not "premium") configured per tenant with maker-checker approval.

| # | Item | Priority | Status |
|---|------|----------|--------|
| T-01 | `TerminologyEntry` Prisma model — `(tenantId, key, displayText, context, effectiveFrom, effectiveTo)` with `TerminologyApproval` maker-checker table | P1 | ☐ |
| T-02 | `terminology.service.ts` — `resolve(tenantId, key, fallback)` with fallback order: tenant override → default dictionary → key name; 5-minute in-memory cache with Redis invalidation | P1 | ☐ |
| T-03 | `terminology` tRPC router — `list`, `upsert` (maker step), `approve` (checker step), `reject`, `preview` | P1 | ☐ |
| T-04 | Terminology admin UI — browser page showing all keys, current values, pending approvals; inline editor with approval queue | P1 | ☐ |
| T-05 | `useTerm(key)` React hook and `TermProvider` context — wraps all user-facing label strings; drops in without touching existing component markup | P1 | ☐ |
| T-06 | Avenue Healthcare seed dictionary — ~60 key/value pairs mapping insurance terminology to membership terminology | P1 | ☐ |
| T-07 | Surface sweep — replace hard-coded "policy", "premium", "insure", "claim", "endorsement" strings in admin/broker/member portals with `useTerm()` calls | P1 | ☐ |
| T-08 | Regulatory positioning one-pager — Puppeteer-generated PDF explaining the PSHP vs insurance distinction; referenced in compliance documents | P2 | ☐ |

---

## 2. Fraud Detection — Advanced Layer

**Source:** `FRAUD_DETECTION_FEATURE_SPEC.md`, `AICARE_COMPETITIVE_HARDENING_SPEC.md` §4

The platform has `ClaimFraudAlert`, `MemberRiskProfile`, and `fraud.service.ts` implementing ~12 deterministic rules (RULE-TEMP, RULE-BILL, RULE-CLIN series). The gap is the configurable rules engine (Layer 2), the anomaly detection batch layer (Layer 3), the investigation workflow, and the PSHP-specific conflict-of-interest controls.

| # | Item | Priority | Status |
|---|------|----------|--------|
| F-01 | `FraudRule` model — configurable rules with `code`, `category`, `ruleType` (HARD/SOFT), `threshold`, `effectiveFrom`, `effectiveTo`, `isActive`; never-delete pattern | P1 | ☐ |
| F-02 | `FraudFlag` model — flags linkable to Claim, Member, Provider, PreAuth (polymorphic); `severity`, `layer`, `ruleCode`, `entityType`, `entityId`, `resolvedAt` | P1 | ☐ |
| F-03 | `Investigation` model — formal investigation workflow: `openedAt`, `assignedToId`, `outcome`, `closedAt`, `narrative`; links to multiple `FraudFlag` records | P1 | ☐ |
| F-04 | `FraudAuditLog` model — append-only (DB trigger prevents UPDATE/DELETE); every fraud override is an immutable record | P0 | ☐ |
| F-05 | `ProviderRiskProfile` model — scored per provider per period; `riskScore`, `flagCount`, `overservicingScore`, `billingVarianceScore` | P1 | ☐ |
| F-06 | Layer 3 anomaly detection batch job — nightly BullMQ job; computes provider and member risk scores; updates `ProviderRiskProfile` and `MemberRiskProfile` | P1 | ☐ |
| F-07 | Risk score caching — Redis sorted sets for real-time risk-tier lookups during pre-auth and claim submission | P2 | ☐ |
| F-08 | PSHP conflict-of-interest register — tracks physician compensation model (fee-for-service vs. salary) and lowers fraud-flagging thresholds for FFS physicians ordering high-cost procedures | P1 | ☐ |
| F-09 | Internal/external provider parity engine — separate detection pipeline that compares Avenue-own vs. external referral facility billing patterns; feeds the Parity Compliance Dashboard | P1 | ☐ |
| F-10 | Investigation workflow UI — `/fraud/investigations/` list and `[id]` detail; assign, update status, close, link flags, record outcome | P1 | ☐ |
| F-11 | Daraja API real integration — replace `mpesaService` stub; validate M-Pesa confirmation codes via Safaricom Daraja TransactionStatus API before marking payment confirmed | P1 | ☐ |
| F-12 | Auto-escalation timer — BullMQ scheduled job: if a HIGH-severity fraud flag on a claim goes unreviewed past `escalationThresholdHours`, escalate to senior reviewer | P1 | ☐ |

---

## 3. Biometric Check-In (beyond existing WebAuthn foundation)

**Source:** `BIOMETRIC_CHECKIN_SPEC.md`, `BIOMETRIC_CHECKIN_IMPLEMENTATION_PLAN.md`

The platform has WebAuthn credential enrollment (`MemberWebAuthnCredential`, `WebAuthnEnrollmentApproval`, `CheckInChallenge`, `CheckInEvent`) and a `secure-checkin` service layer. What's missing is the face-match liveness step, the fallback tiers (SMS OTP + IPRS photo), and the compliance/fraud review dashboard.

| # | Item | Priority | Status |
|---|------|----------|--------|
| B-01 | Face-match liveness vendor selection and integration — pending vendor choice (production deployment flag F-03); integrate SDK once selected; stub gracefully until then | P1 | ☐ |
| B-02 | IPRS photo retrieval — pull government ID photo for knowledge-based fallback; currently stub; depends on IPRS API availability per buyer | P2 | ☐ |
| B-03 | SMS OTP fallback tier — when biometric unavailable, send OTP to registered phone; validate before allowing check-in | P1 | ☐ |
| B-04 | Photo + knowledge last-resort fallback — front-desk photo capture + 3 knowledge questions; requires clinical role override | P2 | ☐ |
| B-05 | Emergency override flow — medical emergency bypasses all biometric checks; creates a high-visibility audit record; requires clinical role with documented reason | P0 | ☐ |
| B-06 | Compliance/fraud review dashboard for check-in events — filter by override reason, flag rate, time-of-day patterns; feeds into fraud engine | P1 | ☐ |
| B-07 | Append-only DB trigger on `CheckInEvent` — PostgreSQL trigger preventing UPDATE and DELETE; immutable audit | P0 | ☐ |
| B-08 | PWA integration — push notification to member when check-in is initiated; polling fallback for offline; deferred to provider network selection | P2 | ☐ |
| B-09 | Audit retention policy — confirm and configure how long `CheckInEvent` records are retained; feeds into PRODUCTION_DEPLOYMENT_FLAGS decision F-01 | P1 | ☐ |

---

## 4. Reporting & Analytics Backlog

**Source:** `AICARE_GAP_ANALYSIS_1.md` §3.5, `AICARE_GAP_ANALYSIS_2.md`

The platform has core analytics (MLR snapshots, encounter facts, provider scorecards, renewal analysis, alert inbox, risk workbench, board pack). The below are named reports from the KCB production punch-list.

### 4.1 Tranche 1 — Operational (blocks go-live)

| # | Report | Priority | Status |
|---|--------|----------|--------|
| R-01 | Membership lists — active/lapsed/terminated per scheme, exportable CSV/PDF | P0 | ☐ |
| R-02 | Outstanding bills — open invoices with ageing buckets (30/60/90 days) | P0 | ☐ |
| R-03 | Provider statements — itemized claims paid per provider per period | P0 | ☐ |
| R-04 | Member statements — benefit usage, co-contributions, claims history per member | P0 | ☐ |
| R-05 | Exceeded limits — members who have consumed ≥80% or 100% of any benefit | P0 | ☐ |
| R-06 | Admissions list — inpatient admissions in a date range with diagnosis, LOS, cost | P0 | ☐ |
| R-07 | Admission visits — outpatient/day-case visit log | P0 | ☐ |

### 4.2 Tranche 2 — Financial

| # | Report | Priority | Status |
|---|--------|----------|--------|
| R-08 | Claims experience — loss ratio, paid/incurred by scheme/category/member | P1 | ☐ |
| R-09 | Ageing analysis — receivables and payables by age bucket | P1 | ☐ |
| R-10 | Debtors / creditors — detailed ledger | P1 | ☐ |
| R-11 | Commission statements — per broker per period with WHT and levies | P1 | ☐ |
| R-12 | Fees statements — card issuance, reinstatement, admin fees | P1 | ☐ |
| R-13 | Levies and taxes statements — Stamp Duty, Training Levy, PHCF breakdown | P1 | ☐ |
| R-14 | Fund utilization (self-funded schemes) — fund balance, claim deductions, top-ups | P1 | ☐ |
| R-15 | Admin fee statement (self-funded) — flat-per-insured or %-of-claims calculation | P1 | ☐ |
| R-16 | Loss ratio — pure loss ratio and combined ratio per scheme | P1 | ☐ |

### 4.3 Tranche 3 — Analytical

| # | Report | Priority | Status |
|---|--------|----------|--------|
| R-17 | Organic growth — new enrolments vs. lapses vs. cancellations per period | P2 | ☐ |
| R-18 | Exclusion and rejected claims — declined claims with reason codes | P2 | ☐ |
| R-19 | Case management report — open and closed dispute/investigation cases | P2 | ☐ |
| R-20 | Claims-per-operator — adjudication throughput per user | P2 | ☐ |
| R-21 | User rights/roles report — RBAC introspection export | P2 | ☐ |
| R-22 | Comparison report on services — bench cost vs. billed vs. contracted per procedure | P2 | ☐ |
| R-23 | Completed-vs-in-progress products report — quotation funnel status | P2 | ☐ |

### 4.4 Report Infrastructure

| # | Item | Priority | Status |
|---|------|----------|--------|
| R-24 | Password-protected PDF exports — encrypt PDF output with a user-provided or system-generated password | P1 | ☐ |
| R-25 | Reusable report-spec abstraction — `ReportDefinition` with parameter set, query template, output format (PDF/Excel/CSV) | P1 | ☐ |

---

## 5. Cross-Cutting Hardening

**Source:** `AICARE_GAP_ANALYSIS_1.md` §4.3 (New Phase — Cross-Cutting Hardening), `AICARE_SYSTEM_REQS_AUDIT.md`

| # | Item | Priority | Status |
|---|------|----------|--------|
| H-01 | TOTP 2FA — time-based one-time password as a second factor at login; configurable per tenant (mandatory or optional) | P0 | ☐ |
| H-02 | Email-based password reset code — "forgot password" flow sends a short-lived code to the registered email | P0 | ☐ |
| H-03 | Single-session control — parameterized concurrent-session lockout; new login invalidates prior session | P1 | ☐ |
| H-04 | SIEM-compatible log export — structured JSON log stream to S3 or syslog endpoint; fields: Date/Time/Event/IP/User | P1 | ☐ |
| H-05 | Log retention/archival policy — configurable retention period for `AuditLog` and `ActivityLog`; automated archival to cold storage | P1 | ☐ |
| H-06 | BullMQ admin UI — job scheduling and monitoring dashboard (bullmq-board or bespoke); operator visibility into queues, failures, retries | P1 | ☐ |
| H-07 | Customizable user dashboards — per-role + per-user saved widget configuration | P2 | ☐ |
| H-08 | Multi-lingual scaffolding (i18n) — Swahili/English minimum; at least member-facing communications (SMS, letters, statements) | P2 | ☐ |
| H-09 | Authorized-access login banner — legal notice displayed on login page | P1 | ☐ |
| H-10 | Production change log — structured in-app record of deployments and schema migrations | P2 | ☐ |
| H-11 | HA/DR documentation — runbook for failover, RTO/RPO targets, tested recovery procedure | P1 | ☐ |
| H-12 | Data dictionary — auto-generated from Prisma schema; human-readable field descriptions and domain notes | P2 | ☐ |
| H-13 | Progress indicator on long-running binder creation — client-side polling with step-by-step progress bar | P2 | ☐ |
| H-14 | Online help system — contextual help content per page; minimum: a searchable FAQ linked from the nav | P2 | ☐ |

---

## 6. Data Model & Domain Gaps

**Source:** `AICARE_GAP_ANALYSIS_1.md` §3.1, `AICARE_GAP_ANALYSIS_2.md`, `AICARE_SYSTEM_REQS_AUDIT.md`

| # | Item | Priority | Status |
|---|------|----------|--------|
| D-01 | Shared benefit limit groups — allow multiple benefit categories (e.g. inpatient + maternity) to share a single combined annual limit; `SharedLimitGroup` model with atomic deduction | P1 | ☐ |
| D-02 | Package-level provider eligibility rules — specify which providers are covered under a package (whitelist/blacklist); gate pre-auth and claims accordingly | P1 | ☐ |
| D-03 | Premium rate matrix UI — admin screen to upload and manage the family-size × cover-limit rate matrix; currently the `FamilySizeMatrixCell` model exists but has no admin UI | P1 | ☐ |
| D-04 | Smart card replacement workflow with billing — lost/damaged card triggers a replacement request, charges the replacement fee to the member, queues physical card production | P1 | ☐ |
| D-05 | Face-match liveness SDK integration — vendor TBD (see Production Deployment Flag F-03); stub exists; integrate when vendor is confirmed | P1 | ☐ |
| D-06 | Practitioner-level credentialing — `PractitionerCredential` model with license number, specialty, expiry; credential verification gate at pre-auth and claim submission | P1 | ☐ |
| D-07 | Bank statement automated reconciliation — parse bank statement exports, match against Invoice/Payment records, flag unmatched items | P1 | ☐ |
| D-08 | Card payment gateway — integrate Pesapal or Flutterwave for card-based contribution payments; stub currently exists for M-Pesa only | P2 | ☐ |
| D-09 | FHIR resource adapters — HL7 FHIR R4 resource mapping for HMS/SHA integration; parse incoming FHIR bundles into AiCare domain objects | P2 | ☐ |
| D-10 | Family-tree visualization — UI component showing principal + dependants in a visual hierarchy; useful in member detail and claim capture | P2 | ☐ |
| D-11 | Letters and memos — templated correspondence system; member can receive formal letters (welcome, renewal notice, termination notice) as PDF; distinct from SMS/email notifications | P1 | ☐ |
| D-12 | Debtors/creditors ledger — explicit receivable and payable tracking per group/broker with ageing; currently implicit via Invoice model | P1 | ☐ |
| D-13 | Fund management UI — complete self-funded scheme management: deposit receipt, top-up, installment schedule, fund balance dashboard, alert on low balance | P1 | ☐ |
| D-14 | Admin fee invoicing (self-funded) — flat-per-insured at policy start OR %-of-claims-paid computed post-period; two distinct calculation methods | P1 | ☐ |
| D-15 | IPRS API real integration — replace stub; once buyer provisioning path is confirmed, integrate Kenya National Registration Bureau API for national ID validation | P1 | ☐ |
| D-16 | Double-capture DB constraint — add the deferred partial unique index on `Claim(providerId, memberId, dateOfService, benefitCategory)` WHERE status != 'VOID' after removing duplicate seed data | P0 | ☐ |

---

## 7. Production Deployment Flags

**Source:** `PRODUCTION_DEPLOYMENT_FLAGS.md`

These are configuration and vendor decisions that must be resolved before production launch. They are not code features but block specific integrations.

| # | Item | Owner | Status |
|---|------|-------|--------|
| P-01 | Audit log retention period — how long to retain `AuditLog` / `ActivityLog` before archival; choose between 2y (regulatory minimum), 5y (PSHP best practice), or indefinite | Mutuku | ☐ |
| P-02 | Production WebAuthn domain — set `WEBAUTHN_RPID` and `WEBAUTHN_ORIGIN` env vars to production domain before enabling biometric check-in | Engineering | ☐ |
| P-03 | SMS provider selection — Africa's Talking vs. Infobip vs. other; configure in `IntegrationConfig`; affects OTP delivery for check-in fallback and member notifications | Mutuku | ☐ |
| P-04 | Face-match vendor selection — choose between AWS Rekognition, Azure Face API, Smile Identity, or local vendor; unblocks B-01 and D-05 above | Mutuku | ☐ |
| P-05 | Database/Vercel region alignment — ensure Supabase PostgreSQL region matches Vercel deployment region to minimise latency; document final choice | Engineering | ☐ |
| P-06 | MinIO production configuration — confirm object storage bucket setup, lifecycle policies, and backup strategy | Engineering | ☐ |

---

## 8. System Requirements Audit — Remaining Verify Items

**Source:** `AICARE_SYSTEM_REQS_AUDIT.md`

Items from the 78-point audit that were marked "VERIFY" and have not been confirmed as implemented.

| # | Item | Priority | Status |
|---|------|----------|--------|
| V-01 | Bill state machine explicit model: `INCURRED → RECEIVED → CAPTURED → AUTHORIZED → PAID` — verify the `ClaimStatus` enum and transitions exactly match this sequence | P0 | ☐ |
| V-02 | Approval matrix configurability — confirm `ApprovalMatrix` model is used by claims and pre-auth routers at runtime (not just seeded) | P1 | ☐ |
| V-03 | Member utilization auto-notifications — confirm BullMQ job monitors benefit usage and sends SMS/email when member crosses 80% and 100% of any sub-limit | P1 | ☐ |
| V-04 | Renewal notice + SMS dispatched at 60 days — verify `renewal-reminder.job.ts` sends actual SMS via notification service (not just logs to ActivityLog) | P0 | ☐ |
| V-05 | Pre-auth email alerts on submission and decision — confirm `NotificationService` dispatches email to provider and member on PA submit, approve, and decline events | P1 | ☐ |
| V-06 | Provider statement automated reconciliation — confirm reconciliation job exists and matches provider invoices against settled claim batches | P1 | ☐ |
| V-07 | Member history surfaced at claim capture — confirm `/claims/new` page shows the member's recent claims and benefit usage inline | P1 | ☐ |
| V-08 | Password policies + email reset — confirm NextAuth credentials provider enforces minimum password length and a "forgot password" code flow exists | P0 | ☐ |
| V-09 | Log file retention — confirm `AuditLog` records include: Date, Time, Event, IP address, User — check `AuditLog` model fields | P0 | ☐ |
| V-10 | Multi-currency — confirm all `Decimal` monetary fields store currency code or assume KES with clear documentation | P1 | ☐ |

---

*Archive folder contains the source documents for all items above. Refer to the archived spec for full context on any item.*
