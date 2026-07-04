# Defect Register — 2026-07 Production Readiness Engagement

**Format per defect:** ID · Workflow · Module · Role · Preconditions · Steps · Expected · Actual · Evidence · Severity (Critical/High/Medium/Low) · Business impact · Priority · Status · Blocks production? · Blocks testing?

Numbering: `PR-###` (Production Readiness) to avoid collision with June's `DEF-*`/`DEFECT-*` series (pre-rebrand build; see `uat/03_DEFECT_LOG.md` + `uat/DEFECTS.md`).

---

## PR-001 — No reproducible clean-install/provisioning path
- **Workflow:** A1 operator provisioning · **Module:** platform · **Role:** implementer
- **Preconditions:** fresh environment, repo at `1cd23a8`.
- **Steps:** attempt to build a new environment from the repo's own artefacts (migrations + seed).
- **Expected:** documented, reproducible path creates a production-shaped tenant with reference data only (or clearly separated demo data).
- **Actual:** `prisma/migrations/` (23) do NOT reproduce the schema (recent modules applied via `db push`/hand psql — MEDVEX_BUILD_LOG §1 warns `migrate dev` would reset/drop). The only seed mixes reference data (ICD-10/CPT, CoA, terminology, FX, fraud rules) with Kenyan demo data (Safaricom/KCB/EABL groups, KES amounts, demo claims). Production build script (`scripts/db-sync.mjs`) does implicit `db push` against prod on every build.
- **Evidence:** MEDVEX_BUILD_LOG.md §1 warnings; prisma/migrations listing; seed.ts structure. Rebuild executed 2026-07-04 (see 02_Test_Plan/Environment_Provisioning.md): `db push` + `db seed` succeeded but left ServiceCategory/AdjudicationReasonCode/OverrideControl empty until the separate undocumented `scripts/seed-reason-codes.ts` was run; demo book (249 Kenyan members, 759 claims) cannot be excluded.
- **Severity:** High · **Impact:** first real client onboarding cannot start from a clean tenant; schema deploys ungated; DR/rebuild risk.
- **Status:** OPEN · **Blocks production?** Yes (implementation readiness) · **Blocks testing?** No (workaround: parallel DB).

## PR-002 — Background worker does not load `.env` (crashes all scheduled jobs)
- **Workflow:** platform operations (all ⚙ jobs) · **Module:** jobs/worker · **Role:** operator
- **Preconditions:** `.env` present with valid `DATABASE_URL`; Redis running with scheduled repeat jobs.
- **Steps:** `npm run worker` from repo root (the documented way to run it).
- **Expected:** worker reads `.env` (like Next.js does) and processes jobs.
- **Actual:** worker starts, picks up repeat jobs from Redis, then **every job fails** with Prisma P1003 `Database 'arthurmulwa' does not exist` — the process never read `.env`, so Prisma fell back to a default connection (OS username as DB name). Errors repeat for every scheduled job (sync-reconcile, preauth-escalation, commission-reconciliation, intake-allocation, sla-breach, approval-escalation, lapse-detection, membership-activation…). Exit code 1. June UAT logged the same as DEF-007; still unfixed on the current build.
- **Evidence:** `04_Evidence/worker-env-failure-2026-07-04.log` (first 505 lines of worker output).
- **Severity:** High · **Impact:** in any deployment where the worker relies on `.env` (docker-compose passes env explicitly, but bare-metal/dev/runbook does not), all time-based behaviour silently fails: escalations, SLA breach flags, lapse detection, activation, accruals, analytics, offline packs.
- **Workaround:** `set -a; source .env; npm run worker`.
- **Status:** OPEN (regression-confirmed from June DEF-007) · **Blocks production?** Should-fix (ops trap) · **Blocks testing?** No (workaround applied).

