import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, ShieldCheck, AlertTriangle, User, Building2, Calendar, ExternalLink } from "lucide-react";
import { FraudCaseActions } from "./FraudCaseActions";

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-[#6F1C1C] text-white",
  HIGH:     "bg-[#DC3545]/15 text-[#DC3545]",
  MEDIUM:   "bg-[#FFC107]/15 text-[#856404]",
  LOW:      "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function FraudCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(ROLES.OPS);
  const { id } = await params;

  const alert = await prisma.claimFraudAlert.findUnique({
    where: { id },
    include: {
      claim: {
        include: {
          member:   { select: { id: true, firstName: true, lastName: true, memberNumber: true, dateOfBirth: true, status: true, group: { select: { name: true } } } },
          provider: { select: { name: true, type: true, county: true } },
          claimLines: { orderBy: { lineNumber: "asc" } },
        },
      },
    },
  });

  if (!alert) notFound();

  const claim   = alert.claim;
  const member  = claim.member;
  const diagnoses = (claim.diagnoses as { icdCode: string; description: string; isPrimary: boolean }[]) ?? [];

  // Member's claim history at same provider (last 90 days from claim date) — the "velocity" evidence
  const windowStart = new Date(claim.dateOfService);
  windowStart.setDate(windowStart.getDate() - 90);
  const velocityClaims = await prisma.claim.findMany({
    where: {
      memberId:   member.id,
      providerId: claim.providerId,
      dateOfService: { gte: windowStart },
      id: { not: claim.id },
    },
    select: { claimNumber: true, dateOfService: true, billedAmount: true, status: true, benefitCategory: true },
    orderBy: { dateOfService: "desc" },
    take: 10,
  });

  // Member's overall claim spend (all time)
  const memberClaimStats = await prisma.claim.aggregate({
    where: { memberId: member.id, status: { in: ["APPROVED", "PAID", "PARTIALLY_APPROVED"] } },
    _sum:   { approvedAmount: true },
    _count: { _all: true },
  });

  const fmt    = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
  const fmtDt  = (d: Date)   => new Date(d).toLocaleDateString("en-KE");

  const scoreColor = alert.score >= 80 ? "#DC3545" : alert.score >= 60 ? "#FFC107" : "#28A745";
  const totalBilled = claim.claimLines.reduce((s, l) => s + Number(l.billedAmount), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/fraud" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors mt-1">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Fraud Case</h1>
            <span className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase ${SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.LOW}`}>
              {alert.severity}
            </span>
            {alert.resolved && (
              <span className="flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-[#28A745]/10 text-[#28A745]">
                <ShieldCheck size={11} /> Resolved
              </span>
            )}
          </div>
          <p className="text-avenue-text-muted text-sm mt-0.5">
            Rule: <span className="font-semibold text-avenue-text-body">{alert.rule}</span>
            <span className="mx-2">·</span>
            Flagged {fmtDt(alert.createdAt)}
          </p>
        </div>
        {/* Score gauge */}
        <div className="text-center shrink-0">
          <p className="text-[10px] font-bold uppercase text-avenue-text-muted mb-1">Risk Score</p>
          <div className="relative w-14 h-14">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#EEEEEE" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={scoreColor} strokeWidth="3"
                strokeDasharray={`${alert.score} ${100 - alert.score}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: scoreColor }}>
              {alert.score}
            </span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left col — claim evidence */}
        <div className="md:col-span-2 space-y-5">

          {/* Alert notes */}
          {alert.notes && (
            <div className="flex items-start gap-3 bg-[#FFF8E1] border border-[#FFC107]/30 rounded-lg px-4 py-3">
              <AlertTriangle size={15} className="text-[#856404] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[#856404] uppercase mb-1">Alert Notes / Evidence</p>
                <p className="text-sm text-avenue-text-body leading-relaxed">{alert.notes}</p>
              </div>
            </div>
          )}

          {/* Claim summary */}
          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-avenue-text-muted">Flagged Claim</p>
                <p className="font-mono font-bold text-avenue-indigo text-lg mt-0.5">{claim.claimNumber}</p>
              </div>
              <Link
                href={`/claims/${claim.id}`}
                className="flex items-center gap-1.5 text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5 px-3 py-1.5 rounded-full transition-colors"
              >
                Open Claim <ExternalLink size={12} />
              </Link>
            </div>

            <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-b border-[#EEEEEE]">
              {[
                { label: "Provider",        value: claim.provider.name },
                { label: "Service Type",    value: claim.serviceType.replace(/_/g, " ") },
                { label: "Date of Service", value: fmtDt(claim.dateOfService) },
                { label: "Benefit Cat.",    value: claim.benefitCategory.replace(/_/g, " ") },
                { label: "Total Billed",    value: fmt(totalBilled) },
                { label: "Status",          value: claim.status.replace(/_/g, " ") },
              ].map(r => (
                <div key={r.label} className="flex justify-between border-b border-[#F8F9FA] py-1 last:border-0">
                  <span className="text-avenue-text-muted">{r.label}</span>
                  <span className="font-semibold text-avenue-text-heading">{r.value}</span>
                </div>
              ))}
            </div>

            {/* Diagnoses */}
            {diagnoses.length > 0 && (
              <div className="px-5 py-3 border-b border-[#EEEEEE]">
                <p className="text-[10px] font-bold uppercase text-avenue-text-muted mb-2">Diagnoses</p>
                <div className="flex flex-wrap gap-2">
                  {diagnoses.map((d, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded font-mono ${d.isPrimary ? "bg-avenue-indigo/10 text-avenue-indigo font-bold" : "bg-[#E6E7E8] text-[#6C757D]"}`}>
                      {d.icdCode} — {d.description}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Claim lines */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[#6C757D] text-xs font-bold uppercase border-b border-[#EEEEEE]">
                    <th className="px-5 py-2 text-left">#</th>
                    <th className="px-5 py-2 text-left">Description</th>
                    <th className="px-5 py-2 text-left">CPT</th>
                    <th className="px-5 py-2 text-left">Category</th>
                    <th className="px-5 py-2 text-right">Qty</th>
                    <th className="px-5 py-2 text-right">Unit</th>
                    <th className="px-5 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {claim.claimLines.map(l => (
                    <tr key={l.id} className={l.isException ? "bg-[#FFF8E1]" : "hover:bg-[#F8F9FA]"}>
                      <td className="px-5 py-2.5 text-avenue-text-muted text-xs">{l.lineNumber}</td>
                      <td className="px-5 py-2.5 font-semibold text-avenue-text-heading">
                        {l.description}
                        {l.isException && <span className="ml-2 text-[10px] bg-[#FFC107]/20 text-[#856404] px-1.5 py-0.5 rounded font-bold">EXCEPTION</span>}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted">{l.cptCode ?? "—"}</td>
                      <td className="px-5 py-2.5 text-xs uppercase text-avenue-text-muted">{String(l.serviceCategory).replace(/_/g, " ")}</td>
                      <td className="px-5 py-2.5 text-right">{l.quantity}</td>
                      <td className="px-5 py-2.5 text-right text-avenue-text-muted">{fmt(Number(l.unitCost))}</td>
                      <td className="px-5 py-2.5 text-right font-bold text-avenue-text-heading">{fmt(Number(l.billedAmount))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#EEEEEE] bg-[#F8F9FA]">
                    <td colSpan={6} className="px-5 py-2.5 text-sm font-bold text-avenue-text-muted text-right">Total Billed</td>
                    <td className="px-5 py-2.5 text-right font-bold text-avenue-indigo">{fmt(totalBilled)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Velocity context — other claims at same provider */}
          {velocityClaims.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#EEEEEE]">
                <p className="text-xs font-bold uppercase text-avenue-text-muted">
                  Member&apos;s Other Claims at Same Provider (prior 90 days)
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[#6C757D] text-xs font-bold uppercase border-b border-[#EEEEEE]">
                    <th className="px-5 py-2 text-left">Claim No.</th>
                    <th className="px-5 py-2 text-left">Category</th>
                    <th className="px-5 py-2 text-left">Date</th>
                    <th className="px-5 py-2 text-right">Billed</th>
                    <th className="px-5 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {velocityClaims.map(vc => (
                    <tr key={vc.claimNumber} className="hover:bg-[#F8F9FA]">
                      <td className="px-5 py-2.5 font-mono text-xs font-semibold text-avenue-indigo">{vc.claimNumber}</td>
                      <td className="px-5 py-2.5 text-xs uppercase text-avenue-text-muted">{vc.benefitCategory.replace(/_/g, " ")}</td>
                      <td className="px-5 py-2.5 text-xs text-avenue-text-muted">{fmtDt(vc.dateOfService)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-avenue-text-heading">{fmt(Number(vc.billedAmount))}</td>
                      <td className="px-5 py-2.5 text-xs uppercase text-avenue-text-muted">{vc.status.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right col — member profile */}
        <div className="space-y-5">
          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <User size={14} className="text-avenue-text-muted" />
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Member</p>
            </div>
            <div>
              <p className="font-bold text-avenue-text-heading">{member.firstName} {member.lastName}</p>
              <p className="font-mono text-xs text-avenue-text-muted mt-0.5">{member.memberNumber}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                { label: "Group",   value: member.group.name },
                { label: "Status",  value: member.status.replace(/_/g, " ") },
                { label: "DOB",     value: fmtDt(member.dateOfBirth) },
              ].map(r => (
                <div key={r.label} className="flex justify-between border-b border-[#F8F9FA] py-1 last:border-0">
                  <span className="text-avenue-text-muted">{r.label}</span>
                  <span className="font-semibold text-avenue-text-heading">{r.value}</span>
                </div>
              ))}
            </div>
            <Link
              href={`/members/${member.id}`}
              className="text-xs text-avenue-indigo font-semibold hover:underline flex items-center gap-1"
            >
              Full member profile <ExternalLink size={11} />
            </Link>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-avenue-text-muted" />
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Provider</p>
            </div>
            <div>
              <p className="font-bold text-avenue-text-heading">{claim.provider.name}</p>
              <p className="text-xs text-avenue-text-muted mt-0.5">{claim.provider.type} · {claim.provider.county}</p>
            </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-avenue-text-muted" />
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Member Claim History</p>
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                { label: "Total approved claims", value: memberClaimStats._count._all.toString() },
                { label: "Total approved spend",  value: fmt(Number(memberClaimStats._sum.approvedAmount ?? 0)) },
                { label: "Claims at this provider (90d)", value: velocityClaims.length.toString() },
              ].map(r => (
                <div key={r.label} className="flex justify-between border-b border-[#F8F9FA] py-1 last:border-0">
                  <span className="text-avenue-text-muted text-xs">{r.label}</span>
                  <span className="font-bold text-avenue-text-heading text-xs">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Investigation / action panel */}
      <div className="space-y-3">
        <h2 className="font-bold text-avenue-text-heading font-heading">Investigation Actions</h2>
        <FraudCaseActions
          alertId={alert.id}
          claimId={claim.id}
          isResolved={alert.resolved}
          existingNotes={alert.notes}
        />
      </div>
    </div>
  );
}
