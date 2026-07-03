"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

// Tier-grouped fee schedule (WP-E3). Headline first — it's what the TPA looks
// at most. Every tab body is a self-contained scroll container (issue-1 rule).

export interface FeeLine {
  id: string;
  code: string | null;
  name: string;
  rateType: string;
  rate: number | null;
  discountPct: number | null;
  currency: string;
  unitOfMeasure: string;
  requiresPreauth: boolean;
  rateMissing: boolean;
}

export type TierGroups = Record<string, FeeLine[]>;

const TIER_ORDER = [
  "HEADLINE",
  "LABORATORY",
  "IMAGING",
  "PHARMACY",
  "THEATRE",
  "PROFESSIONAL_FEES",
  "OTHER",
] as const;

const TIER_LABELS: Record<string, string> = {
  HEADLINE: "Headline",
  LABORATORY: "Labs",
  IMAGING: "Imaging",
  PHARMACY: "Pharmacy",
  THEATRE: "Theatre",
  PROFESSIONAL_FEES: "Professional fees",
  OTHER: "Other",
};

function rateLabel(l: FeeLine): string {
  if (l.rateMissing) return "rate missing";
  switch (l.rateType) {
    case "DISCOUNT_OFF_BILLED":
      return l.discountPct != null ? `${Number(l.discountPct)}% off billed` : "discount off billed";
    case "PER_DIEM":
      return l.rate != null ? `${l.rate.toLocaleString()} / day` : "per diem";
    default:
      return l.rate != null ? l.rate.toLocaleString() : l.rateType.replace(/_/g, " ").toLowerCase();
  }
}

export function FeeScheduleTabs({ groups, unmappedCount }: { groups: TierGroups; unmappedCount: number }) {
  const tiers = TIER_ORDER.filter((t) => (groups[t] ?? []).length > 0);
  const [active, setActive] = useState<string>(tiers[0] ?? "HEADLINE");
  const [query, setQuery] = useState("");

  const lines = useMemo(() => {
    const list = groups[active] ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.code ?? "").toLowerCase().includes(q),
    );
  }, [groups, active, query]);

  if (tiers.length === 0) {
    return <p className="text-sm text-[#6C757D]">No tariff lines loaded yet — import or add them below.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tiers.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active === t ? "bg-[#000523] text-white" : "bg-[#F8F9FA] text-[#6C757D] hover:bg-[#E6E7E8]"
            }`}
          >
            {TIER_LABELS[t]} ({(groups[t] ?? []).length})
          </button>
        ))}
        {unmappedCount > 0 && (
          <span
            className="rounded-full bg-[#FD7E14]/10 px-3 py-1.5 text-xs font-semibold text-[#9a4b06]"
            title="Tariff lines without a service-category mapping render in Other — map them for tier-accurate reporting."
          >
            {unmappedCount} unmapped
          </span>
        )}
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#6C757D]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${TIER_LABELS[active]?.toLowerCase()}…`}
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#06B9AB]"
        />
      </div>

      {/* Self-contained scrolling (issue 1): the schedule, not the page, grows. */}
      <div className="mt-3 max-h-[50vh] overflow-y-auto overscroll-contain rounded-lg border border-gray-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#E6E7E8] text-xs font-semibold uppercase text-[#6C757D]">
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">Service</th>
              <th className="px-3 py-2.5">Basis</th>
              <th className="px-3 py-2.5 text-right">Agreed rate</th>
              <th className="px-3 py-2.5">Unit</th>
              <th className="px-3 py-2.5">PA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {lines.map((l) => (
              <tr key={l.id} className={l.rateMissing ? "bg-[#DC3545]/5" : "hover:bg-[#F8F9FA]"}>
                <td className="px-3 py-2 font-mono text-xs text-[#6C757D]">{l.code ?? "—"}</td>
                <td className="px-3 py-2 text-[#000523]">{l.name}</td>
                <td className="px-3 py-2 text-xs text-[#6C757D]">{l.rateType.replace(/_/g, " ").toLowerCase()}</td>
                <td className={`px-3 py-2 text-right font-semibold ${l.rateMissing ? "text-[#DC3545]" : "text-[#000523]"}`}>
                  {rateLabel(l)} {!l.rateMissing && l.rate != null && <span className="text-xs font-normal text-[#6C757D]">{l.currency}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[#6C757D]">{l.unitOfMeasure.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-3 py-2 text-xs">{l.requiresPreauth ? <span className="rounded bg-[#17A2B8]/10 px-1.5 py-0.5 font-semibold text-[#17A2B8]">PA</span> : "—"}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-[#6C757D]">
                  No lines match{query ? ` “${query}”` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