## PR-003 — Login page displays live credentials (incl. admin password)
- **Workflow:** authentication · **Module:** (auth)/login · **Role:** anonymous
- **Steps:** open `/login` unauthenticated.
- **Expected:** no credentials disclosed.
- **Actual:** footer of the sign-in card lists working accounts and the shared password in clear text: "Admin: admin@medvex.co.ug · HR: emily.wambui@safaricom.co.ke · Broker: broker@kaib.co.ke · Member: member@medvex.co.ug · Password: MedvexAdmin2024!". These are real, active accounts in the environment. If this page ships to any internet-reachable deployment, it is a full compromise (admin login handed out on the front door). Also contradicts the page's own "Authorized users only" banner.
- **Evidence:** `04_Evidence/login-page-snapshot-2026-07-04.txt` (accessibility snapshot).
- **Severity:** Critical (for any non-local deployment) · **Impact:** trivial takeover of admin console.
- **Status:** OPEN · **Blocks production?** YES · **Blocks testing?** No.

## PR-004 — Brand inconsistency on login page ("AiCare Platform" vs Medvex)
- **Workflow:** authentication · **Module:** (auth)/login
- **Actual:** page title "Medvex — Health Administration Platform", card says "Enter your Medvex credentials", but the main heading reads "AiCare Platform". The brand-guard script (`scripts/check-no-avenue.mjs`) only guards against "avenue", not "AiCare".
- **Severity:** Low (cosmetic/brand) · **Status:** OPEN · **Blocks production?** No.

## PR-005 — Provider creation: no success feedback, no redirect (double-submit risk)
- **Workflow:** B1 provider management · **Module:** providers/new · **Role:** SUPER_ADMIN
- **Steps:** complete `/providers/new` (all fields valid) → click "Add Provider".
- **Expected:** success confirmation and redirect to the provider detail (or list), per the pattern on other create forms.
- **Actual:** POST succeeds (record IS created — appears in list) but the user stays on the filled-in form with no toast, no message, no redirect. A real user will click again and create duplicates; there is no duplicate-name guard (same failure class as June DEFECT-003 on groups).
- **Evidence:** preview_network log (POST /providers/new → 200, no navigation); providers list showing the created row. `04_Evidence/provider-create-2026-07-04.txt`.
- **Severity:** Medium · **Impact:** duplicate provider records; user confusion.
- **Status:** OPEN · **Blocks production?** No · **Blocks testing?** No.

## PR-006 — No UI to edit or activate a provider; new providers stuck PENDING
- **Workflow:** B1 provider management · **Module:** providers/[id] · **Role:** SUPER_ADMIN
- **Steps:** create provider → open detail → look for edit/activate.
- **Expected:** provider lifecycle management (activate a PENDING provider, correct contact details).
- **Actual:** list shows the new provider as **PENDING** but the detail page exposes no status control and there is **no `/providers/[id]/edit` route**; the tRPC `providers.update` mutation exists but no UI consumes it (repo-wide grep: zero consumers). Once created with a typo or left PENDING, a provider cannot be corrected/activated through the application.
- **Evidence:** route listing; grep results; provider detail body text in `04_Evidence/provider-create-2026-07-04.txt`.
- **Severity:** High · **Impact:** provider onboarding can't be completed as an operator workflow; whether PENDING providers are usable in claims is tested separately (see CL series).
- **Status:** OPEN · **Blocks production?** Yes (network onboarding) · **Blocks testing?** Partially (activation-dependent paths).

## PR-007 — Provider branches cannot be managed anywhere in the UI
- **Workflow:** B1/B2 (branch-scoped contracts) · **Module:** providers, contracts
- **Expected:** branches creatable (spec §5.2: branches make branch-scoped contracts and rates matchable; SHA corpus is per-branch).
- **Actual:** `providerBranches` tRPC router (create/update/alias CRUD) has **zero UI consumers**; provider detail has no branches section; contract capture's branch scope has nothing to reference. The SHA per-branch contracts in the real corpus cannot be modelled through the app.
- **Evidence:** grep results (no .tsx consumer); provider detail page contents.
- **Severity:** High · **Impact:** real-world contract structures (LifeCare per-branch SHA agreements) not implementable; seed item S2 blocked.
- **Status:** OPEN · **Blocks production?** Yes for multi-branch providers · **Blocks testing?** S2 blocked (documented).

## PR-008 — Contract pricing rules render as raw JSON in the UI
- **Workflow:** B2 contract capture · **Module:** contracts/[id] · **Role:** UNDERWRITING
- **Actual:** after adding a PER_VISIT_CASE_RATE rule, the Pricing rules list renders `CONTRACT · PER_VISIT_CASE_RATE {"rate":3600,"carveOutDescriptions":["MRI","CT scans",…]}` — machine JSON where an operator needs readable terms.
- **Evidence:** `04_Evidence/contract-jubilee-capture-2026-07-04.txt`.
- **Severity:** Low (UX) · **Status:** OPEN.

