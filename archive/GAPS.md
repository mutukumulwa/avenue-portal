# AiCare Platform — Gap Report
**Audit Date:** 2026-04-10
**Status:** Pending implementation

---

## CRITICAL — Must fix before go-live

- [ ] **HR / Corporate Admin Portal** — Entirely absent. Corporate clients need to manage their own rosters, view invoices, and track payments. Needs a separate route group `(hr)/` scoped to a single group, with: member roster view/add/remove, bulk CSV upload, invoice download, payment status, utilisation summary, and service issue submission.

- [ ] **Benefit hold on pre-auth approval** — Approved pre-auth amounts are not reserved against member benefit balances. Creates over-utilisation risk. On approval, deduct approved amount from `BenefitUsage` atomically, restore on expiry/cancellation.

- [ ] **Suspension blocks eligibility** — Group payment suspension does not gate claim submissions or pre-auth approvals. Check `group.status === "SUSPENDED"` (and member status) at the start of claim and pre-auth create flows.

- [ ] **Fraud detection module** — All 13 checks absent: card sharing, duplicate visits, same-day repeats, impossible provider/member distance, excessive utilisation, suspicious override patterns, backdated activation, ghost dependants, tariff manipulation. Needs rules engine + fraud flag on claim detail + fraud dashboard/report + admin-configurable rules.

- [ ] **File upload / document management** — MinIO is in Docker but no SDK integration exists (`@aws-sdk/client-s3` or `minio` npm package not installed). No documents can be attached to claims, pre-auths, endorsements, or members. Needs: SDK setup, upload API route (`/api/upload`), `<FileUpload>` component, and download links on all detail pages.

- [ ] **Email / SMS not actually sent** — All notifications `console.log()` only. Needs Nodemailer (email) and Africa's Talking (SMS) wired into `notification.service.ts`. Templates already defined.

- [ ] **Duplicate member detection** — No uniqueness check on National ID, phone, or name+DOB at member create. Add validation in `/members/new/actions.ts` before Prisma create.

---

## HIGH PRIORITY — Should fix before go-live

- [ ] **Background job queue (BullMQ + Redis)** — 5 job files exist but nothing executes them. Install `bullmq`, connect to Redis (already in Docker), register jobs: billing-run (1st of month), renewal-reminders (daily), suspension-check (daily), commission-calc (month-end), report-generation (weekly).

- [ ] **PDF generation** — Invoices, quotations, and commission statements cannot be downloaded. Install `@react-pdf/renderer` or `puppeteer`. Needed for: invoice PDF, quotation PDF, receipt PDF, commission statement PDF.

- [ ] **Group edit page** — `/groups/[id]/edit` does not exist. Create page + server action to update: name, industry, address, contact person, email, phone, package, payment terms, status, notes.

- [ ] **Member edit page** — `/members/[id]/edit` does not exist. Create page + server action to update: name, DOB, gender, ID number, phone, email, status, notes.

- [ ] **QR code on member cards** — Required for facility identity verification. Install `qrcode.react`. Generate QR encoding member number on the `InsuranceCard` component.

- [ ] **REST API for SMART / Slade360** — tRPC is internal only. External facility systems need REST endpoints. Create `/api/v1/eligibility`, `/api/v1/benefits`, `/api/v1/preauth`, `/api/v1/claims` with API key authentication.

- [ ] **Endorsement financial impact → billing** — Approved endorsements calculate pro-rata but do not auto-create billing adjustment lines. On `APPLIED` status, create an `Invoice` line item (or adjustment) for the `proratedAmount`.

- [ ] **Search bars on Providers and Brokers list pages** — Pattern already built (`SearchFilterBar` component). Apply to `/providers/page.tsx` (search by name/type/county, filter by tier/status) and `/brokers/page.tsx` (search by name, filter by status).

- [ ] **Audit log viewable in UI** — `AuditLog` model exists and is partially written. Create `/settings/audit-log` page with filters: user, module, date range.

- [ ] **AuditLog written consistently** — Most server actions do not write to `AuditLog`. Add writes on every create/update/delete mutation across all server actions.

