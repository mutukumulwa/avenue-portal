# IPL-001 — Interim / Periodic Inpatient Settlement

## Fix brief & execution plan (UAT Option A)

**Finding:** IPL-001 (High → Automatic NO-GO) — the product cannot settle an inpatient
admission in periodic slices while it stays open. An admission produces exactly ONE claim,
filed only at discharge, after which the case is read-only.

**Decision taken:** Option A from `IPL-001_TRIAGE_AND_INTERIM_VERDICT.md` — build interim
inpatient settlement. The signed contract book (§7.1: *"weekly inpatient interim billing closes
each Friday; the final bill closes on discharge"*) makes weekly cadence contractual.

**Branch:** `feat/inpatient-interim-settlement` (off `fix/full-go-fork-b` @ `f74e716`, the build in scope).
**Test env:** disposable Lima VM `uat-inpatient` (controlled clock), per
`uat/inpatient_longitudinal_2026-07-17/runs/2026-07-17_local_01/notes/CURRENT_STATUS.md`.

---

## 1. Key architectural finding — most of the pipeline already exists

The blocker is **one service-layer rule**, not a missing subsystem. Investigation of the running
code shows:

| Fact | Evidence | Consequence |
|---|---|---|
| The schema already allows **one case → many claims** | `Claim.caseId` is non-unique *"by design — one-case-many-claims stays open"* (`schema.prisma:2223-2225`); `case.service.ts:8` *"the schema deliberately allows many for the future"* | No relation change needed to file multiple claims from one case |
| Adjudication is **per-claim** and consumes benefit `used` at decision | `ClaimDecisionService.decide()` runs the availability gate → converts holds → `recordUsage` (`claim-decision.service.ts:520-633`) | Each interim slice, being its own Claim, adjudicates and consumes benefit independently — exactly the seven-ledger `U` rule (§3: *"Claim or interim claim is decided"*) |
| Concurrency safety already exists | availability gate runs first-in-tx under Serializable with bounded retry (`inSerializableTx`) | Two slice approvals cannot double-spend one balance (IP-DEF-06 / P1 already closed) |
| PA/GOP holds **partially** consume correctly | `decide()` consumes each PA only up to the claim's approved amount; residual hold stays `ACTIVE`, PA returns to `APPROVED` detached (`claim-decision.service.ts:578-615`) | §11.5 — *"converts only the amount of hold consumed by that slice; residual episode hold remains visible and usable"* — already satisfied |
| Settlement **scoops any approved claim** for a provider+cycle | `createSettlementBatch` selects `status ∈ {APPROVED, PARTIALLY_APPROVED}, settlementBatchId=null` by provider+cycle (`claim-adjudication.service.ts:399-409`); maker/checker/mark-paid all atomic | An interim slice flows into the weekly/supplementary batch with **zero settlement changes** (SET-04/06/07/09/10/11 already covered) |

**Therefore the feature is:** a way to assemble a Claim from a *subset* of an open case's service
entries at a Friday cut-off, mark those entries so they can never be billed again, keep the case
OPEN, and reconcile. Everything downstream (adjudicate → approve → batch → pay → GL) is reused
unchanged.

---

## 2. Design

### 2.1 Data model (minimal, reuse-first)

**A slice IS a `Claim`** (status `RECEIVED` → normal adjudication → settlement), linked to the case
via the existing `caseId`. We add:

**`CaseServiceEntry.billedInClaimId String?`** (FK → `Claim`, nullable, indexed).
- `null` = unbilled / still open for the next slice.
- set = frozen into that slice's claim; the entry is immutable (cannot void, cannot re-bill).
- This is the **identity-based** double-billing guard the spec demands (SET-02: *"prior lines
  excluded by identity, not description guess"*).

**`Claim` slice metadata** (all nullable / defaulted — additive, no backfill risk):
- `caseSliceSeq Int?` — 1, 2, 3 … assigned in cut order within the case (the final claim gets the
  next seq too, so ordering is total). `null` for non-case claims.
- `isInterimBill Boolean @default(false)` — `true` for a slice cut while the case is OPEN; `false`
  for the final claim and all non-case claims. Distinguishes interim from final in lists/reports.
- `sliceCutoffAt DateTime?` — the frozen Friday cut-off instant.
- `sliceServiceFrom DateTime?`, `sliceServiceTo DateTime?` — the min/max entry date in the slice
  (the §11.3 "service dates").
- `invoiceNumber` already exists (`@@unique([providerId, invoiceNumber])`) — each slice gets its
  own (`{caseNumber}-S{seq}` unless a provider invoice ref is supplied). §11.3 "own invoice reference".

No new join tables. `ProviderSettlementBatch`, `BenefitUsage`, `BenefitHold`, `PreAuthorization`,
`LetterOfUndertaking` are untouched.

### 2.2 `CaseService.cutInterimSlice(...)` — the one new write path

```
cutInterimSlice({ tenantId, caseId, cutoffDate, invoiceNumber?, cutById }):
  load OPEN|PENDING_CLOSURE case with non-voided, billedInClaimId=null entries where entryDate <= cutoffDate
  reject if no such entries ("nothing new to bill since the last slice")
  in a transaction:
    seq = (max caseSliceSeq on this case's claims) + 1     # counts prior slices AND any final claim
    create Claim {
      caseId, isInterimBill:true, caseSliceSeq:seq,
      status: RECEIVED, serviceType from caseType,
      billedAmount = Σ slice entries, benefitCategory = case.benefitCategory,
      invoiceNumber = invoiceNumber ?? `${caseNumber}-S${seq}`,
      sliceCutoffAt = cutoffDate, sliceServiceFrom/To = min/max entryDate,
      dateOfService = min entryDate, admissionDate = case.admissionDate (LOS left null until final),
      claimLines from the slice entries,
      adjudicationLog "RECEIVED — interim slice N from case …",
    }
    UPDATE those entries SET billedInClaimId = claim.id     # atomic freeze — the winner of a race marks them; a concurrent cut re-reads 0 unbilled and no-ops
    re-point case PAs onto the slice claim?  NO — see §2.4 (PA stays on the case; the claim references the case's PAs at decision)
    bed-day overlap fraud alert on the slice (same rule as closeAndFile)
    case stays OPEN (no status change, no dischargeDate)
  return claim
```

Concurrency: the `UPDATE … WHERE billedInClaimId IS NULL AND id IN (…)` inside the tx is the freeze
point; a second concurrent cut computing the same entry set will update 0 rows for the overlap and
its own claim would be empty → we re-check inside the tx and abort the loser with a
current-state message. (Mirrors the `closeAndFile` FG-C9 atomic-claim pattern.)

### 2.3 Availability & holds at slice decision — already correct

Because a slice is a normal Claim, `decide()` handles it:
- availability gate credits the case's own PA holds exactly once (via `creditPreauthIds` from
  `claim.preauths`), so a PA-covered slice is never false-blocked (§3 closing note);
- it consumes each PA up to the slice's approved amount and leaves the residual hold ACTIVE (§11.5);
- `recordUsage` books `U` into the service-date benefit period — once, at decision, never again at
  settlement (§11.6, §21 accounting-timing rule).

### 2.4 PA/LOU linkage (§11.3)

PAs and LOUs attach to the **case** (existing `attachPreauth`/`attachLou`). At slice decision, the
availability gate reads the case's approved/attached PAs for the *credit* (so the hold secures the
slice) but **does not** re-point the PA FK onto the slice claim while the case is open — the same PA
must remain available to secure later slices. Only at **final close** do residual PAs re-point to the
final claim and LOUs become `UTILISED` (existing `closeAndFile` behaviour). Interim slices reference
PAs by reading `case.preauths`; the slice's approval partially utilises them exactly as a PA-covered
claim does today. *(This preserves "residual episode hold remains visible and usable.")*

