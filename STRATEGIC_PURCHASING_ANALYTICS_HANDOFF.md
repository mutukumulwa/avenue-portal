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
- [ ] Implement analytics services and API.
- [ ] Implement UI workspaces.
- [x] Add seed data for case-mix weights.
- [ ] Add broader analytics seed data and verification coverage.

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
- [ ] Member Risk Workbench
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
  - [ ] `refreshMlrSnapshots({ tenantId?, from?, to? })`
  - [ ] `refreshProviderScorecards({ tenantId?, from?, to? })`
  - [ ] `refreshMemberRiskProfiles({ tenantId?, groupId? })`
  - [ ] `refreshRenewalAnalyses({ tenantId?, daysAhead: 90 })`
  - [ ] `refreshAnalyticsAlerts({ tenantId? })`
- [x] Use upsert/delete-and-recreate by deterministic source keys so reruns are safe.
- [x] Add queue job integration if the existing queue worker supports periodic jobs.
- [ ] Add a manual admin-only refresh action or script for local/dev use.
- [ ] Do not run destructive analytics rebuilds against production unless explicitly requested.

### Phase 3: Analytics Query Service

Create a read service, likely `src/server/services/analytics.service.ts`.

- [ ] Portfolio summary:
  - Portfolio MLR, covered members, contribution YTD, claims YTD, open alerts.
- [ ] Scheme grid:
  - Group, member count, contribution, claims, MLR, trailing MLR sparkline data, alert badge.
- [ ] MLR breakdowns:
  - By scheme, benefit tier/category, family-size band, intermediary book, geography, disease family.
- [ ] Provider scorecard:
  - Rank providers by case-mix-adjusted cost.
  - Include claim count, total cost, adjusted cost, average cost, denial/rejection rate where available.
- [ ] Risk composition:
  - Count and percentage by risk tier.
- [ ] Member risk list:
  - Filter by risk tier, group, chronic tag, projected cap exceed date.
- [ ] Renewal pipeline:
  - Schemes due in next 90 days, trailing MLR, target MLR, recommendation, alert state.
- [ ] Renewal workspace:
  - Current vs target MLR, top ICD drivers, anonymized high utilizers, simulator calculations.
- [ ] Alert list/actions:
  - Filter by severity/status/type.
  - Acknowledge, resolve, and add resolution note if the existing audit pattern supports it.

### Phase 4: API/TRPC Layer

- [ ] Add `src/server/trpc/routers/analytics.ts`.
- [ ] Register router in `src/server/trpc/router.ts`.
- [ ] Use existing auth/RBAC helpers and cached auth helper from previous optimization work.
- [ ] Proposed procedures:
  - [ ] `analytics.portfolioSummary`
  - [ ] `analytics.schemeGrid`
  - [ ] `analytics.schemeDetail`
  - [ ] `analytics.providerScorecard`
  - [ ] `analytics.riskComposition`
  - [ ] `analytics.memberRiskProfiles`
  - [ ] `analytics.renewalPipeline`
  - [ ] `analytics.renewalWorkspace`
  - [ ] `analytics.simulateRenewal`
  - [ ] `analytics.alerts`
  - [ ] `analytics.acknowledgeAlert`
  - [ ] `analytics.resolveAlert`
- [ ] Enforce role scoping at the procedure/service boundary:
  - Admin/fund roles: tenant-scoped portfolio access.
  - HR: group-scoped only.
  - Broker/intermediary: only groups tied to that intermediary.
  - Member: no portfolio analytics unless a later member-safe surface is designed.

### Phase 5: Strategic Purchasing Console UI

- [ ] Build reusable analytics components in `src/components/analytics/`.
- [ ] Add route-level `loading.tsx` skeletons for new analytics pages.
- [ ] Console header strip:
  - Portfolio MLR.
  - Members covered.
  - Contribution YTD.
  - Open alert count.
- [ ] Scheme grid:
  - Scheme/group name.
  - Member count.
  - Contribution.
  - Current and trailing MLR.
  - Sparkline.
  - Alert badge.
- [ ] Provider performance grid:
  - Case-mix-adjusted ranking.
  - Internal/external indicator where available.
  - Claim volume and adjusted cost.
- [ ] Risk composition visualization:
  - Donut or compact segmented bar.
  - Keep it readable and not card-heavy.
- [ ] Renewal pipeline:
  - Next 90 days, recommendation and risk state.
