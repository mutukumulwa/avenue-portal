/**
 * WP-2 — the canonical authorization catalog.
 *
 * Before this module the answer to "may this role see claims?" was spread over
 * seven surfaces that disagreed with each other:
 *
 *   1. src/lib/constants.ts        ROLE_PERMISSIONS (coarse legacy strings)
 *   2. prisma/seeds/rbac.ts        dynamic permission grants
 *   3. src/lib/rbac.ts             ROLES.* enum sets used by requireRole
 *   4. AdminSidebar.tsx            its OWN copies of those sets (already drifted)
 *   5. src/lib/auth.ts             session permission loading
 *   6. ~180 per-page requireRole calls
 *   7. src/server/trpc/trpc.ts     adminProcedure's hardcoded role list
 *
 * That fragmentation is the root cause behind DEF-003 and DEF-002. This module
 * is the single place a grant is stated. Everything else derives from it or is
 * pinned to it by the parity suite (tests/security/authz-parity.test.ts), which
 * fails the build on drift.
 *
 * Decision D2-b: the CATALOG is authoritative; ENFORCEMENT is hybrid.
 * Effective permissions = this baseline (from the enum role) ∪ the dynamic
 * UserRoleAssignment overlay. The overlay is strictly ADDITIVE. This matters
 * operationally: production currently has zero Role/Permission/
 * UserRoleAssignment rows, so a dynamic-only model would grant nobody anything.
 * Revoking a baseline right means changing the role, not deleting a DB row.
 *
 * NOTE ON SEED PARITY: prisma/seeds/rbac.ts imports PrismaClient, so app code
 * must not import it. The two are kept honest by the parity test rather than by
 * a runtime dependency.
 */
import type { UserRole } from "@/lib/authz/roles";

/** Wildcard held by SUPER_ADMIN. `hasPerm` treats it as "every permission". */
export const ALL_PERMISSIONS = "*";

/**
 * Baseline permission codes granted by each enum UserRole.
 *
 * Mirrors prisma/seeds/rbac.ts ROLE_PERMISSIONS, with the decision-D1 Branch A
 * amendment applied to CUSTOMER_SERVICE.
 */
