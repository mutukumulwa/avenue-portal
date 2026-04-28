import { auth } from "@/lib/auth";
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
  | "FUND_ADMINISTRATOR";

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
  /** Day-to-day ops — register members, submit claims / pre-auths */
  OPS:          ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER", "CUSTOMER_SERVICE", "UNDERWRITER"] as UserRole[],
  /** Anyone with a portal login (all internal staff) */
  ANY_STAFF:    ["SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "UNDERWRITER",
                 "CUSTOMER_SERVICE", "MEDICAL_OFFICER", "REPORTS_VIEWER"] as UserRole[],
  /** Member self-service portal */
  MEMBER:       ["MEMBER_USER"] as UserRole[],
  /** Corporate group HR administrator */
  HR:           ["HR_MANAGER"] as UserRole[],
  /** Self-funded scheme fund administrator (employer finance officer) */
  FUND:         ["FUND_ADMINISTRATOR", "SUPER_ADMIN"] as UserRole[],
};

/**
 * Call at the top of a Server Component or Server Action.
 * Redirects to /login if unauthenticated, /unauthorized if the role is
 * not in the allowed list.  Returns the session on success.
 */
export async function requireRole(allowed: UserRole[]) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as UserRole | undefined;
  if (!role || !allowed.includes(role)) redirect("/unauthorized");

  return session;
}
