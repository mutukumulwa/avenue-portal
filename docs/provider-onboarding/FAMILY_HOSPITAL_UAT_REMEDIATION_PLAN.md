# Family Hospital UAT remediation plan

Status: implementation-ready plan; no product or production-data fix is applied by this document  
Prepared: 2026-09-11  
Repository baseline inspected: `3fa01593141f6866e5806ee77b9db30f8e2c465b` (`3fa0159`)  
Release verdict: **NO-GO for another Family Hospital trial until the release gates in section 13 pass**

This document converts the Family Hospital email thread and the supplied defect assessment into a
single execution specification. The attachments are evidence, not implementation instructions. If
an attachment recommends an action that conflicts with this plan, repository policy, or safe handling
of credentials and health data, this plan wins.

The plan is intentionally prescriptive. An implementing agent should perform the tasks in order,
record the requested evidence, and stop at the named decision gates rather than inventing policy.

---

## 1. Evidence and interpretation rules

### 1.1 Sources reviewed

1. `Gmail - Your Medvex access for Family Hospital.pdf`: the eight-message exchange with Abel
   Ssemakula, including screenshots of the initial and current UAT failures.
2. `FAMILY_HOSPITAL_TRIAL_DEFECTS.md`: a code-oriented defect assessment prepared against commit
   `3fa0159`.
3. The current repository at the same commit, including the provider claim, pre-authorisation,
   eligibility, navigation, user-administration, notification, tariff, contract, and intake paths.
4. The vendored Next.js 15.5.15 App Router documentation, beginning at
   `docs/vendor/nextjs-15.5.15/PROVENANCE.md`.

### 1.2 Confidence labels used below

- **User-confirmed**: Family Hospital reported or demonstrated it in the email thread.
- **Code-confirmed**: the current source directly explains or reproduces the behavior.
- **Data check required**: the code makes the failure plausible, but the live Family rows must be
  inspected read-only before claiming the live-data fact.
- **Adjacent defect**: not stated as a numbered complaint, but exposed by the same workflow and
  likely to invalidate the next UAT run if left in place.

Do not turn a **data check required** item into a public claim until the preflight report proves it.

### 1.3 What Family Hospital has already answered

Do not ask the provider these questions again unless a contradictory source appears:

| Topic | Confirmed answer |
|---|---|
| Linet's email | The corrected Gmail address supplied on 2026-08-29 is authoritative. |
| Duplicate prices | Use the lower price. |
| Tax | Supplied prices are tax-inclusive. |
| Payment term | 30 days. |
| Service codes | Family Hospital does not use them. Description is the primary identifier. |
| Initial eligibility failures | The first test dataset was wrong and was replaced; this is closed unless regression testing fails. |

### 1.4 Provider inputs still outstanding

These are operational inputs, not excuses to leave product defects unresolved:

1. claim-submission deadline;
2. balance-billing/shortfall policy;
3. 20–50 de-identified recent bills, including some inpatient bills;
4. ideally, the top services and diagnoses by volume.

Until the first two policies are supplied, do not invent contract terms. Mark the fields as
`UNKNOWN`, keep affected adjudication/manual-review warnings explicit, and prevent any automated
decision that depends on an unknown term.

---

## 2. Executive diagnosis

The UAT problems are not primarily user-training problems. They come from four systemic gaps:

1. **The facility's commercial data is disconnected from provider capture.** New claims and
   pre-authorisations load the global CPT reference table, whose reference costs are KES, then label
   and persist those values as UGX. Family's 4,451 supplied services live in `ProviderTariff`, but
   the capture forms do not read that table.
2. **Provider forms are code-first where the hospital is description-first.** Family has no local
   service codes. The current form makes a CPT code lookup the effective service selector, presents
   category and description in a confusing order, and does not make the category filter the search.
3. **Several workflows expose database primitives rather than task-oriented controls.** Direct claim
   entry does not resolve a typed member number to a member; diagnosis is a long native select; the
   eligibility date is blank; comma-formatted money can be rejected; and the provider header cannot
   hold all links safely.
4. **Account creation and account delivery are separate in practice, but the UI pretends they are one
   completed operation.** The invite action creates a login from an administrator-chosen temporary
   password but sends no invitation. The email thread then exposed passwords by sending them to a
   third party. This is both an onboarding failure and a security defect.

The pricing defect is the most dangerous. It can create financially incorrect claims that look
valid. The invitation defect is the other release blocker because the actual front-desk and billing
actors cannot perform independent UAT.

---

## 3. Problem register

| ID | Severity | Problem | Evidence | Required outcome |
|---|---|---|---|---|
| FH-01 | Blocker | Staff invitations are not delivered; temporary passwords were relayed in one shared email. | User-confirmed and code-confirmed. `inviteUserAction` creates a user but does not send mail. | One-time, individually delivered setup links; visible delivery state and resend; all exposed passwords rotated. |
| FH-02 | Blocker | Claims and pre-authorisations use generic CPT reference costs in KES and display them as UGX instead of using Family's price list. | User-confirmed and code-confirmed. `CPTCode.averageCost` is documented as KES; provider forms render hard-coded UGX. | Search and price from the applicable `ProviderTariff`; one resolved currency per case; no silent global-cost fallback. |
| FH-03 | Blocker | Family's 4,451 tariff rows may be unattached to the active contract/version that the pricing engine evaluates. | Data check required. The engine reads contract-bound tariffs; standalone rows can be ignored. | A signed preflight proves exact row count, effective scope, contract/version attachment, categories, dates, and UGX currency before UI enablement. |
| FH-04 | High | Typing a member number in a new claim does not resolve or display the member. | User-confirmed and code-confirmed. Only the eligibility-to-claim link supplies a prefilled name. | Exact, provider-scoped member resolution with minimal identity and eligibility context; submit revalidates it. |
| FH-05 | High | ICD-10 selection is a long native list and cannot be searched by partial code or clinical text. | User-confirmed and code-confirmed. Initial page load is capped and the control is a native select. | Accessible, server-backed partial search with no diagnosis price exposed. |
| FH-06 | High | The claim-line interaction is ambiguous: description, category, and CPT appear disconnected; choosing CPT can silently fill or change other fields. | User-confirmed and code-confirmed. | Choose category, search Family service descriptions within that category, select a tariff line, then show the resolved rate/currency explicitly. |
| FH-07 | High | “CPT” is the wrong primary label/key for Family, which has no local service codes. | User-confirmed; code/data-model mismatch confirmed. | Description is required and primary. “Service code” is optional; `cptCode` is optional clinical/reference metadata and is never overloaded with a local code. |
| FH-08 | High | Provider navigation overlaps the Medvex brand and makes Dashboard unclickable. | User-confirmed and code-confirmed by the fixed-width, non-wrapping desktop layout. | Grouped responsive navigation with every item reachable by pointer, touch, and keyboard at all supported widths. |
| FH-09 | Medium | Eligibility service date is blank even though the server treats blank as today. | User-confirmed and code-confirmed. | Default visibly to the Kampala operating date; preserve the entered date after errors. |
| FH-10 | High | Pre-authorisation rejected the entered estimate `600,000` as invalid. | User screenshot; code path converts a raw number input without a grouping-separator parser. | A shared money input accepts normal Ugandan grouping separators and submits canonical decimal values. |
| FH-11 | High | The same CPT, ICD, currency, date, and service-line defects remain in correction, resubmission, and pre-authorisation paths. | Adjacent defect, code-confirmed. | Shared components and server contracts replace every affected provider entry path, not only `/provider/claims/new`. |
| FH-12 | High | Provider benefit lists are inconsistent and some omit inpatient/surgical benefits needed by this trial. | Adjacent defect, code-confirmed. | One canonical, policy-approved option list covers all provider forms; omissions are explicit and tested. |
| FH-13 | High | Claims created during broken pricing UAT are financially unreliable. | User screenshots and FH-02. | Identify them, preserve the audit trail, and withdraw/cancel or clearly quarantine them through supported lifecycle actions; never delete them. |
| FH-14 | Medium | The ICD database appears to be a small/demo seed, so a better search control alone may still return an incomplete clinical catalogue. | Adjacent defect; repository seed requires verification against the deployed database. | Count/version the deployed terminology; load an approved complete catalogue or explicitly constrain and disclose UAT coverage. |

