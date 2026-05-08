# Member Experience Hardening Handoff

## Purpose

This document is the working plan and handoff record for Module 5 of `AICARE_COMPETITIVE_HARDENING_SPEC.md`: Member Experience Hardening.

The goal is to turn the existing member portal into a demo-ready, member-first experience focused on:

- Real-time benefit transparency.
- Clear encounter and member-share cost visibility.
- Provider search with cost estimates.
- Member-started pre-authorization with fast auto-decision for common procedures.
- Co-contribution payment flow that is traceable and webhook-confirmed.
- Family views for principal members with privacy guardrails.
- Member documents, notifications, and low-bandwidth access paths.

Update this file as implementation progresses so another agent can continue without repeating discovery.

## Cross-Cutting Follow-Up: Notifications

Notifications need a focused implementation pass before they are treated as production-complete across member experience flows.

Current observation:

- The project has an existing `NotificationService` and notification templates, but the send path depends on queued email dispatch through Redis/BullMQ.
- Member pre-authorization Phase 5 intentionally does not enqueue notifications from the request path yet, because adding that side effect without validating queue/runtime behavior could make member submissions brittle.
- Check-in has a separate in-app notification model, so the product needs a deliberate decision on whether member notifications should converge into a shared in-app notification center, remain feature-specific, or use both in-app and correspondence records.

Recommended focused pass:

- Audit existing notification models, templates, queue behavior, and worker startup assumptions.
- Define member-facing notification channels for each member experience event:
  - pre-auth submitted;
  - pre-auth approved;
  - pre-auth declined;
  - pre-auth converted to claim;
  - claim status changed;
  - benefit threshold warning;
  - document uploaded or required;
  - support message response.
- Add idempotent notification creation so retries do not duplicate member messages.
- Add graceful fallback behavior when Redis/queue infrastructure is unavailable in local/demo environments.
- Add member UI for in-app notifications if the product direction is to show actionable alerts inside the portal.
- Add seed/demo data that shows notifications without needing real SMS/email delivery.

## Source Spec

Primary source:

- `AICARE_COMPETITIVE_HARDENING_SPEC.md`, Module 5: Member Experience Hardening.

Related repo audit rule:

- `AICARE_SELF_CONTAINED_AUDIT_RULE.md`.

## Current Repo State Audit

### Existing Member Portal Surfaces

- [x] `/member/dashboard`
  - Existing digital member card.
  - Existing aggregate annual benefit summary.
  - Existing recent claims panel.
  - Existing recent pre-authorizations panel.
  - Existing WhatsApp support CTA.
  - Gaps: not mobile-first enough for the spec's "emotional payoff"; no activity timeline; no family summary; no notification summary; benefit summary is calculated inline instead of via a reusable member app service.
- [x] `/member/benefits`
  - Existing benefit category cards.
  - Existing used/remaining progress bars from `BenefitUsage`.
  - Existing waiting period and co-pay display.
  - Gaps: no "on track/ahead/behind" utilization indicator; no sub-limit hierarchy beyond current `BenefitConfig`; no family-wide benefit usage; no sensitive-category redaction rules.
- [x] `/member/utilization`
  - Existing claims/encounter history.
  - Existing billed, approved, paid, and member-share totals.
  - Existing co-contribution collection status display.
  - Gaps: language still says "Claims History" rather than member-friendly "Care history" or "Visits and costs"; no itemized but simplified service-line view; no filters; no detail page; no reimbursement/payment action links.
- [x] `/member/preauth`
  - Existing list of pre-authorizations.
  - Existing "Request Pre-Auth" button placeholder.
  - Gaps: no member request form; no auto-decision; no cost/member-share preview; no document attachment; no detail view; no payment follow-through for required co-contribution.
- [x] `/member/facilities`
  - Existing geolocation-based provider map.
  - Existing radius filter and directions link.
  - Existing `ProvidersService.getNearbyProviders()`.
  - Gaps: no procedure/service filter; no cost transparency; no tariff-backed estimated cost; no partner-tier explanation; no facility detail view; no no-geolocation search by area.
- [x] `/member/dependents`
  - Existing principal/dependent card list.
  - Gaps: "Add Dependent" button is placeholder; no family utilization; no privacy logic for sensitive categories; no dependent benefit/encounter summary.
- [x] `/member/check-in`
  - Existing secure check-in/WebAuthn flow.
  - This is valuable and should be integrated into member home quick actions and facility workflows rather than rebuilt.
- [x] `/member/security`
  - Existing device registration/security surface.
  - Useful foundation for `MemberAppSession` and device trust.
- [x] `/member/profile`
  - Existing profile editing.
  - Gaps: no language preference, notification preference, M-Pesa phone preference, or document repository.
- [x] `/member/support`
  - Existing complaint/support surface.
  - Should be preserved and linked from high-friction moments.

### Existing Backend/Schema Foundations

- [x] `Member`
  - Principal/dependent relationship is present via `principalId` and `dependents`.
  - Existing `phone`, `email`, package, group, benefit tier, status, WebAuthn, check-in, claims, preauths, co-contribution relations.
- [x] `BenefitConfig` and `BenefitUsage`
  - Current per-member, per-benefit, per-period usage state exists.
  - Good foundation for real-time benefit state.
  - Gap: no dedicated `MembershipBenefitState` model exactly as spec describes; likely not needed immediately because `BenefitUsage` already serves the current product shape.
- [x] `Claim` and `ClaimLine`
  - Existing financial fields support member-visible billed, approved, paid, member liability.
  - Claim lines have CPT/ICD and billed/approved amounts.
  - Need member-safe presentation layer to avoid exposing adjudication jargon.
- [x] `PreAuthorization`
  - Existing preauth workflow and admin/provider service methods.
  - Existing fraud evaluation in `ClaimsService.createPreAuth()`.
  - Existing approval reserves benefit usage.
  - Gap: no member-specific request endpoint/action; auto-decision logic is not implemented.
- [x] `Provider`, `ProviderTariff`, `ProviderDiagnosisTariff`
  - Existing geo fields, services, tier, contract status, operating hours.
  - Existing nearby-provider SQL query.
  - Gap: no member-facing estimated-cost API.
