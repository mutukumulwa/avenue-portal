# TPA Feedback Remediation — Work Plan

**Date:** 2026-07-03
**Source:** TPA / claims-operations feedback session (8 noted issues, listed verbatim in §0)
**Codebase:** `avenue-portal` (Next.js 15 App Router / React 19 / Prisma 7 / PostgreSQL / tRPC / BullMQ)
**Status:** Planning document — no code changed by this document.

---

## How to use this document (read this first, every agent)

This plan is broken into **work packages (WPs)** sized so a single agent session can complete one
WP without exhausting context. Rules of engagement:

1. **Do ONE work package per session.** Each WP lists exactly which files to read. Do not read the
   whole schema (5,955 lines) or whole services — read only the line ranges given.
2. **Read `AGENTS.md` first.** This Next.js version has breaking changes vs. training data — check
   `node_modules/next/dist/docs/` for any App Router / server-action API you touch.
3. **House conventions** (non-negotiable):
   - Every query is tenant-scoped (`tenantId`) and, where a session has `clientId`, client-scoped
     (see `src/server/services/claims.service.ts:52` for the pattern).
   - RBAC via `requireRole(ROLES.X)` from `@/lib/rbac` on every page/action.
   - Never delete — deactivate with `isActive`/effective dates (see `ProviderTariff` comment).
   - Money is `Decimal @db.Decimal(14, 2)`; multi-currency via `currency` string field.
   - New schema changes = edit `prisma/schema.prisma` + create a migration (`prisma/migrations/`).
     Prod syncs schema on build (`scripts/db-sync.mjs`), but always write the migration.
   - Styling: Tailwind with `brand-*` tokens (see any admin page). Match Medvex style guide
     (`Medvex_Style_Guide.md`) if adding new visual patterns.
4. **Dependencies:** each WP lists `Depends on:`. Do not start a WP whose dependency isn't merged.
5. **Definition of done** per WP: code compiles (`npx tsc --noEmit`), lint passes, acceptance
   criteria met, and existing tests still pass (`npx vitest run` — scope to affected files if slow).

**Phase order:** Phase 1 (A + C schema) → Phase 2 (B, D, E schemas + services) → Phase 3 (UI) →
Phase 4 (integrations & polish). WPs within a phase are parallelisable unless a dependency says otherwise.

---

## §0. The noted issues (verbatim requirements)

| # | Issue | Workstream |
|---|-------|-----------|
| 1 | Claims queues should have self-contained scrolling containers rather than huge pages | **A** |
| 2 | Claims grouped at facility level first, so TPA isn't looking at mixed claims from different facilities | **A** |
| 3 | Outpatient paid within 24 hours, inpatient within a month or weekly — group/sort so urgent ones are fixed and paid first | **A** |
| 4 | Offline work code: facility calls claims agent, gets a code to work offline; workflow for what data is shared periodically to allow offline work | **B** |
| 5 | Pre-auths should rarely convert to claims — instead a pre-auth is **attached** to a claim that also contains BAU services | **C** |
| 6 | Case management sub-menu: services, pre-auths, letters of undertaking accrue in an open case (e.g. inpatient stay); case closes and files as a single claim; manual updates by clinical officers or daily HMS batch | **D** |
| 7 | Contracts have service tiers — headline items (most common services), labs, imaging, pharmacy, other services — each with a fee, as FFS contract modelling | **E** |
| 8 | Where capitation models exist, packages are listed in the contract; benefit packages define FFS vs capitation vs combination per service | **E** + **F** |

---

## §1. Current-state snapshot (evidence — so agents don't re-derive it)

### Claims queue & list UX (Workstream A)
- `src/app/(admin)/claims/queues/page.tsx` — 5 status lanes (`INCURRED`, `RECEIVED`, `CAPTURED`,
  `UNDER_REVIEW`, `READY_TO_PAY`) in a CSS grid. Each lane renders **all** its cards with no
  `max-height`/`overflow` → the page grows unboundedly (the "huge pages" complaint).
- Lane SLAs are **fixed per status** (24–72 h) and ignore `serviceType` entirely.
- Data: `ClaimsService.getActiveQueues` (`src/server/services/claims.service.ts:16-44`) — fetches
  every active claim, `orderBy receivedAt asc`, selects `provider.name` but **not** `providerId`
  or `serviceType`. No pagination.
- `src/app/(admin)/claims/page.tsx` — all-claims table also fetches **everything**
  (`getClaims`, no `take`) and renders one giant table.
- Claims are mixed across facilities in every lane — no provider grouping anywhere.

### Offline (Workstream B)
- Exists: admin **Offline Capture** page (`src/app/(admin)/offline-capture/` + IndexedDB outbox
  `src/lib/offline/outbox.ts`), store-and-forward `SyncService.ingest/reconcile`
  (`src/server/services/sync.service.ts`), and models `SyncOperation`, `OfflineReservation`,
  `EligibilitySnapshot` (`prisma/schema.prisma:1674-1739`). `ClaimSource.OFFLINE_SYNC` exists.
- Missing: **no offline-work authorization code concept at all** (grep for `offlineCode|authCode`
  returns nothing), no facility-scoped periodic data pack, no gating of offline capture behind an
  agent-issued code, no expiry/audit workflow.

### Pre-auth → claim (Workstream C)
- `Claim.preauthId String? @unique` (1:1) + `PreAuthorization.claimId`/`convertedAt` +
  `PreauthStatus.CONVERTED_TO_CLAIM` (`prisma/schema.prisma:2070-2207, 2358-2444`).
- `ClaimsService.convertPreAuthToClaim` (`src/server/services/claims.service.ts:678`) creates a
  claim **from** the PA — exactly the workflow the TPA says is wrong.
- Adjudication looks up "approved PA not yet converted" around `claims.service.ts:158`.
- Contract-side `PreauthRule` model exists (`schema.prisma:3369`) — defines *which services*
  require PA per contract. Good foundation: adjudication should check PA-required **lines**
  against **attached** PAs.

