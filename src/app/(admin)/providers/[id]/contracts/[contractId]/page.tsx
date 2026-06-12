import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, FileSignature } from "lucide-react";
import { ContractLifecycleBar } from "./ContractLifecycleBar";
import { ContractTermsCard } from "./ContractTermsCard";
import { ContractTariffsCard } from "./ContractTariffsCard";
import { ContractDiagnosisCard } from "./ContractDiagnosisCard";
import { ContractExclusionsCard } from "./ContractExclusionsCard";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#FFC107]/10 text-[#856404]",
  ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
  SUSPENDED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  TERMINATED: "bg-[#DC3545]/10 text-[#DC3545]",
};

export default async function ContractWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contractId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id: providerId, contractId } = await params;
  const { error } = await searchParams;

  const contract = await prisma.providerContract.findUnique({
    where: { id: contractId, tenantId: session.user.tenantId, providerId },
    include: {
      provider: { select: { id: true, name: true, type: true } },
      tariffLines: { where: { isActive: true }, orderBy: [{ serviceName: "asc" }] },
      diagnosisTariffs: { where: { isActive: true }, orderBy: [{ icdCode: "asc" }] },
      exclusions: { orderBy: { serviceName: "asc" } },
      supersededBy: { select: { id: true, contractNumber: true } },
      predecessor: { select: { id: true, contractNumber: true } },
    },
  });
  if (!contract) notFound();

  const now = new Date();
  const isPastEnd = contract.endDate < now;
  const displayStatus = contract.status === "ACTIVE" && isPastEnd ? "EXPIRED" : contract.status;
  const daysToExpiry = Math.ceil((contract.endDate.getTime() - now.getTime()) / 86_400_000);

  const tariffs = contract.tariffLines.map(t => ({
    id: t.id,
    cptCode: t.cptCode,
    serviceName: t.serviceName,
    agreedRate: Number(t.agreedRate),
    requiresPreauth: t.requiresPreauth,
    maxQuantityPerVisit: t.maxQuantityPerVisit,
    effectiveFrom: t.effectiveFrom.toISOString(),
    effectiveTo: t.effectiveTo?.toISOString() ?? null,
  }));

  const diagnosisTariffs = contract.diagnosisTariffs.map(t => ({
    id: t.id,
    icdCode: t.icdCode,
    diagnosisLabel: t.diagnosisLabel,
    bundledRate: t.bundledRate != null ? Number(t.bundledRate) : null,
    perDayRate: t.perDayRate != null ? Number(t.perDayRate) : null,
    notes: t.notes,
  }));

  const exclusions = contract.exclusions.map(e => ({
    id: e.id,
    cptCode: e.cptCode,
    serviceName: e.serviceName,
    reason: e.reason,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/providers/${providerId}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            <FileSignature size={20} className="text-avenue-indigo" />
            {contract.contractNumber} — {contract.title}
          </h1>
          <p className="text-avenue-text-body text-sm mt-0.5">
            {contract.provider.name} · {contract.startDate.toLocaleDateString("en-KE")} → {contract.endDate.toLocaleDateString("en-KE")}
            {contract.predecessor && (
              <> · renews <Link className="text-avenue-indigo hover:underline" href={`/providers/${providerId}/contracts/${contract.predecessor.id}`}>{contract.predecessor.contractNumber}</Link></>
            )}
            {contract.supersededBy && (
              <> · superseded by <Link className="text-avenue-indigo hover:underline" href={`/providers/${providerId}/contracts/${contract.supersededBy.id}`}>{contract.supersededBy.contractNumber}</Link></>
            )}
          </p>
        </div>
        <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLES[displayStatus] ?? STATUS_STYLES.DRAFT}`}>
          {displayStatus}
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-[#DC3545]/10 border border-[#DC3545]/40 rounded-lg px-4 py-3 text-sm text-[#842029]">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {displayStatus === "ACTIVE" && daysToExpiry <= 60 && (
        <div className="flex items-start gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3 text-sm text-[#856404]">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          This contract expires in {daysToExpiry} day{daysToExpiry === 1 ? "" : "s"}. Renew it to keep the negotiated schedule in force — after expiry, claims fall back to the unlisted-service rule of… nothing.
        </div>
      )}

      <ContractLifecycleBar
        contractId={contract.id}
        status={contract.status}
        isPastEnd={isPastEnd}
        alreadyRenewed={!!contract.supersededBy}
        endDate={contract.endDate.toISOString()}
      />

      <ContractTermsCard
        contract={{
          id: contract.id,
          title: contract.title,
          status: contract.status,
          startDate: contract.startDate.toISOString(),
          endDate: contract.endDate.toISOString(),
          signedDate: contract.signedDate?.toISOString() ?? null,
          autoRenew: contract.autoRenew,
          paymentTermDays: contract.paymentTermDays,
          creditLimit: contract.creditLimit != null ? Number(contract.creditLimit) : null,
          invoiceDiscountPct: contract.invoiceDiscountPct != null ? Number(contract.invoiceDiscountPct) : null,
          unlistedServiceRule: contract.unlistedServiceRule,
          unlistedDiscountPct: contract.unlistedDiscountPct != null ? Number(contract.unlistedDiscountPct) : null,
          documentUrl: contract.documentUrl,
          notes: contract.notes,
        }}
      />

      <ContractTariffsCard contractId={contract.id} tariffs={tariffs} editable={contract.status !== "TERMINATED" && contract.status !== "EXPIRED"} />

      <ContractDiagnosisCard contractId={contract.id} tariffs={diagnosisTariffs} editable={contract.status !== "TERMINATED" && contract.status !== "EXPIRED"} />

      <ContractExclusionsCard contractId={contract.id} exclusions={exclusions} editable={contract.status !== "TERMINATED" && contract.status !== "EXPIRED"} />
    </div>
  );
}
