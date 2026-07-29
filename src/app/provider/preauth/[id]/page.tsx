import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import { listPreauthEvents } from "@/server/services/preauth-intake/events";
import { CancelPreauthButton } from "./CancelPreauthButton";
import { AmendPreauthForm } from "./AmendPreauthForm";
import { FileClaimButton } from "./FileClaimButton";
import { GopButton } from "./GopButton";
import { buildGopData } from "./gop-artifact";
import { PROVIDER_CANCELLABLE_STATUSES } from "./constants";

function money(n: number | null | undefined) {
  return `UGX ${Math.round(Number(n ?? 0)).toLocaleString("en-UG")}`;
}
function fmtDate(v: Date | null | undefined) {
  return v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
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

export default async function ProviderPreauthDetail({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.read")) redirect("/unauthorized");

  const { id } = await params;
  // Canonical scoped detail read (F3.10): provider-scoped + non-enumerating — a PA
  // that is not this facility's resolves to null ⇒ 404 (no cross-provider probing).
  const pa = await PreauthReadService.getById({ tenantId: ctx.tenantId, providerId: ctx.providerId }, id);
  if (!pa) notFound();

  const canCancel = providerPermits(ctx.permissions, "provider.preauth.cancel") && PROVIDER_CANCELLABLE_STATUSES.includes(pa.status);
  const canAmend = providerPermits(ctx.permissions, "provider.preauth.create") && pa.status === "APPROVED";
  const canFileClaim = providerPermits(ctx.permissions, "provider.claim.create") && pa.status === "APPROVED";
  const gop = buildGopData(pa); // non-null only for an APPROVED PA with an issued GOP
  const events = await listPreauthEvents(pa.id);
  const diagnoses = (pa.diagnoses as Array<{ icdCode?: string; code?: string; description?: string; isPrimary?: boolean }>) ?? [];
  const procedures = (pa.procedures as Array<{ cptCode?: string; description?: string; quantity?: number; unitCost?: number; total?: number }>) ?? [];

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-[11px] font-bold text-brand-text-muted uppercase">{label}</p>
      <p className="text-sm text-brand-text-heading font-semibold mt-0.5">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/preauth" className="text-brand-text-muted hover:text-brand-text-heading"><ArrowLeft size={20} /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading font-mono">{pa.preauthNumber}</h1>
          <p className="text-brand-text-muted text-sm">{pa.member.firstName} {pa.member.lastName} · {pa.member.memberNumber}</p>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_TONE[pa.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{pa.status.replace(/_/g, " ")}</span>
      </div>

      {(gop || canFileClaim || canAmend || canCancel) && (
        <div className="flex flex-wrap justify-end gap-2">
          {gop && <GopButton data={gop} />}
          {canFileClaim && <FileClaimButton preAuthId={pa.id} />}
          {canAmend && <AmendPreauthForm parentPreAuthId={pa.id} />}
          {canCancel && <CancelPreauthButton preAuthId={pa.id} />}
        </div>
      )}

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Service type" value={pa.serviceType} />
        <Field label="Benefit" value={pa.benefitCategory.replace(/_/g, " ")} />
        <Field label="Expected date" value={fmtDate(pa.expectedDateOfService)} />
        <Field label="Estimated cost" value={money(Number(pa.estimatedCost))} />
        <Field label="Approved amount" value={pa.approvedAmount != null ? money(Number(pa.approvedAmount)) : "—"} />
        <Field label="GOP number" value={pa.gopNumber ?? "—"} />
        <Field label="Valid from" value={fmtDate(pa.validFrom)} />
        <Field label="Valid until" value={fmtDate(pa.validUntil)} />
        {pa.status === "DECLINED" && <Field label="Decline reason" value={pa.declineReasonCode ?? "—"} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
          <h2 className="text-sm font-bold text-brand-text-heading mb-3">Diagnoses</h2>
          {diagnoses.length === 0 ? <p className="text-sm text-brand-text-muted">None recorded.</p> : (
            <ul className="space-y-1.5 text-sm">
              {diagnoses.map((d, i) => (
                <li key={i} className="flex gap-2">
                  {d.icdCode || d.code ? <span className="font-mono text-xs text-brand-indigo">{d.icdCode ?? d.code}</span> : null}
                  <span>{d.description}{d.isPrimary ? <span className="text-[10px] font-bold text-brand-text-muted"> (primary)</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
          <h2 className="text-sm font-bold text-brand-text-heading mb-3">Requested services</h2>
          {procedures.length === 0 ? <p className="text-sm text-brand-text-muted">None recorded.</p> : (
            <ul className="space-y-1.5 text-sm">
              {procedures.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{p.cptCode ? <span className="font-mono text-xs text-brand-indigo mr-1">{p.cptCode}</span> : null}{p.description}</span>
                  <span className="font-mono text-xs">{money(p.total ?? p.unitCost)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pa.clinicalNotes && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
          <h2 className="text-sm font-bold text-brand-text-heading mb-2">Clinical notes</h2>
          <p className="text-sm text-brand-text-body whitespace-pre-wrap">{pa.clinicalNotes}</p>
        </div>
      )}

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
        <h2 className="text-sm font-bold text-brand-text-heading mb-3">History</h2>
        {events.length === 0 ? <p className="text-sm text-brand-text-muted">No events.</p> : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-brand-text-muted font-mono whitespace-nowrap mt-0.5">{fmtDate(e.createdAt)}</span>
                <span>
                  <span className="font-semibold text-brand-text-heading">{e.eventType.replace(/_/g, " ")}</span>
                  {e.newStatus ? <span className="text-brand-text-muted"> → {e.newStatus.replace(/_/g, " ")}</span> : null}
                  {e.safeReasonCode ? <span className="text-brand-text-muted"> · {e.safeReasonCode.replace(/_/g, " ")}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