### 3.1 Items that are not open product defects

- The first dataset's “not eligible” response was acknowledged as a Medvex data issue and replaced.
  Keep it in regression coverage, but do not reopen it without a failed current-data test.
- Family's decision to proceed without service codes is valid. Do not block UAT on inventing codes.
- Duplicate-price, tax-inclusive, and 30-day-term questions have answers. Convert them into import and
  contract assertions.

---

## 4. Non-negotiable implementation rules

1. Preserve the current dirty worktree. Do not reset, clean, delete, or stash the owner's existing
   files without approval. Execute this plan from an agreed clean `codex/family-hospital-uat-*`
   worktree or after the owner commits the relevant state.
2. Before changing an App Router file, read the exact Next.js 15.5.15 guide named by
   `docs/vendor/nextjs-15.5.15/PROVENANCE.md`. Treat every Server Action as a public endpoint:
   authenticate, authorize, validate, and scope it on the server.
3. A client-side display is never authority. Re-resolve member, contract, tariff, category, currency,
   and clinical code during submission.
4. Derive `tenantId`, `providerId`, permitted branch IDs, and permissions from the session. Never
   trust those identifiers from hidden inputs or the browser.
5. Do not place member numbers, names, email addresses, or other sensitive identifiers in query
   strings, logs, audit metadata, screenshots, or test names. Use POST/Server Actions and minimal
   DTOs. A setup token may travel only in the invitation link's URL fragment; remove the fragment
   from browser history before posting the token to the server, and never put it in the URL path or
   query where access logs can capture it.
6. A file with top-level `"use server"` may export async functions only. Put constants, schemas, and
   result types in separate modules. The production build is the final compiler check.
7. Do not reuse `DiagnosisSearch` or `ProcedureSearch` unchanged: both currently display reference
   costs as UGX. Reuse their accessible interaction patterns only after removing the price behavior
   and changing the procedure data source.
8. Never fall back from a missing provider tariff to `CPTCode.averageCost`. A missing/ambiguous
   contract or tariff must produce a clear, safe state, not a plausible-looking price.
9. Never delete historical claims, pre-authorisations, tariffs, invitation records, or audit events.
   Withdraw, cancel, deactivate, supersede, or compensate through an auditable operation.
10. Do not roll back user/account creation because email delivery fails after commit. Record delivery
    failure, tell the administrator exactly what failed, and allow a rate-limited resend.
11. Do not send or forward the August 28 credential email. No email, action response, audit event, or
    log may contain a password.
12. Use decimal-safe money handling. Do not use binary floating-point for persisted or compared
    monetary values.
13. Use `operatingTodayISO()` for the Kampala operating date. Do not derive a provider-facing date
    with `new Date().toISOString().split("T")[0]`.
14. Do not add a schema constraint or mutate shared data until a read-only preflight has been saved and
    reviewed. Follow `docs/uat-human-factors-remediation/SCHEMA_DEPLOYMENT.md` for migrations.
15. Every task ends with tests and an implementation-log entry. “The UI looks right” is not enough.

---

## 5. Fixed product decisions for this remediation

These decisions remove avoidable design ambiguity for the implementing agent.

| Decision | Required behavior |
|---|---|
| Service identity | `serviceName`/description is primary and required. `providerServiceCode` and `cptCode` are optional, distinct fields. Family can submit without either. |
| Service discovery | The user chooses a benefit/service category, then searches the provider's applicable tariff by partial service name. Results must already match the chosen category. |
| Tariff authority | The applicable, effective-dated `ProviderTariff` under the same contract context used by adjudication is the only source of the displayed reference rate. |
| Billed amount | Selecting a tariff line suggests the contracted unit rate, but the billed unit price remains editable. The UI shows billed price and contracted/reference rate as different concepts. |
| Unlisted service | Allow description-first manual entry only if existing policy permits it. Show “not in contracted tariff—manual review”; require manual billed price; never import a global average. |
| Currency | Resolve one contract/tariff currency for the case. Family's release gate expects UGX. Block mixed currencies and contradictory tariff/contract currencies. |
| Member lookup | Direct entry and the eligibility-to-claim path both use one server-side resolver. Search is exact by member number; the result is minimal and provider-scoped. |
| Diagnosis | Search by partial code, description, or category after two characters; show no standard charge or other price. |
| Dates | Default visibly to Kampala today, permit valid policy dates, and preserve user input after errors. |
| Invitations | Create an inactive/pending account with a hashed, single-use setup token; the invitee chooses the first password. Administrators never choose or see it. |
| Provider user management | The facility administrator can invite/resend within its own provider, allowed personas, and allowed branches using the same canonical invitation service as platform administrators. |
| Navigation | Use grouped desktop menus plus a compact mobile menu. Do not solve the desktop defect with a permanently scrolling header. |

### 5.1 Decisions that still require an owner

Record answers before the dependent task. The recommended default is deliberately actionable.

| Gate | Decision | Recommended default | Blocks |
|---|---|---|---|
| DEC-FH-01 | May a provider submit an unlisted service? | Yes, with mandatory description and billed amount, explicit manual-review status, and no automatic contracted rate. | P03/P04 |
| DEC-FH-02 | Should `CUSTOM` appear as a benefit choice? | Hide it from providers unless a tenant-defined label exists; keep all other applicable enum values. | P04 |
| DEC-FH-03 | Approved ICD source/version and licensing | Use the organization's approved production ICD-10 release; do not promote the demo seed as complete. | P04/P08 |
| DEC-FH-04 | Treatment of existing broken UAT claims/pre-auths | Withdraw/cancel with reason `TEST_DATA_INCORRECT_TARIFF`, retaining full audit history. | P07 |
| DEC-FH-05 | Setup-link lifetime | 24 hours; resend invalidates every older unused invitation for that user. | P05 |

