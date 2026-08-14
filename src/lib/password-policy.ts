/**
 * Password policy (Medvex spec §6 / R28 / gap V-08). Enforced everywhere a
 * password is set or changed. Returns an error message, or null when valid.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * bcrypt cost factor for user passwords.
 *
 * A named constant because a second thing depends on it: the sign-in timing
 * equaliser in `auth-credentials.ts` compares against a dummy hash so that a
 * rejected address costs the same as a real one. If the equaliser's cost drifts
 * below this, it stops equalising anything — and the difference is invisible in
 * every test that only asserts behaviour. `tests/lib/auth-timing.test.ts` pins
 * the two together.
 *
 * Not applied to API keys, reset codes or integration secrets, which are high
 * entropy and hashed at 10 deliberately.
 */
export const PASSWORD_BCRYPT_COST = 12;

export function validatePassword(password: string | null | undefined): string | null {
  if (!password) return "Password is required.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a digit.";
  return null;
}

/** Convenience: throw with the policy message when invalid. */
export function assertPasswordPolicy(password: string | null | undefined): void {
  const err = validatePassword(password);
  if (err) throw new Error(err);
}
