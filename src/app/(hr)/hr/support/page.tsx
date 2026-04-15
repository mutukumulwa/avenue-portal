import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PlusCircle, MessageSquareText, Clock } from "lucide-react";

const getStatusColor = (s: string) => {
  switch(s) {
    case "OPEN": return "bg-[#FFC107]/20 text-[#856404] border-[#FFC107]/30";
    case "IN_PROGRESS": return "bg-[#17A2B8]/20 text-[#0c5460] border-[#17A2B8]/30";
    case "RESOLVED": return "bg-[#28A745]/20 text-[#155724] border-[#28A745]/30";
    case "CLOSED": return "bg-[#6C757D]/20 text-[#383d41] border-[#6C757D]/30";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
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

export default async function HRSupportPage() {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId!;

  const requests = await prisma.serviceRequest.findMany({
    where: { groupId, tenantId: session.user.tenantId },
    include: {
      respondedBy: { select: { firstName: true, lastName: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-[8px] border border-[#EEEEEE] shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Support Desk</h1>
          <p className="text-avenue-text-body mt-1">Raise service queries directly with Avenue Healthcare Operations.</p>
        </div>
        <Link 
          href="/hr/support/new" 
          className="flex items-center gap-2 bg-avenue-indigo text-white px-6 py-2.5 rounded-full font-bold hover:bg-avenue-secondary transition-colors"
        >
          <PlusCircle size={18} /> New Request
        </Link>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        {requests.length === 0 ? (
          <div className="text-center py-20">
            <MessageSquareText size={48} className="mx-auto text-avenue-border mb-4" />
            <h3 className="text-lg font-bold text-avenue-text-heading font-heading">No support requests</h3>
            <p className="text-sm text-avenue-text-muted mt-2">You haven&apos;t opened any queries with Avenue Healthcare yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#EEEEEE]">
            {requests.map(req => (
              <div key={req.id} className="p-5 hover:bg-[#F8F9FA] transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border ${getStatusColor(req.status)}`}>
                        {req.status.replace("_", " ")}
                      </span>
                      <h3 className="font-bold text-avenue-text-heading">{req.subject}</h3>
                    </div>
                    <p className="text-xs text-avenue-text-muted mt-1.5 flex items-center gap-3">
                      <span>Category: <strong className="text-avenue-text-body">{req.category.replace("_", " ")}</strong></span>
                      <span>Priority: {getPriorityLabel(req.priority)}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {new Date(req.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                </div>
                
                <div className="bg-[#F8F9FA] border border-[#EEEEEE] rounded p-4 text-sm text-avenue-text-body whitespace-pre-wrap">
                  {req.body}
                </div>

                {req.response && (
                  <div className="mt-3 bg-[#E6F4EA] border border-[#28A745]/30 rounded p-4 text-sm">
                    <p className="text-[10px] uppercase font-bold text-[#155724] mb-1">
                      Response from Avenue ({req.respondedBy?.firstName} {req.respondedBy?.lastName})
                    </p>
                    <p className="text-[#155724] whitespace-pre-wrap">{req.response}</p>
                    <p className="text-[10px] text-[#155724]/70 mt-2">{req.respondedAt ? new Date(req.respondedAt).toLocaleString() : ""}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
