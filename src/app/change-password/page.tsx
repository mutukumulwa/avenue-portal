import { redirect } from "next/navigation";
import { getCachedSession } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * ELIG-GAP-006 — forced first-login password replacement.
 *
 * requireRole confines any user with `mustChangePassword` here. This page reads
 * the session DIRECTLY (not requireRole) so it stays reachable for exactly those
 * users — no redirect loop. A logged-out visitor is sent to /login.
 */
export default async function ChangePasswordPage() {
  const session = await getCachedSession();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto mt-16 max-w-md px-4">
      <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Set a new password</h1>
      <p className="mt-1 text-sm text-brand-text-muted">
        Your account was created with a temporary password. Choose your own password to continue to the portal.
      </p>
      <ChangePasswordForm />
    </div>
  );
}
