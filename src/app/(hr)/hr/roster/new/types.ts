export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
  endorsementNumber?: string;
  resultingCoverStart?: string;
  /**
   * UAT-HF P05.04 / DEF-028 — non-blocking identity candidates (shared phone,
   * same email, same name+DOB). Shown to the employer at submission rather than
   * discovered by the TPA at approval.
   */
  warnings?: string[];
} | null;
