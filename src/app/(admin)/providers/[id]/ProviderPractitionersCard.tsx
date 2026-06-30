"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserCheck, AlertTriangle, X, Save } from "lucide-react";
import {
  createPractitionerAndLinkAction,
  linkExistingPractitionerAction,
  unlinkPractitionerAction,
  addCredentialAction,
} from "./actions";

type Credential = {
  id: string;
  documentType: string;
  expiryDate: string;
  status: string;
};

type Practitioner = {
  practitionerId: string;
  isPrimary: boolean;
  practitioner: {
    id: string;
    firstName: string;
    lastName: string;
    licenseType: string;
    licenseNumber: string;
    credentials: Credential[];
  };
};

const statusColor = (s: string) => {
  if (s === "ACTIVE") return "bg-[#28A745]/10 text-[#28A745]";
  if (s === "EXPIRED") return "bg-[#DC3545]/10 text-[#DC3545]";
  return "bg-[#FFC107]/10 text-[#856404]";
};

function AddCredentialForm({ practitionerId, providerId, onDone }: { practitionerId: string; providerId: string; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (_prev: unknown, fd: FormData) => {
    const result = await addCredentialAction(_prev, fd);
    if (!result?.error) { onDone(); router.refresh(); }
    return result;
  }, null);

  return (
    <form action={action} className="mt-2 grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded border">
      <input type="hidden" name="practitionerId" value={practitionerId} />
      <input type="hidden" name="providerId" value={providerId} />
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Document Type</label>
        <input name="documentType" required placeholder="e.g. LICENSE" className="w-full border p-1.5 rounded text-xs" />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Expiry Date</label>
        <input name="expiryDate" type="date" required className="w-full border p-1.5 rounded text-xs" />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Notes</label>
        <input name="notes" placeholder="Optional" className="w-full border p-1.5 rounded text-xs" />
      </div>
      {state?.error && <p className="col-span-3 text-xs text-red-600">{state.error}</p>}
      <div className="col-span-3 flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="text-xs text-gray-500 hover:underline">Cancel</button>
        <button type="submit" disabled={pending} className="px-3 py-1 text-xs bg-brand-indigo text-white rounded font-bold flex items-center gap-1 disabled:opacity-60">
          <Save size={12} /> {pending ? "Saving…" : "Save Credential"}
        </button>
      </div>
    </form>
  );
}

function PractitionerRow({ link, providerId }: { link: Practitioner; providerId: string }) {
  const router = useRouter();
  const [addingCred, setAddingCred] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { practitioner: p } = link;
  const hasExpired = p.credentials.some(c => c.status === "EXPIRED");
  const activeCredCount = p.credentials.filter(c => c.status === "ACTIVE").length;

  const handleUnlink = () => {
    if (!confirm(`Unlink ${p.firstName} ${p.lastName} from this provider?`)) return;
    startTransition(async () => {
      await unlinkPractitionerAction(providerId, p.id);
      router.refresh();
    });
  };

  return (
    <div className={`border rounded-lg p-4 ${hasExpired ? "border-[#DC3545]/30 bg-[#DC3545]/5" : "border-[#EEEEEE] bg-white"}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-indigo/10 text-brand-indigo flex items-center justify-center font-bold text-sm shrink-0">
            {p.firstName[0]}{p.lastName[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-text-heading">{p.firstName} {p.lastName}</span>
              {link.isPrimary && <span className="text-[10px] bg-brand-indigo/10 text-brand-indigo px-2 py-0.5 rounded-full font-bold">PRIMARY</span>}
              {hasExpired && <AlertTriangle size={14} className="text-[#DC3545]" />}
            </div>
            <p className="text-xs text-brand-text-muted mt-0.5">{p.licenseType} · {p.licenseNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddingCred(v => !v)} className="text-xs px-2.5 py-1 bg-[#17A2B8]/10 text-[#17A2B8] rounded font-bold hover:bg-[#17A2B8] hover:text-white transition-colors flex items-center gap-1">
            <Plus size={11} /> Credential
          </button>
          <button onClick={handleUnlink} disabled={isPending} className="p-1.5 text-red-400 hover:bg-red-50 rounded disabled:opacity-40">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {p.credentials.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {p.credentials.map(c => (
            <div key={c.id} className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 ${statusColor(c.status)}`}>
              <span className="font-semibold">{c.documentType}</span>
              <span>· expires {new Date(c.expiryDate).toLocaleDateString("en-UG")}</span>
            </div>
          ))}
        </div>
      )}
      {p.credentials.length === 0 && (
        <p className="mt-2 text-xs text-[#DC3545] font-semibold">No credentials on file — add one to enable claim approvals.</p>
      )}
      {activeCredCount === 0 && p.credentials.length > 0 && (
        <p className="mt-2 text-xs text-[#DC3545] font-semibold flex items-center gap-1"><AlertTriangle size={12} /> All credentials expired — claims will be blocked.</p>
      )}

      {addingCred && (
        <AddCredentialForm practitionerId={p.id} providerId={providerId} onDone={() => setAddingCred(false)} />
      )}
    </div>
  );
}

