"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const startedAt = performance.now();

    const result = await signIn("credentials", {
      email,
      password,
      totp,
      redirect: false,
    });

    setLoading(false);
    console.info(`[perf] login.signIn: ${(performance.now() - startedAt).toFixed(1)}ms`);

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      return;
    }

    const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

    router.replace(callbackUrl ?? "/post-login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg-alt/50 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-brand-indigo rounded-full" />
            <h1 className="text-3xl font-bold font-heading text-brand-indigo">
              AiCare Platform
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
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/20 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-brand-text-heading">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-brand-text-muted">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white border border-[#EEEEEE] text-brand-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo block w-full pl-10 p-2.5 outline-none transition-all"
                    placeholder="name@medvex.co.ug"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-brand-text-heading">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-brand-text-muted">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white border border-[#EEEEEE] text-brand-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo block w-full pl-10 p-2.5 outline-none transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-brand-text-heading">
                  Authenticator code <span className="font-normal text-brand-text-muted">(if 2FA enabled)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  className="bg-white border border-[#EEEEEE] text-brand-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo block w-full p-2.5 outline-none transition-all"
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-indigo hover:bg-brand-secondary text-white font-bold py-3 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>

              <p className="text-center pt-1">
                <a href="/reset" className="text-xs text-brand-secondary hover:underline">Forgot password?</a>
              </p>

              <p className="text-center text-xs text-brand-text-muted pt-1">
                Admin: admin@medvex.co.ug · HR: emily.wambui@safaricom.co.ke
                <br />Broker: broker@kaib.co.ke · Member: member@medvex.co.ug
                <br />Password: <span className="font-mono">MedvexAdmin2024!</span>
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
      <LoginForm />
    </Suspense>
  );
}
