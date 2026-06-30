import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, CreditCard, UserCheck, Bell } from "lucide-react";
import Link from "next/link";
import {
  initiateOnboardingAction, saveKycAction, issueDigitalCardAction,
  queuePhysicalCardAction, updateCardStatusAction, sendWelcomeAction,
  markPortalProvisionedAction,
} from "./actions";

const ITEM_LABEL: Record<string, string> = {
  KYC_COMPLETION:             "KYC Completion",
  PORTAL_PROVISIONING:        "Portal Account Provisioned",
  DIGITAL_CARD_GENERATED:     "Digital Card Generated",
  PHYSICAL_CARD_DISPATCHED:   "Physical Card Dispatched",
  WELCOME_COMMUNICATION_SENT: "Welcome Communications Sent",
  PROVIDER_NOTIFIED:          "Provider Network Notified",
  BIOMETRIC_ENROLLED:         "Biometric Enrolled",
};

const CARD_STATUS_LABEL: Record<string, string> = {
  PENDING_ISSUANCE: "Pending Issuance",
  ISSUED:     "Issued",
  DISPATCHED: "Dispatched",
  DELIVERED:  "Delivered",
  ACTIVATED:  "Activated",
  LOST:       "Lost",
  DAMAGED:    "Damaged",
  REPLACED:   "Replaced",
};

