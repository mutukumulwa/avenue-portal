# Strategic Purchasing & Analytics Layer Handoff

## Purpose

Build the competitive hardening item currently being treated as item 1: the Strategic Purchasing & Analytics Layer. This module should turn existing transactional health insurance data into buyer-facing analytics for portfolio medical loss ratio, provider performance, member risk, renewal pricing, alerts, and scheme profitability.

This document is the source of truth for handoff. Update checkboxes and notes as work progresses so another agent can continue without re-discovering context.

## Current Status

- [x] Read the competitive hardening spec section for Module 3: Strategic Purchasing & Analytics Layer.
- [x] Searched the repo for existing analytics, loss-ratio, utilization, renewal, provider performance, and reporting work.
- [x] Reviewed key Prisma models at a planning level: `Group`, `Member`, `Package`, `Invoice`, `Payment`, `Broker`, `Claim`, `ClaimLine`, `Provider`, `PreAuthorization`, and benefit utilization models.
- [x] Confirmed this is not a terminology-engine task; broker/intermediary generalization has already been implemented and should be reused.
- [x] Implement schema additions.
- [x] Implement first ETL/backfill foundation for encounter and contribution facts.
- [x] Implement first analytics services and API.
- [x] Implement first Strategic Purchasing Console UI.
- [x] Add seed data for case-mix weights.
- [x] Add targeted analytics demo seed data and verification coverage.
- [ ] Add broader stress-scale analytics seed data later.

## Implementation Log

### 2026-05-07 Foundation Slice

- [x] Added Prisma analytics enums and read-optimized models in `prisma/schema.prisma`.
- [x] Added migration `prisma/migrations/20260507110000_strategic_purchasing_analytics/migration.sql`.
- [x] Added case-mix seed weights in `prisma/seed.ts`.
- [x] Added `src/server/services/analytics-refresh.service.ts`.
  - Refreshes default case-mix weights.
  - Upserts `AnalyticsEncounterFact` rows from claims and claim lines.
  - Upserts `AnalyticsContributionFact` rows from invoices.
  - Uses deterministic `sourceKey` values so refreshes are idempotent.
- [x] Added `src/server/jobs/analytics-refresh.job.ts`.
- [x] Added `analytics` BullMQ queue, `scheduleAnalyticsRefreshJob()`, and `enqueueAnalyticsRefresh()` in `src/lib/queue.ts`.
- [x] Wired the analytics worker into `src/server/jobs/worker.ts`.
- [x] Ran `npx prisma validate`.
- [x] Ran `npx prisma generate`.
- [x] Ran `npx tsc --noEmit`.
- [x] Run `npm run build`.
- [ ] Run `npm run lint` after deciding whether to address unrelated baseline lint failures.

### 2026-05-07 Derived Snapshot And API Slice

- [x] Extended `src/server/services/analytics-refresh.service.ts`.
  - Added `refreshMlrSnapshots()`.
  - Added `refreshProviderScorecards()`.
  - Included both methods in `refreshFoundation()`.
- [x] Updated `src/server/jobs/analytics-refresh.job.ts` logging to include MLR snapshots and provider scorecard rows.
- [x] Added `src/server/services/analytics.service.ts`.
  - Added portfolio summary read method.
  - Added scheme grid read method.
  - Added provider scorecard read method.
  - Added risk composition read method.
- [x] Added `src/server/trpc/routers/analytics.ts`.
  - Added `analytics.portfolioSummary`.
  - Added `analytics.schemeGrid`.
  - Added `analytics.providerScorecard`.
  - Added `analytics.riskComposition`.
  - Added `analytics.refreshFoundation` mutation for dev/manual refresh.
- [x] Registered analytics router in `src/server/trpc/router.ts`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Add stricter role scoping for HR and intermediary users before exposing UI broadly.
- [ ] Replace placeholder trailing-12 MLR calculation with true 12-period rolling calculation.

### 2026-05-07 First Console UI Slice

- [x] Added first Strategic Purchasing Console page at `src/app/(admin)/analytics/page.tsx`.
  - Portfolio metric strip.
  - Scheme performance grid with MLR, contribution, claims, sparkline, and alert count.
  - Provider scorecard panel.
  - Risk composition panel.
  - Renewal Watch placeholder panel for the next workspace slice.
- [x] Added route-level loading skeleton at `src/app/(admin)/analytics/loading.tsx`.
- [x] Added "Strategic Purchasing" sidebar item under Insights in `src/components/layouts/AdminSidebar.tsx`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Data will remain empty until the analytics migration is applied and `analytics.refreshFoundation` or the analytics worker has populated the fact/snapshot tables.
- [ ] The page currently uses `ROLES.ANY_STAFF`; tighten this before production exposure if only underwriting/finance/admin roles should access portfolio purchasing analytics.

### 2026-05-07 Renewal Pipeline Slice

- [x] Added `refreshRenewalAnalyses()` in `src/server/services/analytics-refresh.service.ts`.
  - Finds active schemes renewing in the next 90 days.
  - Computes trailing 12-month MLR and current-year MLR from analytics facts.
  - Uses a default target MLR of `75%`.
  - Uses a default inflation assumption of `8%`.
  - Stores top five ICD cost drivers.
  - Stores top ten utilizers as anonymized summary rows.
  - Stores simulator defaults in `RenewalAnalysis.simulatorDefaults`.
- [x] Included renewal analysis generation in `refreshFoundation()`.
- [x] Updated analytics job logging to include renewal analysis rows.
- [x] Added `AnalyticsService.getRenewalPipeline()`.
- [x] Added `analytics.renewalPipeline` tRPC query.
- [x] Replaced the `/analytics` Renewal Watch placeholder with real 90-day renewal pipeline data.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Product/actuarial review is still needed before treating recommendation percentages as binding pricing guidance.

### 2026-05-07 Analytics Demo Seed Slice

- [x] Added targeted strategic purchasing analytics demo data in `prisma/seed.ts`.
- [x] Demo seed updates existing corporate schemes with future renewal dates.
- [x] Demo seed creates 16 closed months of internally consistent invoices and payments for the existing groups.
- [x] Demo seed creates matching claims tied to real members, providers, ICD families, benefit categories, claim lines, and claim statuses.
- [x] Demo seed creates differentiated analytics stories:
  - Safaricom: healthy/stable MLR.
  - KCB: watchlist chronic disease pressure.
  - East African Breweries: high renewal risk with inpatient/surgical drivers.
  - Bamburi Cement: critical MLR drift.
  - Twiga Foods: moderate utilization story.
