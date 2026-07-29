import Link from "next/link";

/**
 * F5.8 — submission-chain lineage (the accessible differences summary). Shows every
 * version of a claim (F5.2 chain), oldest first, with its status and the billed-amount
 * change from the previous version — so a provider sees BOTH the immutable superseded
 * records and the current one. Pure presentational (no state); the page computes the chain.
 */

export interface ChainVersion {
  id: string;
  claimNumber: string;
  status: string;
  submissionType: string;
  billedAmount: number;
  createdAt: string; // ISO
}

function money(n: number, ccy: string) {
  return `${ccy} ${Math.round(n).toLocaleString("en-UG")}`;
}

function humanStatus(s: string) {
  return s.replace(/_/g, " ");
}

const IS_CURRENT = (v: ChainVersion) => v.status !== "SUPERSEDED" && v.status !== "WITHDRAWN";

export function ClaimLineageTable({
  chain,
  currentClaimId,
  currency,
}: {
  chain: ChainVersion[];
  currentClaimId: string;
  currency: string;
}) {
  if (chain.length <= 1) return null; // a single-version claim has no lineage to show

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EEEEEE]">
        <h2 className="font-bold text-brand-text-heading font-heading">Submission history</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Every version of this claim, oldest first, with the change in billed amount and its status.</caption>
          <thead className="text-[11px] uppercase text-brand-text-muted">
            <tr className="border-b border-[#EEEEEE]">
              <th scope="col" className="text-left px-5 py-2 font-bold">Version</th>
              <th scope="col" className="text-left px-5 py-2 font-bold">Claim</th>
              <th scope="col" className="text-left px-5 py-2 font-bold">Type</th>
              <th scope="col" className="text-right px-5 py-2 font-bold">Billed</th>
              <th scope="col" className="text-left px-5 py-2 font-bold">Change</th>
              <th scope="col" className="text-left px-5 py-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {chain.map((v, i) => {
              const prev = i > 0 ? chain[i - 1] : null;
              const delta = prev ? v.billedAmount - prev.billedAmount : 0;
              const isThis = v.id === currentClaimId;
              const current = IS_CURRENT(v);
              return (
                <tr key={v.id} className="border-b border-[#F4F4F4] last:border-0" aria-current={isThis ? "true" : undefined}>
                  <td className="px-5 py-2.5 font-mono text-xs">{i + 1}</td>
                  <td className="px-5 py-2.5">
                    {isThis ? (
                      <span className="font-mono text-xs font-semibold text-brand-text-heading">{v.claimNumber} <span className="text-brand-text-muted">(viewing)</span></span>
                    ) : (
                      <Link href={`/provider/claims/${v.id}`} className="font-mono text-xs font-semibold text-brand-indigo hover:underline">{v.claimNumber}</Link>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs">{humanStatus(v.submissionType).toLowerCase()}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(v.billedAmount, currency)}</td>
                  <td className="px-5 py-2.5 text-xs">
                    {prev ? (
                      delta === 0 ? (
                        <span className="text-brand-text-muted">no change</span>
                      ) : (
                        <span className={delta > 0 ? "text-[#856404]" : "text-[#28A745]"}>
                          {delta > 0 ? "+" : "−"}{money(Math.abs(delta), currency)}
                        </span>
                      )
                    ) : (
                      <span className="text-brand-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${current ? "bg-brand-indigo/10 text-brand-indigo" : "bg-[#E6E7E8] text-[#6C757D]"}`}>
                      {humanStatus(v.status)}{current ? " · current" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
