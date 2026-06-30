import { requireRole, ROLES } from "@/lib/rbac";
import { ArrowLeft, Upload, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

/**
 * D-07: Bank statement reconciliation page.
 * Upload is handled client-side to /api/billing/reconcile
 * which parses the file and returns match results.
 */

export default async function ReconciliationPage() {
  await requireRole(ROLES.FINANCE);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/billing" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Bank Statement Reconciliation</h1>
          <p className="text-brand-text-muted text-sm mt-1">
            Upload a bank statement to match incoming payments against open invoices.
          </p>
        </div>
      </div>

      {/* Expected format */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-brand-text-heading text-sm">Expected Statement Format</h2>
        <p className="text-xs text-brand-text-muted">
          Upload an Excel (.xlsx) or CSV file. The first row must be a header row. Required columns:
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="bg-[#E6E7E8]">
                {["A: Date", "B: Description", "C: Reference", "D: Debit (KES)", "E: Credit (KES)", "F: Balance (KES)"].map((h) => (
                  <th key={h} className="border border-[#EEEEEE] px-3 py-2 text-left font-bold text-brand-text-heading whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["2026-05-01", "RTGS — Safaricom Ltd", "INV-2026-00012", "", "450,000", "1,200,000"].map((v, i) => (
                  <td key={i} className="border border-[#EEEEEE] px-3 py-2 font-mono text-brand-text-muted">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-brand-text-muted flex items-center gap-1">
          <AlertTriangle size={11} className="text-[#856404]" />
          Include the invoice number (e.g. INV-2026-00012) in the Reference column for the best match rate.
        </p>
      </div>

      {/* Match legend */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-2">
        <h2 className="font-semibold text-brand-text-heading text-sm mb-3">Match Types</h2>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-[#28A745]" />
            <span><strong>Exact Reference</strong> — Invoice number found in reference field</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#856404]" />
            <span><strong>Amount Match</strong> — Amount within KES 1 of an open invoice balance</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-[#DC3545]" />
            <span><strong>Unmatched</strong> — No invoice found; requires manual review</span>
          </div>
        </div>
      </div>

      {/* Upload form — POSTs to API route */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-text-heading text-sm">Upload Statement</h2>
        <form action="/api/billing/reconcile" method="POST" encType="multipart/form-data"
          className="space-y-4">
          <div className="border-2 border-dashed border-[#EEEEEE] rounded-[8px] p-8 text-center hover:border-brand-indigo transition-colors">
            <Upload size={28} className="mx-auto mb-2 text-brand-text-muted opacity-50" />
            <p className="text-sm text-brand-text-muted">Drop your statement here or</p>
            <label className="mt-2 inline-block cursor-pointer">
              <span className="text-sm font-semibold text-brand-indigo hover:underline">browse</span>
              <input name="file" type="file" accept=".xlsx,.xls,.csv" required className="hidden" />
            </label>
            <p className="text-[11px] text-brand-text-muted mt-1">.xlsx, .xls, or .csv — max 5 MB</p>
          </div>
          <div className="flex justify-end">
            <button type="submit"
              className="bg-brand-indigo text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-2">
              <Upload size={14} /> Reconcile
            </button>
          </div>
        </form>
      </div>

      {/* Results will be shown on the API response page */}
      <p className="text-xs text-brand-text-muted text-center">
        After upload, matched items can be posted as payments directly from the results view.
      </p>
    </div>
  );
}
