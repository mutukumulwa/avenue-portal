"use client";

import { useState, useActionState } from "react";
import {
  upsertContractTariffAction,
  deleteContractTariffAction,
  importTariffCsvAction,
  bulkUpliftAction,
} from "../actions";
import { Pencil, Trash2, Plus, Upload, TrendingUp, ShieldAlert } from "lucide-react";

const inp = "border border-[#EEEEEE] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-brand-indigo w-full";
const lbl = "text-[10px] font-bold uppercase text-brand-text-muted block mb-1";

export interface ContractTariffRow {
  id: string;
  cptCode: string | null;
  serviceName: string;
  agreedRate: number;
  requiresPreauth: boolean;
  maxQuantityPerVisit: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

function TariffForm({ contractId, tariff, onDone }: { contractId: string; tariff?: ContractTariffRow; onDone: () => void }) {
  return (
    <form
      action={async fd => { await upsertContractTariffAction(fd); onDone(); }}
      className="grid grid-cols-6 gap-3 px-5 py-4 bg-brand-indigo/5 border-b border-[#EEEEEE] items-end"
    >
      <input type="hidden" name="contractId" value={contractId} />
      {tariff && <input type="hidden" name="tariffId" value={tariff.id} />}

      <div className="col-span-2">
        <label className={lbl}>Service Name *</label>
        <input name="serviceName" required defaultValue={tariff?.serviceName} className={inp} placeholder="e.g. Specialist consultation" />
      </div>
      <div>
        <label className={lbl}>CPT Code</label>
        <input name="cptCode" defaultValue={tariff?.cptCode ?? ""} className={inp} placeholder="99213" />
      </div>
      <div>
        <label className={lbl}>Rate (KES) *</label>
        <input name="agreedRate" type="number" step="0.01" min="0.01" required defaultValue={tariff?.agreedRate} className={inp} />
      </div>
      <div>
        <label className={lbl}>Max Qty / Visit</label>
        <input name="maxQuantityPerVisit" type="number" min="1" defaultValue={tariff?.maxQuantityPerVisit ?? ""} className={inp} placeholder="—" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs text-brand-text-body">
          <input type="checkbox" name="requiresPreauth" defaultChecked={tariff?.requiresPreauth} className="accent-brand-indigo" />
          Needs PA
        </label>
        <div className="flex gap-2">
          <button type="submit" className="bg-brand-indigo text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-brand-secondary flex-1 transition-colors">
            Save
          </button>
          <button type="button" onClick={onDone} className="border border-[#EEEEEE] px-3 py-1.5 rounded-full text-xs font-semibold text-brand-text-muted hover:border-brand-indigo transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function CsvImportPanel({ contractId, onDone }: { contractId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(importTariffCsvAction, null);
  return (
    <div className="px-5 py-4 bg-[#F8F9FA] border-b border-[#EEEEEE] space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="contractId" value={contractId} />
        <div>
          <label className={lbl}>Paste the rate schedule as CSV — one line per service</label>
          <textarea
            name="csv"
            rows={6}
            required
            className={`${inp} font-mono text-xs resize-y`}
            placeholder={"cptCode,serviceName,rate,requiresPreauth,maxQtyPerVisit\n99213,General consultation,2500\n80050,Full blood count,1800,,2\n59510,Caesarean section,180000,yes"}
          />
          <p className="text-[11px] text-brand-text-muted mt-1">
            Columns: <code>cptCode,serviceName,rate[,requiresPreauth (yes/no)][,maxQtyPerVisit]</code>. CPT code may be blank for uncoded services. A header row is detected and skipped.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="bg-brand-indigo text-white px-5 py-2 rounded-full text-xs font-bold hover:bg-brand-secondary transition-colors disabled:opacity-50">
            {pending ? "Importing…" : "Import Lines"}
          </button>
          <button type="button" onClick={onDone} className="text-xs font-semibold text-brand-text-muted hover:text-brand-text-heading">
            Close
          </button>
          {state?.imported != null && (
            <span className="text-xs font-semibold text-[#28A745]">{state.imported} line{state.imported === 1 ? "" : "s"} imported.</span>
          )}
        </div>
      </form>
      {state?.errors && state.errors.length > 0 && (
        <ul className="text-[11px] text-[#DC3545] space-y-0.5 max-h-28 overflow-y-auto">
          {state.errors.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ContractTariffsCard({
  contractId,
  tariffs,
  editable,
}: {
  contractId: string;
  tariffs: ContractTariffRow[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uplifting, setUplifting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-brand-text-heading font-heading">Tariff Schedule</h2>
          <p className="text-xs text-brand-text-muted mt-0.5">
            {tariffs.length} negotiated line{tariffs.length === 1 ? "" : "s"}. Adjudication caps coded claim lines at these rates.
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-4">
            <button onClick={() => { setUplifting(u => !u); setImporting(false); setAdding(false); }} className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors">
              <TrendingUp size={14} /> Bulk Uplift
            </button>
            <button onClick={() => { setImporting(i => !i); setAdding(false); setUplifting(false); }} className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors">
              <Upload size={14} /> Import CSV
            </button>
            <button onClick={() => { setAdding(true); setEditingId(null); setImporting(false); setUplifting(false); }} className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors">
              <Plus size={14} /> Add Line
            </button>
          </div>
        )}
      </div>

      {uplifting && (
        <form action={async fd => { await bulkUpliftAction(fd); setUplifting(false); }} className="flex items-end gap-3 px-5 py-4 bg-[#F8F9FA] border-b border-[#EEEEEE]">
          <input type="hidden" name="contractId" value={contractId} />
          <div>
            <label className={lbl}>Uplift all rates by %</label>
            <input type="number" name="upliftPct" step="0.1" required className={inp} placeholder="e.g. 5 or -2.5" />
          </div>
          <button type="submit" className="bg-brand-indigo text-white px-5 py-2 rounded-full text-xs font-bold hover:bg-brand-secondary transition-colors">
            Apply to {tariffs.length} lines
          </button>
          <button type="button" onClick={() => setUplifting(false)} className="text-xs font-semibold text-brand-text-muted hover:text-brand-text-heading pb-2">
            Cancel
          </button>
        </form>
      )}

      {importing && <CsvImportPanel contractId={contractId} onDone={() => setImporting(false)} />}
      {adding && <TariffForm contractId={contractId} onDone={() => setAdding(false)} />}

      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-2.5 text-left">Service</th>
              <th className="px-5 py-2.5 text-left">CPT</th>
              <th className="px-5 py-2.5 text-right">Rate (KES)</th>
              <th className="px-5 py-2.5 text-center">PA Required</th>
              <th className="px-5 py-2.5 text-center">Max Qty</th>
              {editable && <th className="px-5 py-2.5 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {tariffs.map(t =>
              editingId === t.id ? (
                <tr key={t.id}>
                  <td colSpan={editable ? 6 : 5} className="p-0">
                    <TariffForm contractId={contractId} tariff={t} onDone={() => setEditingId(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={t.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-2.5 font-medium text-brand-text-heading">{t.serviceName}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-brand-text-muted">{t.cptCode ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-brand-text-heading">{t.agreedRate.toLocaleString("en-KE")}</td>
                  <td className="px-5 py-2.5 text-center">
                    {t.requiresPreauth ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#856404] bg-[#FFC107]/20 px-2 py-0.5 rounded-full">
                        <ShieldAlert size={10} /> PA
                      </span>
                    ) : (
                      <span className="text-brand-text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-center text-brand-text-muted text-xs">{t.maxQuantityPerVisit ?? "—"}</td>
                  {editable && (
                    <td className="px-5 py-2.5">
                      <div className="flex gap-2.5 justify-end">
                        <button onClick={() => { setEditingId(t.id); setAdding(false); }} className="text-brand-text-muted hover:text-brand-indigo transition-colors" title="Edit">
                          <Pencil size={13} />
                        </button>
                        <form action={deleteContractTariffAction}>
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
                <td colSpan={editable ? 6 : 5} className="px-5 py-8 text-center text-sm text-brand-text-muted">
                  No tariff lines yet. Import the provider&apos;s rate schedule as CSV or add lines manually — every coded claim line is capped at these rates once the contract is active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
