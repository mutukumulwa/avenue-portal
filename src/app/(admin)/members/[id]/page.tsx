import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Pencil, CreditCard } from "lucide-react";
import { MemberProfileTabs } from "@/components/members/MemberProfileTabs";
import { MemberTransferPanel } from "./transfer/MemberTransferPanel";
import { PortalLoginPanel } from "./PortalLoginPanel";
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

      {/* Tabbed profile */}
      <MemberProfileTabs member={safeMember} age={age} />
    </div>
  );
}