## PR-009 — Segregation-of-duties rejection on contract Approve is silent (no error surfaced)
- **Workflow:** B2 contract lifecycle (maker-checker) · **Module:** contracts/[id] · **Role:** SUPER_ADMIN (as maker)
- **Preconditions:** contract PC-2026-002 submitted for review by the same user.
- **Steps:** click "Approve" as the creator/submitter.
- **Expected:** blocked with the service's own message ("Segregation of duties: the approver cannot be the contract's creator or submitter.").
- **Actual:** the rule IS enforced server-side (`contract-lifecycle.service.ts:185` throws) but the UI swallows it: no toast, no message, page unchanged, Approve still enabled. Verified by full reload — status still UNDER REVIEW. An operator cannot tell whether approval is broken or forbidden.
- **Evidence:** `04_Evidence/contract-jubilee-capture-2026-07-04.txt`; code ref contract-lifecycle.service.ts:181-196.
- **Severity:** Medium (correct control, broken feedback) · **Status:** OPEN · **Blocks production?** No, but support burden.
- **Extension (same class):** "Activate" fails silently too. With a start date >90 days past, `activate()` throws "Backdating requires override CONTRACT_BACKDATE" (contract-lifecycle.service.ts:252) — UI shows nothing, contract stays APPROVED, and no screen offers a way to raise the CONTRACT_BACKDATE override from the contract. Every lifecycle action on this page appears to discard server errors.

## PR-010 — Contract header terms cannot be edited, even in DRAFT
- **Workflow:** B2 contract lifecycle · **Module:** contracts/[id] · **Role:** UNDERWRITER/SUPER_ADMIN
- **Preconditions:** contract withdrawn to DRAFT (PC-2026-002).
- **Expected:** DRAFT contracts editable (dates, payment terms, execution status…) so capture mistakes are correctable before approval.
- **Actual:** detail page has no edit controls for header fields (zero date inputs in DRAFT); no edit route exists. A wrong start date (which blocks activation via the 90-day backdating horizon) can only be fixed by abandoning the contract and recreating it — and no delete/void action is visible either, so the dead record remains in the register.
- **Evidence:** `04_Evidence/contract-jubilee-capture-2026-07-04.txt`.
- **Severity:** High (operational dead-end in the flagship contract module) · **Status:** OPEN · **Blocks production?** Should-fix.

## PR-011 — Pre-auth approval places no BenefitHold (June DEF-009 regression-confirmed, still open)
- **Workflow:** E2 pre-authorization · **Module:** preauth adjudication · **Role:** MEDICAL_OFFICER
- **Steps:** PA-2026-00009 (Ursula, KES 85,000, SURGICAL day-case) → Send for Medical Review → Submit Approval.
- **Expected:** approving a PA reserves the approved amount against the member's benefit limit (BenefitHold ACTIVE until claim attach/expiry), preventing double-spend across parallel PAs/claims.
- **Actual:** PA is APPROVED (validUntil +30d) but `BenefitHold` remains **empty system-wide** (read-only SQL check). A member can obtain unlimited concurrent approvals against the same limit.
- **Root cause (refined 2026-07-04, post-verdict investigation):** hold-creation logic EXISTS (`preauthAdjudicationService.createBenefitHold`, called by `approveByHuman`/`executeAutoDecision`) but the PA detail page's "Submit Approval" form is wired to a *parallel* action (`adjudicatePreAuthAction` → `ClaimsService.adjudicatePreAuth`) that skips it. Two decision stacks coexist on the same screen. See `07_Production_Readiness/Remediation_Plan.md` §W1.
- **Evidence:** `04_Evidence/clinical-chain-2026-07-04.txt` (SQL output; PA screens).
- **Severity:** High · **Impact:** double-spend/limit-breach exposure on every approved PA.
- **Status:** OPEN (carried from June DEF-009, unfixed) · **Blocks production?** Yes per prior Go/No-Go condition #2.

