import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerFailedAttempt } from "@/lib/auth-credentials";
import { recordBlockedSignIn, recordInactiveAccountSignIn, findDeactivatedAccount } from "@/lib/auth-audit";

/**
 * UAT-HF P10.01 — the password step of the two-step sign-in (DEF-011).
 *
 * The run: "Nothing tells the user a code is required, that their code was
 * malformed, or that it had expired." A malformed code and an expired code both
 * returned "Invalid email or password."
 *
 * The earlier half of P10.01 fixed what could be answered in the browser (a
 * code that is not six digits). This is the half that needs the server: whether
 * a code is **required at all**. That cannot be said before the password is
 * verified, because saying it identifies the account — so it is said here,
 * after, and only then.
 *
 * ## Why this is not an enumeration oracle
 *
 * `CODE_REQUIRED` is only ever returned to a caller who has already supplied
 * the correct password for that account. An attacker who can reach it already
 * holds the credential; learning that the account also has an authenticator
 * tells them nothing they could not learn by trying to sign in.
 *
 * Everything else collapses to one `REJECTED`: no such account, wrong password,
 * inactive account, and an account currently locked all return the same value,
 * and the caller renders one sentence for it. That is D-13, unchanged.
 *
 * ## It goes through the same throttle
 *
 * A step that verified passwords **outside** the lockout counter would be a
 * brute-force bypass built while fixing a usability defect: an attacker would
 * simply call the cheap step instead of signing in. A rejection here registers
 * a failed attempt through the very same atomic counter `authorizeCredentials`
 * uses — one implementation, so the rolling window and the UTC clock cannot
 * drift apart between the two paths.
 *
 * A *success* here deliberately does NOT clear the counter. Only a completed
 * sign-in does that (`authorizeCredentials` clears it in the same write that
 * bumps the session version). Otherwise a correct password with no code would
 * reset the throttle indefinitely.
 */

export type SignInStep =
  /** No account, wrong password, inactive, or locked. Say nothing more. */
  | "REJECTED"
  /** Password is correct and the account has no authenticator. Sign in now. */
  | "PASSWORD_ONLY"
  /** Password is correct and an authenticator code is required. Ask for it. */
  | "CODE_REQUIRED";

/**
 * A bcrypt hash of a value nobody knows, compared against when no account
 * matched. Without it the "no such account" path returns in microseconds while
 * a real account spends ~100 ms in bcrypt — a timing channel that answers "does
 * this address have an account here" without a single distinguishable response
 * body. The existing `authorizeCredentials` has the same shape; closing it here
 * matters more, because this step is the cheap one an attacker would target.
 */
const TIMING_EQUALISER = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function evaluateSignInStep(email: string, password: string): Promise<SignInStep> {
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: {
      id: true,
      tenantId: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecret: true,
      lockedUntil: true,
    },
  });

  if (!user) {
    await bcrypt.compare(password, TIMING_EQUALISER);
    // UAT-HF P10.05. This step is the cheap one an attacker would target, so it
    // must leave the same trail as the full sign-in — a rail that records only
    // on the expensive path is a rail with a documented way round it. Same
    // reasoning and same limits as authorizeCredentials: a deactivated account
    // is recorded, an unknown address cannot be (AuditLog.userId is a required
    // FK), and the response is unchanged either way.
    const deactivated = await findDeactivatedAccount(email);
    if (deactivated) {
      await recordInactiveAccountSignIn({ userId: deactivated.id, tenantId: deactivated.tenantId });
    }
    return "REJECTED";
  }

  // A live lock fails before bcrypt, exactly as authorizeCredentials does, so a
  // locked account never spends a hash comparison. It also does NOT register a
  // further failed attempt: the lock is already armed, and re-counting would
  // let an attacker extend someone else's lock indefinitely by hammering it.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordBlockedSignIn({
      userId: user.id,
      tenantId: user.tenantId,
      lockedUntil: user.lockedUntil,
    });
    return "REJECTED";
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    // No TOTP is verified at this step, so the only reason available here is a
    // bad password. BAD_TOTP can only be reached from authorizeCredentials.
    await registerFailedAttempt(user.id, user.tenantId, "BAD_PASSWORD");
    return "REJECTED";
  }

  return user.totpEnabled && user.totpSecret ? "CODE_REQUIRED" : "PASSWORD_ONLY";
}