If a decision is not supplied, use the recommended default except where licensing or contractual
authority is required. For those cases, stop rather than assume.

---

## 6. Dependency order and release slices

```text
P00 baseline + containment
  ├─> P01 Family data/contract preflight
  │     └─> P02 provider context + member/tariff services
  │            └─> P03 shared service/diagnosis/money controls
  │                   └─> P04 wire every provider capture path
  ├─> P05 secure invitations and provider user management
  └─> P06 responsive provider navigation

P01 + P04 + P05 + P06
  └─> P07 trial-data remediation
        └─> P08 deploy, smoke test, and Family re-UAT
```

`P02` must not expose tariff results until `P01` proves that the same rows are eligible for the
contract engine. `P03` builds shared primitives; `P04` is not complete until all four capture paths
use them. P05 and P06 may be developed independently, but all paths converge before P07.

---

## P00 — Establish a safe baseline and contain the current risk

### P00.01 — Create the implementation record

**Files:**

- create `docs/provider-onboarding/FAMILY_HOSPITAL_UAT_IMPLEMENTATION_LOG.md`;
- create `docs/provider-onboarding/FAMILY_HOSPITAL_UAT_DECISIONS.md`.

**Steps:**

1. Record the starting SHA, branch, Node/npm/Next/React/Prisma versions, schema migration head,
   environment, feature flags, SMTP state, worker state, and database identifier.
2. Record the dirty-worktree files before creating or selecting the clean execution worktree.
3. Record every task below as `NOT_STARTED`. For each completed task later, add commit SHA,
   migration, tests, exact commands/results, evidence path, data operation, and rollback note.
4. Copy only the answers—not credentials or personal medical data—from section 1.3 into the decision
   record. Record the outstanding gates separately.

**Acceptance:** a reviewer can identify exactly which source revision, database, and configuration
produced every later result.

### P00.02 — Immediate credential containment

**Owner:** operations/security; no product deploy required.

**Steps:**

1. Identify every account whose password appeared in the email/PDF. Treat all such passwords as
   compromised, even if the recipient was trusted.
2. Invalidate or rotate the exposed password. For any account already activated, revoke active
   sessions by incrementing the existing session/version mechanism.
3. Do not forward the old email. If access is needed before P05 ships, use the existing audited reset
   mechanism to deliver a fresh temporary credential to each person separately through a verified
   channel, require immediate change, and never record the value in the implementation log.
4. Verify Linet's corrected address through the existing contact, without echoing it into test data.
5. Record only account ID, operation ID, operator, timestamp, and outcome.

**Acceptance:** no exposed credential remains valid; each staff account is either securely activated
or visibly pending; the audit log contains no secret.

### P00.03 — Freeze unreliable UAT records

**Steps:**

1. Read-only query the Family trial claims and pre-authorisations created during the affected dates.
   Include the visible claim references around `CLM-2026-00308` through `CLM-2026-00311` and the
   affected pre-authorisation screenshot, but discover by provider/time/actor rather than assuming the
   screenshot list is complete.
2. Save a restricted report containing record IDs, statuses, service dates, currencies, line sources,
   tariff/rule matches, and totals. Exclude patient names and identifiers.
3. Mark the records “do not use for financial validation” in the UAT register. Do not mutate them yet;
   P07 performs lifecycle-safe cleanup after DEC-FH-04.
4. Pause another Family claim/pre-auth UAT run until P08.

**Acceptance:** every suspect trial record is enumerated, auditable, and excluded from business
conclusions without deleting history.

---

## P01 — Prove and repair Family's tariff/contract data

### P01.01 — Build a read-only Family tariff preflight

**Preferred file:** create `scripts/reports/family-hospital-tariff-preflight.ts`; keep reusable query
logic in a server-only service if it will also be used by the product.

**The report must resolve IDs from configuration or exact reviewed database values, never by taking
the first fuzzy name match. It must print/save:**

1. provider, tenant, branch, client/scheme, active contract, active contract version, currency, and
   effective dates;
2. total `ProviderTariff` count, source-batch row count, and active/effective logical-service count—the
   expected imported source total is 4,451, while the active logical count may be lower only by the
   explicitly reported duplicate/conflict dispositions;
3. counts grouped by `contractId`, contract-version linkage if present, `branchId`, `clientId`,
   currency, `isActive`, effective-date window, and service category;
4. null/missing rate count, zero/negative rate count, min/median/max, and any non-UGX row;
5. exact duplicates and conflicts after normalizing service name, category, scope, and effective dates;
6. rows without contract attachment and rows attached to a different/inactive contract;
7. rows with provider codes/CPT codes despite Family's confirmed no-code policy;
8. counts mapped and unmapped to the canonical service categories;
9. the contract engine's selected applicable context for sample members, the Family branch, and three
   dates: yesterday, Kampala today, and a future date;
10. whether the same candidate tariff rows would be loaded by
    `src/server/services/contract-engine/engine.ts`.

The script defaults to read-only and exits non-zero for any release blocker. An `--apply` mode must
not be added to this report.

**Hard gates:**

- exactly one intended Family provider and active trial contract resolve;
- all 4,451 imported source rows reconcile to exactly one reported outcome, and the active/effective
  Family logical-service total equals the reviewed post-duplicate count;
- no missing, zero, negative, or non-UGX rate;
- every user-visible tariff row is in the exact scope evaluated by the engine;
- contract, branch, client, and date resolution are unambiguous.

If any gate fails, stop P02 and complete P01.02.

### P01.02 — Attach/reimport safely when the preflight fails

**Steps:**

1. Produce a dry-run transformation manifest containing source-row fingerprint, target contract,
   target category, parsed decimal rate, currency, tax-inclusive flag, and duplicate disposition.
2. Apply the confirmed lower-price duplicate rule deterministically. Preserve every rejected/conflict
   row in the report with a reason.
3. Use explicit category mapping. At minimum review these mappings rather than relying on free text:
   `HEADLINE -> CONSULTATION`, `LABORATORY -> LABORATORY`, `PHARMACY -> PHARMACY`,
   `IMAGING -> IMAGING`, `THEATRE/PROFESSIONAL_FEES -> PROCEDURE`, and all unknowns -> `OTHER` for
   manual review. Do not silently force clinical categories whose meaning is unclear.
4. Import/attach into the active approved contract/version with provider, branch/client applicability,
   UGX currency, tax-inclusive metadata, and reviewed effective dates.
5. Make the operation idempotent with source fingerprints and an import/batch receipt. A rerun must
   create zero new logical tariff rows.
6. Supersede/deactivate incorrect prior rows only after the replacement batch validates. Never delete
   them.
7. Rollback means deactivate the new batch and reactivate the recorded prior batch; test that path on a
   disposable database.