### 2.5 `closeAndFile` — bill the residual only (§11, SET-03)

- File a final claim from non-voided entries with `billedInClaimId = null` (the residual).
- Entries already frozen into slices are **not** re-billed (no double count).
- If there are **no** residual entries but the case has ≥1 slice → close `CLOSED_FILED` with **no**
  new claim (the slices are the claims; SET-03 "reconciles prior slices without double billing").
- If there are no residual entries and no slices → the existing "cannot file an empty case" error.
- The final claim gets `caseSliceSeq = max+1`, `isInterimBill = false`; keeps the one-final-close
  atomic guard (CASE-13) by claiming the `OPEN|PENDING_CLOSURE → CLOSED_FILED` transition first.

### 2.6 Void guard (CASE-12, immutability)

`voidServiceEntry` rejects any entry with `billedInClaimId != null`: *"This service line is already
billed on interim slice {claimNumber} and cannot be voided — raise an adjustment on that claim."*
Frozen financial facts stay immutable; late corrections go through the claim/adjustment path, not by
mutating a billed slice.

### 2.7 Reconciliation read-model (§11.9, §4, probe #11)

`CaseService.getCaseReconciliation(tenantId, caseId)` returns the per-case seven-ledger view derived
from the case's claims (slices + final):
- `B` billed-to-date = Σ non-voided entries (= accrued);
- billed-on-slices vs unbilled-residual;
- `U`/`P` approved-to-date = Σ slice `approvedAmount` (decided);
- `S` paid-to-date = Σ approvedAmount on claims whose `settlementBatch.status = SETTLED`;
- outstanding payable = approved − paid;
- remaining guarantee = Σ case PA approved − utilised;
- member share / write-off / disallowed from claim lines;
- per-slice row: seq, invoice, cut-off, service range, billed, approved, settlement status.

