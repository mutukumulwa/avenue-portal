import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { ClaimDecisionService } from "@/server/services/claim-decision.service";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";
import { TenantSettingsService } from "@/server/services/tenant-settings.service";
import { prisma } from "@/lib/prisma";
import { adjudicateClaimAction, resolveExceptionAction, requestPriceOverrideAction, voidClaimAction } from "./actions";
import { disburseReimbursementAction } from "./reimbursement-actions";
import {
  adjudicateLineAction, computeOutcomeAction,
  initiateAppealAction, computeVarianceAction,
} from "./adjudication-actions";
import { ExceptionModal } from "./ExceptionModal";
import { ArrowLeft, Clock, CheckCircle2, XCircle, AlertTriangle, Info, FlaskConical, Pill, ScanLine, Stethoscope, Scissors, HelpCircle, ShieldAlert, ShieldCheck, ShieldX, Percent, BarChart2, Scale, FileSignature } from "lucide-react";
import Link from "next/link";
import { ClaimDocuments } from "./ClaimDocuments";
import { CoContributionCollectionForm } from "./CoContributionCollectionForm";
import { ContractPanel } from "./ContractPanel";
import { PreauthPanel } from "./PreauthPanel";

const LINE_CAT_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  CONSULTATION: { label: "Consultation", color: "bg-brand-indigo/10 text-brand-indigo",  Icon: Stethoscope },
  LABORATORY:   { label: "Laboratory",   color: "bg-[#17A2B8]/10 text-[#17A2B8]",          Icon: FlaskConical },
  PHARMACY:     { label: "Pharmacy",     color: "bg-[#28A745]/10 text-[#28A745]",          Icon: Pill         },
  IMAGING:      { label: "Imaging",      color: "bg-[#FFC107]/10 text-[#856404]",          Icon: ScanLine     },
  PROCEDURE:    { label: "Procedure",    color: "bg-[#DC3545]/10 text-[#DC3545]",          Icon: Scissors     },
  OTHER:        { label: "Other",        color: "bg-[#6C757D]/10 text-[#6C757D]",          Icon: HelpCircle   },
};