8. Rerun P01.01 and archive before/after reports.

**Acceptance:** the preflight gates all pass, rerun is a no-op, rollback is proven, and an adjudication
test resolves a selected Family service to the same contracted rate the provider UI will show.

### P01.03 — Resolve standalone-tariff semantics globally

The repository currently contains paths with different behavior for `contractId = null` tariffs.
Do not leave one service showing a row the contract engine ignores.

**Required decision for this remediation:** the Family capture catalogue lists only rows attached to
the applicable contract/version. Standalone rows are never an implicit pricing fallback.

**Steps:**

1. Add a parity test across provider catalogue lookup, `ProviderContractsService`, tariff precedence,
   and `ContractEngine` for contract-bound and standalone rows.
2. Either align all readers to the contract-bound rule or document a separate, explicit standalone
   use case outside claims/pre-auth pricing.
3. Fail closed with a specific operational message if the contract is absent or ambiguous.

**Acceptance:** one fixture produces the same selected tariff/rate in catalogue display,
pre-authorisation evaluation, claim intake, and adjudication.

---

## P02 — Add canonical provider context, member resolution, and tariff search

### P02.01 — Create one provider case-context resolver

**Preferred server-only module:** `src/server/services/provider-case-context.service.ts`.

**Input:** branch, member number, service date, and benefit category.  
**Trusted context:** session-derived tenant, provider, actor, roles, permissions, and permitted branches.

**Steps:**

1. Authenticate and require the appropriate provider claim/pre-auth/eligibility permission.
2. Normalize the member number and perform exact lookup within authorized tenant/provider context.
3. Evaluate eligibility and entitlement at the requested service date with the same
   `ProviderEligibilityService`/entitlement logic used by the eligibility screen.
4. Resolve client/scheme/package, provider branch, and applicable active contract using
   `ContractLifecycleService.precheck` or its canonical equivalent.
5. Return a minimal DTO: opaque member ID, safe display name, masked member number, eligibility state
   and reason, scheme/package display names, branch ID/name, contract ID/version, currency, and service
   date. Do not return DOB, phone, email, address, diagnoses, or full database models.
6. Represent `NOT_FOUND`, `INELIGIBLE`, `AMBIGUOUS_CONTRACT`, `NO_ACTIVE_CONTRACT`, and `FORBIDDEN`
   distinctly without leaking whether a member exists in another tenant/provider.
7. Mark the module `server-only` and add authorization tests.

**Acceptance:** a Family user can resolve an authorized trial member; another provider cannot infer
that member's existence; an ineligible member is displayed but cannot silently proceed; ambiguous
contract context blocks pricing.

### P02.02 — Expose member resolution without putting identifiers in URLs

Use a Server Action or a non-cacheable POST Route Handler following the repository's established
data-access style. Do not use GET query parameters for member numbers.

**Client behavior:**

1. Resolve on explicit “Find member” or blur after a reasonable minimum length; do not request on
   every character.
2. Show loading, found, not-found, ineligible, forbidden-safe, and unavailable states.
3. Cancel or ignore stale responses. Clear the resolved result whenever member number, service date,
   branch, or benefit changes.
4. Do not enable tariff search or final submission until a current context is resolved.
5. Preserve the eligibility-to-claim shortcut, but pass only an opaque reference and re-resolve it on
   the server.

**Acceptance:** typing a Family trial member number displays the correct safe name and coverage
context; changing one contextual field invalidates the old result; the network/history URL contains no
member identifier.

### P02.03 — Create a provider-scoped service catalogue

**Preferred server-only module:** `src/server/services/provider-service-catalog.service.ts` plus a
Server Action/non-cacheable POST surface.

**Input:** resolved context reference, category, partial description, service date, and result limit.  
**Output per row:** opaque `tariffId`, `serviceName`, optional `providerServiceCode`, optional
`cptCode`, canonical category, agreed unit rate, currency, unit if available, `requiresPreauth`, and
effective-date display. Return no internal/provider-foreign data.

**Steps:**

1. Re-authenticate and reconstruct the trusted provider case context on every request.
2. Require at least two meaningful search characters and cap/paginate results deterministically.
3. Query only active/effective `ProviderTariff` rows in the applicable provider/contract/version,
   branch/client scope, date window, and selected category.
4. Search normalized service description first. Include optional provider/CPT code search as a
   secondary convenience, not a requirement.
5. Apply the exact same tariff precedence and tie-break logic as adjudication. Ambiguous candidates
   return an error and telemetry; never choose the first row.
6. Do not read or return `CPTCode.averageCost`.
7. Use decimal strings across the server/client boundary, formatted with the resolved currency only at
   display time.
8. Rate-limit and audit abnormal enumeration without writing every normal keystroke to the audit log.

**Acceptance:** Family users can find services by partial name inside a category; no result from
another provider/contract/category appears; no KES/global average appears; the selected result matches
engine pricing.

### P02.04 — Revalidate every selected tariff on submission

**Affected canonical services:** claim intake, claim correction/resubmission submission, and pre-auth
intake/amendment.

**Steps:**

1. Add `selectedProviderTariffId` to the canonical line-input contract. Persist it in a dedicated,
   nullable `ClaimLine` capture-provenance field; do not overload `matchedRuleId`, because the
   contract engine owns that adjudication-outcome field. Persist the server-resolved agreed unit rate
   in the existing `ClaimLine.tariffRate` snapshot. Keep `cptCode` optional.
2. If provider codes must be preserved for other facilities, add a separate nullable
   `providerServiceCode` end-to-end; never store it in `cptCode`. This schema addition is not required
   merely to make Family's no-code rows work.
3. On submit, reconstruct context and refetch each tariff by ID and service date.
4. Canonicalize service name, category, optional codes, contracted rate, and currency from that row.
   Treat browser versions as display hints only.
5. Preserve the provider's billed quantity and billed unit price after decimal validation. Persist
   enough provenance to distinguish selected tariff, captured contracted-rate snapshot, billed rate,
   and the engine's eventual matching rule. For pre-authorisation, extend the normalized procedure
   and its server-built stored snapshot with `selectedProviderTariffId`, contracted unit rate, and
   currency rather than trusting extra fields inside client-supplied JSON.
6. Reject stale, inactive, future/expired, foreign-provider, foreign-contract, wrong-category, or
   wrong-currency tariff IDs with a field-level “select the service again” error.
7. For an approved unlisted service, persist no tariff ID, force the unlisted/manual-review reason,
   and never synthesize a contracted rate.

**Acceptance:** tampering tests cannot change provider, tariff, category, rate, or currency; an expired
tariff fails safely; a legitimate billed-vs-contracted variance is preserved and reviewable.

---

## P03 — Build shared provider form controls

Do not duplicate new controls in each form. Build them once, with small page-specific adapters.

### P03.01 — Provider member field

**Create:** a shared component under `src/components/provider/` that consumes P02.02.

