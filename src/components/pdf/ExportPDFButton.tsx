"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { ReportDocument, type ReportPdfData } from "./ReportDocument";

export function ExportPDFButton({ title, data, filename }: { title: string, data: ReportPdfData, filename: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);
      const blob = await pdf(<ReportDocument title={title} data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("Failed to export PDF. Please ensure @react-pdf/renderer is installed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleExport}
      disabled={loading}
      className="bg-white border border-[#EEEEEE] text-avenue-text-heading hover:bg-[#F8F9FA] px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 text-sm shadow-sm disabled:opacity-50"
    >
      <Download size={16} />
      <span>{loading ? "Generating..." : "Export PDF"}</span>
    </button>
  );
}
