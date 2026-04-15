import { requireRole, ROLES } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProviderContractCard } from "./ProviderContractCard";
import { ProviderTariffsCard } from "./ProviderTariffsCard";
import { ProviderDiagnosisTariffsCard } from "./ProviderDiagnosisTariffsCard";

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const { id } = await params;
  const provider = await prisma.provider.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      tariffs:         { orderBy: { effectiveFrom: "desc" } },
      diagnosisTariffs:{ orderBy: { effectiveFrom: "desc" } },
      claims: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { member: { select: { firstName: true, lastName: true, memberNumber: true } } },
      },
      _count: { select: { claims: true, preauths: true } },
    },
  });

  if (!provider) notFound();

  const tierColor = (tier: string) => {
    switch (tier) {
      case "OWN":    return "bg-avenue-indigo/10 text-avenue-indigo";
      case "PARTNER":return "bg-[#28A745]/10 text-[#28A745]";
      case "PANEL":  return "bg-[#17A2B8]/10 text-[#17A2B8]";
      default:       return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  // Serialize Decimal → number for client components
  const tariffs = provider.tariffs.map(t => ({
    id:           t.id,
    serviceName:  t.serviceName,
    cptCode:      t.cptCode,
    agreedRate:   Number(t.agreedRate),
    effectiveFrom:t.effectiveFrom.toISOString(),
    effectiveTo:  t.effectiveTo?.toISOString() ?? null,
  }));

  const diagnosisTariffs = provider.diagnosisTariffs.map(t => ({
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
        <Link href="/providers" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{provider.name}</h1>
          <p className="text-avenue-text-body text-sm mt-0.5 capitalize">
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
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Provider Details</h2>
          {[
            { label: "Phone",              value: provider.phone          ?? "—" },
            { label: "Email",              value: provider.email          ?? "—" },
            { label: "Contact Person",     value: provider.contactPerson  ?? "—" },
            { label: "Address",            value: provider.address        ?? "—" },
            { label: "SMART Provider ID",  value: provider.smartProviderId   ?? "—" },
            { label: "Slade360 Provider ID",value: provider.slade360ProviderId ?? "—" },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm">
              <span className="text-avenue-text-muted">{f.label}</span>
              <span className="font-semibold text-avenue-text-heading">{f.value}</span>
            </div>
          ))}
        </div>

        {/* KPI cards */}
        <div className="space-y-4">
          {[
            { label: "Total Claims",        value: provider._count.claims,           color: "text-avenue-indigo"  },
            { label: "Pre-Authorizations",  value: provider._count.preauths,         color: "text-[#17A2B8]"      },
            { label: "CPT Tariff Lines",    value: provider.tariffs.length,          color: "text-[#28A745]"      },
            { label: "Diagnosis Rates",     value: provider.diagnosisTariffs.length, color: "text-[#FFC107]"      },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-[10px] text-avenue-text-muted font-bold uppercase">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contract Details (editable) */}
      <ProviderContractCard
        providerId={provider.id}
        contractStatus={provider.contractStatus}
        contractStartDate={provider.contractStartDate?.toISOString() ?? null}
        contractEndDate={provider.contractEndDate?.toISOString() ?? null}
        paymentTermDays={provider.paymentTermDays}
        creditLimit={provider.creditLimit != null ? Number(provider.creditLimit) : null}
        contractNotes={provider.contractNotes}
      />

      {/* Services offered */}
      {provider.servicesOffered.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h2 className="font-bold text-avenue-text-heading font-heading mb-3">Services Offered</h2>
          <div className="flex flex-wrap gap-2">
            {provider.servicesOffered.map(s => (
              <span key={s} className="bg-avenue-indigo/10 text-avenue-indigo px-3 py-1 rounded-full text-xs font-bold">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* CPT Tariff Schedule (inline CRUD) */}
      <ProviderTariffsCard providerId={provider.id} tariffs={tariffs} />

      {/* Diagnosis Tariff Schedule (inline CRUD) */}
      <ProviderDiagnosisTariffsCard providerId={provider.id} tariffs={diagnosisTariffs} />

      {/* Recent Claims */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-avenue-text-heading font-heading">Recent Claims</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
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
                <td className="px-5 py-3 font-mono font-semibold text-avenue-text-heading">
                  <Link href={`/claims/${c.id}`} className="hover:text-avenue-indigo transition-colors">{c.claimNumber}</Link>
                </td>
                <td className="px-5 py-3">{c.member.firstName} {c.member.lastName}</td>
                <td className="px-5 py-3 text-right font-semibold">{Number(c.billedAmount).toLocaleString("en-KE")}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                    c.status === "APPROVED" || c.status === "PAID" ? "bg-[#28A745]/10 text-[#28A745]" :
                    c.status === "DECLINED" ? "bg-[#DC3545]/10 text-[#DC3545]" :
                    "bg-[#17A2B8]/10 text-[#17A2B8]"
                  }`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-5 py-3 text-avenue-text-muted">{new Date(c.createdAt).toLocaleDateString("en-KE")}</td>
              </tr>
            ))}
            {provider.claims.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-avenue-text-muted">No claims from this provider yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
