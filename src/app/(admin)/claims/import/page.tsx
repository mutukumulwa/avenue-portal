import { requireRole, ROLES } from "@/lib/rbac";
import { ArrowLeft, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

/**
 * Bulk Claims Import — Process 9
 *
 * Accepts an Excel file (.xlsx) matching the canonical template.
 * The template columns are:
 *   MemberNumber | ProviderName | DateOfService | DiagnosisCode |
 *   CPTCode | BilledAmount (KES) | InvoiceNumber
 *
 * Parsing and validation happen server-side via ExcelJS in
 * claimAdjudicationService.parseBulkImport(). This page provides
 * the upload UI and shows the parse result before final submission.
 */

export default async function ClaimsBulkImportPage() {
  await requireRole(ROLES.CLINICAL);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/claims" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Bulk Claims Import</h1>
          <p className="text-avenue-text-muted text-sm mt-0.5">
            Upload an Excel file to batch-import claims from a facility.
          </p>
        </div>
      </div>

      {/* Template download */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-avenue-text-heading text-sm flex items-center gap-2">
          <FileSpreadsheet size={15} className="text-avenue-indigo" /> Required Template Format
        </h2>
        <p className="text-sm text-avenue-text-muted">
          Your Excel file must use the following columns in this exact order:
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-[#E6E7E8]">
                {["A: MemberNumber","B: ProviderName","C: DateOfService","D: DiagnosisCode","E: CPTCode","F: BilledAmount","G: InvoiceNumber"].map((h) => (
                  <th key={h} className="border border-[#EEEEEE] px-3 py-2 text-left font-bold text-avenue-text-heading whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["AVH-2026-00001","Aga Khan Hospital","2026-05-01","J18.9","99213","2500","AKH-INV-123"].map((v, i) => (
                  <td key={i} className="border border-[#EEEEEE] px-3 py-2 text-avenue-text-muted font-mono">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 text-xs text-avenue-text-muted">
          <AlertTriangle size={11} className="text-[#856404]" />
          Row 1 must be the header row. All required columns must be populated.
          DateOfService format: YYYY-MM-DD. BilledAmount in KES (numeric, no commas).
        </div>
      </div>

      {/* Upload form */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-avenue-text-heading text-sm">Upload File</h2>
        <p className="text-xs text-avenue-text-muted">
          The file will be parsed and validated. You will see a row-by-row result before any claims are created.
          Rows that fail validation are excluded — only valid rows are imported.
        </p>

        {/* Client-side upload — handled via /api/claims/import route */}
        <form action="/api/claims/import" method="POST" encType="multipart/form-data"
          className="space-y-4">
          <div className="border-2 border-dashed border-[#EEEEEE] rounded-[8px] p-8 text-center hover:border-avenue-indigo transition-colors">
            <Upload size={28} className="mx-auto mb-2 text-avenue-text-muted opacity-50" />
            <p className="text-sm text-avenue-text-muted">Drop your Excel file here or</p>
            <label className="mt-2 inline-block cursor-pointer">
              <span className="text-sm font-semibold text-avenue-indigo hover:underline">browse</span>
              <input name="file" type="file" accept=".xlsx,.xls" required className="hidden" />
            </label>
            <p className="text-[11px] text-avenue-text-muted mt-1">.xlsx or .xls — max 10 MB</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-avenue-text-muted">
              <CheckCircle2 size={12} className="text-[#28A745]" />
              Duplicate detection runs per row before import
            </div>
            <button type="submit"
              className="bg-avenue-indigo text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors flex items-center gap-2">
              <Upload size={14} /> Parse &amp; Validate
            </button>
          </div>
        </form>
      </div>

      {/* Info: what happens after upload */}
      <div className="bg-[#F8F9FF] border border-avenue-indigo/20 rounded-[8px] p-4 space-y-2">
        <p className="text-xs font-bold text-avenue-indigo uppercase tracking-wide">What happens after parsing</p>
        <ul className="text-xs text-avenue-text-muted space-y-1 list-disc list-inside">
          <li>Each row is checked: member exists, provider exists, no duplicate invoice, no double-capture</li>
          <li>Rows with errors are shown in a table with the specific validation failure</li>
          <li>Valid rows are shown for your confirmation before any claims are created</li>
          <li>After confirmation, valid claims are created in RECEIVED status and routed to the review queue</li>
          <li>A fraud screening pass runs automatically on each imported claim</li>
        </ul>
      </div>
    </div>
  );
}
