"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { DebitNoteDocument, type DebitNoteData } from "./DebitNoteDocument";

export function DebitNoteButton({ data }: { data: DebitNoteData }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    try {
      setLoading(true);
      const blob = await pdf(<DebitNoteDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DebitNote-${data.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Debit note generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title="Download Debit Note"
      className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#6C757D]/10 text-[#6C757D] hover:bg-[#6C757D] hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
    >
      <FileText size={12} />
      {loading ? "Generating…" : "Debit Note"}
    </button>
  );
}
