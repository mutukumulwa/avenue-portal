import { Save, ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { enrollGroupAction } from "./actions";
import { PackagesService } from "@/server/services/packages.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { SubmitButton } from "@/components/ui/SubmitButton";

export default async function GroupEnrollmentHero({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { error } = await searchParams;
  
  const tenantId = session.user.tenantId;
  const packages = await PackagesService.getPackages(tenantId);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="flex items-center gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-[#856404] shrink-0" />
          <p className="text-sm font-semibold text-[#856404] flex-1">
            {error}
          </p>
        </div>
      )}

      <div className="flex items-center space-x-4">
        <Link href="/groups" className="text-[#848E9F] hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-['Sora']">Enroll Corporate Group</h1>
          <p className="text-[#848E9F] font-['Hanken_Grotesk'] mt-1">Register a new client organization.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 relative">
        <form action={enrollGroupAction} className="space-y-6">
          
          <div className="border-b border-[#EEEEEE] pb-6 space-y-4">
             <h3 className="text-lg font-bold text-avenue-text-heading font-['Sora']">Organization Details</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Company Name</label>
                  <input required name="name" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="e.g. Acme Corp" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Industry</label>
                  <input name="industry" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="e.g. Technology" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Business Registration Number (PIN)</label>
                  <input name="registrationNumber" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="e.g. P000000000A" />
                </div>
             </div>
          </div>

          <div className="border-b border-[#EEEEEE] pb-6 space-y-4">
             <h3 className="text-lg font-bold text-avenue-text-heading font-['Sora']">Primary Contact Person</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Full Name</label>
                  <input required name="contactPersonName" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="Jane Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Phone Number</label>
                  <input required name="contactPersonPhone" type="text" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="+254 700 000000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Email Address</label>
                  <input required name="contactPersonEmail" type="email" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" placeholder="jane.doe@example.com" />
                </div>
             </div>
          </div>

          <div className="space-y-4">
             <h3 className="text-lg font-bold text-avenue-text-heading font-['Sora']">Coverage Details</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#F8F9FA] p-4 rounded-lg border border-[#EEEEEE]">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Select Package</label>
                  <select required name="packageId" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors">
                    {packages.map((pkg) => (
                       <option key={pkg.id} value={pkg.id}>{pkg.name} (Max KES {Number(pkg.annualLimit).toLocaleString()})</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-avenue-text-heading">Effective Start Date</label>
                  <input required name="effectiveDate" type="date" className="w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors" />
                </div>
             </div>
          </div>

          <div className="pt-6 flex justify-end">
            <SubmitButton icon={<Save size={18} />}>
              Register Organization
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
