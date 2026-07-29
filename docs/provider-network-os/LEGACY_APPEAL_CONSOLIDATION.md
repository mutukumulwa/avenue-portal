# Legacy same-claim appeal consolidation (PNOS F5.17)

**Status:** code consolidation DONE; data migration GATED on product/claims/finance sign-off.

New disputes on a **decided** claim are filed as a **reconsideration** (F5.11–F5.16): a governed
case that challenges the decision **without ever mutating the original claim** (D13). The old
"same-claim appeal" — which flipped the original claim's status to `APPEALED` — is **retired**.
Legacy statuses are **not deleted**; historic records stay read-only.

## 1. Inventory of the legacy appeal path

| Kind | Location | F5.17 disposition |
|---|---|---|
| Writer | `claim-adjudication.service.ts::initiateAppeal` — set `status: "APPEALED"` + appeal fields | **Retired** — now throws `PRECONDITION_FAILED`; no status write |
| Action | `(admin)/claims/[id]/adjudication-actions.ts::initiateAppealAction` | **Removed** |
| UI | `(admin)/claims/[id]/page.tsx` — "Initiate Appeal" form + `canAppeal` | **Removed** (status badge + audit log for historic `APPEALED` untouched) |
| Enum | `ClaimStatus.{APPEALED, APPEAL_APPROVED, APPEAL_DECLINED}` | **Kept** (no deletion — historic validity) |
| Lifecycle | `claim-lifecycle.ts` TRANSITIONS `…→APPEALED`, `APPEALED→APPEAL_APPROVED/DECLINED` | **Kept, annotated retired** — no writer; the guard enforces it |
| Reports | `report-exclusions.ts` (`APPEAL_DECLINED` ∈ FULLY_DECLINED), `claim-autopilot/evaluate.ts` (dup-exclusion) | **Kept** (historic reporting) |
| Display | `(admin)/claims/[id]/page.tsx` icons for `APPEAL_APPROVED`/`APPEAL_DECLINED` audit actions | **Kept** (read-only) |

**Dead targets:** `APPEAL_APPROVED` / `APPEAL_DECLINED` were never written by any code (the appeal
resolution flow was never built) — the only legacy writer produced `APPEALED`.

## 2. Safe mapping (defined in `claim-reconsideration/legacy-appeal.ts`)

| Legacy status | Reconsideration case status | Rationale |
|---|---|---|
| `APPEALED` | `UNDER_REVIEW` | filed, never resolved (no resolver existed) |
| `APPEAL_APPROVED` | `ACCEPTED` | terminal favourable outcome |
| `APPEAL_DECLINED` | `UPHELD` | terminal upholding outcome |

`mapLegacyAppealToReconsideration(claim)` is **pure** — it reads a claim and returns the
reconsideration case it *would* become (reasonCode `LEGACY_APPEAL`, narrative from `appealNotes`,
`originalAdjudicatorId` from the claim's adjudicator, `filedAt` from `appealDate`). It **never
touches the claim** (D13). `migratable` is true only for **unambiguous** records — notes present
**and** a reviewer distinct from the original adjudicator.

## 3. Architecture guard (enforced by `tests/services/legacy-appeal-consolidation.test.ts`)

- No source file writes `status: "APPEALED" | "APPEAL_APPROVED" | "APPEAL_DECLINED"` — a new
  route/action that revives the mutation path turns the build red.
- Nothing invokes the retired `initiateAppeal`.
- The `ClaimStatus` legacy values still exist (historic records/reports keep working).

## 4. Migration — GATED (not run here)

A migration would, for each `migratable` legacy appeal, create a reconsideration case via the
mapping above, **leaving each original claim's decision and money exactly as they are**. Before it
runs it needs:

1. **Sign-off** from product + claims + finance on the status mapping and on treating a migrated
   `APPEAL_APPROVED` as an `ACCEPTED` reconsideration (which does **not** retroactively create a
   supplemental — any owed money is a separate, explicit F5.16 outcome).
2. A **dry-run inventory** on production (`select status, count(*) … where status in
   ('APPEALED','APPEAL_APPROVED','APPEAL_DECLINED')`) — likely **zero** rows, given the flow was
   never completed. Ambiguous records (no notes / reviewer == adjudicator) are **not** migrated;
   they stay historic read-only for human review.
3. Migrated totals/decisions must be **unchanged** — the migration adds reconsideration cases; it
   never edits a claim.

**Stop (per spec):** no deletion of the legacy statuses.
