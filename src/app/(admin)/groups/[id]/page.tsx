import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Users, Receipt, FileText, CreditCard, Pencil, Wallet } from "lucide-react";
import { BenefitTiersCard } from "@/components/groups/BenefitTiersCard";
import { SelfFundedPanel } from "./self-funded/SelfFundedPanel";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;

  const group = await prisma.group.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      selfFundedAccount: { include: { transactions: { orderBy: { postedAt: "desc" }, take: 20 } } },
      package: true,
      broker: { select: { name: true } },
      benefitTiers: {
        include: {
          package: { select: { name: true, annualLimit: true } },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      members: {
        where: { status: { not: "TERMINATED" } },
        orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
        select: {
          id: true, memberNumber: true, firstName: true, lastName: true,
          relationship: true, status: true, dateOfBirth: true,
          benefitTier: { select: { name: true } },
          package:     { select: { name: true } },
        },
      },
      invoices:     { orderBy: { createdAt: "desc" }, take: 6 },
      endorsements: {
        orderBy: { createdAt: "desc" }, take: 5,
        select: { id: true, endorsementNumber: true, type: true, status: true, effectiveDate: true },
      },
      _count: { select: { members: true, endorsements: true } },
    },
  });

  const packages = await prisma.package.findMany({
    where: { tenantId: session.user.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, annualLimit: true },
    orderBy: { name: "asc" },
  });

  if (!group) notFound();

  const activeMembers  = group.members.filter(m => m.status === "ACTIVE").length;
  const hasTiers       = group.benefitTiers.length > 0;

  // Annual contribution: if tiers exist, sum per-tier; else flat rate × active members
  const annualContribution = hasTiers
    ? group.benefitTiers.reduce((sum, t) => sum + t._count.members * Number(t.contributionRate), 0)
    : activeMembers * Number(group.contributionRate);

  const statusColor = (s: string) => {
    switch (s) {
      case "ACTIVE":    return "bg-[#28A745]/10 text-[#28A745]";
      case "SUSPENDED": return "bg-[#FFC107]/10 text-[#856404]";
      case "TERMINATED": case "LAPSED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default:          return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  const invStatusColor = (s: string) => {
    switch (s) {
      case "PAID":         return "bg-[#28A745]/10 text-[#28A745]";
      case "SENT":         return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "OVERDUE":      return "bg-[#DC3545]/10 text-[#DC3545]";
      case "PARTIALLY_PAID": return "bg-[#FFC107]/10 text-[#856404]";
      default:             return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  const age = (dob: Date) => new Date().getFullYear() - new Date(dob).getFullYear();

  // Serialize tiers for client component (Decimal → number)
  const serializedTiers = group.benefitTiers.map(t => ({
    ...t,
    contributionRate: Number(t.contributionRate),
    package: { name: t.package.name, annualLimit: Number(t.package.annualLimit) },
  }));

  const serializedPackages = packages.map(p => ({
    ...p,
    annualLimit: Number(p.annualLimit),
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/groups" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{group.name}</h1>
            <p className="text-avenue-text-body text-sm mt-0.5">
              {group.industry ?? "—"} · {group.county ?? "—"}
              {hasTiers && <span className="ml-2 text-avenue-indigo font-semibold">· {group.benefitTiers.length} benefit tiers</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/groups/${id}/edit`}
            className="flex items-center gap-1.5 text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5 px-3 py-1.5 rounded-full transition-colors"
          >
            <Pencil size={13} /> Edit
          </Link>
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${statusColor(group.status)}`}>
            {group.status}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Members",          value: activeMembers,                      icon: Users,    color: "text-avenue-indigo"  },
          { label: "Annual Contribution (KES)", value: annualContribution.toLocaleString("en-KE"), icon: CreditCard, color: "text-[#28A745]" },
          { label: "Total Members",            value: group._count.members,              icon: Receipt,  color: "text-[#17A2B8]"      },
          { label: "Endorsements",             value: group._count.endorsements,         icon: FileText, color: "text-[#6C757D]"      },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
                <Icon size={15} className={s.color} />
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Group details */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Group Details</h2>
          {[
            { label: "Registration No.",   value: group.registrationNumber ?? "—" },
            { label: "Contact Person",     value: group.contactPersonName },
            { label: "Phone",              value: group.contactPersonPhone },
            { label: "Email",              value: group.contactPersonEmail },
            // When tiers exist each tier owns its package — don't show a misleading single package
            ...(!hasTiers ? [
              { label: "Package",                value: group.package.name },
              { label: "Contribution (KES)",     value: Number(group.contributionRate).toLocaleString("en-KE") },
            ] : [
              { label: "Benefit Structure",      value: `${group.benefitTiers.length} tier${group.benefitTiers.length !== 1 ? "s" : ""} — see below` },
            ]),
            { label: "Payment Frequency",  value: group.paymentFrequency },
            { label: "Effective Date",     value: new Date(group.effectiveDate).toLocaleDateString("en-KE") },
            { label: "Renewal Date",       value: new Date(group.renewalDate).toLocaleDateString("en-KE") },
            { label: "Broker",             value: group.broker?.name ?? "Direct" },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm">
              <span className="text-avenue-text-muted">{f.label}</span>
              <span className="font-semibold text-avenue-text-heading">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Recent endorsements */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <div className="flex justify-between items-center border-b border-[#EEEEEE] pb-2 mb-3">
            <h2 className="font-bold text-avenue-text-heading font-heading">Recent Endorsements</h2>
            <Link href={`/endorsements/new?groupId=${group.id}`}
              className="text-avenue-indigo text-xs font-semibold hover:underline">+ New</Link>
          </div>
          <div className="space-y-2">
            {group.endorsements.map(e => (
              <div key={e.id} className="flex justify-between items-center text-sm py-1">
                <div>
                  <Link href={`/endorsements/${e.id}`}
                    className="font-semibold text-avenue-indigo hover:underline font-mono text-xs">{e.endorsementNumber}</Link>
                  <p className="text-xs text-avenue-text-muted">{e.type.replace(/_/g, " ")} · {new Date(e.effectiveDate).toLocaleDateString("en-KE")}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(e.status)}`}>
                  {e.status}
                </span>
              </div>
            ))}
            {group.endorsements.length === 0 && <p className="text-sm text-avenue-text-body">No endorsements yet.</p>}
          </div>
        </div>
      </div>

      {/* Benefit Tiers */}
      <BenefitTiersCard groupId={id} tiers={serializedTiers} packages={serializedPackages} />

      {/* Members table */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
          <h2 className="font-bold text-avenue-text-heading font-heading">Members ({group._count.members})</h2>
          <div className="flex items-center gap-3">
            <Link href="/members/import" className="text-avenue-text-muted text-sm font-semibold hover:text-avenue-indigo">Bulk Import</Link>
            <Link href="/members/new" className="text-avenue-indigo text-sm font-semibold hover:underline">+ Add Member</Link>
          </div>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Member No.</th>
              <th className="px-5 py-3">Relationship</th>
              {hasTiers && <th className="px-5 py-3">Tier</th>}
              <th className="px-5 py-3">Package</th>
              <th className="px-5 py-3">Age</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {group.members.map(m => (
              <tr key={m.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-semibold text-avenue-text-heading">{m.firstName} {m.lastName}</td>
                <td className="px-5 py-3 font-mono text-xs">{m.memberNumber}</td>
                <td className="px-5 py-3">
                  <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                    {m.relationship}
                  </span>
                </td>
                {hasTiers && (
                  <td className="px-5 py-3">
                    {m.benefitTier ? (
                      <span className="bg-avenue-indigo/10 text-avenue-indigo text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {m.benefitTier.name}
                      </span>
                    ) : (
                      <span className="text-avenue-text-muted text-xs">Default</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-3 text-xs text-avenue-text-muted">{m.package.name}</td>
                <td className="px-5 py-3">{age(m.dateOfBirth)}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(m.status)}`}>
                    {m.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <Link href={`/members/${m.id}`} className="text-avenue-indigo hover:underline font-semibold text-xs">View</Link>
                </td>
              </tr>
            ))}
            {group.members.length === 0 && (
              <tr><td colSpan={hasTiers ? 8 : 7} className="px-5 py-8 text-center text-avenue-text-body">No members enrolled.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invoices */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-avenue-text-heading font-heading">Invoice History</h2>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Invoice No.</th>
              <th className="px-5 py-3">Period</th>
              <th className="px-5 py-3">Members</th>
              <th className="px-5 py-3">Amount (KES)</th>
              <th className="px-5 py-3">Due Date</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {group.invoices.map(inv => (
              <tr key={inv.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-mono text-xs font-semibold text-avenue-text-heading">{inv.invoiceNumber}</td>
                <td className="px-5 py-3">{inv.period}</td>
                <td className="px-5 py-3">{inv.memberCount}</td>
                <td className="px-5 py-3 font-semibold">{Number(inv.totalAmount).toLocaleString("en-KE")}</td>
                <td className="px-5 py-3">{new Date(inv.dueDate).toLocaleDateString("en-KE")}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${invStatusColor(inv.status)}`}>
                    {inv.status.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            ))}
            {group.invoices.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-avenue-text-body">No invoices.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Self-funded scheme panel — only shown for SELF_FUNDED groups */}
      {group.fundingMode === "SELF_FUNDED" && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
            <Wallet size={15} className="text-avenue-indigo" />
            <h2 className="font-bold text-avenue-text-heading font-heading">Self-Funded Account</h2>
          </div>
          <div className="p-5">
            <SelfFundedPanel
              groupId={group.id}
              account={group.selfFundedAccount as never}
              minimumBalance={Number(group.selfFundedAccount?.minimumBalance ?? 0)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