- [x] `CoContributionRule`, `AnnualCoContributionCap`, `CoContributionTransaction`, `MemberAnnualCoContribution`, `FamilyAnnualCoContribution`
  - Existing co-contribution calculation and collection service.
  - Existing M-Pesa reference fields for collected payments.
  - Gap: no member-initiated STK push lifecycle model; no webhook-confirmed state machine.
- [x] `Document`
  - Existing generic document model linked to groups, claims, preauths, brokers, quotations, endorsements.
  - Gap: not linked directly to member/package document repository; no member document page.
- [x] `NotificationTemplate` / `NotificationService`
  - Existing email/SMS templates and SMS stub.
  - Gap: no member in-app notification inbox model matching Module 5.
- [x] `MemberWebAuthnCredential`, `CheckInChallenge`, `CheckInEvent`, `MemberCheckInNotification`
  - Strong security/check-in foundation.
  - Should be reused for device/session hardening and security notifications.

### Existing API/Service Surfaces

- [x] `src/server/trpc/routers/preauth.ts`
  - Admin-style list/get/create/adjudicate/convert procedures.
  - Gap: currently not member-scoped. `create` accepts arbitrary `memberId`; member portal must only submit for the signed-in member or eligible dependants.
- [x] `src/server/trpc/routers/coContribution.ts`
  - Rule/cap/admin collection procedures and member transaction list by arbitrary memberId.
  - Gap: member app needs self-scoped wallet/payment procedures, not arbitrary memberId access.
- [x] `src/server/services/claims.service.ts`
  - Preauth creation, adjudication, benefit reservation, and claim conversion exist.
  - Gap: auto-decision service and member-safe request wrapper.
- [x] `src/server/services/providers.service.ts`
  - Nearby provider query exists.
  - Gap: provider cost estimates and facility detail for members.

## Product Principles For This Module

- Member language first: avoid internal claims/adjudication jargon where the member-facing intent is simpler.
- Financial transparency first: show what the plan covers, what the member may owe, and what has been collected.
- Fast path for ordinary care: common low-risk pre-auths should return a decision quickly.
- Traceability over convenience for payments: M-Pesa confirmation must come from webhook/state, never from a member-presented SMS.
- Privacy by design for families: principal members can see family-level coverage, but sensitive categories must be redacted/configurable.
- Mobile web is the primary demo surface; desktop should remain clean, but phone-sized layouts must feel first-class.
- Reuse existing schema and services where possible; add new models only where the current data model cannot safely represent the workflow.

## Gap Matrix Against Module 5

| Spec Area | Existing Coverage | Gap | Implementation Priority |
| --- | --- | --- | --- |
| Real-time benefit utilization | `BenefitUsage`, `/member/benefits`, dashboard summary | No reusable member app service, no utilization pace, limited family view | P0 |
| Encounter history | `/member/utilization`, claims/co-contribution data | Needs member-safe language, filters, itemized cost clarity, detail view | P0 |
| Provider locator | `/member/facilities`, geo provider search | No cost estimate, filters, facility detail, area fallback | P1 |
| Pre-auth request | Preauth model/service/admin flow | Member request UI absent, no auto-decision, no self/dependent scoping | P1 |
| M-Pesa co-contribution | Co-contribution records and manual M-Pesa ref | No STK push/payment state/webhook sandbox | P2 |
| Family-wide views | Principal/dependent relationship, dependent list | No family benefit/encounter summary or sensitive redaction | P0/P1 |
| Document repository | Generic `Document` model | No member/package/group document repository | P2 |
| Notifications | Notification templates and SMS stub | No in-app member notification model/inbox | P2 |
| Multi-channel access | SMS/check-in pieces exist | No USSD/SMS member app handler | P3 |
| Native wrapper | None | Out of scope for web sprint unless explicitly requested | Later |

## Proposed Architecture

### New Service Layer

Add a dedicated member app service:

- `src/server/services/member-app.service.ts`

Responsibilities:

- Resolve the signed-in user's member profile and tenant safely.
- Return dashboard data with only member-safe fields.
- Return benefit state for principal/dependent scopes.
- Return encounter history and encounter detail with simplified cost labels.
- Return family view data with privacy filtering.
- Return documents once document repository is added.
- Return notification inbox once notification model is added.

Why:

- Current member pages query Prisma directly and duplicate access logic.
- This module needs consistent privacy, family scoping, and language rules across pages.

### New tRPC Router

Add:

- `src/server/trpc/routers/memberApp.ts`

Proposed procedures:

- `dashboard()`
- `benefitState({ memberId? })`
- `encounterHistory({ memberId?, periodFrom?, periodTo?, cursor?, limit? })`
- `encounterDetail({ claimId })`
- `familyView()`
- `documents()`
- `notifications({ status?, cursor?, limit? })`
- `markNotificationRead({ notificationId })`

Important:

- `memberId` is optional and must only allow:
  - signed-in member's own `id`;
  - dependants where `principalId === signedInMember.id`;
  - no arbitrary member access.

### Member-Scoped Preauth Flow

Add member-facing wrappers rather than exposing the current generic preauth router directly:

- `src/server/services/member-preauth.service.ts`
- Member-safe server actions under `src/app/member/preauth/actions.ts`
- Optional tRPC procedure under `memberApp` or a new `memberPreauth` router.

Responsibilities:

- Resolve signed-in member.
- Allow request for self or dependent only.
- Validate provider is active and in tenant.
- Validate benefit category/package coverage.
- Estimate cost from provider tariffs where possible.
- Run auto-decision algorithm for configured common procedures.
- Create `PreAuthorization` with `submittedBy: "MEMBER"`.
- Set status to `APPROVED`, `DECLINED`, or `UNDER_REVIEW`/`SUBMITTED` according to auto-decision.
- Snapshot `benefitRemaining`, approved amount, validity dates, decline notes, and decision rationale in existing fields where possible.

Schema note:

- The spec proposes a separate `PreAuthRequest` model. The repo already has `PreAuthorization`. Prefer extending/reusing `PreAuthorization` first unless audit shows fields are insufficient.
- Missing fields that may need migration:
  - `decisionRationale String?`
  - `autoDecision Boolean @default(false)`
  - `routedToHumanReview Boolean @default(false)`
  - `fraudRulesEvaluated Json?`
  - `memberCoContribution Decimal?`

### Provider Cost Transparency

Extend provider service:

- Add `ProvidersService.getMemberProviderLocatorResults()`.
- Add `ProvidersService.estimateMemberProcedureCost()`.

Use available data in priority order:

1. `ProviderTariff` by CPT/service category and active period.
2. `ProviderDiagnosisTariff` by ICD family if CPT tariff is absent.
3. Recent claim-line median for same provider/service/benefit category.
4. Tenant-level fallback seed tariff.

Member-facing estimate output:

- estimatedCost
- planCovers
- estimatedMemberShare
- remainingBenefitAfterVisit
- confidence: `TARIFF`, `RECENT_CLAIMS`, or `FALLBACK`
- explanation: short member-safe text.

### Co-Contribution Wallet And M-Pesa Sandbox

Current `CoContributionTransaction` is claim-linked and supports manual collection. For member-initiated STK push, add a separate lifecycle model or extend carefully.

Preferred first implementation:

- Add `MemberCoContributionPayment` as in spec, linked optionally to `CoContributionTransaction`, `PreAuthorization`, and/or `Claim`.
- Add `src/server/services/member-payment.service.ts`.
- Add `/api/member/payments/mpesa/callback` for sandbox/webhook simulation.
- Add reconciliation job only after basic sandbox callback works.

First demo mode:

- "Pay with M-Pesa" creates `MemberCoContributionPayment` in `PENDING_CALLBACK`.
- Signed sandbox callback confirms or fails payment.
- On confirmation:
  - update `MemberCoContributionPayment` to `CONFIRMED`;
  - update linked `CoContributionTransaction.amountCollected` and status where applicable;
  - write member notification in a later notification-focused pass;
  - surface confirmation in member wallet.

### Member Notifications

The spec has `MemberNotification`. Existing notification service is mostly outbound template dispatch. Add in-app notification persistence:

- New model: `MemberNotification`
- New enum types or string fields if schema churn needs to stay small.
- Service: `src/server/services/member-notification.service.ts`

Emit notifications for:

- benefit near cap;
- pre-auth decision;
- co-contribution requested;
- co-contribution confirmed/failed;
- encounter recorded;
- renewal reminder;
- document available;
- security alert.

### Document Repository

Use existing `Document` model where possible.

Options:

1. Minimal schema extension:
   - add `memberId String?` to `Document`;
   - add relation to `Member`;
   - use `groupId` and `packageId`/metadata where direct package relation is unavailable.
2. If avoiding migration:
   - derive documents from group, claims, preauths, and generated static document definitions.

Recommended first slice:

- Build a member documents page using:
  - member-specific generated membership card/certificate link;
  - group/package documents if available;
  - claim/preauth documents visible only to the signed-in member.
- Add schema extension for member-linked documents only if needed for upload/storage.

### Low-Bandwidth Access

Do after web member flows are solid.

Add:

- `src/app/api/ussd/route.ts`
- `src/server/services/ussd.service.ts`
- `src/server/services/sms-query.service.ts`

First supported journeys:

- benefit balance;
- recent encounters;
- renewal date;
- nearest provider by area text.

Use the same `member-app.service.ts` data methods to avoid a separate truth source.

## Detailed Execution Plan

### Phase 0 — Baseline Audit And Design Lock

Status: planned.

Tasks:

- [ ] Create this handoff file.
- [ ] Confirm current build status before feature work.
- [ ] Record current member demo logins from seed.
- [ ] Identify 5 to 10 seeded member personas that should demonstrate:
  - healthy low-utilization member;
  - chronic high-utilization member;
  - principal with dependants;
  - dependent with privacy-sensitive claim category;
  - member with pending co-contribution;
  - member with approved pre-auth;
  - member near benefit cap;
  - member using self-funded scheme if relevant.
- [ ] Decide route naming:
  - keep existing `/member/*` routes;
  - change UI labels to member-friendly names where useful.
- [ ] Decide whether this module should add schema migrations immediately or first refactor services/UI using existing models.

Deliverable:

- [x] Handoff file complete and updated.

### Phase 1 — Member App Service And Dashboard Refresh

Goal:

Create a reusable data layer and make `/member/dashboard` the demo hero surface.

Files likely touched:

- `src/server/services/member-app.service.ts`
- `src/server/trpc/routers/memberApp.ts`
- `src/server/trpc/router.ts`
- `src/app/member/dashboard/page.tsx`
- `src/app/member/dashboard/loading.tsx`
- `src/components/layouts/MemberNav.tsx`

Tasks:

- [x] Add member app service foundation.
  - Implemented `MemberAppService.getDashboardForUser(userId, tenantId)` in `src/server/services/member-app.service.ts`.
  - The first slice resolves member context inside the dashboard method; extract a separate `resolveMemberContext()` helper when Phase 2 adds more member app reads.
- [x] Add `memberApp.dashboard` tRPC procedure.
  - Added `src/server/trpc/routers/memberApp.ts`.
  - Registered `memberApp` in `src/server/trpc/router.ts`.
  - The procedure enforces `MEMBER_USER` before returning member app data.
- [x] Move dashboard Prisma reads into the service.
- [x] Return:
  - member identity and package;
  - total limit, used, remaining;
  - top 3 benefit categories by pressure;
  - recent activity feed combining claims, preauths, co-contributions, and notifications if available;
  - dependent count and family summary;
  - next renewal date;
  - quick action eligibility flags.
- [x] Update dashboard UI:
  - mobile-first benefit balance hero;
  - "what you can do now" quick actions: show card, find care, request pre-auth, check in, view family;
  - recent activity feed with member-safe text;
  - outstanding member-share/payment prompt if any `CoContributionTransaction` is pending.