- [x] Demo seed creates member risk profiles so Risk Composition is populated.
- [x] Demo seed creates analytics alerts for MLR drift, provider anomaly, renewal risk, utilization spike, and contribution shortfall.
- [x] Demo seed calls `AnalyticsRefreshService.refreshFoundation({ tenantId })` at the end so facts, snapshots, provider scorecards, and renewal analyses are populated immediately after `npm run db:seed`.
- [x] Demo seed tops up the portfolio to a credible 200+ covered lives.
  - Target portfolio: 246 covered lives including dependants.
  - Spread across Safaricom PLC, KCB Group, East African Breweries, Bamburi Cement, and Twiga Foods.
  - Preserves Safaricom tiering and includes self-funded EABL/Bamburi schemes.
  - Monthly analytics claim generation now scales by group membership size, producing hundreds of dated encounters across the trailing period.
- [x] Demo seed economics made more realistic for corporate medical schemes.
  - Package contribution amounts now represent annual per-life rates: Essential KES 95k, Premier KES 210k, Executive KES 480k.
  - Group contribution rates use plausible blended annual pricing by scheme.
  - Analytics invoices derive monthly amounts from annual rates instead of treating annual rates as monthly rates.
  - Self-funded EABL/Bamburi deposits and minimum balances are corporate-sized, not toy demo values.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Run `npm run db:seed` locally after migrations to verify row counts and visual analytics output.

### 2026-05-07 Actionable Analytics Drilldown Plan

Goal: move the analytics module from signal display into decision support. Users should be able to click a concerning metric, understand what is driving it, and take a privacy-appropriate next step.

Access/privacy model:

- [ ] Internal portfolio users (`SUPER_ADMIN`, underwriting, finance, medical/claims leadership): can view portfolio-level analytics and detailed scheme/provider/renewal/risk drilldowns.
- [ ] HR users: can only view their scheme/group. Prefer aggregate risk/utilization data; named member details only where existing HR permissions already allow it.
- [ ] Broker/intermediary users: can view their own book and scheme/renewal summaries, but should not see named member risk detail.
- [ ] Fund administrators: can view assigned self-funded groups and financial/claims details consistent with the fund module.
- [ ] Members: no portfolio analytics.

Drilldown/action areas:

- [ ] Scheme Drilldown
  - Entry point: click a scheme in `/analytics`.
  - Show contribution vs claims trend by month.
  - Show top ICD/disease drivers.
  - Show benefit category cost mix.
  - Show provider mix for the scheme.
  - Show current open alerts for the scheme.
  - Show renewal recommendation if the scheme is in the renewal pipeline.
  - Actions exposed as first-pass links/buttons: open group record, open reports, review renewal panel, export later.
- [ ] Provider Drilldown
  - Entry point: click a provider in provider scorecard.
  - Show case-mix-adjusted cost over time.
  - Compare provider against peer/internal benchmarks.
  - Show top ICD families, claim volume, rejection rate.
  - Actions: flag provider review, tariff review, evidence pack later.
- [ ] Renewal Workspace
  - Entry point: click a renewal in Renewal Watch.
  - Show trailing performance, cost drivers, recommendation, simulator.
  - Actions: save scenario, export renewal pack, create follow-up task later.
- [ ] Alert Inbox
  - Entry point: open alert count or sidebar subitem.
  - Show severity/status/type stream.
  - Actions: acknowledge, resolve, add note, assign/escalate later.
- [ ] Member Risk Workbench
  - Entry point: click risk tier segment.
  - Internal-only named member list.
  - HR/broker views should remain aggregated/anonymized.

Implementation sequence:

- [ ] Slice A: Scheme drilldown service/API/page and link from console.
- [x] Slice B: Alert inbox read/action foundation and link from console alert count.
- [x] Slice C: Renewal workspace detail and simulator.
- [x] Slice D: Provider drilldown.
- [x] Slice E: Role-scoped access enforcement for analytics reads/pages.
- [ ] Slice F: Export/action artifacts for scheme packs and renewal packs.

### 2026-05-07 Scheme Drilldown Slice

- [x] Added `AnalyticsService.getSchemeDetail()`.
  - Returns scheme summary, monthly contribution/claims trend, benefit category spend, ICD drivers, provider mix, current alerts, renewal recommendation, and recent claims.
  - Reads from analytics fact/snapshot tables where possible.
  - Pulls recent claim rows from transactional claims so internal users can action specific records.
- [x] Added `analytics.schemeDetail` tRPC query.
- [x] Linked scheme names in `/analytics` to `/analytics/schemes/[groupId]`.
- [x] Added scheme drilldown page at `src/app/(admin)/analytics/schemes/[groupId]/page.tsx`.
  - Includes trend panel.
  - Includes action links to group record, repricing workbench, and reports.
  - Includes disease driver, benefit mix, provider mix, current alerts, recent claims, and renewal recommendation panels.
- [x] Added loading skeleton at `src/app/(admin)/analytics/schemes/[groupId]/loading.tsx`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Privacy note: recent named claims are internal-only and need role-scoped redaction before HR/intermediary exposure.

### 2026-05-07 Alert Inbox Slice Plan

Goal: make analytics alerts actionable from the Strategic Purchasing Console and scheme drilldown. The first version should support a practical internal work queue: filter, acknowledge, resolve with note, and jump back to the related scheme/provider/member record where possible.

Scope for this slice:

- [ ] Add service methods for alert listing and status transitions.
  - [x] List alerts by status, severity, type, group, provider, member, and intermediary scope.
  - [x] Enrich rows with group/provider/member/intermediary labels without adding new schema relations.
  - [x] Return summary counts by status/severity so the inbox can show the workload at a glance.
  - [x] Acknowledge only `OPEN` alerts; keep already resolved alerts unchanged.
  - [x] Resolve `OPEN` or `ACKNOWLEDGED` alerts with optional resolution note.
- [x] Add tRPC procedures for alert list/action operations.
  - [x] `analytics.alerts`
  - [x] `analytics.acknowledgeAlert`
  - [x] `analytics.resolveAlert`
- [x] Add server actions for the server-rendered inbox page.
  - [x] Use existing `requireRole(ROLES.ANY_STAFF)` guard for now.
  - [x] Write audit entries for acknowledge/resolve actions.
  - [x] Revalidate `/analytics`, `/analytics/alerts`, and affected scheme drilldown paths.
- [x] Build `/analytics/alerts`.
  - [x] Filter tabs/links for active vs resolved status.
  - [x] Severity/type/group context visible on each row.
  - [x] Inline acknowledge and resolve controls.
  - [x] Stable, dense layout consistent with the analytics console.
