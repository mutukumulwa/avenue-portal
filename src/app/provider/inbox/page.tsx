import Link from "next/link";
import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { providerInboxProjection } from "@/server/services/preauth-info-request/inbox";
import { infoRequestItemLabel } from "@/server/services/preauth-info-request/catalog";

function fmtDate(v: Date | null) {
  return v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-[#17A2B8]/10 text-[#17A2B8]",
  REOPENED: "bg-[#FFC107]/10 text-[#856404]",
};

export default async function ProviderInbox() {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.read")) redirect("/unauthorized");

  const items = await providerInboxProjection({ tenantId: ctx.tenantId, providerId: ctx.providerId });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Inbox</h1>
        <p className="text-brand-text-muted text-sm">Information requests awaiting your response.</p>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">Nothing needs your attention.</div>
        ) : (
          <ul className="divide-y divide-[#F4F4F4]">
            {items.map((it) => (
              <li key={it.infoRequestId} className="hover:bg-[#F8F9FA]">
                <Link href={`/provider/inbox/${it.infoRequestId}`} className="block px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold text-brand-indigo">{it.preauthNumber}</span>
                    <div className="flex items-center gap-2">
                      {it.overdue && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DC3545]/10 text-[#DC3545]">OVERDUE</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[it.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{it.status.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-brand-text-heading">
                    {it.memberName} <span className="text-brand-text-muted text-xs">({it.memberNumber})</span>
                  </div>
                  <div className="mt-1 text-xs text-brand-text-muted">
                    Requested: {it.requestedItems.map((c) => infoRequestItemLabel(c)).join(", ") || "—"} · Due {fmtDate(it.dueAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