**Required states:** empty, resolving, found/eligible, found/ineligible, not found, stale, unavailable,
and forbidden-safe. The resolved card shows only name, masked number, scheme/package, and status.

**Accessibility:** explicit label, described status, `aria-live` for lookup results, focusable error,
and no color-only state.

### P03.02 — Diagnosis combobox

**Create or safely refactor:** a shared single-diagnosis combobox using the interaction pattern from
`src/components/clinical/DiagnosisSearch.tsx`.

**Required behavior:**

1. search by partial code, description, or category after two characters;
2. debounce and cancel/ignore stale results;
3. keyboard navigation, visible focus, escape-to-close, clear selection, loading, no-results, and
   recoverable error states;
4. display code, description, and category only—never `standardCharge` or another price;
5. do not preload/cap the first 500 codes into the page;
6. server submission validates the selected code and canonical description.

**Acceptance:** searching `malaria` finds the approved equivalent of `B54` when present in the
deployed catalogue; full keyboard completion works; no price is visible or serialized.

### P03.03 — Category-first provider service combobox

**Create:** a shared line editor under `src/components/provider/` backed by P02.03.

**Visual/interaction order:**

1. benefit/service category;
2. service-description search;
3. optional read-only “Service code” and/or “CPT reference” metadata;
4. quantity and unit;
5. billed unit price;
6. contracted/reference rate and resolved currency;
7. line total and pre-authorisation warning.

**Rules:**

- category is a real server filter, not a decorative field;
- changing category clears an incompatible service selection;
- selecting a service never silently changes category;
- description is human-readable and primary;
- no “CPT” field is required for Family;
- the result list shows only applicable Family tariff rows;
- add/remove line controls remain keyboard accessible;
- totals use decimal-safe calculations and the resolved currency label.

### P03.04 — Shared money input

**Create:** a localized money control and pure parse/format helpers.

**Accepted examples:** `600000`, `600,000`, `600 000`, and a policy-valid decimal.  
**Rejected examples:** negative value, alphabetic text, blank required value, too many decimal places,
NaN/infinity, or a value beyond the schema limit.

Normalize to a canonical decimal string for submission; format for `en-UG` on blur; preserve what the
user typed when validation fails; give a field-level message. Never parse formatted money with a raw
`Number(inputValue)` call.

### P03.05 — Shared provider date and benefit fields

1. Create one canonical provider benefit-option module derived from the actual `BenefitCategory`
   enum plus explicit business labels/order.
2. Cover inpatient and surgical categories. Apply DEC-FH-02 to `CUSTOM`; do not maintain independent
   arrays in claim, correction, resubmission, and pre-auth forms.
3. Default service date visibly with `operatingTodayISO()`, enforce the existing future/backdate
   policy server-side, and preserve the submitted date on error.
4. Test the period between UTC midnight and Kampala 03:00, where `toISOString()` previously produced
   the wrong local calendar date.

**P03 phase acceptance:** each component has focused tests for happy path, empty/error state, keyboard
operation, stale responses, authorization-safe errors, and Kampala/currency behavior.

---

## P04 — Wire every provider capture path to the shared contracts

### P04.01 — New claim

**Primary files to replace/refactor:**

- `src/app/provider/claims/new/page.tsx`;
- `src/app/provider/claims/new/ProviderClaimForm.tsx`;
- `src/app/provider/claims/new/actions.ts`;
- canonical modules under `src/server/services/claim-intake/`.

**Steps:**

1. Remove the page's eager ICD/CPT queries and 500-row props.
2. Use the shared member, date, benefit, diagnosis, service-line, and money controls.
3. Keep draft/form state after server validation errors and focus an accessible summary.
4. Require a current resolved member/contract context before line search and submit.
5. Pass tariff IDs, not browser-supplied rates, to the canonical intake action.
6. Revalidate everything under P02.04, return field-level errors, then revalidate the affected paths
   after successful mutation.
7. Show an unambiguous receipt/reference and do not allow a double submission while pending.

### P04.02 — Claim correction and resubmission

**Primary files:**

- `src/app/provider/claims/[id]/correct/page.tsx`;
- `src/app/provider/claims/[id]/correct/CorrectClaimForm.tsx`;
- `src/app/provider/claims/[id]/correct/actions.ts`;
- `src/app/provider/claims/[id]/resubmit/page.tsx`;
- `src/app/provider/claims/[id]/resubmit/actions.ts`;
- canonical claim replacement/resubmission services.

**Steps:**

1. Remove the global CPT/ICD preload and reuse P03.
2. Seed existing lines by immutable stored provenance. If a historical line has no current tariff ID,
   label it “historical/unlisted” and require explicit reselection only when the user changes it.
3. Evaluate edited lines against the correction/resubmission service date and applicable contract;
   do not silently replace historical prices.
4. Preserve lineage, reason, original values, and the new submission receipt.

### P04.03 — New and amended pre-authorisation

**Primary files:**

- `src/app/provider/preauth/new/page.tsx`;
- `src/app/provider/preauth/new/ProviderPreauthForm.tsx`;
- `src/app/provider/preauth/new/actions.ts`;
- `src/app/provider/preauth/[id]/AmendPreauthForm.tsx` and its action path;
- canonical modules under `src/server/services/preauth-intake/`.

**Steps:**

1. Replace the global CPT preload with the provider catalogue.
2. Use the same member/context resolver, benefit/date list, diagnosis search, and money parser.
3. If a tariff service is selected, suggest its contracted rate but retain an explicitly editable
   estimate. Keep contracted rate and requested estimate visually distinct.
4. Ensure `600,000` is accepted as 600000 and stored with correct decimal/currency semantics.
5. Re-resolve the tariff/contract context at submit and amendment time.

### P04.04 — Eligibility

**Primary files:**

- `src/app/provider/eligibility/EligibilityCheckForm.tsx`;
- `src/app/provider/eligibility/actions.ts` and contract modules only as needed.

**Steps:**

1. Set the visible initial service date to `operatingTodayISO()`.
2. Preserve the value after validation and transport errors.
3. Keep current server behavior as authority; do not change eligibility policy merely to fill the UI.
4. Confirm the “start a claim” handoff uses an opaque reference and is revalidated by P02.

### P04.05 — Terminology completeness

1. Add a read-only report with deployed ICD row count, source/version metadata, active/inactive state,
   representative code coverage, and duplicates.
2. If the database is only the demo subset, obtain the approved source under DEC-FH-03 and create an
   idempotent, versioned import with dry run and rollback/deactivation.
3. Do not claim complete ICD-10 coverage without source/version evidence.

**P04 phase acceptance:** new claim, correction, resubmission, new pre-auth, amendment, and eligibility
all use the shared contracts. Repository search finds no provider form that preloads
`CPTCode.averageCost`, renders it as UGX, or uses a native diagnosis select.

---

## P05 — Replace temporary-password handoff with real invitations

### P05.01 — Add a dedicated account-setup token

