"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Star } from "lucide-react";
import { createTierAction, updateTierAction, deleteTierAction } from "@/app/(admin)/groups/[id]/tiers/actions";

interface Package { id: string; name: string; annualLimit: number; }
interface Tier {
  id: string;
  name: string;
  packageId: string;
  contributionRate: number;
  description: string | null;
  isDefault: boolean;
  _count: { members: number };
  package: { name: string; annualLimit: number };
}

interface Props {
  groupId: string;
  tiers: Tier[];
  packages: Package[];
}

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo";

function TierForm({
  groupId,
  packages,
  initial,
  onClose,
}: {
  groupId: string;
  packages: Package[];
  initial?: Tier;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      if (initial) await updateTierAction(fd);
      else await createTierAction(fd);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg p-4 space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      {initial && <input type="hidden" name="tierId" value={initial.id} />}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-avenue-text-muted uppercase block mb-1">Tier Name *</label>
          <input
            name="name"
            required
            defaultValue={initial?.name}
            placeholder="e.g. Executive, Senior Staff"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-avenue-text-muted uppercase block mb-1">Package *</label>
          <select name="packageId" required defaultValue={initial?.packageId} className={inputCls}>
            <option value="">Select package…</option>
            {packages.map(p => (
              <option key={p.id} value={p.id}>{p.name} (KES {p.annualLimit.toLocaleString()} limit)</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-avenue-text-muted uppercase block mb-1">Contribution Rate (KES/yr) *</label>
          <input
            name="contributionRate"
            type="number"
            min={0}
            required
            defaultValue={initial?.contributionRate}
            placeholder="e.g. 75000"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-avenue-text-muted uppercase block mb-1">Description</label>
          <input
            name="description"
            defaultValue={initial?.description ?? ""}
            placeholder="Optional label"
            className={inputCls}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="hidden" name="isDefault" value="false" />
        <input
          type="checkbox"
          name="isDefault"
          value="true"
          defaultChecked={initial?.isDefault}
          className="accent-avenue-indigo"
        />
        <span className="text-avenue-text-body">Default tier for new members</span>
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose}
          className="px-4 py-1.5 rounded-full border border-[#EEEEEE] text-sm text-avenue-text-muted hover:border-avenue-indigo transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={loading}
          className="px-4 py-1.5 rounded-full bg-avenue-indigo text-white text-sm font-semibold hover:bg-avenue-secondary transition-colors disabled:opacity-50">
          {loading ? "Saving…" : initial ? "Update Tier" : "Add Tier"}
        </button>
      </div>
    </form>
  );
}

export function BenefitTiersCard({ groupId, tiers, packages }: Props) {
  const [showAdd, setShowAdd]   = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(tierId: string) {
    if (!confirm("Delete this tier? Members must be reassigned first.")) return;
    setDeleting(tierId);
    const fd = new FormData();
    fd.set("tierId", tierId);
    fd.set("groupId", groupId);
    try {
      await deleteTierAction(fd);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting tier");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
        <div>
          <h2 className="font-bold text-avenue-text-heading font-heading">Benefit Tiers</h2>
          <p className="text-xs text-avenue-text-muted mt-0.5">Different packages for different employee grades</p>
        </div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-avenue-indigo text-white hover:bg-avenue-secondary transition-colors">
            <Plus size={13} /> Add Tier
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {showAdd && (
          <TierForm groupId={groupId} packages={packages} onClose={() => setShowAdd(false)} />
        )}

        {tiers.length === 0 && !showAdd && (
          <div className="text-center py-6 text-avenue-text-muted text-sm">
            <Star size={24} className="mx-auto mb-2 opacity-30" />
            No benefit tiers configured. All members use the group&apos;s default package.
            <br />
            <button onClick={() => setShowAdd(true)} className="text-avenue-indigo font-semibold hover:underline mt-1">
              Add your first tier →
            </button>
          </div>
        )}

        {tiers.map(tier => (
          <div key={tier.id}>
            {editId === tier.id ? (
              <TierForm
                groupId={groupId}
                packages={packages}
                initial={tier}
                onClose={() => setEditId(null)}
              />
            ) : (
              <div className="flex items-center justify-between p-3 border border-[#EEEEEE] rounded-lg hover:bg-[#F8F9FA] transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${tier.isDefault ? "bg-avenue-indigo" : "bg-[#E6E7E8]"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-avenue-text-heading text-sm">{tier.name}</span>
                      {tier.isDefault && (
                        <span className="text-[10px] font-bold uppercase bg-avenue-indigo/10 text-avenue-indigo px-1.5 py-0.5 rounded-full">Default</span>
                      )}
                    </div>
                    <p className="text-xs text-avenue-text-muted mt-0.5">
                      {tier.package.name} · KES {tier.contributionRate.toLocaleString()}/yr · {tier._count.members} member{tier._count.members !== 1 ? "s" : ""}
                    </p>
                    {tier.description && <p className="text-xs text-avenue-text-muted">{tier.description}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setEditId(tier.id)}
                    className="p-1.5 rounded-lg text-avenue-text-muted hover:text-avenue-indigo hover:bg-avenue-indigo/10 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(tier.id)} disabled={deleting === tier.id}
                    className="p-1.5 rounded-lg text-avenue-text-muted hover:text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors disabled:opacity-40">
                    {deleting === tier.id ? <X size={14} /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {tiers.length > 0 && (
        <div className="px-5 py-3 border-t border-[#EEEEEE] bg-[#F8F9FA] text-xs text-avenue-text-muted">
          To move a member between tiers, create a <strong>Tier Change</strong> endorsement — this calculates the pro-rata contribution adjustment automatically.
        </div>
      )}
    </div>
  );
}
