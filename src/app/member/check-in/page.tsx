import { Fingerprint } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";
import { MemberCheckInCard } from "./MemberCheckInCard";

export default async function MemberCheckInPage(props: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER);
  const { challenge: scannedChallengeId } = await props.searchParams;

  if (!session.user.memberId) {
    return (
      <div className="rounded-lg border border-[#EEEEEE] bg-white p-5">
        <h1 className="font-bold text-avenue-text-heading">Check-In</h1>
        <p className="mt-1 text-sm text-avenue-text-muted">No member profile is linked to this account.</p>
      </div>
    );
  }

  const [rawPending, activeCredentialCount] = await Promise.all([
    SecureCheckInService.getPendingForMember(session.user.tenantId, session.user.memberId),
    prisma.memberWebAuthnCredential.count({
      where: {
        tenantId: session.user.tenantId,
        memberId: session.user.memberId,
        status: "ACTIVE",
      },
    }),
  ]);
  const pending = scannedChallengeId
    ? [...rawPending].sort((a, b) => {
        if (a.challengeId === scannedChallengeId) return -1;
        if (b.challengeId === scannedChallengeId) return 1;
        return 0;
      })
    : rawPending;
  const scannedFound = scannedChallengeId ? pending.some((item) => item.challengeId === scannedChallengeId) : true;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-avenue-indigo/10 text-avenue-indigo">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-avenue-text-heading">Secure Check-In</h1>
          <p className="text-sm text-avenue-text-muted">Confirm a reception check-in request from your phone.</p>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="space-y-4">
          {scannedChallengeId && !scannedFound && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-[#856404]">
              That scanned check-in request is not pending for this member account. Ask reception to restart check-in.
            </div>
          )}
          {pending.map((notification) => (
            <MemberCheckInCard
              key={notification.id}
              notification={notification}
              hasBiometricCredential={activeCredentialCount > 0}
              highlighted={notification.challengeId === scannedChallengeId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[#EEEEEE] bg-white p-6 text-center">
          <p className="font-bold text-avenue-text-heading">No pending check-ins</p>
          <p className="mt-1 text-sm text-avenue-text-muted">If you are at reception, ask the front desk to initiate secure check-in.</p>
        </div>
      )}
    </div>
  );
}
