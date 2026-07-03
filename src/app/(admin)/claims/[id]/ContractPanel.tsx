import { ContractEngine } from "@/server/services/contract-engine/engine";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileSignature } from "lucide-react";

// Contract engine panel (spec §11.6) — read-only view of how the digital
// contract engine would price this claim: matched contract/version, per-line
// mapping → rule → payable/shortfall, reason codes, and the queue it routes to.

const DECISION_STYLE: Record<string, string> = {
  AUTO_APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  APPROVED_WITH_ADJUSTMENT: "bg-[#FFC107]/10 text-[#856404]",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
  PENDED: "bg-[#17A2B8]/10 text-[#0c6472]",
};

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function ContractPanel({ tenantId, claimId }: { tenantId: string; claimId: string }) {
  const result = await ContractEngine.evaluateClaimById(tenantId, claimId);
  if (!result) return null;

  // Provider-facing reason wording for any codes in play.
  const codes = new Set<string>();
  if (result.reasonCode) codes.add(result.reasonCode);
  for (const l of result.lines) if (l.reasonCode) codes.add(l.reasonCode);
  const reasonRows = codes.size
    ? await prisma.adjudicationReasonCode.findMany({ where: { tenantId, code: { in: [...codes] } } })
    : [];
  const reasonMap = new Map(reasonRows.map(r => [r.code, r]));

  const lineDescById = new Map(
    (await prisma.claimLine.findMany({ where: { claimId }, select: { id: true, description: true } })).map(l => [l.id, l.description]),
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
          <FileSignature className="w-4 h-4 text-[#06B9AB]" /> Contract engine (digital contract)
        </h2>
        {result.contractId ? (
          <Link href={`/contracts/${result.contractId}`} className="text-xs text-[#06B9AB] underline">
            {result.contractNumber}
          </Link>
        ) : (
          <span className="text-xs text-[#6C757D]">no contract matched</span>
        )}
      </div>

      {/* Claim-level banner */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <span className={`rounded-full px-2.5 py-0.5 font-medium ${DECISION_STYLE[result.claimDecision === "PARTIALLY_APPROVED" ? "APPROVED_WITH_ADJUSTMENT" : result.claimDecision] ?? "bg-gray-100 text-gray-600"}`}>
          {result.claimDecision.replace(/_/g, " ")}
        </span>
        {result.assignedQueue && <span className="rounded-full bg-[#FD7E14]/10 px-2.5 py-0.5 text-[#9a4b06]">queue: {result.assignedQueue.replace(/_/g, " ")}</span>}
        {result.reasonCode && (
          <span className="text-[#DC3545]">{result.reasonCode}: {reasonMap.get(result.reasonCode)?.internalDescription}</span>
        )}
      </div>

      {/* Totals */}
      <div className="mb-4 grid grid-cols-4 gap-3 text-sm">
        <div><div className="text-xs text-[#6C757D]">Billed</div><div className="font-medium">{money(result.totals.billed)}</div></div>
        <div><div className="text-xs text-[#6C757D]">Payable</div><div className="font-medium text-[#28A745]">{money(result.totals.payable)}</div></div>
        <div><div className="text-xs text-[#6C757D]">Shortfall</div><div className="font-medium text-[#856404]">{money(result.totals.shortfall)}</div></div>
        <div><div className="text-xs text-[#6C757D]">Provider write-off</div><div className="font-medium">{money(result.totals.providerWriteOff)}</div></div>
      </div>

      {/* Per-line */}
      <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left uppercase tracking-wide text-[#6C757D]">
            <tr>
              <th className="px-3 py-2 font-medium">Line → mapping</th>
              <th className="px-3 py-2 font-medium">Rule</th>
              <th className="px-3 py-2 font-medium text-right">Contracted</th>
              <th className="px-3 py-2 font-medium text-right">Payable</th>
              <th className="px-3 py-2 font-medium text-right">Shortfall</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {result.lines.map(l => (
              <tr key={l.lineId} className="align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-brand-navy">{lineDescById.get(l.lineId) ?? l.lineId}</div>
                  <div className="text-[#6C757D]">{l.matchMethod ? `${l.matchMethod}` : "—"}{l.payableSource ? ` · ${l.payableSource}` : ""}</div>
                </td>
                <td className="px-3 py-2 text-[#6C757D]">{l.matchedRuleType?.replace(/_/g, " ") ?? "—"}</td>
                <td className="px-3 py-2 text-right">{money(l.contractedAmount)}</td>
                <td className="px-3 py-2 text-right text-[#28A745]">{money(l.payableAmount)}</td>
                <td className="px-3 py-2 text-right text-[#856404]">{l.shortfallAmount ? money(l.shortfallAmount) : "—"}</td>
                <td className="px-3 py-2">
                  {l.reasonCode ? (
                    <span title={reasonMap.get(l.reasonCode)?.providerDescription ?? ""} className="cursor-help underline decoration-dotted">{l.reasonCode}</span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${DECISION_STYLE[l.decision] ?? ""}`}>{l.decision.replace(/_/g, " ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[#6C757D]">Read-only preview of how the contract prices this claim. It does not change the claim — the adjudicator&apos;s decision stands.</p>
    </section>
  );
}
