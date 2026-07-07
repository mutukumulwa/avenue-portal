# National Water Outpatient UAT — Defect Register

Canonical defect list for this run. IDs prefixed `NW-D`. Severity rationale in-line.
Re-test column updated only by fresh front-end evidence.

| ID | Sev | Title | Status | Re-test |
|---|---|---|---|---|
| NW-D01 | Medium | No UI to bind a scheme to a specific Client — scheme always attaches to operator default client | **FIXED** | FIXED-VERIFIED 2026-07-06 |
| NW-D02 | High | "Add Dependent" from a principal's page orphans the dependant — `principalId` never persisted | **FIXED** | FIXED-VERIFIED 2026-07-06 |
| NW-D03 | Medium | Exclusion & Rejected Claims Report omits excluded lines inside partially-approved claims | **FIXED** | FIXED-VERIFIED 2026-07-06 |
| NW-D04 | Low | Line-level `adjudicationDecision`/`declineReason` not persisted on adjudicated claim lines | **FIXED** | FIXED-VERIFIED 2026-07-06 |
| NW-D05 | Low | Member "Care History" shows Plan Paid KES 0 after a claim is settled/PAID | **FIXED** | FIXED-VERIFIED 2026-07-06 |
| GAP | — | No provider portal / PROVIDER_USER role (runbook line 63) | **BUILT** | Provider portal + HMS API delivered & verified 2026-07-06 |

---

## Remediation pass (2026-07-06) — all fixed, verified through the UI, 465/465 tests green, tsc clean

- **NW-D02** — `/members/new` now reads `?principalId=`, renders it as a hidden field, locks the scheme to the principal's, and the service validates the principal + inherits its group. `createMember` persists `principalId`. *Verified:* Add-Dependent → Joan Kato `MVX-2026-00261` linked to Daniel; Family Unit shows 4 members.
- **NW-D01** — `/groups/new` gains a Client (payer) selector; the action passes the chosen `clientId` to `createGroup`; `nextMemberNumber` now derives the prefix from the group's client (per-prefix sequence). *Verified:* scheme "NWSC Test Scheme B" bound to the NWSC client; member enrolled as `NWSC-2026-00001`.
- **NW-D04 + NW-D03** — `ContractEngineIntegration.evaluateAndPersist` now writes per-line `adjudicationDecision` + human `declineReason`; the Exclusion & Rejected report is rewritten to a shared line-aware source (`report-exclusions.ts`, used by both the page and the CSV/PDF export) that surfaces excluded lines inside approved/partial claims. *Verified:* CLM-00777 frames line = DECLINED "EXC-001 — …"; report shows 5 records incl. the partial-claim frames lines.
- **NW-D05** — `markSettlementBatchPaid` now sets `paidAmount = approvedAmount` per claim at settlement. *Verified:* CLM-00778 PAID with `paidAmount` 50,000; Daniel's Care History shows PLAN PAID KES 50,000 (was 0). Unit test `settlement-gl.test.ts` strengthened to assert it.
- **Provider portal + HMS API** — new `PROVIDER_USER` role + `/provider/*` portal (dashboard, eligibility, claim capture, claim detail, settlements, per-facility HMS API keys), all hard-scoped to the user's provider. Claim capture and the `/api/v1/claims` HMS endpoint both funnel through one shared `runClaimIntake` → identical gates + engine adjudication. *Verified:* provider user `reception.nakasero.uat@test.local` filed CLM-00778 (engine matched tariff, audit-attributed to PROVIDER_USER); HMS key posted CLM-00779 attributed to Nakasero from the key alone; cross-provider claim access blocked (404); admin routes → /unauthorized.

---

## NW-D01 — Scheme cannot be assigned to a specific Client via the UI
- **Severity:** Medium — the product models a Client (payer/employer) tier above the scheme, and the runbook's employer (National Water & Sewerage Corp) is created as a Client, but a newly-created scheme cannot be attached to it through any UI. `enrollGroupAction` binds the scheme to `session.user.clientId`, and an operator-level admin resolves to the tenant *default* client (`resolveSchemeClientId` → slug `default`). There is no client field on `/groups/new` and no client-switcher anywhere in the app (grep-confirmed).
- **Persona:** SUPER_ADMIN (admin@medvex.co.ug).
- **Repro:** Create Client "National Water & Sewerage Corporation" (`/clients/new`). Create scheme "National Water Staff Medical Scheme" (`/groups/new`). Observe scheme's `clientId` = "Medvex — Default Client", not NWSC.
- **Observed:** Scheme bound to default client; NWSC client is an island. Members enrolled into the scheme also inherit the default client's `MVX` member-number prefix instead of NWSC's `NWSC` prefix.
- **Expected:** A scheme should be assignable to the intended Client during creation (or editable afterward). The employer's configured member-number prefix should apply.
- **Impact on run:** All employer-scope and self-funded-fund tests are keyed off the **Group/scheme** (which is where HR and fund scoping are actually enforced), so the run proceeds at group level. The Client tier is untested for scoping because it is unreachable via UI.
- **Evidence:** `04_Evidence/Screenshots/P1a-client-created.png`, `P1b-group-created.png`; DB: `Group.clientId` = default client.

