# FORK B — Kickoff & Instructions (self-contained)

**You are a fresh session starting on branch `fix/full-go-fork-b` (forked from `origin/main`).**
This document is written to be executed **cold**, with no prior conversation context. Read it fully before
coding. It carries every environment fact, protocol, and work package you need. When a file/line reference
may be stale, the function name + an `rg` search term is given — locate by search, not by trusting a line
number.

Companion docs (already in the repo, read them for depth): `FULL_GO_EXECUTION_PLAN.md` (esp. **§8 — the
deferred backlog**), `FULL_GO_RUN_LOG.md` (what was tested and found), `FULL_GO_DEFECT_REGISTER.md` (defect
table with fix status).

---

## 0. Where things stand (context you inherit)

A CONDITIONAL-GO → GO remediation shipped 12 code work packages (**WP-A1…A12**) that are **merged to `main`
and deployed** to the test environment. Your fork picks up the **deliberately-deferred** items — each needs a
data-model change and/or a product decision, so they were held back from the shipped batch.

**Already fixed + deployed (do NOT redo):** claims API validation/idempotency (BB2-DEF-01/02/03), offline
pack scoping (FG-C1), HMS batch key-binding + per-line quarantine (FG-C3/C4), operator channel, fraud-gate
settlement quarantine (OBS-H1), ceiling preview (OBS-B7), login throttle message (OBS-K1), and the **SYS-1
concurrency sweep** — settlement Mark Paid (FG-C7), endorsement approve (FG-C6), PA decide (FG-C8), case file
(FG-C9) — plus the FG-C5 pre-coverage intake gate (under-block half). Family K privacy sweep all PASS.

**Your job (this fork) = WP-B1, WP-B2, WP-B3 below**, then optionally the residual UAT (§5).

---

## 1. CRITICAL environment facts (do not re-derive)

- **`avenue-portal.vercel.app` is a TEMPORARY TEST environment, NOT real production.** Everywhere the docs
  say "prod" they mean this test env. It holds **seeded demo data** (a synthetic ~2,999-member book, some
  claims marked PAID directly, some future-dated) — so seed-hygiene oddities are expected, not defects.
- **Database:** Supabase project **`otivyuroqraiijayvkze`** (name "AiCare"). Tenant **medvex =
  `cmr3ae8v30000nlvqxrqlfn38`**. Read/write via the Supabase MCP tools (`execute_sql`, `apply_migration`).
  Local `.env` `DATABASE_URL` points at a **different** local DB (`aicare_uat`), not this one — never assume
  local == the deployed test DB.
- **Vercel:** team **`team_rtu3aHb4QVeumVyh6f2XUqCm`**, project **avenue-portal**
  (`prj_XtdfOga8W86q0IBYtecB91qlnbTA`). Monitor deploys via the Vercel MCP (`list_deployments` with a
  `since` epoch-ms, then `get_deployment` by id; state goes `BUILDING` → `READY`/`ERROR`).
- **Schema is `prisma db push`-managed (no migration history).** **LESSON (will bite you):** the Vercel
  production build runs `scripts/db-sync.mjs` → `prisma db push` **without `--accept-data-loss`**, so it
  **refuses to add a unique index/constraint** and the whole build fails. To ship a schema change: (1) verify
  0 conflicting rows, (2) apply it out-of-band FIRST via Supabase `apply_migration` using **Prisma's exact
  object name** (`"<Model>_<col1>_<col2>_key"` for `@@unique`), (3) then push code to main — `db push` sees it
  present and no-ops. WP-A2's `Claim_tenantId_providerId_externalRef_key` was done exactly this way.
- **GIT LESSON:** the local `main` ref is **stale** (deploys were pushed via `git push origin HEAD:main`,
  which updates `origin/main` but not local `main`). **Always `git fetch origin main` and compare against
  `origin/main`**, never local `main`, for `git log origin/main..HEAD`, schema-diff, and FF checks.
- **Deploy = push to main.** `git push origin HEAD:main` (clean fast-forward) triggers the Vercel prod build.
  Confirm the branch is green + fast-forwards from `origin/main` first. **Get the human's explicit go before
  each push to main — it is an irreversible deploy to the shared test env.**

---

## 2. Mandatory execution protocol

1. Read `AGENTS.md`. This repo's Next.js has **breaking changes vs. training data** — before editing any
   Next page/route/server action/caching, read the relevant guide under `node_modules/next/dist/docs/`.
2. **Green gate before every commit** (all must pass):
   ```bash
   npx tsc --noEmit
   npx vitest run            # ~670 tests currently green — keep them green
   npm run brand:guard && npm run currency:guard
   ```
   `vitest run` does NOT typecheck (esbuild strips types) — a test can pass at runtime and still fail `tsc`.
   Always run `tsc` too.
