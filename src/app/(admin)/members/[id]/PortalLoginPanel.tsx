"use client";

import { useActionState } from "react";
import { createMemberPortalUserAction, resetMemberPortalPasswordAction } from "./portal/actions";

interface Props {
  memberId: string;
  defaultEmail: string | null;
  portalUser: { email: string; isActive: boolean } | null;
}

export function PortalLoginPanel({ memberId, defaultEmail, portalUser }: Props) {
  const [createState, createAction, createPending] = useActionState(createMemberPortalUserAction.bind(null, memberId), null);
  const [resetState, resetAction, resetPending] = useActionState(resetMemberPortalPasswordAction.bind(null, memberId), null);
  const input = "border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-bold text-avenue-text-heading">Member Portal Login</h3>
        <p className="text-xs text-avenue-text-muted mt-0.5">Create or reset the member self-service account from inside the app.</p>
      </div>
      {portalUser ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-avenue-text-heading">{portalUser.email}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${portalUser.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#DC3545]/10 text-[#DC3545]"}`}>
              {portalUser.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          {resetState?.error && <p className="text-xs text-[#DC3545]">{resetState.error}</p>}
          <form action={resetAction} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-xs font-bold uppercase text-avenue-text-muted">New Temporary Password</span>
              <input name="password" type="password" minLength={8} required className={input} />
            </label>
            <button disabled={resetPending} className="px-4 py-2 rounded-full bg-avenue-indigo text-white text-xs font-bold hover:bg-avenue-secondary disabled:opacity-50">
              {resetPending ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        </div>
      ) : (
        <form action={createAction} className="grid md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          {createState?.error && <p className="md:col-span-3 text-xs text-[#DC3545]">{createState.error}</p>}
          <label className="space-y-1">
            <span className="block text-xs font-bold uppercase text-avenue-text-muted">Login Email</span>
            <input name="email" type="email" required defaultValue={defaultEmail ?? ""} className={input} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold uppercase text-avenue-text-muted">Temporary Password</span>
            <input name="password" type="password" minLength={8} required className={input} />
          </label>
          <button disabled={createPending} className="px-4 py-2 rounded-full bg-avenue-indigo text-white text-xs font-bold hover:bg-avenue-secondary disabled:opacity-50">
            {createPending ? "Creating..." : "Create Login"}
          </button>
        </form>
      )}
    </div>
  );
}
