import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { WithdrawRequest } from "./WithdrawRequest";
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

export default async function HREndorsementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ raised?: string }>;
}) {
  const session = await requireRole(ROLES.HR);
  if (!session.user.groupId) notFound();

  const { id } = await params;
  const { raised } = await searchParams;
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

  // UAT-HF P08.01 (DEF-004) — "cancel/withdraw before approval". Only the person
  // who raised it, and only while it is still undecided. The server enforces
  // both; this only decides whether to render the control.
  const canWithdraw =
    endorsement.requestedBy === session.user.id &&
    ["DRAFT", "SUBMITTED", "UNDER_REVIEW"].includes(endorsement.status);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* P08.01: a submitted request that says nothing is indistinguishable from
          one that failed. The operator arrives here straight from the leaver
          form, so this is where the confirmation belongs. */}
      {raised && (
        <div role="status" className="rounded-[8px] border border-[#28A745]/30 bg-[#28A745]/5 p-4">
          <p className="text-sm font-semibold text-[#28A745]">Request sent to your scheme administrator.</p>
          <p className="text-xs text-brand-text-muted mt-1">
            Reference {endorsement.endorsementNumber}. Cover is unchanged until they
            approve it — you can withdraw this request until then.
          </p>
        </div>
      )}

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
            { label: "Effective Date", value: new Date(endorsement.effectiveDate).toLocaleDateString("en-UG") },
            { label: "Requested", value: new Date(endorsement.requestedDate).toLocaleDateString("en-UG") },
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
            UGX {Number(endorsement.proratedAmount ?? 0).toLocaleString("en-UG")}
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

      {canWithdraw && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">
            Change your mind?
          </h2>
          <p className="text-sm text-brand-text-muted">
            This request is still awaiting your scheme administrator. You can withdraw
            it yourself rather than asking them to reject it.
          </p>
          <WithdrawRequest endorsementId={endorsement.id} />
        </div>
      )}

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
