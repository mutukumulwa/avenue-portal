"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from "lucide-react";
import type { CoContributionRule, AnnualCoContributionCap } from "@prisma/client";
import {
  createCoContributionRuleAction,
  toggleCoContributionRuleAction,
  deleteCoContributionRuleAction,
  upsertAnnualCapAction,
} from "./coContribution.actions";

const BENEFIT_CATEGORIES = [
  "INPATIENT", "OUTPATIENT", "MATERNITY", "DENTAL", "OPTICAL",
  "MENTAL_HEALTH", "CHRONIC_DISEASE", "SURGICAL", "AMBULANCE_EMERGENCY",
  "LAST_EXPENSE", "WELLNESS_PREVENTIVE", "REHABILITATION", "CUSTOM",
];

const NETWORK_TIERS = ["TIER_1", "TIER_2", "TIER_3"];
const TIER_LABELS: Record<string, string> = { TIER_1: "Tier 1 (Own)", TIER_2: "Tier 2 (Partner)", TIER_3: "Tier 3 (Panel)" };
const TYPE_LABELS: Record<string, string> = { FIXED_AMOUNT: "Fixed Amount", PERCENTAGE: "Percentage", HYBRID: "Hybrid", NONE: "None (plan covers all)" };

interface Props {
  packageId: string;
  rules: CoContributionRule[];
  annualCap: AnnualCoContributionCap | null;
}

