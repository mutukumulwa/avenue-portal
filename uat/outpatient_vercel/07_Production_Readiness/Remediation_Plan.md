# Remediation Plan — Outpatient Front-End UAT defects (Vercel)

Grounded in the code as of 2026-07-07. Each item names the root-cause file, the fix, the **class of similar/untested workflows** it also covers, and how it's verified.

## P0 — Blockers (must fix to lift NO-GO)

### PR-V02a — Settlement "Mark Paid" times out
- **Root cause:** `src/server/services/claim-adjudication.service.ts › markSettlementBatchPaid` runs one interactive `prisma.$transaction` that (a) posts the GL JE + voucher and (b) **loops `tx.claim.update()` once per claim** (lines 512–522). On Vercel serverless → remote Postgres, 46 sequential round-trips exceed the default 5000 ms interactive-transaction limit → the whole settle rolls back; batch stranded at CHECKER_APPROVED.
- **Fix:** replace the per-claim loop with **two set-based statements** inside the tx: `tx.claim.updateMany({ where: { settlementBatchId }, data: { status: PAID, paidAt, paymentVoucherId } })` for the constant fields, and one `tx.$executeRaw` `UPDATE "Claim" SET "paidAmount" = "approvedAmount" WHERE "settlementBatchId" = …` for the per-row payable. Pass `{ maxWait: 15000, timeout: 60000 }` to `$transaction` as defence-in-depth.
- **Similar/untested workflows this class covers (audited):** every `$transaction` that mutates a variable-size set. Audited all `$transaction` sites — only settlement iterates over an unbounded set (a monthly batch). `claim-decision`, `contract-engine/persist`, PA/hold loops iterate over **one claim's lines/PAs** (bounded, small) — left as-is but timeout guard added where they touch many rows. Bulk claims import (`adjudicateLineItem`/Excel import) already batches.
- **Verify:** unit — update `tests/services/settlement-gl.test.ts` to assert `updateMany` + `$executeRaw` (not N updates) and a balanced JE/voucher. Front-end re-test — settle the stranded Aga Khan batch → SETTLED, provider "paid to date" + member/reports reflect PAID, GL posts balanced provider-payment JE.

### PR-V02b — Raw DB error leaked to the UI/URL
- **Root cause:** settlement (and ~40 other) server actions do `redirect(?error=${encodeURIComponent(err.message)})`, rendering the raw Prisma message (table/method/transaction internals) verbatim in a banner and the URL.
- **Fix:** new `src/lib/safe-action-error.ts › safeActionError(err)` — re-throws `NEXT_REDIRECT`; returns the message only for our controlled errors (`TRPCError`, thrown `Error` from validation gates); otherwise logs the real error server-side (`console.error`) and returns a generic *"Something went wrong — please retry or contact support."* Apply to the settlement, claims-decision, and approvals money actions first, then sweep the rest.
- **Class covered:** all server actions that surface caught exceptions to the user. Prevents information disclosure across the app.
- **Verify:** typecheck; a forced-failure returns the generic string, not Prisma internals.

## P1 — Clear logic bugs

### OBS-5 — Fraud variance over-fires (whole-claim billed vs one line's rate)
- **Root cause:** `computeContractedRateVariance` sums `totalBilled` over **all** lines but `totalContracted` only over lines that resolved a contracted rate; a claim mixing tariffed (consultation 3,500) + untariffed (lab 8,000, pharmacy 5,000) lines yields `(16,500−3,500)/3,500 = 371%` → false HIGH fraud alert on essentially every mixed claim.
- **Fix:** accumulate `billedForContractedLines` in the same loop and compute `variancePct = (billedForContractedLines − totalContracted) / totalContracted`. Untariffed lines are out of scope for a billed-vs-contracted comparison (they're governed by the contract's "unlisted → manual review" rule, not upcoding). Consultation billed 3,500 vs contracted 3,500 ⇒ 0% ⇒ no alert.
- **Class covered:** every provider claim with a mix of tariffed/untariffed lines (i.e. most real outpatient claims) — restores the fraud signal and reduces manual-review load.
- **Verify:** `tests/services/fraud-engine.service.test.ts` / adjudication test — mixed claim ⇒ variance≈0, no CONTRACTED_RATE_VARIANCE alert; genuinely upcoded tariffed line ⇒ still flags.

