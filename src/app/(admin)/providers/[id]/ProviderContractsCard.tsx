"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSignature, Plus, AlertTriangle, ArrowUpRight } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#FFC107]/10 text-[#856404]",
  UNDER_REVIEW: "bg-[#17A2B8]/10 text-[#0c6472]",
  APPROVED: "bg-[#6610F2]/10 text-[#4409a8]",
  ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
  SUSPENDED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  TERMINATED: "bg-[#DC3545]/10 text-[#DC3545]",
};

const RULE_LABELS: Record<string, string> = {
  PAY_AS_BILLED: "unlisted: pay as billed",
  DISCOUNT_OFF_BILLED: "unlisted: discount off billed",
  REFER_FOR_REVIEW: "unlisted: manual review",
  REJECT: "unlisted: not payable",
};

export interface ContractListRow {
  id: string;
  contractNumber: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  unlistedServiceRule: string;
  tariffCount: number;
  exclusionCount: number;
}

export function ProviderContractsCard({
  providerId,
  contracts,
}: {
  providerId: string;
  contracts: ContractListRow[];
}) {
  const [now] = useState(() => Date.now());
  const hasActive = contracts.some(c => c.status === "ACTIVE" && new Date(c.endDate).getTime() >= now);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
        <div>
          <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <FileSignature size={15} className="text-brand-indigo" /> Contracts
          </h2>
          <p className="text-xs text-brand-text-muted mt-0.5">
            The active agreement governs rates, exclusions and billing rules during claim adjudication. Rate schedules,
            pricing models (fee-for-service, per-diem, case-rate, capitation…) and rules are defined in the Contracts workspace.
          </p>
        </div>
        <Link
          href={`/contracts/new?providerId=${providerId}`}
          className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors"
        >
          <Plus size={14} /> New Contract
        </Link>
      </div>

      {!hasActive && (
        <div className="flex items-start gap-2.5 px-6 py-3 bg-[#FFF8E1] border-b border-[#FFC107]/40 text-xs text-[#856404]">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          No active contract. Claims from this provider have <strong>no payable ceiling</strong> — every line is left to reviewer judgement. Create and activate an agreement to enforce negotiated rates.
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">Contract</th>
            <th className="px-5 py-2.5 text-left">Period</th>
            <th className="px-5 py-2.5 text-center">Tariff Lines</th>
            <th className="px-5 py-2.5 text-center">Exclusions</th>
            <th className="px-5 py-2.5 text-left">Billing Rule</th>
            <th className="px-5 py-2.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {contracts.map(c => {
            const past = new Date(c.endDate).getTime() < now;
            const display = c.status === "ACTIVE" && past ? "EXPIRED" : c.status;
            const daysLeft = Math.ceil((new Date(c.endDate).getTime() - now) / 86_400_000);
            return (
              <tr key={c.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3">
                  <Link href={`/contracts/${c.id}`} className="font-semibold text-brand-indigo hover:underline inline-flex items-center gap-1">
                    {c.contractNumber} <ArrowUpRight size={12} />
                  </Link>
                  <p className="text-xs text-brand-text-muted mt-0.5">{c.title}</p>
                </td>
                <td className="px-5 py-3 text-brand-text-muted text-xs">
                  {new Date(c.startDate).toLocaleDateString("en-UG")} → {new Date(c.endDate).toLocaleDateString("en-UG")}
                  {display === "ACTIVE" && daysLeft <= 60 && (
                    <span className="block text-[10px] font-bold text-[#856404] mt-0.5">expires in {daysLeft}d</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center font-semibold">{c.tariffCount}</td>
                <td className="px-5 py-3 text-center font-semibold">{c.exclusionCount}</td>
                <td className="px-5 py-3 text-xs text-brand-text-muted">{RULE_LABELS[c.unlistedServiceRule] ?? "—"}</td>
                <td className="px-5 py-3">
                  <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLES[display] ?? STATUS_STYLES.DRAFT}`}>
                    {display.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            );
          })}
          {contracts.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-sm text-brand-text-muted">
                No contracts on file for this provider yet. <Link href={`/contracts/new?providerId=${providerId}`} className="text-brand-indigo hover:underline">Create one</Link>.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
