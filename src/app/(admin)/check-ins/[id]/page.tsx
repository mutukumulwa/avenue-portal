import { notFound } from "next/navigation";
import { requireRole, ROLES } from "@/lib/rbac";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";
import { buildKnowledgePrompts } from "@/server/services/secure-checkin/knowledge";
import { describeCheckInStatus } from "@/server/services/secure-checkin/status";
import { cancelCheckInAction, confirmVisitCodeAction, knowledgeFallbackAction, restartCheckInAction } from "../actions";
import { CheckInQRCode } from "./CheckInQRCode";

export default async function CheckInDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const challenge = await SecureCheckInService.getChallengeForStaff(session.user.tenantId, id);

  if (!challenge) notFound();

  const isAwaitingCode = challenge.status === "SIGNED";
  const knowledgePrompts = buildKnowledgePrompts(challenge.member);
  const status = describeCheckInStatus(challenge.status, !!challenge.visitVerification);
  const canRestart = !challenge.visitVerification && challenge.status !== "CODE_CONFIRMED";
  const canCancel = !challenge.visitVerification && !["CANCELLED", "CODE_CONFIRMED"].includes(challenge.status);
  const statusTone = {
    success: "border-green-100 bg-green-50 text-green-800",
    info: "border-blue-100 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-[#856404]",
    danger: "border-red-100 bg-red-50 text-avenue-error",
    muted: "border-[#EEEEEE] bg-white text-avenue-text-body",
  }[status.tone];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const memberCheckInPath = `/member/check-in?challenge=${encodeURIComponent(challenge.id)}`;
  const qrValue = `${appUrl.replace(/\/$/, "")}/login?callbackUrl=${encodeURIComponent(memberCheckInPath)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Check-In Verification</h1>
        <p className="text-sm text-avenue-text-muted mt-1">
          {challenge.member.firstName} {challenge.member.lastName} - {challenge.member.memberNumber}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[#EEEEEE] bg-white p-4">
          <p className="text-xs font-bold uppercase text-avenue-text-muted">Facility</p>
          <p className="mt-1 font-bold text-avenue-text-heading">{challenge.provider.name}</p>
        </div>
        <div className="rounded-lg border border-[#EEEEEE] bg-white p-4">
          <p className="text-xs font-bold uppercase text-avenue-text-muted">Status</p>
          <p className="mt-1 font-bold text-avenue-indigo">{challenge.status.replace(/_/g, " ")}</p>
        </div>
        <div className="rounded-lg border border-[#EEEEEE] bg-white p-4">
          <p className="text-xs font-bold uppercase text-avenue-text-muted">Expires</p>
          <p className="mt-1 font-bold text-avenue-text-heading">{challenge.expiresAt.toLocaleTimeString()}</p>
        </div>
      </section>

      <section className={`rounded-lg border p-5 ${statusTone}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-bold">{status.title}</h2>
            <p className="mt-1 text-sm">{status.nextAction}</p>
            {challenge.attemptCount > 0 && (
              <p className="mt-2 text-xs font-bold">Failed attempts: {challenge.attemptCount}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canRestart && (
              <form action={restartCheckInAction}>
                <input type="hidden" name="challengeId" value={challenge.id} />
                <button className="rounded-full bg-avenue-indigo px-4 py-2 text-xs font-bold text-white hover:bg-avenue-secondary">
                  Restart
                </button>
              </form>
            )}
            {canCancel && (
              <form action={cancelCheckInAction} className="flex gap-2">
                <input type="hidden" name="challengeId" value={challenge.id} />
                <input name="reason" placeholder="Cancel reason" className="w-36 rounded-full border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-avenue-text-body outline-none" />
                <button className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-bold text-avenue-error hover:bg-red-50">
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#EEEEEE] bg-white p-5">
        <h2 className="font-bold text-avenue-text-heading">Reception Code Match</h2>
        <p className="mt-1 text-sm text-avenue-text-muted">
          Ask the member to open Check-In on the member portal and show the 6-digit code. The visit opens only after the code matches.
        </p>
        <form action={confirmVisitCodeAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="challengeId" value={challenge.id} />
          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            disabled={!isAwaitingCode}
            placeholder={isAwaitingCode ? "6-digit code" : "Waiting for member confirmation"}
            className="w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo disabled:bg-avenue-bg-alt sm:max-w-48"
          />
          <button disabled={!isAwaitingCode} className="rounded-full bg-avenue-indigo px-5 py-2 text-sm font-bold text-white hover:bg-avenue-secondary disabled:cursor-not-allowed disabled:opacity-50">
            Confirm match
          </button>
        </form>
      </section>

      {!challenge.visitVerification && ["PENDING", "FALLBACK_STARTED"].includes(challenge.status) && (
        <section className="grid gap-4 rounded-lg border border-[#EEEEEE] bg-white p-5 md:grid-cols-[1fr_220px]">
          <div>
            <h2 className="font-bold text-avenue-text-heading">QR / Manual Pull</h2>
            <p className="mt-1 text-sm text-avenue-text-muted">
              If the member does not receive an in-app notification, ask them to scan this QR code. It opens the member PWA check-in screen for this request after login.
            </p>
            <p className="mt-3 rounded-md bg-avenue-bg-alt px-3 py-2 text-xs font-semibold text-avenue-text-body">
              Member path: {memberCheckInPath}
            </p>
          </div>
          <CheckInQRCode value={qrValue} />
        </section>
      )}

      {challenge.visitVerification && (
        <section className="rounded-lg border border-green-100 bg-green-50 p-5">
          <h2 className="font-bold text-green-800">Visit Opened</h2>
          <p className="text-sm text-green-700 mt-1">
            Visit verification {challenge.visitVerification.id} opened at {challenge.visitVerification.openedAt.toLocaleString()}.
          </p>
        </section>
      )}

      {!challenge.visitVerification && (
        <section className="rounded-lg border border-amber-200 bg-white p-5">
          <h2 className="font-bold text-avenue-text-heading">Photo + Knowledge Fallback</h2>
          <p className="mt-1 text-sm text-avenue-text-muted">
            Use only when the member cannot complete biometric or phone-based check-in. This opens a review-required visit.
          </p>
          <form action={knowledgeFallbackAction} className="mt-4 space-y-4">
            <input type="hidden" name="challengeId" value={challenge.id} />
            <label className="block">
              <span className="text-xs font-bold uppercase text-avenue-text-muted">Photo evidence URL or reference</span>
              <input
                name="photoEvidenceUrl"
                placeholder="Paste uploaded photo reference if captured"
                className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo"
              />
            </label>

            {knowledgePrompts.map((prompt, index) => (
              <label key={prompt.key} className="block">
                <span className="text-xs font-bold uppercase text-avenue-text-muted">{prompt.prompt}</span>
                <input type="hidden" name={`knowledgeKey${index}`} value={prompt.key} />
                <input
                  name={`knowledgeAnswer${index}`}
                  required
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo"
                />
              </label>
            ))}

            <button className="rounded-full bg-[#856404] px-5 py-2 text-sm font-bold text-white hover:opacity-90">
              Complete fallback and open visit
            </button>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-[#EEEEEE] bg-white">
        <div className="border-b border-[#EEEEEE] px-5 py-4">
          <h2 className="font-bold text-avenue-text-heading">Audit Trail</h2>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {challenge.events.map((event) => (
            <div key={event.id} className="px-5 py-3 text-sm">
              <p className="font-bold text-avenue-text-heading">
                {event.flow.replace(/_/g, " ")} - {event.outcome.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-avenue-text-muted">{event.createdAt.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
