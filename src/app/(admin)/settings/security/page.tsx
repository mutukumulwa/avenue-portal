import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { TOTP_ENFORCED_ROLES } from "@/lib/totp";
import { SecurityManager } from "./SecurityManager";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export default async function SecurityPage() {
  // WP-8: the enrolment surface itself must stay reachable for a user who is
  // being FORCED to enrol — without the exemption the grace flow deadlocks.
  const session = await requireRole(ROLES.ANY_STAFF, { allow2faEnrolment: true });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });
  const mandatory = TOTP_ENFORCED_ROLES.has(session.user.role ?? "");
  const mustEnroll = mandatory && !(user?.totpEnabled ?? false);

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
      {mustEnroll && (
        <div className="flex items-start gap-2 rounded-lg border border-[#FFC107]/40 bg-[#FFF8E1] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#856404]" />
          <p className="text-sm text-[#856404]">
            <span className="font-bold">Two-step sign-in is required for your role.</span>{" "}
            Set up your authenticator below — the rest of the platform unlocks a few
            seconds after you confirm the first code.
          </p>
        </div>
      )}
      <SecurityManager enabled={user?.totpEnabled ?? false} mandatory={mandatory} />
    </div>
  );
}
