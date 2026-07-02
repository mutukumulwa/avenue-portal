"use client";

import { useState } from "react";
import { upsertCptTariffAction, deleteCptTariffAction } from "./actions";
import { Pencil, Trash2, Plus } from "lucide-react";

export interface SerializedTariff {
  id: string;
  serviceName: string;
  cptCode: string | null;
  agreedRate: number;
  currency: string;
  clientId: string | null;
  clientName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface TariffClient {
  id: string;
  name: string;
}

const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-brand-indigo w-full";
const lbl = "text-[10px] font-bold uppercase text-brand-text-muted block mb-1";

function TariffForm({
  providerId,
  clients,
  tariff,
  onDone,
}: {
  providerId: string;
  clients: TariffClient[];
  tariff?: SerializedTariff;
  onDone: () => void;
}) {
  return (
    <form
      action={async (fd) => { await upsertCptTariffAction(fd); onDone(); }}
      className="grid gap-3 px-5 py-4 bg-brand-indigo/5 border-b border-[#EEEEEE] sm:grid-cols-2 lg:grid-cols-3"
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
        <label className={lbl}>Client</label>
        <select name="clientId" defaultValue={tariff?.clientId ?? ""} className={inp}>
          <option value="">Network master</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={lbl}>Agreed Rate *</label>
          <input name="agreedRate" type="number" step="0.01" required defaultValue={tariff?.agreedRate} className={inp} />
        </div>
        <div className="w-24">
          <label className={lbl}>Currency</label>
          <select name="currency" defaultValue={tariff?.currency ?? "UGX"} className={inp}>
            <option value="UGX">UGX</option>
            <option value="USD">USD</option>
            <option value="KES">KES</option>
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Effective From *</label>
        <input name="effectiveFrom" type="date" required defaultValue={tariff?.effectiveFrom?.slice(0, 10)} className={inp} />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" className="bg-brand-indigo text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-brand-secondary flex-1 transition-colors">
          Save
        </button>
        <button type="button" onClick={onDone} className="border border-[#EEEEEE] px-3 py-2 rounded-full text-xs font-semibold text-brand-text-muted hover:border-brand-indigo transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ProviderTariffsCard({
  providerId,
  tariffs,
  clients,
}: {
  providerId: string;
  tariffs: SerializedTariff[];
  clients: TariffClient[];
}) {
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
        <div>
          <h2 className="font-bold text-brand-text-heading font-heading">CPT Tariff Schedule</h2>
          <p className="text-xs text-brand-text-muted mt-0.5">Procedure-level agreed rates by CPT code. A client-specific rate overrides the network master at adjudication.</p>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors"
        >
          <Plus size={14} /> Add Tariff
        </button>
      </div>

      {adding && (
        <TariffForm providerId={providerId} clients={clients} onDone={() => setAdding(false)} />
      )}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">Service</th>
            <th className="px-5 py-2.5 text-left">CPT</th>
            <th className="px-5 py-2.5 text-left">Scope</th>
            <th className="px-5 py-2.5 text-right">Rate</th>
            <th className="px-5 py-2.5 text-left">Effective From</th>
            <th className="px-5 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {tariffs.map(t =>
            editingId === t.id ? (
              <tr key={t.id}>
                <td colSpan={6} className="p-0">
                  <TariffForm providerId={providerId} clients={clients} tariff={t} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={t.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-medium text-brand-text-heading">{t.serviceName}</td>
                <td className="px-5 py-3 font-mono text-xs text-brand-text-muted">{t.cptCode ?? "—"}</td>
                <td className="px-5 py-3">
                  {t.clientName ? (
                    <span className="rounded-full bg-brand-indigo/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-indigo">{t.clientName}</span>
                  ) : (
                    <span className="text-xs text-brand-text-muted">Network master</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-semibold text-brand-text-heading">
                  {Number(t.agreedRate).toLocaleString("en-UG")} <span className="text-[10px] font-normal text-brand-text-muted">{t.currency}</span>
                </td>
                <td className="px-5 py-3 text-brand-text-muted">
                  {new Date(t.effectiveFrom).toLocaleDateString("en-UG")}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2.5 justify-end">
                    <button
                      onClick={() => { setEditingId(t.id); setAdding(false); }}
                      className="text-brand-text-muted hover:text-brand-indigo transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <form action={deleteCptTariffAction}>
                      <input type="hidden" name="tariffId"   value={t.id} />
                      <input type="hidden" name="providerId" value={providerId} />
                      <button
                        type="submit"
                        className="text-brand-text-muted hover:text-[#DC3545] transition-colors"
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
              <td colSpan={6} className="px-5 py-8 text-center text-sm text-brand-text-muted">
                No CPT tariffs configured yet. Add the first rate above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
