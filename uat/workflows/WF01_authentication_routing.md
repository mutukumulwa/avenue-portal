# Workflow: W1 — Authentication, Session & Role Routing

## ✅ AUTHENTICATED RUN — 2026-06-25 (local instance, preview browser)

Now executed interactively against the seeded local stack (`http://localhost:3000`).

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 1.2 | Submit empty form | inline validation, no auth call | Native required-field validation ("Please fill in this field."), stays on /login | ✅ PASS |
| 1.3 | Unknown email + pw | generic error | "Invalid email or password. Please try again." (no enumeration) | ✅ PASS |
| 1.4 | Valid email + wrong pw | **same** generic error | Identical message — no user enumeration | ✅ PASS |
| 1.5 | admin valid login | → /dashboard, admin nav | → /dashboard "Dashboard Overview"; real data (247 members, 6 groups, 745 claims/mo); nav: Membership/Clinical/Finance/Insights/Support; SWITCH PORTAL = Admin+Fund | ✅ PASS |
| 1.6 | All 10 seeded roles login + landing | correct portal each | **All 10 OK** (see evidence/network_logs/02_role_login_matrix.txt): staff→/dashboard, broker→/broker/dashboard, hr→/hr/dashboard, fund→/fund/dashboard, member→/member/dashboard | ✅ PASS |
| 1.7 | **member → /dashboard (direct URL)** | Access Denied | → **/unauthorized** "Access Denied" (branded, shield icon, Back to Login) | ✅ PASS (admin portal guarded) |
| 1.10 | Logout | → /login, session cleared | Logout → /login | ✅ PASS |

**Notable:** SUPER_ADMIN has a "SWITCH PORTAL" control exposing the **Fund** portal — answers plan Open Q §2.2 (some staff *can* cross into other portals by design). REPORTS_VIEWER still has **no seeded account** (confirmed gap, plan §2.1 note).

**DEF-004 status:** the admin portal correctly denies a member (1.7 ✅). The original DEF-004 concern (unauthenticated `/member/dashboard` returns 200 / client-side guard) still stands as a defense-in-depth item — the *member* portal's server-side guard is weaker than the admin portal's — but no privilege escalation into admin was possible.

**Still to do for full W1:** per-role §2.2 permission-matrix cells (sub-page access per staff role), IDOR id-swap (member A → member B), JWT/cookie tamper, session expiry, disabled-user login, rate-limiting. Tracked under Phase 1 / [unresolved_questions](../unresolved_questions/).

Evidence: `../evidence/network_logs/02_role_login_matrix.txt`; live screenshots (login error, admin dashboard, Access Denied) captured in session.

---

## Original unauthenticated HTTP-only run (carried forward)

## Test objective
Prove only valid users log in, each role is routed to/confined to its portal, and protected routes are guarded. **In this run only the unauthenticated, server-side guard behaviour could be tested** (no browser → no login, no session, no role landing, no logout, no password reset).

## Preconditions
Live deployment reachable. No credentials entered. `curl` with no redirect-follow, so 3xx guards are visible.

## User roles involved
Unauthenticated visitor only. (Per-role login/landing = BLOCKED, see notes.)

## Environment
`https://avenue-portal.vercel.app` · 2026-06-25 ~02:34 UTC.

## Step-by-step execution log

| Step | Action performed | Expected result | Actual result | Status | Evidence |
|---|---|---|---|---|---|
| 1.1 | GET `/` (unauth) | redirect toward login | **307 → `/dashboard`** (then `/dashboard` → `/login`); 2-hop | ✅ PASS (reaches login) | network_logs/GET__root.* |
| 1.1b | GET `/login` | login form renders | **200**; form is client-rendered (inputs not in server HTML — cannot verify fields via curl) | ⚠️ PARTIAL | network_logs/GET_login.body.html |
| g-1 | GET `/dashboard` (unauth) | redirect to /login | **307 → `/login`** | ✅ PASS | network_logs/GET_dashboard.headers.txt |
| g-2 | GET `/members` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs/GET_members.headers.txt |
| g-3 | GET `/claims` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-4 | GET `/providers` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-5 | GET `/quotations` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-6 | GET `/broker/dashboard` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-7 | GET `/fund/dashboard` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-8 | GET `/hr/dashboard` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-9 | **GET `/member/dashboard` (unauth)** | redirect to /login | **HTTP 200** — no server-side redirect; client-rendered shell (RSC payload references `/login` + `notFound`); **no member PII embedded** in the unauth response | 🟠 **CONCERN** | network_logs/GET_member_dashboard.body.html |
| g-10 | GET `/post-login` (unauth) | redirect | **307 → `/login`** | ✅ PASS | network_logs |
| g-11 | GET `/hr` (unauth) | (route exists?) | **404** (no `page.tsx` at `/hr`) — matches DEFECT-013 | ⚠️ NOTE | network_logs/GET_hr.headers.txt |
| 1.7-ish | GET `/unauthorized` | branded access-denied page | **200** (page exists) — content/branding not visually verified | ⚠️ PARTIAL | network_logs/GET_unauthorized.body.html |

## Defects found
- **DEF-004 (Medium; High if data leaks) — Inconsistent route protection on the member portal.** `/member/dashboard` returns **200 to an unauthenticated request** while every admin/broker/fund/hr route hard-redirects server-side (**307 → /login**). The member portal appears to rely on **client-side** auth enforcement. No PII was found embedded in the unauthenticated HTML (data is presumably gated behind authenticated tRPC calls), but the asymmetry is a defense-in-depth weakness and must be confirmed with an authenticated retest (and an authed-vs-unauthed data diff). Other `/member/*` sub-routes were not probed.
- **DEF (carry-forward) DEFECT-013** — `/hr` index 404s (no redirect to `/hr/dashboard`). Confirmed at HTTP level (route absent in source).

## Partial failures or concerns
- Login **form fields** could not be verified (client-rendered; needs a browser).
- `/unauthorized` returns 200 but its **branding/copy/navigation** were not visually verified.
- The `/` → `/dashboard` → `/login` double-hop is harmless but worth a glance for UX.

## BLOCKED in this run (no browser / no login)
1.2 empty-form validation · 1.3/1.4 invalid-login generic error & no-enumeration · 1.5/1.6 per-role valid login & correct landing (all 11 roles) · 1.7–1.9 cross-portal **authenticated** direct-URL denial · 1.10 logout · 1.11 back/deep-link after logout · 1.12 admin-initiated password reset · 1.13 temp-password forced change · 1.14 session timeout · all negative cases (SQLi/XSS in email, rate-limiting/lockout, concurrent sessions, tampered JWT, disabled user). → see [unresolved_questions/](../unresolved_questions/).

## Screenshots / evidence references
`../evidence/network_logs/00_probe_summary.txt` (section A) and the per-route `GET_*.headers.txt` / `*.body.html` files.

## Notes for retest
Drive all 11 seeded accounts through login → landing → logout in a browser; specifically re-test `/member/dashboard` **with and without** a session to confirm the client-side guard does not leak any member data, and test JWT tamper + session expiry per §7.
