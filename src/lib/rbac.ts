import { getCachedSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export type UserRole =
  | "SUPER_ADMIN"
  | "CLAIMS_OFFICER"
  | "FINANCE_OFFICER"
  | "UNDERWRITER"
  | "CUSTOMER_SERVICE"
  | "MEDICAL_OFFICER"
  | "REPORTS_VIEWER"
  | "BROKER_USER"
  | "MEMBER_USER"
  | "HR_MANAGER"
  | "FUND_ADMINISTRATOR"
  | "PROVIDER_USER";

// ── Role sets used across pages / actions ────────────────────────────────────

export const ROLES = {
  /** Full system access */
  ADMIN_ONLY:   ["SUPER_ADMIN"] as UserRole[],
  /** Clinical decisions — approve / decline claims and pre-auths */
  CLINICAL:     ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"] as UserRole[],
  /** Financial pages — billing, GL, invoices */
  FINANCE:      ["SUPER_ADMIN", "FINANCE_OFFICER"] as UserRole[],
  /** Underwriting — groups, packages, providers */
  UNDERWRITING: ["SUPER_ADMIN", "UNDERWRITER"] as UserRole[],
  /**
   * Day-to-day ops — register members, submit claims / pre-auths.
   *
   * DEPRECATED (WP-3): this set conflates membership work with claims work,
   * which is what let CUSTOMER_SERVICE reach the claims surface (DEF-003).
   * Prefer MEMBER_OPS or CLAIMS_OPS. Retained until every call site migrates;
   * the authz parity suite asserts OPS === MEMBER_OPS ∪ CLAIMS_OPS.
   */
  OPS:          ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER", "CUSTOMER_SERVICE", "UNDERWRITER"] as UserRole[],

  /**
   * Membership work — members, groups, endorsements, enrolment, roster support.
   * CUSTOMER_SERVICE (the Membership Officer) belongs here and ONLY here
   * (decision D1, Branch A: membership-only).
   */
  MEMBER_OPS:   ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER", "CUSTOMER_SERVICE", "UNDERWRITER"] as UserRole[],

  /**
   * Claims/pre-auth/case work — creating and adjudicating claims.
   * Deliberately EXCLUDES CUSTOMER_SERVICE (D1 Branch A) and UNDERWRITER.
   */
  CLAIMS_OPS:   ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"] as UserRole[],

  /**
   * Authority to read individual claims and claim volumes — claimant identity,
   * provider, claim reference, amount, status. The DEF-003 oracle.
   */
  CLAIMS_READ:  ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"] as UserRole[],

  /**
   * Authority to read portfolio money aggregates — loss ratio, billed/approved
   * sums, premium-vs-claims. Decision D3: membership of an ops set is never
   * sufficient for money aggregates.
   *
   * PROVISIONAL: pending the WP-0 persona × permission matrix sign-off. The
   * authz parity suite pins this set so any change is a deliberate, reviewed one.
   */
  MONEY_READ:   ["SUPER_ADMIN", "FINANCE_OFFICER", "UNDERWRITER"] as UserRole[],
  /**
   * Maker–checker approvals queue (/approvals). Everyone in OPS PLUS
   * FINANCE_OFFICER — the money-control checker for governed changes such as
   * AUTO_ADJ_POLICY_CHANGE (F76-GAP-02), who is otherwise confined to FINANCE
   * pages and cannot reach the queue. Kept SEPARATE from OPS so a finance
   * officer gains the approvals surface only, not the ~180 member/claim/case
   * OPS pages. Per-request role fitness is still enforced by
   * ApprovalMatrixService.roleAuthorised at decide time.
   */
  APPROVALS:    ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER", "CUSTOMER_SERVICE", "UNDERWRITER", "FINANCE_OFFICER"] as UserRole[],
  /**
   * Anyone with an internal TPA staff login.
   *
   * DEF-003: FUND_ADMINISTRATOR was removed. A fund administrator is an
   * EMPLOYER-side finance user with their own group-scoped portal
   * (/fund/dashboard, scoped via analytics-access.ts `allowedGroupIds`).
   * Admitting them to the admin shell gave them tenant-wide — i.e.
   * cross-employer — reach on surfaces that scope by tenant only.
   */
  ANY_STAFF:    ["SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "UNDERWRITER",
                 "CUSTOMER_SERVICE", "MEDICAL_OFFICER", "REPORTS_VIEWER"] as UserRole[],
  /** Member self-service portal */
  MEMBER:       ["MEMBER_USER"] as UserRole[],
  /** Corporate group HR administrator */
  HR:           ["HR_MANAGER", "SUPER_ADMIN"] as UserRole[],
  /** Self-funded scheme fund administrator (employer finance officer) */
  FUND:         ["FUND_ADMINISTRATOR", "SUPER_ADMIN"] as UserRole[],
  /** Provider facility portal (reception/clinician), confined to one provider */
  PROVIDER:     ["PROVIDER_USER"] as UserRole[],
};

/**
 * Call at the top of a Server Component or Server Action.
 * Redirects to /login if unauthenticated, /unauthorized if the role is
 * not in the allowed list.  Returns the session on success.
 */
export async function requireRole(
  allowed: UserRole[],
  opts?: {
    /**
     * WP-8 (DEC-09): set ONLY by the Settings → Security page's actions — the
     * enrolment surface itself must stay reachable for a user who is being
     * forced to enrol, or the grace flow would deadlock.
     */
    allow2faEnrolment?: boolean;
  },
) {
  const session = await getCachedSession();
  if (!session?.user) redirect("/login");

  const role = session.user.role as UserRole | undefined;
  if (!role || !allowed.includes(role)) redirect("/unauthorized");

  // WP-8 (CU-OBS-15 / DEC-09): a privileged role signed in without an enrolled
  // authenticator is confined to the enrolment surface until TOTP is enabled.
  // The flag self-heals within ~15s of enrolment (session-state refresh).
  if (session.user.mustEnrollTotp && !opts?.allow2faEnrolment) {
    redirect("/settings/security?setup=2fa-required");
  }

  return session;
}
