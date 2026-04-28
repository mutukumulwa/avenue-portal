"use client";

import { useTransition, useState } from "react";
import { configureSelfFundedSchemeAction } from "./actions";

interface Props {
  groupId: string;
  fundingMode: string;
  minimumBalance: number;
  adminFeeMethod: string | null;
  adminFeeRate: number | null;
  selectedAdminIds: string[];
  fundAdmins: { id: string; name: string; email: string }[];
}

export function SelfFundedSetupPanel({
  groupId,
  fundingMode,
  minimumBalance,
  adminFeeMethod,
  adminFeeRate,
  selectedAdminIds,
  fundAdmins,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("groupId", groupId);
    setError(null);
    start(async () => {
      const res = await configureSelfFundedSchemeAction(formData);
      if (res.error) setError(res.error);
    });
  }

  return (
    <form action={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-bold text-avenue-text-heading">Self-Funded Administration</h3>
        <p className="text-xs text-avenue-text-muted mt-0.5">Convert this group and assign fund administrators from inside the app.</p>
      </div>
      {error && <p className="text-xs text-[#DC3545]">{error}</p>}
      <div className="grid md:grid-cols-4 gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-bold uppercase text-avenue-text-muted">Funding Mode</span>
          <input value={fundingMode} readOnly className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-[#F8F9FA]" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-bold uppercase text-avenue-text-muted">Admin Fee Method</span>
          <select name="adminFeeMethod" defaultValue={adminFeeMethod ?? "FLAT_PER_INSURED"} className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white">
            <option value="FLAT_PER_INSURED">Flat per insured</option>
            <option value="PCT_OF_CLAIMS">% of claims</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-bold uppercase text-avenue-text-muted">Admin Fee Rate</span>
          <input name="adminFeeRate" type="number" min="0" step="0.01" defaultValue={adminFeeRate ?? 0} className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-bold uppercase text-avenue-text-muted">Minimum Balance</span>
          <input name="minimumBalance" type="number" min="0" step="0.01" defaultValue={minimumBalance} className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="block text-xs font-bold uppercase text-avenue-text-muted">Fund Administrators</span>
        <select name="fundAdminIds" multiple defaultValue={selectedAdminIds} className="w-full min-h-24 border border-[#EEEEEE] rounded-md px-3 py-2 text-sm bg-white">
          {fundAdmins.map(admin => (
            <option key={admin.id} value={admin.id}>{admin.name} · {admin.email}</option>
          ))}
        </select>
      </label>
      <div className="flex justify-end">
        <button disabled={pending} className="px-4 py-2 rounded-full bg-avenue-indigo text-white text-xs font-bold hover:bg-avenue-secondary disabled:opacity-50">
          {pending ? "Saving..." : fundingMode === "SELF_FUNDED" ? "Save Fund Setup" : "Convert to Self-Funded"}
        </button>
      </div>
    </form>
  );
}
