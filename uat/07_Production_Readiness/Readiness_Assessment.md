# Production Readiness Assessment — Medvex TPA Platform
**Build:** `main` @ `1cd23a8` · **Assessed:** 2026-07-04 · **Method:** independent as-built documentation + live E2E UAT on a clean, app-seeded environment (`uat/02_Test_Plan/Environment_Provisioning.md`), real contract corpus used for seed data.
**Scope caveat:** ~19 workflows executed across 11 roles (see `06_Test_Results/Workflow_Test_Results.md`); a further ~16 remain untested (`03_Progress_Logs/Pending_Workflows.md`). Findings below are evidence-backed; untested areas are risks, not passes.

## Verdict

> **NOT READY for a first enterprise client.** The platform's mechanics are unusually strong — the workflow engine, contract digitisation, RBAC, and audit spine all work — but the **financial control layer is hollow**: approved money is not constrained by contracts, not reserved against benefit limits, not compared in the right currency, and not posted to the ledger. For a TPA whose product *is* controlled claims administration, these four gaps (PR-011/014/016/017/018) are disqualifying until fixed. Add the credentials-on-login-page disclosure (PR-003) and there are five must-fix blockers.

## What is genuinely strong (verified live)
- **Digital contract module**: OCR-tolerant extraction with provenance/confidence/blocking review questions; validation gates (V1/V2/V6/V13/V16) correct; server-side maker-checker + segregation of duties + backdating horizon all enforced; versioning on activation; overlapping-contract suspension designed in.
- **Contract-driven operations**: claims list SLA derives from the active contract's payment terms (Jubilee 10 business days → 336h); the engine correctly prices a case-rate encounter (86,000 billed → 3,600 payable) in preview.
- **RBAC**: 11 roles × 16 route probes match the declared role sets exactly; portals isolate; member/HR/broker/fund scoping held.
- **Settlement maker-checker**: self-approval blocked with a clear message; the June crash trio (batch create / self-approve / mark-paid) is fixed; chain reaches SETTLED/PAID.
- **Data propagation**: every UI-created entity appeared everywhere expected (lists, searches, dropdowns, family units, dashboards, CSV exports) — no orphaned records found.
- **Audit spine**: 19/22 session mutations logged with entity linkage, including full contract lifecycle.
- **Membership**: form + CSV import with principal-dependant linking; MVX numbering; 360° family unit correct.

## Blocking issues (must fix before any production exposure)
| ID | Finding | Why it blocks |
|---|---|---|
| PR-003 | Login page prints live admin credentials | Instant full compromise on any reachable deployment |
| PR-014 | Case-rate/capitation contract price does not bound manual adjudication (paid 86,000 vs contracted 3,600, no warning) | Unbounded financial leakage on the contract types the TPA just added; contradicts FEATURE_STATUS's own claim of ceiling guarding |
| PR-016 | Approved claims write no benefit usage; attached PAs never become UTILISED | Annual limits are not enforced at all on this path; unlimited spend per member |
| PR-011 | PA approval places no BenefitHold (June DEF-009, still open) | Double-spend across concurrent approvals; was already a June go-live condition |
| PR-018 | No GL posting / PaymentVoucher on approval or settlement (June DEF-008, still open) | A licensed TPA whose PAID claims don't reach its books fails audit/regulatory defensibility |

## High priority (fix before/at pilot)
- **PR-017** — approval matrix compares KES claims against UGX bands with a hard-coded currency; thresholds are wrong by the FX factor; large claims can escape dual approval. Multi-currency is a headline requirement (Req 5).
- **PR-012** — duplicate detection flags every claim as a duplicate of itself → poisons audit trail, guarantees manual routing, and will nullify auto-adjudication when wired.
- **PR-001** — no reproducible clean-install: migrations can't rebuild the schema (db-push history), reference data split across an undocumented script, Kenyan demo book inseparable from reference data, prod build does implicit `db push`.
- **PR-006/PR-007** — provider onboarding dead-ends: no edit/activate UI (records stuck PENDING — currently cosmetic but semantically dangerous), no branch management despite the real corpus (SHA) being per-branch.
- **PR-002** — worker ignores `.env`; every scheduled behaviour (escalations, SLA, packs, accruals, analytics) silently dies depending on how it is launched (June DEF-007, still open).
- **PR-010** — contract header terms immutable even in DRAFT; with the 90-day backdate horizon this creates unrecoverable dead contracts in the register.

## Medium
PR-005 (provider create: no feedback/redirect → duplicate risk), PR-009 (all contract lifecycle errors swallowed silently — SoD, backdate; support burden and operator distrust), PR-013 (wizard accepts future service dates), PR-015 (approval may exceed attached PA cover silently), PR-020 (audit gaps: provider create, capture, contract child-entity edits).

## Low
PR-004 (AiCare/Medvex brand mix on login), PR-019 (HR guard bounces staff to /login), PR-008 (pricing rules render raw JSON).

## Systemic observations (not single defects)
1. **Controls exist in services but the UI paths bypass or mute them.** The reservation/UTILISED logic exists in `claims.service.adjudicateClaim` yet the wizard's finalize path skips it; contract lifecycle enforces rules but the UI hides every rejection. Recommend an integration-test layer that asserts side-effects (holds, usage, GL rows, PA status) after each UI action, not just status codes.
2. **Two RBAC systems coexist** (coarse enum enforced; fine-grained Role/Permission tables seeded but with no observed enforcement point) — decide and document which is authoritative (OQ-1).
3. **Currency discipline is absent at boundaries**: KES amounts flow into UGX-denominated controls without conversion (matrix; likely elsewhere — quotations/analytics not yet checked).
4. **Operational fragility of provisioning**: schema state = db-push + hand-psql; a DR rebuild or second environment cannot be produced from the repo alone. Re-baseline migrations and fold `seed-reason-codes.ts` + a demo-free reference seed into one documented install path.
5. **June register carry-overs**: DEF-008 (GL), DEF-009 (holds), DEF-007 (worker env) remain open on the current build; the settlement crash trio and fund-deposit crash were fixed. Regression discipline is inconsistent.

## Untested-risk register (could hide further blockers)
Quotation→bind chain (June had a silent group-creation failure), endorsements pro-rata math, fund accounting on this build, B2B API auth posture (June DEF-001 API key — env now sets it, prod must too), member wallet/M-Pesa safety, offline capture→sync loop, HMS push, job-driven behaviours end-to-end, reports beyond 3 sampled, PDF generation in production runtime.

## Recommendations (order of work, not implementation detail)
1. Close the five blockers (PR-003 first — one-line removal; then the money controls as one workstream: holds → usage/UTILISED → contract ceiling → GL posting).
2. Fix FX normalisation at every amount-comparison boundary (PR-017) and the self-duplicate check (PR-012).
3. Make provisioning reproducible (PR-001) and the worker env-safe (PR-002) before any staging/pilot environment is built.
4. Complete provider onboarding UI (edit/activate/branches) so the network team can work without engineering.
5. Surface server errors in the contract module UI (PR-009/PR-010 usability cluster).
6. Execute the pending-workflow list (`Pending_Workflows.md`) — especially quotation→bind, endorsements, fund, offline loop, and B2B API — before any Go/No-Go is re-evaluated.
