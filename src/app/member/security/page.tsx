import { Smartphone } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revokeCredentialAction } from "./actions";
import { RegisterDeviceButton } from "./RegisterDeviceButton";

export default async function MemberSecurityPage(props: {
  searchParams: Promise<{ approval?: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER);
  const { approval } = await props.searchParams;

  if (!session.user.memberId) {
    return (
      <div className="rounded-lg border border-[#EEEEEE] bg-white p-5">
        <h1 className="font-bold text-avenue-text-heading">Security</h1>
        <p className="mt-1 text-sm text-avenue-text-muted">No member profile is linked to this account.</p>
      </div>
    );
  }

  const credentials = await prisma.memberWebAuthnCredential.findMany({
    where: { tenantId: session.user.tenantId, memberId: session.user.memberId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold font-heading text-avenue-text-heading">Security</h1>
        <p className="text-sm text-avenue-text-muted">Manage devices registered for secure check-in.</p>
      </div>

      {approval && (
        <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-sm font-semibold text-green-800">
          Branch approval detected. Register this device before the approval expires.
        </div>
      )}

      <RegisterDeviceButton approvalToken={approval} />

      <section className="rounded-lg border border-[#EEEEEE] bg-white">
        <div className="border-b border-[#EEEEEE] px-5 py-4">
          <h2 className="font-bold text-avenue-text-heading">Registered Devices</h2>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {credentials.map((credential) => (
            <div key={credential.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-avenue-indigo/10 text-avenue-indigo">
                  <Smartphone className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-bold text-avenue-text-heading">{credential.deviceName ?? "Registered device"}</p>
                  <p className="text-xs text-avenue-text-muted">
                    {credential.status} - last used {credential.lastUsedAt ? credential.lastUsedAt.toLocaleDateString() : "never"}
                  </p>
                </div>
              </div>
              {credential.status === "ACTIVE" && (
                <form action={revokeCredentialAction}>
                  <input type="hidden" name="credentialId" value={credential.id} />
                  <button className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-avenue-error hover:bg-red-50">
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
          {credentials.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="font-bold text-avenue-text-heading">No secure devices registered yet</p>
              <p className="mt-1 text-sm text-avenue-text-muted">
                Device enrollment will require either an existing registered device or an in-person branch approval.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
