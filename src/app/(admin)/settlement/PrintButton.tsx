"use client";

import { Printer } from "lucide-react";

/** PR-029: browser-print the provider statement / remittance advice. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-4 py-1.5 rounded-full hover:bg-brand-indigo/10 transition-colors flex items-center gap-1.5 print:hidden"
    >
      <Printer size={12} /> Print statement
    </button>
  );
}
