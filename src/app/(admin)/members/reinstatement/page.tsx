import { requireRole, ROLES } from "@/lib/rbac";
import { ReinstatementService } from "@/server/services/reinstatement.service";
import { ReinstatementDecisionPanel } from "./ReinstatementDecisionPanel";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

export default async function ReinstatementQueuePage() {
  const session = await requireRole(ROLES.OPS);
  const requests = await ReinstatementService.getPendingRequests(session.user.tenantId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/members" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Reinstatement Requests</h1>
          <p className="text-brand-text-muted text-sm mt-0.5">{requests.length} pending</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center">
            <RefreshCw size={36} className="mx-auto mb-3 text-[#DCDCDC]" />
            <p className="text-brand-text-muted">No pending reinstatement requests.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Group</th>
                <th className="px-5 py-3">Lapsed Date</th>
                <th className="px-5 py-3">Months</th>
                <th className="px-5 py-3">Catch-up (KES)</th>
                <th className="px-5 py-3">Requested</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-[#F8F9FA] align-top">
                  <td className="px-5 py-4">
                    <Link href={`/members/${r.member.id}`} className="font-semibold text-brand-text-heading hover:text-brand-indigo transition-colors">
                      {r.member.firstName} {r.member.lastName}
                    </Link>
                    <p className="text-brand-text-muted font-mono text-xs mt-0.5">{r.member.memberNumber}</p>
                  </td>
                  <td className="px-5 py-4">{r.member.group.name}</td>
                  <td className="px-5 py-4">{new Date(r.lapsedDate).toLocaleDateString("en-KE")}</td>
                  <td className="px-5 py-4 font-semibold">{r.periodsCovered}</td>
                  <td className="px-5 py-4 font-semibold text-brand-indigo">{Number(r.catchUpAmount).toLocaleString()}</td>
                  <td className="px-5 py-4 text-brand-text-muted">{new Date(r.requestDate).toLocaleDateString("en-KE")}</td>
                  <td className="px-5 py-4">
                    <ReinstatementDecisionPanel requestId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
