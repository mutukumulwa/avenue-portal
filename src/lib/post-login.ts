/**
 * BD-03: canonical post-login destination for a role.
 *
 * Kept as a pure, framework-free function so the route handler stays a boring
 * HTTP redirect (no React `cache()`, no Server-Component render that can abort
 * with a 503/React #419 mid-session) and so the routing can be unit-tested
 * without importing any RSC/next-auth machinery.
 *
 * A missing/unknown role falls back to the staff dashboard, which runs its own
 * RBAC — this preserves the pre-existing default-staff behaviour exactly.
 */
export function resolvePostLoginPath(role: string | null | undefined): string {
  switch (role) {
    case "BROKER_USER":        return "/broker/dashboard";
    case "MEMBER_USER":        return "/member/dashboard";
    case "HR_MANAGER":         return "/hr/dashboard";
    case "FUND_ADMINISTRATOR": return "/fund/dashboard";
    case "PROVIDER_USER":      return "/provider/dashboard";
    default:                   return "/dashboard";
  }
}
