"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

const inputCls =
  "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
const labelCls = "text-xs font-semibold text-brand-text-muted uppercase";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);

  return (
    <form action={action} className="mt-6 space-y-4 rounded-lg border border-brand-border bg-brand-bg p-5">
      <div>
        <label className={labelCls} htmlFor="currentPassword">Temporary password</label>
        <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="newPassword">New password</label>
        <input id="newPassword" name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={inputCls} />
        <p className="mt-1 text-[11px] text-brand-text-muted">Min. 10 characters incl. an uppercase letter, a lowercase letter and a digit.</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="confirmPassword">Confirm new password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" className={inputCls} />
      </div>
      {state?.error && <p className="text-xs text-brand-error" role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50">
        {pending ? "Saving…" : "Set password & continue"}
      </button>
    </form>
  );
}
