"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { resetUserPasswordAction } from "./actions";
import { X } from "lucide-react";

interface ResetPasswordModalProps {
  userId: string;
  userName: string;
  userEmail: string;
}

/**
 * Per-row admin password reset (Settings → Users & Access). Credential only:
 * role/bindings stay locked down in the server action (BD-01), so this is safe
 * to offer on portal rows too. Mirrors the InviteUserModal idiom — close +
 * router.refresh() on `ok` (OBS-1) instead of a server redirect.
 */
export function ResetPasswordModal({ userId, userName, userEmail }: ResetPasswordModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: { error?: string; ok?: boolean } | null, formData: FormData) => {
      const res = await resetUserPasswordAction(prev, formData);
      // OBS-1 idiom: on success close + refresh (handled in the action callback,
      // not an effect, so no render-phase setState).
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
      return res;
    },
    null,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Set a new password for ${userName}`}
        className="text-xs font-bold text-brand-text-muted hover:text-brand-indigo transition-colors"
      >
        Reset password
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-brand-text-muted hover:text-brand-text-heading"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-brand-text-heading font-heading mb-1">Reset Password</h2>
            <p className="text-sm text-brand-text-body mb-4">
              {userName} <span className="text-brand-text-muted">({userEmail})</span>
            </p>

            {state?.error && (
              <div className="mb-4 px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
                {state.error}
              </div>
            )}

            <form action={action} className="space-y-4">
              <input type="hidden" name="userId" value={userId} />
              <div>
                <label htmlFor={`reset-pw-${userId}`} className="block text-xs font-bold text-brand-text-muted uppercase mb-1">New Password</label>
                <input
                  id={`reset-pw-${userId}`}
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  autoFocus
                  className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
                />
                <p className="text-[10px] text-brand-text-muted mt-1">
                  Min. 10 characters incl. an uppercase letter, a lowercase letter and a digit.
                </p>
              </div>
              <p className="text-[10px] text-brand-text-muted">
                The password is set immediately — no change-on-first-login is enforced. The user is
                signed out of any active session; share the new password securely and ask them to
                change it after signing in.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-brand-text-body border border-[#EEEEEE] rounded-full hover:bg-[#F8F9FA] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-5 py-2 text-sm font-semibold bg-brand-indigo hover:bg-brand-secondary text-white rounded-full transition-colors disabled:opacity-60"
                >
                  {pending ? "Resetting…" : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
