import { ArrowLeft, CheckCircle, Calculator, Building, XCircle } from "lucide-react";
import Link from "next/link";
import { approveEndorsementAction, rejectEndorsementAction } from "./actions";
import { EndorsementsService } from "@/server/services/endorsement.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";

const STATUS_STYLE: Record<string, string> = {
  DRAFT:        "bg-[#6C757D]/10 text-[#6C757D]",
  SUBMITTED:    "bg-[#17A2B8]/10 text-[#17A2B8]",
  UNDER_REVIEW: "bg-[#FFC107]/10 text-[#856404]",
  APPROVED:     "bg-[#28A745]/10 text-[#28A745]",
  REJECTED:     "bg-[#DC3545]/10 text-[#DC3545]",
  APPLIED:      "bg-avenue-indigo/10 text-avenue-indigo",
  CANCELLED:    "bg-[#6C757D]/10 text-[#6C757D]",
};

// Human-readable labels for change detail keys
const KEY_LABELS: Record<string, string> = {
  firstName: "First Name", lastName: "Last Name", dateOfBirth: "Date of Birth",
  gender: "Gender", idNumber: "ID / Passport", relationship: "Relationship",
  phone: "Phone", email: "Email", memberId: "Member ID", dependentId: "Dependent ID",
  reason: "Reason", lastDay: "Last Day of Cover", refundEligible: "Refund Eligible",
  newPackageId: "New Package ID", oldSalary: "Old Salary (KES)", newSalary: "New Salary (KES)",
  newContribution: "New Contribution (KES)", modificationType: "Modification Type",
  benefitCategory: "Benefit Category", newLimit: "New Sub-Limit (KES)",
  contactPersonName: "New Contact Name", contactPersonPhone: "New Contact Phone",
  contactPersonEmail: "New Contact Email", paymentFrequency: "Payment Frequency",
  address: "New Address", fieldName: "Field Corrected", oldValue: "Old Value",
  newValue: "New Value", docRef: "Document Reference", notes: "Notes",
};

export default async function EndorsementReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;
  const endorsement = await EndorsementsService.getEndorsementById(session.user.tenantId, id);
  if (!endorsement) notFound();

  const details = endorsement.changeDetails as Record<string, string>;
  const amount = Number(endorsement.proratedAmount ?? 0);
  const isCredit = amount < 0;
  const hasFinancialImpact = amount !== 0;
  const canAction = ["SUBMITTED", "UNDER_REVIEW"].includes(endorsement.status);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/endorsements" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-avenue-text-heading font-heading">
                {endorsement.type.replace(/_/g, " ")}
              </h1>
              <span className="font-mono text-xs bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded">
                {endorsement.endorsementNumber}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[endorsement.status] ?? STATUS_STYLE.DRAFT}`}>
                {endorsement.status.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-avenue-text-muted">
                Effective {new Date(endorsement.effectiveDate).toLocaleDateString("en-KE")}
              </span>
            </div>
          </div>
        </div>

        {canAction && (
          <div className="flex gap-2">
            <form action={rejectEndorsementAction}>
              <input type="hidden" name="endorsementId" value={endorsement.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border border-[#DC3545] text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors">
                <XCircle size={15} /> Reject
              </button>
            </form>
            <form action={approveEndorsementAction}>
              <input type="hidden" name="endorsementId" value={endorsement.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-[#28A745] hover:bg-[#218838] text-white transition-colors">
                <CheckCircle size={15} /> Approve & Apply
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Scope */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 flex items-center gap-2">
            <Building size={16} className="text-avenue-indigo" /> Policy Scope
          </h2>
          {[
            { label: "Target Group", value: <Link href={`/groups/${endorsement.group.id}`} className="text-avenue-indigo hover:underline font-semibold">{endorsement.group.name}</Link> },
            { label: "Change Type", value: endorsement.type.replace(/_/g, " ") },
            { label: "Effective Date", value: new Date(endorsement.effectiveDate).toLocaleDateString("en-KE") },
            { label: "Requested", value: new Date(endorsement.requestedDate).toLocaleDateString("en-KE") },
            { label: "Affected Member", value: endorsement.member ? `${endorsement.member.firstName} ${endorsement.member.lastName}` : "Group-level" },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm py-1 border-b border-[#EEEEEE]/50 last:border-0">
              <span className="text-avenue-text-muted">{f.label}</span>
              <span className="font-semibold text-avenue-text-heading">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Financial impact */}
        {hasFinancialImpact ? (
          <div className="rounded-[8px] p-5 shadow-sm space-y-4 relative overflow-hidden text-white"
            style={{ backgroundColor: "#292A83" }}>
            <div className="absolute opacity-10 right-[-20px] top-[-20px]">
              <Calculator size={120} />
            </div>
            <h2 className="font-bold font-heading relative z-10">Financial Impact (Pro-Rata)</h2>
            <div className="bg-black/20 rounded-[8px] p-4 relative z-10">
              <p className="text-xs uppercase font-bold text-white/70 mb-1">Calculated Adjustment</p>
              <p className="text-3xl font-mono font-bold">
                {isCredit ? "−" : "+"}KES {Math.abs(amount).toLocaleString("en-KE")}
              </p>
              <p className="text-xs text-white/70 mt-1">
                {isCredit ? "Credit — reduces next invoice" : "Debit — added to next invoice"}
              </p>
            </div>
            <p className="text-xs text-white/80 leading-relaxed relative z-10">
              Daily rate × days remaining to policy renewal.
              Upon approval this {isCredit ? "credit" : "debit"} is applied to the group&apos;s billing run.
            </p>
          </div>
        ) : (
          <div className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm flex items-center justify-center text-center">
            <div>
              <Calculator size={32} className="mx-auto mb-2 text-avenue-text-muted opacity-40" />
              <p className="text-sm text-avenue-text-muted">No financial impact for this endorsement type.</p>
            </div>
          </div>
        )}
      </div>

      {/* Change details — human-readable */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
          Change Details
        </h2>
        {Object.entries(details).filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm py-1.5 border-b border-[#EEEEEE]/50 last:border-0">
            <span className="text-avenue-text-muted">{KEY_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").trim()}</span>
            <span className="font-semibold text-avenue-text-heading max-w-xs text-right">{v}</span>
          </div>
        ))}
        {Object.keys(details).length === 0 && (
          <p className="text-sm text-avenue-text-muted">No change details recorded.</p>
        )}
      </div>
    </div>
  );
}
