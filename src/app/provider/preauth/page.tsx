import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import type { PreauthStatus } from "@prisma/client";

function money(n: number) {
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-[#17A2B8]/10 text-[#17A2B8]",
  UNDER_REVIEW: "bg-[#FFC107]/10 text-[#856404]",
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  ATTACHED: "bg-brand-indigo/10 text-brand-indigo",
  UTILISED: "bg-brand-indigo/10 text-brand-indigo",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  CANCELLED: "bg-[#6C757D]/10 text-[#6C757D]",
};

const FILTERS = ["all", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "ATTACHED", "UTILISED", "DECLINED", "EXPIRED", "CANCELLED"];

export default async function ProviderPreauth({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; submitted?: string; replayed?: string }>;
}) {
  // Direct-URL access is server-authorized here (nav visibility is convenience,
  // never the boundary — §10.1). Legacy-compatible posture: a migrated user needs
  // provider.preauth.read; an un-migrated user (no provider.* perms) is allowed.
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.read")) redirect("/unauthorized");
  const canCreate = providerPermits(ctx.permissions, "provider.preauth.create");

  const { status, submitted, replayed } = await searchParams;
  const active = status && FILTERS.includes(status) ? status : "all";

  // Canonical scoped read (F3.7): this provider's own PAs only.
  const preauths = await PreauthReadService.list({
    tenantId: ctx.tenantId,
    providerId: ctx.providerId,
    ...(active !== "all" ? { status: active as PreauthStatus } : {}),
  });

  // ELIG-GAP-022: the confirmation banner must reflect the PA's COMMITTED status,
  // not a hardcoded "under review" — an auto-approved PA reads "approved", so it
  // agrees with the list row and the detail page.
  const submittedPa = submitted ? preauths.find((p) => p.preauthNumber === submitted) : undefined;
  const SUBMITTED_PHRASE: Partial<Record<PreauthStatus, string>> = {
    APPROVED: "approved", DECLINED: "declined", SUBMITTED: "submitted and under review",
    UNDER_REVIEW: "under review", CANCELLED: "cancelled", EXPIRED: "expired",
  };

  return (
    <div className="space-y-5">
      {submitted && (
        <div className="bg-brand-indigo/5 border border-brand-indigo/30 rounded-lg px-4 py-3 text-sm font-semibold text-brand-indigo" role="status">
          {replayed
            ? `Already received — pre-authorization ${submitted} (idempotent replay, nothing was duplicated).`
            : submittedPa
              ? `Pre-authorization ${submitted} ${SUBMITTED_PHRASE[submittedPa.status] ?? `submitted (${submittedPa.status})`}.`
              : `Pre-authorization ${submitted} submitted.`}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Pre-authorizations</h1>
          <span className="text-xs text-brand-text-muted">{provider.name}</span>
        </div>
        {canCreate && (
          <Link href="/provider/preauth/new" className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
            <FilePlus2 size={15} /> New pre-auth
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/provider/preauth" : `/provider/preauth?status=${f}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              active === f ? "bg-brand-indigo text-white border-brand-indigo" : "border-[#EEEEEE] text-brand-text-body hover:bg-white"
            }`}
          >
            {f === "all" ? "All" : f.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {preauths.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">
            No pre-authorizations{active !== "all" ? ` with status ${active.replace(/_/g, " ")}` : ""}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-brand-text-muted">
                <tr className="border-b border-[#EEEEEE]">
                  <th className="text-left px-5 py-2 font-bold">PA Number</th>
                  <th className="text-left px-5 py-2 font-bold">Member</th>
                  <th className="text-left px-5 py-2 font-bold">Service</th>
                  <th className="text-left px-5 py-2 font-bold">Benefit</th>
                  <th className="text-right px-5 py-2 font-bold">Estimated</th>
                  <th className="text-left px-5 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {preauths.map((pa) => (
                  <tr key={pa.id} className="border-b border-[#F4F4F4] last:border-0 hover:bg-[#F8F9FA]">
                    <td className="px-5 py-2.5"><Link href={`/provider/preauth/${pa.id}`} className="font-mono text-xs font-semibold text-brand-indigo">{pa.preauthNumber}</Link></td>
                    <td className="px-5 py-2.5">
                      {pa.member.firstName} {pa.member.lastName}{" "}
                      <span className="text-brand-text-muted text-xs">({pa.member.memberNumber})</span>
                    </td>
                    <td className="px-5 py-2.5 text-xs">{pa.serviceType}</td>
                    <td className="px-5 py-2.5 text-xs">{pa.benefitCategory.replace(/_/g, " ")}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(pa.estimatedCost))}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[pa.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>
                        {pa.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
