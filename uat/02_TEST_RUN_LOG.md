# 02 — Master Test Run Log

**Run window:** 2026-06-24 19:10 UTC → 2026-06-25 02:38 UTC
**Target:** `https://avenue-portal.vercel.app` · **Method:** non-destructive `curl` (no login, no data writes)
**Overall coverage:** ~5% of the plan executed (unauthenticated surface only); ~95% **BLOCKED — environment** (no runtime, no browser). Nothing marked passed without evidence captured this run.

## Executed steps

| Plan ref | Area | Result | Evidence / detail |
|---|---|---|---|
| W1 1.1 | `/` redirect | ✅ 307 → /dashboard → /login | [WF01](workflows/WF01_authentication_routing.md) |
| W1 1.1b | `/login` renders | ⚠️ 200, form client-rendered (fields unverifiable via curl) | WF01 |
| W1 g-1..g-10 | Route guards (admin/members/claims/providers/quotations/broker/fund/hr/post-login) | ✅ all 307 → /login | WF01 |
| W1 g-9 | `/member/dashboard` unauth | 🟠 200 (client-side guard only; no PII leaked) | WF01 / DEF-004 |
| W1 g-11 | `/hr` index | ⚠️ 404 (confirms DEFECT-013) | WF01 |
| W1 | `/unauthorized` | ⚠️ 200 (branding not visually verified) | WF01 |
| W8 8.8a/d | `/api/v1/*` no-key | ✅ 401 on all 5 endpoints | [WF08](workflows/WF08_b2b_api_auth.md) |
| W8 8.8b | `/api/v1/claims` wrong-key | ✅ 401 | WF08 |
| W8 8.8c/e | `/api/v1/*` **default dev key** | 🔴 **FAIL — accepted (400/500) on 4/5** | WF08 / DEF-001 |
| W8 | `eligibility`/`benefits` unknown member | 🟠 500 instead of 404 | WF08 / DEF-002 |
| §7 | Security headers (`/login`) | 🟠 HSTS only; CSP/XFO/XCTO/RP/PP missing | [SEC01](security_permissions/SEC01_unauthenticated_surface.md) / DEF-005 |
| §5/19.2 | 404 branding | ⚠️ unbranded default (DEFECT-018) | [VIS01](visual_ui/VIS01_unauthenticated_pages.md) |
| §15.4/18.5 | `/seed-docs/*.pdf` | ⚠️ 404; dir absent in source (DEFECT-017) | VIS01 |

## Blocked areas (environment) — see [unresolved_questions/UQ_blocked_scope.md](unresolved_questions/UQ_blocked_scope.md)
W2, W3, W4, W5, W6, W7, W8(UI/Excel), W9, W10, W11, W12, W13, W14, W15, W16, W17, W18, W19, W20, W21, W22; cross-cutting §5 (visual incl. **Windows**), §6 (browsers/devices), most of §7 (RBAC/IDOR/JWT/session/isolation/upload/exports/audit), §8 (data integrity), §9 (integrations/notifications), §10 (performance). Role-based access: [role_based_access/_STATUS.md](role_based_access/_STATUS.md). Data integrity: [data_integrity/_STATUS.md](data_integrity/_STATUS.md). Integrations: [integrations/INT01_status.md](integrations/INT01_status.md).

## Defects logged this run
DEF-001 (Critical), DEF-002 (Medium), DEF-003 (Low/Med), DEF-004 (Medium/High), DEF-005 (Medium). Plus carry-forward of prior DEFECT-001…018 (status **unverified** this run). See [03_DEFECT_LOG.md](03_DEFECT_LOG.md).
