# UAT Engagement — Current Status

**Engagement:** Production Readiness Assessment of Medvex TPA (build `main` @ `1cd23a8`)
**Started:** 2026-07-04 · **First pass CLOSED:** 2026-07-04 (~13:00)
**This file is the resume pointer for the next agent.**

## Headline
First full pass complete: system documented, clean environment built via the product's own path, real-contract seed data created through the UI, core clinical/financial chain executed E2E across 11 roles. **Verdict: NO-GO — 5 blockers** (see `07_Production_Readiness/Executive_Summary.md`). 20 defects in `05_Defects/Defect_Register.md` (PR-001..PR-020).

## Phase completion
| Phase | Status |
|---|---|
| 1 Understanding | ✅ |
| 2 System documentation | ✅ `01_System_Documentation/` (User_Roles verification marks now ✅ per RB sweep) |
| 3 Environment | ✅ clean DB `aicare_uat`; snapshot of old dev DB kept (`04_Evidence/DB_Snapshots/`); `.env` repointed (backup `.env.backup-pre-uat-2026-07-04`) |
| 4 Contract analysis + seeding | ✅ `02_Test_Plan/{Contract_Data_Analysis,Seed_Data_Strategy}.md`; S1–S13 done except S2 (blocked PR-007), S5 (descoped), S9 partially (chain executed), S12 (pending) |
| 5/6 UAT + evidence | 🟠 19 workflows tested (`06_Test_Results/`); ~16 pending (`Pending_Workflows.md`) |
| 7 Progress logs | ✅ continuous (`Testing_Checkpoint_Log.md` CP-001..CP-006) |
| 8 Defects | ✅ 20 raised; 3 June fixes confirmed; 3 June carry-overs confirmed open |
| 9 Readiness | ✅ `07_Production_Readiness/{Readiness_Assessment,Executive_Summary}.md` |

## Environment for resumption
- Services: brew postgresql@16 / redis / minio all running. App: preview server "aicare-dev" (or `npm run dev`), port 3000.
- **Worker:** must launch with `set -a; source .env; set +a; npm run worker` (PR-002).
- DB: `postgresql://aicare:aicare@localhost:5432/aicare_uat` (do NOT run prisma migrate commands — db-push world, see MEDVEX_BUILD_LOG §1).
- Logins: `MedvexAdmin2024!` for all; +`uat.reports@medvex.co.ug` (REPORTS_VIEWER, created via UI).
- Puppeteer: use system Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`); the `.env` CFT path and puppeteer cache are broken.
- UAT artifacts in-system: provider `cmr60l5lv0000huvq0z09dvxg` (LifeCare UAT, PENDING); contracts PC-2026-001 (DRAFT/import), PC-2026-002 (DRAFT, dead — PR-010 exhibit), PC-2026-003 (ACTIVE case-rate); client "UAT CIC General Insurance"; group "UAT Lifecare Staff Ltd" (`cmr616rco003zhuvq27xw4hhc`); members MVX-2026-00250..253 (Ursula family + Peter); PA-2026-00009 (ATTACHED — should be UTILISED, PR-016); claim CLM-2026-00760 (PAID 86,000, `cmr625urr004bhuvqeva6t65m`); settlement batch LifeCare Jul-2026 (SETTLED); offline code UG7YED (ACTIVE, 24h from 07-04); wellness "UAT Annual Screening 2026" (Ursula enrolled).

## Where to resume
Start at `03_Progress_Logs/Pending_Workflows.md` item 1 (cases module), or re-verify blockers after fixes land. Do not re-run completed workflows except to confirm defect fixes; use the defect register IDs.

---

## 2026-07-04 (later): Remediation pass landed — all 20 defects addressed in code

A full remediation of PR-001..PR-020 was implemented per `07_Production_Readiness/Remediation_Plan.md` and pushed to `main`. **The NO-GO verdict is not lifted by this** — W5 requires independent re-verification against a clean install. State for the re-test:

- **W1.1 consolidation done:** the ONLY claim decision path is `ClaimDecisionService.decide` (matrix FX-correct → engine ceiling → PA-cover confirm → usage upsert → hold conversion → PA UTILISED → GL + self-funded drawdown, one transaction). The only PA decision path is `preauthAdjudicationService.approveByHuman/declineByHuman` (always places the hold). Duplicate stacks deleted; repo test guards them (`tests/services/decision-stack-consolidation.test.ts`).
- **Re-test pointers:** CP-004 re-run should now see: approval at 86,000 blocked with ceiling 3,600 named (verified live via `assessCeiling` on CLM-2026-00760 → `{ceiling: 3600, source: "Contract PC-2026-003"}`); ApprovalRequest opened at the FX-converted amount (KES→UGX @29 seeded); usage row created; PA holds placed/converted; GL posted at decision (no swallow); settlement Mark Paid creates PaymentVoucher + SETTLEMENT_PAID JE and sets `paidAt`.
- **DB changes applied to aicare_uat:** `prisma db push` (new PaymentVoucher columns, GLSourceType CLAIM_VOID/SETTLEMENT_PAID, ProviderContractStatus VOIDED); `scripts/backfill-claim-currency.ts` run (760 claims UGX→KES per D2 rule); LifeCare branch "Kikuyu" created via the new UI (PR-007 evidence).
- **Logins:** existing DB passwords unchanged (`MedvexAdmin2024!` still works on aicare_uat). The *seed default* is rotated + env-overridable; rotate live envs with `NEW_PASSWORD=… npx tsx scripts/rotate-seed-password.ts` when the re-test window starts (PR-003 #4).
- **Invariant scripts:** `scripts/data-integrity-check.ts` (PR-011 #8 + PR-018 #7) — green; flags 287 legacy PAID claims (KES 21.5M) with no GL trail as an informational finding for finance.
- **New suites:** 452+ vitest tests incl. the W1 side-effect contract suite (`claim-decision.service.test.ts`), holds, settlement GL, matrix FX, brand/secret guard, audit-coverage harness (287 actions catalogued).
- **Known remaining (documented, not silent):** PR-001 migration re-baseline not executed (db-push still sanctioned; see `docs/INSTALL.md` §3); seed reference/demo split pending; audit catalogue lists ~130 PRE_EXISTING_GAP actions outside this plan's three proven gaps.
