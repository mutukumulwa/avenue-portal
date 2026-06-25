# Workflows W15 (Member Self-Service) + W16 (Check-In) — LIVE, local seeded instance

Environment: `http://localhost:3000` · 2026-06-25 · role: MEMBER_USER (member.demo.wallet@avenue.co.ke).

## W15 — Member Self-Service

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 15.1 | `/member/dashboard` | member cover/QR/limits | loads (200); member nav (Dashboard, Benefits, Dependents, Utilization, Pre-Auth, Wallet, Documents, Health, Alerts, Check-In, Facilities, Support, Security) | ✅ PASS |
| 15.2 | `/member/benefits` | usage vs limits | "My Benefits": INPATIENT/OUTPATIENT/MATERNITY/DENTAL/OPTICAL with KES limits (e.g. 288,000) | ✅ PASS |
| 15.3/15.7 | dependents / notifications | render | both load (200) | ✅ PASS (load) |
| **15.9 / §15 negative** | **Wallet → Pay with M-Pesa using a FAKE code** (`FAKE-MPESA-CODE-UAT-999`) | **must NOT mark paid** (stub returns unverified) | **Outstanding stays Ksh 5,200; Paid-Through-Wallet stays Ksh 0; status PENDING/awaiting-callback; no crash.** DB: only seeded CONFIRMED rows have real callback receipts (e.g. `RKT900001`); the fake code produced **no CONFIRMED payment** | ✅ **PASS — Critical safety check holds** |
| 15.4 | Documents | plan docs open (not 404) | Links to `/seed-docs/{Safaricom_Benefit_Schedule_2025, Avenue_Member_Benefit_Guide_2025, Safaricom_Group_Contract_2024, PA-MEXP-001_Approval_Letter}.pdf` → **all 404** (`public/seed-docs` absent) | 🔴 **FAIL — DEFECT-017 confirmed (still open)** |

**Critical result:** the M-Pesa co-pay flow correctly refuses to treat a user-entered/fake confirmation code as payment — the invoice stays outstanding and only a real confirmed callback marks it paid. The UI even states the rule explicitly: *"Service should only be treated as paid after AiCare records a confirmed payment callback. A screenshot or SMS alone is not confirmation."* This closes the plan's highest member-portal fraud risk.

**DEFECT-017 (Medium, still open):** member document links point to `/seed-docs/*.pdf` which 404 (directory not in `public/`). Members cannot open plan documents. Reproduced locally (not just a prod artifact).

## W16 — Biometric / Device Check-In (WebAuthn)

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 16.x | `/member/security`, `/member/check-in` | pages render | both 200; Security page shows "Register" (device enrolment); `window.PublicKeyCredential` available | ✅ PASS (render) |
| 16.1–16.5 | Register credential + complete WebAuthn check-in | enrol + assert | **Not executable headlessly** — real platform-authenticator biometrics require a virtual authenticator (CDP WebAuthn) or physical key | ⚠️ BLOCKED — manual-only (plan §16 acknowledges this) |

## Phase 6 summary
- 🟢 **Critical M-Pesa fake-code safety check PASSES** — fake confirmation does not mark paid.
- ✅ Member dashboard, benefits, dependents, notifications render with real data.
- 🔴 **DEFECT-017 confirmed open** — member documents 404 (`/seed-docs/*` missing).
- ⚠️ W16 WebAuthn check-in is manual-only here (headless limitation); pages render and WebAuthn is supported.

## Remaining (not tested this pass)
Facilities cost preview (15.5), health vault add/share + visibility (15.6), utilization claim drill-down (15.8), profile edit persistence (15.10), reinstatement state (15.11); IDOR member-id swap (§7); full WebAuthn with a virtual authenticator.