export default async function MemberOnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const member = await prisma.member.findUnique({
    where: { id, tenantId },
    select: {
      id: true, memberNumber: true, firstName: true, lastName: true,
      status: true, email: true, phone: true,
      group: { select: { name: true } },
    },
  });
  if (!member) notFound();

  const [checklistItems, kycRecord, cards] = await Promise.all([
    prisma.onboardingChecklistItem.findMany({
      where: { memberId: id, tenantId },
      orderBy: { itemType: "asc" },
    }),
    prisma.memberKycRecord.findUnique({
      where: { memberId: id },
      include: { documents: { orderBy: { uploadedAt: "desc" } } },
    }),
    prisma.membershipCard.findMany({
      where: { memberId: id, tenantId, isActive: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  const noChecklist = checklistItems.length === 0;
  const getItemStatus = (type: string) =>
    checklistItems.find((i) => i.itemType === type)?.status ?? "PENDING";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/members/${id}`} className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-brand-text-heading font-heading">
            Onboarding — {member.firstName} {member.lastName}
          </h1>
          <p className="text-sm text-brand-text-muted mt-0.5">
            {member.memberNumber} · {member.group.name} · status: {member.status.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {/* Initiate checklist if not started */}
      {noChecklist && (
        <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-[#856404]" />
            <p className="text-sm text-[#856404] font-semibold">Onboarding checklist not yet started</p>
          </div>
          <form action={initiateOnboardingAction}>
            <input type="hidden" name="memberId" value={id} />
            <button type="submit"
              className="bg-brand-indigo text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors">
              Start Onboarding
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: checklist */}
        <div className="space-y-3">
          <h2 className="font-semibold text-brand-text-heading text-sm uppercase tracking-wide">Checklist</h2>
          {checklistItems.length === 0 ? (
            <p className="text-xs text-brand-text-muted">No items yet</p>
          ) : (
            <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm divide-y divide-[#EEEEEE]">
              {checklistItems.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  {item.status === "COMPLETED"
                    ? <CheckCircle size={15} className="text-[#28A745] shrink-0" />
                    : item.status === "FAILED"
                    ? <AlertTriangle size={15} className="text-[#DC3545] shrink-0" />
                    : <Clock size={15} className="text-brand-text-muted shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-text-heading leading-tight">
                      {ITEM_LABEL[item.itemType] ?? item.itemType}
                    </p>
                    {item.completedAt && (
                      <p className="text-[11px] text-brand-text-muted mt-0.5">
                        {new Date(item.completedAt).toLocaleDateString("en-UG")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: action panels */}
        <div className="col-span-2 space-y-5">

          {/* ── KYC ─────────────────────────────────────────── */}
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserCheck size={16} className={getItemStatus("KYC_COMPLETION") === "COMPLETED" ? "text-[#28A745]" : "text-brand-text-muted"} />
              <h3 className="font-semibold text-brand-text-heading text-sm">KYC</h3>
              {kycRecord && (
                <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${kycRecord.status === "COMPLETED" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#FFC107]/10 text-[#856404]"}`}>
                  {kycRecord.status}
                </span>
              )}
            </div>

            {kycRecord?.iprsNote && (
              <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[6px] p-3 text-xs text-[#856404]">
                <strong>IPRS:</strong> {kycRecord.iprsNote}
              </div>
            )}

            <form action={saveKycAction} className="grid grid-cols-3 gap-3">
              <input type="hidden" name="memberId" value={id} />
              <div>
                <label className="block text-xs font-semibold text-brand-text-muted mb-1">ID Type</label>
                <select name="govIdType" defaultValue={kycRecord?.govIdType ?? ""}
                  className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-sm">
                  <option value="">— Select —</option>
                  <option value="NATIONAL_ID">National ID</option>
                  <option value="PASSPORT">Passport</option>
                  <option value="BIRTH_CERT">Birth Certificate</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-text-muted mb-1">ID Number</label>
                <input name="govIdNumber" type="text" defaultValue={kycRecord?.govIdNumber ?? ""}
                  className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-text-muted mb-1">Photo URL</label>
                <input name="photoUrl" type="url" defaultValue={kycRecord?.photoUrl ?? ""}
                  placeholder="https://…"
                  className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-3 flex justify-end">
                <button type="submit"
                  className="bg-brand-indigo text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors">
                  Save KYC
                </button>
              </div>
            </form>

            {kycRecord && kycRecord.documents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-brand-text-muted mb-2">Uploaded Documents</p>
                <div className="flex flex-wrap gap-2">
                  {kycRecord.documents.map((doc) => (
                    <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                      className={`text-[11px] px-2 py-1 rounded border ${doc.isVerified ? "border-[#28A745]/40 text-[#28A745] bg-[#28A745]/5" : "border-[#EEEEEE] text-brand-text-muted"}`}>
                      {doc.docType.replace(/_/g, " ")} {doc.isVerified ? "✓" : ""}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Cards ────────────────────────────────────────── */}
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className={getItemStatus("DIGITAL_CARD_GENERATED") === "COMPLETED" ? "text-[#28A745]" : "text-brand-text-muted"} />
              <h3 className="font-semibold text-brand-text-heading text-sm">Membership Cards</h3>
            </div>

            {cards.length > 0 && (
              <div className="space-y-2">
                {cards.map((card) => (
                  <div key={card.id} className="flex items-center justify-between border border-[#EEEEEE] rounded-[6px] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-text-heading">
                        {card.cardType} card
                        <span className="ml-2 font-mono text-xs text-brand-text-muted">{card.cardNumber}</span>
                      </p>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        {CARD_STATUS_LABEL[card.status]}
                        {card.issuedAt && ` · issued ${new Date(card.issuedAt).toLocaleDateString("en-UG")}`}
                      </p>
                    </div>
                    {["ISSUED","DISPATCHED","DELIVERED"].includes(card.status) && (
                      <form action={updateCardStatusAction}>
                        <input type="hidden" name="memberId" value={id} />
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="newStatus" value={
                          card.status === "ISSUED" ? "DISPATCHED" :
                          card.status === "DISPATCHED" ? "DELIVERED" : "ACTIVATED"
                        } />
                        <button type="submit"
                          className="text-xs font-semibold text-brand-indigo hover:underline">
                          Mark {card.status === "ISSUED" ? "Dispatched" : card.status === "DISPATCHED" ? "Delivered" : "Activated"} →
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {getItemStatus("DIGITAL_CARD_GENERATED") !== "COMPLETED" && (
                <form action={issueDigitalCardAction}>
                  <input type="hidden" name="memberId" value={id} />
                  <button type="submit"
                    className="bg-brand-indigo text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors">
                    Issue Digital Card
                  </button>
                </form>
              )}
              <form action={queuePhysicalCardAction}>
                <input type="hidden" name="memberId" value={id} />
                <input type="hidden" name="isSmart" value="false" />
                <button type="submit"
                  className="border border-brand-indigo text-brand-indigo px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-brand-indigo hover:text-white transition-colors">
                  Queue Physical Card
                </button>
              </form>
              <form action={queuePhysicalCardAction}>
                <input type="hidden" name="memberId" value={id} />
                <input type="hidden" name="isSmart" value="true" />
                <button type="submit"
                  className="border border-[#6C757D] text-[#6C757D] px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-[#6C757D] hover:text-white transition-colors">
                  Queue Smart Card
                </button>
              </form>
            </div>
          </div>

          {/* ── Communications & Portal ───────────────────────── */}
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-brand-text-muted" />
              <h3 className="font-semibold text-brand-text-heading text-sm">Communications & Portal</h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              {getItemStatus("WELCOME_COMMUNICATION_SENT") !== "COMPLETED" && (
                <form action={sendWelcomeAction}>
                  <input type="hidden" name="memberId" value={id} />
                  <button type="submit"
                    className="bg-[#28A745] text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-[#218838] transition-colors">
                    Send Welcome Communications
                  </button>
                </form>
              )}
              {getItemStatus("PORTAL_PROVISIONING") !== "COMPLETED" && (
                <form action={markPortalProvisionedAction}>
                  <input type="hidden" name="memberId" value={id} />
                  <button type="submit"
                    className="border border-brand-indigo text-brand-indigo px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-brand-indigo hover:text-white transition-colors">
                    Mark Portal Provisioned
                  </button>
                </form>
              )}
              {getItemStatus("WELCOME_COMMUNICATION_SENT") === "COMPLETED" && (
                <span className="text-xs text-[#28A745] font-semibold flex items-center gap-1">
                  <CheckCircle size={13} /> Welcome sent
                </span>
              )}
              {getItemStatus("PORTAL_PROVISIONING") === "COMPLETED" && (
                <span className="text-xs text-[#28A745] font-semibold flex items-center gap-1">
                  <CheckCircle size={13} /> Portal provisioned
                </span>
              )}
            </div>
            <div className="text-xs text-brand-text-muted">
              Email: <strong>{member.email ?? "—"}</strong> · Phone: <strong>{member.phone ?? "—"}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