- [x] Link alert entry points.
  - [x] Portfolio Open Alerts metric -> `/analytics/alerts`.
  - [x] Scheme table alert count -> `/analytics/alerts?groupId=...`.
  - [x] Scheme drilldown Current Alerts panel -> `/analytics/alerts?groupId=...`.
- [x] Added route-level loading skeleton at `src/app/(admin)/analytics/alerts/loading.tsx`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Role/privacy note: inbox remains internal staff scoped via `ROLES.ANY_STAFF`; tighten before exposing to HR/intermediary users.

Out of scope for this slice:

- [ ] Assignment/escalation workflow.
- [ ] Alert detail page.
- [ ] Automatic alert generation thresholds beyond seeded/current data.
- [ ] HR/broker redaction rules beyond current internal staff guard.

### 2026-05-07 Renewal Workspace Slice Plan

Goal: turn Renewal Watch from a passive list into a pricing decision workspace. Users should be able to open a scheme renewal, see the analytical basis, change core assumptions, and jump to existing operational repricing/quotation flows.

Existing repo context to reuse:

- [x] `RenewalAnalysis` already stores trailing MLR, current-year MLR, target MLR, projected claims, recommended contribution, ICD drivers, anonymized top utilizers, and simulator defaults.
- [x] `/groups/[id]/reprice` already exists as a simpler operational renewal repricing workbench.
- [x] `/quotations/calculator` already exists as the follow-on quote creation entry point.
- [x] `/analytics` Renewal Watch already uses `AnalyticsService.getRenewalPipeline()`.

Scope for this slice:

- [ ] Add `AnalyticsService.getRenewalWorkspace()`.
- [x] Add `AnalyticsService.getRenewalWorkspace()`.
  - [x] Load the renewal analysis by `groupId`.
  - [x] Enrich with group, package, intermediary, active member count, open renewal/MLR alerts, recent MLR trend, top ICD drivers, and anonymized high utilizers.
  - [x] Return simulator defaults from stored JSON, with safe fallbacks.
- [x] Add `AnalyticsService.simulateRenewalFromBase()`.
  - [x] Inputs: target MLR, inflation assumption, membership change percentage, contribution adjustment percentage.
  - [x] Outputs: projected claims, required contribution, proposed contribution, proposed rate per member, MLR after proposed change, surplus/shortfall, and break-even adjustment.
  - [x] Keep formula deterministic and visible; do not persist scenarios yet.
- [x] Add tRPC procedures.
  - [x] `analytics.renewalWorkspace`
  - [x] `analytics.simulateRenewal`
- [x] Build `/analytics/renewals/[groupId]`.
  - [x] Header with renewal date, days remaining, current recommendation, and action links.
  - [x] Metric cards for trailing MLR/current MLR/current contribution/projected claims.
  - [x] Simulator form using query params so assumptions are shareable and reload-safe.
  - [x] Disease driver and anonymized top utilizer panels.
  - [x] Recent MLR trend panel.
  - [x] Active alert panel linked to `/analytics/alerts?groupId=...`.
- [x] Link renewal entry points.
  - [x] Renewal Watch rows -> `/analytics/renewals/[groupId]`.
  - [x] Scheme drilldown Renewal Recommendation panel -> `/analytics/renewals/[groupId]`.
- [x] Add route loading skeleton at `src/app/(admin)/analytics/renewals/[groupId]/loading.tsx`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Role/privacy note: renewal workspace remains internal staff scoped via `ROLES.ANY_STAFF`; tighten before HR/intermediary exposure.

Out of scope for this slice:

- [ ] Persist saved scenarios.
- [ ] Export renewal pack.
- [ ] Create tasks/follow-ups.
- [ ] Actuarial approval workflow.

### 2026-05-08 Provider Drilldown Slice

- [x] Added `AnalyticsService.getProviderDetail()` in `src/server/services/analytics.service.ts`.
  - Loads provider identity (name, type, tier, county, contract status/dates, services offered).
  - Returns current period scorecard metrics (adjusted cost, average cost, CMI, rejection rate).
  - Builds scorecard trend history (last 12 periods).
  - Peer comparison: other providers in same tier from latest period, ranked by adjusted cost.
  - Top ICD families, benefit category mix, and scheme/group mix from `AnalyticsEncounterFact`.
  - Open alerts scoped to this provider.
  - Recent 10 claims with member and status detail (internal-only).
- [x] Added `analytics.providerDetail` tRPC query in `src/server/trpc/routers/analytics.ts`.
- [x] Built `/analytics/providers/[providerId]/page.tsx`.
  - Header with provider name, type, county, contract status, and tier badge.
  - Metric cards for adjusted cost, average claim, CMI, and rejection rate.
  - Scorecard cost trend panel (bar chart by period).
  - Peer comparison panel (inline ranking within same tier).
  - ICD drivers, benefit mix, and scheme mix panels (with scheme links to `/analytics/schemes/[groupId]`).
  - Open alerts inline panel.
  - Recent claims table (claim number links to `/claims/[id]`).
  - Action links to `/providers/[id]`, `/analytics/alerts?providerId=...`, and `/reports/provider-statements`.
- [x] Added route loading skeleton at `/analytics/providers/[providerId]/loading.tsx`.
- [x] Linked provider scorecard rows in `/analytics` to `/analytics/providers/[providerId]`.
- [x] Linked provider mix rows in scheme drilldown to `/analytics/providers/[providerId]`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Privacy note: recent named claims are internal-only; tighten before HR/intermediary exposure.

### 2026-05-08 Reports Drilldown Integration

Goal: connect existing report tables to analytics drilldowns so users can move from summary numbers to decision context in one click.

- [x] Changed cell type in `src/app/(admin)/reports/[reportType]/page.tsx` from `string[][]` to `(string | { text: string; href: string })[][]` — backward-compatible; plain strings still render as text.
- [x] Updated table renderer to output `<Link>` for link cells, plain text for strings.
- [x] Updated `getLossRatioData`: includes group `id`, group name column is now a link to `/analytics/schemes/[groupId]`.
- [x] Updated `getClaimsExperienceData`: aggregates on group `id` (was name), group name column is now a link to `/analytics/schemes/[groupId]`.
- [x] Updated `getProviderStatementsData`: includes provider `id`, provider name column is now a link to `/analytics/providers/[providerId]`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.

### 2026-05-08 Gap Fixes After Review

- [x] Fixed analytics report CSV export gap in `src/app/api/reports/[reportType]/export/route.ts`.
  - Added `analytics-portfolio-mlr`.
  - Added `analytics-scheme-profitability`.
  - Added `analytics-provider-performance`.
  - Added `analytics-renewal-recommendations`.
  - Added `analytics-risk-distribution`.
  - Export rows serialize drilldown link cells as plain text because CSV cannot carry app links.