### Case management (Workstream D)
- No `Case` model exists (only `CaseMixWeight`, unrelated). No Letter of Undertaking entity
  anywhere in `src/`. `PreAuthorization` has GOP fields (`gopNumber`) which are related but
  distinct (GOP = guarantee of payment on a PA; LOU = payer undertaking for an admission).
- Sidebar nav: `src/components/layouts/AdminSidebar.tsx:46-61` — "Clinical" section already has
  Claims / Claims Queues / Pre-Authorizations entries and supports `children` sub-menus
  (see Fraud Alerts at line 93-99 for the sub-menu pattern).

### Contracts & service tiers (Workstream E)
- Rich digital-contract engine already exists: `ProviderContract` (+ `ContractVersion`,
  `ContractApplicability`), `ProviderTariff` with `rateType` (FIXED / DISCOUNT_OFF_BILLED /
  PER_DIEM / CAPITATION / AVERAGE_COST_POOL…), `PricingRule` (`PricingRuleKind.CAPITATION`,
  `PER_VISIT_CASE_RATE`…), `ContractPackage`+`PackageComponent` (episode-priced packages),
  `PreauthRule`, `ServiceCategory`+`ServiceCategoryAlias` taxonomy with `PatientClass` OP/IP/OT.
  See `prisma/schema.prisma:2594-3460` and spec `DIGITAL_CONTRACT_MODULE_SPEC.md`.
- **Missing:** a "service tier" grouping concept (headline / labs / imaging / pharmacy / other)
  on the taxonomy, a seeded canonical taxonomy from the Masters, and a contract-detail UI that
  presents tariffs grouped by tier. `src/app/(admin)/contracts/[id]/page.tsx` (336 lines) shows
  contract header/terms but no tier-grouped fee schedule.
- Corpus evidence for tiers (`contracts/Masters/*.xlsx`, markdown mirrors in `contract-mds/Masters/`):
  - `Last & Final Service & Procedures Master.xlsx` — 1,386 rows, `categoryname` values like
    CONSULTATION, Procedure, Mo Minor Procedure, IP SERVICES, THEATER, AMBULANCE, Dental,
    Optical Services, Dialysis, Package…; `Final_Category` = OP / IP / OT / OP-IP. Sheet2 =
    theatre-time fee bands.
  - `Master Lab.xlsx` — 419 lab items with disciplines (BIOCHEMISTRY, MICROBIOLOGY, IMMUNOLOGY,
    HAEMATOLOGY…). `Master Radiology.xlsx` — 234 imaging items (XRAY, CT, MRI, US…).
  - `Inventory Matser*.xlsx` — 8,676 pharmacy/consumable items.
  - `Specialty Master.xlsx` — specialties with OP Consultation Fees / IP Review Fees (the
    "headline items"). `Doctor's Master - VCs.xlsx` — per-branch doctor payout shares.
  - `contract-mds/FFS RATES/*.md` — real FFS price lists organised exactly as
    Category → Item → Agreed Rate (e.g. `CIC Insurance tariff.md`).

### Benefit packages & funding model (Workstream F)
- `Package` → `PackageVersion` → `BenefitConfig` per `BenefitCategory`
  (`prisma/schema.prisma:1753-1905`). `BenefitConfig` has limits/copay/co-insurance but **no
  funding-model designation** (FFS vs capitation vs hybrid).

---

## §2. Design decisions (settled here so agents don't re-litigate)

- **D1 — Facility grouping is a view concern, not a schema change.** Claims already have
  `providerId`. The queue re-groups: Facility → SLA class → status lane.
- **D2 — Payment SLA is contract-first, `serviceType` defaults as fallback** *(TPA-confirmed
  2026-07-03: inpatient cadence is set on the contract)*. When the claim has a matched contract,
  the SLA comes from `ProviderContract.paymentTermDays` + `paymentTermType`
  (`prisma/schema.prisma:2942-2943` — fields already exist). Fallback when no contract matched:
  `OUTPATIENT`/`DAY_CASE`/`EMERGENCY` → pay within **24 h**; `INPATIENT` → **7 days** (weekly
  cycle) with a 30-day hard ceiling. Encode as a small pure helper (`src/lib/claims-sla.ts`) so
  both queue UI and services share it. Do **not** hard-code hours in JSX again.
- **D3 — Offline work code = new `OfflineWorkAuthorization` model** (agent-issued, facility-scoped,
  time-boxed, single-use-per-window code). Code delivery is **off-system by design** — the agent
  reads it out over the phone and/or sends it by SMS; the system records issuance and displays the
  code, nothing more. Offline capture and sync ingest reference it. Data shared for offline work =
  **facility offline pack**: the *minimum* data the facility needs to run day-to-day —
  data-minimised (member number, name, active status, benefit balances, tariff excerpt; no contact
  details, no clinical history) and **strongly encrypted** (AES-256-GCM envelope; decryption key
  delivered separately from the pack, derived from the work code + a server secret — a stolen pack
  file alone is useless). Reuses `EligibilitySnapshot` (already has `tariffRef`, `validUntil`).
- **D4 — Pre-auth ATTACH model:** a claim may have **many** attached pre-auths; a pre-auth
  attaches to at most one claim. Implement by making `PreAuthorization.attachedClaimId` a plain
  (non-unique→many) FK: i.e. drop `Claim.preauthId @unique` in favour of
  `PreAuthorization.claimId` **without** the 1:1 back-relation, exposing `Claim.preauths[]`.
  New `PreauthStatus.ATTACHED` (approved + linked, awaiting claim decision) and `UTILISED`
  (claim decided). `CONVERTED_TO_CLAIM` is kept for history but no longer produced; the
  "Convert to Claim" action becomes "Create claim with this PA attached" (a convenience that
  creates an ordinary claim and attaches, not a 1:1 conversion).
