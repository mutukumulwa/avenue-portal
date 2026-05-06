import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BrokerComplianceService } from "@/server/services/broker-compliance.service";
import {
  approveCommissionScheduleAction,
  approveBrokerPayoutBatchAction,
  completeBrokerPayoutBatchAction,
  createBrokerProducerAction,
  createCommissionScheduleAction,
  generateBrokerPayoutBatchAction,
  recordBrokerKycDocumentAction,
  rejectBrokerKycDocumentAction,
  rejectCommissionScheduleAction,
  setBrokerProducerStatusAction,
  submitBrokerPayoutBatchAction,
  submitCommissionScheduleAction,
  verifyBrokerKycDocumentAction,
} from "../actions";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  FileCheck2,
  GitBranch,
  Landmark,
  Pencil,
  ReceiptText,
  ShieldCheck,
  Users,
} from "lucide-react";

const tabs = [
  { key: "overview", label: "Overview", icon: BriefcaseBusiness },
  { key: "producers", label: "Producers", icon: Users },
  { key: "kyc", label: "KYC", icon: FileCheck2 },
  { key: "schedules", label: "Schedules", icon: ReceiptText },
  { key: "ledger", label: "Ledger", icon: Banknote },
  { key: "payouts", label: "Payouts", icon: Landmark },
];

function statusBadge(status: string) {
  switch (status) {
    case "CRITICAL":
      return "bg-[#6F1C1C] text-white";
    case "HIGH":
      return "bg-[#DC3545]/10 text-[#DC3545]";
    case "MEDIUM":
      return "bg-[#FFC107]/15 text-[#8A6400]";
    case "LOW":
      return "bg-[#6C757D]/10 text-[#6C757D]";
    case "ACTIVE":
    case "VERIFIED":
    case "APPROVED":
    case "COMPLETED":
    case "PAID":
      return "bg-[#28A745]/10 text-[#28A745]";
    case "PENDING_APPROVAL":
    case "PENDING_REVIEW":
    case "PENDING_RECONCILIATION":
    case "DRAFT":
    case "IN_TRANSIT":
      return "bg-[#FFC107]/15 text-[#8A6400]";
    case "REJECTED":
    case "EXPIRED":
    case "CLAWED_BACK":
    case "PARTIAL_FAILURE":
      return "bg-[#DC3545]/10 text-[#DC3545]";
    default:
      return "bg-[#6C757D]/10 text-[#6C757D]";
  }
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full whitespace-nowrap ${statusBadge(status)}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-avenue-text-muted">{label}</span>
      <span className="font-semibold text-avenue-text-heading text-right">{value || "-"}</span>
    </div>
  );
}