Surfaced on the admin case detail page. (Provider-portal parity for these figures — §23/§11.9 — is
noted as a fast-follow; the admin/ops reconciliation panel proves the money control for the campaign.)

---

## 3. Work packages

| WP | Scope | Files (touch) | Proves |
|---|---|---|---|
| **WP1** | Schema: `CaseServiceEntry.billedInClaimId` + index; `Claim` slice fields | `prisma/schema.prisma` | data model |
| **WP2** | `cutInterimSlice()` | `src/server/services/case.service.ts` | SET-01, §11.1-3 |
| **WP3** | `closeAndFile` residual-only; all-sliced no-empty-claim; void guard | `src/server/services/case.service.ts` | SET-03, CASE-12/13 |
| **WP4** | `getCaseReconciliation()` | `src/server/services/case.service.ts` | §11.9, probe #11 |
| **WP5** | UI: cut-slice action + slices list + recon panel + copy | `src/app/(admin)/cases/[id]/actions.ts`, `.../[id]/page.tsx` | operable path |
| **WP6** | Unit tests (mocked prisma) | `tests/services/case.service.test.ts` | regression |
| **WP7** | Real-DB proof on Lima VM (SET-01/02/03 end-to-end, seven-ledger conservation) | VM + evidence files | IPL-001 closure |

### Acceptance mapping (probes this closes)

- **Probe #6** — "linked interim claims/slices while remaining open" → **yes**.
- **SET-01** immutable slice on open case, future accrual continues.
- **SET-02** second slice = only new unbilled lines, excluded **by identity**.
- **SET-03** final close = residual only, no double billing.
- **§11.5/§11.6** partial hold consumption; benefit used once at decision.
- **CASE-12/13** billed lines immutable; one final close.
- Downstream SET-04/06/07/09/10/11 (batch cadence, concurrency, self-approve block, mark-paid once)
  already pass on the reused settlement pipeline; re-verified as part of WP7.

---

## 4. Test strategy

1. **Unit (mocked prisma)** — extend `tests/services/case.service.test.ts`. Fast, in-repo, runs in
   `npm test`. Cover cut-slice assembly, seq, invoice, entry freeze, identity exclusion, residual
   close, all-sliced close, void-frozen rejection.
2. **Green gates** — `npx tsc --noEmit`, `eslint`, `check-no-avenue`, `check-currency-labels`, full
   `vitest` (baseline 736 green — must stay green).
3. **Real-DB proof on the Lima VM** — the campaign's controlled-clock environment. `prisma db push`
   the additive schema, then drive an open inpatient case through **two Friday slices + final close**
   through the real UI/services, adjudicate and settle each, and verify the seven ledgers reconcile
   (B = billed; U booked once; S = settled once; GL balanced; no entry billed twice). Capture
   evidence into `runs/2026-07-17_local_01/evidence/`.

## 5. Guardrails / non-goals

- **No production or shared DB touched** (§2.2). VM only for live proof; unit tests use mocked prisma.
- **Additive schema only** — every new column nullable/defaulted, no destructive migration; safe for
  the build's `prisma db push` deploy path.
- **No settlement-pipeline rewrite** — slices reuse it as-is.
- **Provider-portal reconciliation parity** and the full six-scenario longitudinal re-run (§12-17) are
  **out of scope of this fix**; this brief delivers the capability + the admin money path + the SET
  probes. The campaign resumes on the VM once the capability lands.
- Report gaps found while building as their own findings; do not silently reshape acceptance.
