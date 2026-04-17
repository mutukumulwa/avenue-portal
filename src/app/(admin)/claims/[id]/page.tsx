import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { adjudicateClaimAction, resolveExceptionAction } from "./actions";
import { ExceptionModal } from "./ExceptionModal";
import { ArrowLeft, Clock, CheckCircle2, XCircle, AlertTriangle, Info, FlaskConical, Pill, ScanLine, Stethoscope, Scissors, HelpCircle, ShieldAlert, ShieldCheck, ShieldX, Percent } from "lucide-react";
import Link from "next/link";
import { ClaimDocuments } from "./ClaimDocuments";
import { prisma } from "@/lib/prisma";
import { CoContributionCollectionForm } from "./CoContributionCollectionForm";

const LINE_CAT_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  CONSULTATION: { label: "Consultation", color: "bg-avenue-indigo/10 text-avenue-indigo",  Icon: Stethoscope },
  LABORATORY:   { label: "Laboratory",   color: "bg-[#17A2B8]/10 text-[#17A2B8]",          Icon: FlaskConical },
  PHARMACY:     { label: "Pharmacy",     color: "bg-[#28A745]/10 text-[#28A745]",          Icon: Pill         },
  IMAGING:      { label: "Imaging",      color: "bg-[#FFC107]/10 text-[#856404]",          Icon: ScanLine     },
  PROCEDURE:    { label: "Procedure",    color: "bg-[#DC3545]/10 text-[#DC3545]",          Icon: Scissors     },
  OTHER:        { label: "Other",        color: "bg-[#6C757D]/10 text-[#6C757D]",          Icon: HelpCircle   },
};

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;
  const tenantId = session.user.tenantId;
  const [claim, tariffVariances, coContribTx] = await Promise.all([
    ClaimsService.getClaimById(tenantId, id),
    ClaimsService.getClaimTariffVariances(tenantId, id),
    prisma.coContributionTransaction.findUnique({ where: { claimId: id } }),
  ]);

  if (!claim) notFound();

  // Build a lookup map: lineId → variance data
  const tariffMap = new Map(tariffVariances.map(v => [v.lineId, v]));
  const overbilledLines = tariffVariances.filter(v => v.variance !== null && v.variance > 0);
  const contractedTotal = tariffVariances.reduce((sum, v) => {
    const l = claim.claimLines.find(l => l.id === v.lineId);
    if (!l) return sum;
    const contracted = v.agreedRate !== null ? v.agreedRate * l.quantity : Number(l.unitCost) * l.quantity;
    return sum + contracted;
  }, 0);

  const canAdjudicate = ["RECEIVED", "UNDER_REVIEW"].includes(claim.status);
  const diagnoses = claim.diagnoses as { code?: string; icdCode?: string; description: string; isPrimary?: boolean }[];

  // Group structured claim lines by service category
  const linesByCategory = (claim.claimLines ?? []).reduce<Record<string, typeof claim.claimLines>>((acc, line) => {
    const cat = (line as { serviceCategory?: string }).serviceCategory ?? "OTHER";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(line);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
        <Link href="/claims" className="text-avenue-text-body hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">
            Claim {claim.claimNumber}
          </h1>
          <p className="text-avenue-text-body font-body mt-1">Review details and adjudicate.</p>
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
          <p className="text-xs text-avenue-text-muted font-bold uppercase tracking-wide">Member</p>
          <p className="text-lg font-bold text-avenue-text-heading mt-1">{claim.member.firstName} {claim.member.lastName}</p>
          <p className="text-sm text-avenue-text-body">{claim.member.memberNumber}</p>
          <p className="text-xs text-avenue-text-muted mt-2">Group: {claim.member.group.name}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-avenue-text-muted font-bold uppercase tracking-wide">Provider</p>
          <p className="text-lg font-bold text-avenue-text-heading mt-1">{claim.provider.name}</p>
          <p className="text-sm text-avenue-text-body capitalize">{claim.provider.type.toLowerCase()} · {claim.provider.tier}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-avenue-text-muted font-bold uppercase tracking-wide">Financial Summary</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-avenue-text-body">Billed</span><span className="font-bold text-avenue-text-heading">KES {Number(claim.billedAmount).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-avenue-text-body">Approved</span><span className="font-bold text-[#28A745]">KES {Number(claim.approvedAmount).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-avenue-text-body">Copay</span><span className="font-semibold text-avenue-text-heading">KES {Number(claim.copayAmount).toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      {/* Diagnoses */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
        <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-3 flex items-center gap-2">
          <Info size={16} className="text-avenue-indigo" /> Diagnoses
        </h3>
        <div className="space-y-2">
          {diagnoses.map((d, i) => (
            <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${d.isPrimary ? "bg-avenue-indigo/5 border border-avenue-indigo/20" : "bg-[#F8F9FA]"}`}>
              <div className="flex items-center gap-2">
                {d.isPrimary && <span className="text-[10px] font-bold uppercase bg-avenue-indigo text-white px-1.5 py-0.5 rounded-full">Primary</span>}
                <span className="text-avenue-text-heading">{d.description}</span>
              </div>
              {(d.code ?? d.icdCode) && (
                <span className="text-xs font-mono font-bold text-avenue-indigo bg-avenue-indigo/10 px-2 py-0.5 rounded">
                  {d.code ?? d.icdCode}
                </span>
              )}
            </div>
          ))}
          {diagnoses.length === 0 && <p className="text-sm text-avenue-text-muted">No diagnoses recorded.</p>}
        </div>
      </div>

      {/* Tariff variance banner */}
      {overbilledLines.length > 0 && (
        <div className="flex items-start gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-[#856404] shrink-0 mt-0.5" />
          <div className="text-sm text-[#856404]">
            <p className="font-bold">
              {overbilledLines.length} line{overbilledLines.length > 1 ? "s" : ""} billed above contracted rate.
              {" "}Contracted total: <span className="font-mono">KES {Math.round(contractedTotal).toLocaleString("en-KE")}</span>
              {" "}vs billed: <span className="font-mono">KES {Number(claim.billedAmount).toLocaleString("en-KE")}</span>.
            </p>
            <p className="mt-0.5 text-xs">Consider approving the contracted total or raising an exception for overages.</p>
          </div>
        </div>
      )}

      {/* Service line items grouped by category */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <h3 className="font-bold text-avenue-text-heading font-heading">Service Line Items</h3>
          <div className="flex items-center gap-4 text-sm font-bold">
            {overbilledLines.length > 0 && (
              <span className="text-[#856404]">Contracted: KES {Math.round(contractedTotal).toLocaleString("en-KE")}</span>
            )}
            <span className="text-avenue-indigo">Billed: KES {Number(claim.billedAmount).toLocaleString("en-KE")}</span>
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
                    <span className="text-xs font-semibold text-avenue-text-muted">
                      KES {catTotal.toLocaleString("en-KE")}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
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
                            <td className="px-5 py-2.5 text-avenue-text-heading">{l.description}</td>
                            <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted">{(l as { cptCode?: string }).cptCode ?? "—"}</td>
                            <td className="px-5 py-2.5 text-right">{l.quantity}</td>
                            <td className={`px-5 py-2.5 text-right ${isOver ? "text-[#856404] font-semibold" : ""}`}>
                              {Number(l.unitCost).toLocaleString("en-KE")}
                            </td>
                            <td className="px-5 py-2.5 text-right text-avenue-text-muted">
                              {tv?.agreedRate !== null && tv?.agreedRate !== undefined
                                ? <span className="flex items-center justify-end gap-1">
                                    {tv.agreedRate.toLocaleString("en-KE")}
                                    {isOver && tv.variancePct !== null && (
                                      <span className="text-[10px] font-bold text-[#856404] bg-[#FFC107]/20 px-1 rounded">
                                        +{tv.variancePct}%
                                      </span>
                                    )}
                                  </span>
                                : <span className="text-avenue-text-muted/40">—</span>
                              }
                            </td>
                            <td className={`px-5 py-2.5 text-right font-semibold ${isOver ? "text-[#DC3545]" : "text-avenue-text-heading"}`}>
                              {Number(l.billedAmount).toLocaleString("en-KE")}
                            </td>
                            <td className="px-5 py-2.5 text-right font-semibold text-[#28A745]">
                              {Number(l.approvedAmount) > 0 ? Number(l.approvedAmount).toLocaleString("en-KE") : "—"}
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
          <p className="px-5 py-8 text-sm text-avenue-text-muted text-center">No structured line items — legacy claim entry.</p>
        )}
      </div>

      {/* Adjudication timeline */}
      {claim.adjudicationLogs.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-4">Adjudication Timeline</h3>
          <div className="space-y-3">
            {claim.adjudicationLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <div className="pt-0.5">
                  {["APPROVED", "APPEAL_APPROVED"].includes(log.action) ? <CheckCircle2 size={16} className="text-[#28A745]" /> :
                   ["DECLINED", "APPEAL_DECLINED"].includes(log.action) ? <XCircle size={16} className="text-[#DC3545]" /> :
                   <Clock size={16} className="text-[#17A2B8]" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-avenue-text-heading">{log.action.replace(/_/g, " ")}</p>
                  {log.notes && <p className="text-avenue-text-body mt-0.5">{log.notes}</p>}
                  <p className="text-xs text-avenue-text-muted mt-1">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exception log */}
      {claim.exceptionLogs.length > 0 && (
        <div id="exceptions" className="bg-white border border-[#FFC107]/40 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-4 flex items-center gap-2">
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
                      <p className="text-sm font-bold text-avenue-text-heading">
                        {log.exceptionCode.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm text-avenue-text-body mt-0.5">{log.reason}</p>
                      {log.notes && <p className="text-xs text-avenue-text-muted mt-1">{log.notes}</p>}
                      <p className="text-xs text-avenue-text-muted mt-1">
                        Raised by {log.raisedBy.firstName} {log.raisedBy.lastName} · {new Date(log.createdAt).toLocaleString()}
                      </p>
                      {log.resolutionNote && (
                        <p className="text-xs text-avenue-text-muted mt-1">
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
      {coContribTx && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-1 flex items-center gap-2">
            <Percent size={15} className="text-avenue-indigo" /> Member Co-Contribution
          </h3>
          <CoContributionCollectionForm transaction={coContribTx} />
        </div>
      )}

      {/* Adjudication form */}
      {canAdjudicate && (
        <div className="bg-white border-2 border-avenue-indigo/20 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-bold text-avenue-text-heading font-heading flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-avenue-indigo" />
            Adjudicate Claim
          </h3>
          <form action={adjudicateClaimAction} className="space-y-4">
            <input type="hidden" name="claimId" value={claim.id} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-avenue-text-heading">Decision</label>
                <select required name="action" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-avenue-indigo transition-colors">
                  <option value="APPROVED">Approve (Full)</option>
                  <option value="PARTIALLY_APPROVED">Partially Approve</option>
                  <option value="DECLINED">Decline</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-avenue-text-heading">
                  Approved Amount (KES)
                  {overbilledLines.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-[#856404]">
                      — contracted: {Math.round(contractedTotal).toLocaleString("en-KE")}
                    </span>
                  )}
                </label>
                <input
                  name="approvedAmount"
                  type="number"
                  step="0.01"
                  defaultValue={overbilledLines.length > 0 ? Math.round(contractedTotal) : Number(claim.billedAmount)}
                  className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-avenue-indigo transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Notes / Reason</label>
              <textarea name="notes" rows={3} className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-avenue-indigo transition-colors resize-none" placeholder="Provide a reason for your decision..." />
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-3 rounded-full font-semibold transition-colors shadow-sm">
                Submit Decision
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
