# Medvex TPA Platform — System Architecture (as-built)

**Engagement:** Production Readiness Assessment, started 2026-07-04
**Build assessed:** `main` @ `1cd23a8` (2026-07-03)
**Author:** Independent systems-analysis engagement (Claude, 2026-07-04). Describes the system **as it currently exists**, verified against source code and the running application. Supersedes-nothing: the June 2026 UAT records in `uat/*.md` (flat files) describe the pre-rebrand "Avenue Portal" build and are retained as history.

---

## 1. What the system is

Medvex (package name `aicare`) is the production operations platform for a **licensed Third-Party Administrator (TPA)** entering the Uganda market via the Medvec partnership. It administers health-benefit schemes on behalf of client payers (insurers, HMOs, employer self-funded schemes). Revenue is **admin fees**, not premiums. The platform originated as the Kenyan "Avenue/AiCare" provider-sponsored-health-plan product and was pivoted + rebranded; substantial Kenya-era seed data and naming remains (KES amounts, Kenyan providers/groups in the seed, Nairobi counties) while the target market copy is Uganda (UGX base currency, `.co.ug` emails, Uganda districts).

Primary spec documents (in repo root, authoritative for intent):
- `AICARE_TPA_UGANDA_SPEC.md` — the TPA/Uganda feature spec (tenancy, offline-first, modules).
- `DIGITAL_CONTRACT_MODULE_SPEC.md` — provider-contract digitisation + contract-driven claims pricing.
- `TPA_FEEDBACK_WORKPLAN.md` — July 2026 remediation (claims queues, offline work codes, PA-attach, case management, tiers, capitation).
- `MEDVEX_BUILD_LOG.md`, `CONTRACT_MODULE_BUILD_LOG.md` — chronological build logs incl. environment warnings.
- `FEATURE_STATUS.md` — the *self-declared* list of incomplete/stubbed features (8 items as of 2026-07-03).

## 2. Technology stack

| Layer | Technology |
|---|---|
| Web framework | Next.js 15/16 (App Router, server components + server actions), React 19, Turbopack dev |
| Language | TypeScript throughout |
| API layers | tRPC 11 (`/api/trpc`, 30 routers) for the SPA-ish admin surfaces; REST route handlers under `/api/*` for auth, uploads, exports, B2B (`/api/v1/*`), USSD/SMS, M-Pesa callback, WebAuthn |
| ORM / DB | Prisma 7 (pg driver adapter) → PostgreSQL 16. **6,219-line schema, ~200 models, 178 tables** |
| Jobs / queues | BullMQ on Redis (`src/server/jobs/worker.ts`, run via `npm run worker`) — 19 job modules |
| Object storage | MinIO (S3-compatible) via `src/lib/minio.ts`; uploads through `/api/upload` |
| Auth | NextAuth v5 (credentials + Prisma adapter), bcrypt password hashes; WebAuthn (SimpleWebAuthn) for member biometric check-in; TOTP lib present for 2FA |
| PDF | Puppeteer/Chromium (local exec path or `@sparticuz/chromium` on Vercel) + `@react-pdf/renderer` + `pdf-lib` |
| Spreadsheets | exceljs, papaparse (imports/exports); hyperformula + pyodide (custom pricing models) |
| UI | Tailwind 4, Radix primitives, lucide icons, recharts, react-leaflet maps, sonner toasts |
| Deploy | Dockerfile + docker-compose (app/db/redis/minio) or Vercel (build runs `scripts/db-sync.mjs` = `prisma db push` against prod, then `next build`) |

## 3. Deployment topology & environments

- **Local UAT (this engagement):** Homebrew Postgres 16 / Redis / MinIO on localhost; app via `npm run dev` on :3000; `.env` at repo root (dated 2026-06-25, from prior UAT).
- **Production:** previously Vercel (`avenue-portal.vercel.app`) per June UAT; the build script pushes schema to the production DB on **every build** (`db-sync.mjs`) — i.e. schema deploys are implicit, not gated migrations.
- ⚠️ **Provisioning caveat (verified):** the 23 Prisma migrations in `prisma/migrations/` are historical and **do not reproduce the current schema**; recent modules (contracts, cases, offline auth, wellness, cross-border…) were applied via `prisma db push`/hand-written psql DDL. `prisma migrate reset`/`migrate dev` must not be run (documented in `MEDVEX_BUILD_LOG.md` §1). A fresh environment is built with `db push` + `prisma db seed`.

## 4. Module map (admin console route groups)

