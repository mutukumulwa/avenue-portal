# Pending / Untested Workflows (as of 2026-07-04 wrap)

Priority-ordered for the next agent. All can run on the current `aicare_uat` environment without rebuild.

## High priority (financial/clinical core still unproven)
1. **E3 Case management**: `/cases/new` → service entries → close → files one claim; HMS batch manual JSON upload on Open Cases; `POST /api/v1/hms-batch` push (API key in `.env`).
2. **C3 Endorsements**: admin `/endorsements/new` (ADD_MEMBER w/ pro-rata) AND HR-initiated via `/hr/roster/new` (emily.wambui@safaricom.co.ke) → admin queue → approve → APPLIED; verify member materialises.
3. **D1 Quotation → assess → build → bind** (maker-checker chain; June found Create Group silently failing — retest on current build).
4. **F3 Self-funded fund**: fund@medvex.co.ug deposit → statement + export; June DEFECT-016 was fixed — confirm on this build.
5. **E8 offline loop**: `/offline-capture` gated by code UG7YED (issued, ACTIVE) → capture → `/api/v1/sync` → reconcile; offline pack generation needs worker (running, see CP-001 workaround).
6. **B2B API series**: eligibility/benefits/preauth/claims with `API_KEY` from `.env`; verify 401 with wrong key; suspended-member 403.

## Medium
7. Member portal walk (member@medvex.co.ug + 5 demo logins) — benefits, wallet (M-Pesa stub safety), preauth self-service, documents (June DEFECT-017 seed-docs 404), WebAuthn security page.
8. Broker portal quote creation; commissions ledger after settlement.
9. Billing run job + invoice lifecycle; admin-fee accrual (worker must run with env workaround).
10. Fraud: rules console, trigger an alert (after-hours claim), investigation lifecycle.
11. Overrides console + CONTRACT_BACKDATE override path (ties to PR-009/PR-010 — PC-2026-002 APPROVED→stuck is reproducible material).
12. Appeals (APPEALED→APPEAL_APPROVED/DECLINED), VOID, reimbursement claims.
13. Reports: remaining ~30 report types render + PDF export (local Chrome path in .env is broken — use system Chrome, see CP-005).

## Low / environmental
14. Cross-border case, LOU issuance, complaints/service requests, compliance + privacy registers, terminology overrides, FX rate admin, drug exclusions.
15. USSD/SMS handlers (stubs), notification templates/email (no SMTP locally).
16. Performance/volume, cross-browser, mobile visual matrix.

## Blocked
- **S2 provider branches / branch-scoped contracts** — blocked by PR-007 (no UI) until fixed.
- **Fine-grained RBAC enforcement (OQ-1)** — needs a design answer on where Role/Permission tables are meant to be enforced; testable only via /settings role editor once understood.
- **Capitation settlement accounting** — deferred by TPA decision (FEATURE_STATUS #4), do not test.
