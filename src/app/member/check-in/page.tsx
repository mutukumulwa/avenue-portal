import { Fingerprint } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";
import { MemberHealthVaultService } from "@/server/services/member-health-vault.service";
import { MemberCheckInCard } from "./MemberCheckInCard";
import { revokeCheckInHealthShareAction, shareHealthRecordWithCheckInAction } from "./actions";

function labelFromKey(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function MemberCheckInPage(props: {
  searchParams: Promise<{ challenge?: string; shareError?: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER);
  const { challenge: scannedChallengeId, shareError } = await props.searchParams;

  if (!session.user.memberId) {
    return (
      <div className="rounded-lg border border-[#EEEEEE] bg-white p-5">
        <h1 className="font-bold text-brand-text-heading">Check-In</h1>
        <p className="mt-1 text-sm text-brand-text-muted">No member profile is linked to this account.</p>
      </div>
    );
  }

  const [rawPending, activeCredentialCount, vault] = await Promise.all([
    SecureCheckInService.getPendingForMember(session.user.tenantId, session.user.memberId),
    prisma.memberWebAuthnCredential.count({
      where: {
        tenantId: session.user.tenantId,
        memberId: session.user.memberId,
        status: "ACTIVE",
      },
    }),
    MemberHealthVaultService.getVaultForUser(session.user.id, session.user.tenantId),
  ]);
  type VaultFile = NonNullable<typeof vault>["files"][number];
  type VaultEntry = NonNullable<typeof vault>["journalEntries"][number];
  const healthRecordOptions = [
    ...(vault?.files ?? []).map((file: VaultFile) => ({
      key: `file:${file.id}`,
      kind: "file",
      id: file.id,
      label: `${file.title} - ${labelFromKey(file.category)}`,
      createdAt: file.capturedAt ?? file.createdAt,
      shares: file.shares,
    })),
    ...(vault?.journalEntries ?? []).map((entry: VaultEntry) => ({
      key: `journal:${entry.id}`,
      kind: "journal",
      id: entry.id,
      label: `${labelFromKey(entry.entryType)} - ${entry.noteText.slice(0, 70)}${entry.noteText.length > 70 ? "..." : ""}`,
      createdAt: entry.recordedAt,
      shares: entry.shares,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-indigo/10 text-brand-indigo">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-brand-text-heading">Secure Check-In</h1>
          <p className="text-sm text-brand-text-muted">Confirm a reception check-in request from your phone.</p>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="space-y-4">
          {scannedChallengeId && !scannedFound && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-[#856404]">
              That scanned check-in request is not pending for this member account. Ask reception to restart check-in.
            </div>
          )}
          {shareError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-brand-error">
              {shareError}
            </div>
          )}
          {pending.map((notification) => (
            <div key={notification.id} className="space-y-3">
              <MemberCheckInCard
                notification={notification}
                hasBiometricCredential={activeCredentialCount > 0}
                highlighted={notification.challengeId === scannedChallengeId}
              />
              <section className="rounded-lg border border-[#EEEEEE] bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold text-brand-text-heading">Share health records for this visit</h2>
                    <p className="mt-1 text-sm text-brand-text-muted">
                      Choose lab results, notes, or referral details that reception or clinical staff should see for this check-in.
                    </p>
                  </div>
                  <a href="/member/health-vault" className="text-sm font-bold text-brand-indigo hover:underline">
                    Open vault
                  </a>
                </div>

                {healthRecordOptions.length > 0 ? (
                  <form action={shareHealthRecordWithCheckInAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="checkInChallengeId" value={notification.challengeId} />
                    <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                      <select
                        name="healthRecord"
                        className="rounded-md border border-[#EEEEEE] px-3 py-2 text-sm text-brand-text-body outline-none focus:border-brand-indigo"
                        required
                      >
                        <option value="">Choose a record</option>
                        {healthRecordOptions.map((record) => (
                          <option key={record.key} value={`${record.kind}:${record.id}`}>
                            {record.label}
                          </option>
                        ))}
                      </select>
                      <select
                        name="shareExpiry"
                        className="rounded-md border border-[#EEEEEE] px-3 py-2 text-sm text-brand-text-body outline-none focus:border-brand-indigo"
                      >
                        <option value="24">24 hours</option>
                        <option value="72">72 hours</option>
                      </select>
                    </div>
                    <button className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-bold text-white hover:bg-brand-secondary">
                      Share
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 rounded-md bg-brand-bg-alt px-3 py-2 text-sm text-brand-text-muted">
                    Add files or notes in Health Vault before sharing records with a visit.
                  </p>
                )}

                <div className="mt-4 space-y-2">
                  {healthRecordOptions.flatMap((record) => {
                    type ShareEntry = (typeof record.shares)[number];
                    return record.shares
                      .filter((share: ShareEntry) => share.checkInChallengeId === notification.challengeId)
                      .map((share: ShareEntry) => (
                        <div key={share.id} className="flex flex-col gap-2 rounded-md bg-brand-bg-alt px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-brand-text-heading">{record.label}</p>
                            <p className="text-xs text-brand-text-muted">
                              Shared {share.createdAt.toLocaleString()}
                              {share.expiresAt ? ` · expires ${share.expiresAt.toLocaleString()}` : " · until revoked"}
                            </p>
                          </div>
                          <form action={revokeCheckInHealthShareAction}>
                            <input type="hidden" name="shareId" value={share.id} />
                            <input type="hidden" name="checkInChallengeId" value={notification.challengeId} />
                            <button className="rounded-full border border-[#DDDDDD] px-3 py-1 text-xs font-bold text-brand-text-body hover:bg-white">
                              Revoke
                            </button>
                          </form>
                        </div>
                      ));
                  })}
                </div>
              </section>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[#EEEEEE] bg-white p-6 text-center">
          <p className="font-bold text-brand-text-heading">No pending check-ins</p>
          <p className="mt-1 text-sm text-brand-text-muted">If you are at reception, ask the front desk to initiate secure check-in.</p>
        </div>
      )}
    </div>
  );
}
