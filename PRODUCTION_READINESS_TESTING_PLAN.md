# Production Readiness Testing Plan
### AiCare / Avenue Portal — Medical Scheme & PSHP Administration Platform

**Prepared by:** QA Lead / Product Analyst / Release Readiness Review
**Date:** 2026-06-24
**Status of this document:** Test *plan* only. No tests have been executed. No records were created, no forms submitted, no notifications triggered, and no live logins performed in producing this plan. All steps below are written as instructions for future human testers or AI agents.

**How to use this document.** Sections 1–3 establish what the system is and who uses it. Section 4 is the executable end-to-end script library, organised by workflow. Sections 5–10 are cross-cutting test suites (UI, devices, security, data integrity, integrations, performance). Sections 11–14 give you the defect log template, the go/no-go gate, open questions, and a recommended running order. Execute Section 14's sequence; log everything in Section 11's template.

---

## 1. System Understanding

### 1.1 What the system is

AiCare (deployed as "Avenue Portal") is a **multi-tenant medical scheme administration platform** built for a Kenyan health-financing context. It administers both conventional medical insurance schemes and **PSHPs (Private Sponsored Health Plans / "membership" plans)** — the codebase deliberately distinguishes "membership/contribution" language from "policy/premium" insurance language for regulatory positioning. The target customer set referenced in the repo includes **Avenue Healthcare**, **KCB**, **Safaricom**, **EABL** and **Bamburi** schemes.

The platform covers the full medical-scheme lifecycle: prospect quotation and underwriting → group/scheme binding → member enrolment, onboarding and card issuance → benefit configuration → provider network and tariffs → pre-authorisation → claims capture and adjudication → settlement/finance/GL → broker commissions → self-funded fund management → analytics, fraud detection, and member self-service (web/PWA, USSD, SMS).

**Technology stack (inferred from code, not assumed):**

- **Framework:** Next.js 15 (App Router, React 19, Turbopack), TypeScript.
- **API layer:** tRPC v11 (21 routers) for internal app calls; REST route handlers under `/api/*`; a B2B REST API under `/api/v1/*` (provider/Slade360 integration) guarded by an API key.
- **Data:** PostgreSQL via Prisma 7 (118 models, ~120 enums). Decimal.js / HyperFormula / Pyodide present for actuarial/pricing math.
- **Auth:** NextAuth v5 (beta) with JWT sessions, bcrypt credentials; WebAuthn (`@simplewebauthn`) for member biometric/device check-in.
- **Background processing:** BullMQ + Redis (ioredis); a worker process (`src/server/jobs/worker.ts`) running 13 scheduled/queued jobs.
- **Storage:** MinIO (S3-compatible) for uploads/documents.
- **Email:** Nodemailer over SMTP (queued via BullMQ). **SMS/USSD** handlers exist; **M-Pesa (Daraja)** and **IPRS (national ID)** are present as explicit STUBS.
- **PDF/exports:** `@react-pdf/renderer`, `pdf-lib`, Puppeteer/`@sparticuz/chromium` (serverless Chromium), ExcelJS, PapaParse (CSV).
- **Deployment:** Vercel (production target `https://avenue-portal.vercel.app/`), with Dockerfile + docker-compose + nginx also present for self-hosting.

### 1.2 Main functional modules

The application is split into role-scoped portals (Next.js route groups):

- **Admin / staff portal** `(admin)` — analytics, assessor queue, billing, brokers, check-ins, claims, complaints, dashboard, endorsements, fraud, groups, members, onboarding queue, overrides, packages, preauth, providers, quotations, reports, service requests, settings, settlement.
- **Broker portal** `/broker` — dashboard, commissions, groups, quotations, renewals, submissions, support.
- **Member portal** `/member` — dashboard, benefits, check-in, dependents, documents, facilities, health-vault, notifications, preauth, profile, reinstatement, security (WebAuthn), support, utilization, wallet.
- **Fund portal** `/fund` — self-funded employer fund dashboard, per-group fund view, statements.
- **HR portal** `(hr)` — employer HR manager: roster, endorsements, invoices, utilization, support, profile.
- **Auth** `(auth)/login`, plus `/post-login` role router, `/unauthorized`.
- **Public/integration APIs** `/api/v1/*` (eligibility, benefits, claims, preauth, upload), plus USSD/SMS webhooks and an M-Pesa callback.

### 1.3 User roles / personas (from `UserRole` enum + seeded UAT accounts)

| Role (enum) | Persona | Portal landing |
|---|---|---|
| `SUPER_ADMIN` | Platform/scheme administrator | `/dashboard` (admin) |
| `CLAIMS_OFFICER` | Claims capture & adjudication | `/dashboard` (role-trimmed) |
| `FINANCE_OFFICER` | Billing, settlement, GL, reconciliation | `/dashboard` |
| `UNDERWRITER` | Quotation assessment & binding | `/dashboard` |
| `CUSTOMER_SERVICE` | Complaints, service desk, member support | `/dashboard` |
| `MEDICAL_OFFICER` | Clinical/pre-auth adjudication, overrides | `/dashboard` |
| `REPORTS_VIEWER` | Read-only reports/analytics | `/dashboard` |
| `BROKER_USER` | Intermediary (broker/agency) | `/broker/dashboard` |
| `HR_MANAGER` | Employer HR contact for a group | `/hr/dashboard` |
| `FUND_ADMINISTRATOR` | Employer finance officer, self-funded float | `/fund/dashboard` |
| `MEMBER_USER` | Scheme member / dependent | `/member/dashboard` |

There is a **second, finer-grained RBAC layer**: `Role`, `Permission`, `RolePermission`, `UserRoleAssignment` models plus `rbac.service.ts` resolve permission *codes* per user, hydrated into the session JWT. So access control is enforced two ways — the coarse `UserRole` (used in layout route guards and `post-login` routing) and the fine-grained permission codes (used in router/service guards). **Both must be tested**, and any divergence between them is a risk.

### 1.4 Core objects / entities

Tenant; User; Group (scheme) + GroupBenefitTier; Member (+ dependents, KYC, card, WebAuthn credentials, health vault); Package + PackageVersion + BenefitConfig + BenefitUsage; Quotation (+ QuotationLife, QuotationVersion, UnderwritingDecision, QuotationAcceptance, binding documents); Endorsement (+ ProRataCalculation); Claim (+ ClaimLine, AdjudicationLog); PreAuthorization (+ BenefitHold); Provider (+ Tariffs, Contracts, Practitioners); Broker (+ Producers, KYC, CommissionSchedule, CommissionLedgerEntry, PayoutBatch); Invoice + Payment + PaymentVoucher; SelfFundedAccount + FundTransaction + FundDepositRequest; ChartOfAccount + JournalEntry/Line (GL); Complaint; ServiceRequest; ClaimFraudAlert + MemberRiskProfile + OverrideRecord; CheckInEvent / CheckInChallenge / VisitVerification; Analytics fact/snapshot/scorecard/alert models; CoContribution rules/caps/transactions; AuditLog / ActivityLog / ExceptionLog; NotificationTemplate / Correspondence / MemberNotification; InternalBlacklist; ReimbursementRequest; ProviderSettlementBatch.

### 1.5 Key workflows the system appears to support

1. **Quote-to-bind sales pipeline** — intake → assessment/underwriting → send to client → accept → convert to group → maker-checker binding (acceptance → create members → binder approval → debit note).
2. **Member lifecycle** — enrolment (individual & group), onboarding checklist, card issuance, portal login provisioning, transfer between groups, lapse/cancel/death/termination (with senior approval), reinstatement.
3. **Benefit configuration** — packages, versions, benefit categories, shared limits, rate matrices/cards, pricing models, co-contribution rules and annual caps.
4. **Claims** — capture (UI wizard, Excel import, B2B API), pre-auth, adjudication (capture → line decisions → compute outcome → decision), fraud screening, settlement batching (maker-checker), reimbursement.
5. **Provider network** — onboarding, tariffs (CPT/diagnosis), contracts, exclusions, settlement statements.
6. **Broker management** — onboarding, KYC, commission schedules/tiers, commission calculation, payout batches, IRA compliance.
7. **Finance** — invoicing, billing runs, payments, bank reconciliation, GL/journals, taxes & levies (Stamp Duty, Training Levy, PHCF), self-funded fund deposits & statements, admin fees.
8. **Member self-service** — dashboard, benefits/utilisation, dependents, documents, facilities cost preview, health vault, notifications, preauth requests, reinstatement, wallet/M-Pesa co-pay, biometric check-in, USSD & SMS query.
9. **Service desk** — complaints and service requests (HR-raised and member-raised).
10. **Analytics & reporting** — strategic purchasing console, MLR snapshots, provider scorecards, parity dashboard, risk workbench, renewals pipeline, board pack, and 34 named operational/financial/analytical reports with CSV/PDF export.
11. **Fraud & overrides** — deterministic fraud rules, alert desk, override queue & patterns, check-in audit.
12. **Background automation** — billing runs, commission calc/reconciliation, fund-balance alerts, intake allocation, lapse detection, membership activation, pre-auth escalation, quotation expiry, renewal reminders, report generation, SLA breach, suspension checks.

### 1.6 Integrations & external dependencies (verify each is configured before go-live)

