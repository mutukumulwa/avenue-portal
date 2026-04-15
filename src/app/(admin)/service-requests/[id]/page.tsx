import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Send, ShieldCheck } from "lucide-react";
import { resolveServiceRequestAction } from "@/app/(admin)/service-requests/[id]/actions";

export default async function ResolveServiceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS); // Need OPS to resolve

  const { id } = await params;

  const req = await prisma.serviceRequest.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      group: { select: { name: true } },
      submittedBy: { select: { firstName: true, lastName: true, email: true } },
      respondedBy: { select: { firstName: true, lastName: true } }
    }
  });

  if (!req) notFound();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/service-requests" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Resolve Query</h1>
          <p className="text-avenue-text-body font-mono text-sm mt-0.5">{req.id.toUpperCase().slice(-8)}</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6 space-y-6">
        <div className="flex justify-between items-start border-b border-[#EEEEEE] pb-6">
          <div>
            <h2 className="text-xl font-bold text-avenue-text-heading">{req.subject}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="bg-[#E6E7E8] text-[#6C757D] font-bold px-2 py-0.5 rounded text-xs uppercase">{req.category.replace("_", " ")}</span>
              <span className="text-avenue-text-muted flex items-center gap-1"><Clock size={14} /> {new Date(req.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-avenue-indigo">{req.group.name}</p>
            <p className="text-sm text-avenue-text-muted">{req.submittedBy.firstName} {req.submittedBy.lastName}</p>
            <p className="text-xs text-avenue-text-muted">{req.submittedBy.email}</p>
          </div>
        </div>

        <div className="bg-[#F8F9FA] p-5 rounded-lg border border-[#EEEEEE] text-sm text-avenue-text-body whitespace-pre-wrap">
          {req.body}
        </div>

        {req.status === "RESOLVED" && req.response ? (
          <div className="bg-[#E6F4EA] border border-[#28A745]/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2 font-bold text-[#155724]">
              <ShieldCheck size={18} /> Resolving Response
            </div>
            <p className="text-[#155724] whitespace-pre-wrap text-sm">{req.response}</p>
            <p className="text-xs text-[#155724]/70 mt-3">— Responded by {req.respondedBy?.firstName} {req.respondedBy?.lastName} on {req.respondedAt?.toLocaleString()}</p>
          </div>
        ) : (
          <div className="border-t border-[#EEEEEE] pt-6">
            <h3 className="font-bold text-avenue-text-heading mb-3">Provide Resolution</h3>
            <form action={resolveServiceRequestAction} className="space-y-4">
              <input type="hidden" name="requestId" value={req.id} />
              <textarea 
                required 
                name="response" 
                rows={6} 
                className="w-full border border-[#EEEEEE] rounded-lg p-4 text-sm focus:outline-none focus:border-avenue-indigo transition-colors"
                placeholder="Type your response to the HR Manager. This will mark the query as RESOLVED."
              />
              <div className="flex justify-end">
                <button type="submit" className="flex items-center gap-2 bg-[#28A745] hover:bg-[#218838] text-white px-8 py-2.5 rounded-full font-bold shadow-sm transition-colors">
                  <Send size={16} /> Resolve Query
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