- [x] Fixed provider tier tone mismatch in `/analytics/providers/[providerId]`.
  - Replaced non-schema `PREFERRED` tier check with schema-valid `PANEL`.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.

### 2026-05-08 Role-Scoped Analytics Access Slice

Goal: prevent broad portfolio analytics leakage when non-portfolio roles reach analytics code paths directly or through APIs.

Implemented access helper:

- [x] Added `src/lib/analytics-access.ts`.
  - `SUPER_ADMIN`, claims, finance, underwriting, customer service, medical, and reports viewer keep tenant-wide analytics scope.
  - `HR_MANAGER` resolves to `session.user.groupId`; no group means no analytics access.
  - `BROKER_USER` resolves `User.brokerId` from the database for intermediary-book scoping.
  - `FUND_ADMINISTRATOR` resolves managed self-funded schemes through `Group.fundAdministrators`.

Implemented service/API enforcement:

- [x] Extended analytics service scope with `allowedGroupIds` and `noAccess`.
- [x] Scoped portfolio summary to recompute scoped MLR from fact tables instead of using the global portfolio snapshot.
- [x] Scoped scheme grid/detail, renewal pipeline/workspace, risk composition, alerts, provider scorecard, and provider detail.
- [x] Scoped provider detail and peer lists so fund/broker-style users only see providers present in their permitted group/book facts.
- [x] Scoped alert acknowledge/resolve mutations with the same group allow-list rules used by alert reads.
- [x] Updated analytics tRPC router to derive scope from the authenticated session before every read/action procedure.
- [x] Hardened tRPC scope merging so caller input cannot override broker intermediary scope, and HR scope carries an own-group allow-list.
- [x] Restricted `analytics.refreshFoundation` to `SUPER_ADMIN` through `ROLES.ADMIN_ONLY`.
- [x] Updated analytics alert server actions to use the same scope before acknowledge/resolve.

Implemented route/report enforcement:

- [x] Updated `/analytics`, `/analytics/schemes/[groupId]`, `/analytics/renewals/[groupId]`, `/analytics/providers/[providerId]`, and `/analytics/alerts` to call `getAnalyticsAccessScope()`.
- [x] Updated analytics-backed report pages to apply the same group scope for the five `analytics-*` report types.
- [x] Updated analytics report CSV exports to apply the same group scope for the five `analytics-*` report types.

Still intentionally unchanged:

- [ ] HR and broker users are still blocked from `(admin)` analytics routes by the admin layout. The service/API scope is defensive and ready for future HR/broker portal surfaces.
- [ ] Non-analytics report types are not fully scoped for `FUND_ADMINISTRATOR`; fund admins normally use the fund portal. If direct admin reports exposure is desired, scope each transactional report separately.
- [ ] Named recent claim rows are still hidden only for `REPORTS_VIEWER`; additional redaction may be needed before exposing HR/broker analytics surfaces.
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run build`.

### 2026-05-08 Member Risk Workbench Slice

Goal: make the Risk Composition panel actionable by adding a role-scoped `/analytics/risk` workbench with filters, privacy-aware member identifiers, utilization-to-cap signals, and links to existing member records where authorized.

Implementation checklist:

- [x] Add `AnalyticsService.getMemberRiskProfiles(scope, filters)`.
  - Reuse `MemberRiskProfile` as the read model.
  - Filter by risk tier, group/scheme, chronic tag, utilization-to-cap minimum, and projected exceed horizon.
  - Apply the same analytics role scope as the rest of the module.
  - Preserve broker/intermediary scoping defensively even though broker routes do not expose this page yet.
  - Return summary cards, tier counts, chronic tag counts, scheme filter options, and paged rows.
- [x] Add `analytics.memberRiskProfiles` tRPC procedure.
- [x] Add `/analytics/risk/page.tsx`.
  - Server-rendered, consistent with the existing analytics pages.
  - Internal clinical/ops users can see member names and link to member detail.
  - `REPORTS_VIEWER` and `FUND_ADMINISTRATOR` see anonymized member references and no member-detail link.
  - HR/broker users remain blocked by the admin layout today, but the service scope should still be safe if reused later.
- [x] Add `/analytics/risk/loading.tsx`.
- [x] Link Risk Composition tiers from `/analytics` into `/analytics/risk?tier=...`.
- [x] Update handoff checkboxes and remaining-work notes.
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run build`.

### 2026-05-08 Member Risk Profile ETL Slice

Goal: replace seed-only member risk profiles with deterministic analytics refresh output sourced from `AnalyticsEncounterFact` and recent pre-authorization activity.

Implemented:

- [x] Added `AnalyticsRefreshService.refreshMemberRiskProfiles({ tenantId?, groupId?, from?, to? })`.
  - Groups trailing-period encounter facts by member.
  - Scores utilization-to-cap using the member package annual limit.
  - Scores claim frequency, chronic ICD tags, case-mix intensity, and recent claims/preauth activity.
  - Maps ICD families into practical chronic tags such as diabetes, hypertension, maternity, oncology, renal-risk, respiratory-risk, and surgical-risk.
  - Upserts into `MemberRiskProfile` by `memberId`, preserving idempotent refresh behavior.
- [x] Added `groupId` to the shared refresh range type so group-specific rebuilds can target member risk profiles.
- [x] Included member risk profile refresh inside `refreshFoundation()`.
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run build`.

### 2026-05-08 Analytics Alert ETL Slice

Goal: generate operational analytics alerts from refreshed facts and scorecards instead of relying on seed-only alert rows.

Implemented:

- [x] Added `AnalyticsRefreshService.refreshAnalyticsAlerts({ tenantId?, groupId? })`.
  - Deletes and recreates only alerts with `context.source = "analytics-refresh"`.
  - Leaves seeded/manual alerts with other source markers untouched.
  - Generates `MLR_DRIFT` alerts from renewal trailing MLR vs target.
  - Generates `RENEWAL_RISK` alerts from recommended contribution increases inside the 90-day horizon.
  - Generates `CONTRIBUTION_SHORTFALL` alerts from recent contribution collection rates and outstanding amounts.
  - Generates `UTILIZATION_SPIKE` alerts from recent scheme claim cost vs prior comparable period.
  - Generates `PROVIDER_ANOMALY` alerts from latest provider scorecards vs peer adjusted-cost averages.
  - Generates `MEMBER_RISK` alerts from high/critical member risk profiles and utilization-to-cap pressure.
- [x] Included alert refresh inside `refreshFoundation()`.
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run build`.

### 2026-05-08 Analytics-Native Reports

