import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";

function labelFromKey(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function VisitVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const visit = await prisma.visitVerification.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      provider: { select: { name: true } },
      confirmedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!visit) notFound();

  const sharedHealthRecords = visit.challengeId
    ? await prisma.memberHealthShare.findMany({
        where: {
          tenantId: session.user.tenantId,
          memberId: visit.memberId,
          checkInChallengeId: visit.challengeId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          healthFile: true,
          journalEntry: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#EEEEEE] bg-white p-6">
        <h1 className="text-2xl font-bold font-heading text-brand-text-heading">Visit Verification Opened</h1>
        <dl className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase text-brand-text-muted">Member</dt>
            <dd className="font-bold text-brand-text-heading">{visit.member.firstName} {visit.member.lastName} - {visit.member.memberNumber}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-brand-text-muted">Facility</dt>
            <dd className="font-bold text-brand-text-heading">{visit.provider.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-brand-text-muted">Flow</dt>
            <dd className="font-bold text-brand-text-heading">{visit.flow.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-brand-text-muted">Opened</dt>
            <dd className="font-bold text-brand-text-heading">{visit.openedAt.toLocaleString()}</dd>
          </div>
        </dl>
        {visit.reviewRequired && (
          <p className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-brand-error">
            This visit is flagged for check-in audit review.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-[#EEEEEE] bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold text-brand-text-heading">Member-Shared Health Records</h2>
            <p className="mt-1 text-sm text-brand-text-muted">
              Records shared by the member for this verified visit. Shares expire automatically after 24 hours unless revoked earlier.
            </p>
          </div>
          <span className="rounded-full bg-brand-bg-alt px-3 py-1 text-xs font-bold text-brand-text-muted">
            {sharedHealthRecords.length} active
          </span>
        </div>

        {sharedHealthRecords.length > 0 ? (
          <div className="mt-4 space-y-3">
            {sharedHealthRecords.map((share) => (
              <div key={share.id} className="rounded-lg border border-[#EEEEEE] p-4">
                {share.healthFile && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-brand-text-muted">
                        {labelFromKey(share.healthFile.category)}
                      </p>
                      <h3 className="mt-1 font-bold text-brand-text-heading">{share.healthFile.title}</h3>
                      <p className="mt-1 text-sm text-brand-text-muted">
                        {share.healthFile.fileName}
                        {share.healthFile.capturedAt ? ` - captured ${share.healthFile.capturedAt.toLocaleDateString()}` : ""}
                      </p>
                      {share.healthFile.notes && (
                        <p className="mt-2 text-sm text-brand-text-body">{share.healthFile.notes}</p>
                      )}
                    </div>
                    <a
                      href={share.healthFile.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[#DDDDDD] px-4 py-2 text-sm font-bold text-brand-text-body hover:bg-brand-bg-alt"
                    >
                      Open file
                    </a>
                  </div>
                )}

                {share.journalEntry && (
                  <div>
                    <p className="text-xs font-bold uppercase text-brand-text-muted">
                      {labelFromKey(share.journalEntry.entryType)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-brand-text-muted">
                      Recorded {share.journalEntry.recordedAt.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-brand-text-body">{share.journalEntry.noteText}</p>
                    {share.journalEntry.audioUrl && (
                      <audio controls src={share.journalEntry.audioUrl} className="mt-3 w-full">
                        <track kind="captions" />
                      </audio>
                    )}
                    {share.journalEntry.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {share.journalEntry.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-brand-bg-alt px-2 py-1 text-xs font-semibold text-brand-text-muted">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className="mt-3 text-xs text-brand-text-muted">
                  Shared {share.createdAt.toLocaleString()}
                  {share.expiresAt ? ` - expires ${share.expiresAt.toLocaleString()}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-brand-bg-alt px-3 py-2 text-sm text-brand-text-muted">
            No active Health Vault records were shared for this visit.
          </p>
        )}
      </section>
    </div>
  );
}