function rate(value: unknown) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function BrokerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id } = await params;
  const { tab: requestedTab = "overview" } = await searchParams;
  const activeTab = tabs.some(t => t.key === requestedTab) ? requestedTab : "overview";

  const broker = await prisma.broker.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      parent: { select: { id: true, name: true, brokerCode: true } },
      children: { select: { id: true, name: true, brokerCode: true, status: true }, orderBy: { name: "asc" } },
      groups: {
        include: { package: { select: { name: true } }, _count: { select: { members: true } } },
        orderBy: { createdAt: "desc" },
      },
      producers: { include: { groups: { select: { id: true, name: true } } }, orderBy: { producerName: "asc" } },
      kycDocuments: { orderBy: [{ status: "asc" }, { expiresAt: "asc" }] },
      commissionSchedules: {
        include: { tiers: { orderBy: { tierOrder: "asc" } } },
        orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
      },
      commissionLedger: {
        include: {
          schedule: { select: { scheduleName: true } },
          payoutBatch: { select: { batchReference: true, status: true } },
        },
        orderBy: { earnedPeriodStart: "desc" },
        take: 100,
      },
      _count: { select: { groups: true, producers: true, kycDocuments: true, commissionSchedules: true } },
    },
  });

  if (!broker) notFound();

  const payoutBatches = await prisma.commissionPayoutBatch.findMany({
    where: { entries: { some: { brokerId: broker.id } } },
    include: { entries: { where: { brokerId: broker.id }, select: { id: true, netPayable: true } } },
    orderBy: { batchDate: "desc" },
    take: 25,
  });
  const complianceFlags = await BrokerComplianceService.evaluateBroker(broker.id, session.user.tenantId);

  const ledgerEarned = broker.commissionLedger.reduce((sum, entry) => sum + Number(entry.grossCommission), 0);
  const ledgerPayable = broker.commissionLedger
    .filter(entry => entry.state === "PAYABLE")
    .reduce((sum, entry) => sum + Number(entry.netPayable), 0);
  const missingKyc = broker.kycDocuments.filter(doc => doc.status !== "VERIFIED").length;
  const kycExpiryCutoff = new Date();
  kycExpiryCutoff.setDate(kycExpiryCutoff.getDate() + 45);
  const expiringKyc = broker.kycDocuments.filter(doc => doc.expiresAt && doc.expiresAt <= kycExpiryCutoff).length;

  const kpis = [
    { label: "Groups", value: broker._count.groups, color: "text-avenue-indigo", icon: Users },
    { label: "Ledger Earned", value: formatCurrency(ledgerEarned), color: "text-[#28A745]", icon: Banknote },
    { label: "Payable", value: formatCurrency(ledgerPayable), color: "text-[#17A2B8]", icon: ReceiptText },
    { label: "Compliance Flags", value: complianceFlags.length, color: complianceFlags.length > 0 ? "text-[#DC3545]" : "text-[#28A745]", icon: ShieldCheck },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/brokers" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors mt-1">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{broker.name}</h1>
              <Badge status={broker.status} />
              <Badge status={broker.intermediaryCategory} />
            </div>
            <p className="text-avenue-text-body text-sm mt-1">
              {broker.brokerCode ?? "No source code"} · {label(broker.commissionBasis)} · {broker.requiresIraRegistration ? `IRA ${broker.licenseNumber ?? "not captured"}` : "IRA not required"} · {broker.contactPerson}
            </p>
          </div>
        </div>
        <Link href={`/brokers/${broker.id}/edit`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5 px-3 py-1.5 rounded-full transition-colors">
          <Pencil size={13} /> Edit
        </Link>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
              <p className="text-xs text-avenue-text-muted font-bold uppercase inline-flex items-center gap-1.5">
                <Icon size={13} /> {item.label}
              </p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${item.color}`}>{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 bg-[#F8F9FA] rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={`/brokers/${broker.id}?tab=${t.key}`}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === t.key ? "bg-white text-avenue-indigo shadow-sm" : "text-avenue-text-muted hover:text-avenue-text-heading"
              }`}
            >
              <Icon size={14} /> {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
              <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Profile</h2>
              <Field label="Legal Name" value={broker.legalName ?? broker.name} />
              <Field label="Trading Name" value={broker.tradingName} />
              <Field label="Category" value={label(broker.intermediaryCategory)} />
              <Field label="Hierarchy Type" value={label(broker.brokerType)} />
              <Field label="Payout Basis" value={label(broker.commissionBasis)} />
              <Field label="Referral Fee" value={broker.referralFeeAmount ? formatCurrency(broker.referralFeeAmount) : "-"} />
              <Field label="Payout Eligible" value={broker.canReceiveCommission ? "Yes" : "No"} />
              <Field label="Email" value={broker.email} />
              <Field label="Phone" value={broker.phone} />
              <Field label="Address" value={broker.address} />
              <Field label="KRA PIN" value={broker.kraPin} />
              <Field label="VAT" value={broker.vatRegistered ? broker.vatNumber ?? "Registered" : "Not registered"} />
              <Field label="Bank Ref" value={broker.bankAccountReference} />
              <Field label="M-Pesa Paybill" value={broker.mpesaPaybillNumber} />
              {broker.sourceDescription && (
                <div className="pt-2 text-sm text-avenue-text-body">
                  {broker.sourceDescription}
                </div>
              )}
            </div>

            <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
              <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Compliance</h2>
              <Field label="IRA Required" value={broker.requiresIraRegistration ? "Yes" : "No"} />
              <Field label="IRA License" value={broker.licenseNumber} />
              <Field label="IRA Expiry" value={broker.iraExpiryDate ? formatDate(broker.iraExpiryDate) : "-"} />
              <Field label="Effective From" value={formatDate(broker.effectiveFrom)} />
              <Field label="Effective To" value={broker.effectiveTo ? formatDate(broker.effectiveTo) : "-"} />
              <Field label="Onboarded" value={formatDate(broker.dateOnboarded)} />
              <Field label="KYC Docs" value={`${broker.kycDocuments.length} captured`} />
              <Field label="Pending/Expired" value={missingKyc + expiringKyc} />
            </div>

            <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
              <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Hierarchy</h2>
              <Field
                label="Parent"
                value={broker.parent ? <Link href={`/brokers/${broker.parent.id}`} className="text-avenue-indigo hover:underline">{broker.parent.name}</Link> : "-"}
              />
              <Field label="Child Brokers" value={broker.children.length} />
              <div className="pt-2 space-y-2">
                {broker.children.slice(0, 6).map(child => (
                  <Link key={child.id} href={`/brokers/${child.id}`} className="flex justify-between text-sm hover:bg-[#F8F9FA] rounded-md px-2 py-1">
                    <span className="font-semibold text-avenue-indigo">{child.name}</span>
                    <Badge status={child.status} />
                  </Link>
                ))}
                {broker.children.length === 0 && <p className="text-sm text-avenue-text-body">No child sources linked.</p>}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between gap-3">
              <h2 className="font-bold text-avenue-text-heading font-heading">Compliance Flags</h2>
              <Badge status={complianceFlags.length > 0 ? `${complianceFlags.length} OPEN` : "CLEAR"} />
            </div>
            <div className="divide-y divide-[#EEEEEE]">
              {complianceFlags.map(flag => (
                <div key={flag.code} className="px-6 py-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-avenue-text-heading">{flag.title}</p>
                    <p className="text-sm text-avenue-text-body mt-1">{flag.notes}</p>
                    <p className="text-xs font-mono text-avenue-text-muted mt-1">{flag.code}</p>
                  </div>
                  <Badge status={flag.severity} />
                </div>
              ))}
              {complianceFlags.length === 0 && <p className="px-6 py-6 text-sm text-avenue-text-body">No business-source compliance flags detected.</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "producers" && (
        <div className="space-y-6">
          <ProducerForm brokerId={broker.id} groups={broker.groups.map(group => ({ id: group.id, name: group.name }))} />
          <TableShell title="Producers and Scheme Assignments" empty={broker.producers.length === 0} emptyText="No producers have been added for this broker.">
            <thead><tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-3 text-left">Producer</th><th className="px-5 py-3 text-left">Code</th><th className="px-5 py-3 text-left">Contact</th><th className="px-5 py-3 text-left">Schemes</th><th className="px-5 py-3 text-left">Effective</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#EEEEEE] text-sm">
              {broker.producers.map(producer => (
                <tr key={producer.id} className="hover:bg-[#F8F9FA] align-top">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-avenue-text-heading">{producer.producerName}</p>
                    <p className="text-xs text-avenue-text-muted">IRA {producer.iraIndividualNumber ?? "not captured"}</p>
                  </td>
                  <td className="px-5 py-3 font-mono">{producer.producerCode}</td>
                  <td className="px-5 py-3 text-avenue-text-body">{producer.email}<br /><span className="text-xs text-avenue-text-muted">{producer.phone}</span></td>
                  <td className="px-5 py-3 text-avenue-text-body">{producer.groups.length ? producer.groups.map(g => g.name).join(", ") : "-"}</td>
                  <td className="px-5 py-3 text-avenue-text-body">{formatDate(producer.effectiveFrom)} - {producer.effectiveTo ? formatDate(producer.effectiveTo) : "Open"}</td>
                  <td className="px-5 py-3"><Badge status={producer.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <form action={setBrokerProducerStatusAction.bind(null, broker.id, producer.id, producer.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                        <button className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                          producer.status === "ACTIVE"
                            ? "text-[#DC3545] border-[#DC3545]/30 hover:bg-[#DC3545]/5"
                            : "text-[#28A745] border-[#28A745]/30 hover:bg-[#28A745]/5"
                        }`}>
                          {producer.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}

      {activeTab === "kyc" && (
        <div className="space-y-6">
          <KycDocumentForm brokerId={broker.id} />
          <TableShell title="KYC Document Register" empty={broker.kycDocuments.length === 0} emptyText="No KYC documents have been recorded.">
            <thead><tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-3 text-left">Document</th><th className="px-5 py-3 text-left">File</th><th className="px-5 py-3 text-left">Uploaded</th><th className="px-5 py-3 text-left">Expires</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#EEEEEE] text-sm">
              {broker.kycDocuments.map(doc => (
                <tr key={doc.id} className="hover:bg-[#F8F9FA] align-top">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-avenue-text-heading">{doc.documentType.replaceAll("_", " ")}</p>
                    {doc.notes && <p className="text-xs text-avenue-text-muted mt-1">{doc.notes}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <a href={doc.fileUri} className="text-avenue-indigo hover:underline" target="_blank" rel="noreferrer">{doc.fileName}</a>
                  </td>
                  <td className="px-5 py-3 text-avenue-text-body">{formatDate(doc.uploadedAt)}</td>
                  <td className="px-5 py-3 text-avenue-text-body">{doc.expiresAt ? formatDate(doc.expiresAt) : "-"}</td>
                  <td className="px-5 py-3"><Badge status={doc.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col items-end gap-2">
                      {doc.status === "PENDING_REVIEW" ? (
                        <>
                          <form action={verifyBrokerKycDocumentAction.bind(null, broker.id, doc.id)}>
                            <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#28A745] border border-[#28A745]/30 hover:bg-[#28A745]/5">
                              Verify
                            </button>
                          </form>
                          <form action={rejectBrokerKycDocumentAction.bind(null, broker.id, doc.id)} className="flex justify-end gap-2">
                            <input name="notes" placeholder="Reason" className="w-36 border border-[#EEEEEE] rounded-full px-3 py-1.5 text-xs outline-none focus:border-avenue-indigo" />
                            <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#DC3545] border border-[#DC3545]/30 hover:bg-[#DC3545]/5">
                              Reject
                            </button>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs text-avenue-text-muted">Reviewed</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}

      {activeTab === "schedules" && (
        <div className="space-y-6">
          <ScheduleDraftForm brokerId={broker.id} groups={broker.groups.map(group => ({ id: group.id, name: group.name }))} />
          <TableShell title="Commission Schedules" empty={broker.commissionSchedules.length === 0} emptyText="No commission schedules have been configured.">
            <thead><tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-3 text-left">Schedule</th><th className="px-5 py-3 text-left">Type</th><th className="px-5 py-3 text-right">New Business</th><th className="px-5 py-3 text-right">Renewal</th><th className="px-5 py-3 text-left">Effective</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#EEEEEE] text-sm">
              {broker.commissionSchedules.map(schedule => (
                <tr key={schedule.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-avenue-text-heading">{schedule.scheduleName}</p>
                    <p className="text-xs text-avenue-text-muted">{schedule.tiers.length} tier{schedule.tiers.length === 1 ? "" : "s"} · payout every {schedule.payoutCycleDays} days</p>
                  </td>
                  <td className="px-5 py-3 text-avenue-text-body">{schedule.scheduleType.replaceAll("_", " ")}</td>
                  <td className="px-5 py-3 text-right font-semibold">{rate(schedule.newBusinessRate)}</td>
                  <td className="px-5 py-3 text-right font-semibold">{rate(schedule.renewalRate)}</td>
                  <td className="px-5 py-3 text-avenue-text-body">{formatDate(schedule.effectiveFrom)} - {schedule.effectiveTo ? formatDate(schedule.effectiveTo) : "Open"}</td>
                  <td className="px-5 py-3"><Badge status={schedule.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      {schedule.status === "DRAFT" && (
                        <form action={submitCommissionScheduleAction.bind(null, broker.id, schedule.id)}>
                          <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5">
                            Submit
                          </button>
                        </form>
                      )}
                      {schedule.status === "PENDING_APPROVAL" && (
                        <>
                          <form action={approveCommissionScheduleAction.bind(null, broker.id, schedule.id)}>
                            <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#28A745] border border-[#28A745]/30 hover:bg-[#28A745]/5">
                              Approve
                            </button>
                          </form>
                          <form action={rejectCommissionScheduleAction.bind(null, broker.id, schedule.id)}>
                            <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#DC3545] border border-[#DC3545]/30 hover:bg-[#DC3545]/5">
                              Reject
                            </button>
                          </form>
                        </>
                      )}
                      {!["DRAFT", "PENDING_APPROVAL"].includes(schedule.status) && <span className="text-xs text-avenue-text-muted">No action</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}

      {activeTab === "ledger" && (
        <TableShell title="Commission Ledger" empty={broker.commissionLedger.length === 0} emptyText="No ledger entries have been generated.">
          <thead><tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-3 text-left">Period</th><th className="px-5 py-3 text-left">Schedule</th><th className="px-5 py-3 text-right">Gross</th><th className="px-5 py-3 text-right">WHT</th><th className="px-5 py-3 text-right">VAT</th><th className="px-5 py-3 text-right">Net</th><th className="px-5 py-3 text-left">State</th>
          </tr></thead>
          <tbody className="divide-y divide-[#EEEEEE] text-sm">
            {broker.commissionLedger.map(entry => (
              <tr key={entry.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-mono text-avenue-text-heading">{formatDate(entry.earnedPeriodStart)}</td>
                <td className="px-5 py-3 text-avenue-text-body">{entry.schedule?.scheduleName ?? "Pending schedule"}</td>
                <td className="px-5 py-3 text-right">{formatCurrency(entry.grossCommission)}</td>
                <td className="px-5 py-3 text-right">{formatCurrency(entry.withholdingTax)}</td>
                <td className="px-5 py-3 text-right">{formatCurrency(entry.vatAmount)}</td>
                <td className="px-5 py-3 text-right font-semibold text-[#28A745]">{formatCurrency(entry.netPayable)}</td>
                <td className="px-5 py-3"><Badge status={entry.state} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {activeTab === "payouts" && (
        <div className="space-y-6">
          <PayoutBatchForm brokerId={broker.id} payableTotal={ledgerPayable} />
          <TableShell title="Payout Batches" empty={payoutBatches.length === 0} emptyText="No payout batches include this broker yet.">
            <thead><tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-3 text-left">Batch</th><th className="px-5 py-3 text-left">Date</th><th className="px-5 py-3 text-right">Broker Net</th><th className="px-5 py-3 text-right">Batch Net</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#EEEEEE] text-sm">
              {payoutBatches.map(batch => (
                <tr key={batch.id} className="hover:bg-[#F8F9FA] align-top">
                  <td className="px-5 py-3 font-mono font-semibold text-avenue-text-heading">{batch.batchReference}</td>
                  <td className="px-5 py-3 text-avenue-text-body">{formatDate(batch.batchDate)}</td>
                  <td className="px-5 py-3 text-right font-semibold">{formatCurrency(batch.entries.reduce((sum, entry) => sum + Number(entry.netPayable), 0))}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(batch.totalNet)}</td>
                  <td className="px-5 py-3"><Badge status={batch.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col items-end gap-2">
                      {batch.status === "DRAFT" && (
                        <form action={submitBrokerPayoutBatchAction.bind(null, broker.id, batch.id)}>
                          <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5">
                            Submit
                          </button>
                        </form>
                      )}
                      {batch.status === "PENDING_APPROVAL" && (
                        <form action={approveBrokerPayoutBatchAction.bind(null, broker.id, batch.id)}>
                          <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#28A745] border border-[#28A745]/30 hover:bg-[#28A745]/5">
                            Approve
                          </button>
                        </form>
                      )}
                      {batch.status === "APPROVED" && (
                        <form action={completeBrokerPayoutBatchAction.bind(null, broker.id, batch.id)} className="flex justify-end gap-2">
                          <input name="paymentReference" placeholder="Payment ref" className="w-36 border border-[#EEEEEE] rounded-full px-3 py-1.5 text-xs outline-none focus:border-avenue-indigo" />
                          <button className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#28A745] border border-[#28A745]/30 hover:bg-[#28A745]/5">
                            Complete
                          </button>
                        </form>
                      )}
                      {!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(batch.status) && <span className="text-xs text-avenue-text-muted">Closed</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}

      {activeTab === "overview" && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
            <GitBranch size={17} className="text-avenue-indigo" />
            <h2 className="font-bold text-avenue-text-heading font-heading">Assigned Groups</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {broker.groups.map(group => (
              <div key={group.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <Link href={`/groups/${group.id}`} className="font-semibold text-avenue-indigo hover:underline">{group.name}</Link>
                  <p className="text-xs text-avenue-text-muted">{group.package.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-avenue-text-heading">{group._count.members} members</p>
                  <p className="text-xs text-avenue-text-muted">{group.status}</p>
                </div>
              </div>
            ))}
            {broker.groups.length === 0 && <p className="px-6 py-6 text-sm text-avenue-text-body">No groups assigned.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function TableShell({
  title,
  empty,
  emptyText,
  children,
}: {
  title: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
        <BadgeCheck size={17} className="text-avenue-indigo" />
        <h2 className="font-bold text-avenue-text-heading font-heading">{title}</h2>
      </div>
      {empty ? (
        <p className="px-6 py-8 text-sm text-avenue-text-body">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">{children}</table>
        </div>
      )}
    </div>
  );
}

function PayoutBatchForm({ brokerId, payableTotal }: { brokerId: string; payableTotal: number }) {
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <form action={generateBrokerPayoutBatchAction.bind(null, brokerId)} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="font-bold text-avenue-text-heading font-heading">Generate Payout Batch</h2>
          <p className="text-sm text-avenue-text-body mt-1">Collect eligible earned/payable ledger entries into a draft payout batch.</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-xs font-bold uppercase text-avenue-text-muted">Current Payable</p>
          <p className="text-xl font-bold text-[#17A2B8] tabular-nums">{formatCurrency(payableTotal)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">As Of Date</span>
          <input name="asOfDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
        </label>
      </div>

      <div className="flex justify-end">
        <button className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary">
          Generate Batch
        </button>
      </div>
    </form>
  );
}

function KycDocumentForm({ brokerId }: { brokerId: string }) {
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <form action={recordBrokerKycDocumentAction.bind(null, brokerId)} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
      <div>
        <h2 className="font-bold text-avenue-text-heading font-heading">Record KYC Document</h2>
        <p className="text-sm text-avenue-text-body mt-1">Capture document metadata and a file reference for review.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Document Type</span>
          <select name="documentType" defaultValue="IRA_LICENSE" className={input}>
            <option value="IRA_LICENSE">IRA License</option>
            <option value="KRA_PIN_CERTIFICATE">KRA PIN Certificate</option>
            <option value="CR12">CR12</option>
            <option value="PROFESSIONAL_INDEMNITY">Professional Indemnity</option>
            <option value="BANK_CONFIRMATION">Bank Confirmation</option>
            <option value="DIRECTORS_ID">Directors ID</option>
            <option value="TAX_COMPLIANCE_CERTIFICATE">Tax Compliance Certificate</option>
            <option value="ENGAGEMENT_LETTER">Engagement Letter</option>
            <option value="REFERRAL_AGREEMENT">Referral Agreement</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">File Name</span>
          <input name="fileName" required placeholder="IRA license 2026.pdf" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">File Reference</span>
          <input name="fileUri" required placeholder="https://... or internal reference" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Expires At</span>
          <input name="expiresAt" type="date" className={input} />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Notes</span>
          <input name="notes" placeholder="Optional review note" className={input} />
        </label>
      </div>

      <div className="flex justify-end">
        <button className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary">
          Record Document
        </button>
      </div>
    </form>
  );
}

function ProducerForm({ brokerId, groups }: { brokerId: string; groups: Array<{ id: string; name: string }> }) {
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <form action={createBrokerProducerAction.bind(null, brokerId)} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
      <div>
        <h2 className="font-bold text-avenue-text-heading font-heading">Add Producer</h2>
        <p className="text-sm text-avenue-text-body mt-1">Create a producer or sub-agent and link them to assigned schemes.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Producer Name</span>
          <input name="producerName" required className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Producer Code</span>
          <input name="producerCode" required className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">IRA Individual Number</span>
          <input name="iraIndividualNumber" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Email</span>
          <input name="email" type="email" required className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Phone</span>
          <input name="phone" required className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Status</span>
          <select name="status" defaultValue="ACTIVE" className={input}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Effective From</span>
          <input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Effective To</span>
          <input name="effectiveTo" type="date" className={input} />
        </label>
        <fieldset className="md:col-span-3 border border-[#EEEEEE] rounded-md p-3">
          <legend className="px-1 text-xs font-bold uppercase text-avenue-text-muted">Scheme Assignments</legend>
          <div className="grid md:grid-cols-3 gap-2 pt-1">
            {groups.map(group => (
              <label key={group.id} className="flex items-center gap-2 text-sm text-avenue-text-body">
                <input name="groupIds" value={group.id} type="checkbox" className="h-4 w-4 rounded border-[#EEEEEE] accent-avenue-indigo" />
                {group.name}
              </label>
            ))}
            {groups.length === 0 && <p className="text-sm text-avenue-text-body">Assign groups to this broker before linking producer schemes.</p>}
          </div>
        </fieldset>
      </div>

      <div className="flex justify-end">
        <button className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary">
          Add Producer
        </button>
      </div>
    </form>
  );
}

function ScheduleDraftForm({ brokerId, groups }: { brokerId: string; groups: Array<{ id: string; name: string }> }) {
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <form action={createCommissionScheduleAction.bind(null, brokerId)} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
      <div>
        <h2 className="font-bold text-avenue-text-heading font-heading">Create Schedule Draft</h2>
        <p className="text-sm text-avenue-text-body mt-1">Drafts must be submitted and approved before they can drive commission ledger calculations.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Schedule Name</span>
          <input name="scheduleName" required placeholder="2026 Corporate Standard" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Type</span>
          <select name="scheduleType" defaultValue="FLAT_PERCENTAGE" className={input}>
            <option value="FLAT_PERCENTAGE">Flat Percentage</option>
            <option value="TIERED_VOLUME">Tiered Volume</option>
            <option value="TIERED_LOSS_RATIO">Tiered Loss Ratio</option>
            <option value="HYBRID_FLAT_PLUS_OVERRIDE">Hybrid Flat + Override</option>
            <option value="PERFORMANCE_LINKED">Performance Linked</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Scheme Scope</span>
          <select name="groupId" defaultValue="" className={input}>
            <option value="">All assigned groups</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Client Type</span>
          <select name="clientType" defaultValue="" className={input}>
            <option value="">All client types</option>
            <option value="CORPORATE">Corporate</option>
            <option value="INDIVIDUAL">Individual</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">New Business %</span>
          <input name="newBusinessRate" required type="number" min="0" max="100" step="0.01" defaultValue="10" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Renewal %</span>
          <input name="renewalRate" required type="number" min="0" max="100" step="0.01" defaultValue="5" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Override %</span>
          <input name="overrideRate" type="number" min="0" max="100" step="0.01" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Gross Ceiling %</span>
          <input name="grossCommissionCeiling" type="number" min="0" max="100" step="0.01" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Payout Cycle Days</span>
          <input name="payoutCycleDays" required type="number" min="1" step="1" defaultValue="30" className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Effective From</span>
          <input name="effectiveFrom" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Effective To</span>
          <input name="effectiveTo" type="date" className={input} />
        </label>
      </div>

      <div className="flex justify-end">
        <button className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary">
          Create Draft
        </button>
      </div>
    </form>
  );
}
