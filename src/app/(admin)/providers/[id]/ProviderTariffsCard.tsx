"use client";

import { useState } from "react";
import { upsertCptTariffAction, deleteCptTariffAction } from "./actions";
import { Pencil, Trash2, Plus } from "lucide-react";

export interface SerializedTariff {
  id: string;
  serviceName: string;
  cptCode: string | null;
  agreedRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-avenue-indigo w-full";
const lbl = "text-[10px] font-bold uppercase text-avenue-text-muted block mb-1";

function TariffForm({
  providerId,
  tariff,
  onDone,
}: {
  providerId: string;
  tariff?: SerializedTariff;
  onDone: () => void;
}) {
  return (
    <form
      action={async (fd) => { await upsertCptTariffAction(fd); onDone(); }}
      className="grid grid-cols-5 gap-3 px-5 py-4 bg-avenue-indigo/5 border-b border-[#EEEEEE] items-end"
    >
      <input type="hidden" name="providerId" value={providerId} />
      {tariff && <input type="hidden" name="tariffId" value={tariff.id} />}

      <div>
        <label className={lbl}>Service Name *</label>
        <input name="serviceName" required defaultValue={tariff?.serviceName} className={inp} placeholder="e.g. Consultation" />
      </div>
      <div>
        <label className={lbl}>CPT Code</label>
        <input name="cptCode" defaultValue={tariff?.cptCode ?? ""} className={inp} placeholder="99213" />
      </div>
      <div>
        <label className={lbl}>Agreed Rate (KES) *</label>
        <input name="agreedRate" type="number" step="0.01" required defaultValue={tariff?.agreedRate} className={inp} />
      </div>
      <div>
        <label className={lbl}>Effective From *</label>
        <input name="effectiveFrom" type="date" required defaultValue={tariff?.effectiveFrom?.slice(0, 10)} className={inp} />
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

export function ProviderTariffsCard({
  providerId,
  tariffs,
}: {
  providerId: string;
  tariffs: SerializedTariff[];
}) {
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
        <div>
          <h2 className="font-bold text-avenue-text-heading font-heading">CPT Tariff Schedule</h2>
          <p className="text-xs text-avenue-text-muted mt-0.5">Procedure-level agreed rates by CPT code.</p>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="flex items-center gap-1 text-avenue-indigo text-sm font-semibold hover:text-avenue-secondary transition-colors"
        >
          <Plus size={14} /> Add Tariff
        </button>
      </div>

      {adding && (
        <TariffForm providerId={providerId} onDone={() => setAdding(false)} />
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">Service</th>
            <th className="px-5 py-2.5 text-left">CPT</th>
            <th className="px-5 py-2.5 text-right">Rate (KES)</th>
            <th className="px-5 py-2.5 text-left">Effective From</th>
            <th className="px-5 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {tariffs.map(t =>
            editingId === t.id ? (
              <tr key={t.id}>
                <td colSpan={5} className="p-0">
                  <TariffForm providerId={providerId} tariff={t} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={t.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-medium text-avenue-text-heading">{t.serviceName}</td>
                <td className="px-5 py-3 font-mono text-xs text-avenue-text-muted">{t.cptCode ?? "—"}</td>
                <td className="px-5 py-3 text-right font-semibold text-avenue-text-heading">
                  {Number(t.agreedRate).toLocaleString("en-KE")}
                </td>
                <td className="px-5 py-3 text-avenue-text-muted">
                  {new Date(t.effectiveFrom).toLocaleDateString("en-KE")}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2.5 justify-end">
                    <button
                      onClick={() => { setEditingId(t.id); setAdding(false); }}
                      className="text-avenue-text-muted hover:text-avenue-indigo transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <form action={deleteCptTariffAction}>
                      <input type="hidden" name="tariffId"   value={t.id} />
                      <input type="hidden" name="providerId" value={providerId} />
                      <button
                        type="submit"
                        className="text-avenue-text-muted hover:text-[#DC3545] transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            )
          )}
          {tariffs.length === 0 && !adding && (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-sm text-avenue-text-muted">
                No CPT tariffs configured yet. Add the first rate above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