| Integration | Mechanism | State in code | Test implication |
|---|---|---|---|
| Email | Nodemailer/SMTP, BullMQ-queued | Implemented; **defaults to `smtp.mailtrap.io` / test creds** if env unset | Confirm real SMTP configured; mails actually deliver |
| SMS | `sms-query.service.ts`, `/api/sms/member-query` | Handler present; **no confirmed SMS gateway transport** (e.g. Africa's Talking) found | Verify outbound SMS provider wired before relying on SMS OTP/alerts |
| USSD | `ussd.service.ts`, `/api/ussd` | Handler present | Verify aggregator/shortcode mapping |
| WhatsApp | Member "support" references WhatsApp | UI references only | Confirm whether a real WhatsApp channel exists or is a deep link |
| M-Pesa (Daraja) | `mpesa.service.ts`, `/api/member/payments/mpesa/callback` | **STUB — always returns `verified:false`** | Payment confirmation cannot be trusted in prod until integrated; test the stubbed/manual path AND the failure UX |
| IPRS (national ID) | `iprs.service.ts` | **STUB — always returns `valid:true`, no data** | KYC ID validation is not real; test that manual verification path is enforced |
| MinIO object storage | `minio` client, `/api/upload` | Implemented | Verify bucket/credentials; uploads & retrieval work in prod |
| Redis | BullMQ/ioredis | Required for jobs & queued email | If Redis down, queued email/jobs silently stop — test degradation |
| PDF (serverless) | react-pdf / pdf-lib / Puppeteer+chromium | Implemented but **historically failing on Vercel** (see §1.8) | High-risk; test every PDF path |
| Slade360 / provider systems | `/api/v1/*` with API key | Implemented; key defaults to `av-slade360-dev-key` if env unset | Verify real key set; test auth rejection |

### 1.7 Configuration / environment variables required

From `process.env.*` references: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `SMTP_HOST/PORT/USER/PASS`, `MINIO_ENDPOINT/PORT/ROOT_USER/ROOT_PASSWORD`, `MPESA_CALLBACK_SECRET`, `API_KEY`, WebAuthn set (`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_REGISTRATION_TTL_SECONDS`, `WEBAUTHN_FAILED_LOCKOUT_MINUTES`, `WEBAUTHN_BRANCH_APPROVAL_TTL_MINUTES`), check-in TTLs (`CHECKIN_CHALLENGE_TTL_SECONDS`, `CHECKIN_VISIT_CODE_TTL_SECONDS`), `NODE_ENV`, `VERCEL`, `AICARE_PERF_LOGS`. **No `.env.example` is committed** — a go-live risk: there is no single source of truth for required configuration. A test step (§7/§12) must confirm each variable is set to a real production value and that **insecure defaults** (`av-slade360-dev-key`, mailtrap SMTP) are NOT in effect.

### 1.8 Areas that look unfinished, partial, fragile, or placeholder

These are **derived from the code and the repo's own tracking files** (`AICARE_TODO.md`, `uat/DEFECTS.md`, `uat/UAT_MASTER.md`). They are pre-loaded risk hot-spots; the test plan deliberately concentrates evidence-gathering here.

- **PDF generation broken on serverless (high impact).** Member **letters** (`Generate & Download`) and **quotation PDF** (`/api/quotations/[id]/pdf`) returned HTTP 500 in prior UAT (DEFECT-001, DEFECT-005). Suspected react-pdf/Puppeteer-in-serverless. This likely affects every Puppeteer/PDF path (board pack, report PDFs, provider statements, fund statements, debit notes).
- **Server actions that crash after partial success.** Claim "Submit Decision" before "Compute Outcome" crashes (DEFECT-009); provider settlement Create Batch crashes post-create and cannot reach SETTLED (DEFECT-010); fund "Record Deposit" crashes and does not persist (DEFECT-016). These leave data in inconsistent states.
- **No-feedback / unguarded create actions.** Group enrolment double-submit creates duplicates, no disabled state / no duplicate-name check (DEFECT-003); quotation "Create Group" gives no feedback (DEFECT-007); "Create Model" button is a dead placeholder (DEFECT-004).
- **Stub integrations.** M-Pesa and IPRS are stubs — any workflow depending on verified payment or verified national ID is effectively unverified in production.
- **Self-funded fund accounts not initialisable via UI** (DEFECT-016) → fund KPIs read 0 while claims aggregates show millions (DEFECT-015). Self-funded module may be non-functional end-to-end.
- **Empty scaffold routes** 404 if hit directly (DEFECT-002): `/members/[id]/{portal,transfer,webauthn}`, `/groups/[id]/{self-funded,tiers}`; `/hr` index 404s (DEFECT-013); `/analytics/renewals/[groupId]` 404s for individual schemes (DEFECT-012).
- **Stale deployment risk** (DEFECT-014): fund statement page + export 404'd in prod despite existing in source — confirm the production build matches the intended commit before customer UAT.
- **Missing static assets** (DEFECT-017): member documents link to `/seed-docs/*.pdf` that are absent in deployment.
- **Unbranded default 404** (DEFECT-018).
- **Unimplemented modules per `AICARE_TODO.md`:** Terminology Engine (entirely unimplemented), advanced fraud layers (configurable rules engine, anomaly batch, investigation workflow, append-only fraud audit trigger), biometric liveness/fallback tiers, and a Case Management module (Report R-19 has no backing module). Tests must confirm whether these are simply absent (acceptable if out of scope) or half-wired (a risk).
- **Insecure config defaults** baked into code (API key, SMTP) — must be overridden in prod.
- **Light automated test coverage.** Only a handful of unit/router tests (`tests/` covers coContribution, fraud, secure-checkin, a few routers). The bulk of confidence must come from the manual/agent E2E plan below.

### 1.9 Important assumptions

1. The seeded UAT accounts and password (`AvenueAdmin2024!`) and the seeded data set (≈249 members, 6 groups, 753 claims, etc.) are available in the environment under test. If testing a clean client environment instead, testers must first create the equivalent data through the UI per §4 preconditions.
2. The production/UAT URL is the Vercel deployment unless the client is on the Docker/nginx self-host — confirm which before starting (the env matrix in §6 lists both).
3. "Production readiness" is judged for the **first named client's scope**. Modules marked unimplemented in `AICARE_TODO.md` are tested for *absence/graceful-degradation*, not for full function, unless the client's contract requires them — **this is an open question for the product owner (§13)**.
4. Multi-tenancy: the platform is multi-tenant (`tenantId` on most models). This plan assumes a single client tenant under test but includes a tenant-isolation check (§8).

### 1.10 Areas where the codebase is unclear / ambiguous (carry into §13)

- Whether the fine-grained `Permission`/`RolePermission` matrix is fully seeded for every `UserRole`, or whether some screens rely only on the coarse role check (potential over- or under-permissioning).
- Exact production transport for SMS/USSD/WhatsApp (no confirmed gateway client in code).
- Whether `/api/v1/*` is exposed publicly in production and how its API key is provisioned/rotated.
- Whether append-only audit guarantees (DB triggers for `CheckInEvent`, fraud audit) are actually applied in the production DB (`scripts/apply-checkin-audit-guard.mjs` exists but its application state is unknown).
- Whether co-contribution / pricing actuarial math (Decimal/HyperFormula/Pyodide) is finalised and signed off by an actuary.

---

## 2. User Roles and Permissions Map

For every role, testers must verify three things: (a) **can do** — the role reaches and completes its intended actions; (b) **cannot do** — the role is blocked from other portals/actions both via UI navigation *and* via direct URL/API; (c) **sees only its own scope** — data is correctly filtered (e.g. broker sees only its groups, HR sees only its employer's members, member sees only their family).

### 2.1 Test accounts (seeded; password `AvenueAdmin2024!`)

| Role | Email | Expected landing |
|---|---|---|
| SUPER_ADMIN | admin@avenue.co.ke | /dashboard (full admin nav) |
| CLAIMS_OFFICER | claims@avenue.co.ke | /dashboard (claims-trimmed nav) |
| FINANCE_OFFICER | finance@avenue.co.ke | /dashboard (finance-trimmed nav) |
| UNDERWRITER | underwriter@avenue.co.ke | /dashboard (UW-trimmed nav) |
| CUSTOMER_SERVICE | cs@avenue.co.ke | /dashboard (service-desk nav) |
| MEDICAL_OFFICER | medical@avenue.co.ke | /dashboard (clinical nav) |
| REPORTS_VIEWER | (confirm seeded) | /dashboard (read-only reports) |
| FUND_ADMINISTRATOR | fund@avenue.co.ke | /fund/dashboard |
| BROKER_USER | broker@kaib.co.ke | /broker/dashboard |
| HR_MANAGER | emily.wambui@safaricom.co.ke | /hr/dashboard |
| MEMBER_USER | member@avenue.co.ke (+ demo.low/.nearcap/.family/.wallet/.preauth) | /member/dashboard |

> Note: if `REPORTS_VIEWER` has no seeded account, raise it as an open question (§13) and create one via Settings → Users to test read-only behaviour.

### 2.2 Permissions matrix to verify (expected — confirm against live behaviour)

Mark each cell ✅ allowed / ⛔ blocked during execution. Where the system disagrees with this expectation, log a defect (over- or under-permissioning is a security finding).

| Capability \ Role | SUPER_ADMIN | CLAIMS | FINANCE | UNDERWRITER | CUST_SVC | MEDICAL | REPORTS | BROKER | HR | FUND | MEMBER |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Admin portal access | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Members CRUD | ✅ | view | view | view | view | view | view | ⛔ | own group view | ⛔ | own only |
| Claims capture/adjudicate | ✅ | ✅ | view | ⛔ | view | clinical | view | ⛔ | ⛔ | ⛔ | ⛔ |
| Settlement / GL / billing | ✅ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | view | ⛔ | invoices(own) | fund(own) | wallet(own) |
| Quotations/underwriting | ✅ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | view | own | ⛔ | ⛔ | ⛔ |
| Preauth approve/decline | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ✅ | view | ⛔ | ⛔ | ⛔ | request only |
| Fraud / overrides | ✅ | view | ⛔ | ⛔ | ⛔ | ✅(override) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Brokers/providers admin | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | view | ⛔ | ⛔ | ⛔ | ⛔ |
| Settings/Users/Roles | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Reports/exports | ✅ | scope | scope | scope | scope | scope | ✅ | own | own group | own fund | own |
| Broker portal | ⛔* | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| HR portal | ⛔* | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| Fund portal | ⛔* | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| Member portal | ⛔* | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |

\* "scope"/"own" = filtered to the user's tenant/group/broker/member. "*" cells: whether staff roles may also view other portals is an open question (§13) — test and record actual behaviour rather than assuming.

### 2.3 Per-role baseline checklist (run for EVERY role above)

For each role, execute and record evidence:

1. **Login** with valid credentials → lands on the correct portal (table §2.1).
2. **Invalid login** (wrong password, unknown email, empty fields) → generic "Invalid email or password", no enumeration of which field was wrong.
3. **Logout** → session cleared; pressing Back or revisiting a deep link redirects to `/login`.
4. **Password reset / recovery** — locate the flow (if none exists in UI, record as a gap; reset is currently performed by admin "reset password" on the user/member — verify that path).
5. **First-time setup / onboarding** — temp-password first login forces/looks-for a password change (verify whether enforced).
6. **Role dashboard** renders without console errors and shows only role-appropriate widgets.
7. **Role-specific primary action** completes (defined per workflow in §4).
8. **Blocked-portal check (UI):** the nav does not expose other portals.
9. **Blocked-portal check (direct URL):** manually type a URL for another portal (e.g. member types `/dashboard`; HR types `/member/dashboard`; broker types `/fund/dashboard`) → must land on branded **Access Denied / unauthorized**, never render the page or its data.
10. **Blocked-action check (API):** attempt a tRPC/REST mutation the role shouldn't have (see §8) → must be rejected server-side, not just hidden in UI.
11. **Cross-record visibility:** confirm the role sees only records in its scope (e.g. broker B cannot see broker A's groups; HR of group X cannot see group Y's members).
12. **Notifications** the role should receive are received; ones it shouldn't, it doesn't.
13. **Reports/exports** available to the role open and contain only in-scope data.

---

## 3. Core Workflows Identified

The end-to-end scripts in §4 cover these workflows. Numbering here matches §4 sub-sections.

1. Authentication, session & role routing (W1)
2. Quotation → underwriting → accept → group conversion → binding (maker-checker) (W2)
3. Member enrolment, onboarding, card issuance & portal provisioning (W3)
4. Member lifecycle: transfer, lapse, cancellation, death, termination, reinstatement (W4)
5. Packages, benefit configuration, rate matrices, pricing & co-contribution (W5)
6. Endorsements (additions/removals/tier changes) with pro-rata (W6)
7. Pre-authorisation request & adjudication (W7)
8. Claims capture (UI wizard, Excel import, B2B API) (W8)
9. Claims adjudication → fraud screening → settlement (maker-checker) (W9)
10. Reimbursement requests (member-paid) (W10)
11. Provider network: onboarding, tariffs, contracts, settlement statements (W11)
12. Broker: onboarding, KYC, commission schedules, calculation & payout (W12)
13. Finance: invoicing/billing runs, payments, reconciliation, GL (W13)
14. Self-funded fund management: deposits, balance, statements, admin fee (W14)
15. Member self-service: benefits, dependents, documents, facilities, health vault, notifications, wallet/M-Pesa (W15)
16. Biometric / device check-in & visit verification (WebAuthn) (W16)
17. USSD & SMS member query channels (W17)
18. Service desk: complaints & service requests (W18)
19. Analytics, strategic-purchasing console & the 34 named reports + exports (W19)
20. Fraud alerts & override queue (W20)
21. Background jobs & scheduled automation (W21)
22. HR portal employer self-service (W22)

---

## 4. End-to-End Test Plan

**Conventions for every workflow below.**
- *Evidence to capture* always includes: a screenshot of the final state, the URL, the record reference/ID created, the browser+OS+role, and any console/network errors (open DevTools → Console & Network before starting). For state changes, also capture the "before" and "after".
- *Test data* — create all required data **through the UI/API**, never by editing the database. DB inspection is allowed only to *verify* a result (read-only), and is marked "(verify-only)".
- Run each workflow on the **happy path first**, then the **negative/edge cases**, then re-run the happy path as the next role where hand-offs occur.
- Where a defect is already suspected (§1.8), the step is annotated `⚠ known-risk` — capture extra evidence (full error text, digest code, network response body, Vercel function log if available).

---

### W1 — Authentication, Session & Role Routing

**Purpose.** Prove that only valid users log in, each role is routed to and confined to its portal, sessions behave safely, and password/account recovery works.

**Preconditions.** All §2.1 accounts exist. Two browsers/incognito windows available for concurrency checks. DevTools open.

**Test users.** All roles, one at a time.

**Step-by-step script.**

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 1.1 | any | Navigate to base URL `/` | — | Redirects to `/login`; login form renders (email, password, submit) | Screenshot + URL | |
| 1.2 | any | Submit empty form | blank | Inline validation; no network call to auth, or graceful error | Screenshot | |
| 1.3 | any | Enter unknown email + any password | `nobody@x.com` / `x` | "Invalid email or password" (generic, no enumeration) | Screenshot + network 401/redirect | |
| 1.4 | any | Enter known email + wrong password | `admin@avenue.co.ke` / `wrong` | Same generic error; no lockout bypass | Screenshot | |
| 1.5 | SUPER_ADMIN | Valid login | admin@avenue.co.ke / `AvenueAdmin2024!` | Lands on `/dashboard`, full admin nav | Screenshot | |
| 1.6 | each remaining role | Valid login | per §2.1 | Lands on correct portal (claims/finance/uw/cs/medical/reports → `/dashboard` trimmed; fund → `/fund/dashboard`; broker → `/broker/dashboard`; hr → `/hr/dashboard`; member → `/member/dashboard`) | Screenshot per role | |
| 1.7 | MEMBER_USER | While logged in, type `/dashboard` in address bar | — | Branded **Access Denied / unauthorized**, not the admin dashboard | Screenshot + URL | |
| 1.8 | HR_MANAGER | Type `/member/dashboard` | — | Access Denied | Screenshot | |
| 1.9 | BROKER_USER | Type `/fund/dashboard` then `/dashboard` | — | Access Denied for both | Screenshot | |
| 1.10 | any | Click Logout | — | Returns to `/login`; session cleared | Screenshot | |
| 1.11 | any | After logout, press browser Back, then open a deep link (e.g. `/members`) | — | Redirects to `/login`; no cached protected content shown | Screenshot | |
| 1.12 | any | Reset password flow (admin-initiated): SUPER_ADMIN → Settings → Users → reset a staff user's password; or Members → portal login → reset | — | Temp password issued; user can log in with it | Screenshot of confirmation | |
| 1.13 | user with temp password | First login | temp pw | Verify whether a forced password change is enforced (record result; absence = finding) | Screenshot | |
| 1.14 | any | Session timeout: log in, leave idle past session lifetime, then act | — | Either silent re-auth or redirect to login — must not 500 or show stale data | Screenshot + note timeout length | |

**Negative & edge cases.** SQL/script in email field (`' OR 1=1--`, `<script>`) → rejected, no injection, no reflected XSS. Rapid repeated failed logins → confirm whether any rate limiting/lockout exists (record; none = finding). Two concurrent sessions for same user in two browsers → both work or graceful invalidation (record behaviour). Tampered session cookie/JWT → rejected (see §8). Disabled user (`isActive=false`) cannot log in (set a test user inactive via Settings, then attempt).

**Production readiness risks.** If role guards leak (any §1.7–1.9 renders the page), that is **Critical** (cross-role data exposure). No password-change enforcement on temp credentials, no login rate limiting, or sessions that don't expire are **High** security risks for a system holding health + financial data.

---

### W2 — Quotation → Underwriting → Accept → Group Conversion → Binding

**Purpose.** Prove the full sales pipeline from prospect to a bound, billable scheme, including the maker-checker binding controls.

**Preconditions.** At least one Package/benefit tier and one rate card exist (create in W5 first if not). Underwriter and Super Admin accounts. A broker account if testing broker-originated quotes.

**Test users.** UNDERWRITER (maker), SUPER_ADMIN / senior (checker), BROKER_USER (origination variant).

**Step-by-step script.**

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 2.1 | UNDERWRITER | `/quotations` loads | — | List + status filters + KPI cards | Screenshot | |
| 2.2 | UNDERWRITER | Click "New Business Intake"; complete intake form | Prospect "QA Prospect Ltd", contact, est. lives, industry, county | Quotation created (e.g. QUO-2026-xxxxx), redirects to assessment | Screenshot + quote ref | |
| 2.3 | UNDERWRITER | On detail page, verify prospect name displays | — | Legal name shown (not "Unnamed Prospect") `⚠ known-risk DEFECT-006` | Screenshot | |
| 2.4 | UNDERWRITER | "Add Life" → add a principal (and a dependent) | name, DOB, gender, relationship | Lives count increments; pricing recalculates | Screenshot before/after | |
| 2.5 | UNDERWRITER | Open Calculator wizard, complete all 5 steps | family size, limit band, loadings | Premium/contribution computed; values plausible (cross-check one cell vs rate card) | Screenshot each step | |
| 2.6 | UNDERWRITER | Record an underwriting decision (accept/load/exclude) | decision + reason | UnderwritingDecision saved; reflected on quote | Screenshot | |
| 2.7 | UNDERWRITER | "Download PDF" / quotation PDF link | — | PDF opens correctly `⚠ known-risk DEFECT-005 (was HTTP 500)` — capture full response if it fails | PDF file or error body | |
| 2.8 | UNDERWRITER | "Send to Client" | — | Status DRAFT→SENT; timeline updated; "Add Life" now hidden | Screenshot | |
| 2.9 | UNDERWRITER | "Accept & Convert" | acceptance method/date | Status →ACCEPTED | Screenshot | |
| 2.10 | UNDERWRITER | "Create Group" from accepted quote | — | New group created AND user is given clear feedback/redirect `⚠ known-risk DEFECT-007 (silent, no feedback)` | Screenshot + verify group in `/groups` | |
| 2.11 | UNDERWRITER | Open bind workflow; step 1 Acceptance | — | 4-step maker-checker UI (Acceptance → Create Members → Binder Approval → Debit Note) | Screenshot | |
| 2.12 | UNDERWRITER | Step 2 "Create Memberships" | lives from quote | Members created; clear feedback even with 0 lives (no silent no-op) `⚠` | Screenshot | |
| 2.13 | SUPER_ADMIN/checker | Step 3 Binder Approval (as a *different* user than maker) | — | Checker can approve; maker cannot self-approve (must be blocked with a friendly message) | Screenshot both attempts | |
| 2.14 | FINANCE/checker | Step 4 Debit Note generated | — | Debit note PDF/record produced `⚠ PDF risk` | Screenshot/PDF | |
| 2.15 | UNDERWRITER | Confirm bound group now appears as ACTIVE scheme with members | — | Group ACTIVE; members enrolled; benefit tiers attached | Screenshot | |

**Negative & edge cases.** Double-click "Create Group"/"Create Memberships" → no duplicates, button disables `⚠ DEFECT-003 pattern`. Convert a quote with 0 lives → blocked or clear warning. Quotation expiry: let a SENT quote pass its expiry (or use quotation-expiry job W21) → status EXPIRED, cannot be accepted. Maker = checker on binder approval → blocked. Accept an already-converted quote again → idempotent/blocked. Broker-originated quote (W12) → only that broker sees it. Invalid DOB / future DOB / member older than plan max age → validation error.

**Production readiness risks.** Silent create actions (no feedback) cause operators to double-create schemes/members → billing duplication = **High**. If maker-checker can be bypassed (self-approval), that breaks financial controls = **Critical**. Broken quotation/debit-note PDF blocks client-facing sales documents = **High**.

---

### W3 — Member Enrolment, Onboarding, Card Issuance & Portal Provisioning

**Purpose.** Prove a member can be created, onboarded, carded, and given working portal access, with data persisting and visible to the right roles.

**Preconditions.** An ACTIVE group with a benefit tier (Safaricom seeded, or bound in W2). SUPER_ADMIN.

**Test users.** SUPER_ADMIN / CLAIMS_OFFICER (create); MEMBER_USER (the new member logs in); HR_MANAGER (cross-portal visibility).

**Step-by-step script.**

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 3.1 | SUPER_ADMIN | `/members` loads | — | List (~249 seeded), search + status/relationship filters | Screenshot | |
| 3.2 | SUPER_ADMIN | Search a surname | "Wairimu" | Filtered subset | Screenshot | |
| 3.3 | SUPER_ADMIN | "Add Member"; complete enrolment form | name, DOB, gender, national ID, phone, email, group, tier, relationship=PRINCIPAL | Member created with member number (AVH-2026-xxxxx), status per rules | Screenshot + member no. | |
| 3.4 | SUPER_ADMIN | Add a dependent to the principal | spouse/child details | Dependent linked in family unit; shares/within limits correct | Screenshot | |
| 3.5 | SUPER_ADMIN | Open member detail | — | QR card, limits (annual/utilised/remaining), family unit, lifecycle actions, portal login, device enrollment | Screenshot | |
| 3.6 | SUPER_ADMIN | Edit member (change phone), save, reload | new phone | Change persists after reload | Screenshot before/after | |
| 3.7 | SUPER_ADMIN | "Issue Card" → confirm | — | "Card issued successfully"; card number generated | Screenshot | |
| 3.8 | SUPER_ADMIN | "Generate & Download" a welcome letter | letter type | Letter PDF downloads and opens `⚠ known-risk DEFECT-001 (server 500, digest 2671985791)` — capture full error | PDF or error | |
| 3.9 | SUPER_ADMIN | "Start Onboarding" | — | 5-item checklist created (KYC, portal, card, comms, network) | Screenshot | |
| 3.10 | SUPER_ADMIN | "Create Portal Login" with temp password | temp pw | Member account ACTIVE; reset available | Screenshot | |
| 3.11 | MEMBER_USER (new) | Log in as the new member | new member email + temp pw | Lands on `/member/dashboard`; sees own cover/QR/limits | Screenshot | |
| 3.12 | HR_MANAGER (same group) | Open roster, find the new member | — | Member visible with the admin-edited phone (cross-portal consistency) | Screenshot | |
| 3.13 | SUPER_ADMIN | KYC: upload an ID document | sample PDF/JPG | Upload succeeds (MinIO), document listed; **note IPRS validation is stubbed** — confirm manual-verify path | Screenshot | |

**Negative & edge cases.** Duplicate national ID / duplicate member in same group → blocked or flagged. Missing required field → inline validation. Invalid email/phone format → rejected. Upload oversized or wrong-type file to KYC → rejected with message (see §6 upload limits). Internal blacklist: enrol a member matching `InternalBlacklist` → flagged/blocked. Member older than plan max age → validation. Issue card twice → no duplicate active card.

**Production readiness risks.** Broken letters block welcome/lapse/reinstatement comms = **High**. If portal login provisioning fails or shows the wrong member's data = **Critical**. KYC accepting unverified IDs (IPRS stub) silently is a compliance risk = **High** unless a manual gate is enforced and visible.

---

### W4 — Member Lifecycle: Transfer, Lapse, Cancellation, Death, Termination, Reinstatement

**Purpose.** Prove status transitions are correct, controlled (senior approval where required), reversible where intended, and propagate to eligibility/claims.

**Preconditions.** A disposable test member (create in W3 — do **not** use seeded production-like members for destructive transitions). Two destination groups for transfer. A senior approver account.

**Test users.** SUPER_ADMIN (maker), senior approver (checker), MEMBER_USER (reinstatement self-service).

**Step-by-step script.**

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 4.1 | SUPER_ADMIN | Member detail → "Transfer"; choose destination group, effective date, reason; Confirm | dest group + date | Member moved; old group membership ended; new group shows member | Screenshot before/after both groups | |
| 4.2 | SUPER_ADMIN | "Cooling-off cancel" within window | reason | Status →CANCELLED (cooling-off); refund/pro-rata as configured | Screenshot | |
| 4.3 | SUPER_ADMIN | "Lapse" a member | reason | Status →LAPSED; eligibility blocked (verify via claim attempt in W8) | Screenshot | |
| 4.4 | SUPER_ADMIN | "Record Death" | date, reason | Status updated; dependents handling per rules | Screenshot | |
| 4.5 | SUPER_ADMIN | "Terminate" (requires senior approval) | reason | Request goes to approval, not immediate | Screenshot | |
| 4.6 | senior approver | Approve termination | — | Status →TERMINATED; maker cannot self-approve | Screenshot both | |
| 4.7 | MEMBER_USER (lapsed) | Member portal → Reinstatement | — | Correct state shown; can request reinstatement (fee rules apply) | Screenshot | |
| 4.8 | SUPER_ADMIN | Reinstatement queue → process the request | — | Member reinstated; eligibility restored; waiting periods reapplied if configured | Screenshot | |

**Negative & edge cases.** Transfer to the same group → blocked. Lapse an already-lapsed member → idempotent. Terminate without reason → blocked. Self-approve termination → blocked. Reinstate a TERMINATED (not LAPSED) member → behaviour per policy (record). After lapse/termination, attempt a claim/preauth/check-in for that member (W7/W8/W16) → must be rejected with a clear "not eligible" message (B2B API already checks SUSPENDED/LAPSED/TERMINATED — verify UI parity).

**Production readiness risks.** If a lapsed/terminated member can still claim or check in = **Critical** (financial leakage). If status changes don't propagate to dependents or to HR/fund/broker views = **High** (data integrity).

---

### W5 — Packages, Benefit Configuration, Rate Matrices, Pricing & Co-Contribution

**Purpose.** Prove benefit plans, limits, rate cards, pricing models and co-pay rules can be created/versioned and that they drive downstream eligibility and adjudication correctly.

**Preconditions.** SUPER_ADMIN / UNDERWRITER.

**Test users.** SUPER_ADMIN, UNDERWRITER.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 5.1 | SUPER_ADMIN | `/packages` loads | — | List (3 seeded) with limits/contributions | Screenshot | |
| 5.2 | SUPER_ADMIN | Open a package detail | — | ~10 benefit categories, version label, benefit schedule | Screenshot | |
| 5.3 | SUPER_ADMIN | Create a new package via Builder | name, categories, limits, shared-limit group | Package saved; appears in list | Screenshot + ref | |
| 5.4 | SUPER_ADMIN | Edit benefit schedule; save → new version | change a limit | New PackageVersion created; old version retained (versioning works) | Screenshot | |
| 5.5 | SUPER_ADMIN | Rate matrix: create a rate card | "QA Rate Card 2026", 9 family sizes × limit bands | Matrix editor saves all cells | Screenshot | |
| 5.6 | SUPER_ADMIN | Settings → Pricing Models → "Create Model" | — | Model creation works `⚠ known-risk DEFECT-004 (dead placeholder button)` — record if no-op | Screenshot | |
| 5.7 | SUPER_ADMIN | Configure a co-contribution rule + annual cap | network tier, %, cap | Rule saved; cap recorded | Screenshot | |
| 5.8 | UNDERWRITER | Build a quote (W2) using the new rate card | — | Premium pulls correct cell from the matrix (cross-check one value by hand) | Screenshot + manual calc | |
| 5.9 | (downstream) | Submit a claim for a member on this package (W8/W9) | — | Co-contribution/member-share computed per the rule; shared limits decremented correctly | Screenshot | |

**Negative & edge cases.** Save a rate card with a blank/zero cell → validation. Create package with duplicate name → blocked/flagged. Co-pay % >100 or negative → rejected. Shared-limit group: consume limit on one benefit, confirm the linked benefit's remaining drops too. Edit a package that's already bound to active members → confirm versioning protects existing members (no retroactive limit change). Calculated fields (totals, contributions) must match an independent manual calculation.

**Production readiness risks.** Wrong rate-card math or co-pay calc directly mis-prices schemes and over/under-charges members = **Critical** (financial + regulatory). Dead pricing-model creation blocks a configuration path = **Medium–High** depending on contract scope.

---

### W6 — Endorsements (Additions / Removals / Tier Changes) with Pro-Rata

**Purpose.** Prove mid-term membership changes compute correct pro-rata debits/credits and apply cleanly.

**Preconditions.** An ACTIVE group with members and known contribution. SUPER_ADMIN; HR_MANAGER (employer-raised variant).

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 6.1 | SUPER_ADMIN | `/endorsements` loads | — | List + status & type filters (8 endorsement types) | Screenshot | |
| 6.2 | SUPER_ADMIN | New endorsement: add a life mid-term | member, effective date | Endorsement created; pro-rata debit shown (verify sign + amount by hand) | Screenshot + manual calc | |
| 6.3 | SUPER_ADMIN | New endorsement: remove a life | member, date | Pro-rata credit computed | Screenshot | |
| 6.4 | SUPER_ADMIN | Tier change endorsement | member, old→new tier | Pro-rata difference computed; tier updated on member | Screenshot | |
| 6.5 | SUPER_ADMIN | Apply/approve endorsement | — | Status →APPLIED; member roster + invoice reflect change | Screenshot | |
| 6.6 | HR_MANAGER | Raise "Request Member Addition" from HR portal | new member | Creates endorsement in queue; admin sees it | Screenshot | |
| 6.7 | HR_MANAGER | Roster bulk import (CSV) | sample CSV | Bulk endorsements created; errors reported per-row | Screenshot + CSV | |

**Negative & edge cases.** Effective date before scheme start / after scheme end → validation. Add a duplicate life → blocked. Pro-rata across a leap year / partial month → verify rounding (Decimal). Apply same endorsement twice → idempotent. CSV with bad rows → partial success with a clear per-row error report, not silent drop.

**Production readiness risks.** Incorrect pro-rata = direct billing error = **High/Critical**. Silent CSV row drops = **High** (members never enrolled but employer believes they are).

---

### W7 — Pre-Authorisation Request & Adjudication

**Purpose.** Prove preauth can be requested (member & admin), screened against benefits/holds, and approved/declined with limits held.

**Preconditions.** Active member with benefits; provider; MEDICAL_OFFICER/CLAIMS_OFFICER.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 7.1 | CLAIMS_OFFICER | `/preauth` loads | — | List (7 seeded) + KPI cards | Screenshot | |
| 7.2 | CLAIMS_OFFICER | New preauth: select member, provider, procedure, diagnosis, est. cost | member, ICD-10, CPT, amount | Preauth created, status PENDING/UNDER REVIEW; benefit hold placed | Screenshot + ref | |
| 7.3 | MEDICAL_OFFICER | Open detail; review financials, diagnoses, procedures, clinical notes; attach a document | sample doc | Detail complete; document attaches | Screenshot | |
| 7.4 | MEDICAL_OFFICER | Approve preauth | approved amount | Status →APPROVED; BenefitHold confirmed; remaining limit reduced | Screenshot before/after limit | |
| 7.5 | MEDICAL_OFFICER | (separate case) Decline preauth | reason | Status →DECLINED; hold released; member notified | Screenshot | |
| 7.6 | MEMBER_USER | From member portal, submit a preauth request | procedure | Created (PA-2026-xxxxx) UNDER REVIEW; appears in admin queue | Screenshot | |
| 7.7 | CLAIMS_OFFICER | Preauth escalation: leave a HIGH item unreviewed past threshold (or trigger job W21) | — | Auto-escalation to senior (if implemented) — record actual behaviour | Screenshot | |

**Negative & edge cases.** Preauth for an ineligible member (lapsed/terminated) → blocked. Amount exceeding remaining benefit → flagged/partial. Decline then resubmit → handled. Member portal "Submitting…" with no redirect for several seconds — record UX (known polish issue). Approve an already-declined preauth → blocked.

**Production readiness risks.** If benefit holds aren't placed/released correctly, limits drift and double-spend becomes possible = **High**. Member-portal submit with no confirmation can cause duplicate requests = **Medium**.

---

### W8 — Claims Capture (UI Wizard, Excel Import, B2B API)

**Purpose.** Prove claims can be captured through every channel with correct member/provider/benefit linkage and eligibility gating.

**Preconditions.** Active member, paneled provider, ICD-10/CPT reference data loaded. CLAIMS_OFFICER; a valid `/api/v1` API key for the API path.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 8.1 | CLAIMS_OFFICER | `/claims` loads | — | List (~753 seeded), KPI cards, filters | Screenshot | |
| 8.2 | CLAIMS_OFFICER | New claim wizard: search member | member no. | Member resolves with eligibility + limits | Screenshot | |
| 8.3 | CLAIMS_OFFICER | Select provider | provider name | Provider resolves with tier/tariff | Screenshot | |
| 8.4 | CLAIMS_OFFICER | Encounter: service type, date, ICD-10 diagnosis (lookup), CPT line(s) with charges | outpatient, ICD-10, consultation line KES 5,000 | Lines added with standard charges; total computed | Screenshot | |
| 8.5 | CLAIMS_OFFICER | Submit | — | Claim created (CLM-2026-xxxxx), status RECEIVED | Screenshot + ref | |
| 8.6 | CLAIMS_OFFICER | Claims import: download Excel template, fill, upload | sample .xlsx (cols A–F+) | Rows imported; per-row validation results shown `⚠ retest after redeploy (DEFECT-014 area)` | Screenshot + file | |
| 8.7 | (API) | POST `/api/v1/claims` with valid API key | JSON: memberNumber, providerCode, serviceType, dateOfService, diagnoses, lineItems | 200/201; claim created; appears in admin list | Request/response capture | |
| 8.8 | (API) | POST `/api/v1/claims` with **no/invalid** API key | — | 401 "Unauthorized. Invalid or missing API Key." | Response capture | |
| 8.9 | (API) | POST for a SUSPENDED/LAPSED/TERMINATED member | blocked member no. | 403 "Member status is … — not eligible" | Response capture | |
| 8.10 | (API) | POST with missing required fields | partial body | 400 with field list | Response capture | |

**Negative & edge cases.** Claim for ineligible member via UI (parity with API gate). Charge exceeding remaining benefit → flagged. Duplicate claim (same member/provider/date/amount) → duplicate detection/flag. Future date of service → rejected. Unknown ICD-10/CPT → rejected. Excel import with malformed rows, wrong columns, huge file → graceful per-row errors, no partial silent import. API replay/idempotency → confirm no duplicate claim from a retried request.

**Production readiness risks.** If the B2B API accepts the default dev key (`av-slade360-dev-key`) in production = **Critical** (anyone can inject claims). Eligibility gate gaps = **Critical**. Silent import failures = **High**.

---

### W9 — Claims Adjudication → Fraud Screening → Settlement (Maker-Checker)

**Purpose.** Prove a received claim can be adjudicated to a correct financial outcome, fraud-screened, and paid through a controlled settlement batch.

**Preconditions.** A RECEIVED claim from W8. CLAIMS_OFFICER (adjudicate), FINANCE_OFFICER + a second finance user (settlement maker/checker).

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 9.1 | CLAIMS_OFFICER | Open claim detail | — | Financial summary, diagnoses, line items, adjudication controls | Screenshot | |
| 9.2 | CLAIMS_OFFICER | "Mark as Captured" | — | Status CAPTURED | Screenshot | |
| 9.3 | CLAIMS_OFFICER | Approve each line item (✓) | — | Lines marked approved | Screenshot | |
| 9.4 | CLAIMS_OFFICER | "Compute Outcome" | — | Outcome computed (e.g. 5,000/5,000), claim →APPROVED; AdjudicationLog entry | Screenshot | |
| 9.5 | CLAIMS_OFFICER | **Negative:** on a fresh CAPTURED claim, click "Submit Decision" BEFORE Compute Outcome | — | Friendly validation message, NOT a server crash `⚠ known-risk DEFECT-009 (digest 2813583153)` | Screenshot of error | |
| 9.6 | CLAIMS_OFFICER | Fraud desk `/fraud`: confirm heuristic fired on the claim | — | Alert present (e.g. After-Hours Outpatient Anomaly, score) | Screenshot | |
| 9.7 | MEDICAL_OFFICER | Open alert; "Dismiss Alert" with reason | reason | Open count decrements; audit recorded | Screenshot | |
| 9.8 | FINANCE_OFFICER | Settlement: create a provider batch | provider + approved claim(s) | Batch created with clear feedback (no post-action crash) `⚠ known-risk DEFECT-010a (digest 3362540806)` | Screenshot | |
| 9.9 | FINANCE_OFFICER (maker) | Attempt to approve own batch | — | Blocked with "cannot approve own batch" message, NOT a crash `⚠ DEFECT-010b` | Screenshot | |
| 9.10 | 2nd finance user (checker) | Approve the batch | — | Status →CHECKER APPROVED | Screenshot | |
| 9.11 | FINANCE_OFFICER | Click "Paid" to settle | payment ref | Status →SETTLED; payment voucher/GL entries created `⚠ known-risk DEFECT-010c (Paid does nothing)` | Screenshot + GL check | |
| 9.12 | (verify-only) | Confirm GL journals balance after settlement | — | Debits = credits; trial balance consistent | Screenshot of GL | |

**Negative & edge cases.** Partial line approval (approve some, reject some) → outcome = sum of approved only. Reject entire claim with reason code → status DECLINED, member/provider notified, appears in "rejected claims" report (R-18). Adjudicate a claim twice → blocked. Settle a batch twice → blocked. Maker=checker on settlement → blocked. Fraud: a claim that trips a HARD rule → cannot be auto-approved without override (W20).

**Production readiness risks.** Settlement that cannot reach SETTLED means providers never get paid through the system = **Critical** (this is currently a known failure — must be fixed and retested). Maker self-approval = **Critical** control failure. GL not balancing after settlement = **Critical**.

---

### W10 — Reimbursement Requests (Member-Paid Claims)

**Purpose.** Prove members/admins can lodge out-of-pocket reimbursement and it flows to payment.

**Preconditions.** Active member; CLAIMS_OFFICER/FINANCE_OFFICER.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 10.1 | CLAIMS_OFFICER | Reimbursement page renders with explainer | — | Form + proof-of-payment upload, payment method | Screenshot | |
| 10.2 | CLAIMS_OFFICER | Submit a reimbursement | member, amount, proof file, bank/M-Pesa | Request created; status pending review | Screenshot + ref | |
| 10.3 | FINANCE_OFFICER | Review & approve | approved amount | Status approved; payment voucher created; member notified | Screenshot | |
| 10.4 | FINANCE_OFFICER | Process payout | method | Payout recorded (M-Pesa path is stubbed — verify manual/marked state) | Screenshot | |

**Negative & edge cases.** Missing proof upload → blocked. Amount above benefit remaining → flagged. Duplicate reimbursement for same proof → flagged. Reject with reason → member notified.

**Production readiness risks.** Reimbursing without verified proof or above limits = **High** (leakage). M-Pesa payout being a stub means real disbursement isn't automated — confirm the manual process is documented = **Medium–High**.

---

### W11 — Provider Network: Onboarding, Tariffs, Contracts, Settlement Statements

**Purpose.** Prove providers can be onboarded with tariffs and contracts and that provider statements reconcile to paid claims.

**Preconditions.** SUPER_ADMIN/FINANCE_OFFICER.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 11.1 | SUPER_ADMIN | `/providers` loads | — | List with tiers (OWN/PARTNER/PANEL) | Screenshot | |
| 11.2 | SUPER_ADMIN | New provider form incl. Leaflet map pin | name, code, tier, location | Provider created; map pin saved | Screenshot | |
| 11.3 | SUPER_ADMIN | Add CPT & diagnosis tariffs | CPT, price | Tariffs saved; reflected in facility cost preview (W15) | Screenshot | |
| 11.4 | SUPER_ADMIN | Create a provider contract + exclusion | terms, excluded service | Contract ACTIVE; exclusion enforced at claim time | Screenshot | |
| 11.5 | FINANCE_OFFICER | Generate provider statement for a period | provider, date range | Itemised paid claims; total matches settlement (R-03) `⚠ PDF risk` | Screenshot/PDF + reconcile | |

**Negative & edge cases.** Duplicate provider code → blocked. Tariff with negative/zero price → validation. Claim for an excluded service at that provider → rejected with reason. Internal vs external (OWN vs PANEL) parity — confirm both are billable and statements separate them.

**Production readiness risks.** Wrong tariffs mis-price claims = **High**. Provider statement not matching paid claims breaks provider trust/audit = **High**. Broken statement PDF = **Medium–High**.

---

### W12 — Broker: Onboarding, KYC, Commission Schedules, Calculation & Payout

**Purpose.** Prove brokers can be onboarded with KYC/IRA compliance, earn commissions on bound business, and be paid via controlled payout batches — and that brokers see only their own data.

**Preconditions.** SUPER_ADMIN; BROKER_USER (broker@kaib.co.ke); a bound group attributed to that broker.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 12.1 | SUPER_ADMIN | `/brokers` list + detail (overview/producers/KYC/schedules/ledger/payouts tabs) | — | All tabs render | Screenshot | |
| 12.2 | SUPER_ADMIN | New broker incl. hierarchy type + IRA compliance fields | name, type, IRA no. | Broker created | Screenshot | |
| 12.3 | SUPER_ADMIN | Upload KYC document; set status | doc | KYC doc stored; status reflects | Screenshot | |
| 12.4 | SUPER_ADMIN | Create commission schedule + tiers | basis, %, tiers | Schedule ACTIVE | Screenshot | |
| 12.5 | SUPER_ADMIN | Run commission calculation (or trigger job W21) for a period | period | Ledger entries created with WHT & levies (R-11) | Screenshot + manual check of WHT | |
| 12.6 | SUPER_ADMIN | Create commission payout batch; approve (maker-checker) | — | Batch progresses through states to paid | Screenshot | |
| 12.7 | BROKER_USER | Log in; dashboard KPIs; groups/quotations/renewals/submissions/commissions | — | Sees only own broker's data (Antler/KAIB scope), not other brokers' | Screenshot | |
| 12.8 | BROKER_USER | Open a group/submission/renewal detail | — | Renders; scoped correctly | Screenshot | |

**Negative & edge cases.** Broker A attempts (via direct URL) to open Broker B's group/quote → Access Denied / not found, never the data. Commission with WHT/levy edge values → verify math. Pay a batch twice → blocked. Broker with expired KYC → flagged (broker-compliance.service).

**Production readiness risks.** Cross-broker data leakage = **Critical** (confidential commercial data). Wrong commission/WHT math = **High** (financial + tax compliance).

---

### W13 — Finance: Invoicing / Billing Runs, Payments, Reconciliation, GL

**Purpose.** Prove invoices generate, payments apply, bank reconciliation matches, taxes/levies compute, and GL stays balanced.

**Preconditions.** FINANCE_OFFICER; an active group with contributions due.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 13.1 | FINANCE_OFFICER | Billing: invoices list + totals | — | Totals (billed/collected/outstanding) render | Screenshot | |
| 13.2 | FINANCE_OFFICER | Run/trigger a billing run (job W21) | period | Invoices generated for due groups | Screenshot | |
| 13.3 | FINANCE_OFFICER | Record a payment against an invoice | amount, method | Invoice status updates; outstanding reduces | Screenshot | |
| 13.4 | FINANCE_OFFICER | Bank reconciliation: upload a statement | sample file in spec format | Matched/unmatched lines shown | Screenshot + file | |
| 13.5 | FINANCE_OFFICER | GL: review chart of accounts + trial balance + account ledger | — | 24 accounts; trial balance balances | Screenshot | |
| 13.6 | FINANCE_OFFICER | Verify taxes/levies (Stamp Duty, Training Levy, PHCF) on an invoice | — | Correct amounts per TaxRate (R-13) | Screenshot + manual calc | |

**Negative & edge cases.** Overpayment / partial payment → handled, balance correct. Reconcile a statement with unmatched lines → flagged, not auto-forced. Duplicate billing run for same period → no double invoicing. GL entry that would unbalance → blocked.

**Production readiness risks.** Unbalanced GL or double invoicing = **Critical**. Wrong tax/levy computation = **Critical** (statutory).

---

### W14 — Self-Funded Fund Management: Deposits, Balance, Statements, Admin Fee

**Purpose.** Prove a self-funded employer's float can be initialised, topped up, drawn down by claims, and reported.

**Preconditions.** A self-funded group (EABL seeded). FUND_ADMINISTRATOR (fund@avenue.co.ke).

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 14.1 | FUND_ADMINISTRATOR | `/fund/dashboard` | — | KPIs render (currently show KES 0 vs claims millions) `⚠ DEFECT-015` | Screenshot | |
| 14.2 | FUND_ADMINISTRATOR | Group fund overview → "Record Deposit / Top-Up" (first deposit) | KES 1,000,000 | Deposit persists; fund account initialised; balance updates `⚠ known-risk DEFECT-016 (crash, no persist, digest 2550466935)` | Screenshot of result/error | |
| 14.3 | FUND_ADMINISTRATOR | Fund claims view | — | Claims listed with "paid from fund" totals | Screenshot | |
| 14.4 | FUND_ADMINISTRATOR | Statement tab + export | period | Statement renders and exports `⚠ known-risk DEFECT-014 (404 in prod / stale deploy)` | Screenshot/file | |
| 14.5 | FUND_ADMINISTRATOR | Admin fee statement (flat-per-insured or %-of-claims) | — | Correct admin-fee calc (R-15) | Screenshot + manual calc | |
| 14.6 | (verify) | After a fund-paid claim, confirm balance decremented and FundTransaction recorded | — | Ledger consistent with claims | Screenshot | |

**Negative & edge cases.** Deposit negative/zero → rejected. Fund depletion → fund-balance-alert job fires (W21); claims behaviour when fund exhausted (block vs accrue) — record. Withdraw more than balance → blocked.

**Production readiness risks.** This module currently appears non-functional end-to-end (can't initialise a fund). For a self-funded client this is **Critical / go-live blocker**. Balance/claims mismatch undermines employer trust = **Critical**.

---

### W15 — Member Self-Service (Benefits, Dependents, Documents, Facilities, Health Vault, Notifications, Wallet)

**Purpose.** Prove the member portal shows accurate personal data, lets members self-serve, and that the wallet/M-Pesa co-pay path behaves safely given the stub.

**Preconditions.** Seeded demo members (.low/.nearcap/.family/.wallet/.preauth) and a normal member.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 15.1 | MEMBER_USER | Dashboard | — | Cover balance, QR member card, package/renewal | Screenshot | |
| 15.2 | MEMBER_USER (.nearcap) | Benefits page | — | Annual usage vs year-elapsed; near-cap warning accurate | Screenshot | |
| 15.3 | MEMBER_USER (.family) | Dependents | — | Family benefit balance, covered members correct | Screenshot | |
| 15.4 | MEMBER_USER | Documents | — | Plan documents open (not 404) `⚠ known-risk DEFECT-017 (/seed-docs 404)` | Screenshot | |
| 15.5 | MEMBER_USER | Facilities → cost preview by procedure | procedure | Cost preview pulls provider tariff | Screenshot | |
| 15.6 | MEMBER_USER | Health vault: add a vital/journal entry; set visibility/share | entry | Saved; private by default; share works | Screenshot | |
| 15.7 | MEMBER_USER | Notifications: mark-all-read | — | Unread count clears | Screenshot | |
| 15.8 | MEMBER_USER | Utilization → claim drill-down | — | Care cost detail incl. member share | Screenshot | |
| 15.9 | MEMBER_USER (.wallet) | Wallet: pay outstanding via M-Pesa sandbox | KES 1,800 | Payment-confirmation rule enforced; **stub returns unverified** → status stays unconfirmed with clear message, money NOT marked received on a fake code | Screenshot | |
| 15.10 | MEMBER_USER | Profile edit | new detail | Saves; persists | Screenshot | |
| 15.11 | MEMBER_USER | Reinstatement page (active member) | — | Correct "membership active" state | Screenshot | |

**Negative & edge cases.** Submit a **fake** M-Pesa confirmation code → must NOT mark paid (stub returns `verified:false`) — this is the critical safety check. Member tries to view another member's data via URL id swap → blocked (see §8). Health vault share to a revoked recipient → access removed. Documents of another member → blocked.

**Production readiness risks.** If a fake M-Pesa code marks an invoice paid = **Critical** (fraud). Members seeing other members' health data = **Critical** (data protection). Broken plan documents = **Medium**.

---

### W16 — Biometric / Device Check-In & Visit Verification (WebAuthn)

**Purpose.** Prove the secure check-in flow (challenge → verify → event) works, is eligibility-gated, and is auditable/immutable.

**Preconditions.** A member with a registered WebAuthn credential (register via member Security page on a device/authenticator). Reception/clinical staff for the verification side. Note: headless agents can't perform real platform-authenticator biometrics — use a virtual authenticator (Chrome DevTools WebAuthn tab) or a physical key; otherwise mark steps as manual-only.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 16.1 | MEMBER_USER | Security page → register device/WebAuthn | virtual authenticator | Credential enrolled; enrollment approval flow if required | Screenshot | |
| 16.2 | staff | Initiate check-in for the member at a provider | member, provider | CheckInChallenge created; reception/visit code issued | Screenshot | |
| 16.3 | MEMBER_USER | Complete check-in (WebAuthn assertion) | authenticator | CheckInEvent recorded; outcome SUCCESS | Screenshot | |
| 16.4 | staff | Verify reception code match | code | Verified; visit allowed | Screenshot | |
| 16.5 | staff | Expired challenge → restart/cancel | wait past TTL | Graceful expiry; restart works | Screenshot | |
| 16.6 | SUPER_ADMIN | Check-in audit page | — | Biometric/fallback/override stats; events immutable (no edit/delete UI) | Screenshot | |

**Negative & edge cases.** Check-in for ineligible member → blocked. Wrong/expired reception code → rejected. Repeated failed WebAuthn → lockout per `WEBAUTHN_FAILED_LOCKOUT_MINUTES`. Emergency override (clinical role, documented reason) → high-visibility audit record. **Confirm the append-only DB guard** (`scripts/apply-checkin-audit-guard.mjs`) is applied in prod (verify-only): attempt to update/delete a CheckInEvent at DB level should fail (this validates the immutability claim). Liveness/face-match, SMS-OTP fallback, IPRS photo fallback are per `AICARE_TODO` unimplemented/stubbed — confirm they degrade gracefully and aren't silently "passing".

**Production readiness risks.** If check-in is not eligibility-gated, it enables ghost visits = **Critical** (fraud). If the audit trail is mutable (guard not applied), the anti-fraud value is lost = **High**.

---

### W17 — USSD & SMS Member Query Channels

**Purpose.** Prove the low-bandwidth channels respond correctly and don't leak data.

**Preconditions.** Knowledge of the USSD/SMS webhook contract (`/api/ussd`, `/api/sms/member-query`). Confirm whether a real aggregator/gateway is connected (open question §13).

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 17.1 | (simulate) | POST a USSD session payload (menu entry) | session id, phone, input | Menu renders; member identified by phone | Request/response | |
| 17.2 | (simulate) | Navigate USSD to balance/benefit query | menu path | Returns member's balance/benefit summary | Capture | |
| 17.3 | (simulate) | POST SMS member-query | phone + keyword | Correct SMS reply content | Capture | |
| 17.4 | (simulate) | Query from an unregistered phone | unknown number | Safe "not found" reply, no data leak | Capture | |

**Negative & edge cases.** Malformed payload → graceful error. Phone belonging to multiple members → disambiguation. Outbound SMS transport: confirm an actual gateway exists; if not, SMS-dependent features (OTP, alerts) are non-functional in prod (finding).

**Production readiness risks.** Data leak to an unverified phone = **Critical** (privacy). No real SMS gateway means OTP/alerts silently don't send = **High**.

---

### W18 — Service Desk: Complaints & Service Requests

**Purpose.** Prove complaints and service requests can be raised, routed, worked, and resolved across roles.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 18.1 | CUSTOMER_SERVICE | `/complaints` list + status KPIs | — | Renders | Screenshot | |
| 18.2 | CUSTOMER_SERVICE | Open complaint; "Mark Resolved" with note | resolution note | INVESTIGATING→RESOLVED | Screenshot | |
| 18.3 | HR_MANAGER | Raise a service request from HR support | subject, category, priority | SR created OPEN; visible in admin service-requests queue | Screenshot | |
| 18.4 | CUSTOMER_SERVICE | Work the SR to closure | status updates | Status transitions; requester notified | Screenshot | |

**Negative & edge cases.** Resolve without note → blocked if required. SR with each priority/category → routes correctly. Member-raised complaint (if available) → appears.

**Production readiness risks.** Lost/unrouted complaints = **Medium–High** (client SLA). Note: `Case Management` report (R-19) has no backing module — confirm scope.

---

### W19 — Analytics, Strategic-Purchasing Console & the 34 Reports + Exports

**Purpose.** Prove dashboards render real figures, drill-downs resolve, and every report exports data that matches the screen.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 19.1 | SUPER_ADMIN/REPORTS_VIEWER | Strategic purchasing console | — | Portfolio MLR, covered members, alerts render | Screenshot | |
| 19.2 | " | Alerts inbox, board-pack, parity, risk workbench | — | All render; board-pack PDF generates `⚠ PDF risk` | Screenshot/PDF | |
| 19.3 | " | Renewals pipeline → drill-down a scheme | group | Detail resolves (incl. **individual** schemes) `⚠ known-risk DEFECT-012 (404 for individual)` | Screenshot | |
| 19.4 | " | Scheme drill-down (e.g. Bamburi) | — | MLR, contribution vs claims | Screenshot | |
| 19.5 | " | Reports hub: 34 reports / 5 categories | — | List renders | Screenshot | |
| 19.6 | " | For EACH report (R-01…R-21+): open, then export CSV and PDF | per report | Report renders; **CSV/PDF contents match on-screen totals**; exported figures reconcile to source records | Screenshot + export file per report | |
| 19.7 | " | Spot-check 3 reports' numbers against underlying records | e.g. membership count, outstanding bills, claims experience | Numbers tie out | Manual reconcile note | |

**Negative & edge cases.** Empty date range / future range → sane empty state. Large date range → completes without timeout (see §10). Report for a scope with no data → empty, not error. Role scoping: REPORTS_VIEWER sees read-only; broker/HR/fund see only own-scope exports. Confirm R-19 (Case management) is absent/labelled, not broken.

**Production readiness risks.** Reports that don't match underlying data = **Critical** (clients make decisions/bill on these). Broken board-pack/report PDF = **High** (client deliverable).

---

### W20 — Fraud Alerts & Override Queue

**Purpose.** Prove deterministic fraud rules fire, alerts can be worked, and overrides are controlled and audited.

| # | Role | Action | Test data | Expected result | Evidence | P/F |
|---|---|---|---|---|---|---|
| 20.1 | MEDICAL_OFFICER | Fraud desk: alerts list with rules fired | — | Alerts with rule codes/scores | Screenshot | |
| 20.2 | MEDICAL_OFFICER | Dismiss / action an alert with reason | reason | State changes; audit recorded | Screenshot | |
| 20.3 | MEDICAL_OFFICER | Overrides queue + patterns dashboard | — | Render; override requires reason code | Screenshot | |
| 20.4 | MEDICAL_OFFICER | Create an override on a flagged claim | override type + reason | OverrideRecord created; claim proceeds; immutable audit | Screenshot | |

**Negative & edge cases.** Override without reason code → blocked. HARD-rule claim cannot be approved without override. Confirm append-only fraud audit (per AICARE_TODO F-04) — if not implemented, overrides may be editable (finding).

**Production readiness risks.** Unaudited/editable overrides defeat fraud controls = **High**. Advanced fraud layers (configurable rules, anomaly batch, investigations) are unimplemented — confirm whether contractually required (§13).

---

### W21 — Background Jobs & Scheduled Automation

**Purpose.** Prove the BullMQ worker and its 13 jobs run, are idempotent, and fail safely.

**Preconditions.** Worker running (`npm run worker`); Redis available. Access to job logs (verify-only).

**Jobs to test (each: trigger → observe effect → confirm idempotency on re-run):** analytics-refresh, billing-run, commission-calc, commission-reconciliation, fund-balance-alert, intake-allocation, lapse-detection, membership-activation, preauth-escalation, quotation-expiry, renewal-reminder, report-generation, sla-breach, suspension-check.

| # | Action | Expected result | Evidence | P/F |
|---|---|---|---|---|
| 21.1 | Confirm worker boots and connects to Redis | No connection errors; queues ready | Log capture | |
| 21.2 | Trigger lapse-detection with an overdue member | Member →LAPSED; notification queued | Before/after + log | |
| 21.3 | Trigger membership-activation for a future-dated member | Activates on due date | Log | |
| 21.4 | Trigger quotation-expiry on an old SENT quote | →EXPIRED | Screenshot | |
| 21.5 | Trigger renewal-reminder / sla-breach / preauth-escalation | Correct notifications/escalations | Logs/notifications | |
| 21.6 | Trigger billing-run + commission-calc | Invoices/commissions generated; re-run does NOT double | Reconcile | |
| 21.7 | Trigger fund-balance-alert on a depleted fund | Alert raised | Screenshot | |
| 21.8 | Kill Redis mid-run / stop worker | App still serves; queued emails/jobs resume on restart; no data corruption | Note behaviour | |

**Negative & edge cases.** Re-running any job must be idempotent (no duplicate invoices/commissions/lapses). Job failure → retry/backoff; poison messages don't block the queue. With worker DOWN: confirm which features silently degrade (queued email, escalations) — these are operational risks.

**Production readiness risks.** Non-idempotent billing/commission jobs = **Critical** (double charges). Jobs that silently stop when Redis/worker is down = **High** (members never lapsed, reminders never sent) — needs monitoring/alerting.

---

### W22 — HR Portal Employer Self-Service

**Purpose.** Prove an employer HR manager can manage their group within scope only.

| # | Role | Action | Expected result | Evidence | P/F |
|---|---|---|---|---|---|
| 22.1 | HR_MANAGER | Dashboard (members, trend, balance) | Renders for own group only | Screenshot | |
| 22.2 | HR_MANAGER | Roster + member detail | Sees own group members incl. admin edits (cross-portal consistency) | Screenshot | |
| 22.3 | HR_MANAGER | Roster/new + roster import (CSV) | Creates addition endorsements | Screenshot | |
| 22.4 | HR_MANAGER | Endorsements, Invoices, Utilization | Render, scoped | Screenshot | |
| 22.5 | HR_MANAGER | Navigate to `/hr` index directly | Should redirect to `/hr/dashboard`, not 404 `⚠ known-risk DEFECT-013` | Screenshot | |

**Negative & edge cases.** HR of group X tries (URL) to open group Y member → Access Denied. CSV with bad rows → per-row errors.

**Production readiness risks.** Cross-employer data leakage = **Critical**. /hr 404 prefetch on every page = **Low–Medium** (noise + a broken direct link).

---

## 5. Visual and UI Testing Plan

**Goal.** Catch rendering, layout, font, and accessibility problems that make the product look unfinished or unusable to the client — across OS, browser and screen size.

**Targets (every portal's primary screens):** login; admin dashboard, members list + detail, claims list + detail + wizard, quotation detail + bind, settlement, reports hub + a rendered report; broker dashboard; HR dashboard + roster; fund dashboard + statement; member dashboard, benefits, wallet, documents; every modal/dialog (issue card, confirm transfer, dismiss alert, settlement approve); all data tables; all forms in validation-error state.

**For each target, on each environment in §6, check and record:**

- **Font rendering** — especially on **Windows** (Chrome/Edge/Firefox): confirm the Geist/brand font loads (no fallback-to-Times flash), no clipped diacritics, consistent weight/anti-aliasing vs macOS. Capture a side-by-side Windows vs macOS screenshot of the dashboard and a data-heavy table.
- **Alignment** — table columns, form labels/inputs, card grids, KPI tiles aligned; no off-grid elements.
- **Text overflow / truncation** — long member/group/provider names, long benefit category labels, currency with many digits (KES millions), long email addresses — must wrap or ellipsis, never overlap or break layout.
- **Truncated labels / i18n width** — buttons and nav don't clip.
- **Broken icons / missing images** — Lucide icons render; QR member card renders; Leaflet provider map tiles load; no broken-image placeholders; member documents/logos load (note DEFECT-017).
- **Layout shift (CLS)** — content doesn't jump as data/fonts load.
- **Modals & dropdowns** — open/close, focus trap, click-outside, scroll-lock, z-index (not behind content), positioned within viewport on mobile.
- **Tables & long text** — horizontal scroll vs responsive collapse; sticky headers; pagination; sorting controls visible.
- **Forms with validation errors** — error text is visible, associated with the field, color-and-text (not color alone), doesn't shift layout.
- **Print / PDF / export views** — letters, quotation PDF, debit note, board pack, provider/fund statements, report PDFs, CSV exports — open correctly and are laid out for the page (note the active PDF-on-Vercel risk).
- **Dark/light mode** — confirm whether dark mode exists (`TenantThemeInjector` suggests tenant theming); if so, test both; if not, record as not-supported.
- **Empty states** — lists with no data show a sane message, not a blank/broken panel.
- **Loading/pending states** — buttons show pending/disabled during server actions (directly tied to the double-submit defects).

**Accessibility basics (WCAG-lite):** keyboard-only navigation through login + one full workflow (tab order logical, no traps); visible focus rings; color contrast on text/buttons/badges (status pills) meets AA; all inputs have labels; error messages announced; images have alt text; modals return focus on close.

**When a visual issue is found, record:** page/screen name, browser, OS, device/screen size, user role, steps to reproduce, expected appearance, actual issue, and screenshot filename (naming: `<screen>_<browser>_<os>_<width>_<role>.png`).

---

## 6. Cross-Browser and Device Testing Plan

**Browser matrix:** Chrome (latest), Edge (latest), Firefox (latest), Safari (latest, macOS/iOS). Run the **smoke set** (login per role + one core workflow each: claim capture, quotation, member dashboard, report export) on all four; run the **full set** on Chrome + one of Edge/Safari.

**Operating system matrix:** Windows 10/11 (priority — font rendering), macOS (latest), iOS (Safari), Android (Chrome).

**Device / screen-size matrix:** mobile 390px (member portal + PWA install prompt + swipe nav — confirmed working in prior UAT, re-verify), tablet 768–1024px, laptop 1366–1440px, desktop 1920px+. Confirm no horizontal overflow at any width; admin tables remain usable on tablet.

**Network conditions:** normal; throttled "Slow 3G" (DevTools) — confirm spinners/skeletons, no duplicate submissions on slow server actions, no infinite spinners (note member preauth "Submitting…" stall); offline — PWA/member portal degrades gracefully.

**Session & navigation behaviour:** session timeout while on a form (does work survive or is there a clean re-auth?); browser refresh mid-workflow (wizard step state); Back/Forward button after submit (no resubmission, no stale data); multiple tabs (two tabs of the same portal stay consistent); deep-link to a protected page when logged out → login then return.

**Concurrency & resubmission:** two users editing the same record (last-write behaviour / lock); repeated form submission via double-click and via Back-then-resubmit (ties to DEFECT-003/007); two browsers as the same user.

**Limits & volume:** file upload size/type limits on KYC, claim docs, reimbursement proof, bank statement, claims Excel import (try oversized, wrong MIME, zero-byte, and a legitimate large file); large data sets (claims list 753+, members 249+ — pagination, search, export performance); a report over a wide date range.

---

## 7. Security and Permissions Testing Plan

Production-readiness security pass (not deep pentest). Log every finding at the appropriate severity.

**Authentication.** Generic error messages (no user enumeration); password hashing is bcrypt (verify-only); confirm presence/absence of login rate-limiting & account lockout; disabled (`isActive=false`) users cannot log in; temp-password change enforcement.

**Session handling.** JWT session — tamper with the session cookie/JWT (alter role claim) → must be rejected (signature check); session expiry actually logs out; logout invalidates; no sensitive data in the JWT readable client-side beyond what's needed (it carries role/tenantId/permissions — confirm acceptable).

**Role-based access control (matrix in §2.2).** For each role, attempt:
- **Direct URL access** to every other portal's pages (admin, broker, hr, fund, member) → Access Denied, never render.
- **Direct URL access** to admin sub-pages (settlement, settings/users, fraud, brokers) as non-privileged staff (e.g. CLAIMS_OFFICER → /settlement, /settings) → blocked per fine-grained permissions.
- **tRPC/REST mutation** the role lacks (e.g. member calling an admin mutation, claims officer calling a finance settlement mutation) → server rejects with FORBIDDEN, not just hidden UI. Capture the request/response.

**Object-level authorization (IDOR).** As MEMBER_USER, change the id in member URLs/API calls (member detail, document, health-vault, claim drill-down, wallet) to another member's id → must be denied. As BROKER_USER/HR_MANAGER, request another broker's/employer's group/quote/member by id → denied. This is the highest-value security test for this system.

**B2B API (`/api/v1/*`).** Call eligibility/benefits/claims/preauth/upload with: no key → 401; wrong key → 401; the default dev key `av-slade360-dev-key` → **must be rejected in production** (if accepted, Critical); valid key but ineligible member → 403. Confirm the key is not logged.

**Multi-tenant isolation.** If more than one tenant exists, confirm no cross-tenant data is returned anywhere (members, claims, reports). If single-tenant, record as such.

**Password reset behaviour.** Reset doesn't reveal whether an account exists; temp passwords are single-use/expiring where applicable; admin reset is itself permission-gated and audited.

**Sensitive data exposure.** No PII/PHI or financial data in URLs that get logged; no secrets in client bundles; error pages/digests don't reveal stack traces or DB details to end users (the "Digest" crashes show a generic page — confirm no stack leaks); console/network responses don't return more fields than the UI needs.

**File upload risks.** Upload an executable/script disguised as PDF/image; confirm type validation and that stored files are served safely (no inline execution); confirm uploads are access-controlled (a member can't fetch another's uploaded doc by URL).

**Export/download permission checks.** Every CSV/PDF export endpoint enforces role+scope (a broker can't export portfolio-wide data; a member can't export another member's statement).

**Admin-only workflows.** Settings/Users/Roles, approval matrix, override, settlement approval — confirm only intended roles reach them and that maker-checker can't be self-satisfied.

**Audit logs.** Confirm AuditLog/ActivityLog capture security-relevant events (logins, role changes, overrides, settlement approvals, member status changes); confirm check-in/fraud audit immutability (append-only guard applied). Verify-only DB check that update/delete on guarded tables fails.

---

## 8. Data Integrity Testing Plan

- **CRUD + archive** for each core entity (member, group, package, claim, provider, broker, invoice): create → read back exactly → edit → confirm persisted after refresh AND logout/login → archive/soft-delete (confirm "never delete" patterns where the schema implies them).
- **Status transitions** — for member, claim, preauth, endorsement, quotation, settlement batch, fund deposit, broker commission: only valid transitions allowed; invalid ones blocked; each transition writes an audit/log row.
- **Required fields & validation** — every create form: omit each required field in turn → blocked; boundary values (max age, max amount, dates) validated.
- **Duplicate prevention** — duplicate group name, member national ID, provider code, broker, claim (same member/provider/date/amount), double-submit of any create action (DEFECT-003/007).
- **Calculated fields** — premium/contribution from rate card; pro-rata on endorsements; co-contribution/member share; commission + WHT + levies; taxes (Stamp Duty/Training Levy/PHCF); admin fee; GL balances; MLR/loss ratio. For each, compute independently and compare. Decimal rounding consistency (no floating drift — `decimal.js` is used; verify edge cents).
- **Totals & summaries** — list KPI totals equal the sum of underlying rows; dashboard figures equal detail-page figures (note DEFECT-015 fund mismatch).
- **Reports match records** — §19.7; reconcile at least membership, outstanding bills, claims experience, commission, fund utilisation.
- **Persistence** — data survives refresh, logout/login, and (verify-only) a server restart.
- **Cross-role visibility** — a change made in admin shows correctly in HR/broker/fund/member views (and vice versa) with correct scoping.
- **Exported data = on-screen data** — open each CSV/PDF and diff key columns/totals against the screen.
- **Partial/abandoned workflows** — start a quote/claim/endorsement/settlement and abandon midway → no orphaned/half-committed records that block later actions (directly relevant to the crash-after-partial-success defects).

---

## 9. Integration and Notification Testing Plan

For each integration: trigger the action, state the expected external event, how to verify it, what should happen on failure, whether the user sees a useful message, and whether retry/recovery is possible.

| Integration | Trigger | Expected external event | How to verify | On failure | User message? | Retry/recovery? |
|---|---|---|---|---|---|---|
| **Email (SMTP/Nodemailer, queued)** | Member welcome, lapse, reinstatement, complaint resolution, settlement, notifications | Email sent from `EMAIL_FROM` via real SMTP | Check recipient inbox / SMTP provider logs / `Correspondence.status=SENT` (verify-only) | Queue retains job; Correspondence not marked SENT | Should not block UI | Re-process queue; resend | 
| **M-Pesa (Daraja) — STUB** | Member wallet co-pay; reimbursement payout | Confirmation validated against Daraja | **Stub returns unverified** — verify the invoice is NOT marked paid on a fake/any code; clear "manual verification required" message shown | N/A (always unverified) | Yes — must tell user it's pending manual verify | Manual confirmation path documented | 
| **IPRS (national ID) — STUB** | Member/broker KYC | ID validated against IPRS | **Stub returns valid w/ no data** — confirm a manual verification gate is enforced and visible, not silent auto-pass | N/A | Operator note shown | Manual KYC | 
| **SMS** | OTP/alerts, SMS member-query reply | Outbound SMS via gateway | Confirm a real gateway is wired; check delivery to a handset | If no gateway, feature silently dead — flag | Should indicate failure | Retry | 
| **USSD** | Member dials shortcode | Session served via aggregator | Simulate webhook (§17); confirm aggregator mapping for live | Graceful menu error | Yes | N/A | 
| **MinIO storage** | Any upload (KYC, claim doc, proof, statement) | Object stored in bucket; retrievable | Upload then re-open the file; (verify-only) object exists | Upload error surfaced; no broken link later | Yes | Re-upload | 
| **PDF generation (Puppeteer/react-pdf)** | Letters, quotation PDF, debit note, board pack, statements, report PDF | PDF streamed to browser | Open each PDF `⚠ HIGH RISK — was 500 on Vercel` | Currently full-page crash — must become a clean error at minimum | Must be useful, not a digest crash | Retry after fix | 
| **Redis / BullMQ worker** | Any queued job/email | Job processed by worker | Worker logs; effect observed | If down, jobs/email silently stop | Needs ops alerting | Resume on restart | 
| **Slade360 / `/api/v1`** | Provider posts claim/eligibility | Claim/eligibility processed | §8.7–8.10 | 401/403/400 as appropriate | JSON error | Re-POST | 

**Notification coverage matrix** — for each event (member created, card issued, claim approved/declined, preauth decision, settlement, lapse, reinstatement, renewal reminder, SLA breach, fund-balance alert, fraud escalation), confirm: the right recipient(s) get it, on the right channel(s) (EMAIL/SMS/BOTH per template), with correct rendered content (`{{variables}}` resolved, no leftover `{{placeholder}}`), and an in-app `MemberNotification` where applicable.

---

## 10. Performance and Reliability Smoke Tests

Not load testing — sanity checks that the system holds up at realistic data volumes and degrades safely.

- **Page-load smoke** — each portal's heaviest pages (claims list 753+, members 249+, reports hub, analytics console) load within a reasonable budget (record times; flag >5s). Use the `AICARE_PERF_LOGS` instrumentation if enabled.
- **Search & filter** — searching/filtering large lists returns quickly and correctly.
- **Export size** — a large CSV/PDF export completes without timing out (Vercel function timeout is a real risk for Puppeteer PDFs — capture timing).
- **Concurrent users** — 5–10 simulated concurrent sessions across roles performing reads + a few writes → no errors, no cross-session data bleed.
- **Background-job throughput** — a billing/commission run over many groups completes and is idempotent on re-run.
- **Resilience** — with Redis down: app still serves pages, queued work pauses cleanly, resumes on recovery (no lost/duplicated jobs). With DB latency injected (throttle): graceful slowness, no partial writes.
- **Repeated submission** — rapid double/triple submit of create actions produces exactly one record.
- **Memory/stability** — long session navigating many pages: no runaway memory / no accumulating console errors.

---

## 11. Defect and Readiness Log Template

Log every issue with these fields (one row per defect). Keep in a shared sheet; mirror the existing `uat/DEFECTS.md` style.

| Field | Notes |
|---|---|
| **Defect ID** | DEF-### (sequential) |
| **Date found** | YYYY-MM-DD |
| **Tester / agent name** | who found it |
| **Environment** | URL / build / commit |
| **Browser** | + version |
| **OS** | Windows/macOS/iOS/Android + version |
| **Device** | + screen size/width |
| **User role** | role under test |
| **Workflow** | W#/section ref |
| **Step number** | e.g. 9.11 |
| **Severity** | Critical / High / Medium / Low (defs §12) |
| **Priority** | Must fix before client use / Should fix soon / Cosmetic / Future improvement |
| **Summary** | one line |
| **Steps to reproduce** | numbered, from a clean state |
| **Expected result** | |
| **Actual result** | incl. exact error text / digest code |
| **Screenshots / evidence** | filenames |
| **Logs / console errors** | console + network response body + Vercel/worker log if available |
| **Frequency** | Always / Sometimes / Once |
| **Workaround** | if any |
| **Production readiness impact** | what it means for client use |
| **Recommended owner** | Frontend / Backend / DevOps / Product / Design / Unknown |
| **Status** | Open / Under review / Fixed / Retest failed / Closed |

**Pre-seeded known defects to retest** (from prior UAT — confirm fixed or carry forward): DEFECT-001 letters PDF 500; 003 group double-submit; 004 pricing-model dead button; 005 quotation PDF 500; 006 unnamed prospect; 007 create-group no feedback; 009 submit-decision crash; 010 settlement (a/b/c); 012 renewals drill-down 404; 013 /hr 404; 014 stale deploy / fund statement 404; 015 fund KPI mismatch; 016 fund deposit crash; 017 member docs 404; 018 unbranded 404. Plus verify the stubbed integrations (M-Pesa, IPRS, SMS) and insecure defaults (API key, SMTP).

---

## 12. Severity Definitions

- **Critical** — Blocks client use, causes data loss, exposes sensitive data, breaks a core workflow end-to-end, allows financial leakage/fraud, or prevents login/access. *Examples here: settlement can't reach SETTLED; fund can't be initialised; cross-role/IDOR data exposure; fake M-Pesa code marks paid; default API key accepted in prod; GL doesn't balance; non-idempotent billing.*
- **High** — Major workflow fails or produces incorrect results, but a workaround may exist. *Examples: letters/quotation PDFs fail; wrong pro-rata/commission/tax math; silent create double-submits; reports don't match data; SMS gateway not wired.*
- **Medium** — Partial failure, confusing behaviour, broken validation, poor error handling, non-critical workflow friction. *Examples: submit-decision crash instead of validation; no-feedback actions; member docs 404; preauth "Submitting…" stall.*
- **Low** — Cosmetic: minor visual issue, typo, spacing, alignment, copy/grammar, minor browser-specific quirk. *Examples: "0 lifes"→"lives"; "scheme have"→"has"; unbranded 404; "— · —" headers.*

---

## 13. Open Questions and Assumptions

1. **Client scope of unimplemented modules.** Terminology Engine, advanced fraud (configurable rules/anomaly/investigations/append-only fraud audit), biometric liveness + fallback tiers, and Case Management (R-19) are listed unimplemented in `AICARE_TODO.md`. Are any contractually required for this client's go-live? (Determines whether their absence is a blocker or acceptable.)
2. **Stub integrations for go-live.** Is M-Pesa expected to be live (Daraja) at launch, or is manual confirmation acceptable? Same for IPRS national-ID validation. Is there a real SMS/WhatsApp gateway, and which one?
3. **Deployment of record.** Is production the Vercel deployment or the Docker/nginx self-host? Confirm the production build matches the intended commit (DEFECT-014 stale-deploy risk) and that PDF generation is supported in that runtime.
4. **RBAC completeness.** Is the fine-grained `Permission`/`RolePermission` matrix fully seeded for every role, or do some screens rely only on the coarse `UserRole` check? May staff roles view non-admin portals at all? (Affects §2.2 expected cells.)
5. **Audit immutability.** Has `scripts/apply-checkin-audit-guard.mjs` (and any fraud-audit guard) actually been applied to the production DB?
6. **Multi-tenancy.** Is more than one tenant live? If so, isolation testing (§7) must be expanded.
7. **Actuarial sign-off.** Have pricing/co-contribution/MLR calculations been validated by an actuary independent of code?
8. **Required env config.** No `.env.example` exists — request the authoritative list of required production env vars and confirm no insecure defaults remain (`av-slade360-dev-key`, mailtrap SMTP, default Mpesa callback secret).
9. **Data retention.** Check-in/audit retention policy (AICARE_TODO B-09) — what is configured?
10. **Test environment.** Will UAT run against a seeded staging clone or the live client tenant? (Determines whether destructive lifecycle tests in W4/W9/W14 are safe — they should run on disposable data only.)

---

## 14. Recommended Testing Sequence

Execute in this order so that data created early feeds later workflows, and blockers are found before deep testing.

**Phase 0 — Environment & config gate (do first).** Confirm deployment of record and commit (Q3); verify all env vars set and no insecure defaults (§7, Q8); confirm Redis/worker, MinIO, SMTP reachable; confirm seed data present or plan to create it. *If PDF generation or settlement is still broken from prior UAT, flag immediately — these are go-live blockers.*

**Phase 1 — Auth & RBAC (W1, §2.3, §7 access checks).** Prove every role logs in, lands correctly, and is confined. Stop-ship if any role guard or IDOR leaks.

**Phase 2 — Configuration data (W5, W11, W12 setup).** Create packages, rate cards, co-contribution rules, providers + tariffs, brokers + commission schedules — the foundation other workflows need.

**Phase 3 — Sales-to-member pipeline (W2 → W3 → W6).** Quote → bind → enrol → onboard → card → portal → endorsements. Creates the members/groups used downstream.

**Phase 4 — Clinical & claims core (W7 → W8 → W9 → W10 → W20).** Preauth → claims (all channels) → adjudication → fraud → settlement → reimbursement. The financial heart of the system; concentrate effort here.

**Phase 5 — Finance & fund (W13, W14).** Billing, payments, reconciliation, GL, self-funded fund. Reconcile everything to GL.

**Phase 6 — Member & low-bandwidth self-service (W15, W16, W17).** Member portal, wallet/M-Pesa stub safety, check-in/WebAuthn, USSD/SMS.

**Phase 7 — Service, lifecycle, analytics (W4, W18, W19, W22).** Lifecycle transitions (on disposable data), service desk, all reports + exports reconciled, HR portal.

**Phase 8 — Automation & resilience (W21, §10).** Background jobs idempotency, performance smoke, Redis/worker-down behaviour.

**Phase 9 — Cross-cutting sweeps (§5, §6, §8).** Visual/UI across the browser/OS/device matrix; full data-integrity reconciliation; repeat security sweeps.

**Phase 10 — Go/No-Go.** Compile the defect log; apply the checklist below.

### Go / No-Go Readiness Checklist

**No-Go (must ALL be true to proceed) — any unchecked = do not launch:**

- [ ] Every role logs in, is routed correctly, and cannot reach another role's pages/data (UI, direct URL, and API). No IDOR.
- [ ] B2B API rejects missing/invalid/default keys; production key is set and not the dev default.
- [ ] No insecure config defaults in production (API key, SMTP, callback secrets); all required env vars set.
- [ ] Core financial chain works end-to-end: claim capture → adjudication → settlement reaches SETTLED → GL balances. (Currently a known failure — must be fixed.)
- [ ] Self-funded fund can be initialised and managed (if a self-funded client). (Currently a known failure.)
- [ ] Eligibility gating blocks lapsed/terminated/suspended members from claims, preauth, and check-in.
- [ ] Wallet/M-Pesa cannot be marked paid on an unverified/fake confirmation; manual path is clear.
- [ ] No member can see another member's health/financial data; no broker/HR/fund crosses scope.
- [ ] Pricing, pro-rata, co-contribution, commission, tax/levy, and report figures reconcile to manual/source checks.
- [ ] Member-facing PDFs (welcome letter, quotation, debit note, statements) generate, OR a documented interim workaround is accepted by the client.
- [ ] Background billing/commission jobs are idempotent (no double-charging).
- [ ] No Critical or unresolved High defects remain open.

**Should-fix-before-launch (track, but may launch with owner sign-off):**

- [ ] No-feedback/double-submit create actions hardened (disabled states, success redirects).
- [ ] Crash-instead-of-validation paths return friendly errors (submit-decision, settlement self-approve, fund deposit).
- [ ] Renewals drill-down, /hr index, member documents, branded 404 fixed.
- [ ] SMS/USSD/WhatsApp gateways confirmed live (or features clearly marked unavailable).
- [ ] Audit immutability guards applied; audit log covers security-relevant events.

**Cosmetic (post-launch acceptable):** copy/grammar bundle, alignment/overflow nits, empty-state polish.

---

*End of plan. This document defines tests to be executed later; no tests were run and no system state was changed in producing it.*
