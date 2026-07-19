# Inpatient Interim-Settlement — Remediation Execution Plan

**Date:** 2026-07-19 · **Author:** planning agent (Claude) · **For:** the executing agent
**Inputs:** `runs/2026-07-18_local_02/REMEDIATION_NOTE.md`, `VERDICT_ONEPAGE.md`,
`outputs/{EXECUTIVE_GO_NO_GO_SUMMARY.md,GAP_REGISTER.csv,PRIOR_DEFECT_RETEST_MATRIX.csv,SCENARIO_RESULT_MATRIX.csv}`,
`docs/IPL-001_INTERIM_SETTLEMENT_FIX_BRIEF.md`, and a fresh code investigation on `e314de8`.
**Verdict being remediated:** CONDITIONAL GO — 0 Critical · 1 High (IPL-PA-01) · 1 Medium (SCN-OBS-01) ·
5 open Low (CFG-01, OBS-COPY-01, OBS-A11Y-01, OBS-UI-02, SETUP-OBS-01) · prior-defect retest gate unfinished
(IP-DEF-01..05 + OBS-IP-*).

This plan is written so the executor does not have to re-derive anything: every finding has the exact
files/lines, the decided fix (decisions are pre-made and marked ⭐ where they were judgement calls), the
edge cases already thought through, the tests to write, and the acceptance evidence to capture. Where this
plan **corrects the remediation note's root-cause analysis**, that is called out explicitly — read §1 before
touching code.

---

## 0. Ground rules, environment, gates

- **Branch:** create `fix/inpatient-slice-case-pa` off current `main` (= `e314de8`, which is also deployed
  prod). All work packages land on this one branch; merge to `main` only after §10 gates pass.
