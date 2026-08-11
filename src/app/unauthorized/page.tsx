import { ShieldX } from "lucide-react";
import Link from "next/link";
import { getCachedSession } from "@/lib/auth";
import { resolvePostLoginPath } from "@/lib/post-login";
import type { UserRole } from "@prisma/client";

/**
 * ELIG-GAP-014 — branded, explained access denial with a safe recovery action.
 *
 * Reaches here when a signed-in user lacks the role/permission for a route (the
 * requireRole and admin-layout guards). It reveals NO protected data and does
 * not enumerate the resource. For a signed-in user it offers a one-click path
 * back to THEIR own portal home; a signed-out visitor is offered login.
 */
export default async function UnauthorizedPage() {
  const session = await getCachedSession();
  const role = (session?.user?.role ?? null) as UserRole | null;
  const home = role ? resolvePostLoginPath(role) : null;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <ShieldX size={48} className="text-[#DC3545] mb-4" />
      <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Access denied</h1>
      <p className="text-brand-text-body mt-2 max-w-sm">
        You don&apos;t have access to this area. This can happen when a link points to a
        section your role doesn&apos;t use. Contact your administrator if you believe this is an error.
      </p>
      {home ? (
        <Link
          href={home}
          className="mt-6 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors text-sm"
        >
          Go to your portal
        </Link>
      ) : (
        <Link
          href="/login"
          className="mt-6 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors text-sm"
        >
          Back to login
        </Link>
      )}
    </div>
  );
}