---

## MEDIUM PRIORITY — Fix post-launch

- [ ] **`PROSPECT` group status** — Schema uses `PENDING` instead of `PROSPECT`. Add to `GroupStatus` enum to distinguish sales pipeline prospects from onboarded-but-not-active groups.

- [ ] **`REVISED` quotation status** — Add to `QuotationStatus` enum. Standard when a quote is renegotiated after being sent.

- [ ] **Age-banded pricing in calculator** — Schema has `ageBands JSON` on Quotation. Calculator UI ignores this and always uses flat rate. Build age-band input table in Step 2 (Census) and compute blended rate in Step 4 (Pricing).

- [ ] **Tariff validation in claim adjudication** — `ProviderTariff` records exist but the adjudicator never compares billed amount against the contracted rate. Add check in claims service on approval.

- [ ] **Pre-auth rules per package** — `BenefitConfig` stores service data but the claim create form does not check whether a pre-auth was required. Gate claim submission: if benefit.requiresPreauth and no linked pre-auth, block or flag.

- [ ] **CSV bulk member upload** — Groups with many members must be entered one by one. Add a CSV upload form on the group detail page or `/members/import`. Parse CSV server-side, validate, batch-create with duplicate checking.

- [ ] **Complaint submission and tracking** — No complaints module. Create `Complaint` model with: memberId, groupId, category, description, status (OPEN/IN_PROGRESS/RESOLVED/CLOSED), resolution notes. Add `/complaints` route with list + detail + create.

- [ ] **Report export (CSV / PDF)** — Reports render in browser but cannot be downloaded. Add CSV export (stringify query results) and PDF export (Puppeteer screenshot or React PDF) buttons to each report page.

- [ ] **`.env.example` file** — Missing. Create with all required keys documented (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, MINIO_*, REDIS_URL, SMTP_*, AFRICASTALKING_*).

- [ ] **Tenant-driven CSS variable injection** — Brand colors are hardcoded in `tailwind.config.ts`. To white-label for a second client, load tenant branding from DB on layout render and inject as CSS variables (`--color-primary`, etc.) via a `<style>` tag in `layout.tsx`.

- [ ] **Role-level route guards within admin** — Any authenticated admin role can access any admin route. Add per-route role checks (e.g., only CLAIMS_OFFICER/UNDERWRITER can access `/claims/[id]` approve action; REPORTS_VIEWER gets read-only).

- [ ] **Chronic disease burden report** — Aggregate claims by ICD-10 chronic condition codes. Show prevalence, cost, and trend per group.

- [ ] **Renewal repricing workbench** — Page per group showing: prior-year claims total, loss ratio, trend, suggested new rate, benefit redesign recommendations based on utilisation. Feeds into quotation creation for renewals.

- [ ] **Member self-service: update contact details** — Member portal has no profile edit. Add form at `/member/profile/edit` to update phone and email (not ID or name — those require endorsement).

- [ ] **Member self-service: complaint/enquiry submission** — Member support page is static. Wire to Complaint model or at minimum an email dispatch.

- [ ] **Terminology audit** — Quotation calculator still uses "Premium" in headings and labels. Replace with "Contribution" in member/broker-facing surfaces.

- [ ] **Medical vs non-medical pre-auth review separation** — Single approval workflow. Add a two-stage review: MEDICAL_OFFICER approves clinical appropriateness, then UNDERWRITER/FINANCE_OFFICER approves cost. Reflect in pre-auth status flow.

- [ ] **Inactive provider gate** — Claim create does not check `provider.status`. Block claim submission if provider is SUSPENDED or TERMINATED.

- [ ] **Member card issuance / SMART card** — No physical or digital card dispatch workflow. Track card issuance status on member record.

- [ ] **Session expiry / refresh** — JWT expiry configured but not verified to actually block stale sessions. Test and confirm.

- [ ] **Responsive layout verification** — Tailwind responsive classes present but not tested on mobile/tablet. Key surfaces to verify: dashboard, member profile tabs, endorsement form.
