import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft, Download, Info } from "lucide-react";
import { HRMemberImportClient } from "./HRMemberImportClient";

export default async function HRMemberImportPage() {
  await requireRole(ROLES.HR);
  // Group ID is inferred from session internally within HRMemberImportClient actions

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/hr/roster" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Bulk Add Endorsements</h1>
            <p className="text-brand-text-body text-sm mt-0.5">Submit multiple addition requests using a CSV file.</p>
          </div>
        </div>
        <a
          href="/member-import-template.csv"
          download
          className="flex items-center gap-2 border border-brand-indigo text-brand-indigo px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-indigo hover:text-white transition-colors"
        >
          <Download size={15} /> Download Template
        </a>
      </div>

      {/* Instructions */}
      <div className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 text-brand-indigo">
          <Info size={16} />
          <h2 className="font-bold text-sm">How to fill in the CSV</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5 text-sm text-brand-text-body">
          <div className="space-y-3">
            <div>
              <p className="font-bold text-brand-text-heading text-xs uppercase tracking-wide mb-1">Column guide</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white border border-[#EEEEEE]">
                    <th className="px-3 py-1.5 text-left font-bold text-brand-text-muted">Column</th>
                    <th className="px-3 py-1.5 text-left font-bold text-brand-text-muted">Required?</th>
                    <th className="px-3 py-1.5 text-left font-bold text-brand-text-muted">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {[
                    ["firstName",          "Yes", ""],
                    ["lastName",           "Yes", ""],
                    ["dateOfBirth",        "Yes", "Format: YYYY-MM-DD"],
                    ["gender",             "Yes", "MALE, FEMALE, or OTHER"],
                    ["relationship",       "Yes", "See below"],
                    ["principalIdNumber",  "Dependants only", "National ID of the principal"],
                    ["idNumber",           "No",  "Member&apos;s own National ID"],
                    ["phone",              "No",  ""],
                    ["email",              "No",  ""],
                    ["isExample",          "—",   "Delete all rows where this is &quot;true&quot;"],
                  ].map(([col, req, note]) => (
                    <tr key={col} className="bg-white">
                      <td className="px-3 py-1.5 font-mono text-brand-indigo">{col}</td>
                      <td className="px-3 py-1.5">{req}</td>
                      <td className="px-3 py-1.5 text-brand-text-muted">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="font-bold text-brand-text-heading text-xs uppercase tracking-wide mb-1">What is &quot;relationship&quot;?</p>
              <p className="text-xs text-brand-text-body mb-2">
                Every member must have a relationship to the main insured person on the policy (the <strong>PRINCIPAL</strong>).
              </p>
              <table className="w-full text-xs border-collapse">
                <tbody className="divide-y divide-[#EEEEEE]">
                  {[
                    ["PRINCIPAL", "The main member — the employee or named policyholder."],
                    ["SPOUSE",    "The principal&apos;s partner. Leave principalIdNumber = the principal&apos;s National ID."],
                    ["CHILD",     "A child of the principal. Same — set principalIdNumber to the principal&apos;s ID."],
                    ["PARENT",    "A parent of the principal covered under the policy."],
                  ].map(([val, desc]) => (
                    <tr key={val} className="bg-white border border-[#EEEEEE]">
                      <td className="px-3 py-2 font-mono font-bold text-brand-indigo whitespace-nowrap">{val}</td>
                      <td className="px-3 py-2 text-brand-text-body">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#FFF3CD] border border-[#FFC107]/40 rounded-lg p-3 text-xs text-[#856404] space-y-1">
              <p className="font-bold">Linking dependants to their principal</p>
              <p>Put the principal&apos;s <strong>National ID</strong> in the <code className="bg-[#FFC107]/20 px-1 rounded">principalIdNumber</code> column of every dependant row. The principal must appear <strong>before</strong> their dependants in the file, or already exist in the system.</p>
              <p className="mt-1">If a principal has no National ID, please request their addition individually.</p>
            </div>

            <div className="bg-[#DC3545]/5 border border-[#DC3545]/20 rounded-lg p-3 text-xs text-[#DC3545]">
              <p className="font-bold">Before uploading</p>
              <p>Delete every row where <code className="bg-[#DC3545]/10 px-1 rounded">isExample</code> is <strong>true</strong>. The system will reject the file if any example rows remain.</p>
            </div>
          </div>
        </div>
      </div>

      <HRMemberImportClient />
    </div>
  );
}
