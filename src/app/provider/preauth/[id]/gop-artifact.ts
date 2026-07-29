/**
 * F3.14 — Guarantee of Payment (GOP) artifact data.
 *
 * Pure mapper from an APPROVED pre-authorization to the fields printed on the GOP.
 * Returns null unless the PA is APPROVED and carries a gopNumber — a GOP only
 * exists once the pipeline has issued one, so the download affordance never appears
 * on a submitted/declined/cancelled PA. (LOU — Letter of Undertaking — is the
 * separate admin/cross-border artifact; this is the provider-facing GOP.)
 */
export interface GopData {
  gopNumber: string;
  preauthNumber: string;
  memberName: string;
  memberNumber: string;
  providerName: string;
  benefit: string;
  serviceType: string;
  approvedAmount: number;
  validFrom: string;
  validUntil: string;
  issuedAt: string;
}

interface GopSource {
  status: string;
  gopNumber: string | null;
  preauthNumber: string;
  approvedAmount: unknown;
  validFrom: Date | null;
  validUntil: Date | null;
  gopIssuedAt: Date | null;
  serviceType: string;
  benefitCategory: string;
  member: { firstName: string; lastName: string; memberNumber: string };
  provider: { name: string };
}

function fmtDate(v: Date | null): string {
  return v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function buildGopData(pa: GopSource): GopData | null {
  if (pa.status !== "APPROVED" || !pa.gopNumber) return null;
  return {
    gopNumber: pa.gopNumber,
    preauthNumber: pa.preauthNumber,
    memberName: `${pa.member.firstName} ${pa.member.lastName}`.trim(),
    memberNumber: pa.member.memberNumber,
    providerName: pa.provider.name,
    benefit: String(pa.benefitCategory).replace(/_/g, " "),
    serviceType: String(pa.serviceType).replace(/_/g, " "),
    approvedAmount: Number(pa.approvedAmount ?? 0),
    validFrom: fmtDate(pa.validFrom),
    validUntil: fmtDate(pa.validUntil),
    issuedAt: fmtDate(pa.gopIssuedAt),
  };
}
