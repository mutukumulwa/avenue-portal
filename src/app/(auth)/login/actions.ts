"use server";

import { evaluateSignInStep, type SignInStep } from "@/lib/auth-challenge";

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
  return { step: await evaluateSignInStep(email.trim(), password) };
}
