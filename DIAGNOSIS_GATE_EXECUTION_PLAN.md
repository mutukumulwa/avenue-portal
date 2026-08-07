# Medvex Diagnosis Gate — Clinical Intervention Gating Execution Plan

| | |
|---|---|
| **Engagement** | Diagnosis Gate (clinical protocol-adherence stage for the Claims Autopilot) |
| **Plan version** | 1.0 — 2026-08-06 |
| **Status** | DRAFT — pending C0.1 spec sign-off by the clinical owner |
| **Execution branch** | `feat/diagnosis-gate`, branched from `origin/main` (see §8.1 — NOT from `feat/claims-autopilot`) |
| **Source artifact** | `ICD11_Codes_Mapped_with_Clinical_Features.xlsx` (business/clinical team, received 2026-08-06; vendored in C0.2) |
| **Companion docs** | Workbook fix-list PDF (external, sent to clinical team 2026-08-05); as-built schematic PDF; this repo's `CLAIMS_AUTOPILOT_EXECUTION_PLAN.md` (the rail this plugs into) |
| **Prior context** | Claims Autopilot M0–M7 (merged to main); PNOS F0–F11 (merged to main). Both are the substrate; this plan changes NEITHER's money paths. |

---

## 0. Authority and execution rules

This document is the execution authority for the Diagnosis Gate. Clinical semantics
(what a rule means medically) are owned by the C0.1 spec + the imported protocol pack —
never by this document and never by the executing engineer/model.

### 0.1 Mandatory protocol for every work package

1. **Re-verify anchors first.** Before editing, confirm every file/symbol anchor the
   package cites (§4 table). If an anchor has moved, locate it by the grep given in §4,
   use the found location, and update the §4 table **in the same commit**. Never edit
   from memory of this document alone.
2. **Additive only.** Schema changes are new models/enums/optional-default fields only.
   Never alter or drop an existing column, enum value, or constraint. Apply schema via
   `prisma db push` against a throwaway DB first (§8.3), then the dev DB.
3. **Prove, then build.** Each package's Acceptance section lists checks. Run them.
   A package is DONE only when: `npx tsc --noEmit` clean · targeted `vitest` suites green ·
   `next build` clean (for UI packages) · the UI-operability walkthrough (§7 W8) recorded.
4. **Log every package** in `docs/diagnosis-gate/IMPLEMENTATION_LOG.md` (§18): package id,
   commit SHA(s), what was verified, deviations from this plan.
5. **Commit convention:** `feat(diagnosis-gate): C2.1 — <summary>` / `docs(diagnosis-gate): …`
   / `fix(diagnosis-gate): …`. One package = one or few isolated commits. Do not push or
   merge to main without the user's instruction.

### 0.2 Hard prohibitions

- **Never author clinical content.** Every group, code membership, lab rule, window, and
  message comes from the imported protocol pack. A missing/ambiguous value is a
  **validation error surfaced in the import report** — never a guess, default, or
  "reasonable" invention. This is the anti-hallucination contract of the whole engagement.
- **Never auto-deny on clinical grounds** (DG-D1). Every clinical rule outcome is
  PASS or ROUTE-to-queue. The single money-touching exception (repeat-window short-pay)
  is quarantined in package C5.2 behind its own default-OFF flag and its own sign-off.
- **Never touch the money stack.** No edits to `claim-decision.service.ts` money gates,
  `benefit-usage.service.ts`, GL, settlement, or the contract engine — except the single
  quarantined C5.2 wiring, executed only when its gate opens.
- **No hanging workflows** (§7). A package that ships a service without its UI, a
  permission without its role seeding, or a queue without its rendering is NOT done —
  this is the codified F76-GAP-01/02 lesson.
- **No fabricated external data.** If the WHO ICD-10↔ICD-11 crosswalk file cannot be
  obtained (C1.4), mark the package `BLOCKED-EXTERNAL` in the log and continue with
  ICD-10 memberships authored by the clinical team only. Never generate mappings.

### 0.3 Human gates (cannot be closed by code)

- **G-C0**: clinical owner signs the C0.1 spec (decision log + pilot list + exit criteria).
- **G-C4**: shadow-campaign exit memo approved (per C0.1 criteria) → unlocks C5.
- **G-C5.2**: separate finance + clinical sign-off for repeat-window short-pay.
- **G-C6**: C4 exit memo is a precondition for ANY C6 package start.

---

## 1. Mission

Add a **clinical protocol-adherence stage** to the existing Claims Autopilot pipeline
that, for a governed list of ~40 common outpatient conditions ("intervention groups"),
checks coded billing lines against clinically-authored rules:

- R1 — the claim's diagnosis resolves to a known intervention group (auto-path scope);
- R2 — billed lab tests are supported by the claim's group (lab↔diagnosis compatibility);
- R3 — a test is not repeated inside its clinically-set repeat window (over-servicing);
- R4 — treatment claims for confirmable conditions carry/precede their confirmatory test.

All rules run on **data the platform already captures** (ICD-coded diagnosis + coded
billing lines + claim history). No symptom/sign capture, no free-text parsing, no drug
baskets in this plan — those are the gated C6 backlog (Rung 2 of the capability ladder).

Success = the four rules run in **record-only mode** on live traffic, produce a
measurable shadow report (hit rates, would-route volume, false-positive rate sampled by
clinicians), and can be flipped to route-live **per condition** through a governed,
fully UI-operable protocol-pack lifecycle.

## 2. Scope

### 2.1 Included
- Versioned, maker/checker-governed **protocol pack** data layer imported from the
  clinical team's workbook (after their fixes), with a machine validation report.
- One new pipeline stage (`CLINICAL`) with rules R1–R4, record-only by default.
- New route codes + one new queue, provider-facing reason texts from the workbook.
- Admin UI: protocol library (list/detail/diff/import), governance actions
  (submit/approve/activate), per-condition shadow/live toggles, shadow report + clinical
  verdict sampling, baseline snapshot tooling.
- Permissions, role seeding, approval-matrix action, nav — wired end to end (§7).
- Repeat-window short-pay as a quarantined, default-OFF, separately-gated package.

### 2.2 Explicitly excluded (C6 backlog, gated on G-C4)
- Symptom/sign capture (structured picklist or free-text keyword/LLM extraction).
- Onset/duration fields; drug/treatment baskets; imaging rules; HMS results ingestion.
- ICD-11 platform migration. (Dual-accept via pack memberships needs no migration.)
- Any change to eligibility, pricing, benefit, fraud, settlement behavior.

## 3. Settled decisions