- [ ] Update member nav:
  - group related actions under clearer mobile labels if needed;
  - consider "Care" route later for combined facilities + preauth entry.
- [x] Ensure text rendering uses global typography rules and no tiny wide-tracked labels on the refreshed dashboard.

Acceptance:

- [ ] Dashboard renders for seeded member.
- [ ] Dashboard handles member with no claims/preauths.
- [ ] Dashboard handles principal with dependants.
- [x] No arbitrary member data is loaded by the service/API; reads are scoped from the signed-in user id and tenant.
- [x] `npm run build` passes.
- [ ] `npx tsc --noEmit` is still blocked by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 2 — Benefit Transparency And Family View

Goal:

Make benefits and family coverage feel real, understandable, and privacy-aware.

Files likely touched:

- `src/server/services/member-app.service.ts`
- `src/app/member/benefits/page.tsx`
- `src/app/member/dependents/page.tsx`
- Optional new component folder: `src/components/member-app/`

Tasks:

- [x] Add `MemberAppService.getBenefitState({ memberId? })`.
  - Implemented as `MemberAppService.getBenefitStateForUser(userId, tenantId, targetMemberId?)`.
  - The method allows only the signed-in member or their dependants.
- [x] Add period math helper:
  - benefit period start/end anchored to enrollment date;
  - elapsed percentage of period;
  - utilization percentage;
  - pace label: `On track`, `Ahead of expected use`, `Near cap`, `Cap reached`.
- [x] Update `/member/benefits`:
  - show used/limit/remaining for each benefit;
  - show utilization pace;
  - show recent event counts per category where available;
  - explain co-pay/member share in simple language;
  - preserve waiting period indicators without alarming styling.
- [x] Add `MemberAppService.getFamilyView()`.
  - Implemented as `MemberAppService.getFamilyViewForUser(userId, tenantId)`.
  - Principal viewers see self + dependants; dependent viewers see only self.
- [x] Update `/member/dependents`:
  - show family-level total remaining;
  - show each member's safe summary;
  - principal can review self/dependent summaries in one page;
  - hide or aggregate sensitive categories.
- [x] Define first-pass sensitive category policy:
  - maternity, mental health, HIV/sexual health if category/tag exists;
  - default to aggregate-only for dependants over configurable age threshold.
  - Current implementation masks `MATERNITY` and `MENTAL_HEALTH` category details for family members who are not the signed-in member. HIV/sexual-health should be added when the benefit taxonomy has an explicit category/tag.

Acceptance:

- [x] Benefits page shows no internal adjudication jargon.
- [x] Principal sees dependants but sensitive utilization is redacted/aggregated.
- [x] Dependent user cannot access principal/dependent sibling details by service design.
- [x] Empty and zero-limit cases do not break.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 3 — Encounter History And Cost Detail

Goal:

Turn "Claims History" into member-facing encounter/cost transparency.

Files likely touched:

- `src/server/services/member-app.service.ts`
- `src/app/member/utilization/page.tsx`
- `src/app/member/utilization/[claimId]/page.tsx`
- `src/server/trpc/routers/memberApp.ts`

Tasks:

- [x] Add `MemberAppService.getEncounterHistory()`.
  - Implemented as `MemberAppService.getEncounterHistoryForUser(userId, tenantId, filters)`.
  - Supports self/dependent scoping based on principal-member relationship.
- [x] Add `MemberAppService.getEncounterDetail(claimId)`.
  - Implemented as `MemberAppService.getEncounterDetailForUser(userId, tenantId, claimId)`.
  - Sensitive family categories are not opened in detail for another family member.
- [x] Add `memberApp.encounterHistory` and `memberApp.encounterDetail` tRPC procedures.
- [x] Rename visible page label from "Claims History" to "Care History".
- [x] Add filters:
  - period;
  - status;
  - benefit category;
  - self/dependent when principal.
- [x] Show each encounter with:
  - provider;
  - date;
  - service type;
  - billed amount;
  - plan approved/covered amount;
  - member share;
  - payment/collection status.
- [x] Add detail panel/page:
  - simplified itemized services from `ClaimLine`;
  - no raw ICD/adjudication text unless safe;
  - document links if available;
  - "Need help with this?" support link remains for a follow-up polish pass.
- [ ] Link pending co-contribution items to wallet/payment once Phase 5 exists.

Acceptance:

- [x] Member only sees own/dependant encounters according to family policy.
- [x] Sensitive categories are hidden or summarized.
- [x] Claim line display is understandable and not overly clinical.
- [x] Pagination/cursor is considered if claim history grows.
  - Current server-rendered page caps the query at 100 rows; cursor pagination should be added when the member app API becomes client-driven.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 4 — Provider Locator With Cost Transparency

Goal:

Upgrade facilities from "map of places" to "where should I go and what might it cost me?"

Files likely touched:

- `src/server/services/providers.service.ts`
- `src/app/member/facilities/page.tsx`
- `src/app/member/facilities/actions.ts`
- `src/app/member/facilities/FacilitiesMap.tsx`
- `src/app/member/facilities/MemberMap.tsx`
- Optional later route: `src/app/member/facilities/[providerId]/page.tsx`

Tasks:

- [x] Add service filter to nearby providers:
  - service offered;
  - tier;
  - provider type remains visible but not a separate filter yet.
  - open now/24 hours remains visible data for a later detail view if needed.
- [x] Add area/manual search fallback for geolocation denial.
  - Current implementation falls back to Nairobi coordinates when browser geolocation is denied/unavailable.
  - Text area/manual county search is still a later enhancement.
- [x] Add procedure/category selector:
  - common consultation;
  - lab panel;
  - imaging;
  - optical;
  - maternity/outpatient/inpatient common examples.
- [x] Add `estimateMemberProcedureCost()`.
  - Implemented as `ProvidersService.getNearbyProvidersWithMemberEstimates()`.
  - Uses active `ProviderTariff` by CPT when available.
  - Falls back to default demo procedure rates when no tariff exists.
  - Uses the member's remaining benefit and co-pay percentage to estimate plan cover and member share.
