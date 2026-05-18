# Broker Command Center Handoff

Last updated: 2026-05-06

## Source Spec
- Competitive hardening spec: `AICARE_COMPETITIVE_HARDENING_SPEC.md`
- Current module: Module 1, Broker Command Center / broker hardening.
- Module 1.1 corrective pass: Broker model widened into broker/agent/intermediary/business-source management for Avenue PSHP.

## Overall Execution Plan
1. Foundation data model and services.
2. Broker admin command center page.
3. Commission schedule workflow.
4. KYC document workflow.
5. Producer/sub-agent workflow.
6. Payout operations.
7. Broker portal upgrades.
8. Fraud/compliance flags.
9. Seed/demo data and operational QA.
10. Intermediary generalization for non-IRA business sources.

## Completed
- Added Prisma broker hardening foundation:
  - broker hierarchy/profile/KRA/VAT/statutory fields
  - `BrokerKycDocument`
  - `BrokerProducer`
  - `BrokerCommissionSchedule`
  - `CommissionTier`
  - `CommissionLedgerEntry`
  - `CommissionPayoutBatch`
- Added migration:
  - `prisma/migrations/20260506123000_broker_command_center_foundation/`
- Expanded broker create/edit admin form.
- Rebuilt broker detail page as a server-rendered command center:
  - overview
  - producers
  - KYC
  - schedules
  - ledger
  - payouts
- Added commission schedule actions:
  - create draft
  - submit
  - approve
  - reject
- Added KYC actions:
  - record document reference
  - verify
  - reject
- Added producer actions:
  - create producer/sub-agent
  - assign producer to broker schemes
  - activate/deactivate
- Added payout actions:
  - generate draft payout batch for a broker
  - submit draft payout batch for approval
  - approve payout batch
  - complete/disburse payout batch and mark broker ledger entries `PAID`
- Upgraded broker portal pages:
  - broker dashboard now uses new commission ledger totals and shows recent ledger entries
  - broker commissions page now shows commission ledger entries and payout batches
  - broker-facing data remains scoped through signed-in user's `brokerId`
- Added broker compliance/fraud flags:
  - expired or missing IRA license
  - missing required verified KYC
  - expired KYC documents
  - inactive broker with active schemes
  - pending commission reconciliation
  - non-pending ledger entries without schedules
  - duplicate contribution receipt ledger entries
  - flags surface in the admin broker overview
- Added seed/demo data for the broker command center:
  - upgrades the existing KAIB demo broker with hardened profile fields
  - upgrades Minet as a KAIB sub-agent demo broker
  - adds KAIB KYC document records
  - adds a KAIB producer assigned to Safaricom
  - adds an active KAIB commission schedule with tiers
  - adds sample commission ledger entries
  - adds a completed payout batch linked to a paid ledger entry
- Added commission service ledger support:
  - schedule resolution
  - tier/rate calculation
  - tax/levy calculations
  - ledger entry creation
  - payout batch generation
  - payment reconciliation
- Added BullMQ daily commission reconciliation job.
- Added Module 1.1 intermediary/business-source generalization:
  - kept existing `Broker` table/model names stable to avoid broad app churn
  - added `IntermediaryCategory` enum:
    - regulated broker
    - regulated agent
    - introducer
    - referral partner
    - internal sales
    - corporate affinity
    - bancassurance
    - other
  - added `CommissionBasis` enum:
    - commission
    - referral fee
    - attribution only
    - none
  - added broker/source fields:
    - `intermediaryCategory`
    - `requiresIraRegistration`
    - `canReceiveCommission`
    - `commissionBasis`
    - `referralFeeAmount`
    - `sourceDescription`
  - added KYC document types:
    - `ENGAGEMENT_LETTER`
    - `REFERRAL_AGREEMENT`
  - added migration:
    - `prisma/migrations/20260506154500_intermediary_generalization/`
  - updated admin broker/source form to capture category, IRA requirement, payout eligibility, payout basis, referral fee, and source notes
  - updated broker/source detail page to surface category, payout basis, and conditional IRA requirement
  - updated KYC document form to support referral/engagement documents
  - updated broker tRPC router create/update/list/KYC inputs for the new fields
  - updated compliance rules so IRA flags only apply when `requiresIraRegistration = true`
  - updated compliance rules so referral-fee and payout-capable non-IRA sources require KRA/payment/referral-agreement evidence as appropriate
  - updated commission logic so attribution-only/non-payable sources do not generate payout ledger entries
  - updated payout batch generation to exclude non-payable/attribution-only sources and zero-net entries
  - added seed examples for:
    - KAIB as regulated broker
    - Minet as regulated sub-agent
    - Nia Health Introducers as independent non-IRA introducer paid by referral fee
    - Avenue Corporate Sales Desk as internal attribution-only source

## In Progress
- Operational QA:
  - apply migration against a dev database
  - run seed against the migrated dev database if demo broker data is desired
  - create a broker, schedule, KYC doc, producer, ledger entry, payout batch
  - exercise broker portal dashboard and commissions page
  - verify compliance flags clear when expected data is completed

## Verification Baseline
- `npx prisma validate` passed after seed/demo data.
- `npx tsc --noEmit` passed after seed/demo data.
- `npm run build` initially hit a stale `.next` cache error, then passed after clearing `.next`.
- `npx tsc --noEmit` passed again after the clean build.
- `npx prisma validate` passed after Module 1.1 intermediary generalization.
- `npx prisma generate` was run after Module 1.1 schema changes.
- `npx tsc --noEmit` passed after Module 1.1 intermediary generalization.
- `npm run build` passed after Module 1.1 intermediary generalization.
- `npm run lint` still fails on pre-existing unrelated issues:
  - `src/components/dashboard/DashboardCharts.tsx`
  - `src/server/services/providers.service.ts`
  - `src/server/services/secure-checkin/secure-checkin.service.ts` require-import lint
  - various unused imports/vars in unrelated pages

## Known Notes
- The Next build currently skips type validation and linting, so keep running `npx tsc --noEmit` separately.
- Running `npx tsc --noEmit` in parallel with `npm run build` can fail because `.next/types` is regenerated during build. Run build first, then `tsc` alone.
- The KYC form records a file URI/reference. It does not upload file bytes yet.
- The migration has been created but not confirmed applied to the developer DB in this thread.
- `npm run db:seed` was not run in this thread to avoid writing demo data without explicit confirmation.
- The new seed block requires both broker command center migrations to be applied first:
  - `20260506123000_broker_command_center_foundation`
  - `20260506154500_intermediary_generalization`
- Operational naming is now broker/agent/intermediary/business source. Database/model names still say `Broker` intentionally.

## Next Recommended
- Operational QA:
  - apply migration against a dev database
  - run `npm run db:seed` against that migrated dev database if sample broker command center data is wanted
  - create a regulated broker and confirm IRA compliance requirements apply
  - create an independent introducer and confirm IRA compliance requirements do not apply
  - create an internal attribution-only source and confirm payout generation skips it
  - create a schedule, KYC doc, producer, ledger entry, payout batch
  - exercise broker portal dashboard and commissions page
  - verify compliance flags clear when expected data is completed
