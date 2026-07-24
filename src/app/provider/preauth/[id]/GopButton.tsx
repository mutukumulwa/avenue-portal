"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { GopDocument } from "./GopDocument";
import type { GopData } from "./gop-artifact";

export function GopButton({ data }: { data: GopData }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    try {
      setLoading(true);
      const blob = await pdf(<GopDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GOP-${data.gopNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("GOP generation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      title="Download Guarantee of Payment"
      className="flex items-center gap-1.5 rounded-full bg-[#28A745]/10 px-4 py-1.5 text-xs font-semibold text-[#28A745] hover:bg-[#28A745] hover:text-white transition-colors disabled:opacity-60"
    >
      <ShieldCheck size={14} /> {loading ? "Generating…" : "Download GOP"}
    </button>
  );
}
