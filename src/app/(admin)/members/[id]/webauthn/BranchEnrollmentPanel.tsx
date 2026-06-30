"use client";

import { useActionState } from "react";
import { Fingerprint } from "lucide-react";
import { createBranchEnrollmentApprovalAction } from "./actions";

export function BranchEnrollmentPanel({ memberId }: { memberId: string }) {
  const action = createBranchEnrollmentApprovalAction.bind(null, memberId);
  const [state, formAction, pending] = useActionState(action, null);
  const absoluteLink = state?.link && typeof window !== "undefined"
    ? `${window.location.origin}${state.link}`
    : null;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-indigo/10 text-brand-indigo">
          <Fingerprint className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-brand-text-heading">Branch-Assisted Device Enrollment</h3>
          <p className="mt-1 text-sm text-brand-text-muted">
            Generate a short-lived approval link after in-person verification. The member uses it to register their first secure check-in device.
          </p>
          <form action={formAction} className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              name="reason"
              placeholder="Verification notes, e.g. ID checked at reception"
              className="w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-brand-indigo"
            />
            <button
              disabled={pending}
              className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-bold text-white hover:bg-brand-secondary disabled:opacity-50"
            >
              {pending ? "Creating..." : "Create approval link"}
            </button>
          </form>
          {state?.error && <p className="mt-3 text-sm font-semibold text-brand-error">{state.error}</p>}
          {absoluteLink && (
            <div className="mt-4 rounded-md bg-brand-bg-alt p-3">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Member enrollment link</p>
              <p className="mt-1 break-all text-sm font-semibold text-brand-indigo">{absoluteLink}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
