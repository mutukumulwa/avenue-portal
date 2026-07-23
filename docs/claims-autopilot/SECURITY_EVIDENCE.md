# Claims Autopilot — Security Isolation & Abuse Evidence (F7.3)

**Plan:** [`CLAIMS_AUTOPILOT_EXECUTION_PLAN.md`](../../CLAIMS_AUTOPILOT_EXECUTION_PLAN.md) §F7.3
**Date:** 2026-07-23 · branch `feat/claims-autopilot` · no secrets in this document.

Every row of the §F7.3 abuse matrix mapped to the code boundary that enforces it
and the automated proof that exercises it. "INT" = real-DB integration suite
(disposable Postgres, real minted `ProviderApiKey`s, real auth path); "UNIT" =
mocked unit suite; "GUARD" = source-scan test that fails the build on
reintroduction.

| # | Probe | Enforced by | Proof |
|---|---|---|---|
| 1 | Missing / bogus API key | `withApiKey` → `getApiCredential` fail-closed (BD-06: no in-source default; constant-time compare) | INT `claim-intake-security` ("missing and bogus keys are 401"); BD-06 prod verification (burned default key → 401) |
| 2 | **Revoked** API key | `ProviderApiKeyService.verify` filters `isActive: true` | INT `claim-intake-security` ("REVOKED key stops working immediately") |
| 3 | Provider A reading/filing against provider B (member / receipt / claim) | Context D12 (derived provider; mismatch rejected), `providerKey` entitlement scoping, receipt lookup `scopeKey` filter, GET claim `providerScopeWhere` (E2E-D02 fix) | INT `claim-intake-api` (un-entitled facility 403 + spoofed providerCode 403 + foreign receipt 404); INT `claim-intake-direct-entry` (portal spoof); E2E-D04 read-scope suites (`tests/api/provider-read-scope`, `provider-preauth-scope`) |
| 4 | Client A vs client B inside one tenant | tRPC `ctx.clientId` confinement on list/get (F5.3); services take `clientId` scope | UNIT `trpc-claims-router` (confined list scope + out-of-scope NOT_FOUND) |
| 5 | Tenant A vs tenant B | Every canonical query is tenant-keyed from the CALLER (context D12: tenant never read from the body); operator API keys must be tenant-bound to write (BD-06) | INT `claim-intake-api` (operator-unbound 403 in UNIT contract tests); context UNIT suite (foreign-tenant provider/member ⇒ authorization) |
| 6 | IDOR on receipt / run / policy ids | Receipt lookup: tenant + provider-scope filter, non-enumerating 404, misses hash-chain audited (`CLAIM:RECEIPT_LOOKUP_MISS`); runs/policies have NO public read surface (console is `ADMIN_ONLY`) | INT `claim-intake-api` (foreign facility's receipt ⇒ 404); F6.1 audit-on-miss code path |
| 7 | Spoofed provider / client / actor / policy fields | Schema `.strict()` rejects privilege fields (§7.2); context derives tenant/provider/member/currency server-side; policy scope validated in-tenant | UNIT `claim-intake-schema` (unknown-field rejection); UNIT `claim-intake-context` (mismatch rejection table); INT spoof probes (#3) |
| 8 | Huge bodies / arrays / strings | `LIMITS` (200 lines / 50 dx / bounded strings / money digit caps) + **`MAX_BODY_BYTES` 413 pre-parse cap on the B2B route (added F7.3)**; CSV 10 MB + 2000-row bound | UNIT `claim-intake-schema` (oversize cases); INT `claim-intake-security` (413); INT `claim-intake-csv` (row bound 400) |
| 9 | Code/text injection (HTML/script/SQL) | `textField` anti-HTML/`javascript:` refinements; `codeField` charset; Prisma parameterization; HTML summary escaping (CSV) | UNIT `claim-intake-schema`; M25 injection UAT (2026-07-15, PASS) |
| 10 | Rapid key replay / conflict enumeration | Receipt-lookup rate limiter (60/min per credential, 429 + retry-after); idempotent replay is cheap by design (no write); conflict responses carry no foreign data | UNIT `rate-limit`; INT same-key replay/conflict probes (`claim-intake-api`) |
| 11 | Log / audit / metric redaction | `IntakeError` sanitization (no stacks/raw internals; `logContext` never returned); receipts store hashes + safe outcomes only (D16); console dashboards are counts/states; reason catalog has separate provider/member texts | UNIT `claim-intake-errors`; F3.x receipt-content review; F6.5 page (no PHI queries) |
| 12 | Policy maker self-approval | `ApprovalRequestService` SoD + defence-in-depth check in `applyApprovedPolicyChange` (maker ≠ checker) | INT F2.5 `claim-autopilot-policy-approval` (self-approval blocked; checker activates) |
| 13 | Unauthorized breaker / reprocess | Console actions `requireRole(ADMIN_ONLY)`; reprocess `requireRole(CLINICAL)`; both hash-chain audited; breaker close requires a reason | Code boundaries (`settings/auto-adjudication/actions.ts`, `claims/[id]/automation-actions.ts`); breaker semantics INT F4.7 |

## Residuals / notes

- The receipt-lookup rate limiter is **per-instance** (in-process). A distributed
  quota needs a Redis store — documented in `src/lib/rate-limit.ts`; acceptable
  while the B2B channel is low-QPS and per-credential.
- Policy/run objects deliberately have no public API; if one is ever added, it
  must reuse the receipt-lookup scoping pattern (tenant + caller scope +
  non-enumerating 404 + audit-on-miss).
- The offline rail's device identity is the work-code authorization (PR-036);
  ingest without a valid code buffers as CONFLICT and never processes.
