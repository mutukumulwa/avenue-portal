import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Clock, CheckCircle } from "lucide-react";

const getStatusColor = (s: string) => {
  switch(s) {
    case "OPEN": return "bg-[#FFC107]/20 text-[#856404]";
    case "IN_PROGRESS": return "bg-[#17A2B8]/20 text-[#0c5460]";
    case "RESOLVED": return "bg-[#28A745]/20 text-[#155724]";
    case "CLOSED": return "bg-[#6C757D]/20 text-[#383d41]";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getPriorityLabel = (p: string) => {
  switch(p) {
    case "URGENT": return <span className="text-[#DC3545] font-bold">Urgent</span>;
    case "HIGH": return <span className="text-[#FF8C00] font-bold">High</span>;
    case "LOW": return <span className="text-[#6C757D]">Low</span>;
    default: return <span>Normal</span>;
  }
};

export default async function AdminServiceRequestsPage() {
  const session = await requireRole(ROLES.ANY_STAFF); // Admins and Ops

  const requests = await prisma.serviceRequest.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      group: { select: { name: true } },
      submittedBy: { select: { firstName: true, lastName: true } }
    },
    orderBy: [
      { status: "asc" }, // OPEN first
      { createdAt: "desc" }
    ]
  });

  const openCount = requests.filter(r => r.status === "OPEN").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-[8px] border border-[#EEEEEE] shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Service Requests Queue</h1>
          <p className="text-avenue-text-body mt-1">Manage and resolve HR support queries from corporate groups.</p>
        </div>
        <div className="bg-[#FFC107]/20 text-[#856404] px-4 py-2 rounded-full font-bold flex items-center gap-2">
          <Clock size={18} /> {openCount} Open Queries
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-xs uppercase border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Group / Client</th>
              <th className="px-6 py-4">Subject</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Priority</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-sm">
            {requests.map(req => {
               // eslint-disable-next-line react-compiler/react-compiler
               const daysOld = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / (1000 * 3600 * 24));
               return (
                <tr key={req.id} className="hover:bg-[#F8F9FA] transition-colors group cursor-pointer relative">
                  <td className="px-6 py-4">
                    <Link href={`/service-requests/${req.id}`} className="absolute inset-0 z-10" />
                    <p className="font-bold text-avenue-text-heading">{req.group.name}</p>
                    <p className="text-xs text-avenue-text-muted mt-0.5">By {req.submittedBy.firstName} {req.submittedBy.lastName}</p>
                  </td>
                  <td className="px-6 py-4 font-semibold text-avenue-text-heading truncate max-w-xs">{req.subject}</td>
                  <td className="px-6 py-4 text-xs font-bold text-[#6C757D]">{req.category.replace("_", " ")}</td>
                  <td className="px-6 py-4 text-xs">{getPriorityLabel(req.priority)}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full ${getStatusColor(req.status)}`}>
                      {req.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-avenue-text-muted text-xs">
                    {daysOld === 0 ? "Today" : `${daysOld} days`}
                  </td>
                </tr>
               )
            })}
            
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-avenue-text-muted">
                  <CheckCircle size={40} className="mx-auto mb-3 text-[#28A745]/50" />
                  No service requests found. Inbox zero!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
