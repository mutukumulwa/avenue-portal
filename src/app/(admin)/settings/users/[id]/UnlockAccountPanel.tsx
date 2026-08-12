"use client";

/**
 * UAT-HF P10.02 — the operator-facing unlock the run could not find.
 *
 * DEF-010's collateral: "lockout_test, password_reset_test, medical_officer and
 * finance_officer were locked, and no operator-facing unlock path was found in
 * the product."
 *
 * Shown only when there is something to release, so it is not a standing button
 * inviting a click. The reason is mandatory — DEC-11 asks for a *documented*
 * path back, and an unlock with no recorded why is not documented.
 */

import { useActionState } from "react";
import { LockOpen, AlertCircle, CheckCircle2 } from "lucide-react";
import { unlockUserAccountAction } from "@/app/(admin)/settings/actions";

export function UnlockAccountPanel({
  userId,
  lockLive,
  failedAttempts,
}: {
  userId: string;
  lockLive: boolean;
  failedAttempts: number;
}) {
  const [state, action, pending] = useActionState(unlockUserAccountAction, null);

  // Nothing to release: no panel. A permanently visible unlock button on an
  // account that is not locked is noise, and invites an unnecessary audit row.
  if (!lockLive && failedAttempts === 0) return null;

  if (state?.ok) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#28A745]/30 bg-[#28A745]/5 px-3 py-2 text-sm text-[#1E7E34]">
        <CheckCircle2 size={15} className="shrink-0" />
        Sign-in lock cleared. Their password is unchanged — they sign in with the one they already
        have.
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-lg border border-[#EEEEEE] bg-[#F8F9FA] p-3">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs text-brand-text-muted">
        {lockLive
          ? "This account is locked and cannot sign in until the lock is released or expires."
          : `${failedAttempts} recent failed attempt${failedAttempts === 1 ? "" : "s"}. Clearing them resets the count before it reaches a lock.`}
      </p>
      <label className="mt-2 block text-xs font-bold uppercase text-brand-text-muted" htmlFor="unlock-reason">
        Reason (recorded in the audit trail)
      </label>
      <input
        id="unlock-reason"
        name="reason"
        required
        minLength={5}
        placeholder="e.g. Confirmed identity by phone; mistyped password"
        className="mt-1 w-full rounded-lg border border-[#EEEEEE] bg-white px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none"
      />
      {state?.error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-[#DC3545]">
          <AlertCircle size={13} className="shrink-0" />
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-secondary disabled:opacity-50"
      >
        <LockOpen size={13} />
        {pending ? "Clearing…" : "Clear sign-in lock"}
      </button>
      <p className="mt-1.5 text-[10px] text-brand-text-muted">
        This releases the lock only. It does not change their password or sign them out — use Reset
        password if the credentials themselves are in doubt.
      </p>
    </form>
  );
}
