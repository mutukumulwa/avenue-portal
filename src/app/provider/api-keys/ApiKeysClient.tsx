"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Copy, Check, ShieldAlert, X } from "lucide-react";
import { generateApiKeyAction, revokeApiKeyAction } from "./actions";

interface KeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  isActive: boolean;
  scopeLabels: string[];
  branchNames: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

interface Props {
  providerName: string;
  branches: { id: string; name: string }[];
  scopeOptions: { value: string; label: string }[];
  keys: KeyRow[];
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export function ApiKeysClient({ providerName, branches, scopeOptions, keys }: Props) {
  const router = useRouter();
  const [genState, genAction, genPending] = useActionState(generateApiKeyAction, null);
  const [copied, setCopied] = useState(false);

  // Revoke confirmation dialog state.
  const [revokeTarget, setRevokeTarget] = useState<KeyRow | null>(null);
  const [revokeState, revokeAction, revokePending] = useActionState(
    async (prev: { error?: string; ok?: boolean } | null, formData: FormData) => {
      const res = await revokeApiKeyAction(prev, formData);
      if (res.ok) {
        setRevokeTarget(null);
        router.refresh();
      }
      return res;
    },
    null,
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><KeyRound size={22} /> HMS API keys</h1>
        <p className="text-brand-text-muted text-sm mt-1">
          Connect {providerName}&apos;s hospital management system to the Medvex B2B API. Each key is scoped, bound to specific
          branches, and expires — a key can only do what you grant it. Post to <code className="bg-[#F0F0F0] px-1 rounded">/api/v1/*</code> with
          header <code className="bg-[#F0F0F0] px-1 rounded">Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </div>

      {genState?.plaintext && (
        <div className="rounded-lg bg-[#28A745]/5 border border-[#28A745]/30 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-[#28A745] flex items-center gap-2"><ShieldAlert size={16} /> Copy your new key now — it is shown only once.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-[#EEEEEE] rounded px-3 py-2 text-xs font-mono break-all">{genState.plaintext}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(genState.plaintext!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex items-center gap-1 rounded-lg bg-brand-indigo px-3 py-2 text-xs font-semibold text-white"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-brand-text-muted">Label: {genState.label}</p>
        </div>
      )}
      {genState?.error && (
        <div className="rounded-lg bg-[#DC3545]/5 border border-[#DC3545]/30 px-4 py-3 text-sm text-[#DC3545]" role="alert">{genState.error}</div>
      )}

      {/* Create a key */}
      <form action={genAction} className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-4">
        <h2 className="font-bold text-brand-text-heading font-heading">Create a key</h2>

        <div>
          <label htmlFor="label" className="text-[11px] font-bold text-brand-text-muted uppercase block mb-1">Label</label>
          <input id="label" name="label" placeholder="e.g. Slade360 production" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
        </div>

        <fieldset>
          <legend className="text-[11px] font-bold text-brand-text-muted uppercase mb-1">Scopes (what this key may do)</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {scopeOptions.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm text-brand-text-body">
                <input type="checkbox" name="scopes" value={s.value} className="accent-brand-indigo" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[11px] font-bold text-brand-text-muted uppercase mb-1">Branch(es) this key may act for</legend>
          {branches.length === 0 ? (
            <p className="text-[11px] text-[#856404]">This facility has no active branches — add one before creating a key.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-brand-text-body">
                  <input type="checkbox" name="allowedBranchIds" value={b.id} className="accent-brand-indigo" />
                  {b.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="expiresAt" className="text-[11px] font-bold text-brand-text-muted uppercase block mb-1">Expiry date</label>
          <input id="expiresAt" name="expiresAt" type="date" required className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
        </div>

        <button type="submit" disabled={genPending || branches.length === 0} className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Plus size={15} /> {genPending ? "Generating…" : "Generate key"}
        </button>
      </form>

      {/* Existing keys */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEEEEE]"><h2 className="font-bold text-brand-text-heading font-heading">Your keys</h2></div>
        {keys.length === 0 ? (
          <div className="px-5 py-10 text-center text-brand-text-muted text-sm">No API keys yet.</div>
        ) : (
          <ul className="divide-y divide-[#F4F4F4]">
            {keys.map((k) => (
              <li key={k.id} className="px-5 py-3.5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-text-heading">{k.label} <span className="font-mono text-xs text-brand-text-muted">{k.keyPrefix}…</span></p>
                    <p className="text-[11px] text-brand-text-muted">Expires {fmt(k.expiresAt)} · Last used {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-UG") : "never"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${k.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#E6E7E8] text-[#6C757D]"}`}>{k.isActive ? "ACTIVE" : "REVOKED"}</span>
                    {k.isActive && (
                      <button onClick={() => setRevokeTarget(k)} className="text-xs font-semibold text-[#DC3545] hover:underline">Revoke</button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {k.scopeLabels.length === 0
                    ? <span className="text-[11px] text-[#856404]">No scopes (legacy key — no access after enforcement)</span>
                    : k.scopeLabels.map((s) => <span key={s} className="text-[10px] bg-[#E6E7E8] text-[#495057] rounded-full px-2 py-0.5">{s}</span>)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {k.branchNames.length === 0
                    ? <span className="text-[11px] text-brand-text-muted">All branches (unbranched)</span>
                    : k.branchNames.map((b) => <span key={b} className="text-[10px] bg-[#EEF] text-[#3B4CCA] rounded-full px-2 py-0.5">{b}</span>)}
                </div>
                {!k.isActive && k.revokeReason && (
                  <p className="text-[11px] text-brand-text-muted">Revoked {fmt(k.revokedAt)} — {k.revokeReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Revoke confirmation dialog */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setRevokeTarget(null)} aria-label="Close revoke API key dialog" className="absolute top-4 right-4 text-brand-text-muted hover:text-brand-text-heading"><X size={18} /></button>
            <h2 className="text-lg font-bold text-brand-text-heading font-heading flex items-center gap-2"><ShieldAlert size={18} className="text-[#DC3545]" /> Revoke API key</h2>
            <p className="text-sm text-brand-text-body mt-2">
              Revoking <span className="font-semibold">{revokeTarget.label}</span> ({revokeTarget.keyPrefix}…) takes effect
              <span className="font-semibold"> immediately</span>. Any HMS integration using this key will stop working at once.
            </p>
            <p className="text-xs text-brand-text-muted mt-1">Recovery: create a replacement key (or rotate) and cut the integration over before revoking, if you want zero downtime.</p>
            {revokeState?.error && <p className="text-xs text-[#DC3545] mt-2" role="alert">{revokeState.error}</p>}
            <form action={revokeAction} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={revokeTarget.id} />
              <div>
                <label htmlFor="reason" className="text-[11px] font-bold text-brand-text-muted uppercase block mb-1">Reason (required)</label>
                <textarea id="reason" name="reason" required rows={2} placeholder="e.g. Key rotation / suspected compromise / integration decommissioned" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRevokeTarget(null)} className="px-4 py-2 text-sm text-brand-text-body border border-[#EEEEEE] rounded-full hover:bg-[#F8F9FA]">Cancel</button>
                <button type="submit" disabled={revokePending} className="px-5 py-2 text-sm font-semibold bg-[#DC3545] hover:bg-[#c82333] text-white rounded-full disabled:opacity-60">
                  {revokePending ? "Revoking…" : "Revoke key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
