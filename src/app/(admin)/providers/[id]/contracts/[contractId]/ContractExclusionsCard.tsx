"use client";

import { useState } from "react";
import { upsertExclusionAction, deleteExclusionAction } from "../actions";
import { Pencil, Trash2, Plus, Ban } from "lucide-react";

const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-avenue-indigo w-full";
const lbl = "text-[10px] font-bold uppercase text-avenue-text-muted block mb-1";

export interface ExclusionRow {
  id: string;
  cptCode: string | null;
  serviceName: string;
  reason: string | null;
}

function ExclusionForm({ contractId, exclusion, onDone }: { contractId: string; exclusion?: ExclusionRow; onDone: () => void }) {
  return (
    <form
      action={async fd => { await upsertExclusionAction(fd); onDone(); }}
      className="grid grid-cols-5 gap-3 px-5 py-4 bg-[#DC3545]/5 border-b border-[#EEEEEE] items-end"
    >
      <input type="hidden" name="contractId" value={contractId} />
      {exclusion && <input type="hidden" name="exclusionId" value={exclusion.id} />}
      <div>
        <label className={lbl}>CPT Code</label>
        <input name="cptCode" defaultValue={exclusion?.cptCode ?? ""} className={inp} placeholder="Optional" />
      </div>
      <div className="col-span-2">
        <label className={lbl}>Service *</label>
        <input name="serviceName" required defaultValue={exclusion?.serviceName} className={inp} placeholder="e.g. Cosmetic surgery" />
      </div>
      <div>
        <label className={lbl}>Reason</label>
        <input name="reason" defaultValue={exclusion?.reason ?? ""} className={inp} placeholder="Not accredited" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="bg-avenue-indigo text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-avenue-secondary flex-1 transition-colors">
          Save
        </button>
        <button type="button" onClick={onDone} className="border border-[#EEEEEE] px-3 py-2 rounded-full text-xs font-semibold text-avenue-text-muted hover:border-avenue-indigo transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ContractExclusionsCard({
  contractId,
  exclusions,
  editable,
}: {
  contractId: string;
  exclusions: ExclusionRow[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
        <div>
          <h2 className="font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            <Ban size={15} className="text-[#DC3545]" /> Excluded Services
          </h2>
          <p className="text-xs text-avenue-text-muted mt-0.5">
            Not payable at this provider under any circumstances — adjudication forces these lines to KES 0.
          </p>
        </div>
        {editable && (
          <button onClick={() => { setAdding(true); setEditingId(null); }} className="flex items-center gap-1 text-avenue-indigo text-sm font-semibold hover:text-avenue-secondary transition-colors">
            <Plus size={14} /> Add Exclusion
          </button>
        )}
      </div>

      {adding && <ExclusionForm contractId={contractId} onDone={() => setAdding(false)} />}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">CPT</th>
            <th className="px-5 py-2.5 text-left">Service</th>
            <th className="px-5 py-2.5 text-left">Reason</th>
            {editable && <th className="px-5 py-2.5 w-16" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {exclusions.map(e =>
            editingId === e.id ? (
              <tr key={e.id}>
                <td colSpan={editable ? 4 : 3} className="p-0">
                  <ExclusionForm contractId={contractId} exclusion={e} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={e.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted">{e.cptCode ?? "—"}</td>
                <td className="px-5 py-2.5 font-medium text-avenue-text-heading">{e.serviceName}</td>
                <td className="px-5 py-2.5 text-avenue-text-muted">{e.reason ?? "—"}</td>
                {editable && (
                  <td className="px-5 py-2.5">
                    <div className="flex gap-2.5 justify-end">
                      <button onClick={() => { setEditingId(e.id); setAdding(false); }} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <form action={deleteExclusionAction}>
                        <input type="hidden" name="exclusionId" value={e.id} />
                        <input type="hidden" name="contractId" value={contractId} />
                        <button type="submit" className="text-avenue-text-muted hover:text-[#DC3545] transition-colors" title="Remove">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ),
          )}
          {exclusions.length === 0 && !adding && (
            <tr>
              <td colSpan={editable ? 4 : 3} className="px-5 py-8 text-center text-sm text-avenue-text-muted">
                No exclusions. Add services this provider may not bill (e.g. procedures the facility is not accredited for).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
