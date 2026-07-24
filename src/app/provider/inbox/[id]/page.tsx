import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthInfoRequestService, INFO_REQUEST_RESPONDABLE_STATUSES } from "@/server/services/preauth-info-request/service";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import { infoRequestItemLabel } from "@/server/services/preauth-info-request/catalog";
import { RespondForm } from "./RespondForm";

function fmtDate(v: Date | null) {
  return v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-[#17A2B8]/10 text-[#17A2B8]",
  REOPENED: "bg-[#FFC107]/10 text-[#856404]",
  RESPONDED: "bg-[#28A745]/10 text-[#28A745]",
  ACCEPTED: "bg-brand-indigo/10 text-brand-indigo",
  CLOSED: "bg-[#6C757D]/10 text-[#6C757D]",
  CANCELLED: "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function ProviderInfoRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.read")) redirect("/unauthorized");

  const { id } = await params;
  // Non-enumerating: a request not belonging to this facility resolves to null ⇒ 404.
  const request = await PreauthInfoRequestService.getForProvider({ tenantId: ctx.tenantId, providerId: ctx.providerId }, id);
  if (!request) notFound();

  const pa = await PreauthReadService.getById({ tenantId: ctx.tenantId, providerId: ctx.providerId }, request.preAuthorizationId);
  const canRespond = providerPermits(ctx.permissions, "provider.preauth.respond") && INFO_REQUEST_RESPONDABLE_STATUSES.includes(request.status);

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-[11px] font-bold text-brand-text-muted uppercase">{label}</p>
      <p className="text-sm text-brand-text-heading font-semibold mt-0.5">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/inbox" className="text-brand-text-muted hover:text-brand-text-heading"><ArrowLeft size={20} /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-brand-text-heading font-heading">Information request</h1>
          {pa && <p className="text-brand-text-muted text-sm">{pa.preauthNumber} · {pa.member.firstName} {pa.member.lastName} ({pa.member.memberNumber})</p>}
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_TONE[request.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{request.status.replace(/_/g, " ")}</span>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Requested by" value={fmtDate(request.openedAt)} />
          <Field label="Due" value={fmtDate(request.dueAt)} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-brand-text-muted uppercase mb-1">Information requested</p>
          <ul className="list-disc pl-5 text-sm text-brand-text-body">
            {request.requestedItems.map((c) => <li key={c}>{infoRequestItemLabel(c)}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold text-brand-text-muted uppercase mb-1">Reviewer note</p>
          <p className="text-sm text-brand-text-body whitespace-pre-wrap">{request.prompt}</p>
        </div>
        {request.responseNote && (
          <div>
            <p className="text-[11px] font-bold text-brand-text-muted uppercase mb-1">Your response</p>
            <p className="text-sm text-brand-text-body whitespace-pre-wrap">{request.responseNote}</p>
          </div>
        )}
      </div>

      {canRespond ? (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
          <h2 className="text-sm font-bold text-brand-text-heading mb-3">Respond</h2>
          <RespondForm infoRequestId={request.id} />
        </div>
      ) : (
        <p className="text-sm text-brand-text-muted">
          {request.status === "RESPONDED" ? "Your response is with the reviewer." : "This request is not awaiting a response."}
        </p>
      )}

      {pa && (
        <Link href={`/provider/preauth/${pa.id}`} className="inline-block text-sm font-semibold text-brand-indigo hover:underline">
          View pre-authorization →
        </Link>
      )}
    </div>
  );
}
