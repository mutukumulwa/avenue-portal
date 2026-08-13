/**
 * PR-020 #2/#3: the audit-coverage catalogue.
 *
 * Every exported server action under src/app must either
 *  (a) be detected as audited — its body calls writeAudit/auditChainService/
 *      auditManage or delegates to a service on the KNOWN_AUDITING_TOKENS list, or
 *  (b) appear here with a documented justification.
 *
 * The harness (audit-coverage.test.ts) fails CI for any action that is neither —
 * so a new mutation landing without audit turns the build red instead of
 * surfacing in a UAT six months later.
 *
 * Entries are "<fileBasename>:<functionName>". Keep justifications honest:
 * "READ_ONLY" for non-mutating actions, "PRE_EXISTING_GAP" for known holes that
 * still need audit wiring (tracked, visible, reviewable).
 */

/** Call tokens that mean the action delegates to a service that audits internally. */
export const KNOWN_AUDITING_TOKENS = [
  "writeAudit(",
  "auditChainService.append(",
  "auditManage(",
  "ProviderIntegrationConnectionAdmin.", // PNOS F9.3/F9.8 — every connection mutation writes INTEGRATION_CONNECTION:* audit internally
  "ProviderUserAdminService.", // ELIG-GAP-005 F1.5 — every role/branch/suspend/reactivate mutation writes PROVIDER_USER_* audit internally
  "DeliveryRetryService.manualRetry(", // PNOS F9.6/F9.8 — writes INTEGRATION_DELIVERY:MANUAL_RETRY audit internally
  "runClaimIntake(", // shared claim-intake path — chain-audits CLAIM:INTAKE_ACCEPTED internally
  "reimbursementService.submit(", // F5.6 — appends REIMBURSEMENT:SUBMITTED + canonical intake audit internally
  "auditPolicy(", // F6.5 — local helper wrapping auditChainService.append for the policy console
  "auditProtocol(", // DG C3.2 — local helper wrapping auditChainService.append for the clinical protocol library
  // UAT-HF P10.02 (DEF-005 / WP-3.1): a bare `prisma.auditLog.create` is the
  // deliberate form for AUTH events. `writeAudit()` calls next/headers and
  // cannot carry tenantId, so its rows land OUTSIDE the tenant hash chain and
  // are invisible to tenant-scoped audit review. Auth actions therefore write
  // the row directly, with tenantId, and that must still count as audited.
  'action: "AUTH_ACCOUNT_UNLOCKED"',
  "openBreaker(", // F4.7/F6.5 — hash-chain audits CIRCUIT_BREAKER_OPENED internally
  "closeBreaker(", // F4.7/F6.5 — hash-chain audits CIRCUIT_BREAKER_CLOSED internally
  "ClaimDecisionService.decide(",
  "ClaimDecisionService.voidClaim(",
  "ClaimWithdrawalService.withdraw(", // PNOS F5.5/F5.6 — hash-chain audits CLAIM:WITHDRAW internally
  "ClaimReplacementService.replace(", // PNOS F5.7/F5.8 — hash-chain audits CLAIM:REPLACE internally
  "ClaimResubmissionService.submit(", // PNOS F5.10 — hash-chain audits CLAIM:RESUBMIT internally
  "ClaimReconsiderationService.submit(", // PNOS F5.12/F5.13 — hash-chain audits RECONSIDERATION:SUBMIT internally
  // PNOS F6.11 — payment-query actions delegate to a service that hash-chain audits PAYMENT_QUERY:* internally.
  "ProviderPaymentQueryService.raise(",
  "ProviderPaymentQueryService.respondToInformation(",
  "ProviderPaymentQueryService.withdraw(",
  "ProviderPaymentQueryService.acknowledge(",
  "ProviderPaymentQueryService.requestInformation(",
  "ProviderPaymentQueryService.resolve(",
  "ProviderPaymentQueryService.reject(",
  "ProviderPaymentQueryService.convertToReconsideration(", // PNOS F6.12 — hash-chain audits PAYMENT_QUERY:CONVERT internally

  "preauthAdjudicationService.",
  "claimAdjudicationService.createSettlementBatch(",
  "claimAdjudicationService.approveSettlementBatch(",
  "claimAdjudicationService.markSettlementBatchPaid(",
  "TenantSettingsService.updateClaimControls(", // writes TENANT_CLAIM_CONTROL_UPDATED audit internally
  "overrideService.request(",
  "overrideService.approve(",
  "overrideService.reject(",
  "ContractLifecycleService.", // every lifecycle transition logs to the audit chain
  // WP-3.5F/G — the endorsement approve→apply + reject paths now audit internally
  // (auditChainService.append inside the service).
  "EndorsementsService.approveEndorsement(",
  "EndorsementsService.rejectEndorsement(",
  "ProviderMasterDataChangeService.", // PNOS F7.4/F7.5/F7.6 — submit/transition/approve/verify/activate all audit internally
  "ProviderImprovementPlanService.", // PNOS F7.7/F8.6 — create/setStatus audit IMPROVEMENT_PLAN:* internally
  "NetworkPerformanceService.exportComparisonCsv(", // PNOS F8.6 — audits NETWORK_ANALYTICS:EXPORT internally
  "renewalService.bindRenewal(", // WP-V1 — appends RENEWAL:BOUND (member transition) internally
  "auditChain", // catch-all for direct chain use
];

