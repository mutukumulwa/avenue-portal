# F7.6 Campaign — Defect / Finding Register (run 2026-07-23_prod_01)

| ID | Sev | Story | Status | Title |
|---|---|---|---|---|
| F76-GAP-01 | Medium | Day-0 P4 | ✅ REMEDIATED 2026-07-25 (prod) | No UI to amend applicability on an ACTIVE provider contract |
| F76-GAP-02 | High | Story 10 | OPEN (build flagged) | Governed policy maker/checker flow not operable through the UI |

---

## F76-GAP-01 — No UI path to add a payer/scheme to a live contract

**Severity:** Medium (product gap — routine TPA operation is UI-unreachable).
Not a security or data-integrity defect: the entitlement gate itself is correct
and fail-closed.

**Discovered:** Day-0 P4, attempting to entitle NWSC members at Aga Khan
University Hospital (contract `PC-2026-128`, ACTIVE) so the B2B/offline rails
accept them.

**Root cause (code-traced):**
- The "Applicability (payers / schemes)" add-form renders only when a contract
  is *editable*, and `contracts/[id]/page.tsx:493` defines
  `editable = status === "DRAFT" || status === "PENDING_CLARIFICATION"`.
- An ACTIVE contract's action bar offers only **Suspend / Terminate**; SUSPENDED
  offers only Reinstate/Terminate — neither is editable, and there is no
  "revert to draft". So a payer cannot be added to an in-force contract.
- The server action `addApplicabilityAction` itself is NOT status-gated (it only
  checks `requireRole(UNDERWRITING)` + tenant ownership) — so the capability
  exists in the service layer; only the UI affordance is missing.

**Blast radius on the campaign (traced via `context.ts:86-104`):** only the two
channels with `scopeMembersByEntitlement: true` are affected —
**Story 3 (B2B API)** and **Story 5 (offline sync)**. The other 12 stories use
tenant-wide member scope and run unaffected. Prod already **correctly refuses**
an un-entitled B2B member with `403 FORBIDDEN_SCOPE` (F8.1 smoke); the B2B
accepted/replay/conflict happy path is green in the integration battery and the
2026-07-23 local prod-mode run (`b2b-story` evidence).

**Decision (sponsor, 2026-07-23):** record the gap; run the 12 unaffected
stories now; keep Story 3/5's prod evidence as the *correct-refusal* proof;
handle the entitlement-amendment UI as a separate build (not campaign-blocking).

**Recommended fix (flagged as a background build task):** add a governed
"amend applicability" affordance on ACTIVE contracts — render the add/remove
applicability controls (and only those) for ACTIVE status, keep the existing
`requireRole(UNDERWRITING)` + `CONTRACT_APPLICABILITY_ADDED` audit, and consider
an approval-matrix gate since it changes who a live contract covers. Do NOT make
the whole ManagePanel editable on ACTIVE — scope strictly to applicability.

**Interim (non-campaign):** the underwriting team can add the payer through the
Renew flow (clones into an editable DRAFT successor) if entitlement is needed
before the fix ships — accepted as heavier than a mid-term amendment should be.

**✅ REMEDIATED — 2026-07-25 (built, tested, merged to `main`, deployed to prod).**
- **Commit** `93de4f4` *feat(contracts): F76-GAP-01 — amend applicability on
  ACTIVE contracts*; Vercel prod deploy `dpl_HpqBf8udNfyLG4MgVMzoCc511FRP`
  **READY** on `avenue-portal.vercel.app`. No DB migration (existing
  `ContractApplicability` table + actions).
- **What shipped (scoped strictly to applicability, per the recommendation):**
  `contracts/[id]/page.tsx` now computes two gates — `editable`
  (DRAFT/PENDING_CLARIFICATION only; tariffs/rules/packages/branches stay here)
  and `applicabilityEditable = editable || status === "ACTIVE"`. `ManagePanel`
  gates the applicability add/remove controls (and *only* those) on
  `applicabilityEditable`, lists current payers with remove controls, and **wires
  up `removeApplicabilityAction`** (previously defined but reachable from no UI).
