import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-[#6C757D]/10 text-[#6C757D]",
  SUBMITTED: "bg-[#17A2B8]/10 text-[#17A2B8]",
  UNDER_REVIEW: "bg-[#FFC107]/10 text-[#856404]",
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]",
  APPLIED: "bg-brand-indigo/10 text-brand-indigo",
  CANCELLED: "bg-[#6C757D]/10 text-[#6C757D]",
};

const KEY_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  dateOfBirth: "Date of Birth",
  gender: "Gender",
  idNumber: "ID / Passport",
  relationship: "Relationship",
  phone: "Phone",
  email: "Email",
  reason: "Reason",
  notes: "Notes",
};

export default async function HREndorsementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.HR);
  if (!session.user.groupId) notFound();

  const { id } = await params;
  const endorsement = await prisma.endorsement.findFirst({
    where: { id, tenantId: session.user.tenantId, groupId: session.user.groupId },
    include: {
      group: { select: { name: true } },
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!endorsement) notFound();

  const details = (endorsement.changeDetails as Record<string, unknown> | null) ?? {};

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/endorsements" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{endorsement.endorsementNumber}</h1>
          <p className="text-sm text-brand-text-muted mt-1">{endorsement.group.name} · {endorsement.type.replace(/_/g, " ")}</p>
        </div>
        <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLE[endorsement.status] ?? STATUS_STYLE.DRAFT}`}>
          {endorsement.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">Request</h2>
          {[
            { label: "Type", value: endorsement.type.replace(/_/g, " ") },
            { label: "Subject", value: endorsement.member ? `${endorsement.member.firstName} ${endorsement.member.lastName}` : "Group change" },
            { label: "Member No.", value: endorsement.member?.memberNumber ?? "-" },
            { label: "Effective Date", value: new Date(endorsement.effectiveDate).toLocaleDateString("en-KE") },
            { label: "Requested", value: new Date(endorsement.requestedDate).toLocaleDateString("en-KE") },
          ].map((item) => (
            <div key={item.label} className="flex justify-between gap-4 text-sm py-1 border-b border-[#EEEEEE]/50 last:border-0">
              <span className="text-brand-text-muted">{item.label}</span>
              <span className="font-semibold text-brand-text-heading text-right">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">Financial Impact</h2>
          <p className="text-3xl font-bold text-brand-indigo">
            KES {Number(endorsement.proratedAmount ?? 0).toLocaleString("en-KE")}
          </p>
          <p className="text-sm text-brand-text-muted">
            Positive amounts are debits. Negative amounts are credits against the group account.
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">Change Details</h2>
        {Object.entries(details).filter(([, value]) => value !== null && value !== "").map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 text-sm py-1.5 border-b border-[#EEEEEE]/50 last:border-0">
            <span className="text-brand-text-muted">{KEY_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim()}</span>
            <span className="font-semibold text-brand-text-heading text-right">{String(value)}</span>
          </div>
        ))}
        {Object.keys(details).length === 0 && (
          <p className="text-sm text-brand-text-muted">No change details recorded.</p>
        )}
      </div>

      {endorsement.documents.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">Documents</h2>
          {endorsement.documents.map((document) => (
            <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-semibold text-brand-indigo hover:underline">
              <FileText size={14} /> {document.fileName}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
