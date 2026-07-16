/**
 * purge-avenue-default-client.ts
 *
 * Removes the legacy Avenue-era "Medvex — Default Client" and its entire
 * footprint, leaving an internally-consistent Medvex dataset (NWSC + platform +
 * the full provider network) for end-to-end tests.
 *
 * Why: that client (type INSURER) pooled six Kenya employers — Safaricom, KCB,
 * EABL, Bamburi, Twiga, Patricia Wanjiru — from when Avenue (not Medvex) was the
 * target. The data is internally inconsistent (98 PAID claims with no GL/voucher,
 * future-dated seed claims) and is the root of the N3 cross-employer PII exposure
 * (ContractApplicability rows entitle client-scoped providers to all pooled
 * members). Deleting it clears the inconsistency AND closes N3 by construction.
 *
 * SAFETY DESIGN
 *  - DRY RUN by default: runs the full ordered delete + invariant asserts inside
 *    ONE interactive transaction, then throws to ROLL BACK — nothing is persisted,
 *    but FK ordering and the balance/keep-set asserts are all exercised for real.
 *    Pass --commit to persist.
 *  - Fail-closed asserts (inside the txn, so a violation rolls the whole thing
 *    back): GL trial balance still balances; NWSC keeps all 2,750 members; exactly
 *    one client (NWSC) remains; the Avenue client is gone.
 *  - The ONE settlement batch that touches Avenue is SHARED with an NWSC claim, so
 *    its ProviderSettlementBatch + PaymentVoucher + SETTLEMENT_PAID journal entry
 *    are PRESERVED (only the Avenue claim row inside it is removed). Residual: that
 *    voucher's claimCount/totalAmount overstate by the one removed claim — a known,
 *    documented, trial-balance-neutral artifact on a single shared batch.
 *  - Shared ProviderContracts are KEPT (providers are shared infrastructure); only
 *    the Avenue-scoped ContractApplicability entitlement rows are removed (the N3 fix).
 *  - The 2 portal/HR users (member@medvex.co.ug, emily.wambui@safaricom.co.ke) are
 *    DETACHED + DEACTIVATED, not deleted — they are referenced by 31 inbound FK
 *    columns incl. global AuditLog.userId and UserRoleAssignment.userId, so a hard
 *    delete would break audit/role history. Nulling member/group/client frees the
 *    entity deletes; the rows survive as deactivated, unlinked, email-scrambled
 *    shells. Those two logins are RETIRED — recreate against an NWSC member if a
 *    portal/HR demo login is needed post-purge.
 *
 * TAKE A BACKUP / SUPABASE BRANCH FIRST. This is irreversible once committed.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/purge-avenue-default-client.ts            # DRY RUN (rolls back)
 *   npx tsx --env-file=.env scripts/purge-avenue-default-client.ts --commit   # PERMANENT delete
 *   (point DATABASE_URL at the target DB; for prod use the Vercel/Supabase URL, not local aicare_uat)
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const COMMIT = process.argv.includes("--commit");
const AVENUE_CLIENT_ID = "cl_cmr3ae8v30000nlvqxrqlfn38";
const NWSC_CLIENT_ID = "cmr94t90k000004jssvqx1ppp";
const NWSC_MEMBERS_EXPECTED = 2750;

class DryRunRollback extends Error {}

async function main() {
  const client = await prisma.client.findUnique({
    where: { id: AVENUE_CLIENT_ID },
    select: { id: true, name: true, operatorTenantId: true },
  });
  if (!client) throw new Error(`Avenue client ${AVENUE_CLIENT_ID} not found — nothing to do (already purged, or wrong DATABASE_URL).`);
  // Safety guard: never run against the wrong client.
  if (!client.name.endsWith("Default Client")) {
    throw new Error(`SAFETY GUARD: client "${client.name}" is not the expected "… Default Client" — aborting.`);
  }
  if ((AVENUE_CLIENT_ID as string) === (NWSC_CLIENT_ID as string)) throw new Error("SAFETY GUARD: target == NWSC — aborting.");

  console.log(`\n${COMMIT ? "🔴 COMMIT — permanent deletion" : "🟡 DRY RUN — full delete then ROLLBACK (nothing persisted)"}`);
  console.log(`Target: "${client.name}" (${client.id}), tenant ${client.operatorTenantId}\n`);

  const report: { step: string; count: number }[] = [];
  const del = async (step: string, p: PromiseLike<{ count: number }>) => {
    const { count } = await p;
    if (count) report.push({ step, count });
    return count;
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        // ── 0. Resolve the id sets ─────────────────────────────────────────────
        const groupIds = (await tx.group.findMany({ where: { clientId: AVENUE_CLIENT_ID }, select: { id: true } })).map((r) => r.id);
        const memberIds = (await tx.member.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })).map((r) => r.id);
        const claimIds = (await tx.claim.findMany({ where: { memberId: { in: memberIds } }, select: { id: true } })).map((r) => r.id);
        const invoiceIds = (await tx.invoice.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })).map((r) => r.id);
        const sfaIds = (await tx.selfFundedAccount.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })).map((r) => r.id);
        const quotationIds = (await tx.quotation.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })).map((r) => r.id);
        const endorsementIds = (
          await tx.endorsement.findMany({
            where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }, { toGroupId: { in: groupIds } }] },
            select: { id: true },
          })
        ).map((r) => r.id);
        const userIds = (
          await tx.user.findMany({
            where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }, { clientId: AVENUE_CLIENT_ID }] },
            select: { id: true },
          })
        ).map((r) => r.id);

        // Parent id-sets for grandchild tables (which have no direct member/group/
        // client column — they hang off these intermediate rows via a scalar FK).
        const ids = async (rows: PromiseLike<{ id: string }[]>) => (await rows).map((r) => r.id);
        const bcsIds = await ids(tx.brokerCommissionSchedule.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } }));
        const caseIds = await ids(tx.clinicalCase.findMany({ where: { memberId: { in: memberIds } }, select: { id: true } }));
        const xbCaseIds = await ids(tx.crossBorderCase.findMany({ where: { OR: [{ clientId: AVENUE_CLIENT_ID }, { memberId: { in: memberIds } }] }, select: { id: true } }));
        const kycIds = await ids(tx.memberKycRecord.findMany({ where: { memberId: { in: memberIds } }, select: { id: true } }));
        const tariffIds = await ids(tx.providerTariff.findMany({ where: { clientId: AVENUE_CLIENT_ID }, select: { id: true } }));
        const termIds = await ids(tx.terminologyEntry.findMany({ where: { clientId: AVENUE_CLIENT_ID }, select: { id: true } }));
        const apprMatrixIds = await ids(tx.approvalMatrix.findMany({ where: { clientId: AVENUE_CLIENT_ID }, select: { id: true } }));
        const apprReqIds = await ids(tx.approvalRequest.findMany({ where: { clientId: AVENUE_CLIENT_ID }, select: { id: true } }));

        // GL: Avenue-only journal entries are those sourced from Avenue claims or
        // invoices. Entries sourced from the shared batch/voucher (SETTLEMENT_PAID)
        // are NOT included — they stay, keeping the ledger balanced.
        const jeIds = (
          await tx.journalEntry.findMany({
            where: { sourceId: { in: [...claimIds, ...invoiceIds] }, sourceType: { not: "SETTLEMENT_PAID" } },
            select: { id: true },
          })
        ).map((r) => r.id);

        const pre = await tx.$queryRaw<{ debit: number; credit: number }[]>`
          SELECT COALESCE(sum(debit),0)::float8 AS debit, COALESCE(sum(credit),0)::float8 AS credit FROM "JournalLine"`;
        console.log(
          `id sets → groups ${groupIds.length}, members ${memberIds.length}, claims ${claimIds.length}, ` +
            `invoices ${invoiceIds.length}, endorsements ${endorsementIds.length}, sfa ${sfaIds.length}, ` +
            `users ${userIds.length}, avenue-only JEs ${jeIds.length}`,
        );
        console.log(`pre-purge GL: debit ${pre[0].debit.toLocaleString()} credit ${pre[0].credit.toLocaleString()}\n`);

        // ── 1. GL (polymorphic sourceId — no FK, delete whole balanced entries) ──
        await del("JournalLine (avenue-only)", tx.journalLine.deleteMany({ where: { journalEntryId: { in: jeIds } } }));
        await del("JournalEntry (avenue-only; shared SETTLEMENT_PAID kept)", tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } }));

        // ── 1b. Child→child references (from the intra-set FK graph) — these point
        //    at OTHER child tables, so they must go before their targets. ─────────
        await del("ActivityLog (→ Endorsement/PreAuth)", tx.activityLog.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }, { endorsementId: { in: endorsementIds } }] } }));
        await del("BenefitHold (→ PreAuth)", tx.benefitHold.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberCoContributionPayment (→ CoContributionTransaction)", tx.memberCoContributionPayment.deleteMany({ where: { memberId: { in: memberIds } } }));
        // check-in cluster: visit-verifications / notifications / events → challenge → credential
        await del("VisitVerification (→ CheckInChallenge)", tx.visitVerification.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberCheckInNotification (→ Challenge/Credential)", tx.memberCheckInNotification.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("CheckInEvent (→ Challenge/Credential)", tx.checkInEvent.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("CheckInChallenge (→ MemberWebAuthnCredential)", tx.checkInChallenge.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberWebAuthnCredential", tx.memberWebAuthnCredential.deleteMany({ where: { memberId: { in: memberIds } } }));

        // ── 2. Claim-level children ──────────────────────────────────────────────
        await del("AdjudicationLog", tx.adjudicationLog.deleteMany({ where: { claimId: { in: claimIds } } }));
        await del("ClaimFraudAlert", tx.claimFraudAlert.deleteMany({ where: { claimId: { in: claimIds } } }));
        await del("FraudInvestigation", tx.fraudInvestigation.deleteMany({ where: { claimId: { in: claimIds } } }));
        await del("ExceptionLog", tx.exceptionLog.deleteMany({ where: { claimId: { in: claimIds } } }));
        await del("CoContributionTransaction", tx.coContributionTransaction.deleteMany({ where: { OR: [{ claimId: { in: claimIds } }, { memberId: { in: memberIds } }] } }));
        await del("FundTransaction", tx.fundTransaction.deleteMany({ where: { OR: [{ claimId: { in: claimIds } }, { invoiceId: { in: invoiceIds } }, { selfFundedAccountId: { in: sfaIds } }] } }));
        await del("Document", tx.document.deleteMany({ where: { OR: [{ claimId: { in: claimIds } }, { groupId: { in: groupIds } }, { quotationId: { in: quotationIds } }, { endorsementId: { in: endorsementIds } }] } }));
        await del("ReimbursementRequest", tx.reimbursementRequest.deleteMany({ where: { OR: [{ claimId: { in: claimIds } }, { memberId: { in: memberIds } }] } }));
        await del("PreAuthorization", tx.preAuthorization.deleteMany({ where: { OR: [{ claimId: { in: claimIds } }, { memberId: { in: memberIds } }] } }));
        await del("ClaimLine", tx.claimLine.deleteMany({ where: { claimId: { in: claimIds } } }));

        // ── 3. Claim (its shared batch/voucher/settlement-JE are left intact) ────
        await del("Claim", tx.claim.deleteMany({ where: { memberId: { in: memberIds } } }));

        // ── 4. Endorsement children + Endorsement ───────────────────────────────
        await del("ProRataCalculation", tx.proRataCalculation.deleteMany({ where: { endorsementId: { in: endorsementIds } } }));
        await del("Endorsement", tx.endorsement.deleteMany({ where: { id: { in: endorsementIds } } }));

        // ── 5. Member-level children ────────────────────────────────────────────
        await del("BenefitUsage", tx.benefitUsage.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("BenefitHold", tx.benefitHold.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberCoveragePeriod", tx.memberCoveragePeriod.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("EligibilitySnapshot", tx.eligibilitySnapshot.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { clientId: AVENUE_CLIENT_ID }] } }));
        await del("Complaint", tx.complaint.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("Correspondence", tx.correspondence.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("ConsentRecord", tx.consentRecord.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberKycDocument (→ MemberKycRecord)", tx.memberKycDocument.deleteMany({ where: { kycRecordId: { in: kycIds } } }));
        await del("MemberKycRecord", tx.memberKycRecord.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberNotification", tx.memberNotification.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MembershipCard", tx.membershipCard.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("LetterOfUndertaking", tx.letterOfUndertaking.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("CaseServiceEntry (→ ClinicalCase)", tx.caseServiceEntry.deleteMany({ where: { caseId: { in: caseIds } } }));
        await del("ClinicalCase", tx.clinicalCase.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("FamilyAnnualCoContribution", tx.familyAnnualCoContribution.deleteMany({ where: { principalMemberId: { in: memberIds } } }));
        await del("MemberAnnualCoContribution", tx.memberAnnualCoContribution.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberCoContributionPayment", tx.memberCoContributionPayment.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("DataSubjectRequest", tx.dataSubjectRequest.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("OfflineReservation", tx.offlineReservation.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("OnboardingChecklistItem", tx.onboardingChecklistItem.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("VisitVerification", tx.visitVerification.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("WaitingPeriodApplication", tx.waitingPeriodApplication.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("CheckInChallenge", tx.checkInChallenge.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("CheckInEvent", tx.checkInEvent.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberCheckInNotification", tx.memberCheckInNotification.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberVitalEntry", tx.memberVitalEntry.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberHealthShare", tx.memberHealthShare.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberHealthJournalEntry", tx.memberHealthJournalEntry.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberHealthFile", tx.memberHealthFile.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberWebAuthnCredential", tx.memberWebAuthnCredential.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("WebAuthnEnrollmentApproval", tx.webAuthnEnrollmentApproval.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("WebAuthnRegistrationChallenge", tx.webAuthnRegistrationChallenge.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("WellnessActivity", tx.wellnessActivity.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("WellnessEnrollment", tx.wellnessEnrollment.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MembershipBindingDocument", tx.membershipBindingDocument.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }] } }));
        await del("MembershipCancellationRecord", tx.membershipCancellationRecord.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MembershipExclusion", tx.membershipExclusion.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MembershipLapseRecord", tx.membershipLapseRecord.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MembershipReinstatementRequest", tx.membershipReinstatementRequest.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MembershipTerminationRecord", tx.membershipTerminationRecord.deleteMany({ where: { memberId: { in: memberIds } } }));
        await del("MemberRiskProfile", tx.memberRiskProfile.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }] } }));
        await del("UnderwritingDecision", tx.underwritingDecision.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { quotationId: { in: quotationIds } }] } }));
        await del("AnalyticsEncounterFact", tx.analyticsEncounterFact.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }] } }));
        await del("AnalyticsAlert", tx.analyticsAlert.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }] } }));
        await del("ActivityLog", tx.activityLog.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { groupId: { in: groupIds } }, { endorsementId: { in: endorsementIds } }] } }));

        // ── 6. Users — DETACH + DEACTIVATE (see header). Frees the entity deletes
        //    below while preserving audit/role FK integrity. Logins are retired. ──
        await del("PasswordResetToken (users)", tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }));
        for (const uid of userIds) {
          await tx.user.update({
            where: { id: uid },
            data: { memberId: null, groupId: null, clientId: null, isActive: false, email: `purged-${uid}@avenue-legacy.invalid` },
          });
        }
        if (userIds.length) report.push({ step: "User detached+deactivated (audit-safe)", count: userIds.length });

        // ── 7. Member — dependents first (self-ref Member.principalId) ──────────
        await del("Member (dependents)", tx.member.deleteMany({ where: { groupId: { in: groupIds }, principalId: { not: null } } }));
        await del("Member (principals)", tx.member.deleteMany({ where: { groupId: { in: groupIds } } }));

        // ── 8. Group-level children ─────────────────────────────────────────────
        await del("Payment", tx.payment.deleteMany({ where: { OR: [{ invoiceId: { in: invoiceIds } }, { groupId: { in: groupIds } }] } }));
        await del("AdminFeeLedgerEntry", tx.adminFeeLedgerEntry.deleteMany({ where: { OR: [{ invoiceId: { in: invoiceIds } }, { clientId: AVENUE_CLIENT_ID }] } }));
        await del("Invoice", tx.invoice.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("CommissionLedgerEntry", tx.commissionLedgerEntry.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("Commission", tx.commission.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("FundDepositRequest", tx.fundDepositRequest.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("SelfFundedAccount", tx.selfFundedAccount.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("GroupBenefitTier", tx.groupBenefitTier.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("CommissionTier (→ BrokerCommissionSchedule)", tx.commissionTier.deleteMany({ where: { scheduleId: { in: bcsIds } } }));
        await del("BrokerCommissionSchedule", tx.brokerCommissionSchedule.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("CustomPricingModelFile", tx.customPricingModelFile.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("ServiceRequest", tx.serviceRequest.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("RenewalAnalysis", tx.renewalAnalysis.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("AnalyticsContributionFact", tx.analyticsContributionFact.deleteMany({ where: { groupId: { in: groupIds } } }));
        await del("AnalyticsMlrSnapshot", tx.analyticsMlrSnapshot.deleteMany({ where: { groupId: { in: groupIds } } }));

        if (quotationIds.length) {
          await del("QuotationLife", tx.quotationLife.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("QuotationLineItem", tx.quotationLineItem.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("QuotationVersion", tx.quotationVersion.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("QuotationAcceptance", tx.quotationAcceptance.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("QuotationRiskProfile", tx.quotationRiskProfile.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("AssessorWorkQueueItem", tx.assessorWorkQueueItem.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("CustomPricingRunLog", tx.customPricingRunLog.deleteMany({ where: { quotationId: { in: quotationIds } } }));
          await del("Quotation", tx.quotation.deleteMany({ where: { id: { in: quotationIds } } }));
        }

        await del("ContractApplicability (by group)", tx.contractApplicability.deleteMany({ where: { groupId: { in: groupIds } } }));

        // implicit M2M join rows (fund-admin ↔ group; producer ↔ scheme) — clear before Group
        if (groupIds.length) {
          const fa = await tx.$executeRaw`DELETE FROM "_FundAdminGroups" WHERE "A" IN (${Prisma.join(groupIds)})`;
          const ps = await tx.$executeRaw`DELETE FROM "_ProducerSchemes" WHERE "B" IN (${Prisma.join(groupIds)})`;
          if (fa) report.push({ step: "_FundAdminGroups (M2M)", count: fa });
          if (ps) report.push({ step: "_ProducerSchemes (M2M)", count: ps });
        }

        // ── 9. Group ────────────────────────────────────────────────────────────
        await del("Group", tx.group.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));

        // ── 10. Client-level children (the N3 entitlement rows live here) ───────
        await del("ContractApplicability (by client) — N3 rows", tx.contractApplicability.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("CoContributionRule", tx.coContributionRule.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("ApprovalDecision (→ ApprovalRequest)", tx.approvalDecision.deleteMany({ where: { requestId: { in: apprReqIds } } }));
        await del("ApprovalRequest", tx.approvalRequest.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("ApprovalStep (→ ApprovalMatrix)", tx.approvalStep.deleteMany({ where: { matrixId: { in: apprMatrixIds } } }));
        await del("ApprovalMatrix", tx.approvalMatrix.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("AutoAdjudicationPolicy", tx.autoAdjudicationPolicy.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("FraudRule", tx.fraudRule.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("DrugExclusion", tx.drugExclusion.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("TerminologyApproval (→ TerminologyEntry)", tx.terminologyApproval.deleteMany({ where: { entryId: { in: termIds } } }));
        await del("TerminologyEntry", tx.terminologyEntry.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("WellnessProgram", tx.wellnessProgram.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("CrossBorderLineItem (→ CrossBorderCase)", tx.crossBorderLineItem.deleteMany({ where: { caseId: { in: xbCaseIds } } }));
        await del("CrossBorderCase", tx.crossBorderCase.deleteMany({ where: { OR: [{ clientId: AVENUE_CLIENT_ID }, { memberId: { in: memberIds } }] } }));
        await del("AdminFeeAgreement", tx.adminFeeAgreement.deleteMany({ where: { OR: [{ clientId: AVENUE_CLIENT_ID }, { groupId: { in: groupIds } }] } }));
        await del("ServiceMappingMemory (→ ProviderTariff)", tx.serviceMappingMemory.deleteMany({ where: { tariffId: { in: tariffIds } } }));
        await del("ProviderTariff (client-scoped)", tx.providerTariff.deleteMany({ where: { clientId: AVENUE_CLIENT_ID } }));
        await del("Client.parentClientId detach (defensive)", tx.client.updateMany({ where: { parentClientId: AVENUE_CLIENT_ID }, data: { parentClientId: null } }));

        // ── 11. The Avenue client itself ────────────────────────────────────────
        await del("Client (Medvex — Default Client)", tx.client.deleteMany({ where: { id: AVENUE_CLIENT_ID } }));

        // ── 12. Fail-closed invariant asserts (rollback if any fails) ───────────
        const post = await tx.$queryRaw<{ debit: number; credit: number }[]>`
          SELECT COALESCE(sum(debit),0)::float8 AS debit, COALESCE(sum(credit),0)::float8 AS credit FROM "JournalLine"`;
        const balanced = Math.round((post[0].debit - post[0].credit) * 100) === 0;
        const nwscMembers = await tx.member.count({ where: { group: { clientId: NWSC_CLIENT_ID } } });
        const clientsLeft = await tx.client.count();
        const avenueGone = (await tx.client.count({ where: { id: AVENUE_CLIENT_ID } })) === 0;

        console.log("\n── deletions ──");
        for (const r of report) console.log(`  ${r.count.toString().padStart(6)}  ${r.step}`);
        console.log("\n── post-purge invariants ──");
        console.log(`  GL balanced ................ ${balanced ? "✅" : "❌"} (debit ${post[0].debit.toLocaleString()} vs credit ${post[0].credit.toLocaleString()})`);
        console.log(`  NWSC members == ${NWSC_MEMBERS_EXPECTED} ...... ${nwscMembers === NWSC_MEMBERS_EXPECTED ? "✅" : "❌"} (${nwscMembers})`);
        console.log(`  clients remaining == 1 ..... ${clientsLeft === 1 ? "✅" : "❌"} (${clientsLeft})`);
        console.log(`  Avenue client removed ...... ${avenueGone ? "✅" : "❌"}`);

        if (!balanced) throw new Error("ASSERT FAILED: GL no longer balances — rolling back.");
        if (nwscMembers !== NWSC_MEMBERS_EXPECTED) throw new Error(`ASSERT FAILED: NWSC members ${nwscMembers} != ${NWSC_MEMBERS_EXPECTED} — rolling back.`);
        if (clientsLeft !== 1) throw new Error(`ASSERT FAILED: ${clientsLeft} clients remain (expected 1) — rolling back.`);
        if (!avenueGone) throw new Error("ASSERT FAILED: Avenue client still present — rolling back.");

        if (!COMMIT) throw new DryRunRollback();
      },
      { timeout: 120_000, maxWait: 15_000 },
    );

    console.log(`\n✅ COMMITTED — Avenue Default Client purged. Live dataset is now NWSC + platform + providers.`);
  } catch (e) {
    if (e instanceof DryRunRollback) {
      console.log(`\n🟡 DRY RUN complete — all deletes + asserts PASSED, transaction rolled back (no changes).`);
      console.log(`   Re-run with  --commit  to persist.`);
      return;
    }
    throw e;
  }
}

main()
  .catch((e) => {
    console.error("\n❌ Aborted / rolled back:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