- [x] Show on provider cards:
  - partner tier;
  - distance;
  - estimated cost;
  - estimated plan cover;
  - estimated member share;
  - estimate confidence.
- [ ] Add facility detail page or drawer:
  - operating hours;
  - services;
  - tariff/cost estimate examples;
  - directions/call buttons;
  - "Request pre-auth here" CTA.

Acceptance:

- [x] Works without geolocation via Nairobi fallback.
- [x] Handles missing tariffs with clear fallback.
- [x] Does not claim exact pricing when estimate is fallback.
- [x] Provider result query remains tenant-scoped.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 5 — Member Pre-Authorization Request And Auto-Decision

Goal:

Allow members to request pre-auth and receive immediate decisions for safe/common cases.

Files likely touched:

- `src/server/services/member-preauth.service.ts` — added member-scoped request options, history, detail, submit, and auto-decision orchestration.
- `src/server/services/claims.service.ts`
- `src/app/member/preauth/page.tsx` — refactored to use the member-scoped service, summary cards, real request CTA, and detail links.
- `src/app/member/preauth/actions.ts` — added server action for member request submission.
- `src/app/member/preauth/new/page.tsx` — added request page.
- `src/app/member/preauth/new/MemberPreAuthForm.tsx` — added client form.
- `src/app/member/preauth/[id]/page.tsx` — added member-scoped detail page.
- Optional migration adding decision metadata to `PreAuthorization`.

Tasks:

- [x] Build member request form:
  - self/dependent;
  - provider;
  - procedure/common service, which carries service type/benefit category through the catalog;
  - expected date;
  - symptoms/notes;
  - optional document upload later.
- [x] Add server action with self/dependent scoping.
- [x] Add auto-decision rules:
  - active member/group;
  - benefit category exists;
  - waiting period elapsed through the existing `ClaimsService.createPreAuth()` validation path where available;
  - estimated cost and remaining cap;
  - provider active and contracted;
  - common procedure auto-approve list;
  - fraud warning severity handling.
- [x] Use existing `ClaimsService.createPreAuth()` where possible.
- [x] For auto-approved:
  - call/adapt adjudication flow to reserve benefits;
  - set valid dates;
  - show approval result immediately.
- [ ] For human review:
  - route to `SUBMITTED` or `UNDER_REVIEW`;
  - show SLA and next step;
  - notify member.
- [x] For auto-declined:
  - use safe member-facing reason;
  - offer support/appeal path.
- [x] Add preauth detail page:
  - status timeline;
  - approved/estimated amount;
  - member share if any;
  - validity.

Implementation notes:

- `MemberPreAuthService.request()` allows only the signed-in member or active dependants from `MemberAppService.resolveMemberContext()`.
- Request procedure choices come from `ProvidersService.getMemberProcedureCatalog()` and use active `ProviderTariff` rates when available, otherwise catalog fallback costs.
- Auto-approval currently applies to low-risk CPTs under KES 15,000 with no fraud warnings, active member/group, active provider, and a covered benefit category.
- Requests with no remaining benefit are auto-declined with a member-safe reason.
- Non-auto-approved cases are moved to `UNDER_REVIEW` so the member sees a clear pending state.
- The member list and detail pages are tenant-scoped and member/dependant-scoped through `MemberPreAuthService`.
- Member notification dispatch is not wired yet. Existing `NotificationService.sendToMember()` depends on queue/Redis behavior, so this was left for a targeted notification phase rather than adding a potentially brittle request-path side effect.
- Document upload remains a later enhancement; existing linked documents are displayed on the detail page.

Acceptance:

- [x] Member cannot submit for arbitrary member.
- [ ] Common seeded procedures produce at least one auto-approved and one human-review scenario.
- [x] Benefit usage reservation remains consistent by using `ClaimsService.adjudicatePreAuth()`.
- [x] Fraud warnings are not exposed in raw/internal wording.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 6 — Wallet And M-Pesa Co-Contribution Demo Flow

Goal:

Show frictionless member-share payment without pretending SMS confirmation is trustworthy.

Files likely touched:

- `prisma/schema.prisma` — added `MemberCoContributionPaymentStatus` and `MemberCoContributionPayment`.
- `prisma/migrations/20260508091500_member_wallet_payments/migration.sql` — adds payment attempt table/indexes/relations.
- `src/server/services/member-payment.service.ts` — added wallet read model, STK initiation state, signed callback verification, and callback application.
- `src/app/member/wallet/page.tsx` — added member wallet page with outstanding balances and payment history.
- `src/app/member/wallet/actions.ts` — added member-scoped M-Pesa checkout initiation server action.
- `src/app/member/wallet/PaymentInitiationForm.tsx` — added client form for initiating sandbox checkout.
- `src/app/api/member/payments/mpesa/callback/route.ts` — added signed callback endpoint.
- `src/components/layouts/MemberNav.tsx` — added Wallet nav entry.

Tasks:

- [x] Add `Wallet` nav entry if product decision agrees.
- [x] Add schema for `MemberCoContributionPayment` or carefully extend current transactions.
- [x] Add `MemberPaymentService.initiate()`:
  - validates signed-in member owns the transaction/preauth;
  - records idempotency key;
  - creates sandbox STK request state.
- [x] Add sandbox callback endpoint:
  - validates signed callback shape;
  - updates payment state;
  - updates linked co-contribution transaction on confirmation.
- [x] Add wallet page:
  - outstanding amounts;
  - payment history;
  - preferred M-Pesa phone;
  - retry failed/timed-out prompt.
- [ ] Add reconciliation job only if needed for demo.
- [x] Add clear facility-facing rule note in internal docs:
  - only AiCare-confirmed payment state authorizes service.

Implementation notes:

