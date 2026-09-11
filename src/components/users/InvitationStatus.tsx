"use client";

/**
 * Family Hospital UAT plan P05.04 step 2 — an account's setup-link state, as
 * both administration lists show it: delivery status, when, the expiry, and a
 * permission-gated "Resend link". The token is never shown (the server never
 * has it after sending).
 */
import { useActionState } from "react";

export interface InvitationStateView {
  status: "PENDING" | "SENT" | "FAILED" | "EXPIRED" | "USED" | "REVOKED";
  issuedAt: string;
  lastAttemptAt: string | null;
  expiresAt: string;
  failureClass: string | null;
}

type ResendResult = { error?: string; ok?: boolean | string; message?: string };

const FAILURE_WORDS: Record<string, string> = {
  CONFIG: "mail is not configured",
  ORIGIN: "the portal address is not configured",
  AUTH: "the mail server refused our sign-in",
  CONNECTION: "the mail server could not be reached",
  TIMEOUT: "the mail server did not answer in time",
  REJECTED: "the mail server rejected the message",
  UNKNOWN: "an unknown error",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-UG", { timeZone: "Africa/Kampala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function describeInvitation(state: InvitationStateView | null): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (!state) return { label: "No setup link sent yet", tone: "warn" };
  switch (state.status) {
    case "SENT":
      return { label: `Setup link sent ${when(state.lastAttemptAt)} · expires ${when(state.expiresAt)}`, tone: "ok" };
    case "PENDING":
      return { label: `Setup link being sent (${when(state.issuedAt)})`, tone: "muted" };
    case "FAILED":
      return { label: `Delivery failed ${when(state.lastAttemptAt)} — ${FAILURE_WORDS[state.failureClass ?? "UNKNOWN"] ?? FAILURE_WORDS.UNKNOWN}`, tone: "bad" };
    case "EXPIRED":
      return { label: `Setup link expired ${when(state.expiresAt)}`, tone: "warn" };
    case "REVOKED":
      return { label: "Setup link replaced", tone: "muted" };
    case "USED":
      return { label: "Account set up", tone: "ok" };
  }
}

const TONE = {
  ok: "text-[#1E7B34]",
  warn: "text-[#856404]",
  bad: "text-[#DC3545]",
  muted: "text-brand-text-muted",
} as const;

export function InvitationStatus<R extends ResendResult>({
  userId,
  state,
  canResend,
  resendAction,
  extraFields,
}: {
  userId: string;
  state: InvitationStateView | null;
  canResend: boolean;
  resendAction: (prev: R | null, formData: FormData) => Promise<R | null>;
  /** Hidden fields a dispatcher action needs (e.g. `_op`). */
  extraFields?: Record<string, string>;
}) {
  const [result, action, pending] = useActionState<R | null, FormData>(resendAction, null);
  const d = describeInvitation(state);
  return (
    <div className="space-y-1 text-[11px]">
      <p className={TONE[d.tone]}>{d.label}</p>
      {canResend ? (
        <form action={action}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="targetUserId" value={userId} />
          {Object.entries(extraFields ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button type="submit" disabled={pending} className="font-semibold text-brand-indigo underline disabled:opacity-50">
            {pending ? "Sending…" : "Resend link"}
          </button>
        </form>
      ) : null}
      {result?.message ? <p role="status" className="text-brand-text-body">{result.message}</p> : null}
      {typeof result?.ok === "string" ? <p role="status" className="text-brand-text-body">{result.ok}</p> : null}
      {result?.error ? <p role="alert" className="text-[#DC3545]">{result.error}</p> : null}
    </div>
  );
}
