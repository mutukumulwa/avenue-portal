"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateComplaintStatusAction } from "./actions";

type Complaint = { id: string; status: string; resolution: string };

export function ComplaintActions({ complaint }: { complaint: Complaint }) {
  const [isPending, startTransition] = useTransition();
  const [showResolve, setShowResolve] = useState(false);
  const [resolution, setResolution] = useState(complaint.resolution);

  if (complaint.status === "RESOLVED" || complaint.status === "DISMISSED") {
    return (
      <span className="text-[10px] text-avenue-text-muted italic">
        {complaint.resolution || "No resolution notes"}
      </span>
    );
  }

  return (
    <div className="space-y-2 text-right">
      {isPending ? (
        <Loader2 size={14} className="animate-spin text-avenue-text-muted ml-auto" />
      ) : showResolve ? (
        <div className="text-left space-y-2 min-w-[220px]">
          <textarea
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            placeholder="Resolution notes…"
            rows={2}
            className="w-full text-xs border border-[#EEEEEE] rounded px-2 py-1.5 focus:outline-none focus:border-avenue-indigo"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowResolve(false)}
              className="text-xs text-avenue-text-muted hover:text-avenue-text-heading"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                startTransition(() =>
                  updateComplaintStatusAction(complaint.id, "RESOLVED", resolution)
                )
              }
              className="text-xs font-bold bg-[#28A745] text-white px-3 py-1 rounded-full hover:opacity-90"
            >
              Mark Resolved
            </button>
            <button
              onClick={() =>
                startTransition(() =>
                  updateComplaintStatusAction(complaint.id, "DISMISSED")
                )
              }
              className="text-xs font-bold bg-[#6C757D] text-white px-3 py-1 rounded-full hover:opacity-90"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 justify-end">
          {complaint.status === "OPEN" && (
            <button
              onClick={() =>
                startTransition(() =>
                  updateComplaintStatusAction(complaint.id, "INVESTIGATING")
                )
              }
              className="text-[10px] font-bold border border-[#FFC107] text-[#856404] px-2.5 py-1 rounded-full hover:bg-[#FFC107]/10 transition-colors"
            >
              Investigate
            </button>
          )}
          <button
            onClick={() => setShowResolve(true)}
            className="text-[10px] font-bold border border-[#28A745] text-[#28A745] px-2.5 py-1 rounded-full hover:bg-[#28A745]/10 transition-colors"
          >
            Resolve
          </button>
        </div>
      )}
    </div>
  );
}
