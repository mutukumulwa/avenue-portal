import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, ROLES } from "@/lib/rbac";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CrossBorderService } from "@/server/services/cross-border.service";
import { ugx, CASE_STATUS_BADGE } from "../page";
import {
  assignFacilityAction, captureEstimateAction, issueGopAction, startTreatmentAction,
  addInvoiceLineAction, consolidateInvoiceAction, settleAction, cancelCaseAction,
} from "../actions";
import { ArrowLeft } from "lucide-react";

const inputCls =
  "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
const labelCls = "text-xs font-medium text-brand-text-heading";
const sectionCls = "rounded-lg border border-brand-border bg-brand-bg p-6";

export default async function CrossBorderCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const { error } = await searchParams;

  const [c, facilities] = await Promise.all([
    CrossBorderService.getCase(session.user.tenantId, id),
    CrossBorderService.listFacilities(session.user.tenantId, { onlyVetted: true }),
  ]);
  if (!c) notFound();

  const estimateLines = c.lineItems.filter((l) => l.kind === "ESTIMATE");
  const invoiceLines = c.lineItems.filter((l) => l.kind === "INVOICE");
  const terminal = c.status === "SETTLED" || c.status === "CANCELLED";

  return (
    <div className="space-y-6">
      <Link href="/cross-border" className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-secondary">
        <ArrowLeft className="h-4 w-4" /> Back to coordination
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">{c.caseNumber}</h1>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CASE_STATUS_BADGE[c.status]}`}>
              {c.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-brand-text-muted">
            {c.member.memberNumber} — {c.member.firstName} {c.member.lastName} · {c.diagnosis}
            {c.facility ? ` · ${c.facility.name}, ${c.facility.country}` : ""}
          </p>
        </div>
        {!terminal && (
          <form action={cancelCaseAction}>
            <input type="hidden" name="caseId" value={c.id} />
            <button className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-error hover:bg-brand-bg-alt">
              Cancel case
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* Snapshot */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Estimate (UGX)", value: ugx(c.estimatedAmountUgx ? Number(c.estimatedAmountUgx) : null) },
          { label: "GOP (UGX)", value: ugx(c.gopAmountUgx ? Number(c.gopAmountUgx) : null) },
          { label: "Approved limit", value: ugx(c.approvedLimitUgx ? Number(c.approvedLimitUgx) : null) },
          { label: "Invoice total", value: ugx(c.invoiceTotalUgx ? Number(c.invoiceTotalUgx) : null) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-brand-border bg-brand-bg p-4">
            <div className="text-xs uppercase text-brand-text-muted">{s.label}</div>
            <div className="mt-1 text-lg font-semibold text-brand-text-heading">{s.value}</div>
          </div>
        ))}
      </div>
      {c.gopWithinLimit === true && (
        <p className="text-xs text-brand-success">✓ GOP committed within the approved benefit limit.</p>
      )}
      {c.invoiceReference && (
        <p className="text-sm text-brand-text-body">Consolidated invoice: <span className="font-semibold">{c.invoiceReference}</span></p>
      )}

      {/* SOURCING: assign facility + capture estimate */}
      {c.status === "SOURCING" && (
        <>
          {!c.facility && (
            <section className={sectionCls}>
              <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Assign vetted facility</h2>
              <form action={assignFacilityAction} className="flex items-end gap-3">
                <input type="hidden" name="caseId" value={c.id} />
                <div className="flex-1">
                  <label className={labelCls} htmlFor="facilityId">Facility</label>
                  <select id="facilityId" name="facilityId" required defaultValue="" className={inputCls}>
                    <option value="" disabled>Select…</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.country} ({f.currency})</option>)}
                  </select>
                </div>
                <SubmitButton>Assign</SubmitButton>
              </form>
            </section>
          )}
          <EstimateForm caseId={c.id} />
        </>
      )}

      {/* ESTIMATED: issue GOP (or re-estimate) */}
      {c.status === "ESTIMATED" && (
        <>
          <section className={sectionCls}>
            <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Issue GOP (within limits)</h2>
            <form action={issueGopAction} className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <input type="hidden" name="caseId" value={c.id} />
              <div>
                <label className={labelCls} htmlFor="amount">GOP amount</label>
                <input id="amount" name="amount" type="number" step="0.01" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="currency">Currency</label>
                <input id="currency" name="currency" defaultValue={c.facility?.currency ?? "USD"} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="approvedLimitUgx">Approved limit (UGX)</label>
                <input id="approvedLimitUgx" name="approvedLimitUgx" type="number" step="1" required className={inputCls} />
              </div>
              <div className="flex items-end justify-end">
                <SubmitButton>Issue GOP</SubmitButton>
              </div>
            </form>
            <p className="mt-2 text-xs text-brand-text-muted">
              The GOP is FX-normalised to UGX and rejected if it exceeds the approved limit.
            </p>
          </section>
          <EstimateForm caseId={c.id} reEstimate />
        </>
      )}

      {/* GOP_ISSUED: start treatment */}
      {c.status === "GOP_ISSUED" && (
        <section className={sectionCls}>
          <form action={startTreatmentAction}>
            <input type="hidden" name="caseId" value={c.id} />
            <SubmitButton>Mark treatment started</SubmitButton>
          </form>
        </section>
      )}

      {/* IN_TREATMENT: add invoice lines + consolidate */}
      {c.status === "IN_TREATMENT" && (
        <section className={sectionCls}>
          <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Add invoice line</h2>
          <form action={addInvoiceLineAction} className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <input type="hidden" name="caseId" value={c.id} />
            <div className="md:col-span-2">
              <label className={labelCls} htmlFor="description">Description</label>
              <input id="description" name="description" required placeholder="Surgeon fees" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="amount">Amount</label>
              <input id="amount" name="amount" type="number" step="0.01" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="currency">Currency</label>
              <input id="currency" name="currency" defaultValue={c.facility?.currency ?? "USD"} required className={inputCls} />
            </div>
            <div className="flex justify-end md:col-span-4">
              <SubmitButton>Add line</SubmitButton>
            </div>
          </form>
          {invoiceLines.length > 0 && (
            <form action={consolidateInvoiceAction} className="mt-4">
              <input type="hidden" name="caseId" value={c.id} />
              <SubmitButton>Consolidate {invoiceLines.length} line(s) into one invoice</SubmitButton>
            </form>
          )}
        </section>
      )}

      {/* INVOICED: settle */}
      {c.status === "INVOICED" && (
        <section className={sectionCls}>
          <form action={settleAction}>
            <input type="hidden" name="caseId" value={c.id} />
            <SubmitButton>Settle case (accrues coordination fee)</SubmitButton>
          </form>
        </section>
      )}

      {/* Line items */}
      <LineTable title="Estimate lines" lines={estimateLines} />
      <LineTable title="Invoice lines" lines={invoiceLines} />
    </div>
  );
}

