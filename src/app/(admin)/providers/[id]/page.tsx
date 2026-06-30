import { requireRole, ROLES } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, FileText, NotebookPen, Share2 } from "lucide-react";
import { ProviderContractsCard } from "./ProviderContractsCard";
import { ProviderTariffsCard } from "./ProviderTariffsCard";
import { ProviderDiagnosisTariffsCard } from "./ProviderDiagnosisTariffsCard";
import { ProviderPractitionersCard } from "./ProviderPractitionersCard";

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const { id } = await params;
  const provider = await prisma.provider.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      tariffs:         { orderBy: { effectiveFrom: "desc" } },
      diagnosisTariffs:{ orderBy: { effectiveFrom: "desc" } },
      contracts: {
        orderBy: [{ startDate: "desc" }],
        include: { _count: { select: { tariffLines: { where: { isActive: true } }, exclusions: true } } },
      },
      practitioners: {
        include: {
          practitioner: {
            include: { credentials: { orderBy: { expiryDate: "desc" } } },
          },
        },
        orderBy: { joinedAt: "desc" },
      },
      claims: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { member: { select: { firstName: true, lastName: true, memberNumber: true } } },
      },
      _count: { select: { claims: true, preauths: true } },
    },
  });

  if (!provider) notFound();

  const sharedHealthRecords = await prisma.memberHealthShare.findMany({
    where: {
      tenantId: session.user.tenantId,
      providerId: provider.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      healthFile: true,
      journalEntry: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const tierColor = (tier: string) => {
    switch (tier) {
      case "OWN":    return "bg-brand-indigo/10 text-brand-indigo";
      case "PARTNER":return "bg-[#28A745]/10 text-[#28A745]";
      case "PANEL":  return "bg-[#17A2B8]/10 text-[#17A2B8]";
      default:       return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  const contracts = provider.contracts.map(c => ({
    id: c.id,
    contractNumber: c.contractNumber,
    title: c.title,
    status: c.status,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    unlistedServiceRule: c.unlistedServiceRule,
    tariffCount: c._count.tariffLines,
    exclusionCount: c._count.exclusions,
  }));

  // Standalone rates only — contract-scoped lines are managed in the contract workspace
  const standaloneTariffs = provider.tariffs.filter(t => !t.contractId);
  const standaloneDiagTariffs = provider.diagnosisTariffs.filter(t => !t.contractId);

  // Serialize Decimal → number for client components
  const tariffs = standaloneTariffs.map(t => ({
    id:           t.id,
    serviceName:  t.serviceName,
    cptCode:      t.cptCode,
    agreedRate:   Number(t.agreedRate),
    effectiveFrom:t.effectiveFrom.toISOString(),
    effectiveTo:  t.effectiveTo?.toISOString() ?? null,
  }));

  const diagnosisTariffs = standaloneDiagTariffs.map(t => ({
    id:            t.id,
    icdCode:       t.icdCode,
    diagnosisLabel:t.diagnosisLabel,
    bundledRate:   t.bundledRate != null ? Number(t.bundledRate) : null,
    perDayRate:    t.perDayRate  != null ? Number(t.perDayRate)  : null,
    notes:         t.notes,
    effectiveFrom: t.effectiveFrom.toISOString(),
    effectiveTo:   t.effectiveTo?.toISOString() ?? null,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/providers" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{provider.name}</h1>
          <p className="text-brand-text-body text-sm mt-0.5 capitalize">
            {provider.type.toLowerCase()} · {provider.county ?? "—"}
          </p>
        </div>
        <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${tierColor(provider.tier)}`}>
          {provider.tier}
        </span>
      </div>

      {/* Top row: provider info + KPIs */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Provider Details */}
        <div className="md:col-span-2 bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">Provider Details</h2>
          {[
            { label: "Phone",              value: provider.phone          ?? "—" },
            { label: "Email",              value: provider.email          ?? "—" },
            { label: "Contact Person",     value: provider.contactPerson  ?? "—" },
            { label: "Address",            value: provider.address        ?? "—" },
            { label: "SMART Provider ID",  value: provider.smartProviderId   ?? "—" },
            { label: "Slade360 Provider ID",value: provider.slade360ProviderId ?? "—" },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm">
              <span className="text-brand-text-muted">{f.label}</span>
              <span className="font-semibold text-brand-text-heading">{f.value}</span>
            </div>
          ))}
        </div>

        {/* KPI cards */}
        <div className="space-y-4">
          {[
            { label: "Total Claims",        value: provider._count.claims,           color: "text-brand-indigo"  },
            { label: "Pre-Authorizations",  value: provider._count.preauths,         color: "text-[#17A2B8]"      },
            { label: "Contracts",           value: provider.contracts.length,        color: "text-[#28A745]"      },
            { label: "Tariff Lines",        value: provider.tariffs.length,          color: "text-[#FFC107]"      },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-[10px] text-brand-text-muted font-bold uppercase">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contract register — agreements own the rate schedules & billing rules */}
      <ProviderContractsCard providerId={provider.id} contracts={contracts} />

      {/* Services offered */}
      {provider.servicesOffered.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h2 className="font-bold text-brand-text-heading font-heading mb-3">Services Offered</h2>
          <div className="flex flex-wrap gap-2">
            {provider.servicesOffered.map(s => (
              <span key={s} className="bg-brand-indigo/10 text-brand-indigo px-3 py-1 rounded-full text-xs font-bold">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Standalone rates — kept for back-compat; contract-scoped rates live in the contract workspace */}
      {(tariffs.length > 0 || diagnosisTariffs.length > 0) && (
        <div className="flex items-start gap-2.5 bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg px-4 py-3 text-xs text-brand-text-muted">
          The schedules below are <strong>standalone rates not linked to any contract</strong>. They still apply as a fallback during
          adjudication, but new rate schedules should be captured inside a contract so they expire, renew and audit together.
        </div>
      )}
      {tariffs.length > 0 && <ProviderTariffsCard providerId={provider.id} tariffs={tariffs} />}
      {diagnosisTariffs.length > 0 && <ProviderDiagnosisTariffsCard providerId={provider.id} tariffs={diagnosisTariffs} />}

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2">
              <Share2 className="h-5 w-5 text-brand-indigo" />
              Member-shared Health Vault records
            </h2>
            <p className="mt-1 text-sm text-brand-text-body">
              Active records explicitly shared by members with this provider.
            </p>
          </div>
          <span className="rounded-full bg-brand-indigo/10 px-2.5 py-1 text-xs font-bold text-brand-indigo">
            {sharedHealthRecords.length}
          </span>
        </div>

        {sharedHealthRecords.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sharedHealthRecords.map((share) => (
              <article key={share.id} className="rounded-lg border border-[#EEEEEE] p-4">
                <p className="text-xs font-semibold text-brand-text-body">
                  {share.member.firstName} {share.member.lastName} · {share.member.memberNumber}
                </p>
                <p className="mt-1 text-xs text-brand-text-muted">
                  Shared {share.createdAt.toLocaleDateString("en-UG")}
                  {share.expiresAt ? ` · expires ${share.expiresAt.toLocaleDateString("en-UG")}` : " · until revoked"}
                </p>

                {share.healthFile && (
                  <div className="mt-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-indigo/10 text-brand-indigo">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-brand-text-heading">{share.healthFile.title}</p>
                        <p className="mt-1 text-sm text-brand-text-body">
                          {share.healthFile.category.replace(/_/g, " ").toLowerCase()} · {share.healthFile.fileName}
                        </p>
                      </div>
                    </div>
                    {share.healthFile.notes && <p className="mt-3 text-sm text-brand-text-body">{share.healthFile.notes}</p>}
                    <Link href={share.healthFile.fileUrl} className="mt-3 inline-flex text-sm font-semibold text-brand-indigo hover:underline">
                      Open shared file
                    </Link>
                  </div>
                )}

                {share.journalEntry && (
                  <div className="mt-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#17A2B8]/10 text-[#0F6F7D]">
                        <NotebookPen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-brand-text-heading">{share.journalEntry.entryType.replace(/_/g, " ").toLowerCase()}</p>
                        <p className="mt-1 text-sm text-brand-text-body">
                          Recorded {share.journalEntry.recordedAt.toLocaleDateString("en-UG")}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-brand-text-body">{share.journalEntry.noteText}</p>
                    {share.journalEntry.audioUrl && (
                      <audio controls src={share.journalEntry.audioUrl} className="mt-3 w-full">
                        <track kind="captions" />
                      </audio>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-[#D6DCE5] p-6 text-center text-sm text-brand-text-muted">
            No active Health Vault records have been shared with this provider.
          </p>
        )}
      </div>

      {/* Practitioners */}
      <ProviderPractitionersCard
        providerId={provider.id}
        practitioners={provider.practitioners.map(link => ({
          practitionerId: link.practitionerId,
          isPrimary: link.isPrimary,
          practitioner: {
            id: link.practitioner.id,
            firstName: link.practitioner.firstName,
            lastName: link.practitioner.lastName,
            licenseType: link.practitioner.licenseType,
            licenseNumber: link.practitioner.licenseNumber,
            credentials: link.practitioner.credentials.map(c => ({
              id: c.id,
              documentType: c.documentType,
              expiryDate: c.expiryDate.toISOString(),
              status: c.status,
            })),
          },
        }))}
      />

      {/* Recent Claims */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading font-heading">Recent Claims</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-2.5">Claim No.</th>
              <th className="px-5 py-2.5">Member</th>
              <th className="px-5 py-2.5 text-right">Billed (KES)</th>
              <th className="px-5 py-2.5">Status</th>
              <th className="px-5 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {provider.claims.map(c => (
              <tr key={c.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3 font-mono font-semibold text-brand-text-heading">
                  <Link href={`/claims/${c.id}`} className="hover:text-brand-indigo transition-colors">{c.claimNumber}</Link>
                </td>
                <td className="px-5 py-3">{c.member.firstName} {c.member.lastName}</td>
                <td className="px-5 py-3 text-right font-semibold">{Number(c.billedAmount).toLocaleString("en-UG")}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                    c.status === "APPROVED" || c.status === "PAID" ? "bg-[#28A745]/10 text-[#28A745]" :
                    c.status === "DECLINED" ? "bg-[#DC3545]/10 text-[#DC3545]" :
                    "bg-[#17A2B8]/10 text-[#17A2B8]"
                  }`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-5 py-3 text-brand-text-muted">{new Date(c.createdAt).toLocaleDateString("en-UG")}</td>
              </tr>
            ))}
            {provider.claims.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-brand-text-muted">No claims from this provider yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
