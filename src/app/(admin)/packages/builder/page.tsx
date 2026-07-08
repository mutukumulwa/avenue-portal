"use client";

import { Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createPackageAction } from "./actions";

export default function PackageBuilder() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/packages" className="text-[#848E9F] hover:text-brand-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-['Sora']">Build a Package</h1>
          <p className="text-[#848E9F] font-['Hanken_Grotesk'] mt-1">Configure limits, benefits, and dependencies.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 relative">
        <form action={createPackageAction} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Package Name</label>
              <input required name="name" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="e.g. Medvex Gold Corporate" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Package Type</label>
              <select name="type" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors">
                <option value="GROUP">Group</option>
                <option value="CORPORATE">Corporate</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="FAMILY">Family</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-brand-text-heading">Description</label>
              <textarea name="description" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="Package overview..."></textarea>
            </div>
          </div>

          <div className="border-t border-[#EEEEEE] pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Overall Annual Limit (UGX)</label>
              <input required name="annualLimit" type="number" defaultValue="500000" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Annual Premium Contribution (UGX)</label>
              <input required name="contributionAmount" type="number" defaultValue="25000" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Minimum Age</label>
              <input required name="minAge" type="number" defaultValue="0" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Maximum Age (Principals)</label>
              <input required name="maxAge" type="number" defaultValue="65" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" />
            </div>
          </div>

          <div className="border-t border-[#EEEEEE] pt-6 space-y-4">
            <h3 className="text-lg font-bold text-brand-text-heading font-['Sora']">Core Benefits</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {([
                { key: "inpatient", label: "Inpatient", limitName: "inpatientLimit", limitDefault: "500000" },
                { key: "outpatient", label: "Outpatient", limitName: "outpatientLimit", limitDefault: "100000" },
              ] as const).map((b) => (
                <div key={b.key} className="space-y-3 bg-[#F8F9FA] p-4 rounded-lg border border-[#EEEEEE]">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">{b.label} Sub-Limit (UGX)</label>
                    <input required name={b.limitName} type="number" defaultValue={b.limitDefault} className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" />
                  </div>
                  {/* WP-F1/D8: how this benefit pays providers */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">Funding Model</label>
                    <select name={`${b.key}FundingModel`} defaultValue="FEE_FOR_SERVICE" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors">
                      <option value="FEE_FOR_SERVICE">Fee for service</option>
                      <option value="CAPITATION">Capitation</option>
                      <option value="HYBRID">Hybrid (per service tier)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">
                      Capitated tiers <span className="font-normal text-xs text-brand-text-muted">(Hybrid only — others pay fee-for-service)</span>
                    </label>
                    <select name={`${b.key}CapitatedTiers`} multiple size={4} className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors">
                      {["HEADLINE", "LABORATORY", "IMAGING", "PHARMACY", "THEATRE", "PROFESSIONAL_FEES", "OTHER"].map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button 
              type="submit"
              className="bg-[#0B1437] hover:bg-[#142150] text-white px-8 py-3 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm"
            >
              <Save size={18} />
              <span>Save Package & Activate</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