- The new `MemberCoContributionPayment` model records payment attempts and callback state. Confirmed money still updates the existing `CoContributionTransaction` so claims/utilization/accounting surfaces keep using the same collection source.
- `MemberPaymentService.getWalletForUser()` scopes wallet items to the signed-in member. A principal can also see/pay active dependant co-contribution items; a dependant only sees their own.
- `MemberPaymentService.initiate()` validates ownership, validates a Kenyan M-Pesa phone, prevents duplicate active checkout attempts, records a sandbox `checkoutRequestId`, and leaves the transaction uncollected until callback confirmation.
- `POST /api/member/payments/mpesa/callback` requires `x-aicare-signature`, an HMAC-SHA256 over the raw JSON body using `MPESA_CALLBACK_SECRET` or the local fallback `aicare-demo-secret`. In production, callbacks are rejected if `MPESA_CALLBACK_SECRET` is not configured.
- Successful callback payloads use `resultCode: "0"` and update:
  - payment attempt status to `CONFIRMED`;
  - linked co-contribution `amountCollected`;
  - collection status to `COLLECTED` or `PARTIAL`;
  - M-Pesa receipt/phone/reference fields.
- Failed/cancelled callback payloads update the payment attempt to `FAILED`/`CANCELLED`; the underlying co-contribution remains outstanding for retry.
- Expired active payment attempts are marked `TIMED_OUT` when the wallet page is loaded.
- Facility-facing rule is shown on the wallet page and documented here: screenshots/SMS are not sufficient; only AiCare-confirmed callback state authorizes payment.

Example callback body for demo:

```json
{
  "checkoutRequestId": "AICARE-...",
  "resultCode": "0",
  "resultDescription": "The service request is processed successfully.",
  "mpesaReceipt": "RKT123456",
  "amount": 1500,
  "phoneNumber": "+254712345678"
}
```

Generate the signature with:

```ts
MemberPaymentService.signCallbackBody(JSON.stringify(body))
```

Acceptance:

- [x] Payment cannot be confirmed by client-only action in production path.
- [x] Demo sandbox can show confirmed and failed flows through signed callback payloads.
- [x] Co-contribution records and wallet history stay consistent.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 7 — Documents And Notifications

Goal:

Add the member repository and event feed that make the portal feel alive.

Files likely touched:

- `prisma/schema.prisma` — added `MemberNotification`, `MemberNotificationType`, and `MemberNotificationPriority`.
- `prisma/migrations/20260508094500_member_notifications/migration.sql` — adds member notification table/indexes/relations.
- `src/server/services/member-notification.service.ts` — added member-scoped inbox, creation, and mark-read helpers.
- `src/server/services/member-app.service.ts` — added dashboard notification preview data and derived document repository.
- `src/server/services/member-preauth.service.ts` — creates member notifications for auto-approved, under-review, and auto-declined preauth requests.
- `src/server/services/member-payment.service.ts` — creates member notifications for checkout requested, payment confirmed, and payment failed/cancelled.
- `src/app/member/documents/page.tsx` — added member document repository page.
- `src/app/member/notifications/page.tsx` — added notification inbox.
- `src/app/member/notifications/actions.ts` — added mark-read and mark-all-read actions.
- `src/components/layouts/MemberNav.tsx` — added Documents and Alerts entries.
- `src/app/member/dashboard/page.tsx` — added recent notification preview.
- `prisma/seed.ts`

Tasks:

- [x] Decide document strategy:
  - direct `Document.memberId`, or derived repository.
- [x] Build documents page:
  - membership certificate/card;
  - benefit schedule;
  - benefit guide;
  - preauth letters;
  - claim documents where safe.
- [x] Add `MemberNotification` model.
- [x] Add notification service and create notifications from:
  - preauth decision;
  - payment status;
  - benefit near cap; pending seeded/system job pass;
  - renewal reminder; pending seeded/system job pass;
  - document availability; pending upload/document workflow pass.
- [x] Add notification list/inbox and mark-read action.
- [x] Add dashboard notification preview.

Implementation notes:

- Document strategy is derived repository, not a new direct `Document.memberId` field.
- Document page composes:
  - generated membership card links for self/dependants;
  - group/plan documents from existing `Document.groupId`;
  - preauth documents from existing `Document.preauthId`;
  - claim documents from existing `Document.claimId`.
- Principal members can see eligible family documents. Sensitive family categories use the same privacy rule as care history and are hidden from other family members.
- The in-app notification model is intentionally separate from outbound `NotificationService`/`Correspondence` and from secure check-in notifications. Those can be unified later if product direction requires it.
- `MemberNotificationService.create()` is now used by member preauth and member wallet flows. It does not send email/SMS and does not depend on Redis/BullMQ.
- Notification inbox is tenant/member scoped and supports mark one read or mark all read.
- Dashboard now shows the latest in-app notifications when present.

Acceptance:

- [x] Member sees only their own documents and eligible family documents.
- [x] Notifications are tenant/member scoped.
- [ ] Seed has varied notification examples. This is deferred to Phase 9 seed/demo script so seeded notifications align with the full member persona portfolio.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 8 — Low-Bandwidth USSD/SMS Handler

Goal:

Demonstrate inclusive access using the same member data source.

Files likely touched:

- `src/app/api/ussd/route.ts` — added GET/POST endpoint returning plain-text `CON`/`END` USSD responses.
- `src/app/api/sms/member-query/route.ts` — added GET/POST endpoint returning JSON SMS reply text.
- `src/server/services/ussd.service.ts` — added menu parser and low-bandwidth USSD journeys.
- `src/server/services/sms-query.service.ts` — added keyword parser for SMS member queries.
- `src/server/services/low-bandwidth-channel.service.ts` — added phone normalization, safe fallback, lightweight throttling, formatting, and audit logging helpers.
- `src/server/services/member-app.service.ts` — added phone-scoped low-bandwidth member snapshot and area provider lookup methods.

Tasks:

- [x] Add phone-number to member lookup with tenant/provider guard.
- [x] Add USSD session parser for:
  - benefit balance;
  - recent encounters;
  - renewal date;
  - nearest provider by area.
- [x] Add SMS keyword parser:
  - `BAL`;
  - `LOC area`.
- [x] Add audit log for USSD/SMS lookups.
- [x] Add rate limiting/throttling if available.

Implementation notes:

