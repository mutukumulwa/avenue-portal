import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { enrollIndividualClientAction } from "./actions";

export default async function IndividualClientEnrollPage() {
  const session = await requireRole(ROLES.OPS);
  const packages = await prisma.package.findMany({
    where: { tenantId: session.user.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, annualLimit: true, contributionAmount: true, type: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/groups/new" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Enroll Individual Client</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">Register a single person or family — not attached to an employer group.</p>
        </div>
      </div>

      <form action={enrollIndividualClientAction} className="space-y-6">
        {/* Personal details */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-avenue-text-heading text-sm">Personal Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">First Name</label>
              <input name="firstName" required type="text" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Last Name</label>
              <input name="lastName" required type="text" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">ID / Passport Number</label>
              <input name="idNumber" required type="text" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Date of Birth</label>
              <input name="dateOfBirth" required type="date" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Gender</label>
              <select name="gender" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
                <option value="">Select…</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Phone</label>
              <input name="phone" required type="tel" placeholder="+254…" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Email</label>
              <input name="email" required type="email" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
          </div>
        </div>

        {/* Cover details */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-avenue-text-heading text-sm">Cover Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Package</label>
              <select name="packageId" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
                <option value="">Select package…</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — KES {Number(p.contributionAmount).toLocaleString()}/yr
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Effective Date</label>
              <input name="effectiveDate" required type="date" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Funding Mode</label>
              <select name="fundingMode" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
                <option value="INSURED">Insured (standard premium)</option>
                <option value="SELF_FUNDED">Self-Funded (client deposits fund)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/groups" className="px-6 py-2.5 rounded-full border border-[#EEEEEE] text-sm text-avenue-text-body hover:bg-[#F8F9FA] transition-colors">
            Cancel
          </Link>
          <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-2.5 rounded-full font-semibold text-sm transition-colors shadow-sm">
            Enroll Individual Client
          </button>
        </div>
      </form>
    </div>
  );
}