**Schema:** create a purpose-specific model, preferred over overloading a password-reset record. It
must contain an opaque ID, user/tenant/provider scope, a cryptographic token hash, expiry, used/revoked
timestamps, invited-by actor, send status/attempt metadata, and timestamps. Store no plaintext token.

**Steps:**

1. Generate a high-entropy token with a cryptographically secure source; persist only a one-way hash.
2. Because `User.passwordHash` is required, store a random never-shared value and keep the account in
   a pending/must-change state that cannot authenticate with that value.
3. Create user, provider persona, permitted branches, invitation, and audit/domain event in one
   transaction.
4. Make duplicate email behavior safe and useful: never reveal cross-tenant accounts; within authorized
   scope, show the existing account/pending state and offer resend where allowed.
5. Resend revokes every older unused setup token and is rate-limited per actor, user, and address.
6. Add a safe expiry/replay response that does not disclose account state.

### P05.02 — Deliver invitations and fail closed on mail configuration

1. After the account transaction commits, send an individual setup email through the existing bounded
   delivery mechanism appropriate to the deployed runtime.
2. Build the setup URL from the approved public application origin. Put the raw one-time token in the
   URL fragment, not the query/path, so it is not sent in the initial HTTP request or ordinary access
   logs. Do not derive the origin from an untrusted request host.
3. Remove Mailtrap/test-user/test-pass production fallbacks. In non-test environments, missing SMTP
   configuration is an explicit configuration/delivery failure.
4. Do not include passwords, internal IDs, provider-wide user lists, or sensitive context in the email.
5. Never log the raw setup URL/token. Structured logs use invitation ID, correlation ID, provider,
   result, and safe provider error code.
6. Persist `PENDING`, `SENT`, or `FAILED`, last attempt, and safe failure class. The account remains
   pending on failure.
7. Return “User created; invitation delivery failed—resend” rather than a generic success or rollback.

### P05.03 — Complete account setup

1. Add a setup page whose small client boundary reads the token from the URL fragment, immediately
   removes that fragment with `history.replaceState`, and posts the token to a Server Action for hash/
   expiry/revocation validation. Then present password + confirmation under the existing password
   policy. Never render the token back into HTML, state messages, or logs.
2. On submit, validate again and transactionally update the password hash, clear the pending/
   must-change state, mark the token used, revoke siblings, bump session version, and audit activation.
3. Redirect only after the transaction succeeds; keep redirects outside broad error-catching blocks.
4. Token replay, expiry, altered token, suspended user, and cross-tenant attempts return the same safe
   recovery surface with a request-new-link path.

### P05.04 — Use one canonical service in both administration surfaces

**Primary files:**

- `src/app/(admin)/settings/actions.ts` and `InviteUserModal.tsx`;
- `src/app/provider/users/actions.ts`;
- `src/app/provider/users/ProviderUsersManager.tsx`;
- `src/server/services/provider-user-admin.service.ts` or a new canonical invitation service;
- `src/server/services/notification.service.ts`.

**Steps:**

1. Remove the administrator-entered temporary-password field and replace “Create User” with “Send
   invitation”.
2. Show delivery status, time, expiry, and permission-gated resend. Never show the setup token.
3. Allow a facility administrator with `provider.users.manage` to invite only approved provider
   personas and branches within its own provider. Prevent privilege escalation, cross-provider
   assignment, removal of the last active provider administrator, and modification of protected
   platform roles.
4. Platform administration calls the same canonical service, not a parallel implementation.

**Acceptance:**

- each Family test staff member receives a separate message and sets their own password;
- missing SMTP creates a visible retryable failed state rather than a false success;
- resend invalidates the old link; used/expired links cannot be replayed;
- no password or raw token appears in email logs, app logs, action results, audit events, fixtures, or
  screenshots;
- a provider administrator cannot invite into another provider/tenant or grant a stronger persona.

---

## P06 — Make provider navigation robust

**Primary files:** `src/app/provider/ProviderNav.tsx`, `src/app/provider/provider-nav-model.ts`, and the
provider layout that currently flattens groups.

### Required information architecture

1. Keep the small number of highest-frequency destinations direct: Dashboard, Eligibility, Claims,
   and Pre-authorisations.
2. Group the remainder into task-labelled menus such as Finance, Contracts & Services, Reports, and
   Administration, using the existing permission-aware nav model as the authority.
3. Place identity/profile/logout in an account menu that cannot compete for the same fixed horizontal
   space.
4. On compact widths use the existing or a new accessible disclosure/drawer. Do not render the full
   desktop row beneath the logo.
5. Preserve active-state indication for both a direct link and its parent group.

### Behavior and acceptance

- no overlap, clipped link, or horizontal page overflow at 320, 360, 768, 1024, 1280, 1440, or
  1920 CSS pixels;
- Dashboard and the brand are independently clickable;
- every permitted item is reachable by keyboard and touch;
- menus support escape, outside dismissal, focus return, and visible focus;
- 200% zoom remains usable;
- permission-filtered items never leave empty groups;
- an automated model test proves each route belongs to exactly one visible group, and a browser test
  covers a facility administrator with the maximum current item count.

---

## P07 — Repair trial records without erasing history

### P07.01 — Clean up affected claims/pre-authorisations

After DEC-FH-04:

1. Reconcile the P00.03 restricted report with current statuses.
2. Use the supported claim-withdrawal action when status/policy permits, reason
   `TEST_DATA_INCORRECT_TARIFF`. If it does not permit withdrawal, use the approved operator void or
   corrective lifecycle path; do not update status directly.
3. Cancel affected pre-authorisations through the supported cancellation action and reason catalogue.
4. Record operation IDs, before/after status, actor, reason, and audit event. Do not store patient
   identifiers in the implementation log.
5. Confirm no affected record feeds trial totals, dashboards, or business acceptance metrics as a
   valid transaction.

### P07.02 — Create fresh Family UAT fixtures

1. Retain the corrected trial members and verify `MTC-2026-00001`, `00005`, and `00007` through the
   eligibility service on Kampala today; use restricted evidence for names.
2. Select a small set of real Family tariff services covering at least consultation, laboratory or
   imaging, pharmacy, procedure/surgery, inpatient/bed/maternity where the price list supports them,
   plus one unlisted-service scenario if DEC-FH-01 permits it.
3. Create expected outputs from the contract/tariff data, not from what the UI happens to display.
4. Give each UAT actor an individual account and role: facility administrator, front desk, and biller.
5. Ensure fixtures contain no real patient PII.

**Acceptance:** the rerun starts with clean actors, known contract context, expected tariff values,
and no contaminated old record counted as evidence.

---

## P08 — Verification, deployment, and provider re-UAT

### P08.01 — Required automated coverage

Add or extend tests in the existing suites; names below are suggested, not a reason to duplicate an
equivalent test.

