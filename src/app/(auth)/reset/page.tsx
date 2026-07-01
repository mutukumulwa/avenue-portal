"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestResetAction, confirmResetAction } from "./actions";

export default function ResetPasswordPage() {
  const [reqState, requestAction, reqPending] = useActionState(requestResetAction, null);
  const [confState, confirmAction, confPending] = useActionState(confirmResetAction, null);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold text-brand-text-muted uppercase";

  return (
    <div className="mx-auto mt-16 max-w-md px-4">
      <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Reset password</h1>
      <p className="mt-1 text-sm text-brand-text-muted">
        We&apos;ll email you a 6-digit code. Enter it with your new password.
      </p>

      {confState?.done ? (
        <div className="mt-6 rounded-md border border-brand-success/30 bg-brand-success/10 px-4 py-3 text-sm text-brand-success">
          Password updated. You can now{" "}
          <Link href="/login" className="font-semibold underline">sign in</Link>.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Step 1 — request a code */}
          <form action={requestAction} className="space-y-3 rounded-lg border border-brand-border bg-brand-bg p-5">
            <div>
              <label className={labelCls} htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required className={inputCls} placeholder="name@medvex.co.ug" />
            </div>
            <button disabled={reqPending} className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50">
              {reqPending ? "Sending…" : "Send code"}
            </button>
            {reqState?.sent && (
              <p className="text-xs text-brand-success">If that email exists, a code is on its way.</p>
            )}
            {reqState?.error && <p className="text-xs text-brand-error">{reqState.error}</p>}
          </form>

          {/* Step 2 — confirm */}
          <form action={confirmAction} className="space-y-3 rounded-lg border border-brand-border bg-brand-bg p-5">
            <div>
              <label className={labelCls} htmlFor="c-email">Email</label>
              <input id="c-email" name="email" type="email" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="code">6-digit code</label>
              <input id="code" name="code" inputMode="numeric" maxLength={6} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="password">New password</label>
              <input id="password" name="password" type="password" required className={inputCls} />
              <p className="mt-1 text-[10px] text-brand-text-muted">Min 10 chars, with upper/lowercase and a digit.</p>
            </div>
            <button disabled={confPending} className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50">
              {confPending ? "Updating…" : "Reset password"}
            </button>
            {confState?.error && <p className="text-xs text-brand-error">{confState.error}</p>}
          </form>
        </div>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand-secondary hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
