"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  type: string;
  tier: string;
  county: string | null;
  phone: string | null;
  contractStatus: string;
  claimCount: number;
}

const tierColor = (tier: string) => {
  switch (tier) {
    case "OWN":     return "bg-[#0B1437]/10 text-[#0B1437]";
    case "PARTNER": return "bg-[#28A745]/10 text-[#28A745]";
    case "PANEL":   return "bg-[#17A2B8]/10 text-[#17A2B8]";
    default:        return "bg-[#6C757D]/10 text-[#6C757D]";
  }
};

const contractColor = (s: string) =>
  s === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#DC3545]/10 text-[#DC3545]";

export function ProvidersTable({ providers, initialQuery = "" }: { providers: Provider[]; initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  // Keep the box in sync when the server re-renders with a new query (back/forward).
  useEffect(() => { setQ(initialQuery); }, [initialQuery]);

  // PR-V01: search the WHOLE network server-side. Debounce so each keystroke
  // doesn't hammer the server; skip when the box already matches the URL query
  // (prevents a re-render → re-push loop). The page re-queries with ?q=.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === initialQuery) return;
    const t = setTimeout(() => {
      router.push(trimmed ? `/providers?q=${encodeURIComponent(trimmed)}` : "/providers");
    }, 350);
    return () => clearTimeout(t);
  }, [q, initialQuery, router]);

  // Rows are already filtered server-side; render them as-is.
  const filtered = providers;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EEEEEE]">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, type, tier or county…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#EEEEEE] rounded-lg focus:outline-none focus:border-brand-indigo transition-colors"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Tier</th>
              <th className="px-6 py-4">County</th>
              <th className="px-6 py-4">Contract</th>
              <th className="px-6 py-4">Claims</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body text-sm">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-brand-text-heading">{p.name}</span>
                    {p.phone && <span className="text-xs">{p.phone}</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold uppercase">{p.type}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${tierColor(p.tier)}`}>{p.tier}</span>
                </td>
                <td className="px-6 py-4">{p.county ?? "—"}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${contractColor(p.contractStatus)}`}>{p.contractStatus}</span>
                </td>
                <td className="px-6 py-4 font-semibold">{p.claimCount}</td>
                <td className="px-6 py-4">
                  <Link href={`/providers/${p.id}`} className="text-brand-indigo hover:text-brand-secondary font-semibold inline-flex items-center gap-1">
                    View <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-brand-text-body text-sm">
                  {q ? `No providers matching "${q}".` : "No providers found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