Goal: add five analytics-backed reports to the reports listing using fact/snapshot tables rather than re-querying all transactional data.

- [x] Added "Strategic Analytics" report group in `src/app/(admin)/reports/page.tsx` with five entries.
- [x] Added five REPORT_TITLES entries and data fetchers in `src/app/(admin)/reports/[reportType]/page.tsx`:
  - `analytics-portfolio-mlr`: MLR by scheme from `AnalyticsMlrSnapshot` (SCHEME grain). Group name links to scheme drilldown.
  - `analytics-scheme-profitability`: Contribution vs claims, surplus/deficit, MLR status per scheme. Group name links to scheme drilldown.
  - `analytics-provider-performance`: Full `ProviderScorecard` ranking for latest period with CMI, rejection rate, claim/member counts. Provider name links to provider drilldown.
  - `analytics-renewal-recommendations`: All `RenewalAnalysis` rows with trailing MLR, target, recommended contribution, adjustment %. Scheme name links to renewal workspace.
  - `analytics-risk-distribution`: `MemberRiskProfile` grouped by scheme and risk tier with avg risk score and avg utilization-to-cap. Scheme name links to scheme drilldown.
- [x] Wired all five fetchers into the route dispatch block.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.

## Already Implemented Repo Capabilities To Reuse

The system already has several pieces that should be fitted into this module rather than replaced:

- Existing simple loss-ratio views:
  - `src/components/dashboard/DashboardCharts.tsx` has `LossRatioGauge`.
  - `src/app/(admin)/dashboard/page.tsx` computes basic billed/approved/loss-ratio data.
  - `src/app/(hr)/hr/utilization/page.tsx` has HR utilization and loss-ratio calculations.
  - `src/app/(admin)/reports/[reportType]/page.tsx` includes loss-ratio and utilization report loaders.
  - `src/server/trpc/routers/reports.ts` includes simple reports and claim summaries.
- Existing renewal context:
  - `src/app/(admin)/groups/[id]/reprice/page.tsx` has basic historical claims/contribution repricing logic.
  - `src/app/broker/renewals/page.tsx` has broker renewal list behavior.
  - `src/server/jobs/renewal-reminder.job.ts` and queue setup already exist.
- Existing intermediary generalization:
  - `Broker` now represents brokers, tied agents, independent agents, third parties, internal sales, affinity partners, and digital channels.
  - Use `intermediaryCategory`, `commissionBasis`, IRA-registration fields, and KYC fields where analytics need sales-source segmentation.
- Existing performance work:
  - Auth/session request dedupe, layout caching, dashboard query optimization, indexes, and loading skeleton work have already been started in previous optimization passes.

## Strategic Decisions

- [ ] Use read-optimized analytics tables alongside the transactional schema. Do not make dashboards query every transactional table directly once facts exist.
- [ ] Start with Prisma-backed fact tables and service queries. Add materialized views/raw SQL snapshots where they clearly reduce repeated work.
- [ ] Keep source-of-truth data in existing transactional models. Analytics facts are derived and can be rebuilt.
- [ ] Keep algorithms deterministic and explainable. The spec explicitly calls for practical statistics, not ML.
- [ ] Respect the broker/agent/intermediary model. Any "broker book" analytics should mean intermediary book and should not assume IRA registration is required.
- [ ] Keep role behavior unchanged. Admin/fund-facing analytics can see portfolio views; HR users should only see their group; broker/intermediary users should only see their book.
- [ ] Prefer additive routes/components. Reuse existing reports and dashboard components where useful, but avoid destabilizing current dashboards.

## Proposed User-Facing Areas

- [ ] Strategic Purchasing Console
  - Suggested admin route: `src/app/(admin)/analytics/page.tsx` or `src/app/(admin)/strategic-purchasing/page.tsx`.
  - Add sidebar entry under an Insights/Reports area in `src/components/layouts/AdminSidebar.tsx`.
  - First viewport should be the working console, not a marketing page.
- [ ] Renewal Intelligence Workspace
  - Suggested route: `src/app/(admin)/analytics/renewals/page.tsx`.
  - Optional scheme detail route: `src/app/(admin)/analytics/renewals/[groupId]/page.tsx`.
- [x] Member Risk Workbench
  - Suggested route: `src/app/(admin)/analytics/risk/page.tsx`.
- [ ] Alert Inbox
  - Suggested route: `src/app/(admin)/analytics/alerts/page.tsx`.

## Data Mapping Notes

Confirm exact field names during implementation before editing schema or services.

| Analytics Need | Likely Source |
| --- | --- |
| Scheme/group | `Group` |
| Tenant | `tenantId` on source models |
| Package/category/tier | `Package`, `BenefitTier`, group package fields |
| Intermediary book | `Group.brokerId` to `Broker` |
| Member attributes | Implemented with `Member.dateOfBirth`, `Member.gender`, `Member.relationship`, `principal/dependents`; no member county exists yet |
| Encounter/claim date | Implemented with `Claim.dateOfService`; stored with `encounterMonth` as month start |
| Facility/provider | `Claim.providerId`, `Provider` fields |
| ICD/disease family | Implemented from `ClaimLine.icdCode` first, otherwise primary claim diagnosis JSON; normalized to first three ICD characters |
| Gross cost | Implemented from `ClaimLine.billedAmount`; falls back to `Claim.billedAmount` when a claim has no lines |
| Benefit paid | Implemented from `ClaimLine.approvedAmount`; falls back to `Claim.approvedAmount` |
| Member co-contribution | Implemented from `CoContributionTransaction.finalAmount`; falls back to `Claim.memberLiability`; prorated across lines |
| Rejected amount | Implemented as billed less approved, floored at zero |
| Contribution | Implemented from `Invoice.totalAmount`; payment-level facts are not yet split out |
| Paid contribution | Implemented from `Invoice.paidAmount` |
| Outstanding contribution | Implemented from `Invoice.balance` |
| Renewal date | `Group.renewalDate` |

## Schema Action Plan

### Phase 0: Pre-Implementation Audit

- [x] Inspect complete Prisma definitions for `Claim`, `ClaimLine`, `Provider`, `BenefitUtilization`, `CoContributionTransaction`, `BenefitTier`, and any diagnosis models.
- [x] Record the exact source fields to use in the data mapping table above.
- [x] Check existing migrations for naming/index conventions before adding a migration.
- [ ] Confirm whether PostgreSQL extensions/materialized views are already used.
- [ ] Confirm current tRPC router conventions and admin route guard patterns.

### Phase 1: Analytics Fact Schema

Add Prisma models and migration. Proposed models:

