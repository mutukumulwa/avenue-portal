import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CaseService } from "@/server/services/case.service";
import {
  addServiceEntryAction, voidServiceEntryAction, attachCasePreauthAction,
  issueCaseLouAction, closeAndFileAction, cancelCaseAction, cutInterimSliceAction,
} from "./actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BriefcaseMedical, Clock, FileCheck2, Ban, Stethoscope, FileSignature, AlertTriangle, Scissors, Layers, CheckCircle2 } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-[#17A2B8]/10 text-[#17A2B8]",
  PENDING_CLOSURE: "bg-[#FFC107]/10 text-[#856404]",
  CLOSED_FILED: "bg-[#28A745]/10 text-[#28A745]",
  CANCELLED: "bg-[#6C757D]/10 text-[#6C757D]",
};

const CATEGORIES = ["CONSULTATION", "LABORATORY", "PHARMACY", "IMAGING", "PROCEDURE", "OTHER"];

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; closed?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const { error, closed } = await searchParams;
  const tenantId = session.user.tenantId;

  const c = await CaseService.getCaseDetail(tenantId, id);
  if (!c) notFound();

  // IPL-001 per-case seven-ledger reconciliation (interim slices + final).
  const recon = await CaseService.getCaseReconciliation(tenantId, id);

  const editable = c.status === "OPEN" || c.status === "PENDING_CLOSURE";
  const los = c.admissionDate
    ? Math.max(0, Math.floor((Date.now() - c.admissionDate.getTime()) / 86_400_000))
    : null;

  // Attachable PAs: member's approved, unattached, same facility.
  const candidatePAs = editable
    ? await prisma.preAuthorization.findMany({
        where: {
          tenantId, memberId: c.member.id, providerId: c.provider.id,
          status: "APPROVED", claimId: null, caseId: null,
        },
        select: { id: true, preauthNumber: true, approvedAmount: true },
        take: 20,
      })
    : [];

  const input = "rounded-md border border-[#D6DCE5] px-2 py-1.5 text-sm text-brand-text-body outline-none focus:border-brand-teal";
  const label = "flex flex-col gap-1 text-xs font-semibold text-brand-text-muted";

  return (
    <div className="space-y-6">
      <Link href="/cases" className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-secondary">
        <ArrowLeft className="h-4 w-4" /> Back to open cases
      </Link>

      {/* PR-032: guard violations render as a banner, never a crash overlay */}
      {error && (
        <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={15} className="text-[#DC3545] mt-0.5 shrink-0" />
          <p className="text-sm text-[#842029]">{error}</p>
        </div>
      )}
      {closed && (
        <div className="bg-[#28A745]/10 border border-[#28A745]/30 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle2 size={15} className="text-[#28A745] mt-0.5 shrink-0" />
          <p className="text-sm text-[#155724]">
            Case closed. All services were already billed on interim slices — no final claim was needed.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BriefcaseMedical className="h-6 w-6 text-brand-secondary" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-brand-text-heading">{c.caseNumber}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${STATUS_BADGE[c.status]}`}>
                {c.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-sm text-brand-text-body">
              {c.member.firstName} {c.member.lastName} ({c.member.memberNumber}) · {c.provider.name}
            </p>
            <p className="text-xs text-brand-text-muted">
              {c.caseType.replace(/_/g, " ")} · {c.benefitCategory.replace(/_/g, " ")}
              {c.attendingDoctor ? ` · ${c.attendingDoctor}` : ""}
              {los !== null && <span className="ml-2 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> LOS {los}d</span>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase text-brand-text-muted">Accrued</p>
          <p className="text-2xl font-bold text-brand-text-heading">
            {c.currency} {Number(c.accruedAmount).toLocaleString()}
          </p>
          {c.estimatedCost && (
            <p className="text-xs text-brand-text-muted">est. {Number(c.estimatedCost).toLocaleString()}</p>
          )}
        </div>
      </div>

      {/* IPL-001 — Interim settlement & seven-ledger reconciliation */}
      <section className="rounded-lg border border-brand-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-text-muted">
          <Layers size={14} /> Interim settlement &amp; reconciliation
        </h2>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {([
            ["Billed to date", recon.billedToDate],
            ["Billed on slices", recon.billedOnSlices],
            ["Unbilled residual", recon.unbilledResidual],
            ["Approved to date", recon.approvedToDate],
            ["Paid to date", recon.paidToDate],
            ["Outstanding", recon.outstanding],
          ] as const).map(([lbl, val]) => (
            <div key={lbl} className="rounded-lg border border-[#EEEEEE] bg-[#F8F9FA] p-3">
              <p className="text-[10px] font-bold uppercase text-brand-text-muted">{lbl}</p>
              <p className="mt-0.5 text-sm font-bold text-brand-text-heading">
                {recon.currency} {val.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-brand-text-muted">
          <span>Remaining guarantee (PA/GOP): <b className="text-brand-text-heading">{recon.currency} {recon.remainingGuarantee.toLocaleString()}</b></span>
          <span>Member share: <b className="text-brand-text-heading">{recon.currency} {recon.memberShare.toLocaleString()}</b></span>
        </div>

        {recon.slices.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#EEEEEE]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#E6E7E8] text-xs font-semibold uppercase text-[#6C757D]">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Claim</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Service dates</th>
                  <th className="px-3 py-2 text-right">Billed</th>
                  <th className="px-3 py-2 text-right">Approved</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {recon.slices.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F8F9FA]">
                    <td className="px-3 py-2">{s.seq ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Link href={`/claims/${s.id}`} className="font-mono font-semibold text-brand-indigo hover:underline">{s.claimNumber}</Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{s.invoiceNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.isInterimBill ? "bg-[#6F42C1]/10 text-[#6F42C1]" : "bg-[#28A745]/10 text-[#28A745]"}`}>
                        {s.isInterimBill ? "Interim" : "Final"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.serviceFrom ? s.serviceFrom.toISOString().slice(0, 10) : "—"}
                      {s.serviceTo && s.serviceTo.getTime() !== s.serviceFrom?.getTime() ? ` → ${s.serviceTo.toISOString().slice(0, 10)}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right">{s.billed.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold">{s.approved.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">{s.status.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-xs">{s.settlementStatus ? s.settlementStatus.replace(/_/g, " ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-brand-text-muted">No bill slices cut yet — the whole episode will file as one claim at closure.</p>
        )}

        {editable && (
          <form action={cutInterimSliceAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#EEEEEE] pt-4">
            <input type="hidden" name="caseId" value={c.id} />
            <label className={label}>Friday cut-off date
              <input name="cutoffDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
            </label>
            <label className={`${label} grow`}>Provider invoice ref (optional)
              <input name="invoiceNumber" placeholder={`${c.caseNumber}-S${recon.sliceCount + 1}`} className={input} />
            </label>
            <button
              type="submit"
              disabled={recon.unbilledResidual <= 0}
              title={recon.unbilledResidual <= 0 ? "Nothing new to bill since the last slice" : undefined}
              className="inline-flex items-center gap-2 rounded-full bg-[#6F42C1] px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
              <Scissors size={14} /> Cut interim bill slice
            </button>
            <p className="w-full text-xs text-brand-text-muted">
              Freezes {recon.currency} {recon.unbilledResidual.toLocaleString()} of unbilled services dated on/before the cut-off into an immutable, adjudicable slice. The case stays open and keeps accruing.
            </p>
          </form>
        )}
      </section>

      {/* Service entries */}
      <section className="rounded-lg border border-brand-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-text-muted">
          Service entries ({c.serviceEntries.filter((e) => !e.voided).length})
        </h2>
        <div className="max-h-[45vh] overflow-y-auto overscroll-contain rounded-lg border border-[#EEEEEE]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#E6E7E8] text-xs font-semibold uppercase text-[#6C757D]">
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Service</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Unit</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {c.serviceEntries.map((e) => (
                <tr key={e.id} className={e.voided ? "text-brand-text-muted line-through opacity-60" : "hover:bg-[#F8F9FA]"}>
                  <td className="px-3 py-2 text-xs">{e.entryDate.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs">{e.category}</td>
                  <td className="px-3 py-2">{e.description}{e.serviceCode ? <span className="ml-1 font-mono text-xs text-brand-text-muted">({e.serviceCode})</span> : null}</td>
                  <td className="px-3 py-2 text-right">{e.quantity}</td>
                  <td className="px-3 py-2 text-right">{Number(e.unitAmount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold">{Number(e.totalAmount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">{e.source}</td>
                  <td className="px-3 py-2">
                    {e.billedInClaimId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#6F42C1]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#6F42C1]" title="Frozen onto a bill slice — immutable, cannot be voided">
                        <Layers size={10} /> Billed
                      </span>
                    ) : editable && !e.voided ? (
                      <form action={voidServiceEntryAction}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <input type="hidden" name="entryId" value={e.id} />
                        <button type="submit" className="text-xs font-semibold text-[#DC3545] hover:underline">Void</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
              {c.serviceEntries.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-brand-text-muted">No services logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {editable && (
          <form action={addServiceEntryAction} className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EEEEEE] pt-4 md:grid-cols-7">
            <input type="hidden" name="caseId" value={c.id} />
            <label className={label}>Date<input name="entryDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} /></label>
            <label className={label}>Category
              <select name="category" className={input}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className={`${label} col-span-2`}>Description *<input name="description" required placeholder="Ward fees — day 3" className={input} /></label>
            <label className={label}>Code<input name="serviceCode" placeholder="SER001" className={input} /></label>
            <label className={label}>Qty<input name="quantity" type="number" min="1" defaultValue={1} className={input} /></label>
            <div className="flex items-end gap-2">
              <label className={`${label} grow`}>Unit amount *<input name="unitAmount" type="number" min="0" required className={input} /></label>
              <button type="submit" className="rounded-full bg-brand-indigo px-4 py-2 text-xs font-semibold text-white hover:bg-brand-secondary">Add</button>
            </div>
          </form>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pre-auths */}
        <section className="rounded-lg border border-brand-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-text-muted">
            <Stethoscope size={14} /> Pre-authorizations ({c.preauths.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {c.preauths.map((pa) => (
              <li key={pa.id} className="flex items-center justify-between">
                <Link href={`/preauth/${pa.id}`} className="font-mono font-semibold text-brand-indigo hover:underline">{pa.preauthNumber}</Link>
                <span className="text-brand-text-body">{Number(pa.approvedAmount ?? 0).toLocaleString()} · {pa.status}</span>
              </li>
            ))}
            {c.preauths.length === 0 && <li className="text-brand-text-muted">None attached.</li>}
          </ul>
          {editable && candidatePAs.length > 0 && (
            <form action={attachCasePreauthAction} className="mt-3 flex items-end gap-2 border-t border-[#EEEEEE] pt-3">
              <input type="hidden" name="caseId" value={c.id} />
              <label className={`${label} grow`}>Attach approved PA
                <select name="preauthId" required className={input}>
                  <option value="">Select…</option>
                  {candidatePAs.map((pa) => (
                    <option key={pa.id} value={pa.id}>{pa.preauthNumber} · {Number(pa.approvedAmount ?? 0).toLocaleString()}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-full bg-brand-indigo px-4 py-2 text-xs font-semibold text-white hover:bg-brand-secondary">Attach</button>
            </form>
          )}
        </section>

        {/* LOUs */}
        <section className="rounded-lg border border-brand-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-text-muted">
            <FileSignature size={14} /> Letters of undertaking ({c.lous.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {c.lous.map((lou) => (
              <li key={lou.id} className="flex items-center justify-between">
                <span className="font-mono font-semibold text-brand-text-heading">{lou.louNumber}</span>
                <span className="text-brand-text-body">ceiling {Number(lou.amountCeiling).toLocaleString()} · {lou.status}</span>
              </li>
            ))}
            {c.lous.length === 0 && <li className="text-brand-text-muted">None issued.</li>}
          </ul>
          {editable && (
            <form action={issueCaseLouAction} className="mt-3 flex items-end gap-2 border-t border-[#EEEEEE] pt-3">
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="memberId" value={c.member.id} />
              <input type="hidden" name="providerId" value={c.provider.id} />
              <label className={`${label} grow`}>Issue LOU — amount ceiling
                <input name="amountCeiling" type="number" min="1" required className={input} />
              </label>
              <label className={label}>Valid (days)
                <input name="validityDays" type="number" min="1" defaultValue={30} className={`${input} w-20`} />
              </label>
              <button type="submit" className="rounded-full bg-brand-indigo px-4 py-2 text-xs font-semibold text-white hover:bg-brand-secondary">Issue</button>
            </form>
          )}
        </section>
      </div>

      {/* Close & file / cancel */}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border-2 border-brand-indigo/20 bg-brand-indigo/5 p-5">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-brand-text-heading">
              <FileCheck2 size={18} className="text-brand-indigo" /> {recon.unbilledResidual > 0 ? "Close & file final claim" : "Close case"}
            </h3>
            <p className="mt-1 text-sm text-brand-text-body">
              {recon.unbilledResidual > 0 ? (
                <>
                  Files the FINAL claim for the residual: {c.serviceEntries.filter((e) => !e.voided && !e.billedInClaimId).length} unbilled
                  service line(s), billed {recon.currency} {recon.unbilledResidual.toLocaleString()}
                  {recon.sliceCount > 0 ? ` (${recon.sliceCount} interim slice(s) already cut are not re-billed)` : ""}. The case becomes read-only.
                </>
              ) : (
                <>All {recon.sliceCount} interim slice(s) already cover every service — closing files no new claim and makes the case read-only.</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <form action={cancelCaseAction}>
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="reason" value="Cancelled from case screen" />
              <button type="submit" className="inline-flex items-center gap-1 rounded-full border border-[#DC3545]/40 px-5 py-2 text-sm font-semibold text-[#DC3545] hover:bg-[#DC3545]/5">
                <Ban size={14} /> Cancel case
              </button>
            </form>
            <form action={closeAndFileAction}>
              <input type="hidden" name="caseId" value={c.id} />
              <button
                type="submit"
                disabled={c.serviceEntries.filter((e) => !e.voided).length === 0}
                title={c.serviceEntries.filter((e) => !e.voided).length === 0 ? "Add at least one service entry (or cancel the case)" : undefined}
                className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                <FileCheck2 size={16} /> {recon.unbilledResidual > 0 ? "Close & file final claim" : "Close case"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
