"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { raiseExceptionAction } from "./actions";

const EXCEPTION_CODES = [
  { value: "BENEFIT_EXCEEDED",      label: "Benefit Limit Exceeded"       },
  { value: "MANUAL_OVERRIDE",       label: "Manual Rate Override"          },
  { value: "LATE_SUBMISSION",       label: "Late Submission"               },
  { value: "PROVIDER_RATE_DISPUTE", label: "Provider Rate Dispute"         },
  { value: "FRAUD_INVESTIGATION",   label: "Fraud / Integrity Investigation"},
  { value: "DUPLICATE_CHECK",       label: "Possible Duplicate"            },
  { value: "OTHER",                 label: "Other"                         },
];

const inp = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const lbl = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

export function ExceptionModal({
  claimId,
  claimNumber,
}: {
  claimId: string;
  claimNumber: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full border-2 border-[#FFC107] text-[#856404] bg-[#FFC107]/10 hover:bg-[#FFC107]/20 font-semibold text-sm transition-colors"
      >
        <AlertTriangle size={15} />
        Flag Exception
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EEEEEE] bg-[#FFC107]/10">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-[#856404]" />
                <h2 className="font-bold text-avenue-text-heading font-heading">Flag Manual Exception</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form
              action={async (fd) => { await raiseExceptionAction(fd); setOpen(false); }}
              className="px-6 py-5 space-y-4"
            >
              <input type="hidden" name="claimId"   value={claimId} />
              <input type="hidden" name="entityRef" value={claimNumber} />

              <div className="bg-[#FFF8E1] border border-[#FFC107]/40 rounded-lg px-4 py-3 text-xs text-[#856404]">
                This exception will be logged against <strong>{claimNumber}</strong> and flagged for supervisor review.
                All exceptions are auditable and appear in the exceptions register.
              </div>

              <div>
                <label className={lbl}>Exception Type *</label>
                <select name="exceptionCode" required className={inp}>
                  <option value="">Select exception type…</option>
                  {EXCEPTION_CODES.map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={lbl}>Reason *</label>
                <input
                  name="reason"
                  required
                  maxLength={200}
                  className={inp}
                  placeholder="Brief reason for the exception (required)"
                />
              </div>

              <div>
                <label className={lbl}>Extended Notes</label>
                <textarea
                  name="notes"
                  rows={3}
                  className={`${inp} resize-none`}
                  placeholder="Additional context, reference numbers, authoriser name…"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-5 py-2.5 rounded-full border border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-[#FFC107] hover:bg-[#E0A800] text-[#3D2B00] font-bold text-sm transition-colors shadow-sm"
                >
                  Log Exception
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