- [x] `AnalyticsEncounterFact`
  - Source keys: claim id, claim line id when available.
  - Dimensions: tenant, group, package/tier, intermediary, member, provider/facility, date, encounter type, ICD family, geography, age band, gender, relationship/family-size band.
  - Measures: gross cost, benefit paid, member co-contribution, rejected amount, case-mix weight.
  - Indexes: tenant/date, group/date, provider/date, intermediary/date, ICD/date, member/date.
- [x] `AnalyticsContributionFact`
  - Source keys: invoice id/payment id/period.
  - Dimensions: tenant, group, package/tier, intermediary, period start/end, member count.
  - Measures: gross contribution, paid contribution, outstanding amount.
  - Indexes: tenant/period, group/period, intermediary/period.
- [x] `CaseMixWeight`
  - ICD family or encounter category, effective dates, weight, optional notes.
  - Seed with pragmatic defaults.
- [x] `AnalyticsMlrSnapshot`
  - Grain: tenant, optional group, optional tier/category, optional intermediary, period, trailing period.
  - Measures: gross contribution, paid contribution, gross cost, benefit paid, co-contribution, MLR, trailing 12-month MLR.
- [x] `ProviderScorecard`
  - Provider, period, claim count, member count, gross cost, adjusted cost, average cost, case-mix index, denial/rejection rate if available.
- [x] `MemberRiskProfile`
  - Member, group, tenant, risk tier, score, chronic tags, utilization to cap, projected exceed date, last calculated date.
- [x] `RenewalAnalysis`
  - Group, renewal date, trailing MLR, target MLR, contribution recommendation, adjustment percent, top ICD drivers JSON, top utilizing members anonymized JSON, simulator defaults.
- [x] `AnalyticsAlert`
  - Tenant, optional group/provider/member/intermediary, type, severity, status, title, message, metric values, created/acknowledged/resolved metadata.

Proposed enums:

