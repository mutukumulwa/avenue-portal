"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import type { ReportPdfKpi } from "./ReportDocument";

/**
 * Client-side PDF export. Generates the report PDF in the browser via
 * @react-pdf/renderer (lazy-loaded on click) and triggers a download.
 * No server-side Puppeteer/Chromium — reliable on Vercel serverless.
 */
export function ExportPDFButton({
  title,
  kpis,
  headers,
  rows,
  filename,
  tenant,
}: {
  title: string;
  kpis: ReportPdfKpi[];
  headers: string[];
  rows: string[][];
  filename: string;
  tenant?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);
      // Lazy-load the heavy PDF renderer only when the user actually exports.
      const [{ pdf }, { ReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ReportDocument"),
      ]);
      const blob = await pdf(
        <ReportDocument
          title={title}
          data={{ kpis, headers, rows, tenant, generatedAt: new Date().toLocaleDateString("en-UG") }}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Could not generate the PDF. Please try the CSV export, or try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#DC3545] border border-[#DC3545]/30 rounded-full hover:bg-[#DC3545] hover:text-white transition-colors disabled:opacity-50"
    >
      <Download size={15} />
      <span>{loading ? "Generating…" : "Export PDF"}</span>
    </button>
  );
}
