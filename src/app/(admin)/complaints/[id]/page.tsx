import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, ExternalLink, MessageSquareWarning } from "lucide-react";
import { ComplaintDetailActions } from "./ComplaintDetailActions";

const STATUS_STYLES: Record<string, string> = {
  OPEN:          "bg-[#DC3545]/10 text-[#DC3545]",
  INVESTIGATING: "bg-[#FFC107]/10 text-[#856404]",
  RESOLVED:      "bg-[#28A745]/10 text-[#28A745]",
  DISMISSED:     "bg-[#6C757D]/10 text-[#6C757D]",
};

const TYPE_LABELS: Record<string, string> = {
  SERVICE:  "Service Quality",
  FACILITY: "Facility / Provider",
  BILLING:  "Billing / Claims",
  CLINICAL: "Clinical Dispute",
  GENERAL:  "General",
};

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(ROLES.OPS);
  const { id } = await params;

  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: {
      member: {
        select: {
          id: true, firstName: true, lastName: true, memberNumber: true,
          status: true, phone: true, email: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!complaint) notFound();

  const fmtDt = (d: Date) => new Date(d).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

  // Audit trail for this complaint
  const auditEntries = await prisma.auditLog.findMany({
    where: { metadata: { path: ["complaintId"], equals: complaint.id } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/complaints" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors mt-1">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-avenue-text-heading font-heading leading-snug">
              {complaint.subject}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[complaint.status]}`}>
              {complaint.status.replace("_", " ")}
            </span>
            <span className="bg-[#E6E7E8] text-[#6C757D] px-2.5 py-0.5 rounded text-[10px] font-bold uppercase">
              {TYPE_LABELS[complaint.type] ?? complaint.type}
            </span>
            <span className="text-xs text-avenue-text-muted">Submitted {fmtDt(complaint.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="md:col-span-2 space-y-5">

          {/* Description */}
          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquareWarning size={15} className="text-avenue-text-muted" />
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Complaint Description</p>
            </div>
            <p className="text-sm text-avenue-text-body leading-relaxed whitespace-pre-wrap">{complaint.description}</p>
          </div>

          {/* Resolution (if closed) */}
          {complaint.resolution && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5">
              <p className="text-xs font-bold uppercase text-avenue-text-muted mb-2">Resolution / Outcome</p>
              <p className="text-sm text-avenue-text-body leading-relaxed whitespace-pre-wrap">{complaint.resolution}</p>
              {complaint.resolvedAt && (
                <p className="text-xs text-avenue-text-muted mt-2">Closed {fmtDt(complaint.resolvedAt)}</p>
              )}
            </div>
          )}

          {/* Action panel */}
          <ComplaintDetailActions
            complaintId={complaint.id}
            status={complaint.status}
            resolution={complaint.resolution}
          />

          {/* Audit trail */}
          {auditEntries.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5">
              <p className="text-xs font-bold uppercase text-avenue-text-muted mb-3">Activity</p>
              <div className="space-y-3">
                {auditEntries.map(e => (
                  <div key={e.id} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-avenue-indigo mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-avenue-text-body">{e.description}</p>
                      <p className="text-[11px] text-avenue-text-muted mt-0.5">{fmtDt(e.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — member */}
        <div className="space-y-4">
          {complaint.member ? (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <User size={14} className="text-avenue-text-muted" />
                <p className="text-xs font-bold uppercase text-avenue-text-muted">Member</p>
              </div>
              <div>
                <p className="font-bold text-avenue-text-heading">
                  {complaint.member.firstName} {complaint.member.lastName}
                </p>
                <p className="font-mono text-xs text-avenue-text-muted mt-0.5">
                  {complaint.member.memberNumber}
                </p>
              </div>
              <div className="space-y-1.5 text-sm">
                {[
                  { label: "Group",  value: complaint.member.group.name },
                  { label: "Status", value: complaint.member.status.replace(/_/g, " ") },
                  { label: "Phone",  value: complaint.member.phone ?? "—" },
                  { label: "Email",  value: complaint.member.email ?? "—" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between border-b border-[#F8F9FA] py-1 last:border-0 gap-2">
                    <span className="text-avenue-text-muted text-xs shrink-0">{r.label}</span>
                    <span className="font-semibold text-avenue-text-heading text-xs text-right truncate">{r.value}</span>
                  </div>
                ))}
              </div>
              <Link
                href={`/members/${complaint.member.id}`}
                className="text-xs text-avenue-indigo font-semibold hover:underline flex items-center gap-1"
              >
                Full profile <ExternalLink size={11} />
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5">
              <p className="text-xs font-bold uppercase text-avenue-text-muted mb-1">Member</p>
              <p className="text-sm text-avenue-text-muted italic">No member linked — anonymous complaint</p>
            </div>
          )}

          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5 space-y-2 text-sm">
            <p className="text-xs font-bold uppercase text-avenue-text-muted">Details</p>
            {[
              { label: "Type",      value: TYPE_LABELS[complaint.type] ?? complaint.type },
              { label: "Submitted", value: fmtDt(complaint.createdAt) },
              { label: "Updated",   value: fmtDt(complaint.updatedAt) },
              ...(complaint.resolvedAt ? [{ label: "Closed", value: fmtDt(complaint.resolvedAt) }] : []),
            ].map(r => (
              <div key={r.label} className="flex justify-between border-b border-[#F8F9FA] py-1 last:border-0 gap-2">
                <span className="text-avenue-text-muted text-xs shrink-0">{r.label}</span>
                <span className="font-semibold text-avenue-text-heading text-xs text-right">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
