"use client";

/**
 * Family Hospital UAT plan P05.03 — the small client boundary of account setup.
 *
 * 1. On arrival it reads the token from the URL fragment and immediately removes
 *    the fragment with `history.replaceState`, so the token does not stay in the
 *    address bar, the history entry or a bookmark.
 * 2. It asks a Server Action whether the link can be used — yes or no, nothing
 *    about the account.
 * 3. It collects the password twice under the existing policy and sends it with
 *    the token; the server checks everything again and redirects on success.
 *
 * The token lives in a ref: it is never put in component state, a form field,
 * the page's HTML or a message. Every unusable link — used, replaced, expired,
 * altered — gets the same answer and a way to ask for a new link.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { isControlFlowError } from "@/lib/mutation-contract";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { checkSetupLinkAction, completeAccountSetupAction, requestNewSetupLinkAction } from "./actions";

type Phase = "checking" | "ready" | "invalid";

const INPUT =
  "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal";
const LABEL = "text-xs font-semibold uppercase text-brand-text-muted";

/** The token from `#token=…`, or null. */
function tokenFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const token = params.get("token");
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function AccountSetupForm() {
  const tokenRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const problemRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const token = tokenFromFragment(window.location.hash);
    // Remove the fragment at once — whether or not it held a usable token.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    tokenRef.current = token;
    let cancelled = false;
    (async () => {
      const valid = token ? (await checkSetupLinkAction(token).catch(() => ({ valid: false }))).valid : false;
      if (!cancelled) setPhase(valid ? "ready" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !tokenRef.current) return;
    setProblem(null);
    const token = tokenRef.current;
    startTransition(async () => {
      try {
        const res = await completeAccountSetupAction({ token, password, confirm });
        // Success redirects to sign-in; only a refusal comes back.
        if (res && !res.ok) {
          if (res.invalidLink) {
            tokenRef.current = null;
            setPassword("");
            setConfirm("");
            setPhase("invalid");
          } else {
            setProblem(res.message);
            requestAnimationFrame(() => problemRef.current?.focus());
          }
        }
      } catch (err) {
        if (isControlFlowError(err)) throw err;
        setProblem("We could not reach the server. Check your connection and try again.");
      }
    });
  }

  function requestLink(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await requestNewSetupLinkAction(email).catch(() => undefined);
      setRequested(true);
    });
  }

  if (phase === "checking") {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-brand-text-muted" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking your link…
      </p>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="mt-6 space-y-4">
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-[#DC3545]/30 bg-[#DC3545]/5 px-4 py-3 text-sm text-[#DC3545]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            This setup link is not valid any more. It may have been used already, replaced by a newer one, or expired.
          </span>
        </div>
        {requested ? (
          <p role="status" className="rounded-lg border border-[#28A745]/30 bg-[#28A745]/10 px-4 py-3 text-sm text-[#1E7B34]">
            If an invitation is waiting for that address, a new link is on its way. It expires in 24 hours. You can also ask your administrator to send one.
          </p>
        ) : (
          <form onSubmit={requestLink} className="space-y-3 rounded-lg border border-brand-border bg-brand-bg p-5">
            <p className="text-sm text-brand-text-body">Ask for a new link, sent to the address you were invited on.</p>
            <div>
              <label className={LABEL} htmlFor="setup-email">Email address</label>
              <input id="setup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
            </div>
            <button type="submit" disabled={pending || !email.trim()} className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50">
              {pending ? "Sending…" : "Send me a new link"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-brand-border bg-brand-bg p-5" noValidate>
      <div>
        <label className={LABEL} htmlFor="setup-password">New password</label>
        <input
          id="setup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="setup-password-hint"
          className={INPUT}
        />
        <p id="setup-password-hint" className="mt-1 text-[11px] text-brand-text-muted">
          At least {PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter and a digit.
        </p>
      </div>
      <div>
        <label className={LABEL} htmlFor="setup-confirm">Type it again</label>
        <input id="setup-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} />
      </div>
      {problem ? (
        <p ref={problemRef} tabIndex={-1} role="alert" className="text-sm font-semibold text-[#DC3545] focus:outline-none">
          {problem}
        </p>
      ) : null}
      <button type="submit" disabled={pending || !password || !confirm} className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50">
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