3. One commit per work package: `fix(<area>): FG-<id> — <summary>`, ending with:
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
4. Never weaken a guard/test to make it pass. If an existing test breaks because it asserts old behaviour,
   update the assertion to the new behaviour — don't delete coverage.

### The reusable pattern you will apply (SYS-1 atomic status-claim)
The A-series fixes replaced **check-then-act** state transitions (read status with `findUnique`, validate it
*outside* a transaction, then `update({ where:{ id } })`) with an **atomic status-guarded claim**:
```ts
const claimed = await tx.<model>.updateMany({
  where: { id, tenantId, status: { in: [<allowed pending states>] } },
  data:  { status: <next>, /* + the fields the transition sets */ },
});
if (claimed.count !== 1) {
  throw new TRPCError({ code: "CONFLICT", message: "… was just actioned by another user — refresh." });
}
// …only the winner reaches the side effects (voucher/GL/member/hold/etc.)
```
Do it as the **FIRST write in the transaction** so the loser rolls back before any side effect. **Reference
commits to copy:** `6cb44ba` (settlement Mark Paid), `3114df9` (endorsement/PA/case). **Reference loser
tests:** `tests/services/settlement-gl.test.ts`, `tests/services/case.service.test.ts`,
`tests/services/preauth-holds.test.ts`, `tests/services/endorsement-concurrency.test.ts` — each mocks
`updateMany` to `{ count: 0 }` and asserts no side effect fired.

---

## 3. WORK PACKAGES

### WP-B1 — FG-C10: make benefit-hold expiry live (not silently worker-only) — Medium

**Problem.** Expired PA holds are released **only** by the worker: `releaseExpiredHolds` (find it with
`rg -n "releaseExpiredHolds" src/server/services/preauth-adjudication.service.ts`) is called only from
`src/server/jobs/preauth-escalation.job.ts`. And `BenefitUsageService.availableLimit`
(`rg -n "static async availableLimit" src/server/services/benefit-usage.service.ts`) computes
`held` from the **stored** `activeHoldAmount` with **no live `validUntil`/`expiresAt` check**. So if the
worker is down or lagging, expired holds never release → `activeHoldAmount` stays inflated → members are
silently **over-reserved** and claims get wrongly declined "insufficient balance".

**Fix.** Compute the held amount **live** from the `benefitHold` table — rows where
`status = "ACTIVE" AND expiresAt > now()` — for the member+category, instead of (or reconciled against) the
stored `activeHoldAmount`. The `benefitHold` model is unique on `preAuthId` and carries
`memberId, benefitCategory, heldAmount, expiresAt, status` (see `createBenefitHold` in the same file).

**⚠️ HARD CONSTRAINT — this is why it was deferred, not batched.** `availableLimit` feeds claim
adjudication, PA approval, the offline pack, and eligibility. The current behaviour **fails safe**
(over-reserves, never overpays). Your change **must never yield a *larger* available balance than today** —
i.e. it must never *enable overspend*. Design so a live sum can only *free* benefit that already expired,
never add cover. **Write tests that prove it can't under-reserve** (e.g. an ACTIVE non-expired hold still
counts; an expired hold frees; the available never exceeds `limit − used − activeHoldAmount` when nothing is
expired). Consider computing `held = max(live-active-hold-sum, 0)` and asserting `available` ≤ the old value.

**Acceptance:** unit tests green (incl. the never-under-reserve tests); full gate green. If you add/verify DB
state on the test env, use the Supabase MCP read-only.

---

### WP-B2 — FG-C5 over-block: point-in-time termination (coverage-end model) — Medium + PRODUCT DECISION

**Problem.** Eligibility resolves by **current** `member.status`. A TERMINATED/SUSPENDED member's claim for a
service date when they *were* covered is wrongly declined, and there is **no coverage-end concept**. The
under-block half (reject a service date *before* `enrollmentDate`) already shipped in WP-A12 — see the
"Coverage-start gate (FG-C5" block in `src/server/services/claim-intake.ts`
(`rg -n "FG-C5" src/server/services/claim-intake.ts`).

