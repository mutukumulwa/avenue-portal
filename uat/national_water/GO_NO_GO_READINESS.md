# National Water Outpatient UAT — Verdict

**Runbook:** `NATIONAL_WATER_OUTPATIENT_UAT.md` · **Environment:** local disposable `aicare_uat` (Medvex build @ `33280ee`), driven entirely through the UI as real logged-in roles; DB used read-only for side-effect verification. · **Date:** 2026-07-06.

## VERDICT: CONDITIONAL GO

The core outpatient clinical→financial chain is **production-correct end-to-end** for both the approved and the partial-decline journeys, with money movement and controls that reconcile exactly. Go-live for National Water outpatient is achievable **once the dependant-onboarding and rejection-reporting defects are fixed and the provider-access model is decided.**

## Spine questions — all YES, with live evidence
1. **Can an eligible NWSC member's covered outpatient claim run end-to-end?** **YES.** CLM-2026-00772 (Daniel Kato, Nakasero): captured → engine-priced 130,000 → APPROVED via 2-level approval matrix → settled (batch, maker≠checker, voucher PV-2026-00002). Member utilisation +130,000, self-funded fund −130,000, GL balanced.
2. **Can a non-covered dependant line be declined with a reason and kept out of the money?** **YES.** CLM-2026-00775 (Sarah Kato, IHK): PARTIALLY_APPROVED 40,000 — ophthalmological exam covered, spectacle frames excluded (EXC-001, 8,000 disallowed). The 8,000 never entered settlement (IHK batch = approved 80,000 only), member usage, or fund drawdown.
3. **Do member / provider / fund / GL balances update correctly and stay consistent?** **YES.** Daniel used 130,000 (rem 9,870,000); Sarah used 80,000 across two partials (rem 9,920,000 — only approved amounts); fund 5,000,000 → 4,790,000 (drawn = payer share 210,000 exactly); Nakasero & IHK batches SETTLED at approved amounts; **GL balanced at every step** (opening dr=cr 3,736,856.96 → closing 4,076,856.96, diff 0).
4. **Are the controls enforced?** **YES.** Actor traceability (audit + adjudication logs attribute every action to the right user); member privacy (Daniel sees only his family); employer scope (NWSC HR sees only NWSC's 5 members); claims/finance separation (CLAIMS_OFFICER → `/unauthorized` on `/settlement`); maker-checker (settlement maker's self-approve refused; claim & contract chains enforce SoD); RBAC denials render branded `/unauthorized`.

## What is genuinely strong (verified live)
- **Contract engine adjudication** prices correctly against negotiated tariffs (matched by description), applies pay-as-billed and exclusion rules, and previews payable before decision.
- **Double-entry GL** posts and balances on both approval (Claims incurred/Claims payable) and settlement (Claims payable/Bank).
- **Self-funded fund drawdown** deducts only the payer share of approved amounts.
- **Maker-checker** on settlement and a **multi-level approval matrix** on claim decisions, both with real segregation-of-duties enforcement.
- **Duplicate/double-capture detection** flagged the repeat Sarah claim and routed it to review.
- **CSV member import** correctly links dependants to their principal.

## Blocking / must-fix before go-live
- **NW-D02 (High)** — "Add Dependent" from a principal's page silently orphans the dependant (`principalId` dropped). Dependant linkage is essential for family cover; the natural single-add UI path is broken (workaround: CSV import). *Why it blocks:* a reception/HR user onboarding a spouse/child produces an unlinked member with no family unit.
- **NW-D03 (Medium)** — Exclusion & Rejected Claims Report omits excluded lines inside partially-approved claims, so a real rejection is invisible in the rejections report. *Why it matters:* fails runbook acceptance criterion #6 (rejected claim must appear in the report); undermines rejection oversight.

## Conditions that survive even if the above are fixed
- **No provider portal / PROVIDER role.** The runbook's reception/clinician provider logins do not exist; provider steps (check-in, diagnosis, claim capture) were run as the claims-capture account. Whether provider self-service is in scope for the National Water go-live must be decided; if yes, it is unbuilt.
- **NW-D01 (Medium)** — a scheme cannot be bound to a specific Client via the UI (binds to the operator default client); NWSC members inherit the `MVX` number prefix, not `NWSC`. Scoping still works at group level.
- **Heavy claim governance** — even a routine 130,000 outpatient claim routed through a 2-level UNDERWRITER approval chain; with a single underwriter user, the 2nd level needs a SUPER_ADMIN or a second underwriter. Confirm the approval-matrix bands match National Water's intended operating model.
- Low-severity polish: NW-D04 (line-level decision/reason not persisted), NW-D05 (member "Plan Paid" shows 0 after settlement).

## Scope caveat
Both runbook scenarios (approved principal visit; partial-decline dependant visit), the full preconditions (P1–P9), and the Audit & Controls checklist were executed. Rejection basis used = service excluded by contract (EXC-001); over-limit and pre-auth rejection paths were not separately exercised. Run performed on a local disposable stack, not the live production deploy; enterprise-volume behaviour is out of scope here.
