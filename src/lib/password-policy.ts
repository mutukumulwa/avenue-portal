/**
 * Password policy (Medvex spec §6 / R28 / gap V-08). Enforced everywhere a
 * password is set or changed. Returns an error message, or null when valid.
 */
export const PASSWORD_MIN_LENGTH = 10;

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
