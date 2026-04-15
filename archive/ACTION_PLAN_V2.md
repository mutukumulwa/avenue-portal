# AiCare — Action Plan V2
**Created:** 2026-04-11
**Source:** GAPS.md audit + manual code review
**Previous plan (ACTION_PLAN.md):** All 6 items complete ✅

---

## PHASE 1 — Critical (Block go-live)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 1.1 | **Duplicate member detection** — validate National ID, phone, name+DOB at `/members/new` before create | GAPS | S |
| 1.2 | **Suspension eligibility gate** — block claim + pre-auth create if group or member status is SUSPENDED/LAPSED/TERMINATED | GAPS | S |
| 1.3 | **Group edit page** — `/groups/[id]/edit` with full field update | GAPS | S |
| 1.4 | **Member edit page** — `/members/[id]/edit` with field update | GAPS | S |
| 1.5 | **Provider add page** — `/providers/new` (currently no way to add from UI) | Code review | S |
| 1.6 | **Pre-auth adjudication actions** — approve/partial-approve/decline buttons on `/preauth/[id]` | Code review | M |
| 1.7 | **Benefit usage reservation on pre-auth approval** — deduct approved amount from BenefitUsage atomically | GAPS | M |
| 1.8 | **HR / Corporate Admin Portal** — `(hr)/` route group: roster, invoices, utilisation, service requests | GAPS | L |
| 1.9 | **Search bars on Providers and Brokers list pages** | GAPS | S |
| 1.10 | **Tariff validation in adjudication** — compare billed vs contracted rate on claim approval | GAPS | M |

---

## PHASE 2 — High Priority (Ship soon after launch)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 2.1 | **Dashboard charts** — claims trend, premium collected, loss ratio (Recharts) | Code review | M |
| 2.2 | **Reports module** — real data behind each report type (utilisation, claims, financial, broker) | Code review | M |
| 2.3 | **Audit log UI** — `/settings/audit-log` filterable by user/module/date | GAPS | S |
| 2.4 | **AuditLog written consistently** — add writes to all server actions | GAPS | M |
| 2.5 | **PDF generation** — invoice, quotation, receipt, commission statement | GAPS | M |
| 2.6 | **CSV bulk member upload** — on group detail or `/members/import` | GAPS | M |
| 2.7 | **QR code on member cards** — encode member number for facility scanning | GAPS | S |
| 2.8 | **Endorsement → billing auto-adjustment** — create adjustment line on APPLIED endorsement | GAPS | M |
| 2.9 | **Role-level route guards** — per-route role checks on sensitive actions | GAPS | M |
| 2.10 | **Pre-auth gate on claim submission** — block/flag if benefit requires pre-auth and none linked | GAPS | S |

---

## PHASE 3 — Medium Priority (Post-launch polish)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 3.1 | **File upload / document management** — MinIO SDK, `/api/upload`, `<FileUpload>` component | GAPS | L |
| 3.2 | **Email / SMS notifications** — wire Nodemailer + Africa's Talking into notification.service.ts | GAPS | M |
| 3.3 | **Background job queue** — BullMQ + Redis: billing-run, renewals, suspension-check, commission | GAPS | L |
| 3.4 | **REST API for SMART/Slade360** — `/api/v1/eligibility`, `/api/v1/benefits`, `/api/v1/preauth`, `/api/v1/claims` + API key auth | GAPS | L |
| 3.5 | **Fraud detection module** — rules engine, 13 checks, fraud flag on claim, fraud dashboard | GAPS | XL |
| 3.6 | **Age-banded pricing in quotation calculator** | GAPS | M |
| 3.7 | **Renewal repricing workbench** — loss ratio, trend, suggested rate per group | GAPS | L |
| 3.8 | **Complaint module** — `Complaint` model, `/complaints` list+detail+create | GAPS | M |
| 3.9 | **Chronic disease burden report** — ICD-10 prevalence, cost, trend per group | GAPS | M |
| 3.10 | **Member self-service: profile edit + complaint submission** | GAPS | S |
| 3.11 | **Tenant CSS variable injection** — load branding from DB, inject as CSS vars for white-labeling | GAPS | M |
| 3.12 | **`PROSPECT` group status + `REVISED` quotation status** enum additions | GAPS | S |
| 3.13 | **Medical vs non-medical pre-auth two-stage review** | GAPS | M |
| 3.14 | **`.env.example` file** | GAPS | S |
| 3.15 | **Report export (CSV / PDF)** | GAPS | M |

---

## Effort key
- **S** = Small (< 2 hrs, 1–3 files)
- **M** = Medium (half day, 4–8 files)
- **L** = Large (full day+, multiple services)
- **XL** = Extra large (multi-day, new subsystem)

---

## Recommended start order
Start with Phase 1 items 1.1 → 1.5 (all Small, all unblock real daily operations), then 1.6 + 1.7 (pre-auth adjudication — clinical critical), then 1.8 (HR portal — client-facing critical).
