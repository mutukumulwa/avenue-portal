# Unresolved / Blocked scope — what could NOT be tested and why

The single root cause for almost all of these: **no runnable environment** (no Node/DB/Redis/MinIO/SMTP, no `.env`) and **no interactive browser**, so no authenticated/interactive UAT was possible. See [../01_ENVIRONMENT_AND_SETUP.md](../01_ENVIRONMENT_AND_SETUP.md).

## Workflows blocked (require login and/or backend)
| WF | Title | Why blocked |
|---|---|---|
| W1 (most) | Auth/session/role routing | No login; only unauthenticated route-guard probing done (WF01) |
| W2 | Quotation → underwriting → bind | Needs UNDERWRITER/admin login; create flows |
| W3 | Member enrolment/onboarding/card/portal | Login + data writes |
| W4 | Lifecycle (transfer/lapse/death/terminate/reinstate) | Login + **destructive** on disposable data |
| W5 | Packages/benefits/rate matrix/pricing/co-contribution | Login + writes; math reconciliation needs data |
| W6 | Endorsements + pro-rata | Login + writes |
| W7 | Pre-authorisation | Login + writes |
| W8 (UI/Excel) | Claims capture (wizard, Excel import) | Login + writes. **API channel partially tested (WF08).** |
| W9 | Adjudication → fraud → settlement (maker-checker) | Login + writes; the known settlement blocker (DEFECT-010) unverified |
| W10 | Reimbursement | Login + writes |
| W11 | Provider network/tariffs/contracts/statements | Login + writes |
| W12 | Broker onboarding/commissions/payout | Login + writes; cross-broker scope |
| W13 | Finance/billing/GL/reconciliation/taxes | Login + writes; GL-balance check needs DB |
| W14 | Self-funded fund (deposits/statements) | Login; known blocker DEFECT-016 unverified |
| W15 | Member self-service (incl. **fake M-Pesa safety check**) | Login as member; critical safety check untested |
| W16 | Biometric/WebAuthn check-in | Login + authenticator + DB audit-immutability check |
| W17 | USSD/SMS channels | Webhook simulation skipped (non-destructive caution; no staging) |
| W18 | Service desk (complaints/SR) | Login + writes |
| W19 | Analytics + 34 reports + exports | Login; export-vs-screen reconciliation needs data |
| W20 | Fraud alerts & override queue | Login + writes |
| W21 | Background jobs (13) idempotency | No worker/Redis |
| W22 | HR portal self-service | Login; cross-employer scope |

## Cross-cutting suites blocked
- **§5 Visual/UI** — no renderer; **Windows font rendering is a stated priority and is fully untested** (see [UQ_visual_and_browser_matrix.md](UQ_visual_and_browser_matrix.md)).
- **§6 Cross-browser/device** — none possible.
- **§7 Security** — RBAC matrix, IDOR, JWT tamper, session expiry, disabled-user, rate-limiting, multi-tenant isolation, upload exec-validation, export scope, audit immutability — all blocked. (Only the B2B API gate + unauthenticated headers/guards were tested.)
- **§8 Data integrity** — CRUD persistence, status transitions, duplicate prevention, calculated-field reconciliation, totals, exports-vs-screen, partial/abandoned workflows — all blocked (no DB, no login).
- **§9 Integrations/notifications** — see [../integrations/INT01_status.md](../integrations/INT01_status.md).
- **§10 Performance** — page-load smoke at volume, export timeouts, concurrency, resilience — blocked.

## Verify-only items requiring DB/log access (not available)
- Prior "Digest" crash defects (001/005/009/010/016) — need Vercel function logs.
- GL balances; fund ledger vs claims aggregates (DEFECT-015); MLR math.
- Check-in/fraud **append-only DB guard** applied? (`scripts/apply-checkin-audit-guard.mjs`).
- bcrypt password hashing (verify-only).
