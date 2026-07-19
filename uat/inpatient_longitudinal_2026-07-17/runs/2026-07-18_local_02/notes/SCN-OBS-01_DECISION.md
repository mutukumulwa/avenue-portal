# SCN-OBS-01 — one benefit category per episode: decision memo

**Finding:** SCN-OBS-01 (Medium, GAP_REGISTER.csv) — a clinical case books all its usage to a single
`benefitCategory`; an admission cannot split usage line-by-line across ambulance / surgical / inpatient /
rehab (plan §13, §26.7). Observed on the Boda polytrauma scenario (CASE-2026-00002): its 49.6M would book
entirely to INPATIENT rather than 0.8M ambulance + 19.6M surgical + 27.4M inpatient + 1.8M rehab.

**Status of this memo:** confirms the finding at the adjudication layer (the register's "confirm at
adjudication" caveat) and records the recommended product decision. **Requires sponsor/director sign-off**
before the register is updated.

---

## Code facts (confirmed on `e314de8`, this remediation pass)

Line-level multi-benefit allocation inside one episode does not exist at **any** layer:

| Layer | Fact | Evidence |
|---|---|---|
| Case | `ClinicalCase` carries ONE `benefitCategory`; the open-case form has a single Benefit selector | `prisma/schema.prisma` (ClinicalCase.benefitCategory); `openCase` input takes one `benefitCategory` (`case.service.ts`) |
| Service entry | `CaseServiceEntry` has a **service** `category` (`ClaimLineCategory`: CONSULTATION/LAB/PHARMACY/IMAGING/PROCEDURE/OTHER) — **no** benefit category | `CaseServiceEntry` model; `addServiceEntry` |
| Slice / final claim | `cutInterimSlice` and `closeAndFile` stamp `claim.benefitCategory = case.benefitCategory` for every slice | `case.service.ts` (both writers) |
| Adjudication | `decide()` books usage with exactly ONE `recordUsage(claim.benefitCategory, approvedAmount)`, and the availability gate binds that one category (+ OVERALL) | `claim-decision.service.ts` (single `recordUsage`; `computeAvailability` for one `benefitCategory`) |

So an episode's entire spend is adjudicated against, and consumed from, one benefit category. The §13 Boda
expectation (split across four benefits from one admission) cannot be met by the case→slice→claim path.

**What IS safe regardless:** the availability gate binds the minimum across CATEGORY **and** OVERALL
(proven PARTIAL-CAP / OVERALL-BIND this run), so money can never exceed a limit whichever way the episode
is categorised. This finding is about **allocation granularity / reporting fidelity**, not a money-safety
hole.

---

## Options

### Option A — per-line benefit allocation (build it)
Add `CaseServiceEntry.benefitCategory` (+ `ClaimLine.benefitCategory`), let a slice/claim carry lines
across categories, and make `decide()` book N `recordUsage` calls and bind N availability constraints per
claim. Touches schema, the contract engine, the decision stack (the just-proven slicing spine), and the UI.
**Multi-week change; destabilises the newly-verified interim-settlement + availability machinery during the
test phase.** Out of scope of the remediation plan — a separate design brief.

### Option B — sign off "one benefit category per episode" for go-live  ⭐ RECOMMENDED
Accept, as a documented product boundary, that an admission is adjudicated under one binding benefit
envelope (INPATIENT for inpatient episodes), and adjust plan §13/§26.7 expectations accordingly. Rationale:
1. INPATIENT is the binding envelope for admissions in every fixture contract — the money outcome is
   correct and safe (category + OVERALL double-bind proven).
2. Option A's blast radius lands on exactly the code this campaign just stabilised; deferring it protects
   the verified spine.
3. A genuine separate-benefit leg (e.g. ambulance) has a clean operational path (below).

**Operational workaround for a real split:** file the distinct-benefit leg (ambulance transport, an
outpatient rehab course after discharge) as its **own direct claim** under that benefit category — the
direct-claim rail is independent of the episode and unaffected by this boundary.

---

## Recommendation

**Adopt Option B for go-live.** Record SCN-OBS-01 in the gap register as an **accepted capability boundary**
(not a silent acceptance reshape — this is a documented product-intent decision per plan §27), update plan
§13/§26.7 to the "one benefit per episode + direct-claim for separate-benefit legs" model, and log Option A
as a backlog design item for a future release if line-level allocation becomes a contractual requirement.

If the sponsor instead requires Option A: **stop** — it is a separate design brief and must not be folded
into the IPL-PA-01 remediation branch.

---

## Sign-off

| Role | Name | Decision (A / B) | Date |
|---|---|---|---|
| Sponsor / director | | | |
| TPA medical | | | |
| Product | | | |
