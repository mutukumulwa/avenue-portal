"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X } from "lucide-react";
import { upsertRateTableEntryAction, deleteRateTableEntryAction } from "./actions";

type RateTableEntry = {
  id?: string;
  minAge: number;
  maxAge: number;
  gender: string;
  familySize: string;
  baseRate: number;
};

const blankEntry = (): RateTableEntry => ({ minAge: 0, maxAge: 99, gender: "ANY", familySize: "M", baseRate: 0 });

export function RateTableEditor({ pricingModelId, initialData }: { pricingModelId: string; initialData: RateTableEntry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<RateTableEntry[]>(initialData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RateTableEntry | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleEdit = (entry: RateTableEntry) => {
    setEditingId(entry.id ?? "new");
    setEditForm({ ...entry });
    setError(null);
  };

  const handleSave = () => {
    if (!editForm) return;
    startTransition(async () => {
      try {
        await upsertRateTableEntryAction({ ...editForm, pricingModelId });
        setEditingId(null);
        setEditForm(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  const handleDelete = (entry: RateTableEntry) => {
    if (!entry.id || !confirm("Delete this rate band?")) return;
    setEntries(prev => prev.filter(e => e.id !== entry.id));
    startTransition(async () => {
      try {
        await deleteRateTableEntryAction(entry.id!, pricingModelId);
        router.refresh();
      } catch (err) {
        setEntries(initialData);
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  };

  const startNew = () => {
    setEditingId("new");
    setEditForm(blankEntry());
    setError(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); setError(null); };

  const inputCls = "w-full p-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-avenue-indigo";
  const selectCls = "p-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-avenue-indigo";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm">
      <div className="p-4 border-b border-[#EEEEEE] flex justify-between items-center bg-[#F8F9FA] rounded-t-lg">
        <h2 className="font-bold text-avenue-text-heading">Contribution Rate Matrix</h2>
        <button
          onClick={startNew}
          disabled={editingId !== null || isPending}
          className="text-xs bg-avenue-indigo text-white px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
        >
          <Plus size={14} /> Add Band
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-red-600 text-xs font-semibold">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-avenue-text-body">
          <thead className="bg-[#F8F9FA] text-xs uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
            <tr>
              <th className="p-3 font-bold">Min Age</th>
              <th className="p-3 font-bold">Max Age</th>
              <th className="p-3 font-bold">Gender</th>
              <th className="p-3 font-bold">Family Size</th>
              <th className="p-3 font-bold">Base Rate (KES)</th>
              <th className="p-3 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {editingId === "new" && editForm && (
              <tr className="bg-blue-50/30">
                <td className="p-2"><input type="number" className={inputCls} style={{width: 64}} value={editForm.minAge} onChange={e => setEditForm({ ...editForm, minAge: parseInt(e.target.value) })} /></td>
                <td className="p-2"><input type="number" className={inputCls} style={{width: 64}} value={editForm.maxAge} onChange={e => setEditForm({ ...editForm, maxAge: parseInt(e.target.value) })} /></td>
                <td className="p-2">
                  <select className={selectCls} value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value })}>
                    <option value="ANY">ANY</option><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option>
                  </select>
                </td>
                <td className="p-2">
                  <select className={selectCls} value={editForm.familySize} onChange={e => setEditForm({ ...editForm, familySize: e.target.value })}>
                    <option value="ANY">ANY</option><option value="M">M</option><option value="M_1">M+1</option>
                    <option value="M_2">M+2</option><option value="M_3">M+3</option><option value="M_4">M+4</option><option value="M_5">M+5</option>
                  </select>
                </td>
                <td className="p-2"><input type="number" className={inputCls} style={{width: 120}} value={editForm.baseRate} onChange={e => setEditForm({ ...editForm, baseRate: parseFloat(e.target.value) })} /></td>
                <td className="p-2 text-right">
                  <button onClick={handleSave} disabled={isPending} className="text-green-600 p-1 hover:bg-green-50 rounded disabled:opacity-50"><Save size={16} /></button>
                  <button onClick={cancelEdit} className="text-gray-500 p-1 hover:bg-gray-100 rounded ml-1"><X size={16} /></button>
                </td>
              </tr>
            )}

            {entries.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50/50">
                {editingId === entry.id && editForm ? (
                  <>
                    <td className="p-2"><input type="number" className={inputCls} style={{width: 64}} value={editForm.minAge} onChange={e => setEditForm({ ...editForm, minAge: parseInt(e.target.value) })} /></td>
                    <td className="p-2"><input type="number" className={inputCls} style={{width: 64}} value={editForm.maxAge} onChange={e => setEditForm({ ...editForm, maxAge: parseInt(e.target.value) })} /></td>
                    <td className="p-2">
                      <select className={selectCls} value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value })}>
                        <option value="ANY">ANY</option><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <select className={selectCls} value={editForm.familySize} onChange={e => setEditForm({ ...editForm, familySize: e.target.value })}>
                        <option value="ANY">ANY</option><option value="M">M</option><option value="M_1">M+1</option>
                        <option value="M_2">M+2</option><option value="M_3">M+3</option><option value="M_4">M+4</option><option value="M_5">M+5</option>
                      </select>
                    </td>
                    <td className="p-2"><input type="number" className={inputCls} style={{width: 120}} value={editForm.baseRate} onChange={e => setEditForm({ ...editForm, baseRate: parseFloat(e.target.value) })} /></td>
                    <td className="p-2 text-right">
                      <button onClick={handleSave} disabled={isPending} className="text-green-600 p-1 hover:bg-green-50 rounded disabled:opacity-50"><Save size={16} /></button>
                      <button onClick={cancelEdit} className="text-gray-500 p-1 hover:bg-gray-100 rounded ml-1"><X size={16} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3">{entry.minAge}</td>
                    <td className="p-3">{entry.maxAge}</td>
                    <td className="p-3">{entry.gender}</td>
                    <td className="p-3">{entry.familySize}</td>
                    <td className="p-3 font-medium text-avenue-text-heading">{Number(entry.baseRate).toLocaleString("en-KE")}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => handleEdit(entry)} disabled={editingId !== null || isPending} className="text-avenue-indigo p-1 hover:bg-blue-50 rounded text-xs font-bold mr-2 disabled:opacity-40">Edit</button>
                      <button onClick={() => handleDelete(entry)} disabled={isPending} className="text-red-500 p-1 hover:bg-red-50 rounded disabled:opacity-40"><Trash2 size={16} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {entries.length === 0 && editingId !== "new" && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-avenue-text-muted">
                  No rate bands defined. Click &quot;Add Band&quot; to start building the matrix.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
