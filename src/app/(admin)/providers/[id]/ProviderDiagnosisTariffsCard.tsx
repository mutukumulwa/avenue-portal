"use client";

import { useState } from "react";
import { upsertDiagnosisTariffAction, deleteDiagnosisTariffAction } from "./actions";
import { DiagnosisSearch, type SelectedDiagnosis } from "@/components/clinical/DiagnosisSearch";
import { Pencil, Trash2, Plus } from "lucide-react";

export interface SerializedDiagTariff {
  id: string;
  icdCode: string;
  diagnosisLabel: string;
  bundledRate: number | null;
  perDayRate: number | null;
  notes: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-avenue-indigo w-full";
const lbl = "text-[10px] font-bold uppercase text-avenue-text-muted block mb-1";

function DiagTariffForm({
  providerId,
  tariff,
  onDone,
}: {
  providerId: string;
  tariff?: SerializedDiagTariff;
  onDone: () => void;
}) {
  const [diagnoses, setDiagnoses] = useState<SelectedDiagnosis[]>(
    tariff
      ? [{ code: tariff.icdCode, description: tariff.diagnosisLabel, standardCharge: null, isPrimary: true }]
      : []
  );

  const selected = diagnoses[0] ?? null;

  return (
    <form
      action={async (fd) => { await upsertDiagnosisTariffAction(fd); onDone(); }}
      className="px-5 py-5 bg-avenue-indigo/5 border-b border-[#EEEEEE] space-y-4"
    >
      <input type="hidden" name="providerId"     value={providerId} />
      {tariff   && <input type="hidden" name="diagTariffId"   value={tariff.id} />}
      {selected && <input type="hidden" name="icdCode"        value={selected.code} />}
      {selected && <input type="hidden" name="diagnosisLabel" value={selected.description} />}

      <div>
        <label className={lbl}>Diagnosis (ICD-10) *</label>
        <DiagnosisSearch value={diagnoses} onChange={setDiagnoses} max={1} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={lbl}>Bundled Rate (KES)</label>
          <input
            name="bundledRate"
            type="number"
            step="0.01"
            defaultValue={tariff?.bundledRate ?? ""}
            className={inp}
            placeholder="Full episode"
          />
        </div>
        <div>
          <label className={lbl}>Per-Day Rate (KES)</label>
          <input
            name="perDayRate"
            type="number"
            step="0.01"
            defaultValue={tariff?.perDayRate ?? ""}
            className={inp}
            placeholder="Inpatient"
          />
        </div>
        <div>
          <label className={lbl}>Effective From *</label>
          <input
            name="effectiveFrom"
            type="date"
            required
            defaultValue={tariff?.effectiveFrom?.slice(0, 10)}
            className={inp}
          />
        </div>
        <div>
          <label className={lbl}>Effective To</label>
          <input
            name="effectiveTo"
            type="date"
            defaultValue={tariff?.effectiveTo?.slice(0, 10) ?? ""}
            className={inp}
          />
        </div>
      </div>

      <div>
        <label className={lbl}>Notes</label>
        <input
          name="notes"
          defaultValue={tariff?.notes ?? ""}
          className={inp}
          placeholder="Special terms or conditions…"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="border border-[#EEEEEE] px-5 py-2 rounded-full text-xs font-semibold text-avenue-text-muted hover:border-avenue-indigo transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!selected}
          className="bg-avenue-indigo text-white px-6 py-2 rounded-full text-xs font-bold hover:bg-avenue-secondary disabled:opacity-40 transition-colors"
        >
          Save Rate
        </button>
      </div>
    </form>
  );
}

export function ProviderDiagnosisTariffsCard({
  providerId,
  tariffs,
}: {
  providerId: string;
  tariffs: SerializedDiagTariff[];
}) {
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-start">
        <div>
          <h2 className="font-bold text-avenue-text-heading font-heading">Diagnosis Tariff Schedule</h2>
          <p className="text-xs text-avenue-text-muted mt-0.5">
            ICD-10 based bundled or per-day rates — overrides standard charges at billing.
          </p>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="flex items-center gap-1 text-avenue-indigo text-sm font-semibold hover:text-avenue-secondary transition-colors shrink-0 mt-0.5"
        >
          <Plus size={14} /> Add Rate
        </button>
      </div>

      {adding && (
        <DiagTariffForm providerId={providerId} onDone={() => setAdding(false)} />
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">ICD-10</th>
            <th className="px-5 py-2.5 text-left">Diagnosis</th>
            <th className="px-5 py-2.5 text-right">Bundled (KES)</th>
            <th className="px-5 py-2.5 text-right">Per Day (KES)</th>
            <th className="px-5 py-2.5 text-left">Effective</th>
            <th className="px-5 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {tariffs.map(t =>
            editingId === t.id ? (
              <tr key={t.id}>
                <td colSpan={6} className="p-0">
                  <DiagTariffForm providerId={providerId} tariff={t} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={t.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-mono text-xs font-bold text-avenue-indigo">{t.icdCode}</td>
                <td className="px-5 py-3 text-avenue-text-heading">{t.diagnosisLabel}</td>
                <td className="px-5 py-3 text-right font-semibold">
                  {t.bundledRate != null ? Number(t.bundledRate).toLocaleString("en-KE") : <span className="text-avenue-text-muted">—</span>}
                </td>
                <td className="px-5 py-3 text-right font-semibold">
                  {t.perDayRate != null ? Number(t.perDayRate).toLocaleString("en-KE") : <span className="text-avenue-text-muted">—</span>}
                </td>
                <td className="px-5 py-3 text-xs text-avenue-text-muted">
                  {new Date(t.effectiveFrom).toLocaleDateString("en-KE")}
                  {t.effectiveTo && ` → ${new Date(t.effectiveTo).toLocaleDateString("en-KE")}`}
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
                    <form action={deleteDiagnosisTariffAction}>
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
              <td colSpan={6} className="px-5 py-8 text-center text-sm text-avenue-text-muted">
                No diagnosis rates configured. Add the first rate above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
