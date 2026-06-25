# SEC01 — Unauthenticated attack surface & security headers (§7)

Scope of this run: only what is observable **without a session**. RBAC matrix (§2.2), IDOR (§7 object-level auth), JWT tampering, multi-tenant isolation, export permission checks, and audit immutability all require login and are **BLOCKED** — see [../unresolved_questions/](../unresolved_questions/).

## 1. B2B API key gate — see [../workflows/WF08_b2b_api_auth.md](../workflows/WF08_b2b_api_auth.md)
🔴 **Critical:** default dev key `av-slade360-dev-key` accepted in production (`API_KEY` unset). No-key/wrong-key correctly 401.

## 2. Server-side route guards (unauthenticated)
✅ Admin/broker/fund/hr protected routes return **307 → /login**.
🟠 **Concern:** `/member/dashboard` returns **200** (client-side guard only) — see DEF-004 in [../03_DEFECT_LOG.md](../03_DEFECT_LOG.md). No PII leaked in the unauthenticated body.

## 3. Security response headers (`GET /login`)

| Header | Present? | Value / Note |
|---|---|---|
| `strict-transport-security` | ✅ | `max-age=63072000; includeSubDomains; preload` (good) |
| `content-security-policy` | ❌ | **Missing** |
| `x-frame-options` | ❌ | **Missing** (no clickjacking protection unless covered by a CSP frame-ancestors, which is also absent) |
| `x-content-type-options` | ❌ | **Missing** (`nosniff` not set) |
| `referrer-policy` | ❌ | **Missing** |
| `permissions-policy` | ❌ | **Missing** |
| `x-powered-by` | ✅ absent | Not leaking framework (good) |
| `server` | — | `Vercel` |

**DEF-005 (Medium) — Missing baseline security headers** on a system holding health (PHI) + financial data. No CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. HSTS is correctly set. Recommend adding these via `next.config.ts` headers or middleware before client use.

Evidence: `../evidence/network_logs/GET_login.headers.txt`, `../evidence/network_logs/00_probe_summary.txt` (section E).

## 4. Error-handling exposure
- Default-dev-key probes to `eligibility`/`benefits` returned **500 `{"error":"Internal Server Error"}`** (generic; no stack trace leaked to the client — good) but the 500 itself is an unintended path (DEF-002). The prior run's "Digest …" crash pages (DEFECT-001/005/009/010/016) likewise show generic digests rather than stack traces — consistent with no stack leakage, but the crashes themselves are defects.

## Not tested (blocked — require authentication/DB)
RBAC per-role allow/deny matrix · cross-portal authenticated URL denial · IDOR (member/broker/HR id-swap) · JWT/cookie tampering & signature check · session expiry/logout invalidation · disabled-user login · login rate-limiting/lockout · multi-tenant isolation · file-upload type/exec validation · per-scope export permission checks · audit-log coverage & check-in/fraud append-only guard.