## NW-D02 — "Add Dependent" UI path silently orphans the dependant
- **Severity:** High — a control/data-integrity failure on the primary member-management path. A SPOUSE/CHILD created this way has `relationship` set but `principalId = NULL`, so it is an orphan that is not part of any family unit. The runbook lists dependant linkage as an explicit audit control and defect trigger.
- **Persona:** SUPER_ADMIN.
- **Repro:** Open principal Daniel Kato's member page → click **Add Dependent** (links to `/members/new?principalId=<danielId>`) → fill Sarah Kato (SPOUSE) → Register. 
- **Observed:** Sarah is created ACTIVE but `principalId = NULL`; Daniel's Family Unit still shows "No dependants". Root cause: `/members/new/page.tsx` does not render the `principalId` query param as a hidden field, and `/members/new/actions.ts` never reads `principalId`. The value is dropped entirely.
- **Expected:** The dependant is linked to Daniel (`principalId` = Daniel's id) and appears in his Family Unit.
- **Note:** The **CSV import** path (`/members/import`, `principalIdNumber` column) *does* resolve and set `principalId` correctly — so linkage is only achievable via bulk import, not the single-add UI a reception/onboarding user would naturally use.
- **Evidence:** `04_Evidence/Screenshots/P4-daniel-detail.png` (Family Unit "No dependants" after add); code refs above; DB: orphan Sarah `MVX-2026-00257` / Miriam `MVX-2026-00258` with `principalId` NULL.

## NW-D03 — Exclusion & Rejected Claims Report omits line-level exclusions in partial approvals
- **Severity:** Medium — the report is the control surface for "what did we reject and why" (runbook B11 / acceptance #6). `getExclusionRejectedData` filters claims to `status IN (DECLINED, VOID, APPEAL_DECLINED)` only. A **PARTIALLY_APPROVED** claim carrying an excluded/rejected line is never listed, so a real rejection is invisible in the rejections report.
- **Repro:** CLM-2026-00775 (Sarah, IHK) — line "Fitting Spectacle Frames" excluded (EXC-001, `disallowedAmount` 8,000), claim PARTIALLY_APPROVED at 40,000. Open `/reports/exclusion-rejected` → report shows only old fully-declined claims; CLM-00775 and its excluded line are absent.
- **Expected:** Line-level exclusions/rejections in approved/partial claims should surface in the exclusion report (the data exists on the line: `disallowedAmount`, and the engine reason EXC-001).
- **Evidence:** `04_Evidence/Screenshots/B11-exclusion-rejected-report.png`; code `reports/[reportType]/page.tsx getExclusionRejectedData`.

## NW-D04 — Line-level adjudication decision/reason not persisted
- **Severity:** Low — on adjudicated claims the per-line `adjudicationDecision` and `declineReason` fields stay null; only the claim-header `approvedAmount` and the line `disallowedAmount` (8,000 on the excluded line) are written, plus the claim-level `AdjudicationLog` note. Line-level decision/reason are not queryable per line, which is part of why NW-D03 bites.
- **Repro:** CLM-2026-00775 lines: both show `adjudicationDecision` NULL, `declineReason` NULL; frames line has `disallowedAmount` 8,000.
- **Evidence:** DB claim-line rows; `AdjudicationLog` for CLM-00775 carries the full reason at claim level.

## NW-D05 — Member "Care History" shows Plan Paid 0 after settlement
- **Severity:** Low — Daniel's member portal Care History showed PROVIDER BILLS 130,000 / PLAN APPROVED 130,000 / **PLAN PAID KES 0** while CLM-2026-00772 is settled (status PAID, voucher PV-2026-00002). The member-facing "paid" figure does not reflect the completed settlement.
- **Evidence:** `04_Evidence/Screenshots/A14-daniel-utilization.png`.
