# Remediation Plan — Medvex TPA Production Readiness Defects (PR-001 … PR-020)

**Prepared:** 2026-07-04, from the findings of the same-day UAT engagement (build `1cd23a8`).
**Nature:** specification only — no code was written. Every fix states *what done looks like* and *exactly what must pass* before the defect may be closed.
**Companion documents:** `05_Defects/Defect_Register.md` (findings + evidence), `06_Test_Results/` (baseline behaviour), `03_Progress_Logs/Pending_Workflows.md` (untested areas that must be UAT'd after remediation).

---

## 0. How to read this plan

Each defect section contains:
- **Problem / Root cause** — what is broken and *why*, with file references verified against the codebase on 2026-07-04.
- **Design decisions** — choices the product owner must ratify before build. Each has a recommended default so work is never blocked on a meeting.
- **Fix specification** — the explicit, complete change, described behaviourally (what the system must do afterwards), not as code.
- **Acceptance tests** — numbered, binary pass/fail criteria. A defect is closed only when **all** its tests pass and its **regression guards** stay green. Tests marked `[AUTO]` must land as automated tests in the repo suite (vitest exists, 298 tests passing at merge); `[UAT]` are manual/scripted re-verification steps against a running environment; `[SQL]` are read-only database assertions.
- **Size** — S (≤½ day), M (≤2 days), L (≤1 week) engineering estimate, excluding review/UAT.
- **Depends on** — ordering constraints.

### The systemic root cause (read before any individual fix)

Investigation after the verdict established that **most Critical/High money-control defects share one cause: duplicate decision stacks wired to the same screens.**

| Domain | Guarded stack (has the controls) | Unguarded stack (what the UI buttons actually call) |
|---|---|---|
| Pre-auth approval | `preauthAdjudicationService.approveByHuman` → `createBenefitHold` (holds, `activeHoldAmount`) — exposed via `preauth-process8-actions.ts` | `adjudicatePreAuthAction` → `ClaimsService.adjudicatePreAuth` (no hold) — the detail page's "Submit Approval" form |
| Claim decision | `adjudicateClaimAction` → `ClaimsService.adjudicateClaim` (approval matrix + FFS contract ceiling + usage reserve + PA→UTILISED) — the "Submit Decision" button | `computeOutcomeAction` / `approveClaimAction` → `claimAdjudicationService` (`adjudication-actions.ts`) — the "Compute Outcome" / "Finalize & Queue for Settlement" buttons; no matrix, no ceiling, no GL; usage increment no-ops for members without an existing `BenefitUsage` row and is unscoped by benefit config |

**Consequently the centerpiece of this plan is consolidation (W1.1): one canonical decision service per domain, every UI/API/job entry point routed through it, and the duplicate retired.** Fixing the individual defects on top of two live stacks would double the work and guarantee regressions.

### Workstreams and sequencing

| WS | Theme | Defects | Order rationale |
|---|---|---|---|
| **W0 — Emergency (day 1)** | Disclosure + trivial correctness | PR-003, PR-004, PR-012, PR-013, PR-019 | Independent one-liners-to-small; PR-003 cannot wait for anything |
| **W1 — Money controls** | Single decision stack, holds, usage, ceiling, PA cap, FX, GL | PR-016 → PR-011 → PR-014 → PR-015 → PR-017 → PR-018 | PR-016's consolidation is the foundation every other control bolts onto; GL last because it hooks the finalized event |
| **W2 — Contract module operability** | Error surfacing, editability, display | PR-009 → PR-010 → PR-008 | PR-009's error-surfacing pattern is reused by W1 and W3 UIs |
| **W3 — Provider onboarding** | Feedback, edit/activate, branches | PR-005, PR-006, PR-007 | Independent of W1; needed before network team onboards real facilities |
| **W4 — Platform / provisioning** | Reproducible install, worker env, audit coverage | PR-001, PR-002, PR-020 | PR-001 before any staging environment is built |
| **W5 — Verification** | Full regression + pending-workflow UAT + Go/No-Go re-evaluation | — | Gates release; see §Exit criteria |

Suggested parallelisation: W0 immediately; W1 (one senior engineer + reviewer, it is the risk centre); W2+W3 can run in parallel with W1 (different files); W4 parallel except PR-020's harness which should land after W1 consolidation (so it asserts the final action set).

---

## W0 — Emergency fixes

### PR-003 — Login page displays live credentials (Critical)
**Problem:** `/login` renders working accounts and the shared password to anonymous users (`(auth)/login/page.tsx` footer block).
**Design decision:** none needed. Demo-credential hints may exist **only** behind an explicit `NEXT_PUBLIC_DEMO_HINTS=true` env flag that is absent from every non-local env file and docker/vercel config. *Recommended default: remove the block entirely; keep credentials in `prisma/seed.ts` console output only.*
**Fix specification:**
1. Remove the credentials paragraph from the login page (all variants — check for similar hints on `/reset` and any portal-specific login states).
2. Repo-wide sweep for the literal password and seeded emails in **rendered** UI strings (they may legitimately remain in seed code and docs).
3. Extend the existing brand-guard prebuild script (`scripts/check-no-avenue.mjs`, already wired to `prebuild` + GitHub Action) with a "secret-leak guard": fail the build if `MedvexAdmin2024` or `@medvex.co.ug` account literals appear under `src/app/**` outside test fixtures.
4. Because the password has been published on a rendered page, treat it as burned: change the seed default password value and document rotation for any deployed environment that ever served this page.
**Acceptance tests:**
1. `[UAT]` Anonymous GET `/login` — rendered HTML contains no email address and no password string (grep the response body, not just the visible text).
2. `[AUTO]` Guard script fails a build containing the old credentials block (fixture test), passes on clean tree.
3. `[UAT]` Login still succeeds for all 11 roles with the rotated seed password; login page shows no functional regression (2FA field, forgot-password link intact).
4. `[UAT]` `/reset` and `/unauthorized` pages checked for the same class of leak — none present.
**Size:** S. **Depends on:** nothing.

### PR-004 — "AiCare Platform" heading vs Medvex brand (Low)
**Fix specification:** replace the login heading (and any other rendered "AiCare" strings — sidebar logo block showed "AiCare / Medvex" stacked) with the approved Medvex lockup per `Medvex_Style_Guide.md`; add `AiCare` (case-insensitive, user-facing files only) to the brand-guard blocklist with an allowlist for `package.json`'s internal `"name": "aicare"`, infra identifiers (DB name), and historical docs.
**Acceptance tests:**
1. `[UAT]` `/login` and the admin sidebar render Medvex branding only.
2. `[AUTO]` Brand guard fails on a fixture containing rendered "AiCare", passes on the clean tree.
3. `[UAT]` Page `<title>` and PWA manifest name checked for the same inconsistency.
**Size:** S. **Depends on:** nothing.

### PR-012 — Duplicate-claim check flags every claim as its own duplicate (High)
**Problem:** the double-capture rule (`claim-adjudication.service.ts` hard-gate validation) queries same provider/member/date/category **without excluding the claim under evaluation**, so every claim routes to manual review citing itself.
**Fix specification:**
1. Exclude the current claim's id from the duplicate query.
2. Define the true-duplicate contract explicitly: same tenant + provider + member + service date + benefit category, status not in (VOID, DECLINED) — confirm with product whether DECLINED should still block resubmission (recommended: DECLINED claims do *not* block; VOID never blocks).
3. Routing message must name the **other** claim number(s) found.
4. Because this rule feeds auto-adjudication routing, re-run the routing decision logic for a sample of the 759 seeded claims to confirm no mass behavioural flip beyond removal of the false positive.
**Acceptance tests:**
1. `[AUTO]` Unit: claim with unique combo → no duplicate flag.
2. `[AUTO]` Unit: two distinct claims, same combo → second flags, message contains the first's claim number; first remains unflagged.
3. `[AUTO]` Unit: prior VOID/DECLINED claim with same combo → no flag (per ratified rule).
4. `[UAT]` Repeat the CP-004 wizard flow: new claim's adjudication timeline contains **no** self-referential duplicate entry; a deliberately duplicated claim (same member/provider/date/category) does get routed with the correct reference.
**Size:** S. **Depends on:** nothing (but re-verify after W1 consolidation since the hard-gate moves with it).

### PR-013 — Claim wizard accepts a future date of service (Medium)
**Design decision:** may any intake channel legitimately carry a future DOS? Recommended: **no** for MANUAL/REIMBURSEMENT/BATCH (block at capture); INCURRED-type notifications are not created through this wizard. Boundary = "today" in the **tenant's operating timezone** (define it — currently implicit server time; recommend Africa/Kampala constant on Tenant).
**Fix specification:**
1. Wizard Step 2: date input `max` = today + inline validation message; Next disabled while invalid.
2. Server-side: claim-creation service rejects DOS > today (4xx with explicit message) — the rule must live server-side regardless of UI, covering the B2B `/api/v1/claims` and batch-import channels with the same shared validation.
3. Align the routing engine's existing "Service date cannot be in the future" note so it can no longer occur for newly created claims (it becomes a defence-in-depth assertion, not a routine annotation).
**Acceptance tests:**
1. `[UAT]` Wizard: DOS = tomorrow → field-level error, cannot proceed to Step 3.
2. `[UAT]` Wizard: DOS = today → proceeds.
3. `[AUTO]` Service/API: create-claim call with future DOS → rejected with the defined error; same via claims Excel import (row-level error, file not partially silently ingested).
4. `[AUTO]` Timezone boundary: 23:30 Kampala on date D accepted as D even when server UTC has rolled to D+1 (or the documented rule states otherwise — test must match the ratified rule).
**Size:** S. **Depends on:** decision on timezone rule.

### PR-019 — HR portal guard bounces authenticated staff to /login (Low)
**Fix specification:** the `(hr)` layout guard must use the same convention as every other portal: unauthenticated → `/login`; authenticated-but-unauthorised → `/unauthorized`, preserving the session.
**Acceptance tests:**
1. `[UAT]` Authenticated CLAIMS_OFFICER navigates to `/hr/dashboard` → lands on `/unauthorized`; can then navigate to `/dashboard` without re-login (session intact).
2. `[UAT]` Unauthenticated request to `/hr/dashboard` → `/login`.
3. `[UAT]` HR_MANAGER and SUPER_ADMIN unaffected.
4. `[AUTO/UAT]` Re-run `06_Test_Results/rb-sweep.mjs` with updated expectations: the `→ /login` cells for `/hr/dashboard` become `→ /unauthorized`; no other cell changes.
**Size:** S. **Depends on:** nothing.

---

## W1 — Money controls (the release-gating workstream)

> **W1.1 is a prerequisite refactor, not a defect fix.** Ratify it first; PR-011/014/015/016/017/018 specifications below assume it.

### W1.1 — Consolidate to one canonical decision stack per domain (enabler)
**Specification:**
1. **Claims:** designate a single service entry point for *every* claim decision (line decisions may stay separate; the *outcome/finalise* step is the control point). It must, in one transaction: validate status transition → resolve approval matrix (with FX per PR-017) → enforce contract ceiling (PR-014) → enforce PA-cover cap (PR-015) → write usage/consume holds and set PA UTILISED (PR-016/011) → post GL (PR-018) → write AdjudicationLog + audit-chain entries. The existing `ClaimsService.adjudicateClaim` is the closer starting point (it already has matrix + FFS ceiling + reservation + UTILISED); fold in the useful pieces of `claimAdjudicationService.approveClaim` (cost-share split, senior threshold, adjudicator-assignment check) and retire the duplicate.
2. **Pre-auth:** same treatment — one approval entry point that always creates the hold; `ClaimsService.adjudicatePreAuth` and `preauthAdjudicationService.approveByHuman` merge into one; the two-stage UI (medical review → approve) keeps calling the same underlying decision service.
3. Every caller re-pointed: claim detail buttons (Compute Outcome / Submit Decision / Finalize — consider collapsing these three into a clearer two-step: "Compute outcome (preview)" then "Approve & finalise"), assessor queue, auto-adjudication service, appeals, B2B API claim decisioning if any, case-close claim filing, reimbursement disbursement.
4. The retired functions must be deleted (not left exported) so no future screen can rewire to them — enforce with a lint rule or a unit test that asserts the module no longer exports them.
**Acceptance tests:**
1. `[AUTO]` A single integration test drives the full decision via the canonical service and asserts **all** side-effects in one pass: claim status, AdjudicationLog, audit-chain, usage row, hold state, PA status, GL rows (the "side-effect contract test" — this becomes the permanent regression guard for the whole workstream).
2. `[AUTO]` Repo test asserting the duplicate service methods no longer exist/are not imported anywhere.
3. `[UAT]` The claim detail page exposes exactly one approval path; clicking through the CP-004 scenario produces identical UI outcomes plus the new side-effects.
**Size:** L. **Depends on:** nothing; blocks PR-011/014/015/016/017/018 sign-off.

### PR-016 — Approved claims must consume benefit limits; attached PAs must become UTILISED (Critical)
**Root cause recap:** unguarded stack + two latent bugs in its usage write: `benefitUsage.updateMany` (a) no-ops when no row exists for the member/period, (b) is unscoped by benefit config so it would increment **every** category's usage for members who do have rows.
**Design decisions:**
- D1: usage is recorded at **decision (APPROVED/PARTIALLY_APPROVED)**, not at settlement. On VOID or successful appeal reversal, usage is decremented by a compensating entry. *Recommended as stated (matches existing code comments).*
- D2: the usage row is keyed by member + benefitConfig + period; if none exists at decision time it is **created (upsert)** with the correct period window derived from the member's package version. *Required, not optional.*
**Fix specification:**
1. Within the canonical decision transaction (W1.1): upsert the `BenefitUsage` row for (member, resolved benefitConfig for the claim's benefit category, current period), increment `amountUsed` by the net approved amount, increment `claimCount`.
2. Scope strictly to the claim's benefit category → benefitConfig resolution; define behaviour when the member's package has no config for that category (recommended: block approval with an explicit "benefit not in package" error — this is also a latent adjudication gap).
3. PA consumption: all PAs attached to the claim transition ATTACHED → UTILISED in the same transaction; their holds convert per PR-011 (hold released, `activeHoldAmount` decremented, usage increment covers the approved amount).
4. PARTIALLY_APPROVED consumes the approved (not billed) amount; DECLINED consumes nothing and releases attached-PA holds back to ACTIVE-hold state with PA returning to APPROVED (decide: or stays ATTACHED for resubmission — recommended: detach + APPROVED so it can attach to a corrected claim within validity).
5. Idempotency: re-invoking the decision on an already-decided claim must not double-count (status-transition assertion guards it).
6. Member-facing surfaces recompute from the same rows: member portal benefits page, admin member detail limits, eligibility/benefits B2B API.
**Acceptance tests:**
1. `[AUTO]` Integration: new member (no usage rows) → approve claim of X → usage row **created** with `amountUsed = X`, `claimCount = 1`, correct benefitConfig + period; other categories' rows untouched/absent.
2. `[AUTO]` Integration: member with existing rows in two categories → approve claim in category A → only A increments (regression for the unscoped-increment latent bug).
3. `[AUTO]` PA-attached claim approved → PA row status UTILISED; hold CONSUMED/released; `activeHoldAmount` back to 0; usage incremented exactly once (no hold+usage double-count).
4. `[AUTO]` PARTIALLY_APPROVED at Y<X → usage += Y. DECLINED → usage unchanged, PA per ratified D-decision.
5. `[AUTO]` Second decision attempt on the same claim → rejected, counters unchanged.
6. `[AUTO]` VOID/appeal-reversal → compensating decrement recorded (not a destructive update), audit-linked.
7. `[UAT]` Re-run CP-004 end-to-end: after approval, `[SQL]` `BenefitUsage` shows the amounts; Ursula's member-detail limits and the member portal benefits view reflect the utilisation; PA-2026-00009-equivalent reads UTILISED in UI and DB.
8. `[UAT]` Claim in a category outside the member's package → blocked with the defined error.
**Size:** M (on top of W1.1). **Depends on:** W1.1, PR-011 (hold conversion semantics).

### PR-011 — Pre-auth approval must place a BenefitHold (High; June DEF-009)
**Root cause recap:** `createBenefitHold` exists and is correct in outline (upsert by preAuthId + `activeHoldAmount` increment) but the wired approval action bypasses it.
**Fix specification:**
1. Post-W1.1, every PA approval (human, senior, auto-decision, B2B `/api/v1/preauth` approval if applicable) creates exactly one hold for the approved amount with expiry = PA `validUntil`.
2. The same no-row latent bug must be checked here: hold creation increments `activeHoldAmount` on the current `BenefitUsage` row — specify **upsert** semantics identical to PR-016 D2.
3. Hold lifecycle completeness: released on PA CANCELLED/DECLINED-on-review/EXPIRED (the `releaseExpiredHolds` sweep exists — wire it into the scheduled jobs and confirm cadence); converted on claim decision (PR-016); partial-utilisation rule: if claim approves less than the hold, remainder is released (ratify; recommended).
4. Available-limit arithmetic: every limit check (PA auto-decision limit gate, claim adjudication limit checks, member portal "available", eligibility API) must compute `limit − amountUsed − activeHoldAmount`. Audit each of these call sites against a written list; the UAT found at least the PA path reading `activeHoldAmount` already (`preauth-adjudication.service.ts:195`) — the remaining sites must be enumerated and verified during build.
**Acceptance tests:**
1. `[AUTO]` Approve PA of X → `BenefitHold` row ACTIVE, `heldAmount = X`, expiry = validUntil; `activeHoldAmount += X` (row upserted if absent).
2. `[AUTO]` Second PA that would exceed remaining limit (limit − used − held) → auto-decision declines/routes per policy; human path shows the shortfall.
3. `[AUTO]` PA expiry job run past validUntil → hold RELEASED, `activeHoldAmount` restored; PA status EXPIRED.
4. `[AUTO]` PA cancelled → hold released same-transaction.
5. `[AUTO]` Claim approved for less than hold → consumed portion converts, remainder released (per ratified rule).
6. `[AUTO]` Concurrency: two simultaneous PA approvals against the same remaining limit cannot jointly over-reserve (transactional/serialisable guard) — test with parallel transactions.
7. `[UAT]` Member portal + member detail show available limit reduced immediately after PA approval, restored after cancellation.
8. `[SQL]` System-wide invariant check script: `activeHoldAmount` equals the sum of ACTIVE holds per member/period (add as a scheduled data-integrity assertion).
**Size:** M. **Depends on:** W1.1.

### PR-014 — Contract pricing must bound manual adjudication (Critical)
**Root cause recap:** the enforcement block builds its ceiling from FFS tariff-line analysis only; PricingRule outcomes (case rate, capitation, package, per-diem, discount) never feed it; with no tariff lines + `REFER_FOR_REVIEW` unlisted rule, ceiling = billed.
**Design decisions:**
- D1: enforcement mode when approved > engine payable on a *deterministic* contract price: hard block vs override. *Recommended: block by default, with an explicit override path that (a) requires a reason code, (b) creates an `OverrideRecord` (the OverrideControl catalogue seeded 16 controls — add/reuse a `CONTRACT_PRICE_OVERRIDE` control), (c) routes through the approval matrix at the requested amount, and (d) is visible on `/overrides` and the contract's analytics.*
- D2: which `PricingRuleKind`s are deterministic: `PER_VISIT_CASE_RATE`, `CAPITATION` (payable 0 / pool-tagged), `PACKAGE` (fixed package price), `PER_DIEM` (rate × days), `DISCOUNT_OFF_BILLED` (billed × (1−pct)) — all bound; `AVERAGE_COST_POOL` and `REFER_FOR_REVIEW`/unlisted remain reviewer judgement. *Ratify this table explicitly.*
- D3: the delta between billed and contract payable is recorded as provider write-off/shortfall on the claim lines (fields exist in the engine output), respecting the contract's `BalanceBillingPolicy` for member-billability messaging.
**Fix specification:**
1. In the canonical decision service: run the contract engine for the claim's ACTIVE contract version (same engine as the preview panel — one engine, not a re-implementation). If the engine yields a deterministic total payable, the approved amount is capped at it; exceeding it triggers the D1 override path. FFS tariff-line ceiling behaviour (already present) is preserved and becomes one branch of the same check.
2. The decision UI must show, before submission: billed, engine payable, requested approval, and the delta — so the adjudicator is never surprised by the block.
3. Auto-adjudication (when later wired per FEATURE_STATUS #3) must call the same capped computation — note this dependency in that workstream.
4. Claims with **no** ACTIVE contract keep current judgement behaviour but the decision screen labels it explicitly ("no contract ceiling — reviewer judgement"), which the provider-detail page already warns about.
**Acceptance tests:**
1. `[UAT]` Re-run the CP-004 scenario exactly: case-rate contract, billed 86,000 → approving at 3,600 succeeds; approving at 86,000 is **blocked** with a message stating the ceiling and its source (PC-number + rule kind).
2. `[AUTO]` Engine-vs-enforcement parity: for each deterministic rule kind (D2 table), a fixture claim where preview payable = enforced ceiling — assert equality (this kills preview/enforcement drift permanently).
3. `[AUTO]` Override path: exceeding approval with override → OverrideRecord created (control code, reason, actor), approval-matrix request opened at the requested amount, claim proceeds only after the matrix path completes; without override → hard block.
4. `[AUTO]` FFS tariff-line ceiling regression: existing behaviour (rate × capped qty; excluded/unlisted-zero lines listed) unchanged.
5. `[AUTO]` `AVERAGE_COST_POOL` / unlisted-REFER lines → not capped, flagged for review (unchanged).
6. `[UAT]` Shortfall/write-off amounts appear on the claim financial summary and in contract analytics; member-billability text matches the contract's balance-billing policy.
7. `[UAT]` Claim at a provider with no active contract → decision screen shows the "no ceiling" label; approval unaffected.
**Size:** L. **Depends on:** W1.1; PR-009's error-surfacing pattern for the block/override messaging.

### PR-015 — Approval exceeding attached PA cover must warn (Medium)
**Design decision:** warn-and-confirm vs block. *Recommended: warn with mandatory confirmation note when approved ≤ limit but > PA cover; the confirmation is recorded in AdjudicationLog. (The PA is an authorisation, not a price — the contract ceiling of PR-014 is the hard control.)*
**Fix specification:** in the canonical decision service + UI: when the claim has attached PAs, compare requested approval to the sum of attached PA approved amounts; over-cover triggers the ratified warn/confirm flow; the WP-C2 cap-warning copy is surfaced on the attach panel as well (cover shown vs billed).
**Acceptance tests:**
1. `[UAT]` Approve at ≤ PA cover → no prompt.
2. `[UAT]` Approve above cover (CP-004: 86,000 vs 85,000) → warning showing cover, requested amount, and delta; requires explicit confirmation; confirmation note lands in AdjudicationLog `[SQL]`.
3. `[AUTO]` Multi-PA claim: cap = sum of covers; detaching a PA recomputes the cap.
4. `[AUTO]` No-PA claim → no prompt (regression).
**Size:** S. **Depends on:** W1.1.

### PR-017 — Approval matrix must be currency-correct (High)
**Root cause recap:** `claims/[id]/actions.ts` passes `currency: "UGX"` hard-coded with the raw claim amount; matrix bands are UGX; KES claims band-match ~27× low.
**Design decisions:**
- D1: conversion uses the tenant FX table (`FxRate`) **as of the decision date**; missing rate ⇒ **fail safe**: route to the highest-requirement band / open a multi-level ApprovalRequest, never the lowest. *Ratify.*
- D2: claims must carry an explicit currency (source: provider contract currency, else group/client currency). Verify the `Claim` model's currency field population across all intake channels; backfill rule for existing rows. *Ratify backfill = provider contract currency where determinable, else KES for the legacy demo book.*
**Fix specification:**
1. The canonical decision service resolves the matrix with (amount, claim currency); `ApprovalMatrixService.resolve` converts to the rule currency via `fx.service` before band matching; comparison logic covered by unit tests for both directions (KES→UGX, UGX passthrough) and unknown-currency fail-safe.
2. Sweep every other amount-threshold boundary for the same class of bug and fix in the same pattern — a written **FX boundary checklist** to be executed and attached to the fix PR: auto-adjudication ceiling policy (seed default "UGX 100,000" vs KES claims), senior-approval threshold ("KES 100,000 default" in `claim-adjudication.service.ts` — note it is denominated differently than the matrix!), fraud rule thresholds, fund balance alerts, analytics MLR inputs, settlement batch totals.
3. Display: wherever a threshold decision is shown, display both original and converted amounts with the rate used.
**Acceptance tests:**
1. `[AUTO]` Unit: KES 86,000 claim with FX 1 KES = 27 UGX → resolves against 2,322,000 UGX → matches the INPATIENT >200k dual-approval band (per seeded rules) — i.e. the CP-004 claim would now open an ApprovalRequest; assert it does.
2. `[AUTO]` Unit: UGX claim unchanged behaviour.
3. `[AUTO]` Unit: missing FX rate → fail-safe path (highest band / manual), plus an ExceptionLog entry.
4. `[AUTO]` Rate as-of-date: decision on date D uses the rate effective at D, not the latest row.
5. `[UAT]` Approvals console shows the request from test 1 with both currencies displayed; approving it as an authorised role completes the claim.
6. `[AUTO]` FX boundary checklist executed: each listed boundary has a unit test with a non-base-currency input proving correct conversion or documented exemption.
**Size:** M. **Depends on:** W1.1; D2 backfill decision.

### PR-018 — Claim approval + settlement must post to the GL with vouchers (High; June DEF-008)
**Design decisions (require finance sign-off, not just engineering):**
- D1: posting scheme. *Recommended baseline:* on APPROVED — Dr Claims Expense (per client/scheme dimension) / Cr Claims Payable–Provider, at approved amount, `sourceType: CLAIM_APPROVED` (the enum + seed precedent already exist). On settlement Mark Paid — Dr Claims Payable–Provider / Cr Bank–Operating per batch, one `PaymentVoucher` per batch with claim-level lines; claim `paidAt` set here (code comment already promises this).
- D2: self-funded schemes — the payable leg draws the scheme's `SelfFundedAccount` (a `FundTransaction` drawdown) instead of (or in addition to) the insurer expense account. *This must be answered by finance; the plan's tests cover both patterns behind the decision.*
- D3: reversals — VOID after approval posts a reversing JE; appeal adjustments post deltas. Vouchers are never edited, only cancelled-and-reissued.
**Fix specification:**
1. Posting occurs inside the same transactions as the state changes (decision service for approval; settlement service for paid), via the existing `gl.service` — no parallel posting path.
2. `PaymentVoucher` gains its numbering sequence, links batch + claims, and is visible from the settlement row and the provider's page.
3. Account mapping is configuration, not literals: the Chart of Accounts (24 seeded) mapping for claims expense/payable/bank per client is declared in one place and validated at boot (missing mapping ⇒ block settlement with a clear error, never silently skip).
4. Trial balance and account-ledger pages must reflect entries without schema change (they already read JournalEntry/JournalLine).
**Acceptance tests:**
1. `[AUTO]` Integration: approve claim of X → one balanced JE (Σdr=Σcr=X), correct accounts + sourceType + entity link `[SQL]`.
2. `[AUTO]` Integration: settle batch of N claims totalling T → one balanced JE for T + one PaymentVoucher with N lines totalling T; every claim `paidAt` set; batch↔voucher↔JE cross-links resolvable.
3. `[UAT]` Re-run the CP-004 settlement: `/billing/gl` trial balance remains **Balanced** and shows the new entries; account ledger for Claims Payable shows the in/out pair; voucher visible from the settlement screen.
4. `[AUTO]` VOID an approved-not-settled claim → reversing JE; net ledger effect zero; usage decrement of PR-016 test 6 occurs in the same transaction.
5. `[AUTO]` Self-funded claim (EABL demo scheme) → fund drawdown per ratified D2; fund statement + balance reflect it `[UAT]`.
6. `[AUTO]` Missing account mapping → settlement blocked with explicit config error (no silent skip, no unbalanced posting).
7. `[SQL]` Reconciliation invariant script: Σ(PAID claims approvedAmount) = Σ(settlement JE credits to Bank) + open payables — add to the data-integrity assertions.
**Size:** L. **Depends on:** W1.1 (approval hook), D1/D2 finance sign-off.

---

*(Continued in §W2–W5 below.)*

## W2 — Contract module operability

### PR-009 — Surface every contract lifecycle error in the UI (Medium; pattern reused across the app)
**Problem:** submit/approve/activate/withdraw server actions throw meaningful errors (`Segregation of duties…`, `Backdating requires override CONTRACT_BACKDATE…`) that the page discards: no toast, no message, state unchanged, button still enabled.
**Fix specification:**
1. Establish one **standard server-action result pattern** for the whole admin app: actions return `{ ok } | { error }` (or use an error boundary + toast contract); mutating buttons show pending state and disable during flight; failures render the server's message verbatim near the action; successes confirm.
2. Apply to all contract lifecycle actions first (submit for review, approve, request clarification, reject to draft, activate incl. "allow unsigned", withdraw), then adopt the same pattern in W1 (decision blocks) and W3 (provider forms).
3. Where an error names a remedy the user can act on (backdate override), the message includes a link/affordance: "Raise CONTRACT_BACKDATE override" pre-filled on the overrides console; approving that override unblocks Activate (verify the override path end-to-end — it is currently unexercised).
**Acceptance tests:**
1. `[UAT]` Maker clicks Approve on own contract → visible segregation-of-duties error; contract still UNDER REVIEW; no silent state.
2. `[UAT]` Activate with start >90 days past → visible backdate error naming the override; following the affordance creates the override request; once approved (by an authorised second user), Activate succeeds.
3. `[UAT]` Every lifecycle action shows success feedback on the happy path (submit → "submitted", etc.).
4. `[AUTO]` Component/integration test: action returning error renders the message; double-click during flight issues one request.
5. `[UAT]` Regression: PC-2026-002 (the stranded exhibit) can now be diagnosed from the UI alone by a user with no code access.
**Size:** M. **Depends on:** nothing (enables better W1 UX).

### PR-010 — DRAFT contracts must be editable; abandoned contracts must be closable (High)
**Design decisions:**
- D1: editable field set in DRAFT = all header/commercial fields captured at creation (dates, type, execution status, payment/submission/balance-billing/tax/recon/unlisted terms, external ref, notes). After first approval, header edits require withdraw-to-draft (existing) — ratify that a *superseding version* is the long-term mechanism and header-edit-in-draft the near-term one.
- D2: disposal of dead records — never-delete convention ⇒ add a terminal `VOIDED`-class status (or reuse an existing archival mechanism) reachable from DRAFT only, requiring a reason, excluded from default lists/dropdowns but visible under a filter and in audit.
**Fix specification:**
1. Edit affordance on the contract detail page while DRAFT (form mirrors `/contracts/new` fields, pre-filled); saving re-runs the validation panel; every save writes an audit event with a field-level diff.
2. Void action per D2 with confirmation + reason; voided contracts cannot be submitted/activated; provider contract summary excludes them.
3. Guard rails: no edits in UNDER_REVIEW/APPROVED/ACTIVE/SUSPENDED (server-enforced, not just hidden buttons).
**Acceptance tests:**
1. `[UAT]` Create draft with wrong start date → edit date in DRAFT → validation panel updates → submit → approve (second user) → activate succeeds (the exact PC-2026-002 failure now recoverable).
2. `[AUTO]` Server rejects header edit on a non-DRAFT contract even via direct action invocation.
3. `[SQL]` Audit event with before/after values for each edited field.
4. `[UAT]` Void PC-2026-002: reason captured; disappears from default `/contracts` list and any contract-selection dropdowns; still reachable via "voided" filter; audit entry present.
5. `[UAT]` Activation validation continues to gate correctly after edits (e.g. shrinking the window to exclude today re-raises the date gate).
**Size:** M. **Depends on:** PR-009 (uses the same feedback pattern).

### PR-008 — Render pricing rules in operator language (Low)
**Fix specification:** replace raw JSON in the Pricing rules list with a formatted rendering per `ruleKind` (e.g. "Per-visit case rate — KES 3,600 · carve-outs: MRI, CT scans, …"; "Discount — 15% off billed"; "Capitation — prepaid, encounters priced 0, pool P-x"); keep a "view raw" affordance for support; same rendering reused on the claim-detail contract panel where rules are cited.
**Acceptance tests:**
1. `[UAT]` Each of the six rule kinds displays formatted (fixture contract with all six); no `{`/`}` in rendered rule text.
2. `[UAT]` Claim contract panel cites rules with the same formatting.
**Size:** S. **Depends on:** none.

## W3 — Provider onboarding

### PR-005 — Provider create must confirm, redirect, and guard duplicates (Medium)
**Fix specification:**
1. On success: redirect to the new provider's detail page + success toast (match the clients-form pattern, which already behaves correctly).
2. Pending state disables the submit button (single-flight).
3. Tenant-scoped case-insensitive duplicate-name check: warn with "a provider with this name exists — open it / create anyway" (create-anyway allowed; hard uniqueness is not desirable for real-world chains — but see PR-007 branches, the usual right answer).
**Acceptance tests:**
1. `[UAT]` Create provider → land on its detail with confirmation; list shows exactly one row.
2. `[UAT]` Rapid double-click on submit → one record.
3. `[UAT]` Re-submitting an existing name → warning with link to the existing record; "create anyway" still possible and audited.
4. `[UAT]` Validation errors (missing required name/type/tier) surface inline (regression).
**Size:** S. **Depends on:** PR-009 pattern.

### PR-006 — Provider edit + status lifecycle in the UI (High)
**Design decision:** semantics of `PENDING`. UAT proved PENDING providers are selectable everywhere (contracts, PA, claims, settlement, offline codes) — so today the status is decorative. *Recommended: make it real — PENDING providers are excluded from operational selection (claim/PA/check-in/offline-code dropdowns) but visible in admin lists and contract capture; activation is an explicit ADMIN_ONLY action; SUSPENDED blocks new encounters but not settlement of existing claims.* This must be ratified — the alternative (auto-ACTIVE on create) is acceptable but must then remove the misleading status display.
**Fix specification:**
1. Edit surface for provider master data (contact, address, geo, services, payment terms) consuming the existing `providers.update` mutation; audit with diff (ties to PR-020).
2. Status control implementing the ratified lifecycle (activate / suspend / reactivate) with confirmation + reason; audit events.
3. Enforce the ratified selectability rules in every provider dropdown/search (claim wizard, PA form, offline codes, settlement batch creation, contract commit) — enumerate all six call sites found during UAT and update their queries consistently (one shared "operational providers" query helper, so future screens inherit it).
**Acceptance tests:**
1. `[UAT]` Edit phone/address → persists, shows on detail + list; audit diff `[SQL]`.
2. `[UAT]` New provider (PENDING) does **not** appear in claim-wizard/PA/offline-code selectors; does appear in admin list with PENDING badge (per ratified rule).
3. `[UAT]` Activate → appears everywhere; Suspend → disappears from new-encounter selectors, existing claims still settleable.
4. `[AUTO]` The shared selectability helper unit-tested for each status.
5. `[UAT]` RBAC: UNDERWRITER/CLAIMS cannot see edit/status controls; direct action invocation as non-admin rejected.
6. `[UAT]` Regression: LifeCare (UAT) can be activated and the CP-004 flow re-run unchanged.
**Size:** M. **Depends on:** PENDING-semantics decision; PR-009 pattern.

### PR-007 — Provider branch management UI + branch-scoped contract wiring (High)
**Fix specification:**
1. Branches card on provider detail: list / create / edit / deactivate branches (name, code, county/district, contacts, geo) and manage `ProviderAlias` rows (legal vs trading names) — consuming the existing `providerBranches` router.
2. Contract capture/detail: when `branchScope = LISTED`, a picker over the provider's branches populates `ContractBranch` rows; the applicability panel shows them; validation gate: LISTED scope with zero branches blocks activation (extend the V-gate list).
3. Claims/PA capture gain an optional branch selector for multi-branch providers; the contract engine's version resolution prefers a branch-scoped ACTIVE contract for that branch over ALL_BRANCHES, per the documented precedence (spec §7) — verify precedence exists; if not, specify: branch-scoped beats all-branches, latest effective wins within a tier.
4. Seed follow-up: create the real LifeCare branches (Bungoma, Migori, Eldoret, Mlolongo, Meru, Kikuyu) through the new UI and capture one SHA branch-scoped contract from the corpus — this un-descopes UAT seed item S5 and becomes its acceptance vehicle.
**Acceptance tests:**
1. `[UAT]` Create ≥2 branches + 1 alias on LifeCare; visible on detail; audit entries.
2. `[UAT]` Capture SHA-Kikuyu contract with `LISTED` scope → select Kikuyu → applicability shows the branch; activation blocked while zero branches selected (new V-gate), allowed after.
3. `[UAT]` Claim tagged Kikuyu prices under the SHA contract; claim tagged Bungoma falls back to the ALL_BRANCHES Jubilee contract (engine precedence proven via the preview panel on both claims).
4. `[AUTO]` Engine unit tests for precedence: branch-scoped > all-branches; no-match → no-contract behaviour.
5. `[UAT]` Deactivated branch no longer selectable on new encounters; historical claims unaffected.
**Size:** L. **Depends on:** PR-006 (shared provider admin surface), contract-engine precedence verification.

## W4 — Platform & provisioning

### PR-001 — Reproducible clean install with reference/demo separation (High)
**Fix specification:**
1. **Migration re-baseline:** generate a single squashed init migration from the live schema; mark it applied on existing databases (`migrate resolve`-equivalent procedure documented step-by-step, with the pg_dump safety snapshot as precondition); from then on all schema change flows through migrations — retire the db-push workflow and delete the MEDVEX_BUILD_LOG §1 warning by making it untrue.
2. **Deploy gate:** replace the build-time implicit `db push` (`scripts/db-sync.mjs`) with explicit `migrate deploy` as a separate, logged deploy step (never inside `next build`); document rollback expectations.
3. **Seed split:** `db seed` becomes reference-only (ICD-10, CPT, CoA, currencies/FX, tax rates, terminology, notification templates, RBAC roles/permissions, approval-matrix defaults, reason codes, override controls, service categories + aliases — i.e. absorb `scripts/seed-reason-codes.ts` and delete it as a separate step). Demo book (Kenyan groups/members/claims) moves behind an explicit `SEED_DEMO=true` flag or a separate `db:seed:demo` script. First-admin bootstrap (the one thing that can't be made via UI) is part of reference seed with a forced password-change flag.
4. **Runbook:** one documented install path (env template → migrate deploy → seed → worker → smoke checks) committed as `docs/INSTALL.md`; the June `.env` oddities (broken Puppeteer path) removed from the template.
**Acceptance tests:**
1. `[AUTO]` CI job: empty Postgres → migrate deploy → reference seed → app boots → healthcheck + login page 200. Runs on every PR touching schema/seed.
2. `[SQL]` Fresh reference-only DB: 0 members/claims/groups(non-system), but full reference counts (47 service categories, 107 aliases, 40 reason codes, 16 override controls, 24 CoA, ICD/CPT, currencies) — assert exact counts.
3. `[AUTO]` `prisma migrate diff` between freshly-migrated DB and `schema.prisma` → no difference.
4. `[UAT]` Demo seed opt-in produces the demo book on top without duplicating reference rows (idempotent re-run safe).
5. `[UAT]` Existing environments (`aicare`, `aicare_uat`) accept the baseline resolve procedure without data loss (verified on a restored copy of the pre-UAT dump first).
6. `[UAT]` Production build pipeline no longer mutates schema as a side-effect (build on a DB-less runner succeeds).
**Size:** L. **Depends on:** freeze on parallel schema changes during the re-baseline window.

### PR-002 — Worker must load environment or fail fast (High; June DEF-007)
**Fix specification:**
1. Worker entry loads the same env-loading mechanism as Next (dotenv at `src/server/jobs/worker.ts` bootstrap, or the npm script wraps with a dotenv runner) so `npm run worker` works from a clean shell.
2. Boot-time config validation: missing/placeholder `DATABASE_URL` or `REDIS_URL` ⇒ immediate exit non-zero with a one-line actionable error — **never** fall back to defaults (the OS-username DB fallback is what produced the silent failure storm).
3. Add a heartbeat/health signal (log line or key in Redis) so operations can detect a dead worker; document it in the runbook (PR-001 #4).
**Acceptance tests:**
1. `[UAT]` From a clean shell: `npm run worker` with only `.env` present → jobs process against the configured DB (observe one scheduled job complete).
2. `[UAT]` `DATABASE_URL` removed → process exits ≠0 within seconds, error names the variable; no job attempts logged.
3. `[UAT]` docker-compose path (env passed explicitly) unchanged.
4. `[AUTO]` Unit test on the config validator (missing/malformed/present).
5. `[UAT]` Heartbeat visible while running; absent after kill (alerting hook documented).
**Size:** S. **Depends on:** none.

### PR-020 — Close audit coverage gaps and make coverage testable (Medium)
**Fix specification:**
1. Add audit events (actor, entity, before/after payload) for the three proven gaps: provider create/update/activate (W3 delivers the mutations — audit lands with them), claim CAPTURED transition, contract child-entity mutations (pricing rules, exclusions, applicability, tariff lines, capitation, packages — add and remove).
2. **Coverage harness:** an automated audit-coverage test that walks a catalogue of "auditable mutations" (a maintained list: every server action/tRPC mutation that changes business state) and asserts each writes ≥1 AuditLog/audit-chain entry when invoked against a fixture — so new mutations without audit fail CI, converting audit completeness from a hope into a gate.
3. Sweep the full mutation surface once (all `actions.ts` + tRPC mutations) against the catalogue; document intentional exclusions (e.g. read-model refresh) in the catalogue file.
**Acceptance tests:**
1. `[UAT]` Re-run the CP-002/CP-004 action sequence → audit rows now include provider create, capture transition, each contract child add/remove, with actor + entity linkage `[SQL]`.
2. `[AUTO]` Coverage harness green on the full catalogue; deliberately removing one audit call turns it red (verified once as a meta-test).
3. `[UAT]` `/settings/audit-log` viewer renders the new event types legibly (no raw enum soup) and filters by user.
**Size:** M (harness) + S (the three gaps). **Depends on:** W1.1 & W3 (audits attach to final action set).

## W5 — Verification, exit criteria and re-test protocol

**No Go/No-Go re-evaluation until all of the following hold:**
1. **Defect closure:** every PR-00x above closed per its own acceptance tests; Critical/High items independently re-verified by someone other than the implementer, against a **fresh clean install produced by the PR-001 path** (this simultaneously proves provisioning).
2. **Side-effect contract suite green** (W1.1 test 1) plus the two `[SQL]` invariant scripts (PR-011 #8, PR-018 #7) wired into CI or a scheduled job.
3. **Baseline UAT re-run:** repeat the evidence scenarios exactly as recorded — CP-002 (contract lifecycle incl. the previously-silent errors now visible), CP-003 (membership + import), CP-004 (the full clinical/financial chain — expected new outcome: approval capped at 3,600 or overridden with record; ApprovalRequest opened at converted amount; usage/holds/UTILISED/GL all present), RB sweep (expectations updated per PR-019).
4. **Pending-workflow UAT executed:** the ~16 untested workflows in `03_Progress_Logs/Pending_Workflows.md` — at minimum the High-priority six (cases/HMS, endorsements incl. HR-initiated, quotation→bind, fund accounting, offline capture→sync loop, B2B API auth posture) — with defects triaged into this plan's format.
5. **Carry-over confirmation:** June items re-checked on the fixed build: DEF-001 (API key posture in the target deployment env), DEF-002 (B2B 500-vs-404), DEF-005 (security headers), member-documents 404, renewals drill-down 404 — closed or explicitly accepted with owner sign-off.
6. **Docs updated:** FEATURE_STATUS.md corrected where this plan changes reality (notably #3's "guarded by ceiling checks" claim — it must become true or be reworded); User_Roles/Workflows docs refreshed; INSTALL runbook merged.

### Test-infrastructure investments this plan assumes (build once, reuse everywhere)
- **Side-effect integration suite** (W1.1) — asserts DB side-effects, not just HTTP 200s, after each decision action.
- **Audit coverage harness** (PR-020) — CI gate on mutation auditability.
- **FX boundary checklist + tests** (PR-017) — one test per amount-comparison boundary.
- **Clean-install CI job** (PR-001) — provisioning proven on every schema/seed PR.
- **rb-sweep.mjs** kept as the RBAC regression tool (system-Chrome caveat documented in `06_Test_Results/Role_Based_Test_Results.md`).

### Indicative sequencing (single senior pair on W1; second engineer on W0+W2+W3; platform hand on W4)
- Week 1: W0 complete; W1.1 consolidation designed + ratified decisions D-list signed; PR-009 pattern landed.
- Weeks 2–3: W1 (PR-016 → 011 → 014 → 015 → 017), PR-010/PR-008, PR-005/006 in parallel.
- Week 4: PR-018 (with finance sign-off), PR-007, PR-001/002/020.
- Week 5: W5 verification pass + pending-workflow UAT + Go/No-Go.

*All estimates assume no scope growth from the pending-workflow UAT; treat week 5's findings as a fresh triage input.*
