# F7.6 Campaign — Defect / Finding Register (run 2026-07-23_prod_01)

| ID | Sev | Story | Status | Title |
|---|---|---|---|---|
| F76-GAP-01 | Medium | Day-0 P4 | OPEN (build flagged) | No UI to amend applicability on an ACTIVE provider contract |

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