- **D5 — Case = clinical episode container.** `ClinicalCase` model (avoid reserved word `Case`)
  groups check-in/admission, accrued service entries, attached PAs, LOUs, documents. On close it
  **assembles exactly one Claim** (claim lines from service entries, PAs re-attached to the claim
  per D4). While open it appears in "Open Cases". Updated manually or by daily HMS batch.
  *(TPA-confirmed 2026-07-03: one case → one claim is the working rule, but one-case-many-claims
  must stay open as a future path — e.g. pregnancy + newborn under one admission.)* Therefore the
  FK lives on the **claim side**: `Claim.caseId String?` (indexed, NOT unique) rather than
  `ClinicalCase.claimId @unique`. The service layer enforces one claim per case for now; relaxing
  it later is a service-layer change only, no migration.
- **D6 — LOU is its own small model** (`LetterOfUndertaking`), linked to member + provider +
  optional case; issued by TPA, has amount ceiling, validity, document. It is *not* a PA subtype.
- **D7 — Service tier = enum on `ServiceCategory`.** New `ServiceTier` enum:
  `HEADLINE | LABORATORY | IMAGING | PHARMACY | THEATRE | PROFESSIONAL_FEES | OTHER`.
  Top-level seeded categories carry the tier; children inherit at read time. Contract UI groups
  tariff lines by tier via `ProviderTariff.serviceCategoryId`.
- **D8 — Funding model on benefits:** enum `FundingModelType { FEE_FOR_SERVICE, CAPITATION, HYBRID }`
  on `BenefitConfig` (default FFS) + optional JSON `fundingOverrides` for per-service-tier
  exceptions under HYBRID. Adjudication routes CAPITATION-funded lines to the capitation pool
  path (no per-line payable) instead of FFS pricing.
- **D9 — Do not paginate by loading everything then slicing in JSX.** Queue/list endpoints get
  `take`/`cursor` params; lanes fetch a capped page (e.g. 50) + total count, with per-lane
  scrolling and "load more".

---

## §3. Work packages

### Workstream A — Claims queue & list UX (issues 1–3)

