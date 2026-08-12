"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { SESSION_EXPIRED_REASON, SIGN_IN_RECOVERY_GUIDANCE } from "@/lib/session-policy";
import { DraftPurgeOnSignOut } from "@/components/forms/DraftPurgeOnSignOut";

function safeCallbackUrl(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/login")
  ) {
    return null;
  }
  return value;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  // DEF-004: the form relied on browser-native "Please fill in this field"
  // bubbles, which are transient, unstyled, not announced by screen readers and
  // vanish on blur. Validation state is now owned by the component so each
  // invalid field carries a persistent, associated, announced message.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // DEF-010: when a protected surface (or its client session guard) bounces an
  // expired idle session back here it carries ?reason=expired. Surface WHY the
  // user is looking at the sign-in screen instead of dropping them here silently.
  const sessionExpired = searchParams.get("reason") === SESSION_EXPIRED_REASON;

  /** Field-level validation. Deliberately says nothing about account existence. */
  const validate = () => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "Enter a valid email address, for example name@medvex.co.ug.";
    if (!password) next.password = "Enter your password.";
    return next;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const invalid = validate();
    setFieldErrors(invalid);
    if (Object.keys(invalid).length > 0) {
      // Focus moves to the first invalid field so keyboard and screen-reader
      // users are placed on the problem rather than left at the submit button.
      (invalid.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setLoading(true);
    const startedAt = performance.now();

    // OBS-K1: an upstream rate-limit can swallow the sign-in request entirely.
    // Bound the wait and surface a human-readable message instead of hanging.
    let result: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      result = await Promise.race([
        signIn("credentials", { email, password, totp, redirect: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("SIGNIN_TIMEOUT")), 20_000),
        ),
      ]);
    } catch {
      setLoading(false);
      setError(
        "We couldn't reach the sign-in service. This can happen after several rapid attempts — wait a minute, then try again.",
      );
      return;
    }

    setLoading(false);
    console.info(`[perf] login.signIn: ${(performance.now() - startedAt).toFixed(1)}ms`);

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      return;
    }

    const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

    // BD-03: navigate with a full document load, not a client-side router push.
    // `/post-login` is now an HTTP redirect route handler (not an RSC page), so
    // the browser must GET it and follow the 307 — a client `router.replace`
    // would try to prefetch it as an RSC payload, the exact path that 503'd and
    // stranded logins. `window.location` also guarantees the freshly-minted
    // session cookie is sent on the redirect request.
    setLoading(true);
    window.location.assign(callbackUrl ?? "/post-login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg-alt/50 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-brand-indigo rounded-full" />
            <h1 className="text-3xl font-bold font-heading text-brand-indigo">
              Medvex
            </h1>
          </div>
        </div>

        <Card className="shadow-lg border-t-4 border-t-brand-indigo">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Enter your Medvex credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Authorized-users-only notice (R32 / H-09) */}
            <p className="mb-4 rounded-md border border-brand-border bg-brand-bg-alt/60 px-3 py-2 text-center text-[11px] leading-snug text-brand-text-muted">
              Authorized users only. This is a private Medvex system. Access is
              monitored and logged; unauthorized use is prohibited and may be
              prosecuted.
            </p>
            {/* DEF-010: idle-timeout notice. Distinct from a failed sign-in — it
                explains that the previous session expired, not that credentials
                were wrong. */}
            {sessionExpired && !error && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 rounded-lg border border-[#FFC107]/40 bg-[#FFC107]/10 px-4 py-3 text-sm text-[#856404]"
              >
                <AlertCircle size={16} className="shrink-0" />
                Your session timed out after a period of inactivity. Please sign in again. Any
                unsaved work on the previous screen was not kept.
              </div>
            )}
            {/* noValidate: validation is owned by the component so errors are
                persistent, associated and announced (DEF-004). */}
            <form onSubmit={handleLogin} className="space-y-5" noValidate>
              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="flex items-center gap-2 bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/20 rounded-lg px-4 py-3 text-sm"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>
                    {error}
                    {/*
                      UAT-HF P10.02 / DEC-11 — DEF-010. The primary line above
                      stays enumeration-safe and unchanged; this guidance is
                      shown IDENTICALLY after every failed attempt, so it cannot
                      reveal whether the account exists or is locked. It exists
                      because the run found a locked user with no way out and no
                      unlock path anywhere in the product.
                    */}
                    <span className="mt-1 block text-xs opacity-90">{SIGN_IN_RECOVERY_GUIDANCE}</span>
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-sm font-bold text-brand-text-heading">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-brand-text-muted">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="login-email"
                    name="email"
                    ref={emailRef}
                    type="email"
                    autoComplete="username"
                    required
                    aria-required="true"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={fieldErrors.email ? true : false}
                    aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                    className={`bg-white border text-brand-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo block w-full pl-10 p-2.5 outline-none transition-all ${
                      fieldErrors.email ? "border-[#DC3545]" : "border-[#EEEEEE]"
                    }`}
                    placeholder="name@medvex.co.ug"
                  />
                </div>
                {fieldErrors.email && (
                  <p id="login-email-error" role="alert" className="text-xs text-[#DC3545]">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-sm font-bold text-brand-text-heading">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-brand-text-muted">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    id="login-password"
                    name="password"
                    ref={passwordRef}
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-required="true"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={fieldErrors.password ? true : false}
                    aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                    className={`bg-white border text-brand-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo block w-full pl-10 p-2.5 outline-none transition-all ${
                      fieldErrors.password ? "border-[#DC3545]" : "border-[#EEEEEE]"
                    }`}
                    placeholder="••••••••"
                  />
                </div>
                {fieldErrors.password && (
                  <p id="login-password-error" role="alert" className="text-xs text-[#DC3545]">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-totp" className="block text-sm font-bold text-brand-text-heading">
                  Authenticator code{" "}
                  <span className="font-normal text-brand-text-muted">(if 2FA enabled)</span>
                </label>
                {/* Correctly optional: users without 2FA must not be blocked. */}
                <input
                  id="login-totp"
                  name="totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  aria-describedby="login-totp-hint"
                  className="bg-white border border-[#EEEEEE] text-brand-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo block w-full p-2.5 outline-none transition-all"
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                />
                <p id="login-totp-hint" className="text-xs text-brand-text-muted">
                  Leave blank if you have not set up an authenticator app.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full bg-brand-indigo hover:bg-brand-secondary text-white font-bold py-3 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:ring-offset-2"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>

              <p className="text-center pt-1">
                <a href="/reset" className="text-xs text-brand-secondary hover:underline">Forgot password?</a>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-bg-alt/50" />}>
      {/* UAT-HF P04.02: reaching sign-in means nobody holds this tab, so no
          form draft from the previous session may survive into the next. */}
      <DraftPurgeOnSignOut />
      <LoginForm />
    </Suspense>
  );
}