| Layer | Mandatory cases |
|---|---|
| Unit | localized money parser/formatter; Kampala date; benefit labels; tariff precedence; token hash/expiry/replay; nav grouping. |
| Service | provider case context; member scope; tariff search scope/date/category/currency; contract-engine parity; unlisted service; invitation create/resend/activate; email failure. |
| Action/route | unauthenticated, wrong permission, wrong provider/tenant/branch, malformed inputs, stale tariff, ineligible member, missing SMTP, and successful response DTO minimization. |
| Claim intake | selected tariff provenance, billed-vs-contracted variance, currency mismatch, edited client price ignored, duplicate submission behavior. |
| Pre-auth | `600,000 -> 600000`, selected Family tariff, amendment revalidation, no global CPT cost. |
| Component | member states; diagnosis keyboard search; category-filtered service search; line clearing; money error preservation; invitation delivery states; grouped navigation. |
| Regression | new claim, correction, resubmission, new/amended pre-auth, eligibility date, existing eligibility reason parity, and trial-member eligibility. |

Every security test needs an adjacent cross-tenant/provider case. Every mutation test needs a failed
delivery/validation or stale-data case, not only the happy path.

### P08.02 — Mandatory local verification

Run in this order and record exact output in the implementation log:

```bash
npm run typecheck
```

```bash
npx vitest run <all changed and directly affected test files>
```

```bash
npx eslint <all changed source and test files>
```

```bash
SCHEMA_DEPLOY_MODE=skip npm run build:local
```

There is no `npm test` command. A passing typecheck, lint, and Vitest run does not replace the required
production build. If the build fails entirely inside Next's compiled WASM hasher, follow the repository
instruction to clear only the configured build output and retry once; do not delete the project.

### P08.03 — Browser verification matrix

Run at minimum in the production-supported Chromium browser, with keyboard-only passes and 200% zoom
where stated.

| Actor | Scenario | Expected evidence |
|---|---|---|
| Platform admin | Invite a Family biller; simulate successful and failed mail; resend. | Delivery state is truthful; only newest link works; no password/token in logs. |
| Family admin | Invite front desk within Family; attempt cross-provider/stronger persona assignment. | Valid invite works; escalation is denied server-side. |
| Front desk | Check each trial member with blank-initial date. | Kampala date is visible; current corrected members resolve with expected eligibility. |
| Biller | Directly type a member number in a new claim. | Correct safe name/context appears; no identifier is in the URL. |
| Biller | Search diagnosis using a code fragment and a text fragment. | Same canonical diagnosis can be selected by either; no clinical price is shown. |
| Biller | Choose category and search a Family service by partial description. | Only matching Family tariff rows appear with correct UGX reference rate. |
| Biller | Submit a line with billed rate different from contracted rate. | Both values and variance provenance are retained; browser manipulation cannot alter the contracted rate. |
| Biller | Submit an unlisted service if allowed. | No global CPT price appears; manual-review state is explicit. |
| Biller | Enter pre-auth estimate `600,000`. | It validates and persists as 600000 UGX. |
| Biller | Correct/resubmit an eligible synthetic claim. | Shared search and pricing rules still apply; original lineage is preserved. |
| Facility admin | Open every provider destination at all target widths. | No overlap; every route remains reachable. |

Capture screenshots/video without names, member numbers, emails, tokens, or credentials. Database
evidence uses opaque IDs and safe values.

### P08.04 — Deployment sequence

1. Obtain reviews for schema/security, contract/pricing, and provider UX changes.
2. Apply invitation or provenance migrations according to
   `docs/uat-human-factors-remediation/SCHEMA_DEPLOYMENT.md`; take required backups and preflight first.
3. Configure and validate SMTP and the canonical public app origin in the target environment. A smoke
   test to a controlled address must pass before provider invites are sent.
4. Deploy code with `SCHEMA_DEPLOY_MODE` set to the environment's approved `migrate`/`skip` mode; do
   not revert silently to `db push`.
5. Run P01.01 against the target database. Apply P01.02 only through its reviewed, idempotent operation.
6. Keep provider tariff auto-fill behind a provider-scoped release flag if the repository's feature
   flag service supports it. Enable Family only after pricing parity passes.
7. Run the full browser smoke matrix with internal fixtures.
8. Execute P07 credential and record remediation.
9. Invite the two Family staff individually, verify receipt without asking them to disclose passwords,
   and schedule the rerun.

### P08.05 — Rollback

Rollback must not re-enable the known KES-as-UGX behavior.

1. If catalogue search fails, disable auto-fill for Family and allow only the approved explicit manual
   price path with “contract rate unavailable—manual review”; otherwise temporarily disable claim/
   pre-auth capture for that provider.
2. Revoke only newly issued unused invitations if setup has a security defect; activated accounts use
   the normal suspension/session-revocation path.
3. Deactivate the new tariff batch and reactivate the recorded prior batch only through the tested
   P01.02 rollback.
4. Roll back application deployment without reversing immutable audit/receipt data.
5. Record the incident, correlation IDs, affected providers, and user-safe communication. Never put
   passwords, tokens, or patient data in the record.

---

## 7. File-level implementation map

This map tells the executor where to begin. Inspect current contents before editing; do not assume the
line numbers or exported names from the analysis are unchanged.

| Concern | Inspect/change | Do not do |
|---|---|---|
| Claim UI | `src/app/provider/claims/new/**`; `claims/[id]/correct/**`; `claims/[id]/resubmit/**` | Do not fix only the new-claim form. |
| Claim authority | `src/server/services/claim-intake/**`; claim replacement/resubmission services; `contract-engine/**` | Do not trust client tariff/rate/category/currency. |
| Pre-auth UI/authority | `src/app/provider/preauth/new/**`; `preauth/[id]/AmendPreauthForm.tsx`; `src/server/services/preauth-intake/**` | Do not retain global CPT cost auto-fill. |
| Member/eligibility | `src/server/services/provider-eligibility.service.ts`; entitlement services; `src/app/provider/eligibility/**` | Do not expose member lookup by GET query string. |
| Tariff/contract | `prisma/schema.prisma`; `provider-contracts.service.ts`; `tariff-precedence.ts`; `contract-lifecycle.service.ts`; `contract-engine/engine.ts` | Do not show rows the engine cannot use. |
| Diagnosis | `src/components/clinical/DiagnosisSearch.tsx`; `src/app/api/icd10/route.ts` or canonical equivalent | Do not display `standardCharge`; do not preload 500 codes. |
| Procedure pattern | `src/components/clinical/ProcedureSearch.tsx`; `src/app/api/cpt/route.ts` | Do not point provider pricing at global CPT averages. |
| Dates | `src/lib/service-date.ts` and all provider form defaults | Do not use UTC truncation for Kampala calendar dates. |
| Invitations | admin settings invite UI/action; provider users UI/action; `provider-user-admin.service.ts`; `notification.service.ts`; password policy/session services | Do not generate or email an administrator-visible password. |
| Navigation | `src/app/provider/ProviderNav.tsx`; `provider-nav-model.ts`; provider layout | Do not solve by hiding authorized destinations. |
| Data operations | new `scripts/reports/**` and reviewed idempotent remediation script | Do not combine report and apply in a default mode. |

