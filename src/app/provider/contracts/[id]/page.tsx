import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ScrollText, Download, Search, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderContractViewService, CONTRACT_VIEW_PERMISSION } from "@/server/services/provider-contract-view/service";
import { formatStoredDate } from "@/lib/calendar-date";

/**
 * PNOS F7.3 — provider contract detail + effective rate schedule.
 *
 * Renders the provider-safe read model (F7.2 getById + getRates — allow-listed,
 * no extraction/ownership/internal fields) with current/future/expired labels,
 * the commercial terms + PA/document/filing/payment requirements, a searchable
 * effective rate table, and a watermarked CSV export. Gated behind
 * `providerContractView` (F7.1 §10 sign-off). The service is the auth authority
 * (provider.contract.read + provider scope, non-enumerating). Stop: no editing.
 */
const RATE_PAGE_SIZE = 500;

function labelTone(l: string): string {
  return l === "CURRENT" ? "bg-[#28A745]/10 text-[#28A745]" : l === "FUTURE" ? "bg-brand-indigo/10 text-brand-indigo" : "bg-[#E6E7E8] text-[#6C757D]";
}

export default async function ProviderContractDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string; name?: string; date?: string }>;
}) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!(await ProviderAccessSettingsService.isContractViewEnabled(ctx.tenantId, ctx.providerId))) notFound();

  const { id } = await params;
  const { code, name, date } = await searchParams;
  const parsed = date ? new Date(date) : new Date();
  const serviceDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  let detail: Awaited<ReturnType<typeof ProviderContractViewService.getById>>;
  let rateResult: Awaited<ReturnType<typeof ProviderContractViewService.getRates>>;
  try {
    detail = await ProviderContractViewService.getById(ctx, id, { now: serviceDate });
    if (!detail) notFound();
    rateResult = await ProviderContractViewService.getRates(ctx, id, { serviceDate, code, name, pageSize: RATE_PAGE_SIZE });
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    throw e;
  }

  const { header, versions, servedScope, branches, preauthRules, documentRules, exclusions, capitation } = detail;
  const rates = rateResult?.rates ?? [];
  const ratePage = rateResult?.page;

  // Resolve the payer/scheme/plan NAMES for the served scope (same-tenant, scoped).
  const clientIds = [...new Set(servedScope.map((s) => s.clientId))];
  const groupIds = [...new Set(servedScope.map((s) => s.groupId).filter((x): x is string => !!x))];
  const packageIds = [...new Set(servedScope.map((s) => s.packageId).filter((x): x is string => !!x))];
  const [clients, groups, packages] = await Promise.all([
    clientIds.length ? prisma.client.findMany({ where: { id: { in: clientIds }, operatorTenantId: ctx.tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
    groupIds.length ? prisma.group.findMany({ where: { id: { in: groupIds }, tenantId: ctx.tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
    packageIds.length ? prisma.package.findMany({ where: { id: { in: packageIds }, tenantId: ctx.tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const packageName = new Map(packages.map((p) => [p.id, p.name]));

  // P02.02: `toLocaleDateString` does not throw on an Invalid Date, so this was
  // never a crash site — but it rendered a bare "Invalid Date" and hard-coded a
  // locale format outside the P01.05 helpers. Both now go through one path.
  const fmtDate = (v: Date | string | null) => formatStoredDate(v == null ? null : new Date(v));
  const dateInput = serviceDate.toISOString().slice(0, 10);
  const canExport = ProviderAccessService.hasPermission(ctx, CONTRACT_VIEW_PERMISSION);
  const cond = header.conditional;

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/provider/contracts" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to contracts">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
              <ScrollText size={22} /> {header.contractNumber}
            </h1>
            <p className="text-sm text-brand-text-muted mt-0.5">
              {header.title} · {header.contractType.replace(/_/g, " ")} ·{" "}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${labelTone(header.effectiveLabel)}`}>{header.effectiveLabel}</span>
            </p>
          </div>
        </div>
        {canExport && (
          <a
            href={`/provider/contracts/${header.id}/export?date=${dateInput}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-indigo border border-brand-indigo/30 rounded-lg px-3 py-1.5 hover:bg-brand-indigo/5"
          >
            <Download size={15} /> Export rates (CSV)
          </a>
        )}
      </div>

      {/* Terms grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Term label="Effective">{fmtDate(header.startDate)} – {fmtDate(header.endDate)}</Term>
        <Term label="Currency">{header.currency}</Term>
        <Term label="Payment terms">{header.paymentTermDays} days ({header.paymentTermType.toLowerCase()})</Term>
        <Term label="Submission window">{header.submissionWindowDays != null ? `${header.submissionWindowDays} days${header.submissionWindowBasis ? ` from ${header.submissionWindowBasis.replace(/_/g, " ").toLowerCase()}` : ""}` : "—"}</Term>
        <Term label="Balance billing">{header.balanceBillingPolicy ? header.balanceBillingPolicy.replace(/_/g, " ").toLowerCase() : "—"}</Term>
        <Term label="Tax">{header.taxInclusive.toLowerCase()}</Term>
        <Term label="Reconciliation">{header.reconciliationCadence.toLowerCase()}</Term>
        <Term label="Branch scope">{header.branchScope.replace(/_/g, " ").toLowerCase()}</Term>
        {header.externalContractRef && <Term label="External ref">{header.externalContractRef}</Term>}
      </div>

      {/* Commercial terms (F7.1 CONDITIONAL — visible under the §10 sign-off that gates this whole surface) */}
      {(cond.unlistedServiceRule || cond.unlistedDiscountPct || cond.earlySettlementDiscountPct || cond.invoiceDiscountPct) && (
        <Section title="Commercial terms">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 px-5 py-4">
            <Term label="Unlisted service">{cond.unlistedServiceRule.replace(/_/g, " ").toLowerCase()}{cond.unlistedDiscountPct ? ` (${cond.unlistedDiscountPct}%)` : ""}</Term>
            {cond.earlySettlementDiscountPct && <Term label="Early settlement">{cond.earlySettlementDiscountPct}%{cond.earlySettlementWindowDays ? ` within ${cond.earlySettlementWindowDays} days` : ""}</Term>}
            {cond.invoiceDiscountPct && <Term label="Invoice discount">{cond.invoiceDiscountPct}%</Term>}
          </div>
        </Section>
      )}

      {/* Versions */}
      <Section title="Versions">
        <ul className="divide-y divide-[#F4F4F4]">
          {versions.map((v) => (
            <li key={v.versionNumber} className="px-5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold">v{v.versionNumber}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${labelTone(v.label)}`}>{v.label}</span>
              <span className="text-xs text-brand-text-muted">{fmtDate(v.effectiveFrom)} – {fmtDate(v.effectiveTo)}</span>
              {v.changeSummary && <span className="text-xs text-brand-text-body">· {v.changeSummary}</span>}
            </li>
          ))}
        </ul>
      </Section>

      {/* Covered populations */}
      {servedScope.length > 0 && (
        <Section title="Covered populations">
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[40rem]">
              <thead className="text-[11px] uppercase text-brand-text-muted">
                <tr className="border-b border-[#EEEEEE]"><th className="text-left px-5 py-2 font-bold">Payer</th><th className="text-left px-5 py-2 font-bold">Scheme</th><th className="text-left px-5 py-2 font-bold">Plan</th><th className="text-left px-5 py-2 font-bold">Benefit</th><th className="text-left px-5 py-2 font-bold">Tier</th></tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F4]">
                {servedScope.map((s, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2 text-xs">{clientName.get(s.clientId) ?? "—"}</td>
                    <td className="px-5 py-2 text-xs">{s.groupId ? groupName.get(s.groupId) ?? "—" : "All schemes"}</td>
                    <td className="px-5 py-2 text-xs">{s.packageId ? packageName.get(s.packageId) ?? "—" : "All plans"}</td>
                    <td className="px-5 py-2 text-xs">{s.benefitCategory ?? "All"}</td>
                    <td className="px-5 py-2 text-xs">{s.networkTier ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Branches */}
      {branches.length > 0 && (
        <Section title="Covered branches">
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {branches.map((b, i) => (
              <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${b.isActive ? "border-[#DDDDDD] text-brand-text-body" : "border-[#EEEEEE] text-brand-text-muted line-through"}`}>
                {b.name}{b.county ? ` · ${b.county}` : ""}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Requirements: PA + documents */}
      {(preauthRules.length > 0 || documentRules.length > 0) && (
        <Section title="Requirements">
          <div className="px-5 py-4 space-y-3 text-sm">
            {preauthRules.map((r, i) => (
              <p key={`pa${i}`} className="text-brand-text-body">
                <span className="font-semibold">Pre-authorisation</span> — trigger {r.triggerType.replace(/_/g, " ").toLowerCase()}
                {r.thresholdAmount ? ` above ${header.currency} ${r.thresholdAmount}` : ""}
                {r.approvalSlaHours ? ` · SLA ${r.approvalSlaHours}h` : ""}
                {r.requiredDocumentTypes.length ? ` · needs ${r.requiredDocumentTypes.join(", ").replace(/_/g, " ").toLowerCase()}` : ""}
                {r.emergencyExempt ? " · emergencies exempt" : ""}
                {" "}<span className="text-xs text-brand-text-muted">(if missing: {r.consequenceIfMissing.replace(/_/g, " ").toLowerCase()})</span>
              </p>
            ))}
            {documentRules.map((r, i) => (
              <p key={`doc${i}`} className="text-brand-text-body">
                <span className="font-semibold">Document</span> — {r.documentType.replace(/_/g, " ").toLowerCase()} {r.mandatory ? "(mandatory)" : "(optional)"}
                {" "}<span className="text-xs text-brand-text-muted">(if missing: {r.consequenceIfMissing.replace(/_/g, " ").toLowerCase()})</span>
              </p>
            ))}
          </div>
        </Section>
      )}

      {/* Capitation */}
      {capitation.length > 0 && (
        <Section title="Capitation">
          <div className="px-5 py-4 space-y-2 text-sm">
            {capitation.map((cp, i) => (
              <p key={i} className="text-brand-text-body">
                {cp.ruleKind.replace(/_/g, " ").toLowerCase()}{cp.rate ? ` · ${header.currency} ${cp.rate}${cp.basis ? ` ${cp.basis}` : ""}` : ""}
                {cp.carveOutCodes.length ? <span className="text-xs text-brand-text-muted"> · carve-outs: {cp.carveOutCodes.join(", ")}</span> : null}
              </p>
            ))}
          </div>
        </Section>
      )}

      {/* Exclusions */}
      {exclusions.length > 0 && (
        <Section title="Exclusions">
          <ul className="divide-y divide-[#F4F4F4]">
            {exclusions.map((x, i) => (
              <li key={i} className="px-5 py-2 text-sm">
                <span className="font-medium">{x.service}</span>{x.cptCode ? <span className="text-xs text-brand-text-muted"> · {x.cptCode}</span> : null}
                {x.reason ? <span className="text-xs text-brand-text-muted"> — {x.reason}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Rate schedule + search */}
      <Section title="Rate schedule">
        <form method="GET" className="flex flex-wrap items-end gap-2 px-5 py-3 border-b border-[#EEEEEE]">
          <label className="text-xs text-brand-text-muted">Code<input name="code" defaultValue={code ?? ""} placeholder="CPT / provider code" className="block mt-0.5 w-40 rounded-lg border border-[#DDDDDD] px-2.5 py-1.5 text-sm" /></label>
          <label className="text-xs text-brand-text-muted">Service<input name="name" defaultValue={name ?? ""} placeholder="service name" className="block mt-0.5 w-48 rounded-lg border border-[#DDDDDD] px-2.5 py-1.5 text-sm" /></label>
          <label className="text-xs text-brand-text-muted">Service date<input type="date" name="date" defaultValue={dateInput} className="block mt-0.5 rounded-lg border border-[#DDDDDD] px-2.5 py-1.5 text-sm" /></label>
          <button type="submit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-indigo rounded-lg px-3 py-1.5"><Search size={14} /> Search</button>
          {(code || name) && <a href={`/provider/contracts/${header.id}?date=${dateInput}`} className="text-xs text-brand-text-muted underline self-center">clear</a>}
        </form>
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[52rem]">
            <thead className="text-[11px] uppercase text-brand-text-muted">
              <tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-4 py-2 font-bold">Service</th>
                <th className="text-left px-4 py-2 font-bold">Code</th>
                <th className="text-right px-4 py-2 font-bold">Rate</th>
                <th className="text-left px-4 py-2 font-bold">Type</th>
                <th className="text-right px-4 py-2 font-bold">Limits</th>
                <th className="text-center px-4 py-2 font-bold">PA</th>
                <th className="text-center px-4 py-2 font-bold">Referral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F4]">
              {rates.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-brand-text-muted text-sm">No effective rates for this service date{code || name ? " and search" : ""}.</td></tr>
              ) : (
                rates.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="px-4 py-2 font-normal text-brand-text-heading">{r.service}</th>
                    <td className="px-4 py-2 text-xs text-brand-text-muted">{r.cptCode ?? r.providerCode ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {r.rateUnderConfirmation ? <span className="italic text-brand-text-muted">under confirmation</span> : `${r.currency} ${r.rate}`}
                    </td>
                    <td className="px-4 py-2 text-xs">{r.rateType.replace(/_/g, " ").toLowerCase()}</td>
                    <td className="px-4 py-2 text-right text-xs text-brand-text-muted">
                      {[r.maxPayable ? `≤${r.maxPayable}` : null, r.maxQuantityPerVisit ? `${r.maxQuantityPerVisit}/visit` : null, r.frequencyLimit ? `${r.frequencyLimit}${r.frequencyPeriod ? `/${r.frequencyPeriod.toLowerCase()}` : ""}` : null].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-center text-xs">{r.requiresPreauth ? "Yes" : "—"}</td>
                    <td className="px-4 py-2 text-center text-xs">{r.requiresReferral ? "Yes" : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {ratePage && ratePage.total > rates.length && (
          <p className="px-5 py-2 text-[11px] text-brand-text-muted">Showing {rates.length} of {ratePage.total} rate lines — refine your search or export the full schedule.</p>
        )}
      </Section>

      {/* F7.3 step 5 — discrepancy entry point. The dedicated rate change-request / TPA queue lands in F7.6;
          until then this is an honest, dead-link-free affordance directing the provider to the network manager. */}
      <div className="bg-[#FFF9E6] border border-[#FFE58F] rounded-lg px-5 py-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-[#856404] mt-0.5 shrink-0" />
        <div className="text-sm text-[#856404]">
          <p className="font-semibold">Something look wrong?</p>
          <p className="mt-0.5">If a rate or requirement on {header.contractNumber} doesn&apos;t match your agreement, contact your network manager to raise a rate discrepancy. A self-service change request is coming soon.</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
      <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">{title}</h2>
      {children}
    </section>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-3">
      <p className="text-[11px] font-bold uppercase text-brand-text-muted">{label}</p>
      <p className="text-sm text-brand-text-heading mt-0.5 capitalize">{children}</p>
    </div>
  );
}