export const ROLE_GRANTS: Record<UserRole, readonly string[]> = {
  SUPER_ADMIN: [ALL_PERMISSIONS],

  CLAIMS_OFFICER: [
    "CLAIM:VIEW", "CLAIM:CREATE", "CLAIM:ADJUDICATE", "CLAIM:APPEAL",
    "PREAUTH:VIEW", "PREAUTH:ADJUDICATE", "PREAUTH:ESCALATE",
    "MEMBER:VIEW", "BILLING:VIEW",
    "ANALYTICS:VIEW",
    "OVERRIDE:REQUEST",
    "ROLE:VIEW", "REPORT:VIEW",
    "CLINICAL_PROTOCOL:VIEW", "CLINICAL_GATE:REVIEW",
  ],

  FINANCE_OFFICER: [
    "BILLING:VIEW", "BILLING:POST_DEBIT_NOTE", "BILLING:APPROVE_SETTLEMENT",
    "CLAIM:VIEW", "MEMBER:VIEW",
    "BROKER:VIEW", "BROKER:APPROVE_COMMISSION",
    "ANALYTICS:VIEW",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  UNDERWRITER: [
    "QUOTATION:VIEW", "QUOTATION:CREATE", "QUOTATION:ISSUE", "QUOTATION:DECLINE", "QUOTATION:WITHDRAW",
    "UNDERWRITING:VIEW", "UNDERWRITING:ASSESS", "UNDERWRITING:RECORD_DECISION", "UNDERWRITING:DECLINE",
    "CLAIM:VIEW", "PREAUTH:VIEW",
    "MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND", "MEMBER:REINSTATE",
    "BILLING:VIEW", "BROKER:VIEW",
    "ANALYTICS:VIEW",
    "GROUP:VIEW", "GROUP:CREATE", "GROUP:UPDATE",
    "OVERRIDE:REQUEST",
    "ROLE:VIEW", "SETTINGS:VIEW", "REPORT:VIEW",
  ],

  /**
   * DECISION D1 — BRANCH A: the Membership Officer is MEMBERSHIP-ONLY.
   *
   * Removed relative to the seed: CLAIM:VIEW, PREAUTH:VIEW, BILLING:VIEW,
   * ANALYTICS:VIEW. Those grants contradicted src/lib/constants.ts, the
   * workbook's role charter ("No client/provider master or finance authority")
   * and the signed-off UAT oracle, and had no review trail — drift, not
   * decision.
   *
   * OPEN MATRIX ITEMS (WP-0): OVERRIDE:REQUEST and REPORT:VIEW are retained
   * pending sign-off. REPORT:VIEW is the weaker of the two — a report can embed
   * claim detail, so it may need scoping or removal.
   */
  CUSTOMER_SERVICE: [
    "MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND", "MEMBER:REINSTATE",
    "GROUP:VIEW",
    "OVERRIDE:REQUEST",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  MEDICAL_OFFICER: [
    "CLAIM:VIEW", "PREAUTH:VIEW", "PREAUTH:ADJUDICATE",
    "MEMBER:VIEW",
    "ANALYTICS:VIEW",
    "ROLE:VIEW",
    "CLINICAL_PROTOCOL:VIEW", "CLINICAL_PROTOCOL:MANAGE", "CLINICAL_PROTOCOL:APPROVE",
    "CLINICAL_GATE:REVIEW",
  ],

  /**
   * OPEN MATRIX ITEM (WP-0): CLAIM:VIEW is retained from the seed because the
   * reports surface aggregates claims. The enum guard already keeps this role
   * off claim pages (it is not in ROLES.CLAIMS_READ), so the residual risk is
   * report content — which the matrix must rule on.
   */
  REPORTS_VIEWER: [
    "ANALYTICS:VIEW", "CLAIM:VIEW", "MEMBER:VIEW",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  HR_MANAGER: [
    "MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND",
    "GROUP:VIEW", "CLAIM:VIEW", "BILLING:VIEW",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  FUND_ADMINISTRATOR: [
    "BILLING:VIEW", "BILLING:POST_DEBIT_NOTE",
    "GROUP:VIEW", "MEMBER:VIEW",
    "ANALYTICS:VIEW",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  BROKER_USER: [
    "GROUP:VIEW", "MEMBER:VIEW",
    "QUOTATION:VIEW", "QUOTATION:CREATE",
    "CLAIM:VIEW",
    "ANALYTICS:VIEW",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  MEMBER_USER: [
    "MEMBER:VIEW",
    "CLAIM:VIEW",
    "PREAUTH:VIEW", "PREAUTH:CREATE",
    "BILLING:VIEW",
  ],

  /** Provider personas carry their scope via provider-rbac, not the enum role. */
  PROVIDER_USER: [],
};

/**
 * Roles whose grants are amended relative to prisma/seeds/rbac.ts by an explicit
 * decision. The parity suite exempts exactly these and no others, so an
 * unreviewed divergence anywhere else fails the build.
 */
export const SEED_DIVERGENCE_EXEMPT: ReadonlyArray<UserRole> = ["CUSTOMER_SERVICE"];

/**
 * Effective permissions for a session (decision D2-b): enum baseline ∪ dynamic
 * overlay. The overlay only ever adds.
 */
export function effectivePermissions(
  role: UserRole | string | null | undefined,
  dynamicCodes: readonly string[] = [],
): string[] {
  const baseline = role && role in ROLE_GRANTS
    ? ROLE_GRANTS[role as UserRole]
    : [];
  return [...new Set([...baseline, ...dynamicCodes])];
}

/** Does this permission set satisfy `code`? SUPER_ADMIN's `*` satisfies everything. */
export function permitted(permissions: readonly string[] | undefined, code: string): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(ALL_PERMISSIONS) || permissions.includes(code);
}

type SessionLike = { user?: { role?: string | null; permissions?: string[] | null } | null };

/**
 * Permission check against a session. Falls back to the role baseline when the
 * session carries no permission array — which is every production session
 * today, since no UserRoleAssignment rows exist.
 */
export function hasPerm(session: SessionLike | null | undefined, code: string): boolean {
  const user = session?.user;
  if (!user) return false;
  const perms = user.permissions?.length
    ? user.permissions
    : effectivePermissions(user.role);
  return permitted(perms, code);
}

/** Every enum role holding `code` — used to pin ROLES.* sets in the parity suite. */
export function rolesWithPermission(code: string): UserRole[] {
  return (Object.keys(ROLE_GRANTS) as UserRole[]).filter((role) =>
    permitted(ROLE_GRANTS[role], code),
  );
}

/**
 * Internal TPA staff roles — the admin shell and tRPC adminProcedure derive
 * from this rather than restating a list. Employer-side (FUND_ADMINISTRATOR,
 * HR_MANAGER), intermediary (BROKER_USER), member and provider roles are
 * excluded: they own their own portals and the admin shell scopes by tenant
 * only, so admitting them means cross-employer reach (DEF-003).
 */
export const INTERNAL_STAFF_ROLES: readonly UserRole[] = [
  "SUPER_ADMIN",
  "CLAIMS_OFFICER",
  "FINANCE_OFFICER",
  "UNDERWRITER",
  "CUSTOMER_SERVICE",
  "MEDICAL_OFFICER",
  "REPORTS_VIEWER",
];
