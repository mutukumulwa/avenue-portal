import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Pencil, CreditCard, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { lifecycleService } from "@/server/services/lifecycle.service";
import {
  lapseManuallyAction, reinstateWithinCatchupAction,
  initiateCoolingOffCancellationAction, initiateStandardCancellationAction,
  terminateForFraudAction, terminateForBreachAction, recordDeathAction,
} from "./lifecycle-actions";
import { MemberProfileTabs } from "@/components/members/MemberProfileTabs";
import { FamilyTreeView } from "@/components/members/FamilyTreeView";
import { MemberTransferPanel } from "./transfer/MemberTransferPanel";
import { PortalLoginPanel } from "./PortalLoginPanel";
import { BranchEnrollmentPanel } from "./webauthn/BranchEnrollmentPanel";
import QRCode from "react-qr-code";

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;

  const member = await prisma.member.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      group: { select: { id: true, name: true, renewalDate: true } },
      package: {
        select: {
          name: true,
          currentVersion: {
            select: {
              benefits: {
                select: {
                  id: true,
                  category: true,
                  annualSubLimit: true,
                  copayPercentage: true,
                  waitingPeriodDays: true,
                },
                orderBy: { annualSubLimit: "desc" },
              },
            },
          },
        },
      },
      dependents: {
        select: {
          id: true, firstName: true, lastName: true, memberNumber: true,
          relationship: true, dateOfBirth: true, status: true,
        },
        orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
      },
      benefitUsages: {
        select: {
          id: true, amountUsed: true,
          benefitConfig: { select: { category: true, annualSubLimit: true } },
        },
        orderBy: { lastUpdated: "desc" },
      },
      claims: {
        select: {
          id: true, claimNumber: true, serviceType: true,
          billedAmount: true, approvedAmount: true, status: true, createdAt: true,
          provider: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      preauths: {
        select: {
          id: true, preauthNumber: true, estimatedCost: true,
          approvedAmount: true, status: true, createdAt: true,
          provider: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      activityLogs: {
        select: { id: true, action: true, description: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      correspondences: {
        select: {
          id: true, type: true, channel: true,
          subject: true, body: true, status: true, sentAt: true,
        },
        orderBy: { sentAt: "desc" },
        take: 30,
      },
      user: { select: { email: true, isActive: true } },
    },
  });

  if (!member) notFound();

  // Data for transfer panel
  const [allGroups, groupTiers] = await Promise.all([
    prisma.group.findMany({
      where: { tenantId: session.user.tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.groupBenefitTier.findMany({
      where: { groupId: member.groupId },
      select: { id: true, name: true, package: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const age = Math.floor(
    (new Date().getTime() - new Date(member.dateOfBirth).getTime()) / (1000 * 3600 * 24 * 365.25)
  );

  // Process 12: lifecycle event records
  const [lapseRecord, cancellationRecord, terminationRecord] = await Promise.all([
    lifecycleService.getLapseRecord(id, session.user.tenantId),
    lifecycleService.getCancellationRecord(id, session.user.tenantId),
    lifecycleService.getTerminationRecord(id, session.user.tenantId),
  ]);

  // Limit comes from the package benefit schedule (source of truth), not from usage records
  const totalLimit = (member.package.currentVersion?.benefits ?? []).reduce(
    (s, b) => s + Number(b.annualSubLimit), 0
  );
  const totalUsed = member.benefitUsages.reduce((s, u) => s + Number(u.amountUsed), 0);

  const statusColor = (s: string) => {
    switch (s) {
      case "ACTIVE": return "bg-[#28A745]/10 text-[#28A745]";
      case "SUSPENDED": return "bg-[#FFC107]/10 text-[#856404]";
      case "TERMINATED": case "LAPSED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  // Build a plain-JSON-safe object with only the fields the client component needs.
  // All Decimal → number, all Date → ISO string — no Prisma objects cross the boundary.
  const safeMember = {
    id: member.id,
    firstName: member.firstName,
    otherNames: member.otherNames,
    lastName: member.lastName,
    memberNumber: member.memberNumber,
    status: member.status,
    dateOfBirth: member.dateOfBirth.toISOString(),
    gender: member.gender,
    idNumber: member.idNumber,
    phone: member.phone,
    email: member.email,
    relationship: member.relationship,
    enrollmentDate: member.enrollmentDate.toISOString(),
    activationDate: member.activationDate?.toISOString() ?? null,
    smartCardNumber: member.smartCardNumber,
    group: {
      id: member.group.id,
      name: member.group.name,
      renewalDate: member.group.renewalDate.toISOString(),
    },
    package: {
      name: member.package.name,
      currentVersion: member.package.currentVersion
        ? {
            benefits: member.package.currentVersion.benefits.map(b => ({
              id: b.id,
              category: b.category,
              annualSubLimit: Number(b.annualSubLimit),
              copayPercentage: Number(b.copayPercentage),
              waitingPeriodDays: Number(b.waitingPeriodDays),
            })),
          }
        : null,
    },
    dependents: member.dependents.map(d => ({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      memberNumber: d.memberNumber,
      relationship: d.relationship,
      dateOfBirth: d.dateOfBirth.toISOString(),
      status: d.status,
    })),
    benefitUsages: member.benefitUsages.map(u => ({
      id: u.id,
      amountUsed: Number(u.amountUsed),
      benefitConfig: {
        category: u.benefitConfig.category,
        annualSubLimit: Number(u.benefitConfig.annualSubLimit),
      },
    })),
    claims: member.claims.map(c => ({
      id: c.id,
      claimNumber: c.claimNumber,
      serviceType: String(c.serviceType),
      billedAmount: Number(c.billedAmount),
      approvedAmount: Number(c.approvedAmount),
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      provider: { name: c.provider.name },
    })),
    preauths: member.preauths.map(p => ({
      id: p.id,
      preauthNumber: p.preauthNumber,
      estimatedCost: Number(p.estimatedCost),
      approvedAmount: p.approvedAmount !== null ? Number(p.approvedAmount) : null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      provider: { name: p.provider.name },
    })),
    activityLogs: member.activityLogs.map(l => ({
      id: l.id,
      action: l.action,
      description: l.description,
      createdAt: l.createdAt.toISOString(),
    })),
    correspondence: member.correspondences.map(c => ({
      id: c.id,
      type: c.type,
      channel: c.channel,
      subject: c.subject,
      body: c.body,
      status: c.status,
      sentAt: c.sentAt.toISOString(),
    })),
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/members" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors shrink-0">
            <ArrowLeft size={20} />
          </Link>
          <div className="bg-white p-1.5 rounded-lg border border-[#EEEEEE] shadow-sm shrink-0 hidden md:block">
            <QRCode 
              value={JSON.stringify({ n: member.memberNumber, s: member.status })} 
              size={56} 
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">
              {member.firstName} {member.otherNames ? member.otherNames + " " : ""}{member.lastName}
            </h1>
            <p className="text-avenue-text-body text-sm mt-0.5 font-mono">{member.memberNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/members/${id}/onboarding`}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#28A745] border border-[#28A745]/30 hover:bg-[#28A745]/5 px-3 py-1.5 rounded-full transition-colors"
          >
            Onboarding
          </Link>
          <Link
            href={`/members/${id}/letters`}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#6C757D] border border-[#6C757D]/30 hover:bg-[#6C757D]/5 px-3 py-1.5 rounded-full transition-colors"
          >
            Letters
          </Link>
          <Link
            href={`/members/${id}/card`}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#17A2B8] border border-[#17A2B8]/30 hover:bg-[#17A2B8]/5 px-3 py-1.5 rounded-full transition-colors"
          >
            <CreditCard size={13} /> Card
          </Link>
          <Link
            href={`/members/${id}/edit`}
            className="flex items-center gap-1.5 text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5 px-3 py-1.5 rounded-full transition-colors"
          >
            <Pencil size={13} /> Edit
          </Link>
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${statusColor(member.status)}`}>
            {member.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* KPI summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Annual Limit (KES)", value: totalLimit.toLocaleString(), color: "text-avenue-indigo" },
          { label: "Utilised (KES)", value: totalUsed.toLocaleString(), color: "text-[#FFC107]" },
          { label: "Remaining (KES)", value: Math.max(0, totalLimit - totalUsed).toLocaleString(), color: "text-[#28A745]" },
          { label: "Total Claims", value: member.claims.length.toString(), color: "text-[#17A2B8]" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Transfer / tier-change panel */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
        <h3 className="text-sm font-bold text-avenue-text-heading mb-3">Transfers &amp; Tier Changes</h3>
        <MemberTransferPanel
          memberId={member.id}
          currentGroupId={member.groupId}
          currentTierId={member.benefitTierId ?? null}
          groups={allGroups}
          tiers={groupTiers.map(t => ({ id: t.id, name: t.name, packageName: t.package.name }))}
        />
      </div>

      <PortalLoginPanel
        memberId={member.id}
        defaultEmail={member.email}
        portalUser={member.user}
      />

      <BranchEnrollmentPanel memberId={member.id} />

      {/* D-10: Family tree */}
      {member.relationship === "PRINCIPAL" && (
        <FamilyTreeView
          principal={{
            id: member.id,
            memberNumber: member.memberNumber,
            firstName: member.firstName,
            lastName: member.lastName,
            relationship: member.relationship,
            status: member.status,
            dateOfBirth: member.dateOfBirth,
          }}
          dependants={member.dependents.map((d) => ({
            id: d.id,
            memberNumber: d.memberNumber,
            firstName: d.firstName,
            lastName: d.lastName,
            relationship: d.relationship,
            status: d.status,
            dateOfBirth: d.dateOfBirth,
          }))}
          highlightId={id}
        />
      )}

      {/* Tabbed profile */}
      <MemberProfileTabs member={safeMember} age={age} />

      {/* ── Process 12: Lifecycle management panel ────────────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-5">
        <h2 className="font-bold text-avenue-text-heading font-heading text-sm border-b border-[#EEEEEE] pb-2">
          Lifecycle Management
        </h2>

        {/* Lapse record */}
        {lapseRecord && !lapseRecord.reinstatedAt && (
          <div className={`rounded-[8px] p-4 border space-y-3 ${lapseRecord.catchupExpired ? "bg-[#DC3545]/10 border-[#DC3545]/30" : "bg-[#FFC107]/10 border-[#FFC107]/30"}`}>
            <div className="flex items-start gap-2">
              <Clock size={15} className={lapseRecord.catchupExpired ? "text-[#DC3545] mt-0.5" : "text-[#856404] mt-0.5"} />
              <div>
                <p className={`font-semibold text-sm ${lapseRecord.catchupExpired ? "text-[#DC3545]" : "text-[#856404]"}`}>
                  {lapseRecord.catchupExpired ? "Catch-up window expired — re-assessment required" : "Lapsed — catch-up window open"}
                </p>
                <p className="text-xs text-avenue-text-muted mt-0.5">
                  Lapsed: {new Date(lapseRecord.lapseDate).toLocaleDateString("en-KE")} ·
                  Catch-up deadline: {new Date(lapseRecord.catchupDeadline).toLocaleDateString("en-KE")}
                </p>
              </div>
            </div>
            {!lapseRecord.catchupExpired ? (
              <form action={reinstateWithinCatchupAction}>
                <input type="hidden" name="memberId" value={id} />
                <button type="submit"
                  className="bg-[#28A745] text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-[#218838] transition-colors">
                  Reinstate (within catch-up window)
                </button>
              </form>
            ) : (
              <Link href={`/quotations/new?groupId=${member.group.id}`}
                className="inline-block bg-avenue-indigo text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-avenue-secondary transition-colors">
                Start New Assessment
              </Link>
            )}
          </div>
        )}

        {/* Terminal state banners */}
        {cancellationRecord && (
          <div className="bg-[#6C757D]/10 border border-[#6C757D]/30 rounded-[8px] p-3 flex items-center gap-2">
            <XCircle size={14} className="text-[#6C757D]" />
            <p className="text-xs text-[#6C757D]">
              <strong>{cancellationRecord.isCoolingOff ? "Cooling-off cancellation" : "Standard cancellation"}</strong> ·
              Effective {new Date(cancellationRecord.effectiveDate).toLocaleDateString("en-KE")} ·
              Refund: KES {Number(cancellationRecord.refundAmount).toLocaleString("en-KE")}
            </p>
          </div>
        )}
        {terminationRecord && (
          <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-[8px] p-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#DC3545]" />
            <p className="text-xs text-[#DC3545]">
              <strong>Terminated: {terminationRecord.terminationType}</strong> ·
              {new Date(terminationRecord.processedAt).toLocaleDateString("en-KE")} ·
              {terminationRecord.reasonCode.replace(/_/g," ")}
              {terminationRecord.blacklisted && " · Blacklisted"}
            </p>
          </div>
        )}

        {/* Action buttons for ACTIVE members */}
        {member.status === "ACTIVE" && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase text-avenue-text-muted tracking-wide">Actions</p>
            <div className="flex flex-wrap gap-2">
              {/* Cooling-off cancellation */}
              <form action={initiateCoolingOffCancellationAction}>
                <input type="hidden" name="memberId" value={id} />
                <button type="submit"
                  className="border border-[#6C757D] text-[#6C757D] px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#6C757D]/10 transition-colors">
                  Cooling-Off Cancel
                </button>
              </form>
              {/* Standard cancellation */}
              <form action={initiateStandardCancellationAction}>
                <input type="hidden" name="memberId" value={id} />
                <button type="submit"
                  className="border border-[#6C757D] text-[#6C757D] px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#6C757D]/10 transition-colors">
                  Standard Cancel
                </button>
              </form>
              {/* Manual lapse */}
              <form action={lapseManuallyAction}>
                <input type="hidden" name="memberId" value={id} />
                <button type="submit"
                  className="border border-[#FFC107] text-[#856404] px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#FFC107]/10 transition-colors">
                  Lapse Manually
                </button>
              </form>
            </div>

            {/* Death recording */}
            <form action={recordDeathAction} className="flex gap-2 items-center">
              <input type="hidden" name="memberId" value={id} />
              <input name="proofDocUrl" type="url" required placeholder="Proof of death document URL"
                className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-1.5 text-xs focus:ring-1 focus:ring-avenue-indigo focus:outline-none" />
              <button type="submit"
                className="border border-[#DC3545] text-[#DC3545] px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#DC3545]/10 transition-colors whitespace-nowrap">
                Record Death
              </button>
            </form>

            {/* Fraud / Breach termination (admin only) */}
            <div className="border-t border-[#EEEEEE] pt-3 space-y-2">
              <p className="text-[10px] font-bold uppercase text-[#DC3545] tracking-wide">Termination (requires senior approval)</p>
              <form action={terminateForBreachAction} className="flex gap-2 items-center">
                <input type="hidden" name="memberId" value={id} />
                <select name="reasonCode" required
                  className="border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
                  <option value="">Select reason…</option>
                  <option value="MISREPRESENTATION">Misrepresentation</option>
                  <option value="TERMS_BREACH">Terms breach</option>
                  <option value="NON_PAYMENT">Non-payment</option>
                </select>
                <input name="narrative" type="text" placeholder="Narrative (optional)"
                  className="flex-1 border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs" />
                <button type="submit"
                  className="border border-[#DC3545] text-[#DC3545] px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#DC3545]/10 transition-colors whitespace-nowrap">
                  Terminate (Breach)
                </button>
              </form>
              <form action={terminateForFraudAction} className="flex gap-2 items-center">
                <input type="hidden" name="memberId" value={id} />
                <select name="reasonCode" required
                  className="border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
                  <option value="">Select fraud type…</option>
                  <option value="CLAIM_FRAUD">Claim fraud confirmed</option>
                  <option value="IDENTITY_FRAUD">Identity fraud</option>
                  <option value="FABRICATED_DOCUMENTS">Fabricated documents</option>
                </select>
                <input name="narrative" type="text" placeholder="Supporting case reference"
                  className="flex-1 border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-xs" />
                <button type="submit"
                  className="bg-[#DC3545] text-white px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#C82333] transition-colors whitespace-nowrap">
                  Terminate + Blacklist
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Reinstatement link for LAPSED members already showing catch-up UI above */}
        {!["ACTIVE","LAPSED"].includes(member.status) && !lapseRecord && !cancellationRecord && !terminationRecord && (
          <p className="text-xs text-avenue-text-muted italic">No active lifecycle event recorded.</p>
        )}
      </div>
    </div>
  );
}
