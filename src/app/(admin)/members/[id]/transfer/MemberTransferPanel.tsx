"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Layers } from "lucide-react";
import { schemeTransferAction, tierChangeAction } from "./actions";

interface Group { id: string; name: string }
interface Tier  { id: string; name: string; packageName: string }

interface Props {
  memberId:      string;
  currentGroupId: string;
  currentTierId:  string | null;
  groups:        Group[];
  tiers:         Tier[];
}

export function MemberTransferPanel({ memberId, currentGroupId, currentTierId, groups, tiers }: Props) {
  const [mode, setMode]       = useState<"idle" | "transfer" | "tier">("idle");
  const [error, setError]     = useState<string | null>(null);
  const [isPending, start]    = useTransition();

  function handleTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("memberId", memberId);
    setError(null);
    start(async () => {
      const res = await schemeTransferAction(fd);
      if (res.error) setError(res.error);
      else setMode("idle");
    });
  }

  function handleTier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("memberId", memberId);
    setError(null);
    start(async () => {
      const res = await tierChangeAction(fd);
      if (res.error) setError(res.error);
      else setMode("idle");
    });
  }

  const otherGroups = groups.filter(g => g.id !== currentGroupId);
  const otherTiers  = tiers.filter(t => t.id !== currentTierId);

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">{error}</p>
      )}

      {mode === "idle" && (
        <div className="flex gap-2 flex-wrap">
          {otherGroups.length > 0 && (
            <button onClick={() => setMode("transfer")}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border border-[#17A2B8]/30 text-[#17A2B8] hover:bg-[#17A2B8]/5 transition-colors">
              <ArrowRightLeft size={13} /> Transfer to Another Scheme
            </button>
          )}
          {otherTiers.length > 0 && (
            <button onClick={() => setMode("tier")}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border border-avenue-indigo/30 text-avenue-indigo hover:bg-avenue-indigo/5 transition-colors">
              <Layers size={13} /> Change Benefit Tier
            </button>
          )}
          {otherGroups.length === 0 && otherTiers.length === 0 && (
            <p className="text-xs text-avenue-text-muted">No other groups or tiers available for transfer.</p>
          )}
        </div>
      )}

      {mode === "transfer" && (
        <form onSubmit={handleTransfer} className="bg-[#EFF6FF] border border-[#17A2B8]/20 rounded-lg p-4 space-y-3">
          <p className="text-sm font-bold text-avenue-text-heading flex items-center gap-2">
            <ArrowRightLeft size={14} className="text-[#17A2B8]" /> Transfer to Another Scheme
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Destination Group</label>
              <select name="toGroupId" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white">
                <option value="">Select group…</option>
                {otherGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Effective Date</label>
              <input name="effectiveDate" type="date" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Reason</label>
            <input name="reason" type="text" placeholder="e.g. Employer change" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="text-xs font-bold px-5 py-2 rounded-full bg-[#17A2B8] text-white hover:bg-[#138496] disabled:opacity-50 transition-colors">
              {isPending ? "Transferring…" : "Confirm Transfer"}
            </button>
          </div>
        </form>
      )}

      {mode === "tier" && (
        <form onSubmit={handleTier} className="bg-[#F8FAFF] border border-avenue-indigo/20 rounded-lg p-4 space-y-3">
          <p className="text-sm font-bold text-avenue-text-heading flex items-center gap-2">
            <Layers size={14} className="text-avenue-indigo" /> Change Benefit Tier
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">New Tier</label>
              <select name="toBenefitTierId" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white">
                <option value="">Select tier…</option>
                {otherTiers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.packageName})</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Effective Date</label>
              <input name="effectiveDate" type="date" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Reason</label>
            <input name="reason" type="text" placeholder="e.g. Promotion to manager grade" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="text-xs font-bold px-5 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Confirm Tier Change"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