- **Governance (resolves the "consider an approval-matrix gate" question):** kept
  the lightest option consistent with the codebase — `requireRole(UNDERWRITING)`
  + a **required reason** on any ACTIVE amendment (server-enforced, folded into
  the existing `CONTRACT_APPLICABILITY_ADDED` / `_REMOVED` audit). Deliberately
  **not** the approval matrix: no contract mutation routes through it and its
  contract action types (`PROVIDER_TARIFF_CHANGE` / `SCHEME_ACTIVATION`) are
  unwired, so a matrix gate would be first-of-its-kind and inconsistent with every
  sibling mutation. (Heavier maker/checker precedent, if ever wanted, is
  `OverrideRecord` / `overrideService` as used for `CONTRACT_BACKDATE`.)
- **Verification:** 7 server-action tests + 3 `ManagePanel` render tests added;
  audit-coverage harness stays green; full suite **1143 passed / 109 skipped**;
  typecheck (changed files), brand/currency guards, and eslint all clean.
- **Campaign impact:** the deferred **Story 3 (B2B)** / **Story 5 (offline)**
  ACCEPTED entitlement path is now UI-reachable — underwriting can add NWSC to
  `PC-2026-128` (contract → Applicability → reason + Add); the Renew-flow interim
  above is no longer needed. Prod's `403 FORBIDDEN_SCOPE` correct-refusal evidence
  remains valid for the refusal case. **Next:** re-run the Story 3/5 ACCEPTED
  happy path against prod to close the deferral.


---

## F76-GAP-02 — Governed policy maker/checker flow is not UI-operable

**Severity:** High (gates F8.2 shadow + F8.3 live — automation cannot be turned
on through governed UI). Not a correctness defect: the flow logic is proven by
the F2.5 integration test; the production WIRING is missing.

**Discovered:** Day-1 Story-10a prep, tracing the `/settings/auto-adjudication`
console draft→submit→approve path before clicking.

**Root cause (code-traced):**
- `submitPolicyForApprovalAction` → `submitPolicyChange` (`claim-autopilot/
  policy-approval.ts:67`) creates an `ApprovalRequestService.create` request of
  actionType `AUTO_ADJ_POLICY_CHANGE`; if no approval-matrix rule matches, the
  request is null and submit throws *"No approval matrix is configured for
  AUTO_ADJ_POLICY_CHANGE."* Prod has **zero** such rows.
- The approval-matrix admin UI (`settings/approval-matrix/ApprovalMatrixManager
  .tsx:19`) exposes only 9 action types in its dropdown — `AUTO_ADJ_POLICY_
  CHANGE` is **not** one — so the required rule **cannot be created through the
  UI**. (The server action writes `actionType as never` with no whitelist, so
  the gap is purely the missing dropdown option.)
- Compounding: the whole console is `requireRole(ROLES.ADMIN_ONLY)` and
  `ADMIN_ONLY = ["SUPER_ADMIN"]` (`rbac.ts:22`); prod has ONE SUPER_ADMIN
  (`admin@`). Even with a rule, maker≠checker SoD needs a second qualifying
  approver (the matrix `requiredRole` must be a role a different user holds).

**Impact on the campaign:** blocks Story 10 (policy drill) and the shadow-
proposal evidence woven into other stories. The 12 remaining stories run in OFF
mode (claims route to manual — intake/routing/decision/settlement/security all
still proven).

**Decision (sponsor, 2026-07-23):** build the fix; run OFF-mode stories now;
Story 10 + F8.2 shadow gated on the fix.

**Recommended fix (flagged as a build task):** add `AUTO_ADJ_POLICY_CHANGE` to
the approval-matrix UI ACTION_TYPES; designate the checker role — recommend
`FINANCE_OFFICER` (money-control governance; `finance@` exists and ≠ the
`admin@` maker) — and seed/allow a default rule; confirm the approvals surface
lets that role approve the request. Verify maker (admin@) ≠ checker (finance@)
end-to-end through the UI.
