"use client";

import { useState } from "react";
import { contractLifecycleAction, renewContractAction } from "../actions";
import { Play, Pause, XCircle, RefreshCw, Undo2 } from "lucide-react";

const btn = "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors";
const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-avenue-indigo";
const lbl = "text-[10px] font-bold uppercase text-avenue-text-muted block mb-1";

export function ContractLifecycleBar({
  contractId,
  status,
  isPastEnd,
  alreadyRenewed,
  endDate,
}: {
  contractId: string;
  status: string;
  isPastEnd: boolean;
  alreadyRenewed: boolean;
  endDate: string;
}) {
  const [renewing, setRenewing] = useState(false);

  // Sensible renewal defaults: day after current end, for 12 months
  const start = new Date(endDate);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-bold uppercase text-avenue-text-muted mr-1">Lifecycle</span>

        {status === "DRAFT" && !isPastEnd && (
          <form action={contractLifecycleAction}>
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="transition" value="ACTIVATE" />
            <button type="submit" className={`${btn} bg-[#28A745] text-white hover:bg-[#218838]`}>
              <Play size={12} /> Activate Contract
            </button>
          </form>
        )}

        {status === "SUSPENDED" && !isPastEnd && (
          <form action={contractLifecycleAction}>
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="transition" value="ACTIVATE" />
            <button type="submit" className={`${btn} bg-[#28A745] text-white hover:bg-[#218838]`}>
              <Play size={12} /> Reinstate
            </button>
          </form>
        )}

        {status === "ACTIVE" && (
          <form action={contractLifecycleAction}>
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="transition" value="SUSPEND" />
            <button type="submit" className={`${btn} border border-[#FFC107] text-[#856404] hover:bg-[#FFF8E1]`}>
              <Pause size={12} /> Suspend
            </button>
          </form>
        )}

        {(status === "ACTIVE" || status === "SUSPENDED") && (
          <form
            action={contractLifecycleAction}
            onSubmit={e => { if (!confirm("Terminate this contract early? Adjudication will stop using its schedule immediately.")) e.preventDefault(); }}
          >
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="transition" value="TERMINATE" />
            <button type="submit" className={`${btn} border border-[#DC3545] text-[#DC3545] hover:bg-[#DC3545]/5`}>
              <XCircle size={12} /> Terminate
            </button>
          </form>
        )}

        {status === "TERMINATED" && !isPastEnd && (
          <form action={contractLifecycleAction}>
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="transition" value="REOPEN" />
            <button type="submit" className={`${btn} border border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo`}>
              <Undo2 size={12} /> Reopen as Draft
            </button>
          </form>
        )}

        {!alreadyRenewed && (
          <button onClick={() => setRenewing(r => !r)} className={`${btn} border border-avenue-indigo text-avenue-indigo hover:bg-avenue-indigo/5 ml-auto`}>
            <RefreshCw size={12} /> {renewing ? "Cancel Renewal" : "Renew Contract"}
          </button>
        )}
      </div>

      {renewing && (
        <form action={renewContractAction} className="grid grid-cols-4 gap-3 items-end mt-4 pt-4 border-t border-[#EEEEEE]">
          <input type="hidden" name="contractId" value={contractId} />
          <div>
            <label className={lbl}>New Start *</label>
            <input type="date" name="startDate" required defaultValue={iso(start)} className={inp} />
          </div>
          <div>
            <label className={lbl}>New End *</label>
            <input type="date" name="endDate" required defaultValue={iso(end)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Rate Uplift %</label>
            <input type="number" name="upliftPct" step="0.1" defaultValue={0} className={inp} placeholder="e.g. 5" />
          </div>
          <button type="submit" className="bg-avenue-indigo text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-avenue-secondary transition-colors">
            Create Renewal Draft
          </button>
          <p className="col-span-4 text-xs text-avenue-text-muted">
            Clones the full schedule, exclusions and terms into a new DRAFT contract with the uplift applied to every rate. The new contract must be reviewed and activated before it takes effect.
          </p>
        </form>
      )}
    </div>
  );
}
