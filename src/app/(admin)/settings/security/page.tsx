import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SecurityManager } from "./SecurityManager";
import { ShieldCheck } from "lucide-react";

export default async function SecurityPage() {
  const session = await requireRole(ROLES.ANY_STAFF);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Security</h1>
          <p className="text-sm text-brand-text-muted">
            Two-factor authentication (TOTP). When enabled, sign-in requires a
            code from your authenticator app.
          </p>
        </div>
      </div>
      <SecurityManager enabled={user?.totpEnabled ?? false} />
    </div>
  );
}
