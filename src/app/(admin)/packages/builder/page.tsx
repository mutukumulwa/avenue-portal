"use client";

import { Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createPackageAction } from "./actions";

export default function PackageBuilder() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/packages" className="text-[#848E9F] hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-['Quicksand']">Build a Package</h1>
          <p className="text-[#848E9F] font-['Lato'] mt-1">Configure limits, benefits, and dependencies.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 relative">
        <form action={createPackageAction} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Package Name</label>
              <input required name="name" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" placeholder="e.g. Avenue Gold Corporate" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Package Type</label>
              <select name="type" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors">
                <option value="GROUP">Group</option>
                <option value="CORPORATE">Corporate</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="FAMILY">Family</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Description</label>
              <textarea name="description" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" placeholder="Package overview..."></textarea>
            </div>
          </div>

          <div className="border-t border-[#EEEEEE] pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Overall Annual Limit (KES)</label>
              <input required name="annualLimit" type="number" defaultValue="500000" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Annual Premium Contribution (KES)</label>
              <input required name="contributionAmount" type="number" defaultValue="25000" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Minimum Age</label>
              <input required name="minAge" type="number" defaultValue="0" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-avenue-text-heading">Maximum Age (Principals)</label>
              <input required name="maxAge" type="number" defaultValue="65" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" />
            </div>
          </div>

          <div className="border-t border-[#EEEEEE] pt-6 space-y-4">
            <h3 className="text-lg font-bold text-avenue-text-heading font-['Quicksand']">Core Benefits</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 bg-[#F8F9FA] p-4 rounded-lg border border-[#EEEEEE]">
                <label className="text-sm font-semibold text-avenue-text-heading">Inpatient Sub-Limit (KES)</label>
                <input required name="inpatientLimit" type="number" defaultValue="500000" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" />
              </div>
              
              <div className="space-y-2 bg-[#F8F9FA] p-4 rounded-lg border border-[#EEEEEE]">
                <label className="text-sm font-semibold text-avenue-text-heading">Outpatient Sub-Limit (KES)</label>
                <input required name="outpatientLimit" type="number" defaultValue="100000" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#292A83] transition-colors" />
              </div>
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button 
              type="submit"
              className="bg-[#292A83] hover:bg-[#435BA1] text-white px-8 py-3 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm"
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
