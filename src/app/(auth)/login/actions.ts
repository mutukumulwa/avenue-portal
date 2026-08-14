"use server";

import { headers } from "next/headers";
import { evaluateSignInStep, type SignInStep } from "@/lib/auth-challenge";
import { rateLimitKey } from "@/server/services/sign-in-rate-limit.service";

/**
 * UAT-HF P10.01 — DEF-011.
 *
 * The login form's first step. It answers one question — is an authenticator
 * code needed for this sign-in — and it answers it only for a caller who has
 * already proved the password.
 *
 * The rationale, the enumeration argument and the lockout coupling live in
 * `src/lib/auth-challenge.ts`, which is where the logic is and where it can be
 * unit-tested without next-auth. This file is only the boundary.
 *
 * NOTE for anyone editing: a `"use server"` module may export async functions
 * and nothing else. A `const` beside this one fails `next build` while passing
 * typecheck, lint and tests (see AGENTS.md).
 */
export async function beginSignInAction(
  email: string,
  password: string,
): Promise<{ step: SignInStep }> {
  if (!email?.trim() || !password) return { step: "REJECTED" };
  // UAT-HF P10.07. A server action has a reliable request context, so the
  // source address is read here and passed down rather than reached for inside
  // the auth library.
  const ip = rateLimitKey(await headers());
  return { step: await evaluateSignInStep(email.trim(), password, ip) };
}