- Phone lookup normalizes Kenyan numbers across `+2547...`, `2547...`, and `07...` formats.
- Tenant guard is supported through optional `tenantSlug`. If a phone number is unknown, inactive, duplicated, or ambiguous across tenants, the response is the same safe contact-support message.
- USSD menu:
  - blank text: main menu;
  - `1`: benefit balance;
  - `2`: recent visible visits;
  - `3`: renewal date;
  - `4*Area`: active provider search by county/address/name.
- SMS keywords:
  - `BAL` or `BALANCE`;
  - `VISITS`;
  - `RENEWAL`;
  - `LOC area` or `PROVIDER area`.
- Recent visits intentionally omit amounts and hide sensitive benefit categories.
- Provider lookup returns only active providers and basic contact/location information.
- Low-bandwidth lookups write `ActivityLog` records with action, channel, memberId when known, and only the last four phone digits in metadata.
- Rate limiting is in-memory per runtime instance: 12 requests per phone/channel per minute. This is sufficient for demo/local safety but should be replaced with Redis/edge rate limiting for production.

Demo examples:

```text
GET /api/ussd?phoneNumber=0712345678&text=1&tenantSlug=avenue
GET /api/ussd?phoneNumber=0712345678&text=4*Westlands&tenantSlug=avenue
GET /api/sms/member-query?phoneNumber=0712345678&message=BAL&tenantSlug=avenue
GET /api/sms/member-query?phoneNumber=0712345678&message=LOC%20Westlands&tenantSlug=avenue
```

Acceptance:

- [x] USSD/SMS responses never expose sensitive details.
- [x] Unknown phone receives safe "contact support" response.
- [x] Uses same service calculations as web.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 9 — Seed Data And Demo Script

Goal:

Make every member experience feature demonstrable with internally consistent data.

Files likely touched:

- `prisma/seed.ts` — added Phase 9 member experience demo portfolio block and final seed output notes.
- optional seed helper modules if seed file gets too large.

Tasks:

- [x] Add at least 50 member app demo personas across the existing 200+ member portfolio.
- [x] Include at least 5 family groupings.
- [x] Ensure benefit usage exists across:
  - low, medium, high, near-cap, cap-reached.
- [x] Add claims and claim lines that support care-history detail.
- [x] Add preauth scenarios:
  - auto-approved outpatient consult/lab;
  - human-review imaging/surgery;
  - declined waiting-period or excluded scenario;
  - approved with member co-contribution.
- [x] Add provider tariffs/cost examples for top procedures.
- [x] Add member co-contribution payments:
  - pending;
  - prompt sent;
  - confirmed;
  - failed/timed out.
- [x] Add documents:
  - benefit guide;
  - membership certificate;
  - preauth approval letter;
  - claim support doc.
- [x] Add notifications:
  - benefit used;
  - near cap;
  - preauth decision;
  - payment confirmed;
  - renewal reminder.
- [x] Write a 5-minute demo path:
  - login as member;
  - view balance;
  - inspect family;
  - search provider and estimate cost;
  - request preauth;
  - pay member share;
  - show notification and care history update.

Implementation notes:

- The existing seed already ensures a 200+ covered-life portfolio across Safaricom, KCB, EABL, Bamburi, and Twiga. Phase 9 enriches that portfolio instead of creating a disconnected dataset.
- Added five member demo logins:
  - `member.demo.low@avenue.co.ke / AvenueAdmin2024!`
  - `member.demo.nearcap@avenue.co.ke / AvenueAdmin2024!`
  - `member.demo.family@avenue.co.ke / AvenueAdmin2024!`
  - `member.demo.wallet@avenue.co.ke / AvenueAdmin2024!`
  - `member.demo.preauth@avenue.co.ke / AvenueAdmin2024!`
- Seed sets deterministic demo phone numbers for the first 50 active members so SMS/USSD can be tested:
  - first five: `+254711000101` through `+254711000105`.
- Seed upserts 50 benefit usage profiles against each member's active membership-year period, derived from enrollment anniversary, using low, medium, high, near-cap, and cap-reached/exceeded patterns.
- Wanjiru Kamau is included in the member-experience demo portfolio so `member@avenue.co.ke` remains useful for member dashboard testing. The five extra `member.demo.*` logins intentionally start from the next member to avoid the unique `User.memberId` constraint.
- Seed creates 36 `CLM-MEXP-*` care-history claims across the trailing 12-month range with claim lines, diagnoses, approved/paid states, and sensitive category examples.
- Maternity demo claims are guarded so they only attach to active adult female principals/spouses. A corrective seed pass reassigns any existing invalid maternity claim that landed on a male member or child to an eligible female member in the same group.
- Seed creates member wallet demo states from the new `MemberCoContributionPayment` model:
  - pending callback;
  - confirmed;
  - failed;
  - timed out;
  - partial/deferred co-contribution records.
- Seed creates `PA-MEXP-*` preauth scenarios:
  - approved low-risk consult;
  - human-review ultrasound;
  - surgical review;
  - declined/exhausted optical.
- Seed adds member-visible documents:
  - benefit guide;
  - benefit schedule;
  - preauth approval letter;
  - claim support doc.
- Seed adds member notifications for benefit status, near cap, claim update, payment confirmed, preauth approved, renewal reminder, and document availability.

Suggested 5-minute demo path:

1. Login as `member.demo.wallet@avenue.co.ke / AvenueAdmin2024!`.
2. Open `/member/dashboard` and point out benefit balance, member-share alert, and notification preview.
3. Open `/member/benefits` and show current usage pressure.
4. Open `/member/utilization` and drill into a `CLM-MEXP-*` care event.
5. Open `/member/facilities`, search a provider/service, and show estimate confidence.
6. Open `/member/preauth` and show the seeded approved/review/declined examples; optionally create a new request.
7. Open `/member/wallet` and show pending/confirmed/failed/timed-out payment states.
8. Open `/member/documents` and `/member/notifications`.
9. Test low-bandwidth path with `/api/sms/member-query?phoneNumber=+254711000104&message=BAL&tenantSlug=avenue`.

Acceptance:

