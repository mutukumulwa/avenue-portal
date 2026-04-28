"use client";

import { useState, useTransition } from "react";
import { Receipt, CheckCircle } from "lucide-react";
import { generateAdminFeeInvoiceAction } from "./actions";

interface Props {
  groupId: string;
  alreadyInvoiced: boolean;
  adminFeeMethod: string | null;
}

export function AdminFeeButton({ groupId, alreadyInvoiced, adminFeeMethod }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone]   = useState(false);
  const [isPending, start] = useTransition();

  if (alreadyInvoiced || done) {
    return (
      <div className="flex items-center gap-2 text-[#28A745] text-sm font-semibold">
        <CheckCircle size={15} /> Admin fee invoice already generated for this period
      </div>
    );
  }

  if (!adminFeeMethod) {
    return <p className="text-xs text-avenue-text-muted italic">Admin fee method not configured on this group.</p>;
  }

  function handleGenerate() {
    const fd = new FormData();
    fd.set("groupId", groupId);
    setError(null);
    start(async () => {
      const res = await generateAdminFeeInvoiceAction(fd);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-[#DC3545]">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-avenue-indigo text-white hover:bg-avenue-secondary disabled:opacity-50 transition-colors"
      >
        <Receipt size={14} />
        {isPending ? "Generating…" : "Generate Admin Fee Invoice"}
      </button>
      <p className="text-xs text-avenue-text-muted">
        Method: {adminFeeMethod === "FLAT_PER_INSURED" ? "Flat per insured member" : "% of claims paid"}
      </p>
    </div>
  );
}