#### WP-A1 — Queue data layer: SLA class, facility grouping, pagination `[S]`
**Depends on:** nothing.
**Read:** `src/server/services/claims.service.ts:1-100`, `src/app/(admin)/claims/queues/page.tsx`,
`prisma/schema.prisma:2035-2080` (ClaimStatus/ServiceType only).
**Build:**
1. New pure helper `src/lib/claims-sla.ts` (contract-first per D2):
   `slaFor({ serviceType, contractTerms? })` where `contractTerms` is
   `{ paymentTermDays, paymentTermType } | null` → `{ class: "CONTRACT" | "OP_24H" | "IP_WEEKLY",
   payWithinHours, hardCeilingHours, label }` — contract terms win when present (convert
   `BUSINESS` days ≈ ×1.4 calendar or count weekdays properly; pick one, document it); serviceType
   defaults otherwise. Plus `slaState(receivedAt, …)` → `{ ageHours, dueInHours, breached,
   critical }`. Unit-test it (`tests/` — follow an existing vitest file's conventions), including
   the contract-override and BUSINESS-days cases.
2. Extend `getActiveQueues` to also select `providerId`, `serviceType`, `dateOfService`, and
   `contract: { select: { paymentTermDays: true, paymentTermType: true } }` (claims already carry
   `contractId`), and accept `{ take?, providerId? }`. Add a companion
   `getQueueFacilitySummary(tenantId, clientId?)` returning per-provider counts + breached counts
   (a `groupBy` on providerId/status).
3. No UI changes in this WP.
**Accept:** helper unit tests pass; service returns facility summary; `tsc` clean.

#### WP-A2 — Claims Queues page: facility-first grouping + self-scrolling lanes `[M]`
**Depends on:** WP-A1.
**Read:** `src/app/(admin)/claims/queues/page.tsx`, `src/app/(admin)/claims/queues/QueueAlerts.tsx`,
WP-A1's helper, one existing client component for styling reference.
**Build:**
1. Restructure the page: **Facility accordion/sections first** (from `getQueueFacilitySummary`),
   ordered by most-breached-first. Expanding a facility shows its status lanes.
2. Within a facility, split lanes (or badge cards) by **SLA class**: an "Outpatient — pay in 24 h"
   band above "Inpatient — weekly cycle". Urgent (breached/critical per `slaState`) sort to top.
3. Every lane body becomes a self-contained scroll container:
   `max-h-[60vh] overflow-y-auto overscroll-contain` (pick one height token and reuse), with
   sticky lane headers. The page itself must no longer grow with claim count.
4. Cap initial claims per lane (50) with a "Load more" (server action or lightweight client fetch).
5. Keep `QueueAlerts` working (it takes the RECEIVED count).
**Accept:** with 500+ active claims the page height is bounded; each lane scrolls independently;
claims never mix facilities within a section; OP cards show a 24 h countdown, IP show weekly cycle;
breached items float to top.

#### WP-A3 — All-claims list page: bounded, filterable, facility-grouped option `[S]`
**Depends on:** WP-A1 (helper only).
**Read:** `src/app/(admin)/claims/page.tsx`, `src/server/services/claims.service.ts:46-70`.
**Build:**
1. Add `take`/`cursor` pagination to `getClaims` + a count query for the summary cards (do the
   counts with `groupBy`, not by loading all rows).
2. Table gets: sticky header, container `max-h` + `overflow-y-auto` (self-contained scrolling),
   server-side pagination controls, and filters for **facility (provider)**, status, serviceType.
3. Add an SLA/urgency column using `claims-sla.ts`.
**Accept:** page loads only one page of claims; summary card numbers still correct (from counts,
not the loaded page); filtering by facility works; `tsc` clean.

---

### Workstream B — Offline work authorization codes (issue 4)

#### WP-B1 — Schema: `OfflineWorkAuthorization` + pack models `[S]`
**Depends on:** nothing.
**Read:** `prisma/schema.prisma:1674-1739` (SyncOperation/OfflineReservation/EligibilitySnapshot),
`:2050-2062` (ClaimSource), and one existing model with maker/checker fields for convention.
**Build:** add to `prisma/schema.prisma` (+ migration):
```prisma
enum OfflineAuthStatus { ACTIVE  EXPIRED  REVOKED  EXHAUSTED }

model OfflineWorkAuthorization {
  id           String   @id @default(cuid())
  tenantId     String   // + tenant relation
  providerId   String   // facility the code is issued to (+ relation)
  branchId     String?  // optional ProviderBranch scope
  code         String   // short human-readable, e.g. OWA-7F3K2M (store hashed if trivial)
  issuedById   String   // claims agent User (+ relation)
  reason       String?  // e.g. "fibre cut at facility", captured on the call
  contactName  String?  // who called from the facility
  contactPhone String?
  validFrom    DateTime @default(now())
  validUntil   DateTime // time-boxed, e.g. 24-72h
  maxOperations Int?    // optional cap on ops synced under this code
  status       OfflineAuthStatus @default(ACTIVE)
  revokedById  String?
  revokedAt    DateTime?
  packId       String?  // last OfflineDataPack served under this authorization
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([tenantId, code])
  @@index([tenantId, providerId, status])
}

model OfflineDataPack {
  id          String   @id @default(cuid())
  tenantId    String
  providerId  String
  generatedAt DateTime @default(now())
  validUntil  DateTime
  memberCount Int
  tariffRef   String?   // contract/version pinned into the pack
  // Encrypted-at-rest per D3 — never store the pack as plaintext JSON.
  ciphertext  Bytes     // AES-256-GCM(roster + balances + tariff excerpt — see WP-B3)
  iv          Bytes
  authTag     Bytes
  keyVersion  Int       @default(1) // server-secret rotation
  sizeBytes   Int?
  @@index([tenantId, providerId, generatedAt])
}
```
Also: add `offlineAuthId String?` to `SyncOperation` (+ index) so synced ops are traceable to a code.
**Accept:** migration applies cleanly to a fresh dev DB; `prisma generate` + `tsc` clean.

#### WP-B2 — Issuance workflow: service + agent UI `[M]`
**Depends on:** WP-B1.
**Read:** WP-B1 models, `src/lib/rbac.ts` (roles), `src/app/(admin)/offline-capture/page.tsx` +
`actions.ts` for server-action conventions, `src/server/services/notification.service.ts` (skim
exported API only) for SMS sending.
**Build:**
1. `src/server/services/offline-auth.service.ts`: `issueCode()` (generates unambiguous 6-8 char
   code, default 48 h validity, audit-logs via existing ActivityLog pattern), `verifyCode()`,
   `revokeCode()`, `listActive()`. Expiry enforced at verify time (+ a sweep in WP-B4).
2. Admin UI: new page `src/app/(admin)/offline-auth/page.tsx` — "Offline Work Codes": issue form
   (facility picker, contact, reason, validity), active-codes table with revoke, history. Nav
   entry under Clinical (`AdminSidebar.tsx`) next to "Offline Capture".
3. Delivery is off-system (TPA-confirmed): the agent reads the code out over the phone and/or
   sends it by SMS. UI must show the code large and unambiguous for phone read-out, with an
   optional "Send by SMS" button to the captured contact phone (reuse notification service; if its
   API doesn't fit in context, leave a `// TODO(WP-B5)` hook and surface code on screen only).
   No in-app/email delivery paths.
**Accept:** agent (OPS role) can issue, see, revoke codes; codes visibly expire; every action
audit-logged.

#### WP-B3 — Facility offline data pack generation `[M]`
**Depends on:** WP-B1.
**Read:** `prisma/schema.prisma:1723-1739` (EligibilitySnapshot), `src/server/jobs/` (pick one
existing BullMQ job as template), `src/server/services/providers.service.ts` (skim exports),
`ProviderTariff` fields at `schema.prisma:2653-2700` (stop at the index block).
**Build:**
1. `src/server/services/offline-pack.service.ts` — `generatePack(tenantId, providerId)`. Contents
   follow **data minimisation** (D3 — the minimum the facility needs to run its day):
   - roster: active members eligible at that provider — memberNumber, name, active status ONLY
     (no contact details, no clinical history, photo ref optional),
   - balances: per-member benefit remaining (reuse whatever eligibility/balance helper claims
     adjudication already uses — search for `benefitRemaining` usage rather than reimplementing),
   - tariff excerpt: active `ProviderTariff` lines for the provider (code, name, rate, requiresPreauth),
   - writes an `OfflineDataPack` row and per-member `EligibilitySnapshot` rows.
2. **Encryption (D3, TPA-required):** the pack is stored and served as an AES-256-GCM envelope,
   never plaintext — WP-B1's model already defines `ciphertext`/`iv`/`authTag`/`keyVersion`.
   The decryption key is derived (HKDF) from the work code + a server-side secret and is delivered
   separately from the pack file; the client decrypts in the browser (WebCrypto) at capture time.
   A stolen pack file alone must be useless.
3. BullMQ scheduled job (follow existing job registration pattern) to regenerate packs **daily**
   for providers with an ACTIVE `OfflineWorkAuthorization`, and on-demand on code issuance.
4. Endpoint/server action: given a valid code, download the current (encrypted) pack — this is
   what the facility fetches while it still has connectivity, or the agent exports for them.
**Accept:** issuing a code produces a pack; decrypted pack contains roster/balances/tariff
sections with no fields beyond the minimised list; payload at rest is ciphertext (verify in DB);
wrong code cannot decrypt; daily job registered; pack download gated by `verifyCode()`.

#### WP-B4 — Gate offline capture + sync on the code `[S]`
**Depends on:** WP-B2, WP-B3.
**Read:** `src/app/(admin)/offline-capture/CaptureClient.tsx` + `actions.ts`,
`src/lib/offline/outbox.ts`, `src/server/services/sync.service.ts:25-110`.
**Build:**
1. Offline Capture page asks for a work code before enabling capture; stores it in the outbox
   entries; loads the pack (roster/tariffs) into IndexedDB for offline member/tariff lookup.
2. `SyncService.ingest` accepts `offlineAuthCode`, resolves → `offlineAuthId` on each
   `SyncOperation`; invalid/expired code ⇒ ops land as `CONFLICT` with reason `INVALID_OFFLINE_AUTH`
   (never dropped). Enforce `maxOperations`/`EXHAUSTED`.
3. Sweep: mark expired codes `EXPIRED` (piggyback on the WP-B3 daily job).
**Accept:** capture without a valid code is blocked client-side AND server-side; synced claims
carry `offlineAuthId`; expired-code sync produces reviewable conflicts.

---

### Workstream C — Pre-auth attaches to claim (issue 5)

#### WP-C1 — Schema: many-PAs-per-claim `[S]`
**Depends on:** nothing. **Blocks:** C2, C3, D4.
**Read:** `prisma/schema.prisma:2070-2207` (Claim), `:2358-2444` (PreAuthorization).
**Build:**
1. On `Claim`: remove `preauthId @unique` + `preauth` relation. Keep a back-relation
   `preauths PreAuthorization[]`.
2. On `PreAuthorization`: keep `claimId String?` (now the attachment FK, indexed, NOT unique),
   rename `convertedAt` → keep for history but add `attachedAt DateTime?`. Add enum values
   `ATTACHED`, `UTILISED` to `PreauthStatus` (keep `CONVERTED_TO_CLAIM` — historical rows exist).
3. Migration must **backfill**: every claim with old `preauthId` → set that PA's `claimId`
   (most already have it) and `attachedAt = convertedAt`. Write the data migration in SQL inside
   the migration file.
4. Grep for `preauthId` across `src/` and list every usage in the WP hand-off notes — do NOT fix
   call sites here beyond making `tsc` pass with minimal mechanical edits (that's C2). If a call
   site needs behavioural change, mark `// TODO(WP-C2)`.
**Accept:** migration + backfill clean on dev DB; `tsc` passes; hand-off note lists all touched/
TODO call sites.

#### WP-C2 — Attach workflow: service + adjudication gate `[M]`
**Depends on:** WP-C1.
**Read:** `src/server/services/claims.service.ts:140-200` (PA check during capture) and `:670-720`
(convert), `src/server/services/claim-adjudication.service.ts` (skim gate structure — search for
where PA is validated), `prisma/schema.prisma:3369-3400` (PreauthRule).
**Build:**
1. `ClaimsService.attachPreauth(tenantId, claimId, preauthId)` / `detachPreauth`: validates same
   member + provider (branch-tolerant), PA `APPROVED` and in validity window, not attached
   elsewhere; sets `ATTACHED`. On claim decision, attached PAs → `UTILISED`.
2. Rework `convertPreAuthToClaim` → `createClaimWithPreauth`: creates a **normal** claim shell
   and attaches the PA (per D4). Keep the old export as a thin deprecated alias.
3. Adjudication gate: for each claim line that a contract `PreauthRule` (or
   `ProviderTariff.requiresPreauth`) flags as PA-required, require ≥1 attached approved PA whose
   procedures/estimated components cover that line; PA-required lines without cover → route to
   manual review with a named reason (follow the existing `assignedQueue`/reason-code pattern).
   BAU lines on the same claim flow through normal FFS pricing untouched.
4. Cap check: warn (not block) when claim's PA-covered portion exceeds PA `approvedAmount`.
**Accept:** a claim can hold 2 PAs + BAU lines and adjudicate; PA-required line without attached
PA routes to review; unit tests for attach validation matrix (wrong member/provider/status/window).

#### WP-C3 — UI: attach pre-auth on claim screens; retire "Convert" `[M]`
**Depends on:** WP-C2.
**Read:** `src/app/(admin)/claims/[id]/page.tsx` (and its actions), `src/app/(admin)/claims/new/`
(capture form), `src/app/(admin)/preauth/[id]/page.tsx` + `actions.ts`.
**Build:**
1. Claim detail: "Pre-authorizations" panel — list attached PAs (number, status, approved amount,
   validity), attach-picker (searches member's approved unattached PAs), detach.
2. Claim capture (new claim): same attach-picker inline; pre-select if navigated from a PA.
3. Pre-auth detail: replace "Convert to Claim" button with "Attach to claim…" (picker of member's
   open claims) + "Create claim with this PA" (calls `createClaimWithPreauth`).
4. Member profile tabs (`src/components/members/MemberProfileTabs.tsx`) — update any convert
   language found by grep `CONVERTED_TO_CLAIM|convertToClaim|convertPreauth`.
**Accept:** full attach/detach round-trip in the UI; no user-facing "convert" wording remains
(grep proves it); preauth list shows ATTACHED/UTILISED states with distinct badges.

---

### Workstream D — Case management (issue 6)

#### WP-D1 — Schema: `ClinicalCase`, `CaseServiceEntry`, `LetterOfUndertaking` `[M]`
**Depends on:** WP-C1 (PA attachment shape). **Blocks:** D2–D5.
**Read:** `prisma/schema.prisma:2070-2207` (Claim), `:2358-2444` (PreAuthorization), `:876-958`
(Member — relation conventions only, skim), `:2292-2341` (ClaimLine).
**Build (+ migration):**
```prisma
enum CaseStatus { OPEN  PENDING_CLOSURE  CLOSED_FILED  CANCELLED }
enum CaseType   { INPATIENT_ADMISSION  OUTPATIENT_EPISODE  MATERNITY  DAY_CASE  CHRONIC_CYCLE }

model ClinicalCase {
  id, tenantId, caseNumber (e.g. CASE-2026-00001, @@unique([tenantId, caseNumber]))
  memberId, providerId, providerBranchId?
  caseType CaseType; status CaseStatus @default(OPEN)
  admissionDate DateTime?; expectedDischargeDate DateTime?; dischargeDate DateTime?
  primaryDiagnoses Json?      // same shape as Claim.diagnoses
  attendingDoctor String?
  benefitCategory BenefitCategory
  estimatedCost Decimal? ; accruedAmount Decimal @default(0) @db.Decimal(14,2)
  openedById; closedById?; closedAt?
  // NO claimId here — the FK lives on Claim (D5): add `caseId String?` (+ relation,
  // index, NOT unique) to the Claim model. One-claim-per-case is enforced in the
  // service layer today; one-case-many-claims (pregnancy + newborn) stays open later.
  // relations: claims Claim[], serviceEntries[], preauths[] (add caseId? to
  //            PreAuthorization), lous[], documents[], activityLogs[]
}

model CaseServiceEntry {
  id, caseId, entryDate DateTime, category ClaimLineCategory
  serviceCode String?; description String; quantity Int @default(1)
  unitAmount Decimal @db.Decimal(14,2); totalAmount Decimal @db.Decimal(14,2)
  source String  // MANUAL | HMS_BATCH
  enteredById String?; hmsBatchRef String?
  voided Boolean @default(false); voidReason String?   // never delete
  @@index([caseId, entryDate])
}

model LetterOfUndertaking {
  id, tenantId, louNumber (@@unique([tenantId, louNumber]))
  memberId, providerId, caseId?
  amountCeiling Decimal @db.Decimal(14,2); currency String @default("UGX")
  issuedById, issuedAt, validFrom, validUntil
  status String  // DRAFT | ISSUED | EXHAUSTED | CANCELLED | UTILISED
  notes String?; documentId String?
}
```
Also add `caseId String?` (+ relation, index) to `PreAuthorization` and `Document`.
**Accept:** migration clean; relations navigable both ways; `tsc` clean.

#### WP-D2 — Case service layer `[M]`
**Depends on:** WP-D1.
**Read:** WP-D1 models, `src/server/services/claims.service.ts:100-160` (claim-number generation +
create pattern), `src/server/services/member-numbering.service.ts` (skim numbering pattern).
**Build:** `src/server/services/case.service.ts`:
- `openCase()` (validates member eligibility + provider; numbering `CASE-YYYY-NNNNN`),
- `addServiceEntry()` / `voidServiceEntry()` (recompute `accruedAmount`),
- `attachPreauth()` / `attachLou()` (delegates to WP-C2 attach semantics; PA/LOU must match
  member+provider),
- `closeAndFile()`: assembles **one Claim** — serviceType from caseType, admission/discharge dates,
  diagnoses from case, one `ClaimLine` per non-voided `CaseServiceEntry` (map `category`),
  `billedAmount = accruedAmount`, source `MANUAL`, `claim.caseId = case.id`, re-points case PAs to
  the claim (`claimId`), sets case `CLOSED_FILED`. Reject if the case already has a claim (the
  one-claim-per-case rule lives here, per D5). Wrap in a transaction.
- `listOpenCases()` with facility grouping (mirror WP-A1 summary shape).
LOU issuance: `lou.service.ts` with `issue/cancel` + numbering `LOU-YYYY-NNNNN`.
**Accept:** unit test: open case → 3 service entries (1 voided) → attach approved PA → close ⇒
one claim with 2 lines, correct billed total, PA attached to claim, case immutable afterwards
(service entry writes rejected on closed case).

#### WP-D3 — Case management UI + sub-menu `[L]` *(split into D3a list/detail, D3b entry forms if the agent judges it too big)*
**Depends on:** WP-D2.
**Read:** `src/components/layouts/AdminSidebar.tsx:46-99` (sub-menu pattern),
`src/app/(admin)/claims/queues/page.tsx` (post-WP-A2 version, as layout reference),
`src/app/(admin)/preauth/[id]/page.tsx` (detail-page conventions).
**Build:**
1. Sidebar: convert the Clinical "Claims" area into a **Case Management** child menu:
   `Claims` → children: `All Claims`, `Claims Queues`, `Open Cases`, `Pre-Authorizations`,
   `Letters of Undertaking`, `Offline Capture`, `Offline Work Codes`. (Adjust labels only —
   routes stay.)
2. `/cases` — Open Cases board grouped by facility (reuse WP-A2 layout patterns: self-scrolling
   sections, ordered by admission age; badge for accrued amount + LOS).
3. `/cases/[id]` — case detail: header (member, facility, LOS ticker, accrued), tabs/panels:
   Service Entries (add/void form — date, category, code, qty, amounts), Pre-auths (attach),
   LOUs (issue/attach), Documents, Activity. `Close & File Claim` action with confirmation
   summary → routes to created claim.
4. `/lou` — simple LOU register (issue form + table).
**Accept:** clinical officer can run an inpatient stay end-to-end in the UI: open → log daily
services → attach PA + LOU → close → lands on the filed claim. All lists self-scroll (issue 1
compliance).

#### WP-D4 — HMS daily batch ingestion (stub-first) `[M]`
**Depends on:** WP-D2.
**Read:** `src/server/services/integrations/` (list files, read the closest EDI/batch example),
`src/server/jobs/` (one job as template), `SyncService.ingest` signature.
**Build:**
1. Define a versioned JSON batch format: `{ facilityCode, batchRef, entries: [{ caseNumber |
   memberNumber+admissionDate, entryDate, serviceCode, description, qty, unitAmount }] }`.
2. `hms-batch.service.ts`: validate + idempotent apply (batchRef + line hash as op key) →
   `CaseServiceEntry(source: HMS_BATCH)`; unmatched entries → exception queue (reuse
   `ExceptionLog` pattern — grep `ExceptionLog` usage in claims service first).
3. Ingest via: authenticated API route under `src/app/api/v1/` (follow existing v1 route
   conventions) + manual file-upload action on the case board for facilities emailing CSV/JSON.
4. Daily BullMQ job slot that polls configured HMS endpoints (`IntegrationConfig` model exists —
   grep it) — implement the scheduler + a no-op connector interface; real connectors are future.
**Accept:** posting a valid batch twice creates entries once; unmatched lines visible in
exceptions; case `accruedAmount` updates.

---

### Workstream E — Contract service tiers & capitation visibility (issues 7–8)

#### WP-E1 — Schema: `ServiceTier` on taxonomy `[XS]`
**Depends on:** nothing. **Blocks:** E2–E4.
**Read:** `prisma/schema.prisma:2730-2790` (ServiceCategory + Alias).
**Build:** add `enum ServiceTier { HEADLINE LABORATORY IMAGING PHARMACY THEATRE PROFESSIONAL_FEES OTHER }`
and `tier ServiceTier?` on `ServiceCategory` (+ index `[tenantId, tier]`). Migration.
**Accept:** migration + `tsc` clean.

#### WP-E2 — Seed canonical taxonomy from the Masters `[M]`
**Depends on:** WP-E1.
**Read:** `contract-mds/Masters/Last & Final Service & Procedures Master.md` (skim category
column values only — the file is big; sample, don't read fully), same for `Master Lab.md`,
`Master Radiology.md`; `scripts/seed-reason-codes.ts` (seeding conventions);
`prisma/seeds/` folder.
**Build:**
1. `scripts/seed-service-taxonomy.ts` (idempotent — upsert by `[tenantId, code]`):
   - **HEADLINE:** OP consultation (GP), specialist consultation OP, IP review, nursing/ward per
     day, ICU/HDU per day, casualty/ER fee — the "most common services" from the Specialty Master
     and FFS letters.
   - **LABORATORY:** parent LAB + children per discipline (BIOCHEMISTRY, MICROBIOLOGY, IMMUNOLOGY,
     SEROLOGY, HAEMATOLOGY, HISTOLOGY, CYTOLOGY, MOLECULAR, BLOOD_TRANSFUSION…).
   - **IMAGING:** parent + XRAY, ULTRASOUND, CT, MRI, MAMMOGRAPHY, FLUOROSCOPY…
   - **PHARMACY:** parent + DRUGS, CONSUMABLES (the Inventory Master's split).
   - **THEATRE:** theatre fees by time band (Sheet2 of the Services Master), OT equipment.
   - **PROFESSIONAL_FEES:** surgeon/anaesthetist/doctor fees (Doctors' Masters).
   - **OTHER:** dental, optical, physio, ambulance (per-KM bands), dialysis, maternity/package,
     last office, Mo minor procedures…
   Each with `patientClass` where the Masters give OP/IP/OT, `tier` per WP-E1.
2. Seed `ServiceCategoryAlias` rows for the messy raw labels observed (e.g. "Mo Pocedures",
   "MO MINOR PROCEDURE", "Ophalmology Surgery", duplicate case variants) → canonical categories.
3. Wire into `prisma/seed.ts` chain if one exists for the dev tenant (check how
   `seed-reason-codes.ts` is invoked first).
**Accept:** running the script twice yields no duplicates; ≥40 categories with tiers; alias
lookup resolves at least the known-messy labels above.

#### WP-E3 — Contract detail: tier-grouped fee schedule UI `[M]`
**Depends on:** WP-E1 (E2 strongly recommended first).
**Read:** `src/app/(admin)/contracts/[id]/page.tsx` (all 336 lines),
`src/server/services/provider-contracts.service.ts` (skim exports; find how tariffs are fetched),
`ProviderTariff` fields `schema.prisma:2653-2700`.
**Build:**
1. Service to fetch a contract's tariff lines grouped by `serviceCategory.tier` (fallback bucket
   `OTHER` for unmapped lines; count of unmapped shown as a data-quality chip).
2. Contract detail page: new **Fee Schedule** section with a tier tab bar
   (Headline / Labs / Imaging / Pharmacy / Theatre / Professional fees / Other). Each tab = table
   (service, code, rate type, agreed rate/discount, UoM, PA-required flag), **self-scrolling
   container** (issue-1 pattern from WP-A2), searchable within tab.
3. Headline tab pinned first — this is what the TPA looks at most.
**Accept:** for a contract with seeded tariffs each tier tab renders correct lines; unmapped-lines
chip counts correctly; page height bounded regardless of tariff count.

#### WP-E4 — Capitation setup on contracts (packages + amount) `[M]`
**Depends on:** WP-E3.
**Read:** `prisma/schema.prisma:3238-3352` (PricingRule + ContractPackage), `:2827-2836`
(ContractType), the contract page from WP-E3, `src/app/(admin)/contracts/[id]/ManagePanel.tsx` +
`manage-actions.ts` (existing contract-edit conventions).
**Build** *(TPA-confirmed 2026-07-03: contract setup must allow capitation — package lists +
capitation amount. Deep capitation work — pool accounting, PMPM invoicing, settlement — comes
later; this WP is setup + display only)*:
1. **Setup (CRUD):** on the contract manage panel, a "Capitation" section to
   - create/edit a `PricingRule` of kind `CAPITATION` with validated `params`
     (`{ amount, currency, per: "MEMBER_PER_MONTH" | "MEMBER_PER_YEAR", carveOutCodes?: [] }`),
   - create/edit `ContractPackage` rows as the **package list** covered by the capitation
     (name, code, components via `PackageComponent`, optional per-package price for carve-outs),
   - server actions follow `manage-actions.ts` conventions (tenant-scoped, audit-logged,
     validation in service layer — extend `provider-contracts.service.ts`).
2. **Display:** when the contract has `PricingRule` rows of kind
   `CAPITATION`/`PER_VISIT_CASE_RATE`/`AVERAGE_COST_POOL` **or** type `CASE_RATE_AGREEMENT`,
   render a **Capitation & Case-Rate Packages** panel: capitation amount + period, each
   `ContractPackage` with its components, carve-outs.
3. Badge in the contract header: `FFS`, `CAPITATION`, or `MIXED` (derived: has FFS tariff lines /
   has capitation rules / both).
**Accept:** a user can set up a capitation contract end-to-end (amount + package list) from the
UI (modelled after `contract-mds/FFS RATES/JUBILEE CAPITATION.md`); the panel renders it; FFS-only
contracts show no empty capitation panel; invalid `params` rejected server-side.

---

### Workstream F — Benefit-package funding model (issue 8b)

#### WP-F1 — Schema + package builder UI `[S]`
**Depends on:** WP-E1 (tier enum reused in overrides).
**Read:** `prisma/schema.prisma:1805-1852` (BenefitCategory/BenefitConfig),
`src/app/(admin)/packages/builder/` (list files, read the benefit-config form component only).
**Build:**
1. Schema: `enum FundingModelType { FEE_FOR_SERVICE CAPITATION HYBRID }`;
   on `BenefitConfig`: `fundingModel FundingModelType @default(FEE_FOR_SERVICE)` +
   `fundingOverrides Json?` (shape: `[{ tier: ServiceTier, model: FundingModelType }]`, validated
   in service layer). Migration.
2. Package builder UI: funding-model selector per benefit line; when HYBRID, per-tier override
   editor (tiers from WP-E1).
3. Surface the funding model read-only on package detail + member benefits screens (grep where
   `BenefitConfig` fields are displayed; touch the two most prominent spots only).
**Accept:** builder round-trips the field; HYBRID overrides validate (unknown tier rejected);
existing packages default to FFS with no behaviour change.

#### WP-F2 — Adjudication respects funding model `[M]`
**Depends on:** WP-F1, WP-E1.
**Read:** `src/server/services/claim-adjudication.service.ts` (find the pricing entry point —
search `contractedRate` / `PricingRule`), `src/server/services/contract-engine/engine.ts` (skim
top-of-file docs + exported functions only).
**Build:**
1. At line pricing: resolve the claim line's benefit → `fundingModel` (+ tier override via the
   line's `serviceCategory.tier`).
2. `CAPITATION`-funded lines: skip FFS pricing; mark line decision per existing capitation/
   average-cost-pool path if present (grep `avgCostPoolId` / `AVERAGE_COST_POOL` handling), else
   set payable 0 with reason code `COVERED_BY_CAPITATION` (add to `AdjudicationReasonCode` seed)
   and tag the claim's `avgCostPoolId`/pool reference for reconciliation reporting.
3. `HYBRID`: per-tier split — capitated tiers to the pool path, others FFS.
4. Tests: one claim with lab (capitated) + pharmacy (FFS) lines under a HYBRID benefit prices
   only the pharmacy line.
**Accept:** test above passes; FFS-only tenants see zero behaviour change (default path
regression-tested by running the existing adjudication test suite).

---

## §4. Suggested execution order

| Phase | WPs (parallel-safe groups) |
|-------|---------------------------|
| 1 | WP-A1 · WP-C1 · WP-E1 · WP-B1 |
| 2 | WP-A2 · WP-A3 · WP-C2 · WP-E2 · WP-B2 · WP-B3 · WP-D1 (after C1) · WP-F1 (after E1) |
| 3 | WP-C3 · WP-D2 · WP-E3 · WP-B4 · WP-F2 |
| 4 | WP-D3 · WP-D4 · WP-E4 |

Rough total: ~2 XS/S schema WPs + 7 S + 9 M + 1 L.

---

## §5. Resolved decisions (TPA answers, 2026-07-03) — no open blockers

1. **(WP-A1) Inpatient cadence is set on the contract.** SLA helper is contract-first
   (`ProviderContract.paymentTermDays`/`paymentTermType`), serviceType defaults as fallback.
   Folded into D2 and WP-A1.
2. **(WP-B2) Code delivery is phone and/or SMS** — deliberately off-system communication between
   facility and TPA. The system records issuance and shows the code; optional SMS send. No in-app
   or email delivery. Folded into D3 and WP-B2.
3. **(WP-B3) Offline pack = minimum data for day-to-day operation, strongly encrypted.**
   Data-minimised contents (no contact details, no clinical history) + AES-256-GCM envelope with
   the key delivered separately from the pack. Folded into D3, WP-B1 (model), WP-B3.
4. **(WP-D1) One case → one claim is the working rule, but do NOT close off one-case-many-claims**
   (e.g. pregnancy + newborn). FK moved to `Claim.caseId` (not unique); the one-claim rule is
   service-layer only, so relaxing it later needs no migration. Folded into D5, WP-D1, WP-D2.
5. **(WP-E2) Seed as appropriate from the current Masters.** More data will arrive — the seed
   script is idempotent (upsert by `[tenantId, code]`) so re-running with new Masters is safe.
6. **(WP-E4/F2) Capitation: contract setup must allow it now** — package lists + capitation
   amount editable on the contract (WP-E4 upgraded to setup CRUD). Deeper capitation work (pool
   accounting, PMPM invoicing, settlement) is a confirmed **later** workstream; WP-F2 only routes
   capitated lines away from FFS pricing and tags them for reconciliation.

---

## §6. Cross-cutting acceptance (regression guard, run after each phase)

- `npx tsc --noEmit` and `npx vitest run` green.
- `/claims`, `/claims/queues`, `/preauth`, `/contracts/[id]` load with seeded data; no page grows
  unboundedly with row count (issue 1 is a **global** UI rule from now on: any new list ⇒
  self-contained scroll container + pagination).
- Grep guards: no new `KES`/hard-coded SLA hours in JSX; no user-facing "Convert to Claim".
- Every new mutation is audit-logged and tenant-scoped.