## PR-012 — Duplicate-claim detection flags every claim as a duplicate of itself
- **Workflow:** E4/E5 claim intake → auto-adjudication routing · **Module:** claims · **Role:** any claim creator
- **Steps:** submit any new claim (CLM-2026-00760, Ursula @ LifeCare, DOS 2026-07-06).
- **Expected:** double-capture guard compares against *other* claims (same provider/member/date/category).
- **Actual:** adjudication timeline shows "Routed to manual review — Double-capture: claim for same provider/member/date/category already exists (CLM-2026-00760)" — **the claim's own number**. The dedup query doesn't exclude the claim being evaluated, so every single claim is a false-positive duplicate and is force-routed to manual review with a misleading audit message. Real duplicates become indistinguishable from noise; if engine-driven auto-adjudication is ever wired (FEATURE_STATUS #3), nothing will auto-approve.
- **Evidence:** `04_Evidence/clinical-chain-2026-07-04.txt` (timeline text).
- **Severity:** High (defeats auto-adjudication + poisons audit trail) · **Status:** OPEN.

## PR-013 — Claim wizard accepts a future date of service
- **Workflow:** E4 claim intake · **Module:** claims/new wizard
- **Steps:** Step 2 DOS = 2026-07-06 (today+2) → wizard accepts, claim created; only the back-end router notes "Service date cannot be in the future" in the timeline.
- **Expected:** field-level validation at capture (block or warn), consistent with the back-end rule.
- **Actual:** claim exists in RECEIVED with an invalid DOS; the violation is buried in the routing note.
- **Severity:** Medium · **Status:** OPEN.

## PR-014 — Case-rate/capitation contract pricing does not constrain manual adjudication
- **Workflow:** E5 adjudication under contract · **Module:** claims/[id] + contract engine · **Role:** MEDICAL_OFFICER
- **Preconditions:** ACTIVE contract PC-2026-003 (per-visit case rate KES 3,600) governing LifeCare; claim CLM-2026-00760 billed KES 86,000.
- **Steps:** contract panel correctly previews payable **3,600**; adjudicator ticks both lines → Compute Outcome → Finalize.
- **Expected:** at minimum a ceiling/deviation warning; per the module's purpose, the engine's contract price should bound the payout or require an override with reason.
- **Actual:** claim APPROVED at **86,000** (23.9× the contracted payable). The enforcement block in `claims/[id]/actions.ts` builds its ceiling from FFS tariff-line analysis only; PricingRule outcomes (CASE_RATE/CAPITATION) never feed it, and with no tariff lines + REFER_FOR_REVIEW unlisted rule the ceiling equals billed. FEATURE_STATUS #3's claim that the manual path is "guarded by the contract-enforcement ceiling checks" is **not true for case-rate/capitation contracts** — i.e. for exactly the contracts the TPA remediation added.
- **Evidence:** `04_Evidence/clinical-chain-2026-07-04.txt`; code refs actions.ts:103-161.
- **Severity:** Critical (financial leakage on every capitated/case-rate provider) · **Status:** OPEN · **Blocks production?** Yes.

## PR-015 — Approved amount may exceed attached pre-auth cover with no warning
- **Workflow:** E2/E5 PA attach → adjudication
- **Actual:** PA-2026-00009 cover = 85,000; claim approved at 86,000; no cap warning fired (WP-C2 specified one). 
- **Severity:** Medium · **Status:** OPEN.

## PR-016 — Approved claim leaves member benefit utilisation completely untouched; attached PA never consumed
- **Workflow:** E5 decision side-effects · **Module:** claims.service vs wizard finalize path
- **Steps:** after Finalize (APPROVED 86,000): read-only SQL — `BenefitUsage` for Ursula = **0 rows**; PA still **ATTACHED** (should be UTILISED per WP-C2, and the code at claims.service.ts:468-473 exists to do it); `BenefitHold` empty (PR-011).
- **Expected:** approved claim reserves/consumes the member's annual limit; attached PA transitions to UTILISED.
- **Actual:** neither happened. Combined effect: **a member can burn through unlimited approved claims without any limit tracking**, and PAs remain re-attachable.
- **Root cause (refined 2026-07-04):** the claim screen's Compute Outcome/Finalize buttons call `claimAdjudicationService` (`adjudication-actions.ts`), a *parallel* stack to `ClaimsService.adjudicateClaim` ("Submit Decision"). The parallel stack: (a) increments usage via `benefitUsage.updateMany` which **silently no-ops when the member has no existing usage row** and is **unscoped by benefit config** (would over-increment every category for members who do have rows); (b) converts PA holds that don't exist (PR-011) and never sets UTILISED; (c) contains no approval-matrix, contract-ceiling, or GL logic. See `07_Production_Readiness/Remediation_Plan.md` §W1.
- **Severity:** Critical (benefit-limit enforcement void) · **Status:** OPEN · **Blocks production?** Yes.

## PR-017 — Approval matrix compares foreign-currency claims against UGX bands without conversion
- **Workflow:** E5 approval routing · **Module:** claims actions + ApprovalMatrixService
- **Actual:** `claims/[id]/actions.ts` hard-codes `currency: "UGX"` when resolving CLAIM_PAYMENT; this KES-billed claim (86,000 KES ≈ 2.3M UGX) was band-matched as **86,000 UGX (≈ KES 3,200)** → routed to the lowest single-level band. On a platform whose spec headline is multi-currency subsidiaries (Req 5), payment-approval thresholds are wrong by the FX factor for any non-UGX claim; large claims escape dual approval.
- **Evidence:** matrix rows (UGX bands) + code ref actions.ts:55-63; claim routed single-level.
- **Severity:** High · **Status:** OPEN.

## PR-018 — Claim approval + settlement post nothing to the General Ledger; no PaymentVoucher (June DEF-008 regression-confirmed)
- **Workflow:** E7 settlement / F2 GL · **Module:** settlement, gl.service · **Role:** FINANCE_OFFICER/SUPER_ADMIN
- **Steps:** CLM-2026-00760 (86,000) → settlement batch LifeCare Jul-2026 → maker submit (finance) → checker approve (admin) → Mark Paid → batch SETTLED, claim **PAID**.
- **Expected:** claim-approval and settlement events post double-entry JournalEntries (claims expense/payable, payable/bank) and generate a PaymentVoucher, since the GL module exists and the *seed data* even contains `CLAIM_APPROVED` journal entries.
- **Actual (read-only SQL):** newest JournalEntries are all seed-time (CLM-2024/INV-2024); **nothing** posted for the 2026 claim at approval or settlement; `PaymentVoucher` count = 0 system-wide. The TPA's books do not reflect an KES 86,000 payout marked PAID.
- **Severity:** High (audit/reconciliation void; the June register carried this as DEF-008 — unfixed) · **Status:** OPEN · **Blocks production?** Yes for a licensed TPA.

**Positive results in the same chain (for the record):** settlement maker-checker enforced with clear error ("Maker and checker must be different users" — June DEFECT-010b crash fixed); create-batch works (010a fixed); Mark Paid completes to SETTLED (010c fixed); claim reaches PAID; contract-driven SLA (336h from Jubilee 10-business-day terms) appears on the claims list.

## PR-019 — HR portal guard bounces authenticated staff to /login instead of /unauthorized
- **Workflow:** access control · **Module:** (hr) layout guard
- **Actual:** every non-HR authenticated role probing `/hr/dashboard` is redirected to **/login** (all other portals redirect to the branded /unauthorized). An already-logged-in claims officer appears to have been logged out — confusing and inconsistent.
- **Evidence:** `06_Test_Results/rb-sweep-results.json` (11 roles × 16 probes).
- **Severity:** Low · **Status:** OPEN.

## PR-020 — Audit-log coverage gaps: provider creation, claim capture, contract child-entities unlogged
- **Workflow:** G audit · **Module:** AuditLog
- **Actual:** today's session produced 19 AuditLog rows covering contract lifecycle, client/group/member creation, bulk import, PA transitions, claim submit/approve, settlement chain, user invite — but **no entry** for: provider creation (S1, 07:0x), "Mark as Captured" (CAPTURED transition), or contract pricing-rule/exclusion/applicability additions. For a regulated TPA, tariff-affecting contract edits are exactly what an auditor asks for.
- **Evidence:** SQL extract in `04_Evidence/Audit_Logs/audit-extract-2026-07-04.txt`.
- **Severity:** Medium · **Status:** OPEN.

*(register grows below as testing proceeds)*
