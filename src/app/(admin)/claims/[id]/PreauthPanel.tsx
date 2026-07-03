import { prisma } from "@/lib/prisma";
import { attachPreauthAction, detachPreauthAction } from "./actions";
import { Stethoscope, Link2, Unlink } from "lucide-react";
import Link from "next/link";

const PA_BADGE: Record<string, string> = {
  ATTACHED: "bg-[#17A2B8]/10 text-[#17A2B8]",
  UTILISED: "bg-[#28A745]/10 text-[#28A745]",
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  CONVERTED_TO_CLAIM: "bg-[#6C757D]/10 text-[#6C757D]",
};

/**
 * Pre-authorizations panel (WP-C3): a claim carries its attached PAs alongside
 * BAU lines. Attach from the member's approved unattached PAs at this
 * facility; detach while the claim is still undecided.
 */
export async function PreauthPanel({
  claim,
}: {
  claim: {
    id: string;
    tenantId: string;
    memberId: string;
    providerId: string;
    status: string;
    preauths: {
      id: string;
      preauthNumber: string;
      status: string;
      approvedAmount: unknown;
      estimatedCost: unknown;
      validUntil: Date | null;
    }[];
  };
}) {
  const editable = !["PAID", "DECLINED", "VOID", "APPROVED", "PARTIALLY_APPROVED"].includes(claim.status);

  const candidates = editable
    ? await prisma.preAuthorization.findMany({
        where: {
          tenantId: claim.tenantId,
          memberId: claim.memberId,
          providerId: claim.providerId,
          status: "APPROVED",
          claimId: null,
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
        select: { id: true, preauthNumber: true, approvedAmount: true, benefitCategory: true },
        orderBy: { approvedAt: "desc" },
        take: 20,
      })
    : [];

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-text-muted">
          <Stethoscope size={14} /> Pre-Authorizations ({claim.preauths.length})
        </h2>
      </div>

      {claim.preauths.length === 0 ? (
        <p className="mt-3 text-sm text-brand-text-muted">
          No pre-auth attached. PA-required services on this claim will route to review until one is attached.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[#EEEEEE]">
          {claim.preauths.map((pa) => (
            <li key={pa.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <Link href={`/preauth/${pa.id}`} className="font-mono font-semibold text-brand-indigo hover:underline">
                  {pa.preauthNumber}
                </Link>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PA_BADGE[pa.status] ?? "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                  {pa.status.replace(/_/g, " ")}
                </span>
                {pa.validUntil && (
                  <span className="ml-2 text-xs text-brand-text-muted">
                    valid until {new Date(pa.validUntil).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-brand-text-heading">
                  {Number(pa.approvedAmount ?? pa.estimatedCost ?? 0).toLocaleString()} cover
                </span>
                {editable && pa.status !== "UTILISED" && (
                  <form action={detachPreauthAction}>
                    <input type="hidden" name="claimId" value={claim.id} />
                    <input type="hidden" name="preauthId" value={pa.id} />
                    <button type="submit" className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC3545] hover:underline">
                      <Unlink size={12} /> Detach
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && candidates.length > 0 && (
        <form action={attachPreauthAction} className="mt-4 flex items-end gap-2 border-t border-[#EEEEEE] pt-4">
          <input type="hidden" name="claimId" value={claim.id} />
          <label className="flex grow flex-col gap-1 text-xs font-semibold text-brand-text-muted">
            Attach an approved pre-auth (same member &amp; facility)
            <select name="preauthId" required className="rounded-md border border-[#D6DCE5] px-2 py-2 text-sm text-brand-text-body">
              <option value="">Select pre-auth…</option>
              {candidates.map((pa) => (
                <option key={pa.id} value={pa.id}>
                  {pa.preauthNumber} · {pa.benefitCategory.replace(/_/g, " ")} · {Number(pa.approvedAmount ?? 0).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-brand-indigo px-4 py-2 text-xs font-semibold text-white hover:bg-brand-secondary">
            <Link2 size={12} /> Attach
          </button>
        </form>
      )}
    </div>
  );
}
