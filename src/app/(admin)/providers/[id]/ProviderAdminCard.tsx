import { ShieldCheck, ShieldAlert, Pencil } from "lucide-react";
import { PendingButton } from "@/components/ui/PendingButton";
import { updateProviderMasterAction, setProviderStatusAction } from "./actions";

/**
 * PR-006: provider status lifecycle + master-data edit surface.
 * Ratified semantics: PENDING = registered, not operationally selectable;
 * ACTIVE = selectable everywhere; SUSPENDED = new encounters blocked, existing
 * claims still settleable. All changes audited with reasons/diffs.
 */
export function ProviderAdminCard({
  provider,
}: {
  provider: {
    id: string;
    name: string;
    contractStatus: string;
    phone: string | null;
    email: string | null;
    contactPerson: string | null;
    address: string | null;
    county: string | null;
  };
}) {
  const status = provider.contractStatus;
  const inp = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo";
  const lbl = "text-xs font-bold text-brand-text-muted uppercase block mb-1";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Status &amp; Administration</h2>
        <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${
          status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" :
          status === "PENDING" ? "bg-[#FFC107]/15 text-[#856404]" :
          "bg-[#DC3545]/10 text-[#DC3545]"
        }`}>
          {status}
        </span>
      </div>

      {status === "PENDING" && (
        <p className="text-xs text-[#856404] bg-[#FFF8E1] border border-[#FFC107]/40 rounded-lg px-3 py-2">
          PENDING providers do not appear in claim, pre-auth, check-in or offline-code selectors.
          Activate the provider once onboarding checks are complete.
        </p>
      )}
      {status === "SUSPENDED" && (
        <p className="text-xs text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded-lg px-3 py-2">
          SUSPENDED — new encounters are blocked; existing claims remain settleable.
        </p>
      )}

      {/* Status transitions with mandatory reason */}
      <div className="flex flex-wrap gap-2">
        {status !== "ACTIVE" && (
          <form action={setProviderStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="providerId" value={provider.id} />
            <input type="hidden" name="status" value="ACTIVE" />
            <input name="reason" required minLength={5} placeholder="Activation reason…" className="rounded-lg border border-[#EEEEEE] px-2 py-1.5 text-sm" />
            <PendingButton className="inline-flex items-center gap-1.5 rounded-full bg-[#28A745] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#218838]">
              <ShieldCheck size={13} /> Activate
            </PendingButton>
          </form>
        )}
        {status === "ACTIVE" && (
          <form action={setProviderStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="providerId" value={provider.id} />
            <input type="hidden" name="status" value="SUSPENDED" />
            <input name="reason" required minLength={5} placeholder="Suspension reason…" className="rounded-lg border border-[#EEEEEE] px-2 py-1.5 text-sm" />
            <PendingButton className="inline-flex items-center gap-1.5 rounded-full border border-[#DC3545] px-4 py-1.5 text-xs font-bold text-[#DC3545] hover:bg-[#DC3545]/10">
              <ShieldAlert size={13} /> Suspend
            </PendingButton>
          </form>
        )}
      </div>

      {/* Master data edit (PR-006 #1) */}
      <details className="rounded-lg border border-[#EEEEEE] bg-[#F8F9FA]">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-brand-indigo flex items-center gap-2">
          <Pencil size={14} /> Edit provider details
        </summary>
        <form action={updateProviderMasterAction} className="grid grid-cols-2 gap-3 p-4 pt-2">
          <input type="hidden" name="providerId" value={provider.id} />
          <div className="col-span-2">
            <label className={lbl}>Name</label>
            <input name="name" defaultValue={provider.name} required className={inp} />
          </div>
          <div>
            <label className={lbl}>Phone</label>
            <input name="phone" defaultValue={provider.phone ?? ""} className={inp} />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input name="email" type="email" defaultValue={provider.email ?? ""} className={inp} />
          </div>
          <div>
            <label className={lbl}>Contact person</label>
            <input name="contactPerson" defaultValue={provider.contactPerson ?? ""} className={inp} />
          </div>
          <div>
            <label className={lbl}>County</label>
            <input name="county" defaultValue={provider.county ?? ""} className={inp} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Address</label>
            <input name="address" defaultValue={provider.address ?? ""} className={inp} />
          </div>
          <div className="col-span-2">
            <PendingButton className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
              Save changes
            </PendingButton>
          </div>
        </form>
      </details>
    </div>
  );
}
