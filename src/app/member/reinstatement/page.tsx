import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ReinstatementService } from "@/server/services/reinstatement.service";
import { ReinstatementRequestForm } from "./ReinstatementRequestForm";
import { ArrowLeft, CheckCircle, Clock, XCircle } from "lucide-react";
import Link from "next/link";

export default async function MemberReinstatementPage() {
  const session = await requireRole(ROLES.MEMBER);

  const member = await prisma.member.findFirst({
    where: { user: { id: session.user.id }, tenantId: session.user.tenantId },
    select: {
      id: true, firstName: true, status: true, activationDate: true, enrollmentDate: true,
      group: { select: { contributionRate: true } },
    },
  });

  if (!member) return (
    <div className="p-6 text-avenue-text-body">No member profile found.</div>
  );

  const requests = await ReinstatementService.getMemberRequests(session.user.tenantId, member.id);
  const pending = requests.find(r => r.status === "PENDING");
  const isLapsed = member.status === "LAPSED";

  // Estimate catch-up amount for display
  const reference = member.activationDate ?? member.enrollmentDate;
  const monthsLapsed = Math.max(1, Math.ceil(
    (new Date().getTime() - reference.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  ));
  const estimatedCatchUp = monthsLapsed * Number(member.group.contributionRate);

  const statusIcon = (s: string) => {
    if (s === "APPROVED") return <CheckCircle size={16} className="text-[#28A745]" />;
    if (s === "DECLINED") return <XCircle size={16} className="text-[#DC3545]" />;
    return <Clock size={16} className="text-[#FFC107]" />;
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/member/dashboard" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Membership Reinstatement</h1>
      </div>

      {isLapsed && !pending && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-4">
          <div className="p-4 bg-[#DC3545]/10 border border-[#DC3545]/20 rounded-lg">
            <h2 className="font-bold text-[#DC3545] mb-1">Your membership is lapsed</h2>
            <p className="text-sm text-avenue-text-body">
              To resume cover, you need to pay a catch-up contribution for the period your membership was inactive.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-[#F8F9FA] p-3 rounded">
              <p className="text-avenue-text-muted text-xs font-bold uppercase">Months lapsed</p>
              <p className="text-xl font-bold text-avenue-text-heading mt-1">{monthsLapsed}</p>
            </div>
            <div className="bg-[#F8F9FA] p-3 rounded">
              <p className="text-avenue-text-muted text-xs font-bold uppercase">Estimated catch-up (KES)</p>
              <p className="text-xl font-bold text-avenue-text-heading mt-1">{estimatedCatchUp.toLocaleString()}</p>
            </div>
          </div>

          <p className="text-xs text-avenue-text-muted">
            Submitting this request notifies your scheme administrator for approval. The final amount will be confirmed in the approval invoice.
          </p>

          <ReinstatementRequestForm />
        </div>
      )}

      {pending && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <Clock size={20} className="text-[#FFC107]" />
            <h2 className="font-bold text-avenue-text-heading">Request Pending Review</h2>
          </div>
          <p className="text-sm text-avenue-text-body">
            Your reinstatement request was submitted on {new Date(pending.requestDate).toLocaleDateString("en-KE")}.
            Estimated catch-up: <strong>KES {Number(pending.catchUpAmount).toLocaleString()}</strong> for {pending.periodsCovered} month(s).
            Your scheme administrator will review it shortly.
          </p>
        </div>
      )}

      {!isLapsed && !pending && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm text-center">
          <CheckCircle size={40} className="mx-auto text-[#28A745] mb-3" />
          <h2 className="font-bold text-avenue-text-heading">Your membership is active</h2>
          <p className="text-sm text-avenue-text-muted mt-1">No reinstatement is needed at this time.</p>
        </div>
      )}

      {requests.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-bold text-avenue-text-heading font-heading">Request History</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {requests.map(r => (
              <div key={r.id} className="px-5 py-4 flex justify-between items-start text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    {statusIcon(r.status)}
                    <span className="font-semibold text-avenue-text-heading">{r.status.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-avenue-text-muted mt-1">
                    Requested {new Date(r.requestDate).toLocaleDateString("en-KE")} ·{" "}
                    {r.periodsCovered} month(s) · KES {Number(r.catchUpAmount).toLocaleString()}
                  </p>
                  {r.declineReason && (
                    <p className="text-[#DC3545] text-xs mt-1">Declined: {r.declineReason}</p>
                  )}
                </div>
                {r.decidedAt && (
                  <span className="text-xs text-avenue-text-muted">{new Date(r.decidedAt).toLocaleDateString("en-KE")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