- **Baseline:** host test suite is **762 green** on `e314de8`. It must stay green; new tests add to it.
- **Green gates after every WP:** `npx tsc --noEmit` · `npx eslint .` (or the repo's lint script) ·
  `npm test` (vitest) · the repo guard scripts (`check-no-avenue`, `check-currency-labels`) if wired into
  `npm test`/prebuild.
- **Schema changes in this plan are additive-only** (one enum value). Safe for the build's
  `prisma db push` deploy path. No destructive migration anywhere.
- **Live re-verification environment:** the disposable Lima VM `uat-inpatient` is still up, clock frozen at
  **2026-08-01 06:00 EAT**, fixtures + §7.1 contract book (`PC-UAT-IP-2026`) seeded, 12 idempotent probe
  scripts in VM `~/avenue-portal/scripts/uat-*.ts`. Drive it with `limactl shell uat-inpatient -- …`; app at
  `http://localhost:3000`; logins in `runs/2026-07-18_local_02/notes/CURRENT_STATUS.md` (pw
  `Mdx!Seed-2026#Rotate`). Advance the clock ONLY per `notes/CLOCK_CANARY.md` mechanics (stop app+worker →
  `timedatectl set-time` → start; `lima-guestagent` stays disabled). If the VM is gone, rebuild per
  `runs/2026-07-17_local_01/notes/DISPOSABLE_VM_PROVISIONING_SPEC.md`.
- **Evidence:** continue run `runs/2026-07-18_local_02/` — new evidence into `evidence/`, updated rows in
  `outputs/GAP_REGISTER.csv` + `outputs/PRIOR_DEFECT_RETEST_MATRIX.csv`, and keep
  `notes/CURRENT_STATUS.md` current. No closure is claimed without independent evidence (plan §2).
- **Do not touch prod or any shared DB** during verification. VM only. Prod deploy is the last step of §10
  and only after Arthur/sponsor says go.

---

## 1. Corrected root-cause model for IPL-PA-01 — READ THIS FIRST

The remediation note (and gap register) state: *"cutInterimSlice deliberately does NOT re-point case PAs
onto slices; only closeAndFile re-points."* **That is not what `e314de8` does.** The design brief §2.4 says
don't re-point, but the shipped code re-points anyway:

`src/server/services/case.service.ts:409-419` (inside `cutInterimSlice`'s transaction):

```ts
if (c.preauths.some((pa) => pa.status === "APPROVED")) {
  await tx.preAuthorization.updateMany({
    where: { caseId: c.id, status: "APPROVED", claimId: null },
    data: { claimId: claim.id, attachedAt: new Date(), status: "ATTACHED" },
  });
}
```

The empirical UAT block was still real. The Boda repro (`scripts/uat-boda-cadence.ts` phase 1 +
`scripts/uat-hms-boda-day0.ts`) accrued Day-0 lines including CT-HEAD (contract `requiresPreauth`), cut the
slice, then adjudicated — **no PA existed on the case at cut time**, so nothing was re-pointed, the slice's
own `claim.preauths` was empty, and the gate at `claim-decision.service.ts:409` threw. The correct
root-cause statement is:

> **A slice only sees case PAs that were APPROVED-and-unattached at the instant of the cut.** Every PA
> linkage read in the decision path (`gate`, `cover cap`, `availability credit`, `utilisation loop`) uses
> `claim.preauths` — the FK — so anything outside that instant is invisible.

The failure modes this produces (all must be closed by the fix, and all get acceptance probes in §9.1):

| # | Sequence | Today's outcome |
|---|---|---|
| F1 | PA attached to the case **after** a slice was cut (the normal UI flow — `attachPreauth` sets `caseId` only) | Slice adjudication throws the PA-required error; case hold never credited to the slice |
| F2 | Slice S2 cut **while S1 is still undecided** (weekly cuts + adjudication backlog) | The PA is `ATTACHED` to S1 (`claimId=S1`), so the S2 cut re-points nothing → S2 blind to the PA |
| F3 | No PA at all at cut, PA approved later that week | Same as F1 |
| F4 | PA on the case at cut, strictly serialized cut→decide→cut→decide | Works today — must NOT regress |
| F5 | Case PA sitting `APPROVED, claimId:null, caseId:set` between slices | **Stealable**: three code paths attach it to unrelated claims (§2.4) |
| F6 | Final close after slices fully UTILISED the PA | `closeAndFile` re-points only `APPROVED, claimId:null` PAs → a final claim with a PA-required residual line can throw |

**Fix direction (per the remediation note, confirmed correct): read-through from the case at decision
time; stop moving the FK at cut time.** The PA remains attached to the **case** for the whole admission
(`caseId` set, `claimId` null, status `APPROVED`); every decision-path read resolves "effective PAs" as
*the claim's own PAs ∪ the case's PAs*. Only `closeAndFile` re-points residual PAs onto the final claim
(existing behaviour, kept for audit continuity).

Two mechanical traps the executor must not fall into:

1. **Stale-snapshot lost update.** `decide()` loads `claim.preauths` once, **outside**
   `inSerializableTx`. The serializable retry re-runs only the tx callback — with the stale PA snapshot.
   Under FK-attachment a PA belongs to exactly one undecided claim, so two decides never share a PA and the
   staleness is harmless. **Read-through breaks that invariant** (two slices of one case can be decided
   concurrently, both seeing the same case PA). Therefore the utilisation loop and the
   `creditPreauthIds` list MUST be computed from a **fresh in-tx read** (`tx.preAuthorization.findMany`),
   not from the outer snapshot. The outer snapshot may still drive the *pre-tx* gates (PA-required, cover
   cap) — those are advisory ordering; the money writes are what must be race-proof.
2. **Never clear `caseId`.** The utilisation loop's partial-consumption branch writes
   `{ status: "APPROVED", claimId: null, attachedAt: null }` — it must keep NOT touching `caseId`
   (it doesn't today; keep it that way), or the episode linkage is destroyed mid-admission.

---

## 2. WP-A — IPL-PA-01: slices honour the case's PAs (High; P0)

### A1. One shared resolver for "the PAs that secure this claim"

Add to `src/server/services/claims.service.ts` (near `attachPreauth`, ~line 425):

```ts
/**
 * IPL-PA-01: the PAs securing a claim. For a case-linked claim (interim slice
 * or final bill) the episode's PAs live on the CASE (`caseId`) for the whole
 * admission and are only FK-re-pointed at final close — so the decision path
 * must read the union of claim-attached and case-attached PAs. Non-case claims
 * keep the FK-only behaviour.
 */
static effectivePreauthWhere(claim: { id: string; caseId?: string | null }): Prisma.PreAuthorizationWhereInput {
  return claim.caseId
    ? { OR: [{ claimId: claim.id }, { caseId: claim.caseId }] }
    : { claimId: claim.id };
}
```

Notes: a single `findMany` with this `where` cannot return duplicates (one row matches once even if both
arms hit). Callers apply their own status filters — keep the per-use status sets EXACTLY as the current
code has them (documented per call-site below) so the diff is minimal and reviewable.

### A2. `ClaimDecisionService.decide` — the four blind reads

File: `src/server/services/claim-decision.service.ts`.

**(a) Load `caseId`.** The select at lines 226-233 lacks it. Add `caseId: true`. Replace the inline
`preauths:` select with a post-load fetch so all statuses/fields come from one place:

```ts
const paSelect = { id: true, preauthNumber: true, approvedAmount: true, estimatedCost: true, utilisedAmount: true, status: true } as const;
const effectivePreauths = await prisma.preAuthorization.findMany({
  where: ClaimsService.effectivePreauthWhere(claim),
  select: paSelect,
  orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }], // deterministic consumption order (oldest cover first)
});
```

Then replace every `claim.preauths` in `decide()` with `effectivePreauths` — there are exactly four uses:

**(b) PA-required-line gate (line 409).** Becomes
`if (paLines.length > 0 && effectivePreauths.filter((p) => ["APPROVED","ATTACHED","UTILISED"].includes(p.status)).length === 0) throw …`.
⭐ Decision (pre-made): **UTILISED counts for the gate.** Rationale: the gate answers "was this episode
authorised?", not "is cover left?" — money is bound by the cover cap (c) and the availability gate. Without
UTILISED, failure mode F6 (§1) dead-ends the final claim of a long stay whose GOP was consumed by earlier
slices; the correct control there is the explicit over-cover confirmation, not a hard block. Also update
the error message for case claims: `…Link an approved PA to this claim (or attach one to its case) or
decline the line(s).`

**(c) Attached-PA cover cap (lines 462-479, PR-015/PR-022).** Swap `claim.preauths` →
`effectivePreauths`; formula unchanged (`Σ max(0, approved − utilised)` — UTILISED rows contribute 0
naturally). Consequence to be aware of (correct, not a bug): a slice approving above the case's remaining
PA cover now REQUIRES `overCoverConfirmation` where before the check was silently skipped (empty list).
The UI already renders the confirmation checkbox (`claims/[id]/page.tsx:725-729`); A6 makes its visibility
condition case-aware.

**(d) Availability credit + utilisation loop (lines 529-623) — the money writes. Re-read inside the tx:**

```ts
// first lines inside inSerializableTx, before computeAvailability:
const txPreauths = await tx.preAuthorization.findMany({
  where: ClaimsService.effectivePreauthWhere(claim),
  select: paSelect,
  orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
});
```

- `creditPreauthIds` (line 535): `txPreauths.filter((pa) => ["APPROVED","ATTACHED"].includes(pa.status)).map((pa) => pa.id)`
  (same status set as today; `computeAvailability` only credits ACTIVE holds anyway —
  `benefit-usage.service.ts:456-462` — so surplus ids are harmless).
- Utilisation loop (line 580 `for (const pa of claim.preauths)`) → `for (const pa of txPreauths)`.
  Everything inside stays byte-identical EXCEPT the full-consumption branch (line 611-613): change
  `{ status: "UTILISED", utilisedAmount: newUtilised }` →
  `{ status: "UTILISED", utilisedAmount: newUtilised, claimId, attachedAt: new Date() }` — stamp WHICH
  claim finished the PA (audit: the case-recon query `case.service.ts:732-735` and the preauth pages then
  show the consuming slice). The partial branch stays exactly
  `{ status: "APPROVED", utilisedAmount: newUtilised, claimId: null, attachedAt: null }` — `caseId`
  untouched (trap §1.2).
- DECLINED path (lines 616-623): keep as-is (`updateMany where claimId`). Under read-through nothing is
  FK-attached to a slice, so it's a no-op for slices — correct: a declined slice must NOT consume or
  detach the case's PAs (cover + hold stay for the next slice). It still correctly detaches legacy/manual
  FK attachments.

**(e) Do NOT change** the throw semantics, EPSILON handling, hold-conversion arithmetic
(`tx.benefitHold` block, lines 589-607 — already in-tx and correct), `recordUsage`, GL, fund, or
notification code. This WP is only about WHICH PAs are seen.

### A3. `cutInterimSlice` — delete the cut-time re-point

File: `src/server/services/case.service.ts:409-419`. Delete the whole block (comment included) and replace
with a comment stating the new rule:

```ts
// §11.3/IPL-PA-01: case PAs are NOT re-pointed onto interim slices. They stay
// attached to the case for the whole admission; the decision path reads them
// through ClaimsService.effectivePreauthWhere (union of claim- and case-
// attached), so a PA approved after this cut — or still securing an undecided
// earlier slice — is seen by every slice. Only closeAndFile re-points residual
// PAs onto the FINAL claim.
```

Also update the stale doc-comment at `case.service.ts:4-8` (the "closure assembles them into exactly ONE
claim / one-claim-per-case rule lives here" header) — it predates IPL-001 and now misdescribes the file.

Keep the `closeAndFile` re-point (lines 621-624) exactly as is.

**Legacy-state compatibility (why this is safe to ship without a data migration):** a PA that some earlier
cut already flipped to `ATTACHED, claimId=<slice>` still has `caseId` set, so `effectivePreauthWhere`
finds it for every sibling slice; the utilisation loop accepts status `ATTACHED`; on partial consumption it
returns to `APPROVED, claimId:null`. State heals on first decision. No backfill needed. (Prod has the
feature only since 2026-07-18; check anyway — §9.1 step 0 includes a one-line count of
`PreAuthorization where status='ATTACHED' and claimId in (select id from Claim where isInterimBill)` on the
VM, and the same query is worth running read-only against prod before deploy.)

### A4. Close the case-PA **steal holes** (same family, found in this investigation)

A case PA now spends the whole admission as `APPROVED, claimId:null, caseId:set` — exactly the shape three
auto/manual attach paths hunt for. Today each of them can silently hijack the episode's guarantee onto an
unrelated claim (and could already, between slices, before this fix):

1. `src/server/services/claim-intake.ts:161-171` (HMS/B2B intake auto-link `findFirst`): add
   `caseId: null` to the `where`.
2. `src/server/services/claims.service.ts` `createClaim` PA auto-link (~line 263, the
   `linkedPreauth = findFirst` block): add `caseId: null`. (Separate pre-existing observation, do NOT fix
   silently: this query filters neither `providerId` nor `tenantId` — log it in the gap register as a new
   Low observation, OBS-PA-LINK-01, with this file/line.)
3. `src/app/(admin)/claims/[id]/PreauthPanel.tsx` candidates query (~line 41-52): add `caseId: null`.
4. `ClaimsService.attachPreauth` (claim-level, `claims.service.ts:430-469`): after the `pa.claimId` check
   add a guard —
   `if (pa.caseId) throw new Error(\`Pre-auth ${pa.preauthNumber} secures an open case — interim slices and the final bill read it from the case automatically. Detach it from the case first if you really need to move it.\`);`
   (select `caseId: true` in the `pa` lookup). `CaseService.attachPreauth` (case-level) already refuses
   PAs with `claimId` set — unchanged.

### A5. Fraud screening on case-born claims

Facts established: `FraudService.evaluateClaim` is invoked by the wizard (`claims/new/actions.ts:159`),
the B2B route (`api/v1/claims/route.ts:301`) and offline sync (`sync.service.ts:263`) — **never** for
claims born from a case (`cutInterimSlice`, `closeAndFile`), which only get the inline bed-day alert. And
its RULE-GATE-001 (`fraud.service.ts:101-114`) flags ANY claim > 150,000 with `preauths.length === 0` —
which every slice would trip if screening were wired on naively; RULE-VEL-001 (visit velocity, member
claims in 30d > threshold) would also false-fire on a weekly-sliced admission (3+ sibling claims/month).

⭐ Decision (pre-made): **wire fraud screening ON for case-born claims, with the two rules made
case-aware first.**

1. RULE-GATE-001: include the claim's `caseId` in the evaluate query and change the condition to
   `claim.preauths.length === 0 && (no case-linked PA)` — concretely, fetch
   `prisma.preAuthorization.count({ where: ClaimsService.effectivePreauthWhere({ id: claim.id, caseId: claim.caseId }) })`
   and flag only when that count is 0.
2. RULE-VEL-001: exclude same-case siblings from the velocity count — in the `member.claims` sub-where add
   `...(claim.caseId ? { NOT: { caseId: claim.caseId } } : {})`.
3. Then call `await FraudService.evaluateClaim(claim.id, tenantId)` **after** the create-transaction
   commits, in both `cutInterimSlice` and `closeAndFile` (mirror the wizard's post-create call; never
   inside the tx — evaluateClaim reads via the global prisma client and must see committed rows; a
   `.catch(() => undefined)` wrapper like `sync.service.ts:263` so screening can never fail a cut).

Rationale: the bed-day HIGH alert already gates slices through the OBS-7 fraud gate, so screening parity is
consistent; the duplicate/velocity/after-hours rules are precisely the cross-rail protections (BB2-DEF-03)
that a slice rail should not silently bypass. The two rule adjustments prevent the false-positive storm.
If this wiring produces unexpected gate friction in §9 verification, fall back to shipping (1)+(2) and
logging the screening gap as an accepted observation instead — do not ship (3) broken.

### A6. UI read-through (operator can see WHY the slice is secured)

1. `src/app/(admin)/claims/[id]/page.tsx`:
   - The claim query must select `caseId` (+ `isInterimBill`, `caseSliceSeq`, and
     `case: { select: { caseNumber: true, id: true } }` — the page is currently case-blind; grep confirms
     zero `caseId` references).
   - Fetch `effectivePreauths` (same helper + select as A2a) and pass THAT to `PreauthPanel` instead of
     `claim.preauths` (line 244-251).
   - Availability preview credit (line 127): swap `claim.preauths` → the effective list (same
     status filter).
   - Add a compact case strip near the header when `claim.caseId`: link to `/cases/[id]`, text
     `Interim slice {caseSliceSeq} of {caseNumber}` (or `Final bill of {caseNumber}` when
     `!isInterimBill`) — §11.3 demands visible episode linkage on the slice.
2. `PreauthPanel.tsx`: accept the effective list; render a small badge `via case` on PAs whose linkage is
   case-side (pass `caseAttached: boolean` per row = `pa.claimId !== claim.id`). The attach form stays,
   now offering only non-case PAs (A4.3). Panel copy when the claim is case-linked and list is empty:
   "This claim's case has no PA/GOP — attach one on the case page."
3. `ClaimsService.getPreauthCoverage` (`claims.service.ts:493-511`, feeds the page-108 cover banner):
   accept/resolve through `effectivePreauthWhere` (needs `caseId` in its claim select) AND net utilisation:
   `cover = Σ max(0, (approvedAmount ?? estimatedCost) − utilisedAmount)` — the current gross formula
   overstates cover for multi-slice episodes (aligns the banner with the decide()-side PR-022 formula).

### A7. Unit tests (mocked prisma — extend the existing suites)

`tests/services/claim-decision.service.test.ts`:
- slice (caseId set) + case PA APPROVED + PA-required line → decides (no throw); case PA hold credited
  (assert `computeAvailability` called with the case PA id); utilisation advanced; partial → PA stays
  `APPROVED, claimId:null`; full → `UTILISED, claimId=<slice>`.
- slice + case PA attached AFTER cut (fixture is simply: PA has caseId, claimId null) → same pass (F1/F3).
- slice + PA `ATTACHED` to sibling slice (claimId=other, caseId set) → still seen, still consumable (F2 +
  legacy-state heal).
- slice, case has NO PA, PA-required line → still throws (regression of the gate itself).
- slice, no PA-required lines, no PA → decides exactly as today (the SET-01/02/03 regression guard).
- final claim, case PA fully UTILISED by slices, PA-required residual line → gate passes (F6), cover cap
  demands `overCoverConfirmation` when above 0 remaining.
- DECLINED slice → case PA untouched (no detach write, utilisedAmount unchanged).
- non-case claim → `effectivePreauthWhere` degenerates to `{ claimId }`; every existing test unchanged.

`tests/services/case.service.test.ts`:
- `cutInterimSlice` no longer updates `preAuthorization` (assert the updateMany is gone).
- `cancelCase` guard (A8-1 below).
- `attachPreauth`-steal guards: claim-level attach refuses `pa.caseId` set.

`tests/services/fraud.service.test.ts` (create if absent):
- RULE-GATE-001 not raised for >150k slice whose case has a PA; raised when case has none.
- RULE-VEL-001 ignores same-case siblings.

### A8. Adjacent hardening (small, do in the same WP)

1. **`cancelCase` slice guard** (`case.service.ts:639-660`): today an OPEN case with already-cut slices can
   be CANCELLED — the RECEIVED slice claims remain live/adjudicable while the episode is "cancelled", and
   attached PAs get `caseId: null`'d (breaking read-through history). Add first:
   ```ts
   const liveClaims = await prisma.claim.count({
     where: { caseId: c.id, status: { notIn: ["DECLINED", "VOID"] } },
   });
   if (liveClaims > 0) throw new Error(
     `Case has ${liveClaims} billed slice(s)/claim(s) — decline or void them first, then cancel. ` +
     `A cancelled episode cannot leave live billable claims behind.`);
   ```
   + unit test.
2. **Determinism:** the PA consumption order (A2a `orderBy`) — today's `claim.preauths` order is
   unspecified; fixing it oldest-first makes multi-PA episodes reproducible. Already covered by A2a; just
   don't drop the orderBy.

### A9. Edge-case decision table (pre-decided; do not re-litigate during execution)

| Edge | Decision |
|---|---|
| PA expired mid-admission (`validUntil` past) while APPROVED on the case | **No behaviour change in this WP.** decide() has never checked validity at decision time; the expiry sweep (`releaseExpiredHolds`) releases the hold and availability then binds raw benefit — fail-safe direction. Log as observation OBS-PA-EXP-01 in the gap register (Low) with a recommendation (validity check at decide belongs with the §26.8 probe). |
| Two slices of one case decided concurrently | Safe: money writes re-read PAs in-tx under Serializable (A2d); hold conversion already in-tx. Covered by §9.1 probe P6 (optional race probe). |
| Slice approved above remaining PA cover | Allowed with explicit `overCoverConfirmation` (existing PR-015 control, now correctly reachable for slices). |
| Slice DECLINED | Case PAs and holds untouched (A2d). Next slice unaffected. |
| Approved slice VOIDed (`voidClaim`) | Usage + GL reverse; **PA `utilisedAmount`/holds do NOT restore** — pre-existing behaviour for all PA-covered claims, unchanged. Log as observation OBS-PA-VOID-01 (Low, product decision whether void should refund PA cover). |
| LOU/GOP ceiling at slice decision | LOUs are episode paper, not a decide()-side control today (no hold, no gate) — unchanged; §25 OBS-IP-PA-HOLD retest documents the policy. |
| `EXPIRED`/`CANCELLED`/`DECLINED` PAs on the case | Excluded everywhere by the existing status filters (gate set b, credit set d, loop `continue`). |

---

## 3. WP-B — make the interim-settlement integration test hermetic (closes IPL-RV-01 residual)

File: `tests/integration/interim-settlement.integration.test.ts` (opt-in via `INTERIM_TEST_DB`; runs on
the VM). Two defects found by the UAT run, plus the mystery number explained:

1. **Ambient-fixture dependency:** `beforeAll` picks ANY seeded member/provider. On a fresh seed with 0
   `ProviderContract`, the claim page/auto path PENDs (engine CON-001) and §11.6 fails. Fix: the test must
   **create everything it consumes** inside the seeded tenant — its own provider (fresh, `contractStatus`
   ACTIVE-equivalent, so no ambient batches/claims can pollute §11.7-8), its own member + package version +
   INPATIENT `BenefitConfig` with a generous limit, and EITHER its own minimal priced contract for its line
   codes OR no contract at all (null-ceiling reviewer-judgement path) — pick **no contract** for the base
   suite (simplest deterministic path; the contract-priced variant is exercised live in §9.1) and assert
   `assessCeiling` returns `ceiling: null` as a precondition so a future seed change fails loudly, not
   mysteriously.
2. **Period-switching reader:** `usedInpatient()` reads `findFirst orderBy periodStart desc`. When the
   decision books usage into a service-date period different from the latest existing row, before/after
   read DIFFERENT rows — that is the reported "anomalous −834k on a no-op": before read the seed member's
   existing-period row (834k), after read a new period row. Fix: pin the read to the period containing the
   test's service dates (or `aggregate _sum.amountUsed` across ALL rows for the member+config and assert
   deltas on the sum). Sum is simplest and immune to period boundaries.
3. **Add a PA leg to the suite** (locks WP-A end-to-end on a real DB): open case → attach an approved case
   PA WITH a hold (create PA via `ClaimsService.createPreAuth`, approve + hold via the same service calls
   the admin approve action uses — `preauthAdjudicationService.createBenefitHold` after setting
   APPROVED, see `preauth-adjudication.service.ts:287-360/425` for the shape) → cut slice 1 → decide →
   assert: decided APPROVED, `utilisedAmount` advanced by the slice amount, hold reduced/converted, PA
   still `APPROVED, claimId:null, caseId:set` when partially consumed → cut slice 2 → decide → residual
   consumed → close → final decide → PA `UTILISED` and stamped with the finishing claim id; total
   utilisation == Σ slice approvals capped at cover; no stranded ACTIVE hold at the end.
4. Keep `describe.skipIf(!URL_SET)` — the suite must remain opt-in and prod-unreachable.

Acceptance: on the VM, `INTERIM_TEST_DB=… DATABASE_URL=… npx vitest run tests/integration/interim-settlement.integration.test.ts`
passes **3× consecutively against a fresh seed** (drop + `prisma db push` + seed between runs 1 and 2 to
prove hermeticity; runs 2→3 back-to-back to prove idempotent teardown). Save the third output to
`runs/2026-07-18_local_02/exports/IPL-001_hermetic_suite_output.txt` and mark IPL-RV-01's residual closed
in the gap register.

---

## 4. WP-C — CFG-01: `WEEKLY` reconciliation cadence (Low)

The §7.1 contract book declares *weekly* interim billing; the enum can't say it. Additive enum value +
every surface that enumerates it:

1. `prisma/schema.prisma:3239` — `enum ReconciliationCadence { NONE WEEKLY MONTHLY QUARTERLY BIANNUAL }`
   (insert `WEEKLY` between NONE and MONTHLY; Postgres enum ADD VALUE via `prisma db push` is additive/safe).
2. `src/server/trpc/routers/contracts.ts:29` — add `"WEEKLY"` to `reconciliationEnum`.
3. `src/app/(admin)/contracts/new/page.tsx:158-163` — add `<option value="WEEKLY">Weekly</option>`.
4. Check the contract EDIT/amendment surface for a second `<select name="reconciliationCadence">`
   (`src/app/(admin)/contracts/[id]/ManagePanel.tsx` / `manage-actions.ts`; `contracts/actions.ts:69/158`
   are pass-through casts — no change needed unless they validate against a literal list).
5. Display at `contracts/[id]/page.tsx:371` renders the raw value — no change.
6. `contract-lifecycle.service.ts` (39/428/437/509) treats it as an opaque string through amendment/renewal
   snapshots — no change; eyeball only.
7. Grep for any exhaustive `switch`/record over the enum (`grep -rn "BIANNUAL" src`) and extend if found.

**Honesty note for the register:** nothing schedules off this field today (settlement runs are manual
monthly + supplementary `sequence`); adding WEEKLY closes the *declarative* gap (SET-04's "contract can
state its cadence") while the *operational* weekly path remains `cutInterimSlice` + supplementary batches —
already proven. Record exactly that wording against CFG-01 when closing it. Update the §7.1 VM contract
`PC-UAT-IP-2026` to `WEEKLY` via `scripts/uat-contract-book.ts` (idempotent) as part of §9 evidence.

Unit: extend the contracts router/action test (if one exists — `tests/` grep `reconciliation`) to accept
WEEKLY; otherwise the tsc + zod change is self-evidencing via the §9 UI probe.

---

## 5. WP-D — OBS-COPY-01: stale `/cases` copy (Low)

`src/app/(admin)/cases/page.tsx:46`: replace
`Clinical episodes accruing services, pre-auths and LOUs — each files as a single claim at closure.` with
`Clinical episodes accruing services, pre-auths and LOUs — bill in interim slices while open; the final
bill files at closure.` Also sweep for siblings the register missed:
`grep -rn "single claim at closure\|one claim at closure\|exactly ONE claim" src/` and fix any hit (the
`case.service.ts` header comment is already covered by A3).

---

## 6. WP-E — OBS-A11Y-01 + OBS-UI-02: case add-entry form (Low)

File: `src/app/(admin)/cases/[id]/page.tsx` (server-action forms, lines 262-273 add-entry; 295-305 attach-PA;
325-335 LOU; 188-202 cut-slice).

1. **Accessible names:** the three icon-less submit buttons are bare text ("Add", "Attach", "Issue") inside
   dense grids; the Add button fell out of the a11y tree at 1280×720. Give each an explicit
   `aria-label` (`"Add service entry"`, `"Attach pre-authorization"`, `"Issue letter of undertaking"`,
   and `"Cut interim bill slice"` on the cut-slice submit) — cheap and makes the harness selector stable.
2. **Clipping:** the add-entry form is `grid grid-cols-2 … md:grid-cols-7` with the button nested beside
   Unit amount; at 1280×720 it clipped. Let the button cell wrap instead of clip: on the wrapper div of
   unit-amount+button add `flex-wrap` (or move the button to its own grid cell with `self-end`). Verify at
   1280×720 with the browser tools — the button must be present in `read_page` WITHOUT resizing.
3. **Enter-to-submit:** it is a native `<form action=…>`, so Enter in a text input submits per HTML rules.
   The UAT saw Enter not submitting — most likely the automation focused a `type=number` input or the
   value-setter quirk swallowed it. After (1)+(2), re-verify Enter from the Description field; if it
   genuinely doesn't submit, check for an intercepting key handler (none known in this file) rather than
   converting the form to a client component. **Do not** rewrite the form as controlled-React state — the
   HMS batch JSON rail is the sanctioned bulk path; this form only needs to be reliable for single entries.
4. The "programmatically-set value dropped" symptom is the React-uncontrolled-input automation quirk
   (native setter vs React tracker), not app logic. Note it in the register as automation guidance
   (use `form_input` tool / native setter), not an app defect — unless (3) reveals a real re-render reset,
   in which case fix by giving the input a stable `key`.

Acceptance: `read_page` a11y tree at 1280×720 shows all four named buttons; adding an entry via keyboard
only (tab + type + Enter) works; existing add/void flows unchanged.

---

## 7. WP-F — SETUP-OBS-01: `npm ci` on a clean checkout (Low)

Investigated on this host (npm 11.16.0, macOS): `npm ci --dry-run` **passes** at `e314de8`, and the
committed lock DOES contain `node_modules/proxy-agent` (line ~11064) plus 43 `linux-arm64` platform
entries. So the recorded failure was either (a) fixed by a later lock commit, (b) an npm-version difference
(VM Ubuntu ships npm 10.x), or (c) recorded against the pre-merge branch state. Protocol:

1. On the VM: `limactl shell uat-inpatient -- bash -lc 'cd ~/avenue-portal && git stash -u 2>/dev/null; git fetch origin && git checkout fix/inpatient-slice-case-pa && npm ci --dry-run; echo EXIT=$?'`
   (do NOT nuke the VM's working `node_modules` with a real `npm ci` until the dry-run passes).
2. If it fails: capture the exact `Missing: … from lock file` list into the register row, then on the host
   run `npm install --package-lock-only` (npm ≥11 records all platform variants), commit the lock delta
   alone (`chore: refresh package-lock for clean ci installs (SETUP-OBS-01)`), and re-run step 1.
3. If it passes: close SETUP-OBS-01 as "already resolved at e314de8 / npm-version artefact" with the two
   command outputs (host + VM) as evidence. Either way the closing evidence is a green
   `npm ci` (real, not dry) on ONE clean environment — use a throwaway clone dir on the VM so the running
   app's `node_modules` is untouched.

---

## 8. WP-G — SCN-OBS-01: one benefit category per episode (Medium; product decision)

**Code facts (confirmed this investigation — cite them in the decision record):** `ClinicalCase` carries a
single `benefitCategory`; `CaseServiceEntry` has a service `category` (`ClaimLineCategory`: CONSULTATION/
LAB/…) but NO benefit category; `cutInterimSlice`/`closeAndFile` stamp `claim.benefitCategory =
case.benefitCategory`; `decide()` books usage with ONE `recordUsage(claim.benefitCategory, approvedAmount)`
(`claim-decision.service.ts:630`) and the availability gate binds that one category. So line-level
multi-benefit allocation inside one episode **does not exist at any layer** — the "confirm at adjudication"
caveat in the register is hereby confirmed: it cannot split. The §13 Boda expectation (0.8M ambulance +
19.6M surgical + 27.4M inpatient + 1.8M rehab from one admission) books entirely to INPATIENT.

⭐ Recommended decision (present to Arthur/directors; default if unchallenged): **Option B — sign off "one
benefit category per episode" for go-live**, because (i) the INPATIENT category is the binding envelope for
admissions in every fixture contract; (ii) the availability gate's category+OVERALL double bind (proven
PARTIAL-CAP/OVERALL-BIND) keeps money safe either way; (iii) Option A (per-line benefit) forces schema
(`CaseServiceEntry.benefitCategory` + `ClaimLine.benefitCategory`), multi-category usage booking inside
`decide()` (N `recordUsage` calls + N availability binds per claim), engine changes, and UI — a multi-week
change that would destabilise the just-proven slicing spine during the test phase. Operational workaround
for genuine splits (e.g. ambulance benefit): file the ambulance leg as its own direct claim under the
AMBULANCE benefit — the direct-claim rail is unaffected by episodes.

Deliverable: a half-page decision memo `runs/2026-07-18_local_02/notes/SCN-OBS-01_DECISION.md` recording
the code facts above + chosen option + the workaround; on sign-off, downgrade SCN-OBS-01 to an ACCEPTED
capability boundary in the gap register and adjust plan §13/§26.7 expectations accordingly (per plan §27
this is a documented product-intent divergence, not a silent acceptance reshape). If Option A is chosen
instead: STOP — that is a separate design brief, not this plan.

---

## 9. WP-H — VM re-verification (turns the fixes into evidence)

Order: 9.1 (new fix) → 9.2 (prior-defect gate) → 9.3 (registers/verdict). Rebuild the VM's checkout to the
fix branch first: `limactl shell uat-inpatient -- bash -lc 'cd ~/avenue-portal && git fetch && git checkout
fix/inpatient-slice-case-pa && npm run build'` (or the documented in-guest build path), restart
`avenue-app`/`avenue-worker`, `prisma db push` for the WEEKLY enum, health green, clock still 2026-08-01.

### 9.1 IPL-PA-01 acceptance (closes the High)

Extend `scripts/uat-boda-cadence.ts` (VM copy) or add `scripts/uat-pa-slices.ts`, idempotent, phases:

- **P0 (state audit):** count `ATTACHED`-to-interim-slice PAs (expect 0 on the VM; note for prod).
- **P1 (F1/F3 — late attach):** case with a PA-required line already sliced… concretely: on
  `CASE-2026-00002` (Boda, has CT-HEAD in slice S1, still blocked from run 02): create a PA for IP-UAT-BODA
  at Kampala Hospital (estimated ≥ CT-HEAD's tariff), approve it WITH hold, `CaseService.attachPreauth` to
  the case, then `ClaimDecisionService.decide` slice S1 APPROVED at billed →
  **expect: decides clean** (the exact call that threw in run 02 — the headline before/after evidence).
  Assert: `utilisedAmount` advanced by min(cover, approved); hold reduced by the consumed amount
  (`BenefitHold.heldAmount` delta) and `benefitUsage` used +approved, available unchanged by the credit
  (seven-ledger §3: H→U conversion); PA still `APPROVED/claimId:null` if partially consumed.
- **P2 (F2 — undecided sibling):** accrue new PA-required lines, cut S2 AND S3 back-to-back (S2 undecided),
  then decide S3 first, then S2 → both decide; utilisation is incremental; residual PA stays ACTIVE until
  cover exhausted; no double-credit of the hold (sum of hold releases == total consumed, never > initial
  hold).
- **P3 (F6 — final close):** close the case; final claim decides with the PA fully UTILISED beforehand →
  gate passes; over-cover confirmation path exercised (approve final above remaining cover WITHOUT
  `overCoverConfirmation` → expect the PR-015 throw; retry with confirmation → passes, note in log).
- **P4 (steal-guards):** while a case PA is APPROVED/unattached-to-claim: run an HMS/B2B intake for the
  same member+provider INPATIENT (expect: intake does NOT grab it — either finds another PA or throws the
  needs-PA error); claim-page attach of that PA to an unrelated claim → expect refusal message; PreauthPanel
  candidates list excludes it.
- **P5 (regressions):** re-run `scripts/uat-cadence-clean.ts`-equivalent (SET-01/02/03 non-PA cadence on
  IP-UAT-STROKE pattern) → unchanged PASS; `scripts/uat-ipdef06.ts` → unchanged PASS (availability gate
  still binds with PA credit in the picture).
- **P6 (optional race, if time):** two concurrent decides of two slices sharing one case PA (Promise.all)
  → both settle to a consistent total utilisation ≤ cover (serializable retry visible in logs is fine).
- **Fraud parity (A5):** cut a >150k slice on a case WITH a PA → no RULE-GATE-001 alert; same on a case
  with NO PA → alert raised (and fraud gate blocks until cleared — matches bed-day behaviour); weekly
  slices do NOT raise velocity alerts.

Evidence → `evidence/IPL-PA-01_fix_proof.txt` (+ the script committed to `scripts/`). Update gap-register
row IPL-PA-01 → FIXED-VERIFIED with deltas filled (hold_delta/used_delta per P1), and the
PRIOR_DEFECT_RETEST_MATRIX gains a row linking IPL-PA-01 → this evidence.

### 9.2 Prior-defect retest gate — §25 (closes the §29.12 automatic-NO-GO exposure)

Each is a single probe on the VM, service-level or UI, evidence file per row into `evidence/`, result row
into `outputs/PRIOR_DEFECT_RETEST_MATRIX.csv` (schema per the template). Specs (from plan §25 + the
original defect records):

| ID | Probe (rail) | PASS looks like |
|---|---|---|
| IP-DEF-01 | UI `/preauth/[id]`: approve a PA **with reviewer notes** | No crash/raw-Prisma leak; note persists on reload; audit row written (`reviewNotes` column live — schema:2575) |
| IP-DEF-02 | UI or HMS batch: entry dated (a) tomorrow (clock-relative), (b) before admission, (c) after discharge on a discharged-but-open case | Each blocked with the friendly message; `accruedAmount` unchanged (guards `case.service.ts:151-167` + `src/lib/service-date.ts`) |
| IP-DEF-03 | UI: approve a slice; UI: settle a batch (maker/checker) | Truthful success/error surface, page refreshes to the new state, effect applied exactly once (re-click → idempotency error, no double effect) |
| IP-DEF-04 | Add same-day WARD + ICU bed-day to a case; cut slice; try to approve | Timeline `BED_DAY_OVERLAP` warning at entry; HIGH fraud alert on the slice; fraud gate blocks approval until authorised resolution; after clearance approval proceeds |
| IP-DEF-05 | HMS batch JSON: (a) malformed rows mixed with valid, (b) unknown facility code | Friendly row-level errors; valid rows applied and conserved (counts in the response match DB); batch idempotency on re-upload (CASE-08 already proven — reference it) |
| OBS-IP-1 | Member benefit panel pre/post PA approval | Same named constraint basis both sides (no gross-vs-net flip) |
| OBS-IP-CUR | Walk PA→case→claim→settlement→member→provider→fund→GL screens for one flow | UGX label everywhere, no bare numbers/foreign symbols |
| OBS-IP-PA-HOLD | After 9.1 P3 final close | Residual hold policy: nothing ACTIVE stranded; released/converted visible; matches signed policy wording |
| OBS-IP-GL | `GLService` trial balance after 9.1 flows | Approval accrual + settlement clearing entries reconcile; claims-payable balance explainable (Σ approved−settled) |
| OBS-IP-TARIFF | Slice line detail vs `PC-UAT-IP-2026` V1/V2 | Tariff resolves per service date incl. the Sept-1 V2 boundary (re-use `uat-verify-contract.ts`); source/version visible |
| OBS-IP-CONTRACT-CONFIG | Package↔provider eligibility + digital-contract linkage on the fixtures | Configured and exercisable (fixture book already proves most — capture screens) |

IP-DEF-06 and IPL-001 are already FIXED-VERIFIED this run — do not redo; the matrix keeps their rows.

### 9.3 Registers, verdict, deploy

1. Update `outputs/GAP_REGISTER.csv`: IPL-PA-01 → FIXED-VERIFIED; CFG-01/OBS-COPY-01/OBS-A11Y-01/OBS-UI-02/
   SETUP-OBS-01 → closed with evidence refs; add new rows OBS-PA-LINK-01, OBS-PA-EXP-01, OBS-PA-VOID-01
   (from §2/A4/A9) as Low OPEN observations; SCN-OBS-01 per the §8 decision.
2. Update `EXECUTIVE_GO_NO_GO_SUMMARY.md` + `VERDICT_ONEPAGE.md`: with IPL-PA-01 fixed-verified AND the §25
   gate complete, the verdict upgrades to **GO for the tested scope** with the P1 breadth register
   (below) carried as the explicit untested-risk list — wording per plan §29/§30 (no Automatic-NO-GO
   condition may remain triggered).
3. `notes/CURRENT_STATUS.md`: append the remediation session summary + what remains.
4. Merge `fix/inpatient-slice-case-pa` → `main` (ff), push, Vercel build → verify `/api/health` version +
   READY, spot-check `/cases` copy live. **Only after Arthur confirms** (prod deploy is his call during the
   test phase).
5. VM teardown (`limactl delete -f uat-inpatient`) only when Arthur confirms the campaign is done — the P1
   breadth work below wants the same VM.

### 9.4 P1 breadth (needed for a clean unconditional GO — schedule as the next campaign block, not this fix)

Not code fixes; listed so nothing silently drops. Each maps to a plan section with its own oracle:
privacy/RBAC per-actor scope sweep (§23) · reporting + GL/trial-balance independent tie-out (§24) ·
maker/checker SoD through the UI as distinct finance personas (SET-09; run-02 drove decisions service-level
with `matrixSatisfied`) · concurrency LIM-01/LIM-03 (two racing approvals; family-pool race) · the six
day-by-day scenario narratives §12–17 with Friday slices (fixtures + clock all ready) · provider-portal
reconciliation parity (§11.9 fast-follow). These stay in the untested-risk register until run.

---

## 10. Execution order and gates

| Step | WP | Gate to proceed |
|---|---|---|
| 1 | WP-F lockfile check (5 min, unblocks clean installs for everything else) | dry-run verdict recorded |
| 2 | WP-A code (A1→A8 in order; A4/A5 can interleave) | tsc + eslint + full vitest green (762 + new) |
| 3 | WP-B hermetic test | suite green 3× on VM fresh seed |
| 4 | WP-C + WP-D + WP-E (small, independent) | tsc + vitest green; a11y check via browser tools |
| 5 | WP-G decision memo | Arthur/directors pick (⭐ B default) |
| 6 | §9.1 acceptance on VM | all probes PASS, evidence filed |
| 7 | §9.2 retest gate | all §25 rows FIXED-VERIFIED/PASS |
| 8 | §9.3 registers + verdict + (on approval) deploy | Arthur's go |

Commit style: one commit per WP (`fix(claims): IPL-PA-01 — slices read case PAs …`,
`test(integration): hermetic interim-settlement suite`, `feat(contracts): WEEKLY reconciliation cadence`,
`fix(cases): copy + a11y on case forms`, `chore: lockfile`), matching the repo's existing message style.

## 11. Out-of-scope (explicitly NOT in this plan)

Option A of SCN-OBS-01 (per-line benefit allocation) · appeal-resolution workflow (carried WP-1 finding,
tracked elsewhere) · provider-portal recon parity screens (§11.9 fast-follow) · PA validity-at-decision
enforcement, PA-refund-on-void, LOU ceiling enforcement at decide (all logged as observations §9.3.1) ·
any settlement-pipeline change (slices reuse it; proven) · prod data backfill (none needed — §2 A3).

## 12. Definition of done

IPL-PA-01 FIXED-VERIFIED on the VM with the §9.1 evidence trail · §25 matrix complete (no un-retested
prior Critical/High → §29.12 clear) · all five Lows closed or reclassified with evidence · SCN-OBS-01
decision recorded and register updated · host suite green (762+) · hermetic integration suite green on
fresh seed · verdict pack updated to GO-for-tested-scope with the 9.4 breadth register carried honestly ·
`main` fast-forwarded and (on approval) deployed with a green health check.
