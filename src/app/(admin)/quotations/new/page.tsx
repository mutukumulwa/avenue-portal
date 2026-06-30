import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createIntakeAction } from "./actions";
import { ArrowLeft, Building2, User } from "lucide-react";
import Link from "next/link";

export default async function NewIntakePage() {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const [packages, brokers] = await Promise.all([
    prisma.package.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.broker.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true, brokerCode: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Minimum cover start: 7 days from today
  const minCoverStart = new Date();
  minCoverStart.setDate(minCoverStart.getDate() + 7);
  const minCoverStartStr = minCoverStart.toISOString().split("T")[0];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/quotations" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">New Business Intake</h1>
          <p className="text-brand-text-muted text-sm mt-0.5">Create a submission for underwriting assessment</p>
        </div>
      </div>

      <form action={createIntakeAction} className="space-y-6">
        {/* ── Client type ─────────────────────────────────────────────── */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-brand-text-heading text-sm uppercase tracking-wide">Client Type</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "CORPORATE",  label: "Corporate Scheme",  icon: Building2, desc: "Employer group with multiple members" },
              { value: "INDIVIDUAL", label: "Individual / Family", icon: User,      desc: "Single person or family unit" },
            ].map(({ value, label, icon: Icon, desc }) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="clientType" value={value} defaultChecked={value === "CORPORATE"} className="sr-only peer" required />
                <div className="border-2 border-[#EEEEEE] peer-checked:border-brand-indigo rounded-[8px] p-4 transition-colors">
                  <Icon size={20} className="text-brand-indigo mb-2" />
                  <p className="font-semibold text-brand-text-heading text-sm">{label}</p>
                  <p className="text-xs text-brand-text-muted mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Prospect / scheme details ────────────────────────────────── */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-brand-text-heading text-sm uppercase tracking-wide">Scheme Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Legal / Prospect Name</label>
              <input name="legalName" type="text" placeholder="e.g. Safaricom PLC"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
              {/* Also maps to prospectName for individual clients */}
              <input type="hidden" name="prospectName" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Industry / Sector</label>
              <input name="prospectIndustry" type="text" placeholder="e.g. Telecommunications"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Headcount (corporate)</label>
              <input name="headcount" type="number" min={1} placeholder="e.g. 250"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">KRA PIN (corporate)</label>
              <input name="kraPinCorporate" type="text" placeholder="P051234567X"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Billing Contact Email</label>
              <input name="billingContactEmail" type="email" placeholder="finance@company.co.ke"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Contact Person</label>
              <input name="prospectContact" type="text" placeholder="Full name"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Contact Email</label>
              <input name="prospectEmail" type="email" placeholder="contact@company.co.ke"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
          </div>
        </div>

        {/* ── Cover & package ──────────────────────────────────────────── */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-brand-text-heading text-sm uppercase tracking-wide">Cover & Package</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Requested Cover Start</label>
              <input name="requestedCoverStart" type="date" min={minCoverStartStr} required
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Cover Mode</label>
              <select name="fundingMode"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo">
                <option value="INSURED">Contribution Bearing</option>
                <option value="SELF_FUNDED">Fund Managed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Requested Package</label>
              <select name="packageId"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo">
                <option value="">— Select package —</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Submitting Broker</label>
              <select name="brokerId"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-indigo">
                <option value="">— Direct (no broker) —</option>
                {brokers.map(b => (
                  <option key={b.id} value={b.id}>{b.name}{b.brokerCode ? ` (${b.brokerCode})` : ""}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/quotations"
            className="px-5 py-2 border border-[#EEEEEE] rounded-full text-sm font-semibold text-brand-text-muted hover:border-brand-indigo hover:text-brand-indigo transition-colors">
            Cancel
          </Link>
          <button type="submit"
            className="px-6 py-2 bg-brand-indigo hover:bg-brand-secondary text-white rounded-full text-sm font-semibold transition-colors shadow-sm">
            Create Submission →
          </button>
        </div>
      </form>
    </div>
  );
}
