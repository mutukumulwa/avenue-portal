# Inpatient — Technical Debt & Untested-Risk Register

**Owner:** eng + UAT · **Opened:** 2026-07-19 · **Context:** carried forward from the inpatient
interim-settlement remediation (branch `fix/inpatient-slice-case-pa`, merged `ef912cf`, deployed prod).

This is the running list of what is **known but not yet done** for the inpatient line. Nothing here blocks
what already shipped (IPL-001 interim settlement + IPL-PA-01 case-PA read-through + the Low fixes are in
prod and verified). It is the honest backlog between "CONDITIONAL GO / prior-defect gate closed" and a
**clean unconditional GO**, plus the code-level debt surfaced while fixing IPL-PA-01.

Status legend: **OPEN** (not started) · **PARTIAL** (some evidence, not complete) · **DECISION** (needs a
product/sponsor call). Priority: **P1** (do before a clean GO) · **P2** (should) · **P3** (nice-to-have).

Cross-refs: `uat/inpatient_longitudinal_2026-07-17/REMEDIATION_EXECUTION_PLAN_2026-07-19.md` (the plan),
`.../runs/2026-07-18_local_02/outputs/GAP_REGISTER.csv` (finding IDs),
`.../INPATIENT_LONGITUDINAL_LIMITS_AND_SETTLEMENT_UAT_PLAN.md` (§ numbers).

---

## A. Untested-risk register — UAT breadth owed for a clean unconditional GO

These are **verification gaps, not known bugs** — real risk areas the campaign has not independently
exercised on the fixed build. Each is a UAT pass, mostly on the disposable Lima VM (`limactl shell
uat-inpatient`, controlled clock 2026-08-01). Re-seed a couple of member fixtures first (see §D). Proven
mechanics (interim settlement, availability gate, package unbundling, readmission, prior-defect gate) are
**not** re-listed here — see the run-02 verdict + the 2026-07-19 prior-defect gate evidence.

| # | Area (plan §) | What is unproven | How to close | Prio |
|---|---|---|---|---|
| A1 | **Privacy / RBAC (§23)** | Per-actor list + deep-link scope for provider / member / HR / fund / reports users against inpatient cases, slices, PAs, GL. No foreign-scope or excessive-clinical-data access. | Drive each persona through the UI (or scoped service calls) and attempt cross-tenant / cross-client / cross-provider reads; assert 403/empty, never foreign data. §29.9 is an automatic NO-GO if a foreign-scope read succeeds. | **P1** |
| A2 | **Reporting + GL / trial-balance tie-out (§24)** | The seven-ledger case reconciliation was proven at the case level and the GL nets to zero (OBS-IP-GL balanced 2026-07-19), but the **reports/exports** were not independently reconciled back to the ledgers (billed / allowable / approved / member-share / write-off / outstanding / settled-to-date). | Run each inpatient report + CSV export; tie the totals to `getCaseReconciliation` + the GL trial balance for the same period. Reconcile provider statement vs claims vs settlement batch. | **P1** |
| A3 | **Maker/checker SoD via distinct personas (SET-09)** | Adjudication + settlement were driven **service-level** with `matrixSatisfied`/service calls in the probes. The approval-matrix + maker≠checker segregation was not proven through the UI as **separate** finance users. | Log in as two distinct finance users; prove a >200k inpatient claim needs the 2nd approver, the maker cannot self-approve (SoD throw), and settlement maker≠checker is enforced end-to-end in the UI. | **P1** |
| A4 | **Concurrency (LIM-01 / LIM-03)** | Two racing approvals on one balance, and family-pool concurrency, were proven for the **outpatient** path (`benefit-race.integration.test.ts`) but not re-exercised on **inpatient slices** / the shared-family pool on the fixed build. | Fire two concurrent `decide` calls on sibling slices of one case sharing one balance/PA (the new in-tx PA re-read is the thing to stress); and two concurrent approvals on a SHARED_FAMILY pool. Assert exactly one commits, no double-spend, no double-credit of a PA hold. | **P2** |
| A5 | **Full day-by-day scenario narratives (§12–17)** | Each of the six scenarios' **key binding test** was exercised (maternity, Boda, stroke limit-exhaustion, malaria partial, burns package, foot readmission), but not the full per-day LOS / bed-day / per-line-version detail across the admission with Friday interim slices. | Run each scenario end-to-end day-by-day on the controlled clock with weekly `cutInterimSlice`, seven-ledger recon each Friday, and the final close. | **P2** |
| A6 | **Provider-portal reconciliation parity (§11.9)** | The admin/ops reconciliation panel proves the money control; the **provider-portal** view of billed/approved/paid/outstanding/remaining-guarantee for an open sliced case is a documented fast-follow, not built. | Build or verify the provider-portal recon view mirrors `getCaseReconciliation`; part of A1's privacy pass. | **P2** |

---

## B. Code-level technical debt (surfaced during the IPL-PA-01 fix)

Concrete code items, each with a location and a suggested fix. None are shipping bugs in the money path
(the availability gate + cover cap + read-through keep money safe); they are hardening / correctness
follow-ups. IDs match the gap register where present.