| id | Decision |
|---|---|
| DG-D1 | Clinical rules ROUTE, never deny. Sole exception: C5.2 repeat-window short-pay, default OFF, own sign-off. |
| DG-D2 | The **internal intervention group** (`groupCode`, e.g. `CIG-001`) is the canonical key. ICD codes are memberships *into* groups, never keys. (Clinical team's F1 answer.) |
| DG-D3 | Dual code-system accept: memberships carry `codeSystem ICD10\|ICD11`. Resolution tries the claim's codes against both. No format guessing — lookup only. |
| DG-D4 | Stage ships **record-only**: it evaluates and persists rule hits but returns PASS until `clinicalGateEnabled` is true on the resolved policy. Record-only is the C4 shadow campaign and is independent of the policy's OFF/SHADOW/LIVE mode. |
| DG-D5 | Live routing is enabled **per intervention group** (`enabledForLive`), not globally. |
| DG-D6 | Clinical content enters ONLY via governed pack import (converter → validator → DRAFT pack → maker/checker approval → activate). No hand-edited rows, no seed-file clinical data. |
| DG-D7 | Additive schema only; money-path tables untouched. |
| DG-D8 | Every capability is UI-operable end to end on ship (§7). |
| DG-D9 | A diagnosis-mix **baseline snapshot** is captured and committed BEFORE any provider-facing communication of the rules (C4.1 precedes C5.3). |
| DG-D10 | C6 (Rung 2) starts only after the G-C4 exit memo. |
| DG-D11 | R1 out-of-scope semantics are policy-controlled: `requireClinicalGroup=false` (default) → unresolved diagnosis = stage PASS (gate governs only covered conditions); `true` → unresolved diagnosis ROUTEs `CLINICAL_SCOPE_REVIEW`. The business chooses when to narrow the auto path. |
| DG-D12 | Catch-all groups (workbook: "Atopy", "Viraemia/Bacteraemia of unknown origin") import with `isCatchAll=true` and are permanently excluded from `enabledForLive` (UI enforces; importer flags). |

## 4. Verified current-state anchors

Verified 2026-08-06 on `feat/claims-autopilot` tip `69c1da4` (an ancestor of
`origin/main`; anchors are expected identical on main — re-verify per §0.1.1).
If an anchor fails, locate with the given command and update this table.

| Anchor | Where (verified) | Locate if moved |
|---|---|---|
| Staged evaluator + `EVALUATION_STAGES` list (CONTEXT→…→POLICY) | `src/server/services/claim-autopilot/evaluate.ts` (~line 254) | `grep -rn "EVALUATION_STAGES" src/server` |
| `StageOutcome` / `routeOut` / `EvalContext` / `loadClaim` select | same file, lines ~20–70, ~268 | `grep -n "StageOutcome" src/server/services/claim-autopilot/evaluate.ts` |
| `recordStage`, `safeErrorMessage` | `src/server/services/claim-intake/processing.ts` (imported at evaluate.ts:14) | `grep -rn "export.*recordStage" src/server` |
| Route-code catalog: `QUEUES` (l.20), `ROUTE_CODES` (l.37), `ReasonEntry` (l.73), `REASON_CATALOG` (l.90) | `src/server/services/claim-intake/reason-catalog.ts` | `grep -rn "REASON_CATALOG" src/server` |
| Queue/route stamping on claims (`processingRouteCode`, `assignedQueue`) | `src/server/services/claim-autopilot/plan.ts` (~l.150) | `grep -rn "assignedQueue" src/server` |
| Exception queue UI — **data-driven** `groupBy(assignedQueue, processingRouteCode)`; a new queue auto-renders | `src/app/(admin)/claims/queues/ExceptionQueues.tsx` (l.21–30) | `grep -rn "groupBy" src/app/\(admin\)/claims/queues` |
| `ClaimProcessingStageName` enum (CONTEXT…AUDIT — `CLINICAL` must be added) | `prisma/schema.prisma` | `grep -n "enum ClaimProcessingStageName" prisma/schema.prisma` |
| `ClaimProcessingStage` model, `@@unique([runId, stage])`, `result Json?` | `prisma/schema.prisma` | `grep -n "model ClaimProcessingStage" prisma/schema.prisma` |
| `AutoAdjudicationPolicy` (mode OFF/SHADOW/LIVE, `requireCleanFraud` pattern for new flags) | `prisma/schema.prisma` | `grep -n "model AutoAdjudicationPolicy" prisma/schema.prisma` |
| Policy resolution + fail-closed validation | `src/server/services/auto-adjudication.service.ts` (`resolvePolicy`), `src/server/services/claim-autopilot/policy.ts` | `grep -rn "resolvePolicy" src/server` |
| Governed change pattern to mirror: `submitPolicyChange` / `applyApprovedPolicyChange` over `ApprovalRequestService` | `src/server/services/claim-autopilot/policy-approval.ts` | `grep -rn "applyApprovedPolicyChange" src/server` |
| `ApprovalActionType` enum (add `CLINICAL_PROTOCOL_CHANGE` after `AUTO_ADJ_POLICY_CHANGE`) | `prisma/schema.prisma` | `grep -n "enum ApprovalActionType" prisma/schema.prisma` |
| Matrix default-rule seeding (AUTO_ADJ_POLICY_CHANGE → FINANCE_OFFICER, ~l.124–128) | `src/server/services/approval-matrix.service.ts` | `grep -n "AUTO_ADJ_POLICY_CHANGE" src/server/services/approval-matrix.service.ts` |
| Matrix action dropdown | `src/app/(admin)/settings/approval-matrix/ApprovalMatrixManager.tsx` (l.29) | `grep -rn "AUTO_ADJ_POLICY_CHANGE" src/app --include="*.tsx"` |
| Approvals-page action label map | `src/app/(admin)/approvals/page.tsx` (l.17) | same grep |
| RBAC seeding — **staff/admin** | `prisma/seeds/rbac.ts`, `PERMISSIONS` array. **Convention is `MODULE:ACTION`** (e.g. `CLAIM:VIEW`, `MEMBER:TERMINATE`) with `{code, module, action, resource, description}`. Also `src/server/services/tenant-provisioning.service.ts` (`seedForTenant` is **provision-only** — existing tenants need C3.1's ensure script) | `grep -n "PERMISSIONS" prisma/seeds/rbac.ts` |
| RBAC seeding — **provider portal** (different convention, do NOT copy for staff caps) | `prisma/seeds/provider-rbac.ts` uses dotted lowercase (`provider.integrations.manage`) | `git grep -n "provider.integrations.manage" -- prisma` |
| Permission **enforcement** (staff) | `rbacService.requirePermission(userId, "MODULE:ACTION", tenantId)` — e.g. `src/server/services/blacklist.service.ts:29` | `grep -rn "rbacService.requirePermission" src/server \| head` |
| Page **role** gating + role sets (`ROLES.CLINICAL` = SUPER_ADMIN/CLAIMS_OFFICER/MEDICAL_OFFICER; `ROLES.APPROVALS` adds FINANCE_OFFICER) | `src/lib/rbac.ts` (`ROLES` l.20, `requireRole` l.60) | `grep -n "export const ROLES" src/lib/rbac.ts` |
| Admin nav | `src/components/layouts/AdminSidebar.tsx` | `grep -rln "claims/queues" src --include="*.tsx"` |
| `AdjudicationReasonCode` seeding pattern (upsert; e.g. PRC-001 l.44) | `src/server/services/reason-codes.service.ts` | `grep -n "PRC-001" src/server/services/reason-codes.service.ts` |
| `ICD10Code` model (`code` PK like "E11.9") | `prisma/schema.prisma` | `grep -n "model ICD10Code" prisma/schema.prisma` |
| Claim shape available to stages (`claimLines[].icdCode/cptCode/drugCode/serviceCategory`, `claim.dateOfService`, `diagnoses Json`) | `evaluate.ts` `loadClaim` select; `prisma/schema.prisma` `model Claim` / `model ClaimLine` | `grep -n "model ClaimLine" prisma/schema.prisma` |
| History-lookback query precedent (member+provider+window, status excl. VOID/DECLINED) | `stageDuplicate` in `evaluate.ts` (l.140–154) | — |
| Auto-plan conservation validator (C5.2 must satisfy) | `src/server/services/claim-autopilot/plan.ts` (`validatePlanConservation`) | `grep -rn "validatePlanConservation" src/server` |

**Workbook ground truth (measured 2026-08-06, v0 file):** sheets `ICD11 Codes`
(18,726 code rows), `Commonest` (40 conditions), `Diagnoses Mapped to ICD` (671 data
rows; 37/40 conditions mapped; 2 rows with empty codes: Vaginal Candidiasis, Tinea
Capitis; missing: Acute Rhinosinusitis, COPD, Gastroduodenitis; all 669 present codes
validate against the ICD-11 sheet), `Clinical Diagnostic Features ` (**trailing space in
sheet name**; 40 rows × 16 cols, 100% populated), `Commonest Labs Rationale` (22 tests;
columns `Test_ID, Test_Name, Department, Requires_Diagnosis, Min_Symptoms, Min_Signs,
Mandatory_Symptoms, Compatible_Symptoms, Mandatory_Signs, Compatible_Signs,
Supported_ICD11_Diagnoses, Red_Flag_Exceptions, Repeat_Window_Hours, Audit_Rule,
Failure_Message`), `Claims filter` (empty). Exact-string join Commonest↔Features:
**24/40** (typos: "Alergic Rhinitis", "Contact Dertmatitis", "Tonsilitis",
"Gasto-esophageal reflux disease", "OtitisExterna", …).

## 5. Vocabulary

- **Intervention group (CIG)** — internal canonical condition unit (`CIG-001` Malaria …).
- **Protocol pack** — one immutable, versioned import of the entire clinical content
  set (groups + memberships + lab rules + links + aliases). Exactly one ACTIVE pack per
  tenant; activation supersedes the prior.
- **Record-only** — the CLINICAL stage evaluates + persists hits but always PASSes.
- **Route-live** — hits ROUTE per DG-D1 (per-group toggle + policy flag).
- **Alias** — a mapping from billed-line identifiers (CPT code / service code /
  normalized service name) to a lab rule, so rules can recognize their test on a claim.

## 6. Target architecture

### 6.1 Data model (all new; Prisma names exact)

```prisma
enum ClinicalCodeSystem { ICD10  ICD11 }
enum ClinicalMappingProvenance { AUTHORED  GENERATED_CROSSWALK }
enum ClinicalLabLinkType { SUPPORTED  CONFIRMATORY }
enum ClinicalAliasMatchType { CPT_CODE  SERVICE_CODE  NORMALIZED_NAME }
enum ClinicalProtocolPackStatus { DRAFT  PENDING_APPROVAL  APPROVED  REJECTED  SUPERSEDED  DEACTIVATED }
enum ClinicalVerdict { TRUE_POSITIVE  FALSE_POSITIVE  UNSURE }

model ClinicalProtocolPack {
  id                String  @id @default(cuid())
  tenantId          String
  version           Int
  status            ClinicalProtocolPackStatus @default(DRAFT)
  isActive          Boolean @default(false)   // exactly one true per tenant (service-enforced)
  sourceFileName    String
  sourceChecksum    String                    // sha256 of the pack JSON (not the xlsx)
  notes             String?
  createdById       String?
  approvalRequestId String?
  approvedById      String?
  approvedAt        DateTime?
  activatedAt       DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([tenantId, version])
}

model ClinicalInterventionGroup {
  id                        String  @id @default(cuid())
  packId                    String
  groupCode                 String    // "CIG-001"
  name                      String    // display only — never a join key
  description               String?
  isCatchAll                Boolean @default(false)  // DG-D12
  enabledForShadow          Boolean @default(true)
  enabledForLive            Boolean @default(false)  // DG-D5; UI blocks when isCatchAll
  confirmationLookbackHours Int?      // R4 window; null = same-claim only
  sourceRow                 String?   // provenance into the workbook
  @@unique([packId, groupCode])
}

model ClinicalCodeMembership {
  id         String @id @default(cuid())
  packId     String
  groupId    String
  codeSystem ClinicalCodeSystem
  code       String
  provenance ClinicalMappingProvenance @default(AUTHORED)
  note       String?
  @@unique([groupId, codeSystem, code])
  @@index([packId, codeSystem, code])   // the R1 lookup path
}

model ClinicalLabRule {
  id                String  @id @default(cuid())
  packId            String
  testCode          String   // "LAB003"
  testName          String
  department        String?
  requiresDiagnosis Boolean
  repeatWindowHours Int?
  failureMessage    String   // provider-facing, from the workbook
  auditRule         String?
  sourceRow         String?
  @@unique([packId, testCode])
}

model ClinicalLabRuleGroupLink {
  id        String @id @default(cuid())
  packId    String
  labRuleId String
  groupId   String
  linkType  ClinicalLabLinkType
  @@unique([labRuleId, groupId, linkType])
}

model ClinicalLineAlias {
  id        String @id @default(cuid())
  packId    String
  labRuleId String
  matchType ClinicalAliasMatchType
  value     String   // normalized: uppercase, trimmed, single-spaced
  @@unique([packId, matchType, value])
}

model ClinicalShadowVerdict {
  id           String @id @default(cuid())
  tenantId     String
  claimId      String
  ruleCode     String            // "R2" | "R3" | "R4" | "R1"
  routeCode    String            // the CLINICAL_* route code recorded
  verdict      ClinicalVerdict
  note         String?
  reviewedById String
  createdAt    DateTime @default(now())
  @@unique([claimId, ruleCode, reviewedById])
}
```

Policy extension (additive fields on the EXISTING `AutoAdjudicationPolicy`, mirroring
`requireCleanFraud`): `clinicalGateEnabled Boolean @default(false)` (record-only vs
route-live master), `requireClinicalGroup Boolean @default(false)` (DG-D11).
Enum addition: `CLINICAL` inserted in `ClaimProcessingStageName`. Enum addition:
`CLINICAL_PROTOCOL_CHANGE` appended to `ApprovalActionType`. All safe-additive.

### 6.2 Stage placement and behavior

`CLINICAL` runs **between `DUPLICATE` and `CONTRACT`** in `EVALUATION_STAGES`
(fails fast on clinical scope before the expensive contract evaluation; needs only
diagnosis + lines + history, which are loaded already).

Stage control flow (exact):

1. Load the tenant's ACTIVE pack (one indexed query; cache per evaluation). No ACTIVE
   pack → `PASS` with `result:{skipped:"NO_ACTIVE_PACK"}`.
2. Resolve the claim's group: collect candidate codes = claim primary diagnosis code(s)
   from `Claim.diagnoses` JSON + distinct `claimLines[].icdCode`. Look each up in
   `ClinicalCodeMembership` under the ACTIVE pack for BOTH code systems (DG-D3).
   Primary-diagnosis matches are preferred over line-code matches. **Exactly one group
   must remain, or nothing is evaluated** — if two or more groups match at the winning
   precedence level the claim is unresolved, `ambiguous:true` and every candidate group
   code are recorded, and R2/R3/R4 do not run at all (**DG-D15**, amended by C7.2). There
   is no tie-break: the original wording here picked the first group the database returned,
   which let row order decide which condition's clinical rules applied. Import now blocks
   a code that belongs to two groups (validator V11), so the fix is a clinical assignment.
3. Unresolved group: if `policy.requireClinicalGroup && policy.clinicalGateEnabled` →
   `ROUTE(CLINICAL_SCOPE_REVIEW)`; else `PASS` with `result:{outOfScope:true}` (DG-D11).
4. Resolved group with `enabledForShadow=false` → `PASS` `result:{groupDisabled:true}`.
5. Evaluate R2, R3, R4 (§6.3). Collect `ruleHits[]`.
6. If hits and `policy.clinicalGateEnabled && group.enabledForLive && !group.isCatchAll`
   → `ROUTE(<first hit's route code>)` with the full `ruleHits` in `result`.
   Otherwise → `PASS` with `result:{recordOnly:true, ruleHits, groupCode, packVersion}`.
   **Either way the hits are persisted** in the stage row (`ClaimProcessingStage.result`)
   — that persistence IS the shadow dataset (DG-D4).

### 6.3 The rules (exact semantics)

- **R2 lab↔group compatibility** — for each claim line, match aliases
  (`CPT_CODE` vs `line.cptCode`; `SERVICE_CODE` vs `line.drugCode`/service code;
  `NORMALIZED_NAME` vs normalized `line.description` when the loaded shape carries it —
  extend `loadClaim`'s select with `description: true` if absent, additive). For each
  matched lab rule with `requiresDiagnosis=true`: claim's group must appear in that
  rule's `SUPPORTED` links, else hit `{rule:"R2", routeCode: CLINICAL_LAB_UNSUPPORTED,
  labRule, failureMessage}`.
- **R3 repeat window** — for each matched lab rule with `repeatWindowHours != null`:
  query the member's prior claim lines (any provider, same tenant) whose lines match the
  same lab rule's aliases, on claims with `status notIn [VOID, DECLINED, APPEAL_DECLINED]`.
  Mirror the `stageDuplicate` query shape (anchor §4). Found → hit
  `{rule:"R3", routeCode: CLINICAL_REPEAT_WINDOW, priorClaimNumbers (≤5, safe)}`.
  Determinism under concurrency: the later-received claim (by `createdAt`) is the one
  that flags; document in tests (C2.3).
  **Window arithmetic is day-level, not millisecond (DG-D14, amended by C7.1):** a prior
  line is inside the window when `0 ≤ dayDiff ≤ floor(windowHours / 24)`, both dates
  floored to UTC day. `dateOfService` is date-only in practice, so anything finer would be
  false precision. A rule with `0 < repeatWindowHours < 24` is **not evaluated at all** —
  it is recorded in `inertRules` and counted separately in the shadow summary, so coverage
  figures never silently include a rule that is not running.
- **R4 confirmation-present** — if the group has ≥1 `CONFIRMATORY` link: the claim must
  contain a line matching a confirmatory rule's aliases, OR (when
  `confirmationLookbackHours != null`) the member must have such a line in the lookback
  window (same query machinery and the same day-level arithmetic as R3, direction: before
  service date, window = `confirmationLookbackHours`). Absent → hit `{rule:"R4",
  routeCode: CLINICAL_CONFIRMATION_MISSING}`.

### 6.4 New route codes and queue (exact strings)

Extend `QUEUES` with `CLINICAL_REVIEW: "CLINICAL_REVIEW"`. Extend `ROUTE_CODES` +
`REASON_CATALOG` with four entries (all `queue: QUEUES.CLINICAL_REVIEW`,
`resubmissionAllowed:false`, `overrideAllowed:true`, `overrideType:"MANUAL_APPROVAL"`;
member text = the catalog's `GENERIC_MEMBER_REVIEW`):

| Route code | internal | provider (from workbook where present) |
|---|---|---|
| `CLINICAL_SCOPE_REVIEW` | "Diagnosis not in the governed intervention-group scope — routed for standard adjudication." | "This claim was received and will be assessed by our team." |
| `CLINICAL_LAB_UNSUPPORTED` | "A billed test is not supported by the claim's diagnosis group (R2)." | the lab rule's `failureMessage` |
| `CLINICAL_REPEAT_WINDOW` | "A billed test repeats inside its clinical repeat window (R3)." | "A billed test was recently performed for this member; the repeat needs review." |
| `CLINICAL_CONFIRMATION_MISSING` | "Confirmatory test absent for a confirmable diagnosis (R4)." | "This diagnosis normally requires a confirmatory test on record." |

`ExceptionQueues.tsx` is data-driven (anchor §4) — the new queue renders with zero UI
change once claims are stamped. Verify in C2.1 acceptance anyway (W6).

### 6.5 Pack lifecycle

`convert (offline) → import (validate → DRAFT) → submit (PENDING_APPROVAL, approval
request opened) → approve (matrix-resolved checker; maker≠checker) → activate (isActive
flip + supersede prior) → [evaluate reads ACTIVE only]`. Mirrors
`policy-approval.ts` exactly (anchor §4), under the new
`ApprovalActionType.CLINICAL_PROTOCOL_CHANGE`.

---

## 7. Wiring invariants — the no-hanging-workflow contract

Every package's acceptance MUST tick each applicable item. This is the F76-GAP lesson
made mechanical:

- **W1 permission** — every new permission string exists in the RBAC seed
  (`prisma/seeds/rbac.ts` + `tenant-provisioning.service.ts`) AND the C3.1 ensure-script
  grants it on **existing** tenants (seedForTenant is provision-only).
- **W2 matrix** — every new `ApprovalActionType` appears in: the schema enum, the
  matrix service default-rule seed, the `ApprovalMatrixManager.tsx` dropdown, the
  `approvals/page.tsx` label map, AND the ensure-script creates the default rule for
  existing tenants.
- **W3 queue** — every new queue receives claims (stamped `assignedQueue`) and renders
  in `/claims/queues`.
- **W4 nav** — every new page is reachable from `AdminSidebar.tsx` (correct role gate).
- **W5 action** — every new service mutation is invoked by a server action used by a
  shipped page. No dead exports.
- **W6 reason** — every new route code has a `REASON_CATALOG` entry (all audiences) and
  renders on the claim detail page's stage/route display.
- **W7 toggle** — every behavior flag (`clinicalGateEnabled`, `requireClinicalGroup`,
  per-group toggles, `repeatWindowShortPay`) is editable in the admin UI by the
  intended role — never env-var-only, never DB-console-only.
- **W8 walkthrough** — the package log entry records a click-path walkthrough from
  login to the completed action (screens visited, role used), proving front-end
  operability.

---

## 8. Environment and branch runbook

### 8.1 Branch topology (verified 2026-08-06)
`feat/claims-autopilot` tip `69c1da4` is an **ancestor of `origin/main`** (the autopilot
rail is merged; origin/main additionally carries the PNOS merge). Therefore:

```bash
git fetch origin
git checkout -b feat/diagnosis-gate origin/main
```

Do NOT build on the local `feat/claims-autopilot` checkout (it predates the PNOS merge;
PNOS anchors like `network.analytics.read` exist only on main). Untracked local files
from prior sessions (uat/, scripts/uat-*, docs/provider-network-os/*) are session
artifacts — leave them; do not commit them with gate work.

### 8.2 Schema workflow
`prisma db push` only (no migrate history in this project). Order: throwaway DB →
dev DB. Before any merge-to-main request: `next build` + a prod-parity `db push --dry-run`
(PNOS post-merge lesson: tsc+tests alone missed a prod `db push` refusal).

### 8.3 Throwaway DB recipe (verbatim, from prior engagements)
```bash
initdb -D /tmp/dg-pgdata -U postgres --auth=trust --locale=C
pg_ctl -D /tmp/dg-pgdata -l /tmp/dgpg.log -o "-p 54331 -k /tmp/dgpg -c listen_addresses=127.0.0.1" -w start
createdb -h 127.0.0.1 -p 54331 -U postgres dg_uat
export DATABASE_URL="postgresql://postgres@127.0.0.1:54331/dg_uat"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push
```
(Background local Postgres gets reaped over long pauses — rebuild rather than debug.)

### 8.4 Test conventions (from the autopilot engagement — keep exactly)
- Real-DB integration tests **self-skip** unless `AUTOPILOT_TEST_DB === DATABASE_URL`.
  New DB suites follow the same guard (locate an existing example:
  `grep -rln "AUTOPILOT_TEST_DB" tests src`).
- Full no-DB suite runs WITHOUT that env var; focused DB suites run WITH it plus
  `--no-file-parallelism`.
- Raw SQL must use `now() AT TIME ZONE 'UTC'`.

---

## 9. Phase C0 — Spec, source vendoring, bootstrap

### C0.1 — Authority spec (docs)
**Objective.** Write `docs/diagnosis-gate/DIAGNOSIS_GATE_SPEC.md`: the DG-D1…D12 table
(§3) verbatim; the R1–R4 semantics (§6.3) in clinical-readable language; the pilot
group list (placeholder table the clinical owner fills: recommend starting set Malaria,
UTI, Pneumonia, Tonsillitis, Gastritis/PUD; catch-alls excluded per DG-D12); the C4
exit-criteria template (measurable: e.g. "sampled false-positive rate ≤ X% per rule",
"would-route volume ≤ Y% of gated-group claims", X/Y left blank for the owner);
failure-semantics table (= §6.4); governance roles (maker/checker/owner names).
**Acceptance.** Doc committed; sign-off section present with named signatories
(G-C0 remains open until signed — later packages may build, but C4 cannot start).

### C0.2 — Vendor the source workbook
**Objective.** Copy the xlsx to
`docs/diagnosis-gate/source/ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx`; record
its sha256 in `docs/diagnosis-gate/source/SOURCE_NOTES.md` together with the §4
"workbook ground truth" block (sheet names incl. the trailing-space one, row counts,
join statistics, known defects F1–F9 from the fix-list). Every future pack version gets
vendored the same way (`_v1.xlsx`, …).
**Acceptance.** Files committed; SOURCE_NOTES numbers match §4 exactly.

### C0.3 — Branch/env bootstrap
**Objective.** Create `feat/diagnosis-gate` per §8.1; run §8.3; run baseline
`npx tsc --noEmit` + full no-DB `vitest` on the fresh branch and record counts in the
log (regression yardstick).
**Acceptance.** Log entry with green baseline numbers.

## 10. Phase C1 — Reference data layer

### C1.1 — Schema
**Objective.** Add §6.1 models/enums + the two policy fields + the two enum additions.
**Steps.** Edit `prisma/schema.prisma` (place new models in one clearly-commented
`// ── Diagnosis Gate (DG, this plan) ──` block); `db push` throwaway → dev;
`npx prisma generate`.
**Acceptance.** `tsc` clean; `db push` reports additive only (no data-loss prompt);
existing suites green. **Tests.** none (schema only).

### C1.2 — Pack service + governed lifecycle
**Objective.** `src/server/services/diagnosis-gate/protocol-pack.service.ts`:
`createDraftFromImport(tenantId, packJson, meta)` (writes pack + all child rows in one
transaction; computes checksum; rejects if identical checksum already ACTIVE);
`submitForApproval(packId, userId)` and `applyApprovedPackChange(...)` — **copy the
shape of `policy-approval.ts`** (anchor §4) under `CLINICAL_PROTOCOL_CHANGE`, safe
payload = `{packId, version, counts, checksum}`; `activatePack(packId)` (transaction:
assert APPROVED, flip prior ACTIVE→`isActive:false,status:SUPERSEDED`, set new
`isActive:true, activatedAt`); `getActivePack(tenantId)` (cached per-request);
`diffPacks(aId,bId)` (added/removed/changed groups, memberships, rules, links, aliases —
pure function, returns a structured diff for the UI).
**Acceptance.** Unit tests for lifecycle transitions incl. maker≠checker rejection and
idempotent re-apply (mirror the policy-approval tests — locate:
`grep -rln "applyApprovedPolicyChange" tests src`). W5 deferred to C3 (UI) — noted in log.

### C1.3 — Converter + importer + validation report
**Objective.** (a) **Offline converter** `scripts/diagnosis-gate/convert-workbook.ts`
(use **`exceljs` ^4.4.0 — already a dependency**; do NOT add `xlsx`. Corrected
2026-08-06): xlsx → canonical
`pack.json` (schema: `{formatVersion:1, groups:[{groupCode,name,isCatchAll,
confirmationLookbackHours,sourceRow}], memberships:[{groupCode,codeSystem,code,
provenance}], labRules:[{testCode,testName,department,requiresDiagnosis,
repeatWindowHours,failureMessage,auditRule,sourceRow}], links:[{testCode,groupCode,
linkType}], aliases:[{testCode,matchType,value}]}`). Deterministic output (sorted keys)
so packs diff cleanly in git. Reads the v0 sheets by their EXACT names (§4, trailing
space included). The converter maps `Repeat_Window_Hours`→`repeatWindowHours`,
`Failure_Message`→`failureMessage`, `Supported_ICD11_Diagnoses`→SUPPORTED links (by
group), Diagnostic-Confirmation investigations→CONFIRMATORY links. Where the workbook
value is free text that cannot be resolved to a `groupCode`, the converter emits an
**unresolved entry**, not a guess (§0.2).
(b) **Validator** (shared module `src/server/services/diagnosis-gate/pack-validate.ts`,
used by converter CLI and the C3.2 upload path): V1 every group referenced anywhere is
defined; V2 every membership code well-formed for its system; V3 every ICD11 membership
exists in the vendored ICD-11 master sheet, every ICD10 membership exists in the
`ICD10Code` table; V4 every link resolves testCode+groupCode; V5 no duplicate keys;
V6 every lab rule with `requiresDiagnosis` has ≥1 SUPPORTED link; V7 catch-all groups
flagged; V8 unresolved-entry count. Output: `{errors[], warnings[], stats}` — human MD
rendering included.
(c) Run against workbook v0 and commit the **red report** to
`docs/diagnosis-gate/reports/v0-validation.md` — this is the deliverable sent back to
the clinical team (their fix-tracking artifact).
**Acceptance.** Converter is deterministic (two runs byte-identical); validator unit
tests cover each V-rule with a minimal failing fixture; the v0 red report's counts match
§4 ground truth (e.g. 2 empty-code rows, 3 unmapped conditions surface as V-errors).

### C1.4 — ICD-10 crosswalk ingestion
**Objective.** Obtain the **official WHO ICD-10↔ICD-11 mapping tables** (published by
WHO; if not obtainable, mark `BLOCKED-EXTERNAL` per §0.2 and skip — ICD-10 memberships
then await clinical authoring). Vendor the file under `docs/diagnosis-gate/source/`;
extend the converter: for every ICD11 membership, emit the back-mapped ICD10 membership
with `provenance:GENERATED_CROSSWALK`. Generate
`docs/diagnosis-gate/reports/crosswalk-review.md` listing every generated row grouped by
CIG for clinical confirmation (they confirm in the next pack version by flipping
provenance to AUTHORED in their workbook or an addendum sheet).
**Acceptance.** Every generated row carries GENERATED_CROSSWALK; zero invented codes
(each must exist in the vendored WHO file AND in `ICD10Code`; drop + warn otherwise).

### C1.5 — Line-alias coverage
**Objective.** Aliases are how rules recognize their test on real claims — R2/R3/R4 are
inert without them. Seed initial aliases in the converter (NORMALIZED_NAME from
`Test_Name` + obvious variants ONLY if present in the workbook; CPT/service codes only
if the clinical team supplies them — never invented). Build
`scripts/diagnosis-gate/alias-coverage.ts`: over the trailing 90 days of claim lines
(dev/prod-readonly), report what % of lab-category lines match any alias, and the top
200 unmatched line descriptions by frequency → `docs/diagnosis-gate/reports/
alias-coverage-<date>.md`. That unmatched list goes to the clinical team to extend
aliases in the next pack.
**Acceptance.** Report committed; coverage % is a C4 exit-memo input (low coverage =
extend aliases, never lower the bar).

## 11. Phase C2 — The engine stage (record-only)

### C2.1 — Stage skeleton + route codes + queue
**Objective.** Add `CLINICAL` to `ClaimProcessingStageName` (C1.1 already did the enum —
verify); add §6.4 queue + route codes to `reason-catalog.ts`; create
`src/server/services/claim-autopilot/stage-clinical.ts` exporting
`stageClinical(ctx: EvalContext): Promise<StageOutcome>` implementing §6.2 steps 1–4
(group resolution + scope semantics; R2–R4 stubbed PASS); register it in
`EVALUATION_STAGES` between DUPLICATE and CONTRACT; extend `loadClaim` select with
`claimLines[].description` and `diagnoses` if absent (additive select).
**Acceptance.** All existing autopilot tests green (stage PASSes with
`NO_ACTIVE_PACK` when no pack exists — zero behavior change proven by the untouched
suite); with a fixture pack ACTIVE + `requireClinicalGroup:true` +
`clinicalGateEnabled:true`, an out-of-scope claim routes `CLINICAL_SCOPE_REVIEW` and
appears in `/claims/queues` under CLINICAL_REVIEW (W3, W6 — walkthrough logged).

### C2.2 — R2 lab↔group compatibility
**Objective.** Implement alias matching (normalize: uppercase/trim/collapse-spaces) +
R2 per §6.3; hits persist in stage `result`. Golden fixtures: generate
`tests/fixtures/diagnosis-gate/pack.fixture.json` **via the converter** from the
vendored v0 workbook, filtered to Malaria + UTI + Gastritis/PUD + labs
LAB003/004/005/007/010/012/014 (single-source-of-truth: fixtures are derived, never
hand-written — clinical truth stays in the workbook).
**Tests.** Unit: supported test passes; unsupported test hits with the workbook's
`failureMessage`; `requiresDiagnosis:false` tests never hit R2.
**Acceptance.** Record-only proven: hits recorded, disposition PASS, claim untouched.

### C2.3 — R3 repeat window
**Objective.** Implement the history lookback per §6.3 (query shape mirrors
`stageDuplicate`, anchor §4).
**Tests.** DB integration (`AUTOPILOT_TEST_DB` guard, §8.4):
(a) same test inside window → hit with prior claim number; (b) outside window → no hit;
(c) VOID/DECLINED priors ignored; (d) concurrency — two claims inserted `Promise.all`,
deterministic single flag on the later `createdAt`; (e) cross-provider prior (same
member, different provider) → hit (documents the within-book semantics).
**Acceptance.** Suite green under `--no-file-parallelism`.

### C2.4 — R4 confirmation-present
**Objective.** Implement per §6.3 (same-claim scan + optional lookback reusing C2.3
machinery).
**Tests.** Unit: confirmatory line present → pass; absent → hit. DB: present in
lookback window on an earlier claim → pass.

### C2.5 — Shadow read model
**Objective.** `src/server/services/diagnosis-gate/clinical-gate-read.service.ts`:
`summarize(tenantId, {from,to})` reading `ClaimProcessingStage` rows
(`stage:"CLINICAL"`) joined run→claim: per-rule hit counts & billed-value, would-route
volume, out-of-scope %, ambiguous-group count, per-provider and per-group slices,
alias-match rate; `listHits({rule, group, provider, page})` returning claim
number/date/provider/rule/route detail (bounded pagination; **no raw payloads**);
`exportCsv(...)` writing an audit log row (mirror the PNOS export-audit pattern —
locate on main: `git grep -n "NETWORK_ANALYTICS:EXPORT" origin/main -- src`).
**Tests.** Unit over seeded stage rows; CSV audited.

## 12. Phase C3 — Governance, permissions, UI

### C3.1 — Permissions, matrix action, role seeding, ensure-script
**Objective.** Permission strings (exact — **`MODULE:ACTION` staff convention**, corrected
2026-08-06 from the dotted form in plan v1.0; the dotted form is the *provider-portal*
convention and must not be used here): `CLINICAL_PROTOCOL:VIEW`,
`CLINICAL_PROTOCOL:MANAGE` (import + submit), `CLINICAL_PROTOCOL:APPROVE`,
`CLINICAL_GATE:REVIEW` (work the queue). Each is registered in the `PERMISSIONS` array
with `{code, module, action, resource, description}` and enforced via
`rbacService.requirePermission(userId, code, tenantId)`. Seed in `prisma/seeds/rbac.ts` +
`tenant-provisioning.service.ts`: read+manage → SUPER_ADMIN, MEDICAL_OFFICER; approve →
SUPER_ADMIN, FINANCE_OFFICER (checker parity with AUTO_ADJ; adjust in C0.1 spec if the
clinical owner nominates a different checker role); review → CLAIMS_OFFICER,
MEDICAL_OFFICER. Matrix: add `CLINICAL_PROTOCOL_CHANGE` to the schema enum (done C1.1 —
verify), the default-rule seed in `approval-matrix.service.ts` (requiredRole
`MEDICAL_OFFICER`, requiresDual false — mirror the AUTO_ADJ block at ~l.124),
`ApprovalMatrixManager.tsx` dropdown (l.29 pattern), `approvals/page.tsx` label map
(l.17). **Ensure-script** `scripts/diagnosis-gate/ensure-tenant-wiring.ts`: idempotent;
for every existing tenant creates missing role-permission grants + the default matrix
rule (codifies the F76-GAP-02 "seedForTenant is provision-only" lesson).
**Acceptance.** W1+W2 fully ticked; ensure-script run against the throwaway DB twice
(idempotency proven); walkthrough: the new action type is selectable in
`/settings/approval-matrix` (W8).

### C3.2 — Protocol library UI
**Objective.** `src/app/(admin)/settings/clinical-protocols/` — list page (packs:
version, status, isActive, checksum, counts, dates), detail page (groups table with
membership counts + per-group `enabledForShadow`/`enabledForLive` toggles [live toggle
disabled+explained when `isCatchAll` — DG-D12]; lab rules table; alias counts;
validation stats), diff view (C1.2 `diffPacks` rendered), and **import**: upload
xlsx-converted `pack.json` (or run server-side conversion if the xlsx lib is server-safe
— decide at build; the validated path is: upload pack.json produced by the C1.3 CLI),
render the validation report (errors block DRAFT creation; warnings shown), create
DRAFT. Server actions call C1.2/C1.3 services; gate by `clinical.protocol.read`/`manage`.
Nav: add "Clinical protocols" under Settings in `AdminSidebar.tsx` (W4).
**Acceptance.** Full walkthrough logged (W8): upload → red report on a broken fixture →
green on the good fixture → DRAFT visible with correct counts. `next build` clean.

### C3.3 — Governance actions end-to-end
**Objective.** Wire submit (maker) → approval request visible in `/approvals` with the
new label → approve (checker per matrix; maker≠checker enforced) → activate (button on
APPROVED pack; confirmation modal states supersession) → ACTIVE badge moves; the
CLINICAL stage reads the new pack on the next evaluation.
**Acceptance.** Two-user walkthrough logged (maker + checker accounts); attempting
approve-as-maker is rejected (screenshot/note in log); a claim evaluated after
activation records the new `packVersion` in its stage result. W5 now closed for C1.2.

### C3.4 — Policy flags + claim-detail surfacing
**Objective.** (a) `/settings/auto-adjudication`: add a "Clinical gate" section with
`clinicalGateEnabled` + `requireClinicalGroup` switches (flow through the EXISTING
governed policy-change path — these are policy fields, so they ride
`AUTO_ADJ_POLICY_CHANGE` approval like every other policy edit; no new mechanism).
(b) Claim detail (`/claims/[id]`): the stage trace must show the CLINICAL stage with
its route code / record-only hits (locate the existing stage-trace component:
`grep -rln "ClaimProcessingStage" src/app` — extend, don't fork). Render `ruleHits`
compactly (rule, test, message, prior claim refs).
**Acceptance.** W7 ticked for both flags; walkthrough: flip `clinicalGateEnabled` via
maker/checker, observe a fixture claim route live; flip back, observe record-only.

## 13. Phase C4 — Shadow campaign

### C4.1 — Baseline snapshot (BEFORE any provider comms — DG-D9)
**Objective.** `scripts/diagnosis-gate/baseline.ts`: trailing-90-day snapshot per
provider and per group: claim volume + billed value per resolved group, top ICD codes,
lab lines per diagnosis-group, repeat-test incidence. Output JSON + MD to
`docs/diagnosis-gate/baselines/<YYYY-MM-DD>/`, committed.
**Acceptance.** Report committed; numbers spot-checked against `/claims` counts.

### C4.2 — Shadow dashboard + clinical verdict sampling
**Objective.** Page `src/app/(admin)/claims/clinical-shadow/` (nav under Claims, gate
`clinical.gate.review`): C2.5 `summarize` rendered (per-rule hit rates, would-route
volume/value, trends, alias-match rate, out-of-scope share, per-provider slices) + hit
list with a **verdict control** per hit (TRUE_POSITIVE / FALSE_POSITIVE / UNSURE +
note → `ClinicalShadowVerdict`; one verdict per reviewer per claim+rule). Verdict
aggregates (sampled FP rate per rule) display beside each rule's hit rate — these are
the G-C4 exit numbers. CSV export (audited, C2.5).
**Acceptance.** Walkthrough: reviewer records verdicts; aggregates update; export
audited (W8). `next build` clean.

### C4.3 — Campaign runbook + exit gate [HUMAN]
**Objective.** `docs/diagnosis-gate/SHADOW_CAMPAIGN_RUNBOOK.md`: weekly cadence
(sample N hits/rule/week for verdicts — N set in C0.1), who reviews, how packs get
tuned (new pack version via C3 flow — never direct edits), exit-memo template pulling
the C4.2 aggregates + C1.5 alias coverage + baseline drift. **G-C4** = signed exit memo
committed to `docs/diagnosis-gate/reports/`.
**Acceptance.** Runbook committed. The gate itself is human — code cannot close it.

## 14. Phase C5 — Pilot live

### C5.1 — Per-condition route-live
**Objective.** No new code expected (C2/C3 built it): the go-live act = clinical owner
flips `enabledForLive` on pilot groups (C3.2 UI) + `clinicalGateEnabled` on the policy
(C3.4, maker/checker). This package is the **verification campaign**: on the throwaway
DB, prove only-enabled-groups route (enable Malaria only → UTI fixture claim stays
record-only); in prod after the flip, verify queue inflow matches shadow predictions
(±agreed tolerance) and every routed claim is workable from `/claims/queues` →
claim detail → manual decision (the existing adjudication path — no new decision UI).
**Acceptance.** Evidence file `docs/diagnosis-gate/reports/c5-golive-evidence.md`
(queue counts vs shadow prediction, 3 worked-claim walkthroughs).

### C5.2 — Repeat-window short-pay [QUARANTINED — gate G-C5.2]
**Objective.** The ONLY money-touching package. Preconditions: G-C4 passed AND explicit
finance+clinical sign-off recorded in the log. Add `repeatWindowShortPay Boolean
@default(false)` to `AutoAdjudicationPolicy` (additive; W7: switch in the C3.4 policy
section). Seed `AdjudicationReasonCode` `CLIN-001` ("Repeat test inside clinical repeat
window — repeat not payable", severity SHORTFALL, remedy from the workbook) via the
`reason-codes.service.ts` upsert pattern (anchor §4). Behavior when ON: an R3 hit marks
THAT LINE `PENDED→APPROVED_WITH_ADJUSTMENT` with `payableAmount:0`, reason `CLIN-001`
in the auto plan (respecting `validatePlanConservation`, anchor §4); the claim
otherwise proceeds. When OFF (default): R3 routes as before.
**Tests.** Financial: conservation invariant holds (billed = payer + member + writeoff +
disallowed) with a zeroed line; flag OFF → identical behavior to C2.3 suite (regression
lock).
**Acceptance.** Only ships behind the default-OFF flag; W7+W8 walkthrough with the
flag ON in throwaway, OFF in prod until the human gate.

### C5.3 — Provider comms + drift monitoring
**Objective.** (a) Drift: extend C2.5/C4.2 with baseline-comparison panels (group-share
delta vs C4.1 baseline; threshold from C0.1; breach renders an alert banner on the
shadow/live dashboard). (b) Comms pack (business deliverable, engineering supplies):
per-group one-pagers auto-generated from the ACTIVE pack (rule, provider-facing
message, appeal path) — script `scripts/diagnosis-gate/comms-pack.ts` → MD/PDF into
`docs/diagnosis-gate/comms/`. Publication order enforced by DG-D9 (baseline first).
**Acceptance.** Drift panel walkthrough; comms pack generated from the live pack
(content 100% from pack rows — §0.2).

## 15. Phase C6 — Gated backlog (DO NOT START before G-C4)

Recorded for direction only; each becomes its own planned package set when unlocked:
C6.1 controlled symptom/sign vocabulary (schema + pack extension); C6.2 structured
symptom picklist on the owned provider portal rail; C6.3 keyword/LLM extraction spike
for HMS free text (advisory-only; per-partner feed field required; negation handling
mandatory); C6.4 drug/treatment baskets (reuses C1 pack + C2 alias/link machinery
nearly wholesale — highest-value C6 item, attacks the named #1 problem); C6.5
DPPA privacy design for free-text ingestion (minimize, extract-at-edge, retention).

## 16. Testing strategy summary

| Layer | Where | Guard |
|---|---|---|
| Converter/validator unit | `tests/` beside existing unit suites (locate: `ls tests/`) | none |
| Stage rules unit (R1/R2/R4 same-claim) | fixture pack (derived, C2.2) | none |
| History rules DB (R3, R4-lookback, concurrency) | new DB suite | `AUTOPILOT_TEST_DB` + `--no-file-parallelism` |
| Lifecycle/governance | mirror policy-approval tests | none |
| Financial (C5.2 only) | conservation suite | `AUTOPILOT_TEST_DB` |
| Regression | full existing no-DB suite green after EVERY package | §8.4 |

## 17. Risk register

| Risk | Mitigation |
|---|---|
| Clinical team turnaround stalls C4 | C1.3 red report makes remaining work concrete; C4.3 weekly cadence; engineering chain (C1→C3) has no external blocker |
| Alias coverage too low → rules inert on real claims | C1.5 coverage report is a G-C4 exit input; unmatched-lines list feeds pack updates |
| Diagnosis gaming after comms | DG-D9 baseline + C5.3 drift panel; breach = incident with named owner (C0.1) |
| False positives anger providers | DG-D1 route-only; C4.2 verdict sampling sets measured FP rate before any live flip; appeal path in comms |
| Scope creep to Rung 2 mid-build | DG-D10/G-C6 written into the signed spec |
| Prod schema push refusal at merge | §8.2 prod-parity dry-run before merge request |
| Anchor drift (code moved since 2026-08-06) | §0.1.1 re-verify protocol + locate commands in §4 |

## 18. Logging and progress conventions

- `docs/diagnosis-gate/IMPLEMENTATION_LOG.md` — append per package: id, date, commits,
  anchors re-verified, deviations, W-checklist ticks, walkthrough note (W8).
- `docs/diagnosis-gate/PROGRESS.md` — one-line status per package (mirror
  `docs/provider-network-os/PROGRESS.md` format) — the resume point for any future
  session/model.
- Reports land in `docs/diagnosis-gate/reports/`; baselines in `.../baselines/`;
  vendored sources in `.../source/`.

## 19. Package index

| Pkg | Title | Depends on | Gate |
|---|---|---|---|
| C0.1 | Authority spec + decision log | — | G-C0 to close |
| C0.2 | Vendor workbook + SOURCE_NOTES | — | |
| C0.3 | Branch/env bootstrap | — | |
| C1.1 | Additive schema | C0.3 | |
| C1.2 | Pack service + governed lifecycle | C1.1 | |
| C1.3 | Converter + validator + v0 red report | C0.2, C1.1 | |
| C1.4 | WHO crosswalk ingestion | C1.3 | BLOCKED-EXTERNAL allowed |
| C1.5 | Alias coverage report | C1.3 | |
| C2.1 | CLINICAL stage skeleton + routes + queue | C1.1–C1.3 | |
| C2.2 | R2 compatibility + derived fixtures | C2.1 | |
| C2.3 | R3 repeat window (DB suite) | C2.1 | |
| C2.4 | R4 confirmation-present | C2.3 | |
| C2.5 | Shadow read service | C2.2–C2.4 | |
| C3.1 | Permissions + matrix + ensure-script | C1.1 | |
| C3.2 | Protocol library UI + import | C1.2, C1.3, C3.1 | |
| C3.3 | Governance E2E (maker/checker/activate) | C3.2 | |
| C3.4 | Policy flags + claim-detail surfacing | C2.5, C3.3 | |
| C3.5 | Capability resolution (production authorisation) | C3.1–C3.4 | added in build: production carries **zero** RBAC rows, so gating any button on `rbacService.hasPermission` alone made the whole feature inoperable there |
| C4.1 | Baseline snapshot | C2.5 | precedes ANY comms (DG-D9) |
| C4.2 | Shadow dashboard + verdicts | C2.5, C3.4 | |
| C4.3 | Campaign runbook + exit memo | C4.1, C4.2 | **G-C4 (human)** |
| C5.1 | Per-condition go-live verification | G-C4 | |
| C5.2 | Repeat-window short-pay | G-C4 | **G-C5.2 (human)** |
| C5.3 | Comms pack + drift monitoring | C4.1, C5.1 | |
| C6.x | Rung-2 backlog | — | **G-C6 = G-C4 memo** |
| C7.1 | R3/R4 day-level arithmetic + sub-day inertness | — | correctness; see addendum |
| C7.2 | R1 no-winner ambiguity + validator V11 | — | correctness; see addendum |
| C7.3 | Converter reader hardening | — | see addendum |
| C7.4 | v0.1 annex intake + red report | C7.1–C7.3 | see addendum |
| C7.5 | Spec amendments DG-D14–D19 + docs | C7.1–C7.4 | see addendum |

Phase C7 (added 2026-08-07, triggered by the v0.1 research-remediated annex) is specified
in `docs/diagnosis-gate/PLAN_C7_V01_INTAKE.md` — same execution rules, same W-invariants.

---

*Prepared 2026-08-06. Anchors verified against `feat/claims-autopilot` tip `69c1da4`
(ancestor of `origin/main`). This plan changes no behavior until packs are imported,
approved, and flags are deliberately flipped — deploying every package with defaults
leaves the platform byte-for-byte behaviorally identical.*
