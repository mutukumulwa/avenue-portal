"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

interface Broker {
  id: string;
  name: string;
  licenseNumber: string | null;
  contactPerson: string | null;
  phone: string | null;
  firstYearCommissionPct: number;
  renewalCommissionPct: number;
  status: string;
  groupCount: number;
}

const statusColor = (s: string) =>
  s === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#DC3545]/10 text-[#DC3545]";

export function BrokersTable({ brokers }: { brokers: Broker[] }) {
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? brokers.filter(b =>
        b.name.toLowerCase().includes(q.toLowerCase()) ||
        (b.contactPerson ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (b.phone ?? "").includes(q) ||
        (b.licenseNumber ?? "").toLowerCase().includes(q.toLowerCase())
      )
    : brokers;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EEEEEE]">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-avenue-text-muted" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, contact or IRA number…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#EEEEEE] rounded-lg focus:outline-none focus:border-avenue-indigo transition-colors"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Broker Name</th>
              <th className="px-6 py-4">Contact Person</th>
              <th className="px-6 py-4">Phone</th>
              <th className="px-6 py-4">Groups</th>
              <th className="px-6 py-4">1st Year Comm.</th>
              <th className="px-6 py-4">Renewal Comm.</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body text-sm">
            {filtered.map(b => (
              <tr key={b.id} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-avenue-text-heading">{b.name}</span>
                    {b.licenseNumber && <span className="text-xs">IRA: {b.licenseNumber}</span>}
                  </div>
                </td>
                <td className="px-6 py-4">{b.contactPerson ?? "—"}</td>
                <td className="px-6 py-4">{b.phone ?? "—"}</td>
                <td className="px-6 py-4 font-semibold text-avenue-indigo">{b.groupCount}</td>
                <td className="px-6 py-4">{b.firstYearCommissionPct}%</td>
                <td className="px-6 py-4">{b.renewalCommissionPct}%</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(b.status)}`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link href={`/brokers/${b.id}`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1">
                    View <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-avenue-text-body text-sm">
                  {q ? `No brokers matching "${q}".` : "No brokers found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