function EstimateForm({ caseId, reEstimate }: { caseId: string; reEstimate?: boolean }) {
  return (
    <section className={sectionCls}>
      <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">
        {reEstimate ? "Re-capture estimate" : "Capture upfront estimate"}
      </h2>
      <form action={captureEstimateAction} className="space-y-3">
        <input type="hidden" name="caseId" value={caseId} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <input name="lineDescription" placeholder={i === 0 ? "Consultation" : "Description"} className={inputCls} />
            </div>
            <input name="lineAmount" type="number" step="0.01" placeholder="Amount" className={inputCls} />
            <input name="lineCurrency" defaultValue="USD" placeholder="Currency" className={inputCls} />
          </div>
        ))}
        <div className="flex justify-end">
          <SubmitButton>Save estimate</SubmitButton>
        </div>
      </form>
    </section>
  );
}

function LineTable({ title, lines }: { title: string; lines: Array<{ id: string; description: string; amount: unknown; currency: string; amountUgx: unknown }> }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase text-brand-text-muted">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Description</th>
              <th className="px-4 py-2.5 font-semibold">Amount</th>
              <th className="px-4 py-2.5 font-semibold">In UGX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-brand-text-body">{l.description}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{Number(l.amount)} {l.currency}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{ugx(Number(l.amountUgx))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