export function ProviderPractitionersCard({
  providerId,
  practitioners,
}: {
  providerId: string;
  practitioners: Practitioner[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<"new" | "existing" | null>(null);

  const [newState, newAction, creatingNew] = useActionState(async (_prev: unknown, fd: FormData) => {
    const result = await createPractitionerAndLinkAction(_prev, fd);
    if (!result?.error) { setAdding(null); router.refresh(); }
    return result;
  }, null);

  const [linkState, linkAction, linking] = useActionState(async (_prev: unknown, fd: FormData) => {
    const result = await linkExistingPractitionerAction(_prev, fd);
    if (!result?.error) { setAdding(null); router.refresh(); }
    return result;
  }, null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
        <div className="flex items-center gap-2">
          <UserCheck size={18} className="text-brand-indigo" />
          <h2 className="font-bold text-brand-text-heading font-heading">Practitioners</h2>
          <span className="text-xs bg-[#EEEEEE] text-brand-text-muted px-2 py-0.5 rounded-full font-bold">{practitioners.length}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAdding(adding === "existing" ? null : "existing")} disabled={adding !== null}
            className="text-xs px-3 py-1.5 border border-brand-indigo text-brand-indigo rounded font-bold hover:bg-brand-indigo hover:text-white transition-colors disabled:opacity-50">
            Link Existing
          </button>
          <button onClick={() => setAdding(adding === "new" ? null : "new")} disabled={adding !== null}
            className="text-xs px-3 py-1.5 bg-brand-indigo text-white rounded font-bold hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center gap-1">
            <Plus size={13} /> New Practitioner
          </button>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {adding === "new" && (
          <form action={newAction} className="border border-[#EEEEEE] rounded-lg p-4 space-y-3 bg-gray-50">
            <input type="hidden" name="providerId" value={providerId} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">First Name</label>
                <input name="firstName" required className="w-full border p-2 rounded text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Last Name</label>
                <input name="lastName" required className="w-full border p-2 rounded text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">License Type</label>
                <input name="licenseType" required placeholder="e.g. MBCHB, RN, BDS" className="w-full border p-2 rounded text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">License Number</label>
                <input name="licenseNumber" required className="w-full border p-2 rounded text-sm" />
              </div>
            </div>
            {newState?.error && <p className="text-xs text-red-600">{newState.error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setAdding(null)} className="text-sm text-gray-500 hover:underline flex items-center gap-1"><X size={14} /> Cancel</button>
              <button type="submit" disabled={creatingNew} className="px-4 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold disabled:opacity-60">
                {creatingNew ? "Creating…" : "Create & Link"}
              </button>
            </div>
          </form>
        )}

        {adding === "existing" && (
          <form action={linkAction} className="border border-[#EEEEEE] rounded-lg p-4 space-y-3 bg-gray-50">
            <input type="hidden" name="providerId" value={providerId} />
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">License Number</label>
              <input name="licenseNumber" required placeholder="Enter exact license number" className="w-full border p-2 rounded text-sm" />
            </div>
            {linkState?.error && <p className="text-xs text-red-600">{linkState.error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setAdding(null)} className="text-sm text-gray-500 hover:underline flex items-center gap-1"><X size={14} /> Cancel</button>
              <button type="submit" disabled={linking} className="px-4 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold disabled:opacity-60">
                {linking ? "Linking…" : "Link Practitioner"}
              </button>
            </div>
          </form>
        )}

        {practitioners.map(link => (
          <PractitionerRow key={link.practitionerId} link={link} providerId={providerId} />
        ))}

        {practitioners.length === 0 && adding === null && (
          <div className="text-center py-8 border-2 border-dashed border-[#EEEEEE] rounded-lg text-brand-text-muted">
            <UserCheck size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No practitioners linked to this facility yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
