import { requireRole, ROLES } from "@/lib/rbac";
import { PackagesService } from "@/server/services/packages.service";
import { PlusCircle, FileText, Activity } from "lucide-react";
import Link from "next/link";

export default async function PackagesPage() {
  const session = await requireRole(ROLES.UNDERWRITING);

  const tenantId = session.user.tenantId;
  const packages = await PackagesService.getPackages(tenantId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-['Quicksand']">Packages</h1>
          <p className="text-[#848E9F] font-['Lato'] mt-1">Manage benefit packages and configuration limits.</p>
        </div>
        <Link 
          href="/packages/builder"
          className="bg-[#292A83] hover:bg-[#435BA1] text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm"
        >
          <PlusCircle size={18} />
          <span>New Package</span>
        </Link>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Package Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Annual Limit (KES)</th>
                <th className="px-6 py-4">Contribution</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-[#848E9F] text-sm">
              {packages.map((pkg) => (
                <tr key={pkg.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-avenue-text-heading">{pkg.name}</span>
                      <span className="text-xs">{pkg.description || "No description"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{pkg.type}</td>
                  <td className="px-6 py-4 text-avenue-text-heading font-semibold">{Number(pkg.annualLimit).toLocaleString()}</td>
                  <td className="px-6 py-4">{Number(pkg.contributionAmount).toLocaleString()} / yr</td>
                  <td className="px-6 py-4">
                    <span 
                      className={`px-3 py-1 text-xs font-semibold rounded-full items-center inline-flex gap-1 ${
                        pkg.status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : 
                        pkg.status === "DRAFT" ? "bg-[#17A2B8]/10 text-[#17A2B8]" : 
                        "bg-[#DC3545]/10 text-[#DC3545]"
                      }`}
                    >
                      {pkg.status === "ACTIVE" && <Activity size={12} />}
                      {pkg.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/packages/${pkg.id}`} className="text-[#292A83] hover:text-[#435BA1] font-semibold inline-flex items-center gap-1">
                      <FileText size={16} /> View
                    </Link>
                  </td>
                </tr>
              ))}
              
              {packages.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#848E9F]">
                    No packages found. Click &quot;New Package&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
