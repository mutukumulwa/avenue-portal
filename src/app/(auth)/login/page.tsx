"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Lock, Mail, AlertCircle } from "lucide-react";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function safeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      return;
    }

    // Route to the right portal based on role — fetch session to check
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;
    const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

    if (callbackUrl) {
      router.push(callbackUrl);
      return;
    }

    if (role === "BROKER_USER") {
      router.push("/broker/dashboard");
    } else if (role === "MEMBER_USER") {
      router.push("/member/dashboard");
    } else if (role === "HR_MANAGER") {
      router.push("/hr/dashboard");
    } else if (role === "FUND_ADMINISTRATOR") {
      router.push("/fund/dashboard");
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-avenue-bg-alt/50 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-avenue-indigo rounded-full" />
            <h1 className="text-3xl font-bold font-heading text-avenue-indigo">
              AiCare Platform
            </h1>
          </div>
        </div>

        <Card className="shadow-lg border-t-4 border-t-avenue-indigo">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Enter your Avenue Healthcare credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/20 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-avenue-text-heading">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-avenue-text-muted">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white border border-[#EEEEEE] text-avenue-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-avenue-indigo focus:border-avenue-indigo block w-full pl-10 p-2.5 outline-none transition-all"
                    placeholder="name@avenue.co.ke"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-avenue-text-heading">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-avenue-text-muted">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white border border-[#EEEEEE] text-avenue-text-heading text-sm rounded-[8px] focus:ring-2 focus:ring-avenue-indigo focus:border-avenue-indigo block w-full pl-10 p-2.5 outline-none transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-avenue-indigo hover:bg-avenue-secondary text-white font-bold py-3 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>

              <p className="text-center text-xs text-avenue-text-muted pt-1">
                Admin: admin@avenue.co.ke · HR: emily.wambui@safaricom.co.ke
                <br />Broker: broker@kaib.co.ke · Member: member@avenue.co.ke
                <br />Password: <span className="font-mono">AvenueAdmin2024!</span>
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
    <Suspense fallback={<div className="min-h-screen bg-avenue-bg-alt/50" />}>
      <LoginForm />
    </Suspense>
  );
}
