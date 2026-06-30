"use client";

import { useState } from "react";
import { upsertContractDiagnosisTariffAction, deleteContractDiagnosisTariffAction } from "../actions";
import { Pencil, Trash2, Plus } from "lucide-react";

const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-brand-indigo w-full";
const lbl = "text-[10px] font-bold uppercase text-brand-text-muted block mb-1";

export interface ContractDiagnosisRow {
  id: string;
  icdCode: string;
  diagnosisLabel: string;
  bundledRate: number | null;
  perDayRate: number | null;
  notes: string | null;
}

function DiagnosisForm({ contractId, tariff, onDone }: { contractId: string; tariff?: ContractDiagnosisRow; onDone: () => void }) {
  return (
    <form
      action={async fd => { await upsertContractDiagnosisTariffAction(fd); onDone(); }}
      className="grid grid-cols-6 gap-3 px-5 py-4 bg-brand-indigo/5 border-b border-[#EEEEEE] items-end"
    >
      <input type="hidden" name="contractId" value={contractId} />
      {tariff && <input type="hidden" name="diagTariffId" value={tariff.id} />}
      <div>
        <label className={lbl}>ICD-10 *</label>
        <input name="icdCode" required defaultValue={tariff?.icdCode} className={inp} placeholder="B54" />
      </div>
      <div className="col-span-2">
        <label className={lbl}>Diagnosis *</label>
        <input name="diagnosisLabel" required defaultValue={tariff?.diagnosisLabel} className={inp} placeholder="Malaria, unspecified" />
      </div>
      <div>
        <label className={lbl}>Case Rate (KES)</label>
        <input name="bundledRate" type="number" step="0.01" defaultValue={tariff?.bundledRate ?? ""} className={inp} placeholder="Whole episode" />
      </div>
      <div>
        <label className={lbl}>Per Diem (KES)</label>
        <input name="perDayRate" type="number" step="0.01" defaultValue={tariff?.perDayRate ?? ""} className={inp} placeholder="Per day" />
      </div>
      <div className="flex gap-2">
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

export function ContractDiagnosisCard({
  contractId,
  tariffs,
  editable,
}: {
  contractId: string;
  tariffs: ContractDiagnosisRow[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
        <div>
          <h2 className="font-bold text-brand-text-heading font-heading">Case & Per-Diem Rates</h2>
          <p className="text-xs text-brand-text-muted mt-0.5">Diagnosis-bundled episode rates and inpatient per-diems (DRG-style).</p>
        </div>
        {editable && (
          <button onClick={() => { setAdding(true); setEditingId(null); }} className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors">
            <Plus size={14} /> Add Rate
          </button>
        )}
      </div>

      {adding && <DiagnosisForm contractId={contractId} onDone={() => setAdding(false)} />}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">ICD-10</th>
            <th className="px-5 py-2.5 text-left">Diagnosis</th>
            <th className="px-5 py-2.5 text-right">Case Rate</th>
            <th className="px-5 py-2.5 text-right">Per Diem</th>
            {editable && <th className="px-5 py-2.5 w-16" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {tariffs.map(t =>
            editingId === t.id ? (
              <tr key={t.id}>
                <td colSpan={editable ? 5 : 4} className="p-0">
                  <DiagnosisForm contractId={contractId} tariff={t} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={t.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-2.5 font-mono text-xs text-brand-text-muted">{t.icdCode}</td>
                <td className="px-5 py-2.5 font-medium text-brand-text-heading">{t.diagnosisLabel}</td>
                <td className="px-5 py-2.5 text-right font-semibold">{t.bundledRate != null ? t.bundledRate.toLocaleString("en-UG") : "—"}</td>
                <td className="px-5 py-2.5 text-right font-semibold">{t.perDayRate != null ? `${t.perDayRate.toLocaleString("en-UG")}/day` : "—"}</td>
                {editable && (
                  <td className="px-5 py-2.5">
                    <div className="flex gap-2.5 justify-end">
                      <button onClick={() => { setEditingId(t.id); setAdding(false); }} className="text-brand-text-muted hover:text-brand-indigo transition-colors" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <form action={deleteContractDiagnosisTariffAction}>
                        <input type="hidden" name="tariffId" value={t.id} />
                        <input type="hidden" name="contractId" value={contractId} />
                        <button type="submit" className="text-brand-text-muted hover:text-[#DC3545] transition-colors" title="Remove">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ),
          )}
          {tariffs.length === 0 && !adding && (
            <tr>
              <td colSpan={editable ? 5 : 4} className="px-5 py-8 text-center text-sm text-brand-text-muted">
                No bundled rates. Use these for fixed-price episodes (e.g. normal delivery, caesarean) or inpatient per-diems.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
