import { requireRole, ROLES } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { updatePackageAction } from "./actions";

const BENEFIT_CATEGORIES = [
  "INPATIENT","OUTPATIENT","MATERNITY","DENTAL","OPTICAL",
  "MENTAL_HEALTH","CHRONIC_DISEASE","SURGICAL","AMBULANCE_EMERGENCY",
  "LAST_EXPENSE","WELLNESS_PREVENTIVE","REHABILITATION","CUSTOM",
] as const;

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const { id } = await params;
  const pkg = await PackagesService.getPackageById(session.user.tenantId, id);
  if (!pkg) notFound();

  const benefits = pkg.currentVersion?.benefits ?? [];

  const inputCls = "w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-avenue-text-heading focus:ring-2 focus:ring-avenue-indigo outline-none bg-white";
  const labelCls = "block text-xs font-bold text-avenue-text-muted uppercase mb-1";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/packages/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Edit Package</h1>
          <p className="text-avenue-text-muted text-sm mt-0.5">{pkg.name}</p>
        </div>
      </div>

      <form action={updatePackageAction} className="space-y-6">
        <input type="hidden" name="packageId" value={id} />

        {/* Package details */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
            Package Details
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Package Name</label>
              <input name="name" type="text" defaultValue={pkg.name} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select name="status" defaultValue={pkg.status} className={inputCls}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <input name="description" type="text" defaultValue={pkg.description ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Annual Limit (KES)</label>
              <input name="annualLimit" type="number" min="0" defaultValue={Number(pkg.annualLimit)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contribution Amount (KES/yr)</label>
              <input name="contributionAmount" type="number" min="0" defaultValue={Number(pkg.contributionAmount)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Min Member Age</label>
              <input name="minAge" type="number" min="0" max="100" defaultValue={pkg.minAge} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max Member Age</label>
              <input name="maxAge" type="number" min="0" max="120" defaultValue={pkg.maxAge} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Dependent Max Age</label>
              <input name="dependentMaxAge" type="number" min="0" max="60" defaultValue={pkg.dependentMaxAge} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Package Type</label>
              <select name="type" defaultValue={pkg.type} className={inputCls}>
                <option value="INDIVIDUAL">Individual</option>
                <option value="FAMILY">Family</option>
                <option value="GROUP">Group</option>
                <option value="CORPORATE">Corporate</option>
              </select>
            </div>
          </div>
        </div>

        {/* Benefit schedule */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
            <h2 className="font-bold text-avenue-text-heading font-heading">Benefit Schedule</h2>
            <p className="text-xs text-avenue-text-muted">Editing current version (v{pkg.currentVersion?.versionNumber ?? 1})</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold">
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Annual Sub-Limit (KES)</th>
                  <th className="px-3 py-2 text-left">Co-Pay %</th>
                  <th className="px-3 py-2 text-left">Waiting Period (days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {BENEFIT_CATEGORIES.map(cat => {
                  const existing = benefits.find(b => b.category === cat);
                  return (
                    <tr key={cat} className="hover:bg-[#F8F9FA]">
                      <td className="px-3 py-2.5">
                        <label className="flex items-center gap-2 font-semibold text-avenue-text-heading">
                          <input
                            type="checkbox"
                            name={`benefit_enabled_${cat}`}
                            defaultChecked={!!existing}
                            className="accent-avenue-indigo"
                          />
                          {cat.replace(/_/g, " ")}
                        </label>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          name={`benefit_limit_${cat}`}
                          type="number"
                          min="0"
                          defaultValue={existing ? Number(existing.annualSubLimit) : 0}
                          className="w-32 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-sm focus:ring-2 focus:ring-avenue-indigo outline-none"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          name={`benefit_copay_${cat}`}
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={existing ? Number(existing.copayPercentage) : 0}
                          className="w-20 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-sm focus:ring-2 focus:ring-avenue-indigo outline-none"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          name={`benefit_wait_${cat}`}
                          type="number"
                          min="0"
                          defaultValue={existing ? Number(existing.waitingPeriodDays) : 0}
                          className="w-24 border border-[#EEEEEE] rounded-[8px] px-2 py-1 text-sm focus:ring-2 focus:ring-avenue-indigo outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/packages/${id}`}
            className="px-5 py-2.5 text-sm font-semibold text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
            Cancel
          </Link>
          <button type="submit"
            className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-2.5 rounded-full font-bold text-sm transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