export function CoContributionRulesManager({ packageId, rules, annualCap }: Props) {
  const [showAddForm, setShowAddForm]   = useState(false);
  const [showCapForm, setShowCapForm]   = useState(false);
  const [selectedType, setSelectedType] = useState("PERCENTAGE");
  const [error, setError]               = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("packageId", packageId);
    setError(null);
    startTransition(async () => {
      const res = await createCoContributionRuleAction(fd);
      if (res.error) setError(res.error);
      else { setShowAddForm(false); setSelectedType("PERCENTAGE"); }
    });
  }

  function handleToggle(ruleId: string) {
    const fd = new FormData();
    fd.set("ruleId", ruleId);
    fd.set("packageId", packageId);
    startTransition(async () => { await toggleCoContributionRuleAction(fd); });
  }

  function handleDelete(ruleId: string) {
    if (!confirm("Delete this rule? This cannot be undone.")) return;
    const fd = new FormData();
    fd.set("ruleId", ruleId);
    fd.set("packageId", packageId);
    startTransition(async () => { await deleteCoContributionRuleAction(fd); });
  }

  function handleCapSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("packageId", packageId);
    setError(null);
    startTransition(async () => {
      const res = await upsertAnnualCapAction(fd);
      if (res.error) setError(res.error);
      else setShowCapForm(false);
    });
  }

  return (
    <div className="space-y-4">
      {/* Annual caps bar */}
      <div className="flex items-center justify-between bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg px-4 py-3">
        <div className="text-sm">
          {annualCap ? (
            <span className="text-avenue-text-body">
              Annual caps — Individual: <span className="font-bold text-avenue-text-heading">KES {Number(annualCap.individualCap).toLocaleString()}</span>
              {annualCap.familyCap && <> · Family: <span className="font-bold text-avenue-text-heading">KES {Number(annualCap.familyCap).toLocaleString()}</span></>}
            </span>
          ) : (
            <span className="text-avenue-text-muted italic text-sm">No annual cap configured</span>
          )}
        </div>
        <button
          onClick={() => setShowCapForm(v => !v)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-avenue-indigo/30 text-avenue-indigo hover:bg-avenue-indigo/5 transition-colors"
        >
          {showCapForm ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {annualCap ? "Edit Caps" : "Set Caps"}
        </button>
      </div>

      {/* Annual cap form */}
      {showCapForm && (
        <form onSubmit={handleCapSave} className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg p-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Individual Annual Cap (KES)</label>
            <input name="individualCap" type="number" step="0.01" min="1" required
              defaultValue={annualCap ? Number(annualCap.individualCap) : ""}
              className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Family Annual Cap (KES) — optional</label>
            <input name="familyCap" type="number" step="0.01" min="1"
              defaultValue={annualCap?.familyCap ? Number(annualCap.familyCap) : ""}
              className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => setShowCapForm(false)}
              className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending}
              className="text-xs font-bold px-5 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Save Caps"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-xs text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">{error}</p>
      )}

      {/* Rules table */}
      {rules.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-4 py-3">Benefit Category</th>
              <th className="px-4 py-3">Network Tier</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount / %</th>
              <th className="px-4 py-3">Per-Visit Cap</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {rules.map(r => (
              <tr key={r.id} className={`${r.isActive ? "hover:bg-[#F8F9FA]" : "bg-[#F8F9FA] opacity-60"}`}>
                <td className="px-4 py-3 font-semibold text-avenue-text-heading">
                  {r.benefitCategory ? r.benefitCategory.replace(/_/g, " ") : <span className="text-avenue-text-muted italic font-normal">All categories</span>}
                </td>
                <td className="px-4 py-3 text-avenue-text-body">{TIER_LABELS[r.networkTier] ?? r.networkTier}</td>
                <td className="px-4 py-3 text-avenue-text-body">{TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="px-4 py-3 font-mono text-avenue-text-heading">
                  {r.type === "FIXED_AMOUNT" && `KES ${Number(r.fixedAmount ?? 0).toLocaleString()}`}
                  {r.type === "PERCENTAGE"   && `${Number(r.percentage ?? 0)}%`}
                  {r.type === "HYBRID"       && `${Number(r.percentage ?? 0)}% / KES ${Number(r.fixedAmount ?? 0).toLocaleString()} floor`}
                  {r.type === "NONE"         && "—"}
                </td>
                <td className="px-4 py-3 font-mono text-avenue-text-body">
                  {r.perVisitCap ? `KES ${Number(r.perVisitCap).toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                    {r.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => handleToggle(r.id)} disabled={isPending}
                      title={r.isActive ? "Deactivate" : "Activate"}
                      className="text-avenue-text-muted hover:text-avenue-indigo disabled:opacity-50 transition-colors">
                      {r.isActive ? <ToggleRight size={18} className="text-[#28A745]" /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => handleDelete(r.id)} disabled={isPending}
                      title="Delete rule"
                      className="text-avenue-text-muted hover:text-[#DC3545] disabled:opacity-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rules.length === 0 && !showAddForm && (
        <p className="text-sm text-avenue-text-muted py-2">No co-contribution rules yet.</p>
      )}

      {/* Add rule form */}
      {showAddForm ? (
        <form onSubmit={handleAdd} className="border border-avenue-indigo/20 rounded-lg p-5 space-y-4 bg-[#F8FAFF]">
          <p className="text-sm font-bold text-avenue-text-heading">New Co-Contribution Rule</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Benefit Category</label>
              <select name="benefitCategory"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white">
                <option value="">All categories (default)</option>
                {BENEFIT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Network Tier</label>
              <select name="networkTier" required
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white">
                {NETWORK_TIERS.map(t => (
                  <option key={t} value={t}>{TIER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Rule Type</label>
              <select name="type" required value={selectedType} onChange={e => setSelectedType(e.target.value)}
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white">
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {(selectedType === "FIXED_AMOUNT" || selectedType === "HYBRID") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-avenue-text-muted uppercase">Fixed Amount (KES)</label>
                <input name="fixedAmount" type="number" step="0.01" min="0"
                  required={selectedType === "FIXED_AMOUNT"}
                  className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
              </div>
            </div>
          )}

          {(selectedType === "PERCENTAGE" || selectedType === "HYBRID") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-avenue-text-muted uppercase">Percentage (%)</label>
                <input name="percentage" type="number" step="0.01" min="0" max="100"
                  required
                  placeholder="e.g. 20 = 20%"
                  className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
              </div>
            </div>
          )}

          {selectedType !== "NONE" && (
            <div className="space-y-1 max-w-xs">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Per-Visit Cap (KES) — optional</label>
              <input name="perVisitCap" type="number" step="0.01" min="0"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowAddForm(false)}
              className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending}
              className="text-xs font-bold px-5 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Add Rule"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border-2 border-dashed border-avenue-indigo/30 text-avenue-indigo hover:bg-avenue-indigo/5 transition-colors">
          <Plus size={13} /> Add Co-Contribution Rule
        </button>
      )}
    </div>
  );
}