### PR-V01 — Provider search misses existing facilities
- **Root cause:** `src/app/(admin)/providers/page.tsx` queries `provider.findMany({ where: { tenantId } })` with only a `page` param; the search box filters **client-side over the current page's 50 rows**, so facilities on other pages (Nakasero, IHK) never match.
- **Fix:** add a `q` searchParam; server-side filter `name/type/tier/county contains q` (case-insensitive) with `page` reset to 1 on new query; wire the search box as a GET form (or debounced push) submitting `q`. Keep counts consistent with the filtered set.
- **Class covered:** any paginated admin list whose search is client-side only — audit members/claims/groups search similarly (members search is already server-side per q — confirmed working in UAT).
- **Verify:** search "Nakasero"/"IHK" returns the facility.

## P2 — Correctness/UX polish

### OBS-4 — Contract-engine preview contradicts the adjudication ceiling
- **Root cause:** two contract-resolution paths — the digital **contract engine** (`ContractEngine.evaluateClaimById`, shown in the read-only "Contract engine" panel) said *no contract matched / payable 0*, while `ProviderContractsService.resolveClaimLineRates` (used by the adjudicate panel + variance) resolved PC-2026-128 and a 16,500 ceiling. The preview misleads adjudicators.
- **Fix (staged):** short-term — when the engine returns no match but the tariff resolver prices the claim, relabel the panel ("Priced via tariff schedule — engine contract not linked") instead of "payable 0". Long-term — converge the two resolvers (link provider tariff schedules into the digital-contract engine) so preview == adjudication. Long-term tracked separately (architectural).
- **Verify:** claim with tariff-priced lines shows a non-misleading preview.

### OBS-2 — Currency labels inconsistent (KES vs UGX)
- **Root cause:** money screens hardcode `KES` (e.g. settlement page `fmt`, GL page) while the claim/tenant currency is UGX; amounts are numerically identical (no FX conversion).
- **Fix:** use the claim/tenant `currency` field for labels on the settlement, claim financial-summary, and GL money displays instead of a hardcoded "KES". Confirm a single settlement currency per tenant; if multi-currency is ever real, add explicit FX at posting time.
- **Verify:** the same claim shows one consistent currency everywhere.

### OBS-6 / OBS-1 — Nav + list refresh polish
- OBS-6: hide nav links a role can't open (e.g. "Exceptions" for CLAIMS_OFFICER) — drive the sidebar off the same permission the route guard uses.
- OBS-1: after "Invite User", `revalidatePath('/settings')` / `router.refresh()` so the users list re-renders without a manual reload.

## OBS-7 — Approval gate for fraud-flagged approvals (policy)
- **Observation:** a single CLAIMS_OFFICER approved a fraud-flagged, high-variance claim to full billed with no second approval and no fraud-alert clearance (approval was within the payable ceiling ⇒ no override required).
- **Recommendation (needs product sign-off):** before an APPROVE decision finalises on a claim with an **open** `ClaimFraudAlert` (severity ≥ MEDIUM), require either (a) the alert be resolved/cleared by a fraud/medical reviewer, or (b) a second approval via the existing approval-matrix / `approval-request.service`. Once OBS-5 lands, far fewer claims carry alerts, so this gate becomes meaningful rather than blanket. Implement behind a tenant setting. Not changed in this pass without sign-off (changing approval policy silently is riskier than the gap).

