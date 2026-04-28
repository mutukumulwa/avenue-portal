"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import {
  User, Shield, Users, Receipt, Activity, MessageSquare,
  Phone, Mail, Clock, CheckCircle, XCircle,
  AlertTriangle, ChevronRight, Plus, Send, CreditCard, RefreshCw
} from "lucide-react";
import { issueCardAction } from "@/app/(admin)/members/[id]/card/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type Benefit = {
  id: string; category: string; annualSubLimit: number;
  copayPercentage: number; waitingPeriodDays: number;
};
type BenefitUsage = {
  id: string; amountUsed: number;
  benefitConfig: { category: string; annualSubLimit: number };
};
type Dependent = {
  id: string; firstName: string; lastName: string; memberNumber: string;
  relationship: string; dateOfBirth: string; status: string;
};
type Claim = {
  id: string; claimNumber: string; serviceType: string;
  billedAmount: number; approvedAmount: number; status: string; createdAt: string;
  provider: { name: string };
};
type Preauth = {
  id: string; preauthNumber: string; estimatedCost: number;
  approvedAmount: number | null; status: string; createdAt: string;
  provider: { name: string };
};
type ActivityEntry = {
  id: string; action: string; description: string; createdAt: string;
};
type CorrespondenceEntry = {
  id: string; type: string; channel: string; subject: string | null;
  body: string | null; status: string; sentAt: string;
};
type Member = {
  id: string; firstName: string; otherNames: string | null; lastName: string;
  memberNumber: string; status: string; dateOfBirth: string; gender: string;
  idNumber: string | null; phone: string | null; email: string | null;
  relationship: string; enrollmentDate: string; activationDate: string | null;
  smartCardNumber: string | null;
  group: { id: string; name: string; renewalDate: string };
  package: { name: string; currentVersion: { benefits: Benefit[] } | null };
  dependents: Dependent[];
  benefitUsages: BenefitUsage[];
  claims: Claim[];
  preauths: Preauth[];
  activityLogs: ActivityEntry[];
  correspondence: CorrespondenceEntry[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusPill = (s: string) => {
  const map: Record<string, string> = {
    ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
    SUSPENDED: "bg-[#FFC107]/10 text-[#856404]",
    TERMINATED: "bg-[#DC3545]/10 text-[#DC3545]",
    LAPSED: "bg-[#DC3545]/10 text-[#DC3545]",
    APPROVED: "bg-[#28A745]/10 text-[#28A745]",
    PAID: "bg-[#28A745]/10 text-[#28A745]",
    RECEIVED: "bg-[#17A2B8]/10 text-[#17A2B8]",
    UNDER_REVIEW: "bg-[#17A2B8]/10 text-[#17A2B8]",
    DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
    PARTIALLY_APPROVED: "bg-[#FFC107]/10 text-[#856404]",
    SUBMITTED: "bg-[#17A2B8]/10 text-[#17A2B8]",
    CONVERTED_TO_CLAIM: "bg-[#28A745]/10 text-[#28A745]",
  };
  return map[s] ?? "bg-[#6C757D]/10 text-[#6C757D]";
};

const fmt = (n: number) => n.toLocaleString("en-KE");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-KE");
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

// ─── Insurance Card ───────────────────────────────────────────────────────────

function InsuranceCard({ member }: { member: Member }) {
  const validTo = new Date(member.group.renewalDate);
  const validFrom = new Date(member.enrollmentDate);

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden shadow-xl text-white select-none"
      style={{
        background: "linear-gradient(135deg, #292A83 0%, #435BA1 60%, #F5C6B6 150%)",
        minHeight: 200,
      }}
    >
      {/* Background decoration */}
      <div className="absolute top-[-40px] right-[-40px] h-48 w-48 rounded-full bg-white/5" />
      <div className="absolute bottom-[-30px] right-[60px] h-32 w-32 rounded-full bg-white/5" />
      <div className="absolute top-[20px] right-[20px] h-20 w-20 rounded-full bg-white/10" />

      <div className="relative z-10 p-6 flex flex-col justify-between h-full" style={{ minHeight: 200 }}>
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Avenue Healthcare</p>
              <p className="text-xs font-bold text-white">{member.package.name}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            member.status === "ACTIVE" ? "bg-[#28A745]/30 text-white" : "bg-white/20 text-white"
          }`}>
            {member.status}
          </span>
        </div>

        {/* Member number */}
        <div className="mt-4">
          <p className="text-[10px] text-white/60 uppercase tracking-widest mb-1">Member No.</p>
          <p className="font-mono text-xl font-bold tracking-wider text-white">
            {member.memberNumber}
          </p>
        </div>

        {/* Bottom row */}
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-white/60 uppercase tracking-widest mb-0.5">Card Holder</p>
            <p className="font-bold text-white text-sm">
              {member.firstName} {member.otherNames ? member.otherNames + " " : ""}{member.lastName}
            </p>
            <p className="text-[10px] text-white/70 uppercase mt-0.5">{member.relationship}</p>
            <div className="mt-2">
              <p className="text-[10px] text-white/60 uppercase tracking-widest mb-0.5">Valid Period</p>
              <p className="text-xs font-bold text-white">{validFrom.toLocaleDateString("en-KE", { month: "short", year: "numeric" })} — {validTo.toLocaleDateString("en-KE", { month: "short", year: "numeric" })}</p>
              <p className="text-[10px] text-white/70 mt-0.5">{member.group.name}</p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-1.5 shadow-md flex-shrink-0">
            <QRCode
              value={member.memberNumber}
              size={72}
              bgColor="#ffffff"
              fgColor="#292A83"
              level="M"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ member, age }: { member: Member; age: number }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-6">
        <InsuranceCard member={member} />

        {/* Quick actions */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-avenue-text-muted mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "New Claim", href: `/claims/new?memberId=${member.id}`, color: "bg-avenue-indigo" },
              { label: "New Pre-Auth", href: `/preauth/new?memberId=${member.id}`, color: "bg-[#17A2B8]" },
              { label: "New Endorsement", href: `/endorsements/new?memberId=${member.id}`, color: "bg-[#6C757D]" },
              { label: "Add Dependent", href: `/members/new?principalId=${member.id}`, color: "bg-[#28A745]" },
            ].map(a => (
              <Link key={a.label} href={a.href}
                className={`${a.color} text-white text-xs font-bold py-2 px-3 rounded-full text-center hover:opacity-90 transition-opacity`}>
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Member details */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-2.5">
        <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Personal Information</h3>
        {[
          { label: "Date of Birth", value: `${fmtDate(member.dateOfBirth)} (Age ${age})` },
          { label: "Gender", value: member.gender },
          { label: "ID / Passport", value: member.idNumber ?? "—" },
          { label: "Phone", value: member.phone ?? "—" },
          { label: "Email", value: member.email ?? "—" },
          { label: "Relationship", value: member.relationship },
        ].map(f => (
          <div key={f.label} className="flex justify-between text-sm py-1 border-b border-[#EEEEEE]/50 last:border-0">
            <span className="text-avenue-text-muted">{f.label}</span>
            <span className="font-semibold text-avenue-text-heading">{f.value}</span>
          </div>
        ))}

        <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 pt-2">Policy Details</h3>
        {[
          { label: "Group", value: <Link href={`/groups/${member.group.id}`} className="text-avenue-indigo hover:underline font-semibold">{member.group.name}</Link> },
          { label: "Package", value: member.package.name },
          { label: "Enrolled", value: fmtDate(member.enrollmentDate) },
          { label: "Activated", value: member.activationDate ? fmtDate(member.activationDate) : "Pending" },
          { label: "Renewal", value: fmtDate(member.group.renewalDate) },
          { label: "SMART Card No.", value: member.smartCardNumber ?? "—" },
        ].map(f => (
          <div key={f.label} className="flex justify-between text-sm py-1 border-b border-[#EEEEEE]/50 last:border-0">
            <span className="text-avenue-text-muted">{f.label}</span>
            <span className="font-semibold text-avenue-text-heading">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Benefits ────────────────────────────────────────────────────────────

function BenefitsTab({ member }: { member: Member }) {
  const benefits = member.package.currentVersion?.benefits ?? [];
  const usageMap = new Map(member.benefitUsages.map(u => [u.benefitConfig.category, u]));

  const totalLimit = benefits.reduce((s, b) => s + b.annualSubLimit, 0);
  const totalUsed = member.benefitUsages.reduce((s, u) => s + u.amountUsed, 0);
  const overallPct = totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Overall utilisation */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
        <div className="flex justify-between items-end mb-2">
          <p className="text-sm font-bold text-avenue-text-heading">Overall Utilisation</p>
          <p className="text-sm font-semibold text-avenue-text-muted">
            KES {fmt(totalUsed)} / {fmt(totalLimit)}
          </p>
        </div>
        <div className="h-3 bg-[#E6E7E8] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overallPct >= 90 ? "bg-[#DC3545]" : overallPct >= 70 ? "bg-[#FFC107]" : "bg-[#28A745]"}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-avenue-text-muted">
          <span>{overallPct.toFixed(1)}% utilised</span>
          <span>KES {fmt(Math.max(0, totalLimit - totalUsed))} remaining</span>
        </div>
      </div>

      {/* Per-benefit table */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Benefit Category</th>
              <th className="px-5 py-3">Annual Limit</th>
              <th className="px-5 py-3">Co-Pay</th>
              <th className="px-5 py-3">Waiting Period</th>
              <th className="px-5 py-3">Used</th>
              <th className="px-5 py-3">Remaining</th>
              <th className="px-5 py-3 w-36">Utilisation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {benefits.map(b => {
              const usage = usageMap.get(b.category);
              const used = usage ? usage.amountUsed : 0;
              const limit = b.annualSubLimit;
              const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
              return (
                <tr key={b.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">
                    {b.category.replace(/_/g, " ")}
                  </td>
                  <td className="px-5 py-3">KES {fmt(limit)}</td>
                  <td className="px-5 py-3">
                    {b.copayPercentage > 0 ? (
                      <span className="bg-[#FFC107]/10 text-[#856404] px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {b.copayPercentage}%
                      </span>
                    ) : (
                      <span className="text-[#28A745] font-bold text-[10px]">None</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {b.waitingPeriodDays > 0 ? (
                      <span className="flex items-center gap-1 text-avenue-text-muted text-xs">
                        <Clock size={10} /> {b.waitingPeriodDays}d
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">
                    {used > 0 ? `KES ${fmt(used)}` : "—"}
                  </td>
                  <td className={`px-5 py-3 font-semibold ${pct >= 90 ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                    KES {fmt(Math.max(0, limit - used))}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#E6E7E8] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-[#DC3545]" : pct >= 70 ? "bg-[#FFC107]" : "bg-[#28A745]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-avenue-text-muted w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {benefits.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-avenue-text-body">No benefits defined for this package.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Dependants ─────────────────────────────────────────────────────────

function DependantsTab({ member }: { member: Member }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={`/members/new?principalId=${member.id}&groupId=${member.group.id}`}
          className="bg-avenue-indigo text-white text-sm font-bold px-5 py-2 rounded-full hover:bg-avenue-secondary transition-colors flex items-center gap-2"
        >
          <Plus size={15} /> Add Dependent
        </Link>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Member No.</th>
              <th className="px-5 py-3">Relationship</th>
              <th className="px-5 py-3">Date of Birth</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {member.dependents.map(d => {
              const dAge = Math.floor((new Date().getTime() - new Date(d.dateOfBirth).getTime()) / (1000 * 3600 * 24 * 365.25));
              return (
                <tr key={d.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">
                    {d.firstName} {d.lastName}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{d.memberNumber}</td>
                  <td className="px-5 py-3">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                      {d.relationship}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm">{fmtDate(d.dateOfBirth)} <span className="text-avenue-text-muted text-xs">({dAge} yrs)</span></td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusPill(d.status)}`}>
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/members/${d.id}`} className="text-avenue-indigo text-xs font-semibold hover:underline flex items-center gap-1">
                      View profile <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {member.dependents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center">
                  <Users size={32} className="mx-auto mb-2 text-[#EEEEEE]" />
                  <p className="text-avenue-text-body text-sm">No dependants enrolled.</p>
                  <Link href={`/members/new?principalId=${member.id}`} className="text-avenue-indigo text-sm font-semibold hover:underline mt-1 inline-block">
                    + Add first dependent
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Claims & Pre-Auths ─────────────────────────────────────────────────

function ClaimsTab({ member }: { member: Member }) {
  const [view, setView] = useState<"claims" | "preauths">("claims");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["claims", "preauths"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase transition-colors ${view === v ? "bg-avenue-indigo text-white" : "bg-[#E6E7E8] text-[#6C757D] hover:bg-avenue-indigo/10"}`}>
            {v === "claims" ? `Claims (${member.claims.length})` : `Pre-Auths (${member.preauths.length})`}
          </button>
        ))}
        <Link href={view === "claims" ? `/claims/new?memberId=${member.id}` : `/preauth/new?memberId=${member.id}`}
          className="ml-auto bg-avenue-indigo text-white text-xs font-bold px-4 py-1.5 rounded-full hover:bg-avenue-secondary transition-colors flex items-center gap-1">
          <Plus size={13} /> New {view === "claims" ? "Claim" : "Pre-Auth"}
        </Link>
      </div>

      {view === "claims" && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Claim No.</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Billed</th>
                <th className="px-5 py-3">Approved</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {member.claims.map(c => (
                <tr key={c.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-avenue-text-heading">{c.claimNumber}</td>
                  <td className="px-5 py-3">{c.provider.name}</td>
                  <td className="px-5 py-3 text-xs uppercase font-bold text-avenue-text-muted">{c.serviceType.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 font-semibold">KES {fmt(c.billedAmount)}</td>
                  <td className="px-5 py-3 text-[#28A745] font-semibold">{c.approvedAmount > 0 ? `KES ${fmt(c.approvedAmount)}` : "—"}</td>
                  <td className="px-5 py-3 text-xs text-avenue-text-muted">{fmtDate(c.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusPill(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/claims/${c.id}`} className="text-avenue-indigo text-xs font-semibold hover:underline">Review</Link>
                  </td>
                </tr>
              ))}
              {member.claims.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-avenue-text-body">No claims on record.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "preauths" && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">PA No.</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Estimated</th>
                <th className="px-5 py-3">Approved</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {member.preauths.map(p => (
                <tr key={p.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-avenue-text-heading">{p.preauthNumber}</td>
                  <td className="px-5 py-3">{p.provider.name}</td>
                  <td className="px-5 py-3 font-semibold">KES {fmt(p.estimatedCost)}</td>
                  <td className="px-5 py-3 text-[#28A745] font-semibold">{p.approvedAmount ? `KES ${fmt(p.approvedAmount)}` : "—"}</td>
                  <td className="px-5 py-3 text-xs text-avenue-text-muted">{fmtDate(p.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusPill(p.status)}`}>{p.status.replace(/_/g, " ")}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/preauth/${p.id}`} className="text-avenue-indigo text-xs font-semibold hover:underline">Review</Link>
                  </td>
                </tr>
              ))}
              {member.preauths.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-avenue-text-body">No pre-authorizations.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Activity Log ────────────────────────────────────────────────────────

function ActivityTab({ logs }: { logs: ActivityEntry[] }) {
  const actionIcon = (action: string) => {
    if (action.includes("APPROVED") || action.includes("PAID")) return <CheckCircle size={14} className="text-[#28A745]" />;
    if (action.includes("DECLINED") || action.includes("TERMINATED")) return <XCircle size={14} className="text-[#DC3545]" />;
    if (action.includes("SUSPEND") || action.includes("OVERDUE")) return <AlertTriangle size={14} className="text-[#FFC107]" />;
    return <Activity size={14} className="text-avenue-indigo" />;
  };

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
      {logs.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Activity size={32} className="mx-auto mb-2 text-[#EEEEEE]" />
          <p className="text-avenue-text-body text-sm">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#EEEEEE]">
          {logs.map((log, i) => (
            <div key={log.id} className="flex gap-4 px-5 py-4 hover:bg-[#F8F9FA]">
              <div className="flex flex-col items-center">
                <div className="h-7 w-7 rounded-full bg-[#F8F9FA] border border-[#EEEEEE] flex items-center justify-center">
                  {actionIcon(log.action)}
                </div>
                {i < logs.length - 1 && <div className="w-px flex-1 bg-[#EEEEEE] mt-1" />}
              </div>
              <div className="pb-4 flex-1">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-semibold text-avenue-text-heading">{log.description}</p>
                  <p className="text-[10px] text-avenue-text-muted whitespace-nowrap ml-4">{fmtDateTime(log.createdAt)}</p>
                </div>
                <span className="text-[10px] font-bold uppercase bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded mt-1 inline-block">
                  {log.action.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Correspondence (CRM) ────────────────────────────────────────────────

function CorrespondenceTab({ member, correspondence }: { member: Member; correspondence: CorrespondenceEntry[] }) {
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const channelIcon = (ch: string) => ch === "SMS" ? <Phone size={12} /> : <Mail size={12} />;

  const typeColor = (t: string) => {
    const map: Record<string, string> = {
      WELCOME: "bg-[#28A745]/10 text-[#28A745]",
      CLAIM_UPDATE: "bg-[#17A2B8]/10 text-[#17A2B8]",
      RENEWAL_REMINDER: "bg-[#FFC107]/10 text-[#856404]",
      SUSPENSION_NOTICE: "bg-[#DC3545]/10 text-[#DC3545]",
      PREAUTH_STATUS: "bg-avenue-indigo/10 text-avenue-indigo",
      CARD_ISSUED: "bg-[#6C757D]/10 text-[#6C757D]",
    };
    return map[t] ?? "bg-[#6C757D]/10 text-[#6C757D]";
  };

  async function handleSend(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/members/${member.id}/correspondence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: fd.get("type"),
        channel: fd.get("channel"),
        subject: fd.get("subject"),
        body: fd.get("body"),
      }),
    });
    setSending(false);
    setSent(true);
    setShowForm(false);
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-avenue-indigo text-white text-xs font-bold px-5 py-2 rounded-full hover:bg-avenue-secondary transition-colors flex items-center gap-2"
        >
          <Send size={13} /> Log Correspondence
        </button>
      </div>

      {sent && (
        <div className="bg-[#28A745]/10 text-[#28A745] border border-[#28A745]/20 rounded-[8px] px-4 py-3 text-sm font-semibold flex items-center gap-2">
          <CheckCircle size={16} /> Correspondence logged successfully.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSend} className="bg-white border border-avenue-indigo/30 rounded-[8px] p-5 shadow-sm space-y-4">
          <p className="font-bold text-avenue-text-heading font-heading text-sm">Log New Correspondence</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-avenue-text-muted uppercase">Type</label>
              <select name="type" required className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-avenue-text-heading focus:ring-2 focus:ring-avenue-indigo outline-none">
                {["WELCOME","CARD_ISSUED","CLAIM_UPDATE","RENEWAL_REMINDER","SUSPENSION_NOTICE","PREAUTH_STATUS","GENERAL"].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-avenue-text-muted uppercase">Channel</label>
              <select name="channel" required className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-avenue-text-heading focus:ring-2 focus:ring-avenue-indigo outline-none">
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-avenue-text-muted uppercase">Subject</label>
            <input name="subject" type="text" placeholder="Email subject (optional for SMS)"
              className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-avenue-text-heading focus:ring-2 focus:ring-avenue-indigo outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-avenue-text-muted uppercase">Message / Notes</label>
            <textarea name="body" rows={3} required placeholder="Enter message content or internal notes..."
              className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-avenue-text-heading focus:ring-2 focus:ring-avenue-indigo outline-none resize-none" />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-bold text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={sending}
              className="bg-avenue-indigo text-white text-xs font-bold px-5 py-2 rounded-full hover:bg-avenue-secondary transition-colors disabled:opacity-60 flex items-center gap-2">
              <Send size={12} /> {sending ? "Sending…" : "Log & Send"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        {correspondence.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <MessageSquare size={32} className="mx-auto mb-2 text-[#EEEEEE]" />
            <p className="text-avenue-text-body text-sm">No correspondence recorded.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#EEEEEE]">
            {correspondence.map(c => (
              <div key={c.id} className="px-5 py-4 hover:bg-[#F8F9FA]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${typeColor(c.type)}`}>
                      {c.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-avenue-text-muted flex items-center gap-1 bg-[#E6E7E8] px-2 py-0.5 rounded-full">
                      {channelIcon(c.channel)} {c.channel}
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${c.status === "SENT" ? "text-[#28A745]" : c.status === "FAILED" ? "text-[#DC3545]" : "text-[#6C757D]"}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-avenue-text-muted whitespace-nowrap ml-4">{fmtDateTime(c.sentAt)}</p>
                </div>
                {c.subject && <p className="text-sm font-semibold text-avenue-text-heading mt-2">{c.subject}</p>}
                {c.body && <p className="text-xs text-avenue-text-body mt-1 leading-relaxed">{c.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Card Issuance ───────────────────────────────────────────────────────

function CardTab({ member }: { member: Member }) {
  const boundAction = issueCardAction.bind(null, member.id);
  const [state, formAction, pending] = useActionState(boundAction, null);

  const cardHistory = member.activityLogs.filter(l => l.action === "CARD_ISSUED");
  const isIssued = !!member.smartCardNumber;

  return (
    <div className="space-y-6">
      {/* Card status banner */}
      <div className={`rounded-lg p-5 border flex items-start gap-4 ${isIssued ? "bg-[#28A745]/5 border-[#28A745]/20" : "bg-[#FFC107]/5 border-[#FFC107]/30"}`}>
        <div className={`rounded-full p-2 ${isIssued ? "bg-[#28A745]/10" : "bg-[#FFC107]/10"}`}>
          <CreditCard size={22} className={isIssued ? "text-[#28A745]" : "text-[#856404]"} />
        </div>
        <div>
          <p className={`font-bold text-sm ${isIssued ? "text-[#28A745]" : "text-[#856404]"}`}>
            {isIssued ? "SMART Card Issued" : "No SMART Card Issued"}
          </p>
          {isIssued ? (
            <p className="text-avenue-text-muted text-xs mt-0.5">
              Card number: <span className="font-mono font-bold text-avenue-text-heading">{member.smartCardNumber}</span>
            </p>
          ) : (
            <p className="text-avenue-text-muted text-xs mt-0.5">
              Use the form below to issue a SMART card to this member.
            </p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Issue / re-issue form */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            {isIssued ? <RefreshCw size={15} /> : <CreditCard size={15} />}
            {isIssued ? "Re-issue Card" : "Issue Card"}
          </h3>

          {state?.success && (
            <div className="flex items-center gap-2 bg-[#28A745]/10 text-[#28A745] border border-[#28A745]/20 rounded-lg px-4 py-2.5 text-sm font-semibold">
              <CheckCircle size={15} /> Card number saved successfully.
            </div>
          )}
          {state?.error && (
            <div className="flex items-center gap-2 bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/20 rounded-lg px-4 py-2.5 text-sm font-semibold">
              <XCircle size={15} /> {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-avenue-text-muted uppercase">
                SMART Card Number
              </label>
              <input
                name="cardNumber"
                type="text"
                required
                defaultValue={member.smartCardNumber ?? ""}
                placeholder="e.g. SC-2025-00001"
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm text-avenue-text-heading font-mono focus:ring-2 focus:ring-avenue-indigo outline-none"
              />
              <p className="text-[11px] text-avenue-text-muted">
                Enter the physical SMART card number printed on the card.
              </p>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-avenue-indigo text-white font-bold text-sm py-2.5 rounded-full hover:bg-avenue-secondary transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <CreditCard size={14} />
              {pending ? "Saving…" : isIssued ? "Re-issue Card" : "Issue Card"}
            </button>
          </form>
        </div>

        {/* Issuance history */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-avenue-text-heading font-heading">Issuance History</h3>
          {cardHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CreditCard size={28} className="text-[#EEEEEE] mb-2" />
              <p className="text-sm text-avenue-text-muted">No card issuance events recorded.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#EEEEEE]">
              {cardHistory.map(log => (
                <div key={log.id} className="py-3 flex items-start gap-3">
                  <div className="rounded-full bg-avenue-indigo/10 p-1.5 shrink-0 mt-0.5">
                    <CreditCard size={12} className="text-avenue-indigo" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-avenue-text-body leading-snug">{log.description}</p>
                    <p className="text-[11px] text-avenue-text-muted mt-1">{fmtDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Root Tabs Component ──────────────────────────────────────────────────────

const TABS = [
  { id: "overview",        label: "Overview",          icon: User         },
  { id: "benefits",        label: "Benefits",          icon: Shield       },
  { id: "dependants",      label: "Dependants",        icon: Users        },
  { id: "claims",          label: "Claims & Pre-Auths", icon: Receipt     },
  { id: "card",            label: "Card",              icon: CreditCard   },
  { id: "activity",        label: "Activity Log",      icon: Activity     },
  { id: "correspondence",  label: "Correspondence",    icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function MemberProfileTabs({ member, age }: { member: Member; age: number }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-avenue-indigo text-avenue-indigo"
                    : "border-transparent text-avenue-text-muted hover:text-avenue-text-heading hover:border-[#EEEEEE]"
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {tab.id === "dependants" && member.dependents.length > 0 && (
                  <span className="bg-avenue-indigo text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {member.dependents.length}
                  </span>
                )}
                {tab.id === "claims" && (
                  <span className="bg-[#6C757D] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {member.claims.length + member.preauths.length}
                  </span>
                )}
                {tab.id === "card" && (
                  <span className={`w-2 h-2 rounded-full ${member.smartCardNumber ? "bg-[#28A745]" : "bg-[#FFC107]"}`} title={member.smartCardNumber ? "Card issued" : "No card"} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview"       && <OverviewTab member={member} age={age} />}
      {activeTab === "benefits"       && <BenefitsTab member={member} />}
      {activeTab === "dependants"     && <DependantsTab member={member} />}
      {activeTab === "claims"         && <ClaimsTab member={member} />}
      {activeTab === "card"           && <CardTab member={member} />}
      {activeTab === "activity"       && <ActivityTab logs={member.activityLogs} />}
      {activeTab === "correspondence" && <CorrespondenceTab member={member} correspondence={member.correspondence} />}
    </div>
  );
}