All admin routes live in `src/app/(admin)/`, guarded per-page by `requireRole()` (`src/lib/rbac.ts`). Portals: `(hr)/hr/*`, `/broker/*`, `/fund/*`, `/member/*`, auth at `(auth)/login`.

| Domain | Routes | Notes |
|---|---|---|
| Overview | `/dashboard` | KPI cards per role |
| Membership | `/clients`, `/groups`, `/members` (+ import, card, letters, onboarding, reinstatement), `/onboarding-queue`, `/endorsements`, `/packages` (+ builder, rate-matrix) | Client → Scheme(Group) → Tier → Member hierarchy |
| Clinical | `/cases` (case management, NEW Jul-2026), `/claims` (+ queues, new, import, reimbursement), `/preauth`, `/lou` (letters of undertaking), `/offline-capture`, `/offline-auth` (work codes), `/approvals`, `/assessor-queue`, `/overrides` (+ patterns), `/cross-border`, `/wellness`, `/check-ins`, `/settings/exceptions` | Claims status machine INCURRED→…→PAID; PAs attach to claims (no longer convert) |
| Provider network | `/providers` (+ branches), `/contracts` (+ new, import, queues, analytics; per-provider contract detail) | Digital contract module: versions, rules, packages, exclusions, reconciliation |
| Finance | `/billing` (+ admin-fees, funds, gl, gl/ledger, reconciliation), `/settlement`, `/quotations` (+ assess/bind/build/calculator), `/brokers` | GL double-entry, provider settlement batches, quotation→bind pipeline |
| Insights | `/analytics` (strategic purchasing, alerts, board-pack, parity, renewals, risk, scheme/provider drill-downs), `/reports` (34 report types + CSV/PDF export) | Analytics facts refreshed by job |
| Compliance | `/compliance` (register: licences, deposits, directors, indemnity, levy), `/compliance/privacy` (DSRs, consent, breaches, processors) | Uganda DPPA-oriented |
| Support | `/service-requests`, `/complaints`, `/fraud` (+ investigations, rules, check-ins audit) | Fraud engine with rules + alerts |
| Settings | `/settings` (users & roles), `approval-matrix`, `auto-adjudication`, `drug-exclusions`, `terminology`, `fx-rates`, `security` (2FA), `pricing-models`, `audit-log` | RBAC fine-grained tables exist (Role/Permission/UserRoleAssignment w. maker-checker) alongside the coarse `UserRole` enum |

## 5. Portals (non-admin actors)

| Portal | Path | Actor | Highlights |
|---|---|---|---|
| Member | `/member/*` | MEMBER_USER | dashboard, benefits, dependents, documents, facilities, health-vault, notifications, preauth self-service, profile, reinstatement, security (WebAuthn), support, utilization, wallet (co-contribution + mobile money), check-in |
| HR | `/hr/*` | HR_MANAGER (scoped to own employer group) | dashboard, roster (+ member detail, new = endorsement request, CSV import), endorsements, invoices, utilization, support, profile |
| Broker | `/broker/*` | BROKER_USER (scoped to own brokerage) | dashboard, quotations (create), groups, submissions, renewals, commissions, support |
| Fund | `/fund/*` | FUND_ADMINISTRATOR (employer finance officer of self-funded scheme) | dashboard, per-group fund view, claims, statement + export |

## 6. External integration surface

