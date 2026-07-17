"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTotpEnrolmentAction, confirmTotpAction, disableTotpAction } from "./actions";

export function SecurityManager({ enabled, mandatory = false }: { enabled: boolean; mandatory?: boolean }) {
  const router = useRouter();
  const [enrol, setEnrol] = useState<{ secret: string; uri: string } | null>(null);
  const [pending, start] = useTransition();
  const [confState, confirmAction, confPending] = useActionState(confirmTotpAction, null);

  const beginEnrolment = () =>
    start(async () => {
      const res = await startTotpEnrolmentAction();
      if (!res.error) setEnrol({ secret: res.secret, uri: res.uri });
    });

  const disable = () =>
    start(async () => {
      await disableTotpAction();
      router.refresh();
    });

  if (enabled) {
    return (
      <div className="rounded-lg border border-brand-border bg-brand-bg p-6">
        <p className="text-sm font-medium text-brand-success">✓ Two-factor authentication is ON.</p>
        <p className="mt-1 text-sm text-brand-text-muted">
          You&apos;ll be asked for a 6-digit code from your authenticator at sign-in.
        </p>
        {mandatory ? (
          // WP-8 (DEC-09): compulsory for this role — the server refuses the
          // disable action too; the UI simply doesn't offer it.
          <p className="mt-4 text-xs font-semibold text-brand-text-muted">
            Two-step sign-in is required for your role and cannot be disabled.
          </p>
        ) : (
          <button
            onClick={disable}
            disabled={pending}
            className="mt-4 rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-brand-error hover:bg-brand-bg-alt disabled:opacity-50"
          >
            {pending ? "Disabling…" : "Disable 2FA"}
          </button>
        )}
      </div>
    );
  }

  if (confState?.enabled) {
    return (
      <div className="rounded-lg border border-brand-success/30 bg-brand-success/10 p-6 text-sm text-brand-success">
        ✓ Two-factor authentication is now enabled.{" "}
        <button onClick={() => router.refresh()} className="font-semibold underline">Done</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg p-6">
      {!enrol ? (
        <>
          <p className="text-sm text-brand-text-muted">
            Protect your account with a time-based one-time code.
          </p>
          <button
            onClick={beginEnrolment}
            disabled={pending}
            className="mt-4 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50"
          >
            {pending ? "Preparing…" : "Set up 2FA"}
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-brand-text-heading">1. Add to your authenticator app</p>
            <p className="mt-1 text-xs text-brand-text-muted">
              Scan the setup URI, or enter this key manually:
            </p>
            <code className="mt-2 block break-all rounded-md bg-brand-bg-alt px-3 py-2 font-mono text-sm text-brand-text-heading">
              {enrol.secret}
            </code>
            <code className="mt-2 block break-all rounded-md bg-brand-bg-alt px-3 py-2 font-mono text-[11px] text-brand-text-muted">
              {enrol.uri}
            </code>
          </div>
          <form action={confirmAction} className="space-y-2">
            <p className="text-sm font-medium text-brand-text-heading">2. Enter the 6-digit code to confirm</p>
            <input
              name="code"
              inputMode="numeric"
              maxLength={6}
              required
              className="w-40 rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
              placeholder="123456"
            />
            {confState?.error && <p className="text-xs text-brand-error">{confState.error}</p>}
            <div>
              <button
                disabled={confPending}
                className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50"
              >
                {confPending ? "Verifying…" : "Enable 2FA"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
