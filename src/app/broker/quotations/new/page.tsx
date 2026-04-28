import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createBrokerQuotationAction } from "./actions";

export default function NewBrokerQuotationPage() {
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/broker/quotations" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">New Broker Quote</h1>
          <p className="text-sm text-avenue-text-muted mt-1">Create a broker-scoped draft quotation.</p>
        </div>
      </div>
      <form action={createBrokerQuotationAction} className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Prospect Name</span>
            <input name="prospectName" required className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Prospect Email</span>
            <input name="prospectEmail" type="email" className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Industry</span>
            <input name="prospectIndustry" className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Rate Per Member</span>
            <input name="ratePerMember" type="number" min="1" step="0.01" required className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Principals</span>
            <input name="memberCount" type="number" min="1" required className={input} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Dependents</span>
            <input name="dependentCount" type="number" min="0" defaultValue={0} className={input} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Pricing Notes</span>
          <textarea name="pricingNotes" rows={3} className={input} />
        </label>
        <div className="flex justify-end gap-2">
          <Link href="/broker/quotations" className="px-5 py-2 rounded-full border border-[#EEEEEE] text-sm font-semibold hover:bg-[#F8F9FA]">Cancel</Link>
          <button className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary">Create Quote</button>
        </div>
      </form>
    </div>
  );
}