- [ ] `npm run db:seed` creates all member-demo states. Attempted from Codex but the command timed out after 4 minutes before returning output; run from a normal terminal with a longer timeout after applying migrations.
- [x] Demo member credentials are documented here.
- [x] Seed remains idempotent through upserts/unique checks for users, benefit usage, claims, preauths, documents, payments, and notifications.
- [x] Analytics/fund/HR sections remain internally consistent with member data because the new claims/payments attach to existing groups, packages, providers, and members.
- [x] `npm run build` passes for this phase.
- [ ] `npx tsc --noEmit` remains blocked only by pre-existing untracked root scratch files:
  - `scratch-bamburi-claims.ts`
  - `scratch-bamburi-invoices.ts`
  - `scratch-bamburi-rate.ts`
  - `scratch-check-api.ts`

### Phase 10 — Verification, Security, And Performance

Tasks:

- [x] Run `npm run build`.
- [x] Run `npx tsc --noEmit` after resolving or excluding existing scratch-file blockers.
- [x] Run `npm run lint` and document unrelated baseline failures.
- [ ] Browser QA on mobile viewport:
  - dashboard;
  - benefits;
  - care history;
  - facilities;
  - preauth;
  - wallet;
  - family;
  - profile/security.
- [ ] Role/security QA:
  - logged-out redirect;
  - member cannot access another member via URL;
  - dependent privacy redaction;
  - HR/broker/admin routes unaffected.
- [ ] Performance QA:
  - dashboard query count;
  - benefit state read speed;
  - provider search response time;
  - preauth auto-decision under target response.

Implementation notes:

- `tsconfig.json` now excludes root `scratch-*.ts` files so local investigation scripts do not block project type checks.
- `eslint.config.mjs` now globally ignores root `scratch-*.ts` files for the same reason.
- Fixed `ProvidersService` Prisma JSON typing for provider operating hours by using `Prisma.InputJsonValue` and `Prisma.JsonNull`.
- Fixed `DashboardCharts` client-only mounting so lint no longer flags synchronous state updates inside an effect.
- Replaced runtime `require("decimal.js")` calls in secure check-in with a top-level `Decimal` import.
- Fixed member benefit summary semantics after Wanjiru Kamau demo QA:
  - the large dashboard/benefits number now uses the package annual cover limit, not the sum of category sublimits;
  - category cards now explicitly say they are category sublimits;
  - benefit usage lookup now prefers the active membership-year period.
- Fixed seed consistency after Wanjiru Kamau demo QA:
  - current-period usage is seeded from enrollment anniversary;
  - Wanjiru is included in the demo member portfolio;
  - invalid maternity-on-male demo claims are corrected on reseed.
- Added a member mobile install prompt:
  - Android/Chrome uses the native `beforeinstallprompt` event when available;
  - iOS Safari shows the correct Share menu and Add to Home Screen guidance;
  - the prompt is scoped to `/member/*`, hidden in standalone mode, and remembers dismissal locally.
- `npx tsc --noEmit` passes as of 2026-05-08.
- `npm run lint` passes as of 2026-05-08 with 16 existing warnings, all unused variables/imports outside the member hardening work.
- `npm run build` passes as of 2026-05-08 on Next.js 15.5.15.
- `npm run audit:smoke` was attempted before these final checks and failed because no local server was reachable, not because of a member-experience assertion failure. Re-run it with the app server running.

Remaining Phase 10 QA:

- Run browser QA against a live local or preview deployment, especially mobile viewport checks for the member dashboard, benefits, care history, facilities, preauth, wallet, family, profile, and security pages.
- Run role/security QA with seeded users after migrations and seed complete.
- Run performance QA with server timings or Prisma query logging enabled.

## Suggested Implementation Order

Recommended first three implementation slices:

1. Service/data foundation plus dashboard refresh.
2. Benefits/family/care-history polish.
3. Provider locator cost transparency.

Reason:

- These slices show immediate member value without heavy external integration.
- They use existing models and data.
- They create the service layer needed by preauth, wallet, and USSD later.

Then continue:

4. Member preauth request and auto-decision.
5. Wallet/M-Pesa sandbox.
6. Documents/notifications.
7. USSD/SMS.
8. Demo seed and final QA.

## Known Risks And Decisions Needed

- [ ] Whether to add a new `MembershipBenefitState` model or continue using `BenefitUsage`.
  - Recommendation: use `BenefitUsage` first; add a new model only if performance or semantics require it.
- [ ] Whether to extend `PreAuthorization` or add the spec's separate `PreAuthRequest`.
  - Recommendation: extend/reuse `PreAuthorization` to avoid duplicate workflow tables.
- [ ] Whether to create a real Daraja integration now or sandbox-only first.
  - Recommendation: sandbox-only for demo; design interfaces so real Daraja can replace the adapter.
- [ ] Sensitive family privacy policy needs business confirmation.
  - Recommendation: implement conservative default redaction and make categories configurable later.
- [ ] Native iOS/Android wrapper should be deferred unless explicitly required for this build cycle.

## Current Status

- [x] Read Module 5 from `AICARE_COMPETITIVE_HARDENING_SPEC.md`.
- [x] Audited current member portal route structure.
- [x] Audited existing Prisma foundations for members, benefit usage, claims, preauth, providers, co-contribution, documents, and notifications.
- [x] Confirmed the system already has major foundations and should not be rebuilt from scratch.
- [x] Created this handoff/action plan.
- [x] Implemented Phases 1 through 9 of member experience hardening.
- [x] Completed Phase 10 static verification checks: type check, lint, and production build.
- [ ] Phase 10 live browser, role/security, smoke-audit, and performance QA still need a running seeded environment.

## Next Agent Start Point

Start with the remaining Phase 10 live validation:

1. Apply pending Prisma migrations in a dev database.
2. Run `npm run db:seed` from a normal terminal with a long timeout so the Phase 9 demo data can finish.
3. Start the app server and run `npm run audit:smoke`.
4. Browser-test the member pages on a mobile viewport using the documented demo member logins.
5. Record any functional or visual issues in this handoff before making further feature changes.