### B1 — OBS-PA-LINK-01: `createClaim` PA auto-link is under-scoped · ✅ **FIXED 2026-07-21**
`ClaimsService.createClaim` ([src/server/services/claims.service.ts](../src/server/services/claims.service.ts))
auto-linked an approved PA by `memberId + benefitCategory + status + claimId:null` (+ `caseId:null`), but
filtered **neither `providerId` nor `tenantId`** — so a member with an approved PA at facility X could have
it auto-linked to a direct claim at facility Y (cross-facility guarantee hijack). **Fixed:** the `findFirst`
where now includes `tenantId` + `providerId: data.providerId`, mirroring the already-scoped intake path
(`claim-intake.ts:161-171`). A GOP guarantees a specific facility, so this is the correct narrowing. No
host unit test covers `createClaim`'s auto-link directly (integration-only); the change is a query narrowing
proven by the existing intake-path parity + the interim-settlement integration suite (same-provider PA).

### B2 — OBS-PA-VOID-01: voiding a claim does not refund PA cover · **DECISION / P3**
`ClaimDecisionService.voidClaim` reverses benefit `used` + GL + fund, but does **not** restore the consumed
PA's `utilisedAmount` or re-activate its hold. True for **all** PA-covered claims, not just slices —
pre-existing, unchanged by the fix. **Decision needed:** should a void refund PA cover (re-open the
guarantee) or is the PA considered spent? If refund is intended, mirror the utilisation decrement in
`voidClaim`. Low frequency (void-before-settle only).

### B3 — OBS-PA-EXP-01: PA validity is not re-checked at decision time · ✅ **FIXED 2026-07-21 (gate-level)**
`decide()` did not check `PreAuthorization.validUntil` when it consumed a PA, so an expired-but-not-yet-swept
PA silently satisfied the PA-required gate with no operator signal. **Fixed:** the PA-required gate in
`ClaimDecisionService.decide` ([claim-decision.service.ts](../src/server/services/claim-decision.service.ts))
now blocks with a clear *"Pre-authorization … has expired — renew or extend … or decline the line(s)"*
message **only** when every securing PA is a non-`UTILISED`, explicitly-expired one. Precisely scoped so it
never false-blocks: a `null` `validUntil` never expires (open-ended guarantee), and a `UTILISED` PA always
satisfies the gate (the F6 long-stay final-bill case — the episode *was* authorised). 5 targeted unit tests
in `tests/services/claim-decision.service.test.ts` (block / allow-when-valid / F6-UTILISED / mixed-expired+live
/ null-validUntil regression). **Residual (intentional, out of scope):** the *money* path (availability
credit + cover cap) still consumes an expired-but-unswept PA's remaining cover — that is the fail-safe
direction the expiry sweep (`releaseExpiredHolds`) already handles, and changing it would touch the
just-verified availability spine. This WP closes the operator-signal gap the observation was raised for.

### B4 — Count-based document numbering collides on non-contiguous DBs · ✅ **FIXED 2026-07-21 (inpatient/claims scope)**
`PREFIX-YEAR-{count()+1}` collides after any row deletion (`count` falls below `max` → the next number
names a live row → `UniqueConstraintViolation`), and races under concurrency. **Fixed** via a shared
allocator [src/lib/document-number.ts](../src/lib/document-number.ts):
`createWithDocumentNumber(prefix, findLatest, create)` seeds from **`max(existing suffix)+1`** (not
`count()+1` — kills the post-purge collision) and wraps the insert in a **bounded reservation-retry** that
advances past a concurrent collision (P2002), degrading to a retry-able error after 50 attempts instead of a
raw 500. Applied to the 5 standalone creates — `claimNumber` (intake + wizard), `preauthNumber`,
`caseNumber`, `louNumber`. The two in-transaction creates (`cutInterimSlice`, `closeAndFile`) use the
seed-only `peekNextDocumentNumber` (max+1, no retry — a P2002 aborts a tx, and these are low-concurrency
operator paths). 9 unit tests in `tests/lib/document-number.test.ts`; host suite 789 green, tsc + guards
clean. The B2B claims route keeps its own externalRef-aware loop (`07e97b3`, unchanged).

**B4-WIDE — ✅ SWEPT 2026-07-21.** An exhaustive grep showed the `count()+1` pattern was far more pervasive
than the ~14 first estimated: **~36 document-number sites across ~28 files** all shared it. All are now on
the shared allocator: `intake`/`broker`/`admin` quotes (QUO), `amendment`/`endorsement`/`members` endorsements
(END), `billing`/`reinstatement`/`amendment`/`endorsement`/`fund`/`members-card` invoices (INV/INV-REINSTATE/
INV-ADJ/INV-ADMIN/INV-CARD), `binding`+`member-numbering` member numbers, `claims/new`/`sync`/`reimbursement`
claims (CLM/CLM-REIMB), `gl.service` journal entries (JE), `claim-adjudication` payment vouchers (PV),
`preauth-adjudication` GOP + PA-AMD, `cross-border` CBC/CBI, and the higher-risk API routes `api/v1/preauth`
(full reservation-retry) + `api/claims/import` (seed-only, sequential loop). Two format-deviant sites
(`provider-contracts` `PC-` pad-3, `brokers` `BRK-` no-year) got an inline max+1. Sub-prefixes on a shared
field (e.g. `INV-` vs `INV-REINSTATE-`) stay correctly separated because year-scoped `startsWith` (`INV-2026-`)
doesn't match `INV-REINSTATE-2026-`. **Left intentionally:** two cosmetic `GRP-` labels (a fallback group
`name` in `binding`, a `notes` string in `quotations/[id]`) — not persisted in a unique field, so no
collision — and the `api/v1/claims` route's own externalRef-aware loop. 9 helper unit tests + 8 test-harness
mock updates (`findFirst` added where services now read max); host suite **789 green**, tsc + guards clean.