export const AUDIT_EXCLUSIONS: Record<string, string> = {
  // UAT-HF P04.01 — the "check before you retry" lookup. A READ of the
  // caller's own operation receipt; it writes nothing. The enrolment it
  // reports on is itself audited by addMemberAction.
  "members/new/actions.ts:lookupEnrolmentOutcomeAction":
    "READ_ONLY - reads the caller's own OperationReceipt so an operator can discover a prior attempt's outcome",
  // UAT-HF P11.05 — expanding the household is a READ, and deliberately NOT
  // audited. DEC-10 gates and audits a reveal of a SENSITIVE FIELD (national ID,
  // phone, email — see revealMemberFieldAction, which does audit); household
  // composition is listed there as "collapsed", not as restricted. Auditing
  // every expansion would bury the reveals that matter under routine noise.
  "members/[id]/reveal-actions.ts:loadHouseholdAction":
    "READ_ONLY - returns the dependant list an operator asked to expand; the sensitive-field reveal beside it IS audited (DEC-10)",
  // UAT-HF P03.05 — eligibility is a READ. It writes no business state; the
  // service records its own ProviderEligibilityCheck evidence row with actor,
  // provider, member, service date and result, which is the point-in-time
  // record for this surface.
  "provider/eligibility/actions.ts:checkEligibilityAction":
    "READ_ONLY — eligibility is a lookup; the service records its own ProviderEligibilityCheck evidence row (actor, provider, member, service date, result)",
  "(auth)/reset/actions.ts:confirmResetAction": "PRE_EXISTING_GAP — audit wiring pending",
  "(auth)/reset/actions.ts:requestResetAction": "PRE_EXISTING_GAP — audit wiring pending",
  // WP-3.5G: confirmHRImportAction + addMemberEndorsementAction now call writeAudit —
  // removed from the exclusion list so the harness polices them positively.
  "(hr)/hr/roster/import/actions.ts:parseHRImportAction": "READ_ONLY — parse/validate only; confirmHRImportAction persists",
  "analytics/renewals/[groupId]/renewal-actions.ts:commitScenarioAction": "PRE_EXISTING_GAP — audit wiring pending",
  "analytics/renewals/[groupId]/renewal-actions.ts:computeIntelligenceAction": "READ_MODEL refresh — derived analytics, no business state",
  "analytics/renewals/[groupId]/renewal-actions.ts:dispatchNoticeAction": "PRE_EXISTING_GAP — audit wiring pending",
  "analytics/renewals/[groupId]/renewal-actions.ts:saveScenarioAction": "PRE_EXISTING_GAP — audit wiring pending",
  "analytics/risk/actions.ts:bulkEnrolCareManagementAction": "PRE_EXISTING_GAP — audit wiring pending",
  "billing/actions.ts:recordPaymentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "billing/actions.ts:sendInvoiceAction": "PRE_EXISTING_GAP — audit wiring pending",
  "billing/gl/actions.ts:postManualEntryAction": "PRE_EXISTING_GAP — audit wiring pending",
  "billing/gl/actions.ts:seedChartOfAccountsAction": "PRE_EXISTING_GAP — audit wiring pending",
  "broker/quotations/[id]/actions.ts:sendBrokerQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "broker/quotations/[id]/actions.ts:withdrawBrokerQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "broker/quotations/new/actions.ts:createBrokerQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "brokers/actions.ts:updateBrokerAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cases/[id]/actions.ts:addServiceEntryAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cases/[id]/actions.ts:attachCasePreauthAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cases/[id]/actions.ts:cancelCaseAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cases/[id]/actions.ts:voidServiceEntryAction": "PRE_EXISTING_GAP — audit wiring pending",
  "check-ins/actions.ts:cancelCheckInAction": "PRE_EXISTING_GAP — audit wiring pending",
  "check-ins/actions.ts:confirmVisitCodeAction": "PRE_EXISTING_GAP — audit wiring pending",
  "check-ins/actions.ts:emergencyOverrideAction": "PRE_EXISTING_GAP — audit wiring pending",
  "check-ins/actions.ts:initiateCheckInAction": "PRE_EXISTING_GAP — audit wiring pending",
  "check-ins/actions.ts:knowledgeFallbackAction": "PRE_EXISTING_GAP — audit wiring pending",
  "check-ins/actions.ts:restartCheckInAction": "PRE_EXISTING_GAP — audit wiring pending",
  "claims/[id]/actions.ts:collectCoContributionAction": "PRE_EXISTING_GAP — audit wiring pending",
  "claims/[id]/actions.ts:waiveCoContributionAction": "PRE_EXISTING_GAP — audit wiring pending",
  "claims/[id]/adjudication-actions.ts:adjudicateLineAction": "PRE_EXISTING_GAP — audit wiring pending",
  "claims/[id]/adjudication-actions.ts:computeOutcomeAction": "READ_ONLY preview since W1.1 — no state write",
  "claims/[id]/adjudication-actions.ts:computeVarianceAction": "READ_MODEL — stamps derived variance metrics; source data unchanged",
  // initiateAppealAction removed (PNOS F5.17) — same-claim appeals retired for reconsideration.
  "claims/[id]/reimbursement-actions.ts:disburseReimbursementAction": "PRE_EXISTING_GAP — audit wiring pending",
  "claims/queues/actions.ts:getIncomingClaimCountAction": "READ_ONLY — polling count for the queues header",
  "contracts/actions.ts:createContractAction": "PRE_EXISTING_GAP — audit wiring pending",
  "contracts/import/actions.ts:commitExtractionAction": "PRE_EXISTING_GAP — audit wiring pending",
  "contracts/import/actions.ts:createExtractionAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:addInvoiceLineAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:assignFacilityAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:cancelCaseAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:captureEstimateAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:retireFacilityAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:startTreatmentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "cross-border/actions.ts:upsertFacilityAction": "PRE_EXISTING_GAP — audit wiring pending",
  // WP-3.5F/G: approveEndorsementAction + rejectEndorsementAction now delegate to
  // EndorsementsService, which audits internally — removed from the exclusion list.
  "endorsements/[id]/amendment-actions.ts:applyAmendmentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "endorsements/[id]/amendment-actions.ts:approveAmendmentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "endorsements/[id]/amendment-actions.ts:computeProRataAction": "READ_MODEL — pro-rata preview computation",
  "endorsements/[id]/amendment-actions.ts:rejectAmendmentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "endorsements/[id]/amendment-actions.ts:submitAmendmentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "endorsements/new/actions.ts:submitEndorsementAction": "PRE_EXISTING_GAP — audit wiring pending",
  "fund/[groupId]/actions.ts:generateAdminFeeInvoiceAction": "PRE_EXISTING_GAP — audit wiring pending",
  "fund/[groupId]/actions.ts:recordDepositAction": "PRE_EXISTING_GAP — audit wiring pending",
  "fund/[groupId]/actions.ts:toggleCategoryHoldAction": "PRE_EXISTING_GAP — audit wiring pending",
  // WP-S1/S2/S3: updateGroupAction (GROUP_UPDATED), changeGroupStatusAction
  // (GROUP_SUSPENDED/REACTIVATED/TERMINATED/…) and the three tier actions
  // (GROUP_TIER_*) all call writeAudit with before/after now — removed from the
  // exclusion list so the harness polices them positively.
  "groups/[id]/self-funded/actions.ts:configureSelfFundedSchemeAction": "PRE_EXISTING_GAP — audit wiring pending",
  "groups/[id]/self-funded/actions.ts:recordFundDepositAction": "PRE_EXISTING_GAP — audit wiring pending",
  "member/check-in/actions.ts:acknowledgeMemberCheckInAction": "PRE_EXISTING_GAP — audit wiring pending",
  "member/facilities/actions.ts:getNearbyProvidersAction": "READ_ONLY — geo search",
  "member/facilities/actions.ts:getProcedureCatalogAction": "READ_ONLY — catalogue read",
  "member/notifications/actions.ts:markAllMemberNotificationsReadAction": "LOW_RISK — member notification read-marker",
  "member/notifications/actions.ts:markMemberNotificationReadAction": "LOW_RISK — member notification read-marker",
  "member/preauth/actions.ts:submitMemberPreAuthAction": "PRE_EXISTING_GAP — audit wiring pending",
  "member/reinstatement/actions.ts:requestReinstatementAction": "PRE_EXISTING_GAP — audit wiring pending",
  "member/security/actions.ts:revokeCredentialAction": "PRE_EXISTING_GAP — audit wiring pending",
  "member/wallet/actions.ts:initiateMpesaPaymentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:initiateCoolingOffCancellationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:initiateStandardCancellationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:lapseManuallyAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:recordDeathAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:reinstateWithinCatchupAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:terminateForBreachAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/lifecycle-actions.ts:terminateForFraudAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:initiateOnboardingAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:issueDigitalCardAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:markPortalProvisionedAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:queuePhysicalCardAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:saveKycAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:sendWelcomeAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:updateCardStatusAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/onboarding/actions.ts:uploadKycDocAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/[id]/webauthn/actions.ts:createBranchEnrollmentApprovalAction": "PRE_EXISTING_GAP — audit wiring pending",
  "members/import/actions.ts:parseImportAction": "READ_ONLY — parse/validate only; confirmImportAction persists",
  // WP-3.5G: approveReinstatementAction + declineReinstatementAction now call
  // writeAudit — removed from the exclusion list so the harness polices them.
  "offline-capture/actions.ts:ingestOfflineOpsAction": "PRE_EXISTING_GAP — audit wiring pending",
  "offline-capture/actions.ts:unlockOfflineWorkAction": "PRE_EXISTING_GAP — audit wiring pending",
  // WP-2.0: all six package write sites now call writeAudit (PACKAGE_VERSION_CREATE /
  // SHARED_LIMIT_* / PACKAGE_PROVIDER_ELIGIBILITY_* / PACKAGE_CREATE) — removed from
  // the exclusion list so the harness polices them positively.
  "providers/[id]/actions.ts:addCredentialAction": "PRE_EXISTING_GAP — audit wiring pending",
  "providers/[id]/actions.ts:createPractitionerAndLinkAction": "PRE_EXISTING_GAP — audit wiring pending",
  // WP-N3: deleteCptTariffAction / deleteDiagnosisTariffAction / upsertDiagnosisTariffAction
  // now soft-deactivate + writeAudit — no longer gaps, removed from this list.
  "providers/[id]/actions.ts:linkExistingPractitionerAction": "PRE_EXISTING_GAP — audit wiring pending",
  "providers/[id]/actions.ts:unlinkPractitionerAction": "PRE_EXISTING_GAP — audit wiring pending",
  "providers/[id]/actions.ts:updateContractAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/actions.ts:acceptQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/actions.ts:declineQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/actions.ts:expireQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/actions.ts:sendQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:addLifeAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:approveSeniorAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:declineAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:recordDecisionAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:returnToSubmitterAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:submitForPricingAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/assess/actions.ts:submitForValidationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/bind/actions.ts:acceptQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/bind/actions.ts:approveBinderAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/bind/actions.ts:createMembershipsAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/bind/actions.ts:postDebitNoteAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/build/actions.ts:buildQuoteAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/[id]/build/actions.ts:issueQuoteAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/calculator/actions.ts:generateQuotationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "quotations/new/actions.ts:createIntakeAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/actions.ts:upsertIntegrationAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/actions.ts:upsertNotificationTemplateAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/approval-matrix/actions.ts:createApprovalMatrixRuleAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/approval-matrix/actions.ts:deleteApprovalMatrixRuleAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/approval-matrix/actions.ts:toggleApprovalMatrixRuleAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/fx-rates/actions.ts:deactivateFxRateAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/pricing-models/[id]/actions.ts:deleteRateTableEntryAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/pricing-models/[id]/actions.ts:upsertRateTableEntryAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/pricing-models/actions.ts:createPricingModelAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/security/actions.ts:startTotpEnrolmentAction": "PRE_EXISTING_GAP — audit wiring pending",
  "settings/terminology/actions.ts:submitTermAction": "PRE_EXISTING_GAP — audit wiring pending",
  "wellness/actions.ts:logActivityAction": "PRE_EXISTING_GAP — audit wiring pending",
  "wellness/actions.ts:retireProgramAction": "PRE_EXISTING_GAP — audit wiring pending",
  "wellness/actions.ts:upsertProgramAction": "PRE_EXISTING_GAP — audit wiring pending",
  "wellness/actions.ts:withdrawAction": "PRE_EXISTING_GAP — audit wiring pending",
};
