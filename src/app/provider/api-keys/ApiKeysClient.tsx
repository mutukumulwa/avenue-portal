"use client";

import { useActionState, useState } from "react";
import { KeyRound, Plus, Copy, Check, ShieldAlert } from "lucide-react";
import { generateApiKeyAction, revokeApiKeyAction } from "./actions";

interface KeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeysClient({ providerName, keys }: { providerName: string; keys: KeyRow[] }) {
  const [state, action, pending] = useActionState(generateApiKeyAction, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><KeyRound size={22} /> HMS API keys</h1>
        <p className="text-brand-text-muted text-sm mt-1">
          Connect {providerName}&apos;s hospital management system to submit claims and check eligibility automatically.
          Post to <code className="bg-[#F0F0F0] px-1 rounded">/api/v1/claims</code> with header{" "}
          <code className="bg-[#F0F0F0] px-1 rounded">Authorization: Bearer &lt;key&gt;</code>. Facilities without an HMS can enter claims directly in this portal.
        </p>
      </div>

      {state?.plaintext && (
        <div className="rounded-lg bg-[#28A745]/5 border border-[#28A745]/30 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-[#28A745] flex items-center gap-2"><ShieldAlert size={16} /> Copy your new key now — it is shown only once.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-[#EEEEEE] rounded px-3 py-2 text-xs font-mono break-all">{state.plaintext}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(state.plaintext!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex items-center gap-1 rounded-lg bg-brand-indigo px-3 py-2 text-xs font-semibold text-white"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-brand-text-muted">Label: {state.label}</p>
        </div>
      )}
      {state?.error && (
        <div className="rounded-lg bg-[#DC3545]/5 border border-[#DC3545]/30 px-4 py-3 text-sm text-[#DC3545]">{state.error}</div>
      )}

      <form action={action} className="bg-white border border-[#EEEEEE] rounded-lg p-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="text-[11px] font-bold text-brand-text-muted uppercase block mb-1">New key label</label>
          <input name="label" placeholder="e.g. Slade360 production" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
        </div>
        <button type="submit" disabled={pending} className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Plus size={15} /> {pending ? "Generating…" : "Generate key"}
        </button>
      </form>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEEEEE]"><h2 className="font-bold text-brand-text-heading font-heading">Your keys</h2></div>
        {keys.length === 0 ? (
          <div className="px-5 py-10 text-center text-brand-text-muted text-sm">No API keys yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-brand-text-muted">
              <tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-5 py-2 font-bold">Label</th>
                <th className="text-left px-5 py-2 font-bold">Prefix</th>
                <th className="text-left px-5 py-2 font-bold">Last used</th>
                <th className="text-left px-5 py-2 font-bold">Status</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-[#F4F4F4] last:border-0">
                  <td className="px-5 py-2.5 font-semibold">{k.label}</td>
                  <td className="px-5 py-2.5 font-mono text-xs">{k.keyPrefix}…</td>
                  <td className="px-5 py-2.5 text-xs text-brand-text-muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-UG") : "never"}</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${k.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#E6E7E8] text-[#6C757D]"}`}>{k.isActive ? "ACTIVE" : "REVOKED"}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {k.isActive && (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button type="submit" className="text-xs font-semibold text-[#DC3545] hover:underline">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