### B5 — Fraud screening on case-born claims: monitor the new rules · **P3 (watch)**
The fix wired `FraudService.evaluateClaim` onto `cutInterimSlice` + `closeAndFile` (post-commit) and made
RULE-GATE-001 (high-value-no-PA) case-inclusive + RULE-VEL-001 (velocity) exclude same-case siblings
([fraud.service.ts](../src/server/services/fraud.service.ts)). Verified not to false-fire on the probes, but
**watch** the fraud console once real weekly-sliced admissions flow — if any rule still noise-fires on
slices, tune it there rather than reverting the wiring.

---

## C. Product / config decisions pending

### C1 — SCN-OBS-01: one benefit category per episode · **DECISION / P1-to-decide**
Confirmed in code (a case carries a single `benefitCategory`; slice/claim + one `recordUsage` book to it) —
line-by-line multi-benefit allocation (§13/§26.7) does not exist at any layer. Decision memo with the code
facts + recommendation is at
`uat/inpatient_longitudinal_2026-07-17/runs/2026-07-18_local_02/notes/SCN-OBS-01_DECISION.md` (⭐ **Option B**:
sign off "one benefit per episode" + file separate-benefit legs, e.g. ambulance, as their own direct
claims). **Awaiting sponsor sign-off.** Option A (build per-line allocation) is a separate multi-week design
brief — schema (`CaseServiceEntry.benefitCategory` + `ClaimLine.benefitCategory`), N-category usage booking
in `decide()`, engine + UI — and would destabilise the just-verified slicing spine; do **not** fold it into
this line without a decision.

### C2 — Fraud gate is OFF by default in prod · **DECISION / P1 for go-live**
`requireFraudClearanceBeforeApproval` defaults to `false`
([tenant-settings.service.ts](../src/server/services/tenant-settings.service.ts)). IP-DEF-04 proved the
bed-day HIGH alert **hard-blocks** approval **when the gate is on** (2026-07-19, enable→prove→restore), but
with it off the alert is advisory only. **Decision for go-live:** enable the fraud gate for the tenant
(Settings → Claim Controls, or `updateClaimControls`), and set the severity threshold. Without it, HIGH
fraud alerts (bed-day overlap, high-value-no-PA) do not gate payment.

---

## D. Environment / operational debt

### D1 — VM fixture benefit balances are depleted · **P2 (before more UAT)**
The `IP-UAT-*` member fixtures on the Lima VM have had their benefit balances consumed across sessions (e.g.
MALARIA/BURNS now bind at 0 available), so exact-to-limit partial-approval re-runs block on genuine
exhaustion. **Before the §A breadth passes**, re-seed or reset the fixtures' `BenefitUsage`
(`scripts/uat-member-fixtures.ts` rebuilds them; or zero the relevant rows) — or create fresh headroom-checked
members per probe (the 2026-07-19 gate scripts already scan for headroom). Some probe scripts also commit
approvals without reversing usage on teardown (disposable-VM shortcut) — acceptable on the VM, but a reason
the balances drift.

### D2 — Disposable VM teardown · **housekeeping**
`limactl delete -f uat-inpatient` when the campaign is fully done. It is currently **live** on branch
`fix/inpatient-slice-case-pa` at clock 2026-08-01 with the 2026-07-19 probe scripts in
`~/avenue-portal/scripts/uat-*.ts` (`uat-pa-slice-accept.ts`, `uat-prior-defect-gate.ts`,
`uat-def04-gateblock.ts`). Keep it until the §A breadth is run.

---

## Closed / shipped (for reference — do NOT re-open)

IPL-001 interim settlement · IPL-PA-01 case-PA read-through (+ 4 steal-guards, case-aware fraud parity,
cancelCase guard) · CFG-01 WEEKLY cadence · OBS-COPY-01 / OBS-A11Y-01 / OBS-UI-02 · SETUP-OBS-01 (stale) ·
IPL-RV-01 (hermetic test) · the §25 prior-defect gate IP-DEF-01..06 (all FIXED-VERIFIED on the VM) ·
OBS-IP-GL (trial balance balanced) · OBS-IP-TARIFF (V1/V2 resolution + source/version). Evidence under
`uat/inpatient_longitudinal_2026-07-17/runs/2026-07-18_local_02/evidence/`.
