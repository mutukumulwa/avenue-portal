import { prisma } from "@/lib/prisma";

/**
 * Exclusion & Rejected report source (NW-D03).
 *
 * A rejection is either (a) a whole claim declined/voided, or (b) a declined /
 * excluded LINE inside an otherwise approved or partially-approved claim. The
 * old report only listed (a), so line-level exclusions (e.g. a spectacle-frames
 * line rejected inside a PARTIALLY_APPROVED optical claim) were invisible. This
 * helper unifies both so nothing rejected escapes the report — and is shared by
 * the on-screen report and the CSV/PDF export so they never drift.
 */
export interface RejectionRow {
  claimNumber: string;
  member: string;
  provider: string;
  category: string;
  scope: string; // "Whole claim" or the specific line description
  status: string;
  reason: string;
  disallowed: number;
  decidedAt: Date | null;
}

const FULLY_DECLINED = ["DECLINED", "VOID", "APPEAL_DECLINED"] as const;

export async function getExclusionRejectionRows(tenantId: string): Promise<RejectionRow[]> {
  const [declinedClaims, rejectedLines] = await Promise.all([
    // (a) whole-claim rejections
    prisma.claim.findMany({
      where: { tenantId, status: { in: [...FULLY_DECLINED] } },
      select: {
        claimNumber: true, status: true, billedAmount: true,
        declineReasonCode: true, declineNotes: true, decidedAt: true, benefitCategory: true,
        member: { select: { memberNumber: true, firstName: true, lastName: true } },
        provider: { select: { name: true } },
      },
      orderBy: { decidedAt: "desc" },
      take: 300,
    }),
    // (b) line-level exclusions inside claims that were NOT wholly declined
    prisma.claimLine.findMany({
      where: {
        claim: { tenantId, status: { notIn: [...FULLY_DECLINED] } },
        OR: [{ adjudicationDecision: "DECLINED" }, { disallowedAmount: { gt: 0 } }],
      },
      select: {
        description: true, billedAmount: true, disallowedAmount: true,
        declineReason: true, adjudicationDecision: true,
        reasonCode: { select: { code: true } },
        claim: {
          select: {
            claimNumber: true, status: true, benefitCategory: true, decidedAt: true,
            member: { select: { memberNumber: true, firstName: true, lastName: true } },
            provider: { select: { name: true } },
          },
        },
      },
      orderBy: { claim: { decidedAt: "desc" } },
      take: 500,
    }),
  ]);

  const claimRows: RejectionRow[] = declinedClaims.map((r) => ({
    claimNumber: r.claimNumber,
    member: `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    provider: r.provider.name,
    category: r.benefitCategory.replace(/_/g, " "),
    scope: "Whole claim",
    status: r.status.replace(/_/g, " "),
    reason: r.declineReasonCode ?? r.declineNotes ?? "—",
    disallowed: Number(r.billedAmount),
    decidedAt: r.decidedAt,
  }));

  const lineRows: RejectionRow[] = rejectedLines.map((l) => ({
    claimNumber: l.claim.claimNumber,
    member: `${l.claim.member.firstName} ${l.claim.member.lastName} (${l.claim.member.memberNumber})`,
    provider: l.claim.provider.name,
    category: l.claim.benefitCategory.replace(/_/g, " "),
    scope: l.description || "Service line",
    status: l.claim.status.replace(/_/g, " "),
    reason: l.declineReason ?? l.reasonCode?.code ?? "Disallowed",
    disallowed: Number(l.disallowedAmount) > 0 ? Number(l.disallowedAmount) : Number(l.billedAmount),
    decidedAt: l.claim.decidedAt,
  }));

  return [...claimRows, ...lineRows].sort(
    (a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0),
  );
}
