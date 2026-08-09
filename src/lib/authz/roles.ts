/**
 * WP-2 — role identity and role sets, with ZERO imports.
 *
 * These live apart from src/lib/rbac.ts because rbac.ts pulls in next-auth and
 * next/navigation (server-only), while client components such as AdminSidebar
 * need the same sets to decide what to render. Before this split the sidebar
 * kept its own copies, which drifted: its ANY_STAFF omitted FUND_ADMINISTRATOR
 * while rbac.ts included it, producing "no navigation but full claims data"
 * (DEF-003). One definition, imported by both sides.
 *
 * src/lib/rbac.ts re-exports everything here, so the ~180 existing
 * `import { ROLES } from "@/lib/rbac"` call sites are unaffected.
 */
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
   * Authority to READ individual claims and claim volumes — claimant identity,
   * provider, claim reference, amount, status. The DEF-003/DEF-004 oracle.
   *
   * Approved claim-read roles per the UAT persona matrix (02 Roles & Accounts).
   * UNDERWRITER is EXCLUDED (DEF-004): the underwriter's authorised work is
   * packages/schemes/tiers/endorsements, not claims. The roles this set exists
   * to EXCLUDE are UNDERWRITER (DEF-004), CUSTOMER_SERVICE (decision D1 Branch A),
   * REPORTS_VIEWER and FUND_ADMINISTRATOR.
   *
   * Reading a claim is not adjudicating one — see CLAIMS_OPS.
   */
  CLAIMS_READ:  ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"] as UserRole[],

  /**
   * Authority to read portfolio money aggregates — loss ratio, billed/approved
   * sums, premium-vs-claims. Decision D3: membership of an ops set is never
   * sufficient for money aggregates.
   *
   * UNDERWRITER is EXCLUDED (DEF-004): the underwriter holds no claim-money
   * authority. The authz parity suite pins this set to the approved persona
   * matrix so any change is a deliberate, reviewed one.
   */
  MONEY_READ:   ["SUPER_ADMIN", "FINANCE_OFFICER"] as UserRole[],
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
