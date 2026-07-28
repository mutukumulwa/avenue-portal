import Link from "next/link";
import { redirect } from "next/navigation";
import { IdCard, Plus } from "lucide-react";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ProviderMasterDataChangeService, MASTER_DATA_CHANGE_PERMISSION } from "@/server/services/provider-master-data-change/service";

/**
 * PNOS F7.6 — provider profile (read-only, masked) + the provider's change-request
 * tracker. Profile is source-of-truth read-only (§8.11); a change is only ever a
 * REQUEST through the F7.4 service. The masked projection + the SHARED request
 * timeline are the only provider-visible data — sensitive values (bank) are masked.
 */
const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-[#FFC107]/10 text-[#856404]",
  UNDER_REVIEW: "bg-brand-indigo/10 text-brand-indigo",
  INFORMATION_REQUIRED: "bg-[#FFC107]/10 text-[#856404]",
  PROVIDER_RESPONDED: "bg-brand-indigo/10 text-brand-indigo",
  PENDING_CHECKER: "bg-brand-indigo/10 text-brand-indigo",
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]",
  WITHDRAWN: "bg-[#E6E7E8] text-[#6C757D]",
};

export default async function ProviderProfile() {
  const { ctx } = await ProviderAccessService.resolveUserContext();

  let profile: Awaited<ReturnType<typeof ProviderMasterDataChangeService.getMaskedProfile>>;
  try {
    profile = await ProviderMasterDataChangeService.getMaskedProfile(ctx);
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    throw e;
  }
  if (!profile) redirect("/unauthorized");

  const requests = providerPermits(ctx.permissions, MASTER_DATA_CHANGE_PERMISSION)
    ? await ProviderMasterDataChangeService.listForProvider(ctx)
    : [];
  const canRequest = providerPermits(ctx.permissions, MASTER_DATA_CHANGE_PERMISSION);
  const val = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const fmtDate = (v: Date | string | null) => (v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><IdCard size={22} /> Profile</h1>
        {canRequest && (
          <Link href="/provider/profile/new" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-indigo rounded-lg px-3 py-1.5"><Plus size={15} /> Request a change</Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Facility">
          <Field label="Trading name">{val(profile.identity.name)}</Field>
          <Field label="Legal name">{val(profile.identity.legalName)}</Field>
          <Field label="Type">{val(profile.identity.type)}</Field>
          <Field label="Network tier">{val(profile.identity.tier)}</Field>
        </Card>
        <Card title="Contact">
          {Object.entries(profile.contact).map(([k, v]) => <Field key={k} label={k}>{val(v)}</Field>)}
        </Card>
        <Card title="Credential / licensing">
          {Object.entries(profile.credential).map(([k, v]) => <Field key={k} label={k}>{val(v)}</Field>)}
        </Card>
        <Card title="Bank destination">
          <Field label="Reference (masked)">{val(profile.bank.reference)}</Field>
          <p className="text-[11px] text-brand-text-muted mt-1">Full account details are held securely and are never shown here. A change requires verification.</p>
        </Card>
      </div>

      {profile.branches.length > 0 && (
        <Card title="Branches">
          <div className="flex flex-wrap gap-2">
            {profile.branches.map((b) => (
              <span key={b.id} className={`text-xs px-2.5 py-1 rounded-full border ${b.isActive ? "border-[#DDDDDD] text-brand-text-body" : "border-[#EEEEEE] text-brand-text-muted line-through"}`}>
                {b.name}{b.county ? ` · ${b.county}` : ""}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Change-request tracker */}
      <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">Change requests</h2>
        {requests.length === 0 ? (
          <p className="px-5 py-8 text-center text-brand-text-muted text-sm">No change requests yet.</p>
        ) : (
          <ul className="divide-y divide-[#F4F4F4]">
            {requests.map((r) => (
              <li key={r.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <Link href={`/provider/profile/${r.id}`} className="text-sm font-semibold text-brand-indigo hover:underline">
                  {r.category.replace(/_/g, " ")} change
                </Link>
                <div className="flex items-center gap-3 text-xs text-brand-text-muted">
                  <span>due {fmtDate(r.dueAt)}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[r.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{r.status.replace(/_/g, " ")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
      <p className="text-[11px] font-bold uppercase text-brand-text-muted mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-brand-text-muted capitalize">{label.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
      <span className="text-brand-text-heading text-right">{children}</span>
    </div>
  );
}