- [x] `RiskTier`: `LOW`, `MODERATE`, `HIGH`, `CRITICAL`
- [x] `AnalyticsAlertType`: `MLR_DRIFT`, `UTILIZATION_SPIKE`, `PROVIDER_ANOMALY`, `RENEWAL_RISK`, `MEMBER_RISK`, `CONTRIBUTION_SHORTFALL`
- [x] `AnalyticsAlertSeverity`: `INFO`, `WARNING`, `CRITICAL`
- [x] `AnalyticsAlertStatus`: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`
- [x] `AnalyticsEncounterType`: mirrors existing claim `ServiceType` values.

### Phase 2: ETL And Refresh

- [x] Add analytics refresh service, likely `src/server/services/analytics-refresh.service.ts`.
- [ ] Add idempotent backfill functions:
  - [x] `refreshEncounterFacts({ tenantId?, from?, to? })`
  - [x] `refreshContributionFacts({ tenantId?, from?, to? })`
  - [x] `refreshCaseMixWeights()`
  - [x] `refreshMlrSnapshots({ tenantId?, from?, to? })`
  - [x] `refreshProviderScorecards({ tenantId?, from?, to? })`
  - [x] `refreshMemberRiskProfiles({ tenantId?, groupId? })`
  - [x] `refreshRenewalAnalyses({ tenantId?, daysAhead: 90 })`
  - [x] `refreshAnalyticsAlerts({ tenantId?, groupId? })`
- [x] Use upsert/delete-and-recreate by deterministic source keys so reruns are safe.
- [x] Add queue job integration if the existing queue worker supports periodic jobs.
- [x] Add a manual admin-only refresh action or script for local/dev use.
- [ ] Do not run destructive analytics rebuilds against production unless explicitly requested.

### Phase 3: Analytics Query Service

Create a read service, likely `src/server/services/analytics.service.ts`.

- [x] Portfolio summary:
  - Portfolio MLR, covered members, contribution YTD, claims YTD, open alerts.
- [x] Scheme grid:
  - Group, member count, contribution, claims, MLR, trailing MLR sparkline data, alert badge.
- [ ] MLR breakdowns:
  - By scheme, benefit tier/category, family-size band, intermediary book, geography, disease family.
- [x] Provider scorecard:
  - Rank providers by case-mix-adjusted cost.
  - Include claim count, total cost, adjusted cost, average cost, denial/rejection rate where available.
- [x] Risk composition:
  - Count and percentage by risk tier.
- [x] Member risk list:
  - Filter by risk tier, group, chronic tag, projected cap exceed date.
- [ ] Renewal pipeline:
  - Schemes due in next 90 days, trailing MLR, target MLR, recommendation, alert state.
- [ ] Renewal workspace:
  - [x] Current vs target MLR, top ICD drivers, anonymized high utilizers, simulator calculations.
- [ ] Alert list/actions:
  - Filter by severity/status/type.
  - Acknowledge, resolve, and add resolution note if the existing audit pattern supports it.

### Phase 4: API/TRPC Layer

- [x] Add `src/server/trpc/routers/analytics.ts`.
- [x] Register router in `src/server/trpc/router.ts`.
- [x] Use existing auth/RBAC helpers and cached auth helper from previous optimization work.
- [ ] Proposed procedures:
  - [x] `analytics.portfolioSummary`
  - [x] `analytics.schemeGrid`
  - [ ] `analytics.schemeDetail`
  - [x] `analytics.providerScorecard`
  - [x] `analytics.riskComposition`
  - [x] `analytics.memberRiskProfiles`
  - [x] `analytics.renewalPipeline`
  - [x] `analytics.renewalWorkspace`
  - [x] `analytics.simulateRenewal`
  - [x] `analytics.alerts`
  - [x] `analytics.acknowledgeAlert`
  - [x] `analytics.resolveAlert`
- [x] Enforce role scoping at the procedure/service boundary for analytics service reads/actions:
  - Admin/internal roles: tenant-scoped portfolio access.
  - Fund administrators: assigned self-funded scheme access through `Group.fundAdministrators`.
  - HR: group-scoped only when a future HR analytics surface calls the service/API.
  - Broker/intermediary: only groups tied to that intermediary when a future broker analytics surface calls the service/API.
  - Member: no portfolio analytics surface is currently exposed.

### Phase 5: Strategic Purchasing Console UI

- [ ] Build reusable analytics components in `src/components/analytics/`.
- [x] Add route-level `loading.tsx` skeletons for new analytics pages.
- [x] Console header strip:
  - Portfolio MLR.
  - Members covered.
  - Contribution YTD.
  - Open alert count.
- [x] Scheme grid:
  - Scheme/group name.
  - Member count.
  - Contribution.
  - Current and trailing MLR.
  - Sparkline.
  - Alert badge.
- [x] Provider performance grid:
  - Case-mix-adjusted ranking.
  - Internal/external indicator where available.
  - Claim volume and adjusted cost.
- [x] Risk composition visualization:
  - Compact bars by tier.
- [x] Renewal pipeline:
  - Next 90 days, recommendation and risk state.
- [ ] Geographic/disease pattern section:
  - Start with table/choropleth-ready layout if map asset/data is not yet ready.

### Phase 6: Renewal Intelligence Workspace

- [x] Build scheme renewal detail page.
- [x] Show trailing 12-month MLR and current year MLR.
- [x] Show top five ICD/disease cost drivers.
- [x] Show anonymized top ten utilizing members.
- [x] Add contribution adjustment recommendation.
- [x] Add simulator controls:
  - [x] Target MLR.
  - [x] Inflation assumption.
  - [x] Contribution increase/decrease percentage.
  - Optional benefit cap adjustment if current benefit model supports it.
- [x] Keep calculations explainable on-screen through labels/metric names, not verbose instructional text.

### Phase 7: Member Risk Workbench

- [x] Build risk profile list.
- [x] Filters:
  - Risk tier.
  - Group/scheme.
  - Chronic tag.
  - Utilization-to-cap range.
  - Projected exceed date.
- [x] Show member identifiers according to role/privacy rules.
- [x] Show chronic tags and utilization-to-cap bars.
- [x] Link to existing member detail where authorized.

### Phase 8: Alert Engine And Inbox

- [ ] Define alert thresholds in code first, with future config extension.
- [ ] Generate alert types:
  - MLR drift.
  - Utilization spike.
  - Provider anomaly.
  - Renewal risk.
  - Contribution shortfall.
  - Member risk escalation.
- [x] Add alert inbox UI.
- [x] Add acknowledge/resolve actions.
- [x] Add audit/activity logging if existing patterns make that straightforward.

### Phase 9: Reports And Exports

- [x] Integrate new analytics into existing reports area.
- [x] Add the five reports from the spec under a new "Strategic Analytics" group:
  - [x] Portfolio MLR (`analytics-portfolio-mlr`).
  - [x] Scheme profitability (`analytics-scheme-profitability`).
  - [x] Provider performance (`analytics-provider-performance`).
  - [x] Renewal recommendations (`analytics-renewal-recommendations`).
  - [x] Risk tier distribution (`analytics-risk-distribution`).
- [x] Existing report routes unchanged.
- [x] Drilldown links wired in `loss-ratio`, `claims-experience`, and `provider-statements` reports.
- [x] Export CSV for the five new analytics reports.

### Phase 10: Seed Data

- [x] Extend `prisma/seed.ts` or add a dedicated analytics seed helper.
- [x] Seed case-mix weights.
- [x] Generate enough synthetic data to demonstrate trends:
  - 16 months encounters.
  - 16 months contribution/invoice/payment data.
  - Multiple schemes with varied MLR.
  - Internal and external providers/facilities.
  - Precomputed renewal analyses.
  - 5 demo alerts.
- [ ] For local practicality, start with a smaller default seed and optionally gate the 50,000+ encounter stress seed behind an env flag or separate command.

## Algorithm Notes

### MLR

Base formula from the hardening spec:

```text
MLR = SUM(benefitPaid + memberCoContribution) / SUM(grossContribution)
```

Implementation notes:

- [x] Use paid contribution for cash-realized views and gross contribution for pricing views. Label both clearly if both appear.
- [ ] Use trailing 12-month MLR for renewal and portfolio trend.
- [x] Store numerator/denominator values alongside ratios for auditability.

### Case-Mix Adjustment

Formula from the hardening spec:

```text
caseMixAdjustedCost = grossCost / caseMixWeight
```

Implementation notes:

- [x] Use ICD family weights when diagnosis data exists.
- [x] Fall back to encounter-type or default weight of `1.0`.
- [x] Track defaulted weights so provider rankings do not look more precise than the data supports.

### Renewal Recommendation

Initial deterministic approach:

```text
requiredContribution = projectedClaims / targetMlr
recommendedAdjustmentPct = (requiredContribution - currentContribution) / currentContribution
```

Inputs:

- [x] Trailing 12-month claims.
- [x] Current contribution.
- [x] Target MLR.
- [x] Inflation assumption.
- [ ] Membership change assumption when available.

### Risk Stratification

Initial explainable scoring inputs:

- [x] Recent claims cost.
- [x] Claim frequency.
- [x] Chronic/disease-family tags.
- [x] Utilization-to-cap percentage.
- [x] Recent preauthorization volume.
- [x] Projected exceed date.

Avoid irreversible business rules until confirmed with product stakeholders.

## Verification Plan

Run after relevant implementation phases:

- [x] `npx prisma validate`
- [x] `npx prisma generate`
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [ ] `npm run lint`

Known baseline note: `npm run lint` was rerun during the role-scoped QA pass. It still fails with unrelated baseline errors:

- `src/components/dashboard/DashboardCharts.tsx` has `react-hooks/set-state-in-effect`.
- `src/server/services/providers.service.ts` has `no-explicit-any` errors.
- `src/server/services/secure-checkin/secure-checkin.service.ts` has `no-require-imports` errors.
- Current lint run also reports unused-variable warnings in older admin/report/fund files. Analytics-specific warnings introduced during the recent slices were removed.

Manual QA:

- [ ] Admin can open Strategic Purchasing Console.
- [ ] HR user only sees their group/scheme data.
- [ ] Broker/intermediary user only sees their book.
- [ ] Unauthorized roles redirect or receive unauthorized state according to existing app behavior.
- [ ] Seeded data shows varied MLR, provider ranking, risk tiers, renewal recommendations, and alerts.
- [ ] New loading states appear quickly and avoid layout shifts.
- [ ] Dashboard pages still build and existing reports still work.

## Risks And Open Questions

- [x] Exact claim and diagnosis fields must be confirmed before ETL implementation.
- [x] Member co-contribution source may not be consistently available; first version uses `CoContributionTransaction.finalAmount` or `Claim.memberLiability`.
- [x] Provider internal/external classification uses `Provider.tier === OWN`.
- [ ] Materialized views may be useful, but should not be the first blocker unless repeated queries are too slow.
- [ ] A full 50,000+ encounter seed may be heavy for local development. Use a smaller default and optional stress seed.
- [ ] Renewal recommendations affect pricing conversations, so calculations must be transparent and easy to audit.

## Next Implementation Slice

Completed first build slice:

- [x] Complete Phase 0 audit with exact source fields.
- [x] Add Prisma enums and analytics fact/profile/alert models.
- [x] Create migration.
- [x] Add seed case-mix weights.
- [x] Add encounter and contribution fact backfill service.
- [x] Verify with `npx prisma validate`, `npx prisma generate`, and `npx tsc --noEmit`.

Completed second build slice:

- [x] Add `refreshMlrSnapshots()`.
- [x] Add `refreshProviderScorecards()`.
- [x] Add first read service methods for portfolio summary, scheme grid, and provider ranking.
- [x] Add tRPC router shell for analytics reads.

Recommended next slice:

- [x] Build the first Strategic Purchasing Console UI using the new analytics reads.
- [x] Add route-level loading skeleton for the console.
- [x] Add sidebar navigation entry.
- [x] Tighten role scoping before broad UI exposure, especially HR and intermediary-specific access.
- [x] Build renewal pipeline data and replace the placeholder panel.

### 2026-05-08 Polish: Rendering, Navigation, and Role Enforcement

**Windows text rendering fixes**
- [x] Reports KPI card labels: changed `text-xs uppercase` → `text-[13px] uppercase tracking-normal` (same pattern as all analytics pages).
- [x] Reports data table: added `font-ui` class and changed header row to `text-[13px] uppercase tracking-normal text-avenue-text-muted` matching analytics table style.
- [x] `tabular-nums` added to KPI value cells in reports for consistent number layout on Windows ClearType.
- Provider drilldown page was already correct (`tracking-normal` applied during initial build).

**Navigation**
- [x] Updated `Breadcrumbs.tsx` `SEGMENT_LABELS` to include: `analytics`, `schemes`, `providers`, `renewals`, `alerts`, `fund`, `hr`, `broker`, and all report types (so `/reports/analytics-portfolio-mlr` shows "Portfolio MLR" not a raw slug).
- [x] Fixed ID detection in `Breadcrumbs.tsx`: `isUUID` expanded to `isId()` — now recognises cuid v1 (`c[a-z0-9]{20,}`), cuid v2/nanoid (`[a-z0-9]{20,}`), and UUID formats. These all show as "Detail" instead of raw ID strings.
- [x] Cross-drilldown `from` param support:
  - Scheme drilldown provider links: `?from=scheme&groupId=[id]` → provider page shows "Back to [Scheme Name]".
  - Scheme drilldown renewal link: `?from=scheme` → renewal workspace shows "Back to scheme".
  - Scheme drilldown accepts `?from=report` → shows "Back to reports".
  - Provider drilldown accepts `?from=report` → shows "Back to reports".
  - Renewal workspace accepts `?from=scheme` and `?from=report`.
  - All report → analytics link cells pass `?from=report`.

**Role enforcement**
- [x] Audited current access model:
  - `HR_MANAGER`, `BROKER_USER`, `MEMBER_USER`: **blocked at admin layout** — cannot reach analytics pages.
  - `FUND_ADMINISTRATOR`: NOT blocked by layout — now scoped to assigned self-funded schemes by the analytics access helper and service layer.
  - All other `ANY_STAFF` roles (`SUPER_ADMIN`, `CLAIMS_OFFICER`, `FINANCE_OFFICER`, `UNDERWRITER`, `CUSTOMER_SERVICE`, `MEDICAL_OFFICER`, `REPORTS_VIEWER`, `FUND_ADMINISTRATOR`): can reach all analytics pages.
- [x] Named member data restriction: `REPORTS_VIEWER` role sees aggregated analytics but NOT the "Recent Claims" table in scheme drilldown or provider drilldown. All other ANY_STAFF roles retain full access.
  - Scheme drilldown: `canViewNamedClaims = userRole !== "REPORTS_VIEWER"` — shows message pointing to Claims report instead.
  - Provider drilldown: same — shows message pointing to Provider Statements report.
- [x] `FUND_ADMINISTRATOR` scope: filters analytics service queries to only assigned self-funded schemes via `Group.fundAdministrators`.
- [x] HR/broker portal readiness: analytics service/API now derives group-scoped HR access and intermediary-scoped broker access defensively, although those portals still do not expose analytics routes.

### 2026-05-08 Role-Scoped QA Hardening Pass

Goal: verify the role-access implementation paths and close easy operational gaps before adding new analytics surfaces.

Completed:

- [x] Confirmed package scripts: `npm run db:seed`, `npm run build`, `npm run lint`, and worker-backed analytics refresh are available.
- [x] Confirmed seeded users for manual role checks:
  - `admin@avenue.co.ke / AvenueAdmin2024!` as `SUPER_ADMIN`.
  - `fund@avenue.co.ke / AvenueAdmin2024!` as `FUND_ADMINISTRATOR`.
  - `broker@kaib.co.ke / AvenueAdmin2024!` as broker portal user.
  - `emily.wambui@safaricom.co.ke / AvenueAdmin2024!` as HR user.
- [x] Confirmed `/analytics`, `/analytics/alerts`, `/analytics/risk`, `/analytics/providers/[providerId]`, `/analytics/renewals/[groupId]`, and `/analytics/schemes/[groupId]` are dynamic routes in production build output.
- [x] Updated `runAnalyticsRefreshJob()` logging so operations output includes member risk profile and generated analytics alert counts.
- [x] Ran `npx tsc --noEmit`.
- [x] Ran `npm run build`.
- [ ] Ran `npm run lint`; fails only on known baseline errors/warnings listed in Verification Plan.

Manual/browser QA still required after server/database refresh:

- [ ] Run analytics refresh against the intended dev database only.
- [ ] Login as `SUPER_ADMIN`; verify full analytics portfolio, alerts, risk workbench, provider, scheme, and renewal drilldowns.
- [ ] Login as `FUND_ADMINISTRATOR`; verify `/analytics` only shows assigned self-funded schemes and anonymizes member risk rows.
- [ ] Login as `REPORTS_VIEWER` if/when a seeded user exists; verify named recent claims and member risk names are hidden.
- [ ] Login as HR and broker seeded users; verify admin analytics routes are still blocked by layout and future service/API scopes are ready.
- [ ] Decide whether old non-analytics transactional reports should be fund-admin scoped or hidden from fund admins.

### 2026-05-08 Recommended next slice (as of 2026-05-08):

All four analytics drilldown areas are now complete (Scheme, Alert, Renewal, Provider). Reports integration is done. Remaining work in priority order:

1. **Manual/browser role QA on a refreshed dev DB** — verify SUPER_ADMIN, FUND_ADMINISTRATOR, HR, broker, and REPORTS_VIEWER behavior in the browser.
2. **Transactional report access decision** — decide whether old non-analytics reports should be hidden or scoped for `FUND_ADMINISTRATOR`.
3. **Export artifact actions (Slice F)** — Scheme pack and renewal pack PDF/export flows.