**BLOCKED on a product decision (surface it, don't guess):** *Is point-in-time termination in scope, and what
is the coverage-history model?* Likely a `Member.coverageEndDate` (additive nullable column — remember the
out-of-band schema step in §1) or a membership-period table.

**Fix (after the decision):** gate `dateOfService` within `[enrollmentDate, coverageEndDate]` in
`runClaimIntake` (next to the existing FG-C5 under-block gate), evaluating status/coverage **as of the service
date** rather than "now". **Parity check:** the B2B API rail `src/app/api/v1/claims/route.ts` has its OWN
member/status checks (it does not call `runClaimIntake`) — the coverage-date gate should be added there too
for cross-rail parity (the under-block gate is currently only on `runClaimIntake`; note that gap).

**Acceptance:** the decided model is applied additively; intake rejects a service date outside the coverage
window; unit tests cover before-start, in-window, and after-end; full gate green.

---

### WP-B3 — SYS-1 remnants: binding & amendment + audit sweep — Medium

**Problem.** The C8 spot-check found the same check-then-act pattern still in two portfolio-ops surfaces:
- `src/server/services/binding.service.ts` — quotation `status !== "SENT"` / `!== "ACCEPTED"` then `update`
  (`rg -n "status !== \"SENT\"|status !== \"ACCEPTED\"|quotation.update" src/server/services/binding.service.ts`)
  → concurrent quote-accept / double-bind.
- `src/server/services/amendment.service.ts` — endorsement `status !== "DRAFT"` then `update`
  (`rg -n "status !== \"DRAFT\"|endorsement.update" src/server/services/amendment.service.ts`).

**Fix.** Apply the §2 atomic status-claim pattern to each (status-guarded `updateMany` → `count===1` else
CONFLICT, as the first write). Add loser tests mirroring the reference tests.

**Also do a one-off audit sweep** for any remaining instances:
```bash
rg -n "findUnique" src/server/services | rg -i "status"      # candidates
# then inspect each for a following update({ where: { id } }) on a state machine
```
**Do NOT touch** `src/server/services/member-payment.service.ts` — the M-Pesa rail is already safe
(idempotent via `MemberCoContributionPayment.checkoutRequestId @unique` + `idempotencyKey`).

**Acceptance:** binding + amendment transitions are atomic with loser tests; sweep documented (fix or
"already guarded by <constraint>"); full gate green.

---

## 4. When each WP is done

- Green gate, commit per WP (§2).
- Update `FULL_GO_DEFECT_REGISTER.md` (mark FG-C10/FG-C5-over-block/binding/amendment fixed with the commit
  sha) and `FULL_GO_RUN_LOG.md`.
- **Deploy:** confirm green + `git fetch origin main` + fast-forwards, **ask the human**, then
  `git push origin HEAD:main`; monitor the Vercel build to READY (schema step: §1 if you added an index/column).
- Re-verify what's practical: concurrency guards are unit-verified (live race-reproduction needs a harness);
  the FG-C5 coverage gate is testable via the admin claim wizard (`/claims/new`, 4 steps) or a targeted rail.

---

## 5. Residual UAT (optional, run via the `/uat` skill — needs env/worker control)

Not full-GO blockers but named conditions in the verdict:
- **Family F** — check-in / encounter binding (one-time, time-bound, facility-bound challenge; replay,
  expiry, cross-facility reuse).
- **Family N worker-pause war-game (N4–N7)** — pause the worker in an approved window; verify the UI surfaces
  degraded/stale state (not just the heartbeat), backlog drains exactly-once, restart doesn't double-register,
  and the time edges hold (Africa/Kampala midnight, month/year end, leap day, clock skew).
- **Family R (full per-module)** — billing/admin-fee, bank recon, commission payout, wallet callbacks,
  cross-border FX, DSAR, wellness/health-vault.
- **C9 scale** — the ~2,997-member book under the §5 load portfolio (Outstanding-Conditions Ticket 6 harness),
  off-peak.

---

## 6. Real-prod cutover checklist (separate from this fork's code work)

For when the real production infra replaces the Vercel test env:
- Clean production data load (the test env's seeded/direct-PAID/future-dated demo data must NOT carry over) +
  a conservation tie-out on real transactions.
- **Rotate the operator API key** (`node scripts/generate-api-key.mjs prod` → set `API_KEY` in the real env →
  redeploy). The current test-env key was shared in a prior chat.
- Set the real-env Vercel vars (`API_KEY`, `OPERATOR_TENANT_ID`, `PLATFORM_TENANT_SLUG`).
- Run the remaining D-gate (D-8 fraud-gate toggle, D-11 N3 employer-scoping sign-off + apply) and the §5
  residual UAT against real data.
- Populate `Provider.slade360ProviderId` if the operator **write** channel is needed (0/195 have it today, so
  operator-key claim *creation* 404s — reads work; facility keys are the intended write path). See OBS-B1.

---

## 7. Suggested order

1. **WP-B3** first (self-contained, no schema, no product decision — quickest win, extends the proven pattern).
2. **WP-B1** next (careful — the never-under-reserve constraint; write the safety tests first).
3. **WP-B2** — raise the product decision (coverage model) early; implement once decided.
4. Residual UAT / cutover as separate efforts.
