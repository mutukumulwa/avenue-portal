"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { RemittanceDocument } from "./RemittanceDocument";
import type { RemittancePdfData } from "./remittance-pdf";

/**
 * F6.6 — client-side remittance PDF. Renders the @react-pdf statement from the
 * already-authorized, provider-safe page DTO (no new server egress — like the
 * F3.14 GOP button). The user prints the downloaded PDF.
 */
export function RemittancePdfButton({ data, fileBase }: { data: RemittancePdfData; fileBase: string }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    try {
      setLoading(true);
      const blob = await pdf(<RemittanceDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Remittance PDF generation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      title="Download / print remittance PDF"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-indigo border border-brand-indigo/30 rounded-lg px-3 py-1.5 hover:bg-brand-indigo/5 disabled:opacity-60"
    >
      <Printer size={15} /> {loading ? "Generating…" : "PDF / Print"}
    </button>
  );
}