- [ ] Geographic/disease pattern section:
  - Start with table/choropleth-ready layout if map asset/data is not yet ready.

### Phase 6: Renewal Intelligence Workspace

- [ ] Build scheme renewal detail page.
- [ ] Show trailing 12-month MLR and current year MLR.
- [ ] Show top five ICD/disease cost drivers.
- [ ] Show anonymized top ten utilizing members.
- [ ] Add contribution adjustment recommendation.
- [ ] Add simulator controls:
  - Target MLR.
  - Inflation assumption.
  - Contribution increase/decrease percentage.
  - Optional benefit cap adjustment if current benefit model supports it.
- [ ] Keep calculations explainable on-screen through labels/metric names, not verbose instructional text.

### Phase 7: Member Risk Workbench

- [ ] Build risk profile list.
- [ ] Filters:
  - Risk tier.
  - Group/scheme.
  - Chronic tag.
  - Utilization-to-cap range.
  - Projected exceed date.
- [ ] Show member identifiers according to role/privacy rules.
- [ ] Show chronic tags and utilization-to-cap bars.
- [ ] Link to existing member detail where authorized.

### Phase 8: Alert Engine And Inbox

- [ ] Define alert thresholds in code first, with future config extension.
- [ ] Generate alert types:
  - MLR drift.
  - Utilization spike.
  - Provider anomaly.
  - Renewal risk.
  - Contribution shortfall.
  - Member risk escalation.
- [ ] Add alert inbox UI.
- [ ] Add acknowledge/resolve actions.
- [ ] Add audit/activity logging if existing patterns make that straightforward.

### Phase 9: Reports And Exports

- [ ] Integrate new analytics into existing reports area.
- [ ] Add/export at least the five reports from the spec:
  - Portfolio MLR.
  - Scheme profitability.
  - Provider performance.
  - Renewal recommendations.
  - Risk tier distribution.
- [ ] Reuse existing report-generation service/job where possible.
- [ ] Keep existing report routes working.

### Phase 10: Seed Data

- [ ] Extend `prisma/seed.ts` or add a dedicated analytics seed helper.
- [x] Seed case-mix weights.
- [ ] Generate enough synthetic data to demonstrate trends:
  - 18 months encounters.
  - 12 months contribution/invoice/payment data.
  - Multiple schemes with varied MLR.
  - Internal and external providers/facilities.
  - Precomputed renewal analyses.
  - Around 20 alerts.
- [ ] For local practicality, start with a smaller default seed and optionally gate the 50,000+ encounter stress seed behind an env flag or separate command.

## Algorithm Notes

### MLR

Base formula from the hardening spec:

```text
MLR = SUM(benefitPaid + memberCoContribution) / SUM(grossContribution)
```

Implementation notes:

- [ ] Use paid contribution for cash-realized views and gross contribution for pricing views. Label both clearly if both appear.
- [ ] Use trailing 12-month MLR for renewal and portfolio trend.
- [ ] Store numerator/denominator values alongside ratios for auditability.

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

- [ ] Trailing 12-month claims.
- [ ] Current contribution.
- [ ] Target MLR.
- [ ] Inflation assumption.
- [ ] Membership change assumption when available.

### Risk Stratification

Initial explainable scoring inputs:

- [ ] Recent claims cost.
- [ ] Claim frequency.
- [ ] Chronic/disease-family tags.
- [ ] Utilization-to-cap percentage.
- [ ] Recent preauthorization volume.
- [ ] Projected exceed date.

Avoid irreversible business rules until confirmed with product stakeholders.

## Verification Plan

Run after relevant implementation phases:

- [x] `npx prisma validate`
- [x] `npx prisma generate`
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [ ] `npm run lint`

Known baseline note: lint has unrelated existing failures at the time this plan was written:

- `src/components/dashboard/DashboardCharts.tsx` has `react-hooks/set-state-in-effect`.
- `src/server/services/providers.service.ts` has `no-explicit-any` errors.
- `src/server/services/secure-checkin/secure-checkin.service.ts` has `no-require-imports` errors.

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

Recommended next slice:

- [ ] Add `refreshMlrSnapshots()`.
- [ ] Add `refreshProviderScorecards()`.
- [ ] Add first read service methods for portfolio summary, scheme grid, and provider ranking.
- [ ] Add tRPC router shell for analytics reads.