export default async function ClaimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;
  const tenantId = session.user.tenantId;
  const [claim, contractRates, coContribTx, reimbRequest, claimLines] = await Promise.all([
    ClaimsService.getClaimById(tenantId, id),
    ClaimsService.resolveClaimContractRates(tenantId, id),
    prisma.coContributionTransaction.findUnique({ where: { claimId: id } }),
    prisma.reimbursementRequest.findUnique({ where: { claimId: id } }),
    prisma.claimLine.findMany({ where: { claimId: id }, orderBy: { lineNumber: "asc" } }),
  ]);

  if (!claim) notFound();
  const tariffVariances = contractRates.lines;
  const governingContract = contractRates.contract;

  // IPL-PA-01: a case-linked claim (interim slice / final bill) is secured by
  // PAs attached to its CASE — read them through here so the panel, the
  // availability credit and the cover cap all see the episode's guarantee, not
  // just the slice's own (empty) FK list.
  const effectivePreauths = claim.caseId
    ? await prisma.preAuthorization.findMany({
        where: { tenantId, OR: [{ claimId: claim.id }, { caseId: claim.caseId }] },
        orderBy: { approvedAt: "asc" },
      })
    : claim.preauths;

  // Prisma Decimal fields don't survive the RSC boundary (the flight stream
  // aborts and the page never hydrates) — hand the client form plain numbers.
  const coContribView = coContribTx
    ? {
        id: coContribTx.id,
        finalAmount: Number(coContribTx.finalAmount),
        planShare: Number(coContribTx.planShare),
        amountCollected: Number(coContribTx.amountCollected),
        capsApplied: coContribTx.capsApplied,
        collectionStatus: coContribTx.collectionStatus,
      }
    : null;

  // Build a lookup map: lineId → variance data
  const tariffMap = new Map(tariffVariances.map(v => [v.lineId, v]));
  const overbilledLines = tariffVariances.filter(v => v.variance !== null && v.variance > 0);
  // OBS-B7: the preview must use the same arithmetic as the enforced ceiling
  // (assessCeiling / BD-07): a line with no contracted rate contributes 0 —
  // NOT its billed amount. Unpriced lines are surfaced separately.
  const unpricedPreviewCount = tariffVariances.filter((v) => v.agreedRate === null).length;
  const contractedTotal = tariffVariances.reduce((sum, v) => {
    if (v.agreedRate === null) return sum;
    const l = claim.claimLines.find((l) => l.id === v.lineId);
    return l ? sum + v.agreedRate * l.quantity : sum;
  }, 0);

  const canCapture    = ["RECEIVED", "INCURRED"].includes(claim.status);
  const canAdjudicate = ["CAPTURED", "UNDER_REVIEW"].includes(claim.status);

  // Process 9 derived state
  const p9Claim = await prisma.claim.findUnique({
    where: { id },
    select: {
      contractedRate: true, contractedVariancePct: true,
      adjudicatorId: true, seniorAdjudicatorId: true, appealReviewerId: true,
      settlementBatchId: true,
    },
  });
  const variancePct    = p9Claim?.contractedVariancePct ? Number(p9Claim.contractedVariancePct) : null;
  const hasHighVar     = variancePct !== null && variancePct > 0.20;
  const allLinesDecided = claimLines.length > 0 && claimLines.every((l) => !!l.adjudicationDecision);
  const canComputeOutcome = allLinesDecided && canAdjudicate;
  const isOutcomeSet   = ["APPROVED","PARTIALLY_APPROVED","DECLINED"].includes(claim.status);
  const canVoid        = ["APPROVED","PARTIALLY_APPROVED"].includes(claim.status) && !p9Claim?.settlementBatchId;
  const canAppeal      = ["DECLINED","PARTIALLY_APPROVED"].includes(claim.status);
  const diagnoses = claim.diagnoses as { code?: string; icdCode?: string; description: string; isPrimary?: boolean }[];

  // PR-014 #2: show billed / engine payable / delta BEFORE submission so the
  // adjudicator is never surprised by the enforcement block. PR-015: attached
  // PA cover for the over-cover confirmation.
  const [ceiling, paCoverage, priceOverrideApproved] = canAdjudicate
    ? await Promise.all([
        ClaimDecisionService.assessCeiling(tenantId, id),
        ClaimsService.getPreauthCoverage(tenantId, id),
        ClaimDecisionService.hasApprovedPriceOverride(tenantId, id),
      ])
    : [null, null, false];

  // P1.5: show the adjudicator every benefit constraint BEFORE submission —
  // never one misleading "remaining" number when category, overall and shared
  // pools differ. Same computation the decision gate enforces (holds this
  // claim would convert are credited). Read-surface: a DEC-06 data-quality
  // block renders as its message instead of a panel.
  let availability = null as Awaited<ReturnType<typeof BenefitUsageService.computeAvailability>> | null;
  let availabilityError: string | null = null;
  if (canAdjudicate) {
    try {
      availability = await BenefitUsageService.computeAvailability(prisma, {
        memberId: claim.memberId,
        benefitCategory: claim.benefitCategory,
        requestedAmount: Number(claim.billedAmount),
        serviceDate: claim.dateOfService ?? undefined,
        creditPreauthIds: effectivePreauths?.filter((p) => ["APPROVED", "ATTACHED"].includes(p.status)).map((p) => p.id) ?? [],
      });
    } catch (e) {
      availabilityError = e instanceof Error ? e.message : "Benefit availability could not be computed.";
    }
  }

  // OBS-7 fraud gate preview: when the tenant requires fraud clearance, surface
  // the unresolved alerts at/above threshold that will block an approval, so the
  // adjudicator sees the reason before hitting Submit (and can send it to the
  // Fraud console). Advisory only — the enforcement lives in the decision stack.
  const claimControls = await TenantSettingsService.getClaimControls(tenantId);
  const blockingFraudAlerts =
    claimControls.requireFraudClearanceBeforeApproval && canAdjudicate
      ? (
          await prisma.claimFraudAlert.findMany({
            where: { tenantId, claimId: id, resolved: false },
            select: { id: true, rule: true, severity: true },
          })
        ).filter((a) =>
          TenantSettingsService.severityAtLeast(a.severity, claimControls.fraudApprovalSeverityThreshold),
        )
      : [];

  // Group structured claim lines by service category
  const linesByCategory = (claim.claimLines ?? []).reduce<Record<string, typeof claim.claimLines>>((acc, line) => {
    const cat = (line as { serviceCategory?: string }).serviceCategory ?? "OTHER";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(line);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Error banner from server actions */}
      {error && (
        <div className="flex items-center gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-[#856404] shrink-0" />
          <p className="text-sm font-semibold text-[#856404] flex-1">
            {error}
          </p>
        </div>
      )}

      {/* Notice banner (success / preview feedback) */}
      {notice && (
        <div className="flex items-center gap-3 bg-[#28A745]/10 border border-[#28A745]/40 rounded-lg px-4 py-3">
          <CheckCircle2 size={18} className="text-[#28A745] shrink-0" />
          <p className="text-sm font-semibold text-[#1E7E34] flex-1">{notice}</p>
        </div>
      )}

      {/* Exception banner */}
      {claim.hasException && (
        <div className="flex items-center gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <ShieldAlert size={18} className="text-[#856404] shrink-0" />
          <p className="text-sm font-semibold text-[#856404] flex-1">
            This claim has one or more open exceptions flagged for review.
          </p>
          <a href="#exceptions" className="text-xs font-bold text-[#856404] underline underline-offset-2">View below</a>
        </div>
      )}

      <div className="flex items-center space-x-4">
        <Link href="/claims" className="text-brand-text-body hover:text-brand-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">
            Claim {claim.claimNumber}
          </h1>
          <p className="text-brand-text-body font-body mt-1">Review details and adjudicate.</p>
        </div>
        <ExceptionModal claimId={claim.id} claimNumber={claim.claimNumber} />
        <span className={`px-4 py-2 text-xs font-bold uppercase rounded-full ${
          claim.status === "APPROVED" || claim.status === "PAID" ? "bg-[#28A745]/10 text-[#28A745]" :
          claim.status === "DECLINED" ? "bg-[#DC3545]/10 text-[#DC3545]" :
          "bg-[#17A2B8]/10 text-[#17A2B8]"
        }`}>
          {claim.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-brand-text-muted font-bold uppercase tracking-wide">Member</p>
          <p className="text-lg font-bold text-brand-text-heading mt-1">{claim.member.firstName} {claim.member.lastName}</p>
          <p className="text-sm text-brand-text-body">{claim.member.memberNumber}</p>
          <p className="text-xs text-brand-text-muted mt-2">Group: {claim.member.group.name}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-brand-text-muted font-bold uppercase tracking-wide">Provider</p>
          <p className="text-lg font-bold text-brand-text-heading mt-1">{claim.provider.name}</p>
          <p className="text-sm text-brand-text-body capitalize">{claim.provider.type.toLowerCase()} · {claim.provider.tier}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-brand-text-muted font-bold uppercase tracking-wide">Financial Summary</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-brand-text-body">Billed</span><span className="font-bold text-brand-text-heading">{claim.currency} {Number(claim.billedAmount).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-brand-text-body">Approved</span><span className="font-bold text-[#28A745]">{claim.currency} {Number(claim.approvedAmount).toLocaleString()}</span></div>
            {/* OBS-2 Ticket 5: base (UGX) equivalent for a non-base claim, pinned at the decision-date rate. */}
            {claim.currency !== (claim.baseCurrency ?? "UGX") && Number(claim.approvedBaseAmount) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-brand-text-muted">≈ base ({claim.baseCurrency ?? "UGX"})</span>
                <span className="font-medium text-brand-text-muted">
                  {claim.baseCurrency ?? "UGX"} {Number(claim.approvedBaseAmount).toLocaleString()}
                  {claim.fxRateToBase ? ` @ ${Number(claim.fxRateToBase)}` : ""}
                </span>
              </div>
            )}
            <div className="flex justify-between"><span className="text-brand-text-body">Copay</span><span className="font-semibold text-brand-text-heading">{claim.currency} {Number(claim.copayAmount).toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      {/* IPL-PA-01: episode linkage — a slice / final bill names its case. */}
      {claim.caseId && claim.case && (
        <Link
          href={`/cases/${claim.caseId}`}
          className="flex items-center gap-2 rounded-lg border border-brand-indigo/20 bg-brand-indigo/5 px-4 py-2.5 text-sm text-brand-text-body hover:bg-brand-indigo/10"
        >
          <Info size={15} className="text-brand-indigo shrink-0" />
          <span>
            {claim.isInterimBill
              ? `Interim slice ${claim.caseSliceSeq ?? ""} of case ${claim.case.caseNumber}`
              : `Final bill of case ${claim.case.caseNumber}`}{" "}
            — its pre-authorisations are read through from the case.
          </span>
        </Link>
      )}

      {/* Attached pre-authorizations (WP-C3) */}
      <PreauthPanel
        claim={{
          id: claim.id,
          tenantId,
          memberId: claim.memberId,
          providerId: claim.providerId,
          status: claim.status,
          caseId: claim.caseId,
          preauths: effectivePreauths,
        }}
      />

      {/* Diagnoses */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
        <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-3 flex items-center gap-2">
          <Info size={16} className="text-brand-indigo" /> Diagnoses
        </h3>
        <div className="space-y-2">
          {diagnoses.map((d, i) => (
            <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${d.isPrimary ? "bg-brand-indigo/5 border border-brand-indigo/20" : "bg-[#F8F9FA]"}`}>
              <div className="flex items-center gap-2">
                {d.isPrimary && <span className="text-[10px] font-bold uppercase bg-brand-indigo text-white px-1.5 py-0.5 rounded-full">Primary</span>}
                <span className="text-brand-text-heading">{d.description}</span>
              </div>
              {(d.code ?? d.icdCode) && (
                <span className="text-xs font-mono font-bold text-brand-indigo bg-brand-indigo/10 px-2 py-0.5 rounded">
                  {d.code ?? d.icdCode}
                </span>
              )}
            </div>
          ))}
          {diagnoses.length === 0 && <p className="text-sm text-brand-text-muted">No diagnoses recorded.</p>}
        </div>
      </div>

      {/* Governing contract banner */}
      {governingContract ? (
        <div className="flex items-start gap-3 bg-brand-indigo/5 border border-brand-indigo/20 rounded-lg px-4 py-3 text-sm">
          <FileSignature size={18} className="text-brand-indigo shrink-0 mt-0.5" />
          <div>
            <p className="text-brand-text-heading">
              Adjudicating under{" "}
              <Link href={`/contracts/${governingContract.id}`} className="font-bold text-brand-indigo hover:underline">
                {governingContract.contractNumber}
              </Link>{" "}
              — {governingContract.title}
            </p>
            <p className="text-xs text-brand-text-muted mt-0.5">
              Unlisted services: {governingContract.unlistedServiceRule.replace(/_/g, " ").toLowerCase()}
              {governingContract.unlistedDiscountPct != null && ` (−${governingContract.unlistedDiscountPct}%)`}
              {" · "}contract ends {new Date(governingContract.endDate).toLocaleDateString("en-UG")}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3 text-sm text-[#856404]">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            <span className="font-bold">No active contract covers this service date.</span>{" "}
            No payable ceiling is enforced — every line is reviewer judgement. Set up a contract from the provider page.
          </p>
        </div>
      )}

      {/* Digital contract engine panel (spec §11.6) */}
      <ContractPanel tenantId={tenantId} claimId={id} />

      {/* Tariff variance banner */}
      {overbilledLines.length > 0 && (
        <div className="flex items-start gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-[#856404] shrink-0 mt-0.5" />
          <div className="text-sm text-[#856404]">
            <p className="font-bold">
              {overbilledLines.length} line{overbilledLines.length > 1 ? "s" : ""} billed above contracted rate.
              {" "}Contracted total (priced lines only): <span className="font-mono">{claim.currency} {Math.round(contractedTotal).toLocaleString("en-UG")}</span>
              {" "}vs billed: <span className="font-mono">{claim.currency} {Number(claim.billedAmount).toLocaleString("en-UG")}</span>.
            </p>
            {unpricedPreviewCount > 0 && (
              <p className="mt-0.5 text-xs">
                {unpricedPreviewCount} line{unpricedPreviewCount > 1 ? "s have" : " has"} no contracted
                rate and {unpricedPreviewCount > 1 ? "are" : "is"} excluded from the enforceable ceiling (BD-07).
              </p>
            )}
            <p className="mt-0.5 text-xs">Consider approving the contracted total or raising an exception for overages.</p>
          </div>
        </div>
      )}

      {/* Service line items grouped by category */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <h3 className="font-bold text-brand-text-heading font-heading">Service Line Items</h3>
          <div className="flex items-center gap-4 text-sm font-bold">
            {overbilledLines.length > 0 && (
              <span className="text-[#856404]">Contracted (priced): {claim.currency} {Math.round(contractedTotal).toLocaleString("en-UG")}</span>
            )}
            <span className="text-brand-indigo">Billed: {claim.currency} {Number(claim.billedAmount).toLocaleString("en-UG")}</span>
          </div>
        </div>

        {Object.keys(linesByCategory).length > 0 ? (
          <div className="divide-y divide-[#EEEEEE]">
            {Object.entries(linesByCategory).map(([cat, lines]) => {
              const meta = LINE_CAT_META[cat] ?? LINE_CAT_META.OTHER;
              const CatIcon = meta.Icon;
              const catTotal = lines.reduce((s, l) => s + Number(l.billedAmount), 0);
              return (
                <div key={cat}>
                  <div className="px-5 py-2 bg-[#F8F9FA] flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase px-2.5 py-1 rounded-full ${meta.color}`}>
                      <CatIcon size={11} /> {meta.label}
                    </span>
                    <span className="text-xs font-semibold text-brand-text-muted">
                      {claim.currency} {catTotal.toLocaleString("en-UG")}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
                        <th className="px-5 py-2 text-left">Description</th>
                        <th className="px-5 py-2 text-left">CPT</th>
                        <th className="px-5 py-2 text-right">Qty</th>
                        <th className="px-5 py-2 text-right">Unit Cost</th>
                        <th className="px-5 py-2 text-right">Contracted</th>
                        <th className="px-5 py-2 text-right">Billed</th>
                        <th className="px-5 py-2 text-right">Approved</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEEEEE]">
                      {lines.map(l => {
                        const tv = tariffMap.get(l.id);
                        const isOver = tv?.variance !== null && tv?.variance !== undefined && tv.variance > 0;
                        return (
                          <tr key={l.id} className={isOver ? "bg-[#FFF8E1]" : "hover:bg-[#F8F9FA]"}>
                            <td className="px-5 py-2.5 text-brand-text-heading">{l.description}</td>
                            <td className="px-5 py-2.5 font-mono text-xs text-brand-text-muted">{(l as { cptCode?: string }).cptCode ?? "—"}</td>
                            <td className="px-5 py-2.5 text-right">{l.quantity}</td>
                            <td className={`px-5 py-2.5 text-right ${isOver ? "text-[#856404] font-semibold" : ""}`}>
                              {Number(l.unitCost).toLocaleString("en-UG")}
                            </td>
                            <td className="px-5 py-2.5 text-right text-brand-text-muted">
                              {tv?.agreedRate !== null && tv?.agreedRate !== undefined ? (
                                <span className="flex items-center justify-end gap-1">
                                  {tv.agreedRate.toLocaleString("en-UG")}
                                  {tv.requiresPreauth && (
                                    <span className="text-[10px] font-bold text-[#856404] bg-[#FFC107]/20 px-1 rounded" title="Contract requires pre-authorization for this service">PA</span>
                                  )}
                                  {isOver && tv.variancePct !== null && (
                                    <span className="text-[10px] font-bold text-[#856404] bg-[#FFC107]/20 px-1 rounded">
                                      +{tv.variancePct}%
                                    </span>
                                  )}
                                </span>
                              ) : tv?.ruleApplied === "EXCLUDED" ? (
                                <span className="text-[10px] font-bold text-[#DC3545] bg-[#DC3545]/10 px-1.5 py-0.5 rounded" title="Contractually excluded at this provider — pays 0">NOT COVERED</span>
                              ) : tv?.ruleApplied === "UNLISTED_REJECT" ? (
                                <span className="text-[10px] font-bold text-[#DC3545] bg-[#DC3545]/10 px-1.5 py-0.5 rounded" title="Contract does not pay unlisted services">NOT PAYABLE</span>
                              ) : tv?.ruleApplied === "UNLISTED_DISCOUNT" && tv.allowedUnit !== null ? (
                                <span className="flex items-center justify-end gap-1">
                                  {tv.allowedUnit.toLocaleString("en-UG")}
                                  <span className="text-[10px] font-bold text-brand-indigo bg-brand-indigo/10 px-1 rounded" title="Unlisted service — contract discount off billed applied">unlisted</span>
                                </span>
                              ) : tv?.ruleApplied === "UNLISTED_PAY_AS_BILLED" ? (
                                <span className="text-[10px] font-bold text-brand-text-muted bg-[#F8F9FA] px-1.5 py-0.5 rounded" title="Unlisted service — contract honours billed charges">as billed</span>
                              ) : (
                                <span className="text-brand-text-muted/40" title="No contracted rate — reviewer judgement">—</span>
                              )}
                            </td>
                            <td className={`px-5 py-2.5 text-right font-semibold ${isOver ? "text-[#DC3545]" : "text-brand-text-heading"}`}>
                              {Number(l.billedAmount).toLocaleString("en-UG")}
                            </td>
                            <td className="px-5 py-2.5 text-right font-semibold text-[#28A745]">
                              {Number(l.approvedAmount) > 0 ? Number(l.approvedAmount).toLocaleString("en-UG") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-brand-text-muted text-center">No structured line items — legacy claim entry.</p>
        )}
      </div>

      {/* Adjudication timeline */}
      {claim.adjudicationLogs.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-4">Adjudication Timeline</h3>
          <div className="space-y-3">
            {claim.adjudicationLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <div className="pt-0.5">
                  {["APPROVED", "APPEAL_APPROVED"].includes(log.action) ? <CheckCircle2 size={16} className="text-[#28A745]" /> :
                   ["DECLINED", "APPEAL_DECLINED"].includes(log.action) ? <XCircle size={16} className="text-[#DC3545]" /> :
                   <Clock size={16} className="text-[#17A2B8]" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-brand-text-heading">{log.action.replace(/_/g, " ")}</p>
                  {log.notes && <p className="text-brand-text-body mt-0.5">{log.notes}</p>}
                  <p className="text-xs text-brand-text-muted mt-1">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exception log */}
      {claim.exceptionLogs.length > 0 && (
        <div id="exceptions" className="bg-white border border-[#FFC107]/40 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-4 flex items-center gap-2">
            <ShieldAlert size={16} className="text-[#856404]" /> Exception Register
          </h3>
          <div className="space-y-3">
            {claim.exceptionLogs.map(log => (
              <div key={log.id} className={`rounded-lg border p-4 ${
                log.status === "PENDING"  ? "border-[#FFC107]/40 bg-[#FFF8E1]" :
                log.status === "APPROVED" ? "border-[#28A745]/30 bg-[#28A745]/5" :
                "border-[#DC3545]/30 bg-[#DC3545]/5"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {log.status === "PENDING"  && <ShieldAlert  size={14} className="text-[#856404] shrink-0 mt-0.5" />}
                    {log.status === "APPROVED" && <ShieldCheck  size={14} className="text-[#28A745] shrink-0 mt-0.5" />}
                    {log.status === "REJECTED" && <ShieldX      size={14} className="text-[#DC3545] shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-sm font-bold text-brand-text-heading">
                        {log.exceptionCode.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm text-brand-text-body mt-0.5">{log.reason}</p>
                      {log.notes && <p className="text-xs text-brand-text-muted mt-1">{log.notes}</p>}
                      <p className="text-xs text-brand-text-muted mt-1">
                        Raised by {log.raisedBy.firstName} {log.raisedBy.lastName} · {new Date(log.createdAt).toLocaleString()}
                      </p>
                      {log.resolutionNote && (
                        <p className="text-xs text-brand-text-muted mt-1">
                          Resolution: {log.resolutionNote}
                          {log.resolvedBy && ` — ${log.resolvedBy.firstName} ${log.resolvedBy.lastName}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {log.status === "PENDING" && (
                    <div className="flex gap-2 shrink-0">
                      <form action={resolveExceptionAction}>
                        <input type="hidden" name="exceptionId"    value={log.id} />
                        <input type="hidden" name="claimId"        value={claim.id} />
                        <input type="hidden" name="status"         value="APPROVED" />
                        <input type="hidden" name="resolutionNote" value="Approved by reviewer." />
                        <button type="submit" className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-[#28A745]/10 text-[#28A745] hover:bg-[#28A745]/20 transition-colors">
                          <ShieldCheck size={11} /> Approve
                        </button>
                      </form>
                      <form action={resolveExceptionAction}>
                        <input type="hidden" name="exceptionId"    value={log.id} />
                        <input type="hidden" name="claimId"        value={claim.id} />
                        <input type="hidden" name="status"         value="REJECTED" />
                        <input type="hidden" name="resolutionNote" value="Rejected by reviewer." />
                        <button type="submit" className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-[#DC3545]/10 text-[#DC3545] hover:bg-[#DC3545]/20 transition-colors">
                          <ShieldX size={11} /> Reject
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supporting documents */}
      <ClaimDocuments
        claimId={claim.id}
        initialDocuments={claim.documents.map((d) => ({
          ...d,
          fileSize: d.fileSize ?? null,
          mimeType: d.mimeType ?? null,
        }))}
      />

      {/* Co-contribution */}
      {coContribView && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-1 flex items-center gap-2">
            <Percent size={15} className="text-brand-indigo" /> Member Co-Contribution
          </h3>
          <CoContributionCollectionForm transaction={coContribView} />
        </div>
      )}

      {/* Reimbursement payment details banner */}
      {(claim as { isReimbursement?: boolean }).isReimbursement && (
        <div className="bg-[#EEF2FF] border border-brand-indigo/20 rounded-lg p-4 text-sm space-y-1">
          <p className="font-bold text-brand-text-heading">Reimbursement Claim — pay member directly</p>
          {(claim as { reimbursementMpesaPhone?: string }).reimbursementMpesaPhone && (
            <p className="text-brand-text-body">M-Pesa: <span className="font-mono font-semibold">{(claim as { reimbursementMpesaPhone?: string }).reimbursementMpesaPhone}</span></p>
          )}
          {(claim as { reimbursementBankName?: string; reimbursementAccountNo?: string }).reimbursementBankName && (
            <p className="text-brand-text-body">
              Bank: <span className="font-semibold">{(claim as { reimbursementBankName?: string }).reimbursementBankName}</span>
              {" · Acc: "}<span className="font-mono">{(claim as { reimbursementAccountNo?: string }).reimbursementAccountNo}</span>
            </p>
          )}
        </div>
      )}

      {/* Mark as captured — data entry complete */}
      {canCapture && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-sm font-semibold text-brand-text-heading mb-1">Data Entry Complete?</p>
          <p className="text-xs text-brand-text-muted mb-3">
            Once all service lines and documents are captured, mark this claim as ready for adjudication.
          </p>
          <form action={adjudicateClaimAction}>
            <input type="hidden" name="claimId" value={claim.id} />
            <input type="hidden" name="action" value="CAPTURED" />
            <button type="submit"
              className="px-5 py-2 rounded-full text-sm font-bold bg-[#17A2B8] hover:bg-[#138496] text-white transition-colors">
              Mark as Captured — Forward for Review
            </button>
          </form>
        </div>
      )}

      {/* Adjudication form — the ONE approval path (W1.1) */}
      {canAdjudicate && (
        <div className="bg-white border-2 border-brand-indigo/20 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-bold text-brand-text-heading font-heading flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-brand-indigo" />
            Adjudicate Claim
          </h3>

          {/* PR-014 #2: enforcement preview — billed / payable ceiling / delta */}
          {ceiling?.unpriced ? (
            // BD-04: active contract but nothing priced (uncoded/unlisted). The
            // approved amount defaults to 0 and full-billed approval is blocked
            // server-side — this banner tells the reviewer the real remedy.
            <div className="mb-4 rounded-lg border border-[#DC3545]/40 bg-[#DC3545]/5 px-4 py-3 text-sm">
              <p className="font-bold text-[#DC3545]">No enforceable contract price found</p>
              <p className="mt-1 text-brand-text-body">
                This claim is under an active contract ({ceiling.contractNumber}), but no line resolved to a
                contracted rate — the service is uncoded or unlisted. Approval defaults to{" "}
                <span className="font-semibold">0</span>. Correct the CPT/service coding so the tariff binds,
                adjust the line to a documented amount, or raise a{" "}
                <span className="font-semibold">PAY ABOVE CONTRACT RATE</span> override. Approving the full
                billed amount is not permitted.
              </p>
            </div>
          ) : ceiling && ceiling.ceiling !== null ? (
            <div className="mb-4 grid grid-cols-3 gap-4 rounded-lg bg-[#F8F9FA] border border-[#EEEEEE] px-4 py-3 text-sm">
              <div>
                <p className="text-xs text-brand-text-muted">Billed</p>
                <p className="font-bold text-brand-text-heading mt-0.5">{claim.currency} {Number(claim.billedAmount).toLocaleString("en-UG")}</p>
              </div>
              <div>
                <p className="text-xs text-brand-text-muted">Payable ceiling ({ceiling.source})</p>
                <p className="font-bold text-brand-indigo mt-0.5">{claim.currency} {Math.round(ceiling.ceiling).toLocaleString("en-UG")}</p>
              </div>
              <div>
                <p className="text-xs text-brand-text-muted">Delta vs billed</p>
                <p className={`font-bold mt-0.5 ${Number(claim.billedAmount) - ceiling.ceiling > 0 ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                  {claim.currency} {Math.round(Number(claim.billedAmount) - ceiling.ceiling).toLocaleString("en-UG")}
                </p>
              </div>
              {ceiling.hasUnpricedLines && (
                <p className="col-span-3 text-xs font-semibold text-[#856404]">
                  BD-07: one or more line(s) are uncoded/unlisted with no contracted rate — they are EXCLUDED from the payable ceiling above.
                  Correct the coding so the tariff binds, adjust the line to a documented amount, or raise a PAY ABOVE CONTRACT RATE override to pay them.
                  Approving the full billed amount is not permitted.
                </p>
              )}
              {priceOverrideApproved && (
                <p className="col-span-3 text-xs font-semibold text-[#856404]">
                  An approved PAY ABOVE CONTRACT RATE override exists — the ceiling may be exceeded for this claim.
                </p>
              )}
            </div>
          ) : (
            <div className="mb-4 rounded-lg bg-[#FFF8E1] border border-[#FFC107]/40 px-4 py-2.5 text-xs font-semibold text-[#856404]">
              No contract ceiling — reviewer judgement applies to the approved amount.
            </div>
          )}

          {/* P1.5: benefit availability — every binding constraint separately,
              never one misleading "remaining" number. Same result the decision
              gate enforces. */}
          {availabilityError && (
            <div className="mb-4 rounded-lg border border-brand-error/40 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
              <p className="font-bold">Benefit availability blocked (data quality)</p>
              <p className="mt-1 text-brand-error/90">{availabilityError}</p>
            </div>
          )}
          {availability && (
            <div className="mb-4 rounded-lg bg-[#F8F9FA] border border-[#EEEEEE] px-4 py-3">
              <p className="text-xs font-bold text-brand-text-heading">
                Benefit availability — approvable up to {claim.currency} {Math.floor(availability.payableCeiling).toLocaleString("en-UG")}
                {availability.binding ? ` · binding: ${availability.binding.label}` : ""}
              </p>
              <div className="mt-2 space-y-1">
                {availability.constraints.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between gap-3 text-xs ${availability.binding === c ? "font-semibold text-[#856404]" : "text-brand-text-muted"}`}
                  >
                    <span>{c.label}</span>
                    <span className="text-right">
                      {c.kind === "PER_VISIT"
                        ? `${claim.currency} ${c.limit.toLocaleString("en-UG")} per visit`
                        : `${claim.currency} ${Math.floor(c.available).toLocaleString("en-UG")} available (limit ${c.limit.toLocaleString("en-UG")} · used ${c.used.toLocaleString("en-UG")} · reserved ${c.held.toLocaleString("en-UG")})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OBS-7: fraud-clearance gate banner — approval is blocked until cleared */}
          {blockingFraudAlerts.length > 0 && (
            <div className="mb-4 rounded-lg border border-brand-error/40 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
              <p className="font-bold">Fraud clearance required before approval</p>
              <p className="mt-1 text-brand-error/90">
                This claim has {blockingFraudAlerts.length} unresolved fraud alert(s) at or above{" "}
                {claimControls.fraudApprovalSeverityThreshold} severity:{" "}
                {Array.from(new Set(blockingFraudAlerts.map((a) => a.rule))).join(", ")}. Approval
                will be blocked until the Fraud team clears the alert(s)
                {claimControls.fraudApprovalGateMode === "CLEAR_ALERT_OR_DUAL_APPROVAL"
                  ? " or a fraud-clearance approval completes."
                  : "."}{" "}
                Declining the claim is still allowed.
              </p>
            </div>
          )}

          <form action={adjudicateClaimAction} className="space-y-4">
            <input type="hidden" name="claimId" value={claim.id} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-brand-text-heading">Decision</label>
                <select required name="action" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-brand-indigo transition-colors">
                  <option value="APPROVED">Approve (Full)</option>
                  <option value="PARTIALLY_APPROVED">Partially Approve</option>
                  <option value="DECLINED">Decline</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-brand-text-heading">
                  Approved Amount ({claim.currency})
                  {ceiling?.ceiling != null && (
                    <span className="ml-2 text-xs font-normal text-[#856404]">
                      — ceiling: {Math.round(ceiling.ceiling).toLocaleString("en-UG")}
                    </span>
                  )}
                </label>
                <input
                  name="approvedAmount"
                  type="number"
                  step="0.01"
                  defaultValue={ceiling?.ceiling != null ? Math.round(Math.min(ceiling.ceiling, Number(claim.billedAmount))) : Number(claim.billedAmount)}
                  className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-brand-indigo transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Notes / Reason</label>
              <textarea name="notes" rows={3} className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-brand-indigo transition-colors resize-none" placeholder="Provide a reason for your decision..." />
            </div>

            {/* PR-015: over-cover confirmation for PA-attached claims */}
            {paCoverage && paCoverage.attachedCount > 0 && (
              <div className="rounded-lg border border-[#FFC107]/40 bg-[#FFF8E1] px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-[#856404]">
                  Attached pre-auth cover: {claim.currency} {paCoverage.approvedCover.toLocaleString("en-UG")} · billed {claim.currency} {paCoverage.billedAmount.toLocaleString("en-UG")}.
                  Approving above the cover requires explicit confirmation (recorded in the adjudication log).
                </p>
                <label className="flex items-center gap-2 text-xs font-semibold text-brand-text-heading">
                  <input type="checkbox" name="overCoverConfirmed" className="rounded border-[#EEEEEE]" />
                  Approve above pre-auth cover
                </label>
                <input
                  name="overCoverNote"
                  type="text"
                  placeholder="Confirmation note (why the over-cover approval is justified)"
                  className="w-full border border-[#EEEEEE] rounded-md px-3 py-1.5 text-xs outline-none focus:border-brand-indigo"
                />
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button type="submit" className="bg-brand-indigo hover:bg-brand-secondary text-white px-8 py-3 rounded-full font-semibold transition-colors shadow-sm">
                Submit Decision
              </button>
            </div>
          </form>

          {/* PR-014 D1: override affordance when a ceiling exists */}
          {ceiling?.ceiling != null && !priceOverrideApproved && (
            <details className="mt-4 rounded-lg border border-[#EEEEEE] bg-[#F8F9FA] px-4 py-3">
              <summary className="cursor-pointer text-xs font-bold text-brand-indigo">
                Need to pay above the contract ceiling? Raise a PAY ABOVE CONTRACT RATE override
              </summary>
              {/* CU-OBS-12: with every line unpriced the ceiling is 0 — say plainly
                  what the override does (and what it can't fix) instead of a silent no-op. */}
              {ceiling.hasUnpricedLines && ceiling.ceiling === 0 && (
                <p className="mt-2 text-xs font-semibold text-[#856404]">
                  Every line on this claim is unpriced, so the payable ceiling is 0. An approved override
                  authorizes paying the requested amount above that 0 ceiling — it does not price the lines.
                  The preferred path is to correct the coding so the tariff binds, then adjudicate normally.
                  After a senior approver actions the override on the Overrides console, return here and
                  submit the decision.
                </p>
              )}
              <form action={requestPriceOverrideAction} className="mt-3 space-y-2">
                <input type="hidden" name="claimId" value={claim.id} />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    name="requestedAmount"
                    type="number"
                    step="0.01"
                    required
                    placeholder={`Requested amount (${claim.currency})`}
                    className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo"
                  />
                  <input
                    name="justification"
                    type="text"
                    required
                    minLength={20}
                    placeholder="Justification (min 20 characters)"
                    className="border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo"
                  />
                </div>
                <button type="submit" className="text-xs font-bold text-white bg-[#856404] px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
                  Request Override (senior approval required)
                </button>
              </form>
            </details>
          )}
        </div>
      )}

      {/* ── Process 9: Contracted rate variance ──────────────── */}
      {!claim.isReimbursement && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-text-heading text-sm font-heading flex items-center gap-2">
              <BarChart2 size={15} className="text-brand-indigo" /> Contracted Rate Analysis
            </h2>
            {!p9Claim?.contractedRate && (
              <form action={computeVarianceAction}>
                <input type="hidden" name="claimId" value={id} />
                <button type="submit"
                  className="text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-3 py-1 rounded-full hover:bg-brand-indigo/5 transition-colors">
                  Compute Variance
                </button>
              </form>
            )}
          </div>
          {p9Claim?.contractedRate ? (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-brand-text-muted">Billed amount</p>
                <p className="font-semibold text-brand-text-heading mt-0.5">
                  {claim.currency} {Number(claim.billedAmount).toLocaleString("en-UG")}
                </p>
              </div>
              <div>
                <p className="text-xs text-brand-text-muted">Contracted (tariffed lines)</p>
                <p className="font-semibold text-brand-text-heading mt-0.5">
                  {claim.currency} {Number(p9Claim.contractedRate).toLocaleString("en-UG")}
                </p>
              </div>
              <div>
                <p className="text-xs text-brand-text-muted">Variance</p>
                <p className={`font-bold mt-0.5 ${hasHighVar ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                  {variancePct !== null ? `${(variancePct * 100).toFixed(1)}%` : "—"}
                  {hasHighVar && <span className="text-[10px] ml-1 font-bold">⚠ FRAUD FLAG</span>}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-text-muted">Click &quot;Compute Variance&quot; to look up contracted tariff rates.</p>
          )}
        </div>
      )}

      {/* ── Process 9: Line-item adjudication ────────────────── */}
      {canAdjudicate && claimLines.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
            <h2 className="font-bold text-brand-text-heading text-sm font-heading flex items-center gap-2">
              <Scale size={15} className="text-brand-indigo" /> Line-by-Line Adjudication
            </h2>
            {canComputeOutcome && (
              <form action={computeOutcomeAction}>
                <input type="hidden" name="claimId" value={id} />
                <button type="submit"
                  className="text-xs bg-brand-indigo text-white px-4 py-1.5 rounded-full font-semibold hover:bg-brand-secondary transition-colors">
                  Compute Outcome
                </button>
              </form>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold">
                <th className="px-4 py-2 text-left">Line</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-right">Billed</th>
                <th className="px-4 py-2 text-left">Decision</th>
                <th className="px-4 py-2 text-right">Approved</th>
                <th className="px-4 py-2 text-left w-48">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {claimLines.map((line) => (
                <tr key={line.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2.5 text-brand-text-muted text-xs font-mono">{line.lineNumber}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-brand-text-heading text-xs">{line.description}</p>
                    {line.cptCode && <p className="text-[10px] text-brand-text-muted">{line.cptCode}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {Number(line.billedAmount).toLocaleString("en-UG")}
                  </td>
                  <td className="px-4 py-2.5">
                    {line.adjudicationDecision ? (
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        line.adjudicationDecision === "APPROVED"                 ? "bg-[#28A745]/10 text-[#28A745]" :
                        line.adjudicationDecision === "APPROVED_WITH_ADJUSTMENT" ? "bg-[#17A2B8]/10 text-[#17A2B8]" :
                        "bg-[#DC3545]/10 text-[#DC3545]"
                      }`}>
                        {line.adjudicationDecision.replace(/_/g, " ")}
                      </span>
                    ) : <span className="text-[10px] text-brand-text-muted">Pending</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-[#28A745]">
                    {line.adjudicationDecision
                      ? Number(line.approvedAmount).toLocaleString("en-UG")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={adjudicateLineAction} className="flex gap-1 flex-wrap">
                      <input type="hidden" name="claimId" value={id} />
                      <input type="hidden" name="claimLineId" value={line.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button type="submit"
                        className="text-[10px] font-bold px-2 py-1 rounded border border-[#28A745] text-[#28A745] hover:bg-[#28A745]/10 transition-colors">
                        ✓
                      </button>
                    </form>
                    {line.adjudicationDecision !== "DECLINED" && (
                      <form action={adjudicateLineAction} className="flex gap-1 flex-wrap mt-1">
                        <input type="hidden" name="claimId" value={id} />
                        <input type="hidden" name="claimLineId" value={line.id} />
                        <input type="hidden" name="decision" value="DECLINED" />
                        <button type="submit"
                          className="text-[10px] font-bold px-2 py-1 rounded border border-[#DC3545] text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors">
                          ✕
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Decided-claim workflow: outcome, void, appeal ────── */}
      {(isOutcomeSet || canVoid || canAppeal) && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-brand-text-heading text-sm font-heading border-b border-[#EEEEEE] pb-2">
            Adjudication Workflow
          </h2>

          {isOutcomeSet && (
            <div className="flex items-center gap-3 text-sm">
              <span className={`font-bold text-lg ${claim.status === "APPROVED" ? "text-[#28A745]" : claim.status === "PARTIALLY_APPROVED" ? "text-[#17A2B8]" : "text-[#DC3545]"}`}>
                Outcome: {claim.status.replace(/_/g," ")}
              </span>
              <span className="text-brand-text-muted">
                Net approved: <strong>{claim.currency} {Number(claim.approvedAmount).toLocaleString("en-UG")}</strong>
              </span>
            </div>
          )}

          {/* PR-016 #6 / PR-018 #4: void with compensating usage + GL reversal */}
          {canVoid && (
            <form action={voidClaimAction} className="flex gap-2 items-center">
              <input type="hidden" name="claimId" value={id} />
              <input name="reason" type="text" required minLength={5} placeholder="Void reason (usage and GL will be reversed)"
                className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
              <button type="submit"
                className="border border-[#DC3545] text-[#DC3545] px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#DC3545]/10 transition-colors whitespace-nowrap">
                Void Claim
              </button>
            </form>
          )}

          {canAppeal && (
            <form action={initiateAppealAction} className="flex gap-2 items-center">
              <input type="hidden" name="claimId" value={id} />
              <input name="appealNotes" type="text" required placeholder="Appeal reason"
                className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
              <button type="submit"
                className="border border-brand-indigo text-brand-indigo px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-indigo/5 transition-colors whitespace-nowrap">
                Initiate Appeal
              </button>
            </form>
          )}

          {p9Claim?.settlementBatchId && (
            <p className="text-sm text-[#28A745] font-semibold flex items-center gap-2">
              <CheckCircle2 size={14} /> Queued in settlement batch
              <Link href="/settlement" className="text-brand-indigo hover:underline font-normal text-xs ml-1">
                View →
              </Link>
            </p>
          )}
        </div>
      )}

      {/* ── Process 10: Reimbursement panel ──────────────────── */}
      {claim.isReimbursement && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-brand-indigo" />
            Reimbursement Details
          </h2>

          {/* Payment destination */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-brand-text-muted font-bold uppercase mb-1">Payout destination</p>
              {claim.reimbursementMpesaPhone ? (
                <p className="font-semibold text-brand-text-heading">M-Pesa: {claim.reimbursementMpesaPhone}</p>
              ) : claim.reimbursementBankName ? (
                <p className="font-semibold text-brand-text-heading">
                  {claim.reimbursementBankName} — {claim.reimbursementAccountNo ?? "—"}
                </p>
              ) : (
                <p className="text-brand-text-muted italic">Not specified</p>
              )}
            </div>
            <div>
              <p className="text-xs text-brand-text-muted font-bold uppercase mb-1">Reimbursed at</p>
              <p className="font-semibold text-brand-text-heading">
                {claim.reimbursedAt ? new Date(claim.reimbursedAt).toLocaleDateString("en-UG") : "—"}
              </p>
            </div>
          </div>

          {/* Proof of payment */}
          {reimbRequest && (
            <div className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-[8px] p-4 space-y-3">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Proof of Payment</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-brand-text-muted">Proof type</p>
                  <p className="font-semibold text-brand-text-heading mt-0.5">
                    {reimbRequest.proofType.replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-text-muted">Total paid by member</p>
                  <p className="font-semibold text-brand-text-heading mt-0.5">
                    {claim.currency} {Number(reimbRequest.totalPaidByMember).toLocaleString("en-UG")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-text-muted">Within 90-day window</p>
                  <p className={`font-semibold mt-0.5 ${reimbRequest.submittedWithinWindow ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                    {reimbRequest.submittedWithinWindow ? "Yes" : "No — review required"}
                  </p>
                </div>
              </div>

              {reimbRequest.mpesaConfirmationCode && (
                <div className="flex items-start gap-2.5 bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[6px] p-3">
                  <AlertTriangle size={13} className="text-[#856404] mt-0.5 shrink-0" />
                  <div className="text-xs text-[#856404]">
                    <strong>M-Pesa confirmation code:</strong> {reimbRequest.mpesaConfirmationCode}
                    {reimbRequest.mpesaNote && (
                      <p className="mt-0.5 opacity-80">{reimbRequest.mpesaNote}</p>
                    )}
                  </div>
                </div>
              )}

              {reimbRequest.proofFileUrl && (
                <a href={reimbRequest.proofFileUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-indigo hover:underline">
                  View proof document →
                </a>
              )}
            </div>
          )}

          {/* Disbursement action (Finance only, after approval) */}
          {["APPROVED","PARTIALLY_APPROVED"].includes(claim.status) && !claim.reimbursedAt && (
            <form action={disburseReimbursementAction} className="flex items-center gap-3">
              <input type="hidden" name="claimId" value={id} />
              <input name="disbursementRef" type="text" required placeholder="Disbursement reference (e.g. bank TXN ID or M-Pesa code)"
                className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
              <button type="submit"
                className="bg-[#28A745] hover:bg-[#218838] text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap">
                Disburse to Member
              </button>
            </form>
          )}

          {claim.reimbursedAt && (
            <p className="text-sm text-[#28A745] font-semibold flex items-center gap-2">
              <CheckCircle2 size={14} /> Reimbursed on {new Date(claim.reimbursedAt).toLocaleDateString("en-UG")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
