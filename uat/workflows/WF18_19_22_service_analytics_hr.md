# Workflows W18 (Service Desk) + W19 (Analytics/Reports) + W22 (HR Portal) — LIVE

Environment: `http://localhost:3000` · 2026-06-25 · roles: SUPER_ADMIN, HR_MANAGER (emily.wambui@safaricom.co.ke).

## W19 — Analytics, Reports & Exports

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 19.5 | `/reports` hub | 34 reports / categories | **34 report links**, categories Membership/Clinical/Operational/Financial | ✅ PASS |
| 19.6 | Open Membership report | renders | "Membership List Report", 100 rows on screen, Export CSV/PDF buttons | ✅ PASS |
| 19.6 | **CSV export** `/api/reports/membership/export` | data matches | **200 text/csv, 249 rows** (248 members + header) = full seeded member count; proper columns | ✅ PASS (export = data) |
| 19.6 | **PDF export** `/api/reports/pdf?reportType=membership` | PDF generates | **200 application/pdf, 8 pages, 657 KB, 3.1s** | ✅ PASS — confirms report/board-pack PDF works (DEFECT-001/005 reframing) |
| 19.3 | Renewal pipeline drill — **group** scheme (Safaricom) | detail resolves | "Safaricom PLC" renewal detail renders with KES values | ✅ PASS |
| 19.3 | Renewal pipeline drill — **individual** scheme | detail resolves | **404 inside page shell** | 🔴 **FAIL — DEFECT-012 confirmed open** (individual-scheme renewal drill 404s; group works) |

Evidence: `../evidence/exports/WF19_membership_report.csv`, `../evidence/exports/WF19_membership_report.pdf`.

## W18 — Service Desk (Complaints)

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 18.1 | `/complaints` | list + KPIs | "Complaints Triage": OPEN 1, INVESTIGATING 1, RESOLVED 1 | ✅ PASS |
| 18.2 | Open INVESTIGATING complaint → Mark Resolved + note | → RESOLVED | INVESTIGATING **1→0**, RESOLVED **1→2**; no crash | ✅ PASS |

## W22 — HR Portal

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 22.1 | HR login | → /hr/dashboard | lands on `/hr/dashboard` | ✅ PASS |
| 22.2 | `/hr/roster` scope | only own group | **78 Safaricom members only** (roster 79 rows incl. header); **zero** KCB/EABL/Bamburi/Twiga rows (DB: Safaricom=78) | ✅ PASS — **cross-employer isolation holds (Critical)** |
| 22.5 | `/hr` index direct | redirect to /hr/dashboard | **404** (fetch 404 + 404 page) — does not redirect | 🔴 **FAIL — DEFECT-013 confirmed open** |

## W4 — Member Lifecycle
**Deferred this pass** (destructive transitions need disposable data). The core eligibility-gate property (SUSPENDED/LAPSED/TERMINATED member blocked) was already verified via the B2B API in Phase 4 (403 for SUSPENDED member) — see [WF07_08_20](WF07_08_20_preauth_claims_fraud.md).

## Phase 7 summary
- ✅ Reports hub (34), report render, **CSV + PDF exports both work** (PDF confirms the runtime-config reframing of DEFECT-001/005).
- ✅ Complaint resolution; ✅ HR portal landing + **scoped roster (no cross-employer leak)**.
- 🔴 **DEFECT-012** (individual-scheme renewal drill 404) and 🔴 **DEFECT-013** (`/hr` 404) confirmed **still open** (both Low–Medium).
- ⚠️ W4 destructive lifecycle deferred; W19 full 34-report reconciliation and per-role export scoping remain.