---

## 8. Detailed test oracles

An executing agent should assert these exact properties instead of relying on screenshots alone.

### 8.1 Pricing and currency oracle

For each selected Family test service:

1. UI `selectedProviderTariffId` equals the applicable active row.
2. UI contracted rate decimal equals the database row under the resolved contract context.
3. UI currency, claim currency, pre-auth currency, stored provenance, and engine result are `UGX`.
4. No request or response field sources price from `CPTCode.averageCost`.
5. The server ignores a browser-edited contracted rate.
6. A conflicting currency or duplicate-precedence tie blocks submission with a safe message.
7. The billed unit price may differ and remains separately visible/auditable.

### 8.2 Member oracle

1. An exact authorized member number resolves the correct safe display name.
2. Wrong provider/tenant returns the same non-enumerating not-found/forbidden-safe response.
3. Changing date, branch, benefit, or member invalidates the previous context and tariff results.
4. Submission repeats resolution and refuses an ineligible/stale context.
5. Neither URL, client logs, nor telemetry contains the raw member number.

### 8.3 Invitation oracle

1. Account/persona/branch/invitation are atomic.
2. SMTP failure leaves one pending account and one failed delivery state—not zero accounts and not a
   false sent state.
3. Resend creates one new token and revokes old unused tokens.
4. Setup consumes the token once, applies password policy, clears pending state, and bumps session
   version.
5. Admins never see or choose the password.
6. Secrets are absent from mail logs, audit payloads, action responses, database plaintext columns,
   screenshots, and error-monitoring breadcrumbs.

### 8.4 Form oracle

1. `600,000` parses to the decimal 600000; invalid values preserve input and focus the error.
2. `operatingTodayISO()` matches Kampala today across the UTC-midnight boundary.
3. Diagnosis partial text and code search work by keyboard and show no price.
4. Category filters service results; changing category clears incompatible selection.
5. “Service code” is optional; Family can complete a valid line by description.
6. New, correction, resubmission, and pre-auth paths share the same behavior.

---

## 9. Observability and support requirements

1. Add structured, secret-free events for member-resolution outcome, contract-resolution failure,
   tariff-search failure/ambiguity, stale-tariff rejection, invitation delivery/activation, and
   navigation render errors.
2. Include correlation ID, tenant/provider opaque IDs, action, safe result code, and duration. Do not
   include names, member numbers, emails, diagnosis descriptions, invitation tokens, or raw SMTP text.
3. Alert on repeated invitation failures and any provider tariff currency mismatch.
4. Provide a support view or documented query for invitation state and tariff preflight result; support
   must not need a user's password or setup link.
5. Keep normal type-ahead search telemetry sampled/aggregated to avoid an unnecessary clinical search
   history.

---

## 10. Work-unit completion template

Every task in the implementation log must contain:

```text
Task ID:
Defects covered:
Starting/ending SHA:
Files changed:
Schema migration/backfill:
Read-only preflight artifact:
Automated tests added/changed:
Commands and results:
Browser scenarios and evidence paths:
Feature/config changes:
Data mutations and operation IDs:
Rollback tested:
Residual risk: none | <precise risk>
Reviewer/sign-off:
```

A task is not `DONE` if tests are deferred, the browser path still uses the legacy data source, the
source-of-truth relationship is not proved, or a required artifact is missing.

---

## 11. Suggested commit boundaries

Use one task per commit unless a migration and its inseparable service must be atomic. Suggested order:

1. `P00` records and read-only preflight only;
2. `P01` tariff data/parity tests and reviewed remediation script;
3. `P02` case context, member resolver, and provider catalogue;
4. `P03` shared provider controls;
5. `P04.01` new claim;
6. `P04.02` correction/resubmission;
7. `P04.03-P04.05` pre-auth, eligibility, and terminology;
8. `P05.01-P05.03` invitation schema/service/setup;
9. `P05.04` admin/provider invitation UI;
10. `P06` navigation;
11. `P07` reviewed data operations and clean fixtures;
12. `P08` final tests, evidence, and release record.

Do not mix Family production/UAT data mutation into a code commit. Data operations require an
independent reviewed run record and operation IDs.

---

## 12. Provider communication checklist

Before the rerun, tell Family Hospital in plain language:

1. the old emailed passwords were invalidated and each person will receive an individual setup link;
2. the portal now searches Family's services by description and category, and service codes are not
   required;
3. all displayed Family prices for the trial are the reviewed UGX tariff values;
4. the old trial claims are excluded because their pricing source was incorrect;
5. the corrected member dataset remains the test dataset;
6. the exact five workflows to retest: eligibility, new claim, pre-authorisation, correction/
   resubmission, and navigation/account access;
7. the two remaining policy answers and de-identified bill sample still needed.

Do not ask staff to send passwords, screenshots containing setup links, or identifiable patient data.

---

## 13. Release gates and definition of done

Another Family Hospital UAT run is **GO** only when every gate below is evidenced:

- [ ] Every password exposed in the original email has been invalidated; no secret appears in logs or
      the implementation record.
- [ ] Facility administrator, front desk, and biller each have an individual account; test invites are
      delivered truthfully and setup-link replay/expiry is proven.
- [ ] Read-only tariff preflight proves the approved Family total, active contract/version attachment,
      effective scope, reviewed categories, tax-inclusive rule, and UGX currency.
- [ ] Provider catalogue and contract engine select the same tariff/rate for every test fixture.
- [ ] No provider claim, correction, resubmission, or pre-auth path reads `CPTCode.averageCost` as an
      auto-price or labels a KES reference cost as UGX.
- [ ] Direct claim entry resolves a typed trial member safely and revalidates eligibility/context on
      submit.
- [ ] Diagnosis search works by partial text/code and shows no price.
- [ ] Category materially filters Family service-description search; codes remain optional.
- [ ] `600,000` is accepted in pre-authorisation and persisted as the correct decimal UGX value.
- [ ] Eligibility shows Kampala today's date by default and remains correct around UTC midnight.
- [ ] Inpatient and surgical benefits appear wherever policy permits, from one shared list.
- [ ] Dashboard and every provider navigation destination are usable at all target widths, keyboard-
      only, touch, and 200% zoom.
- [ ] Suspect old claims/pre-auths are withdrawn/cancelled or explicitly quarantined with audit history;
      none is counted as successful trial evidence.
- [ ] Typecheck, targeted tests, targeted lint, and `SCHEMA_DEPLOY_MODE=skip npm run build:local` pass.
- [ ] Internal browser smoke tests pass before any provider rerun.
- [ ] Family's front-desk and billing users independently complete the agreed UAT scenarios and Abel
      signs off on the results.

Any unchecked blocker or high-severity gate means **NO-GO**. Do not compensate with training,
manually edited screenshots, a generic CPT price, shared credentials, or a claim-data deletion.
