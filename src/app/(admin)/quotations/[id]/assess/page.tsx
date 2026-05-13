import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, CheckCircle, UserPlus, Send, XCircle, ChevronDown } from "lucide-react";
import Link from "next/link";
import {
  addLifeAction, submitForValidationAction, recordDecisionAction,
  submitForPricingAction, approveSeniorAction, declineAction, returnToSubmitterAction,
} from "./actions";

const DECISION_STYLES: Record<string, string> = {
  STANDARD:       "bg-[#28A745]/10 text-[#28A745]",
  LOADED:         "bg-[#FD7E14]/10 text-[#C4500A]",
  EXCLUSION:      "bg-[#DC3545]/10 text-[#DC3545]",
  WAITING_PERIOD: "bg-[#17A2B8]/10 text-[#17A2B8]",
  DECLINED:       "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function AssessPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const quotation = await prisma.quotation.findUnique({
    where: { id, tenantId },
    include: {
      lives: {
        include: { decision: true },
        orderBy: [{ role: "asc" }, { lastName: "asc" }],
      },
      riskProfile: true,
      workQueueItem: true,
      assessor: { select: { firstName: true, lastName: true } },
      broker: { select: { name: true } },
    },
  });
  if (!quotation) notFound();

  const isInAssessment = ["PENDING_ASSESSMENT", "ASSESSED_PENDING_SENIOR_APPROVAL", "DRAFT", "PENDING_VALIDATION"].includes(quotation.status);
  const isPendingSenior = quotation.status === "ASSESSED_PENDING_SENIOR_APPROVAL";
  const canAddLives = ["DRAFT", "PENDING_VALIDATION"].includes(quotation.status);
  const canRecordDecisions = quotation.status === "PENDING_ASSESSMENT";
  const canSubmitForPricing = quotation.status === "PENDING_ASSESSMENT";

  const slaInfo = quotation.workQueueItem;
  const slaMs = slaInfo ? new Date(slaInfo.slaDeadlineAt).getTime() - Date.now() : null;
  const slaHours = slaMs ? Math.max(0, Math.floor(slaMs / (1000 * 60 * 60))) : null;
  const slaBreached = slaInfo?.slaBreached ?? false;

  // ICD-10 chapter summary from risk profile
  const icd10Summary = (quotation.riskProfile?.icd10ChapterSummary as Record<string, number> | null) ?? {};
  const ageDistribution = (quotation.riskProfile?.ageDistribution as Record<string, number> | null) ?? {};

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/quotations" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-avenue-text-heading font-heading">
              Assessment — {quotation.quoteNumber}
            </h1>
            <p className="text-sm text-avenue-text-muted mt-0.5">
              {quotation.legalName ?? quotation.prospectName ?? "—"} ·{" "}
              {quotation.clientType} ·{" "}
              {quotation.headcount ? `${quotation.headcount} declared lives` : `${quotation.memberCount + quotation.dependentCount} added`}
            </p>
          </div>
        </div>

        {/* SLA timer */}
        {slaInfo && (
          <div className={`text-sm font-semibold px-4 py-2 rounded-full ${slaBreached ? "bg-[#DC3545]/10 text-[#DC3545]" : slaHours !== null && slaHours < 4 ? "bg-[#FFC107]/10 text-[#856404]" : "bg-[#28A745]/10 text-[#28A745]"}`}>
            {slaBreached ? "⚠ SLA breached" : slaHours !== null ? `${slaHours}h remaining` : "SLA active"}
          </div>
        )}
      </div>

      {/* Senior approval banner */}
      {isPendingSenior && (
        <div className="bg-[#FD7E14]/10 border border-[#FD7E14]/30 rounded-[8px] p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#C4500A] mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-[#C4500A] text-sm">Awaiting senior assessment approval</p>
            <p className="text-xs text-avenue-text-muted mt-1">This submission triggered an escalation threshold. A Senior Underwriter must approve before it can proceed to pricing.</p>
          </div>
          <form action={approveSeniorAction}>
            <input type="hidden" name="quotationId" value={id} />
            <input type="hidden" name="note" value="Approved via assessment page" />
            <button type="submit" className="text-xs font-semibold bg-[#C4500A] text-white px-4 py-1.5 rounded-full hover:bg-[#FD7E14] transition-colors">
              Approve
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left column: Lives + decisions */}
        <div className="col-span-2 space-y-4">

          {/* Add life form (only when in editable stages) */}
          {canAddLives && (
            <details className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm">
              <summary className="px-6 py-4 cursor-pointer font-semibold text-avenue-text-heading text-sm flex items-center gap-2 list-none">
                <UserPlus size={16} className="text-avenue-indigo" />
                Add Life
                <ChevronDown size={14} className="ml-auto text-avenue-text-muted" />
              </summary>
              <div className="px-6 pb-5 border-t border-[#EEEEEE]">
                <form action={addLifeAction} className="grid grid-cols-3 gap-3 mt-4">
                  <input type="hidden" name="quotationId" value={id} />
                  <div>
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Role</label>
                    <select name="role" className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm">
                      <option value="PRINCIPAL">Principal</option>
                      <option value="DEPENDANT">Dependant</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">First Name</label>
                    <input name="firstName" required type="text" className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Last Name</label>
                    <input name="lastName" required type="text" className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">National ID</label>
                    <input name="nationalId" type="text" className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Date of Birth</label>
                    <input name="dateOfBirth" required type="date" className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Gender</label>
                    <select name="gender" className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm">
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-avenue-text-muted mb-1">ICD-10 Codes (comma-separated)</label>
                    <input name="icd10Codes" type="text" placeholder="E11.9, I10, ..." className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
                      Add Life
                    </button>
                  </div>
                </form>
              </div>
            </details>
          )}

          {/* Submit for validation */}
          {canAddLives && quotation.lives.length > 0 && (
            <form action={submitForValidationAction}>
              <input type="hidden" name="quotationId" value={id} />
              <button type="submit"
                className="w-full py-3 bg-[#17A2B8] hover:bg-[#138496] text-white rounded-[8px] font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <Send size={16} />
                Submit {quotation.lives.length} lives for validation
              </button>
            </form>
          )}

          {/* Lives table with per-life decision forms */}
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <h2 className="font-semibold text-avenue-text-heading text-sm">Lives on Submission</h2>
              <span className="text-xs text-avenue-text-muted">{quotation.lives.length} life{quotation.lives.length !== 1 ? "s" : ""}</span>
            </div>

            {quotation.lives.length === 0 ? (
              <p className="px-6 py-10 text-center text-avenue-text-muted text-sm">No lives added yet. Use the form above.</p>
            ) : (
              <div className="divide-y divide-[#EEEEEE]">
                {quotation.lives.map((life) => {
                  const age = Math.floor((Date.now() - new Date(life.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                  const decision = life.decision;
                  const history = (life.medicalHistory as Array<{ icd10Code: string }> | null) ?? [];

                  return (
                    <div key={life.id} className="px-6 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${life.role === "PRINCIPAL" ? "bg-avenue-indigo/10 text-avenue-indigo" : "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                            {life.role === "PRINCIPAL" ? "Principal" : "Dependant"}
                          </span>
                          <span className="font-semibold text-avenue-text-heading text-sm">
                            {life.firstName} {life.lastName}
                          </span>
                          <span className="text-xs text-avenue-text-muted">
                            {life.gender} · {age}y · {life.nationalId ?? "No ID"}
                          </span>
                        </div>
                        {decision && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${DECISION_STYLES[decision.decision] ?? ""}`}>
                            {decision.decision}{decision.loadingMultiplier ? ` ×${Number(decision.loadingMultiplier).toFixed(2)}` : ""}
                          </span>
                        )}
                      </div>

                      {history.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {history.map((h) => (
                            <span key={h.icd10Code} className="text-[10px] bg-[#DC3545]/10 text-[#DC3545] px-2 py-0.5 rounded font-mono">
                              {h.icd10Code}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Decision form (visible only in PENDING_ASSESSMENT) */}
                      {canRecordDecisions && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-avenue-indigo font-semibold list-none hover:underline">
                            {decision ? "Edit decision" : "Record decision"}
                          </summary>
                          <form action={recordDecisionAction} className="mt-3 grid grid-cols-3 gap-2">
                            <input type="hidden" name="quotationId" value={id} />
                            <input type="hidden" name="quotationLifeId" value={life.id} />
                            <div>
                              <label className="block font-semibold text-avenue-text-muted mb-1">Decision</label>
                              <select name="decision" defaultValue={decision?.decision ?? "STANDARD"}
                                className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs">
                                {["STANDARD","LOADED","EXCLUSION","WAITING_PERIOD","DECLINED"].map(d => (
                                  <option key={d} value={d}>{d.replace("_", " ")}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block font-semibold text-avenue-text-muted mb-1">Loading ×</label>
                              <input name="loadingMultiplier" type="number" step="0.01" min="1.01" max="5.0"
                                defaultValue={decision?.loadingMultiplier ? Number(decision.loadingMultiplier) : undefined}
                                placeholder="e.g. 1.25"
                                className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs" />
                            </div>
                            <div>
                              <label className="block font-semibold text-avenue-text-muted mb-1">Waiting period (days)</label>
                              <input name="waitingPeriodDays" type="number" min="1"
                                defaultValue={decision?.waitingPeriodDays ?? undefined}
                                placeholder="e.g. 365"
                                className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs" />
                            </div>
                            <div className="col-span-2">
                              <label className="block font-semibold text-avenue-text-muted mb-1">Excluded ICD-10 codes (comma-separated)</label>
                              <input name="excludedIcd10Codes" type="text"
                                defaultValue={decision?.excludedIcd10Codes.join(", ") ?? ""}
                                placeholder="E11.9, I10, ..."
                                className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs" />
                            </div>
                            <div>
                              <label className="block font-semibold text-avenue-text-muted mb-1">Reason code</label>
                              <input name="reasonCode" type="text" required
                                defaultValue={decision?.reasonCode ?? ""}
                                placeholder="e.g. PRE_EXISTING"
                                className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs" />
                            </div>
                            <div className="col-span-3 flex justify-end">
                              <button type="submit" className="bg-avenue-indigo text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-avenue-secondary transition-colors">
                                Save decision
                              </button>
                            </div>
                          </form>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit for pricing */}
          {canSubmitForPricing && (
            <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-avenue-text-heading text-sm">Submit for Pricing</h2>
              <form action={submitForPricingAction} className="grid grid-cols-2 gap-4">
                <input type="hidden" name="quotationId" value={id} />
                <div>
                  <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Projected gross contribution (KES)</label>
                  <input name="projectedGrossKes" type="number" min={0} placeholder="e.g. 1200000"
                    className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Scheme discount (%)</label>
                  <input name="schemeDiscountPct" type="number" min={0} max={100} step={0.5} placeholder="e.g. 5"
                    className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <div className="flex gap-2">
                    <form action={declineAction}>
                      <input type="hidden" name="quotationId" value={id} />
                      <input type="hidden" name="reason" value="Declined at assessment stage" />
                      <button type="submit" className="text-[#DC3545] border border-[#DC3545]/30 hover:bg-[#DC3545]/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1.5">
                        <XCircle size={14} /> Decline
                      </button>
                    </form>
                    <form action={returnToSubmitterAction}>
                      <input type="hidden" name="quotationId" value={id} />
                      <input type="hidden" name="reason" value="Returned for additional information" />
                      <button type="submit" className="text-avenue-text-muted border border-[#EEEEEE] hover:border-avenue-indigo px-4 py-2 rounded-full text-sm font-semibold transition-colors">
                        Return to submitter
                      </button>
                    </form>
                  </div>
                  <button type="submit"
                    className="bg-[#28A745] hover:bg-[#218838] text-white px-6 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2">
                    <CheckCircle size={16} />
                    Submit for Pricing
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right column: Risk profile + summary */}
        <div className="space-y-4">
          {/* Quotation meta */}
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3 text-sm">
            <h2 className="font-semibold text-avenue-text-heading text-xs uppercase tracking-wide">Submission Details</h2>
            {[
              { label: "Status",       value: quotation.status.replace(/_/g, " ") },
              { label: "Cover start",  value: quotation.requestedCoverStart ? new Date(quotation.requestedCoverStart).toLocaleDateString("en-KE") : "—" },
              { label: "Cover mode",   value: quotation.fundingMode === "SELF_FUNDED" ? "Fund Managed" : "Contribution Bearing" },
              { label: "Broker",       value: quotation.broker?.name ?? "Direct" },
              { label: "Assessor",     value: quotation.assessor ? `${quotation.assessor.firstName} ${quotation.assessor.lastName}` : "Unassigned" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-avenue-text-muted">{label}</span>
                <span className="font-semibold text-avenue-text-heading text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Risk profile */}
          {quotation.riskProfile && (
            <>
              <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-avenue-text-heading text-xs uppercase tracking-wide">Age Distribution</h2>
                {Object.entries(ageDistribution).map(([band, count]) => (
                  <div key={band} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-avenue-text-muted">{band}</span>
                    <div className="flex-1 bg-[#EEEEEE] rounded-full h-1.5">
                      <div
                        className="bg-avenue-indigo h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (count / quotation.lives.length) * 100)}%` }}
                      />
                    </div>
                    <span className="w-4 text-right text-avenue-text-muted">{count}</span>
                  </div>
                ))}
              </div>

              {Object.keys(icd10Summary).length > 0 && (
                <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-2">
                  <h2 className="font-semibold text-avenue-text-heading text-xs uppercase tracking-wide">ICD-10 Chapters</h2>
                  {Object.entries(icd10Summary)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([chapter, count]) => (
                    <div key={chapter} className="flex justify-between text-xs">
                      <span className="text-avenue-text-muted font-mono">{chapter}</span>
                      <span className="font-semibold text-avenue-text-heading">{count} live{count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              )}

              {quotation.riskProfile.blacklistMatches > 0 && (
                <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-[8px] p-4">
                  <p className="text-sm font-semibold text-[#DC3545]">
                    ⚠ {quotation.riskProfile.blacklistMatches} blacklist match{quotation.riskProfile.blacklistMatches !== 1 ? "es" : ""}
                  </p>
                  <p className="text-xs text-avenue-text-muted mt-1">Review affected lives before proceeding.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
