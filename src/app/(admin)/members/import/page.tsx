import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Download, Info } from "lucide-react";
import { MemberImportClient } from "./MemberImportClient";

export default async function MemberImportPage() {
  const session = await requireRole(ROLES.OPS);

  const groups = await prisma.group.findMany({
    where: { tenantId: session.user.tenantId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/members" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Bulk Member Import</h1>
            <p className="text-avenue-text-body text-sm mt-0.5">Enrol multiple members at once using a CSV file.</p>
          </div>
        </div>
        <a
          href="/member-import-template.csv"
          download
          className="flex items-center gap-2 border border-avenue-indigo text-avenue-indigo px-4 py-2 rounded-full text-sm font-semibold hover:bg-avenue-indigo hover:text-white transition-colors"
        >
          <Download size={15} /> Download Template
        </a>
      </div>

      {/* Instructions */}
      <div className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 text-avenue-indigo">
          <Info size={16} />
          <h2 className="font-bold text-sm">How to fill in the CSV</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5 text-sm text-avenue-text-body">
          <div className="space-y-3">
            <div>
              <p className="font-bold text-avenue-text-heading text-xs uppercase tracking-wide mb-1">Column guide</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white border border-[#EEEEEE]">
                    <th className="px-3 py-1.5 text-left font-bold text-avenue-text-muted">Column</th>
                    <th className="px-3 py-1.5 text-left font-bold text-avenue-text-muted">Required?</th>
                    <th className="px-3 py-1.5 text-left font-bold text-avenue-text-muted">Notes</th>
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
                    ["idNumber",           "No",  "Member's own National ID"],
                    ["phone",              "No",  ""],
                    ["email",              "No",  ""],
                    ["isExample",          "—",   "Delete all rows where this is \"true\""],
                  ].map(([col, req, note]) => (
                    <tr key={col} className="bg-white">
                      <td className="px-3 py-1.5 font-mono text-avenue-indigo">{col}</td>
                      <td className="px-3 py-1.5">{req}</td>
                      <td className="px-3 py-1.5 text-avenue-text-muted">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="font-bold text-avenue-text-heading text-xs uppercase tracking-wide mb-1">What is "relationship"?</p>
              <p className="text-xs text-avenue-text-body mb-2">
                Every member must have a relationship to the main insured person on the policy (the <strong>PRINCIPAL</strong>).
              </p>
              <table className="w-full text-xs border-collapse">
                <tbody className="divide-y divide-[#EEEEEE]">
                  {[
                    ["PRINCIPAL", "The main member — the employee or named policyholder. Each family unit has exactly one."],
                    ["SPOUSE",    "The principal's partner. Leave principalIdNumber = the principal's National ID."],
                    ["CHILD",     "A child of the principal. Same — set principalIdNumber to the principal's ID."],
                    ["PARENT",    "A parent of the principal covered under the policy."],
                  ].map(([val, desc]) => (
                    <tr key={val} className="bg-white border border-[#EEEEEE]">
                      <td className="px-3 py-2 font-mono font-bold text-avenue-indigo whitespace-nowrap">{val}</td>
                      <td className="px-3 py-2 text-avenue-text-body">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#FFF3CD] border border-[#FFC107]/40 rounded-lg p-3 text-xs text-[#856404] space-y-1">
              <p className="font-bold">Linking dependants to their principal</p>
              <p>Put the principal's <strong>National ID</strong> in the <code className="bg-[#FFC107]/20 px-1 rounded">principalIdNumber</code> column of every dependant row. The principal must appear <strong>before</strong> their dependants in the file, or already exist in the system.</p>
              <p className="mt-1">If a principal has no National ID, add them first using the single-member form, then import their dependants separately with the assigned member number — or contact support.</p>
            </div>

            <div className="bg-[#DC3545]/5 border border-[#DC3545]/20 rounded-lg p-3 text-xs text-[#DC3545]">
              <p className="font-bold">Before uploading</p>
              <p>Delete every row where <code className="bg-[#DC3545]/10 px-1 rounded">isExample</code> is <strong>true</strong>. The system will reject the file if any example rows remain.</p>
            </div>
          </div>
        </div>

        {/* Example layout */}
        <div>
          <p className="font-bold text-avenue-text-heading text-xs uppercase tracking-wide mb-2">Example — Kamau family</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse font-mono">
              <thead>
                <tr className="bg-avenue-indigo text-white">
                  {["firstName","lastName","dateOfBirth","gender","relationship","principalIdNumber","idNumber","phone","email","isExample"].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left whitespace-nowrap font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {[
                  ["John","Kamau","1980-04-15","MALE","PRINCIPAL","","30123456","0712345678","john.kamau@example.com","true → DELETE"],
                  ["Grace","Kamau","1983-09-22","FEMALE","SPOUSE","30123456","","0723456789","grace.kamau@example.com","true → DELETE"],
                  ["Brian","Kamau","2010-01-10","MALE","CHILD","30123456","","","","true → DELETE"],
                  ["Amina","Kamau","2013-06-30","FEMALE","CHILD","30123456","","","","true → DELETE"],
                ].map((row, i) => (
                  <tr key={i} className="bg-white">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-2 py-1 ${j === 9 ? "text-[#DC3545] font-bold" : "text-avenue-text-body"}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-avenue-text-muted mt-1.5">
            John is the PRINCIPAL. Grace, Brian, and Amina all reference <strong>30123456</strong> (John&apos;s National ID) in <code>principalIdNumber</code>.
          </p>
        </div>
      </div>

      <MemberImportClient groups={groups} />
    </div>
  );
}
