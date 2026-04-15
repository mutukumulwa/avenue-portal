import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { submitServiceRequestAction } from "@/app/(hr)/hr/support/new/actions";

export default async function NewServiceRequestPage() {
  await requireRole(ROLES.HR);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/hr/support" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Submit Service Request</h1>
          <p className="text-avenue-text-body font-body mt-1">Need help? Open a query to Avenue&apos;s customer success team.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
        <form action={submitServiceRequestAction} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-avenue-text-muted uppercase">Subject</label>
            <input 
              required 
              name="subject" 
              type="text" 
              placeholder="e.g. Issue with Member John Doe's card" 
              className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo transition-colors" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-avenue-text-muted uppercase">Category</label>
              <select required name="category" className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo bg-white appearance-none">
                <option value="MEMBER_QUERY">Membership Query</option>
                <option value="CLAIM_QUERY">Claims Query</option>
                <option value="INVOICE_QUERY">Billing & Invoice Query</option>
                <option value="CARD_REQUEST">Smart Card Request</option>
                <option value="BENEFIT_QUERY">Benefit Query</option>
                <option value="GENERAL">General Support</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-avenue-text-muted uppercase">Priority</label>
              <select required name="priority" className="w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo bg-white appearance-none">
                <option value="LOW">Low</option>
                <option value="NORMAL" defaultValue="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent (Blocks critical care)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-avenue-text-muted uppercase">Description</label>
            <textarea 
              required 
              name="body" 
              rows={5} 
              placeholder="Please provide specifics: member numbers, invoice numbers, or dates..."
              className="w-full border border-[#EEEEEE] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-avenue-indigo transition-colors resize-y min-h-[120px]" 
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-[#EEEEEE]">
            <button 
              type="submit" 
              className="flex items-center gap-2 bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-2.5 rounded-full font-bold transition-colors shadow-sm"
            >
              <Send size={16} /> Submit Query
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