## Execution order & verification
1. P0 PR-V02a + PR-V02b (safe-error helper, settlement fix, test update).
2. P1 OBS-5, PR-V01.
3. P2 OBS-4 (relabel), OBS-2 (currency), OBS-6/OBS-1 as scoped.
4. `npm run typecheck`; `npx vitest run` for settlement-gl, fraud-engine, claim-decision suites.
5. Front-end re-test (Phase R): settle a fresh batch to PAID; re-file a mixed claim and confirm no false fraud flag; provider search finds Nakasero/IHK.

---

## EXECUTION STATUS (2026-07-07) — fixed in code, **NOT yet re-verified on Vercel**

> Per the UAT method a code fix does not lift the NO-GO. The verdict changes only after an independent front-end re-test on the Vercel deployment (Phase R). Everything below is landed in the working tree with `tsc` clean and **468 unit tests green** (465 existing + 3 new).

| Item | Status | Change |
|------|--------|--------|
| **PR-V02a** settlement timeout | ✅ fixed in code | `markSettlementBatchPaid` now settles the batch with `updateMany` + one raw `UPDATE … paidAmount = approvedAmount` (2 statements, any batch size) inside a `$transaction` with `{ maxWait: 15000, timeout: 60000 }`. `src/server/services/claim-adjudication.service.ts`. |
| **PR-V02b** raw error leak | ✅ fixed in code | New `src/lib/safe-action-error.ts`; applied to settlement, claims-decision, and approvals actions — TRPCError/validation messages surface, Prisma/low-level errors log server-side and show a generic line. |
| **OBS-5** fraud variance | ✅ fixed in code | Variance now compares billed-of-tariffed-lines vs contracted (like-for-like). `src/server/services/claim-adjudication.service.ts` + new `tests/services/contracted-rate-variance.test.ts`. |
| **PR-V01** provider search | ✅ fixed in code | Server-side `q` filter (name/county/phone contains + type/tier enum match); `ProvidersTable` debounce-pushes `?q=`. `src/app/(admin)/providers/{page.tsx,ProvidersTable.tsx}`. |
| **OBS-4** contract preview | ✅ fixed in code | Caveat banner on the ContractPanel when no digital contract is linked but the claim is tariff-priced. `src/app/(admin)/claims/[id]/ContractPanel.tsx`. |
| **OBS-2** currency labels | ◑ partially fixed | Settlement (admin + provider) and claim financial-summary / variance panel now use `claim.currency` / base **UGX** instead of hardcoded "KES". **Remaining:** app-wide `KES` sweep (GL page, member/provider portals, reports) + real **FX normalisation** for non-base-currency claims and mixed-currency settlement batches (design task). |
| **OBS-6** dead nav link | ✅ fixed in code | "Exceptions" nav item re-scoped to `ADMIN_ONLY` to match the route guard. `src/components/layouts/AdminSidebar.tsx`. |
| **OBS-1** blank users pane | ✅ fixed in code | Invite action returns `{ ok }` instead of `redirect()`; modal closes + `router.refresh()`es. `src/app/(admin)/settings/{actions.ts,InviteUserModal.tsx}`. |
| **OBS-7** approval gate | ⏸ documented, needs sign-off | Recommendation above; not implemented to avoid silently changing approval policy. Post-OBS-5, far fewer claims carry alerts, making a fraud-alert-clearance / 2nd-approval gate meaningful. |

### Remaining work (tracked)
- **OBS-2 broad:** currency sweep + FX normalisation + mixed-currency settlement batch handling (a settlement batch summed NWSC-UGX + EABL-KES claims — genuinely wrong to add; needs base-currency normalisation at settle time).
- **OBS-7:** implement the approval/fraud-clearance gate behind a tenant setting once product confirms the policy.
- **OBS-4 long-term:** converge the digital-contract engine with the provider-tariff resolver so the preview and the adjudication ceiling agree at source.
- **Phase R front-end re-test on Vercel** (the only thing that lifts the NO-GO).
