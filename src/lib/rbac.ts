import { getCachedSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ROLES, type UserRole } from "@/lib/authz/roles";

// Re-exported so existing call sites keep importing from "@/lib/rbac".
// The single definition lives in @/lib/authz/roles (no server-only imports),
// which is what lets client components share it.
export { ROLES };
export type { UserRole };

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