| Integration | Direction | Status (per code + FEATURE_STATUS) |
|---|---|---|
| B2B API `/api/v1/{eligibility,benefits,preauth,claims,sync,upload,hms-batch}` | inbound | Live; API-key auth (`src/lib/apiAuth.ts`); single-tenant key mapping (multi-operator mapping is scaffold — FEATURE_STATUS #6) |
| HMS daily batch | inbound push + poll | Push live (`POST /api/v1/hms-batch`) + manual JSON upload; **poll transport stubbed** (FEATURE_STATUS #2) |
| M-Pesa (member wallet payments) | callback | Sandbox/stub with signature check (`MPESA_CALLBACK_SECRET`); spec intends MTN MoMo/Airtel for Uganda (not built) |
| SMS (offline codes, OTP, member query) | outbound/inbound | **Stub adapter** — no provider configured (FEATURE_STATUS #1); `/api/sms/member-query` + `/api/ussd` handlers exist |
| Email (nodemailer) | outbound | SMTP config expected; local UAT has no real SMTP |
| WebAuthn | inbound | Live (member device registration + check-in verification) |
| PDF generation | internal | Puppeteer local; `@sparticuz/chromium` on Vercel |
| IPRS/NIRA identity, FHIR/EDI, SMS aggregator | — | Not built (external-gated per build log) |

## 7. Background jobs (BullMQ; `npm run worker` required)

Scheduled at worker boot (idempotent): approval escalation; daily jobs (incl. offline-pack generation + HMS poll slot); commission reconciliation; analytics refresh; intake allocation; quotation expiry; membership activation; lapse detection; report generation; admin-fee accrual; fraud scan. Additional modules: billing-run, contract-lifecycle, fund-balance-alert, preauth-escalation, renewal-reminder, sla-breach, suspension-check.
**Operational implication:** without the worker process, approvals never escalate, analytics stay stale, offline packs are not generated, accruals stop — silently.

## 8. Data model spine (Client hierarchy)

```
Tenant (operator = Medvex)                      ← single row today
 └─ Client (insurer | HMO | employer self-funded)  ← "Default Client" seeded
     └─ Group (scheme; FundingMode INSURED|SELF_FUNDED; has GroupBenefitTier*)
         └─ Member (principal|dependant; M…M+7 family sizes; status machine)
Package/PackageVersion → BenefitConfig (per category; FundingModelType FFS|CAPITATION)
Provider → ProviderBranch, ProviderTariff, ProviderContract → ContractVersion
   → PricingRule / ContractPackage / PreauthRule / DocumentationRule / ExclusionRule
   → ExternalTariffTable, OverrideControl, ContractReconciliation
Claim → ClaimLine* (decisions per line), AdjudicationLog, BenefitHold, Settlement batches
PreAuthorization —(attach, many-to-one)→ Claim; ClinicalCase → CaseServiceEntry*, LOU
Finance: Invoice/Payment/PaymentVoucher, ChartOfAccount/JournalEntry/JournalLine,
   SelfFundedAccount/FundTransaction, AdminFeeAgreement/Ledger, Commission* (broker)
Compliance: RegulatoryLicence, SecurityDeposit, DirectorRegister, IndemnityCover,
   ComplianceLevyComputation, ConsentRecord, DataSubjectRequest, BreachIncident
Offline: OfflineWorkAuthorization, OfflineDataPack, SyncOperation, OfflineReservation,
   EligibilitySnapshot
```

Conventions: never-delete (status + effective ranges), maker-checker on sensitive mutations (role assignment, settlement, binding), immutable audit chain (`audit-chain.service.ts`), terminology engine for user-facing vocabulary, multi-currency with FX table (base UGX).

## 9. Authentication & authorization

- **Coarse RBAC:** `UserRole` enum (11 roles) on `User`; every server component/action calls `requireRole(ROLES.X)`. Role sets: ADMIN_ONLY, CLINICAL, FINANCE, UNDERWRITING, OPS, ANY_STAFF, MEMBER, HR, FUND (see `src/lib/rbac.ts`).
- **Fine-grained RBAC (parallel system):** `Role`/`Permission`/`RolePermission`/`UserRoleAssignment` tables with maker-checker role assignment — administered via `/settings`; degree of enforcement in request paths to be verified in testing.
- **Session:** NextAuth JWT; `/post-login` routes users to their portal by role.
- **B2B:** static API key header (env `API_KEY`, insecure dev default if unset — June UAT DEF-001).

## 10. Known-incomplete features (self-declared, FEATURE_STATUS.md 2026-07-03)

1. SMS delivery stubbed (phone read-out is the working channel for offline codes — by design).
2. HMS batch **poll** transport stubbed (push + manual upload live).
3. Contract rule engine does **not** yet drive auto-adjudication (read-only preview panel; manual decision authoritative, guarded by contract ceilings).
4. Capitation **settlement** deferred (setup live; pool not accounted/invoiced).
5. Advanced tariff pricing kinds (`EXTERNAL_TARIFF_REF`, `NET_OF_EXTERNAL`, `CAPITATION`, `AVERAGE_COST_POOL` line-rate types) route to manual review.
6. API-key → tenant mapping single-operator only.
7. One case → one claim (service-layer rule, intentional).
8. Approval matrix fully wired for claim payments only; other action types supported by engine but not initiated from every screen.

## 11. Key assumptions & boundaries

- Single operator tenant; single seeded Client ("Default Client") — true multi-client isolation is schema-ready but operationally unexercised.
- Currency: base UGX with FX table, but most seed/demo data is KES-denominated.
- The system trusts the worker process and Redis availability for all time-based behaviour.
- Local dev/UAT uses stub integrations (SMS/M-Pesa/SMTP); production readiness of those channels is not testable locally beyond stub-safety.
