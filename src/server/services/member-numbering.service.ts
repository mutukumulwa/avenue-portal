import { prisma } from "@/lib/prisma";
import { maxByNumericSuffix, peekNextDocumentNumber } from "@/lib/document-number";
import { PREFIX_RE } from "@/lib/normalize";

/**
 * Client-configurable member/policy numbering (gap G9.6). Replaces the legacy
 * hard-coded operator prefix. Format: {prefix}-{YYYY}-{NNNNN}, where the
 * prefix comes from the owning client (Client.memberNumberPrefix) and falls
 * back to the Medvex default when no client context is available.
 */
export const DEFAULT_MEMBER_PREFIX = "MVX";

/**
 * WP-3.5C — defensive prefix guard. Wave 1 validates `Client.memberNumberPrefix`
 * on write (D3 / {@link PREFIX_RE}), but a legacy or out-of-band row could still
 * hold a malformed value; building member numbers from it would emit
 * non-conforming — and potentially colliding — identifiers. Fail loudly instead
 * of silently minting bad numbers. Every resolved prefix flows through here, so
 * the invariant "a minted member number always starts with a PREFIX_RE-valid
 * prefix" holds unconditionally (or we throw).
 */
function assertValidPrefix(prefix: string): string {
  if (!PREFIX_RE.test(prefix)) {
    throw new Error(
      `Refusing to mint member numbers from malformed prefix ${JSON.stringify(prefix)}: ` +
        `it does not match the required format ${String(PREFIX_RE)}. ` +
        `Correct Client.memberNumberPrefix before enrolling members.`,
    );
  }
  return prefix;
}

export async function resolveMemberPrefix(
  tenantId: string,
  clientId?: string | null,
): Promise<string> {
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, operatorTenantId: tenantId },
      select: { memberNumberPrefix: true },
    });
    if (client?.memberNumberPrefix) return assertValidPrefix(client.memberNumberPrefix);
  }
  return assertValidPrefix(DEFAULT_MEMBER_PREFIX);
}

/** Next member number for a tenant (optionally scoped to a client's prefix). */
export async function nextMemberNumber(
  tenantId: string,
  clientId?: string | null,
): Promise<string> {
  const prefix = await resolveMemberPrefix(tenantId, clientId);
  // Sequence is per-prefix so each client/payer gets its own clean series
  // (e.g. NWSC-2026-00001), independent of other clients' member counts.
  // B4-WIDE: seed from max+1 (not count()+1) so a purge/gap can't collide.
  // WP-3.5C: pick the max by NUMERIC suffix (maxByNumericSuffix), not the DB's
  // lexical order — past 99999 the zero-pad widens and "…-100000" < "…-99999"
  // lexically, so an `orderBy … desc` findFirst would collapse the max and
  // re-mint a live number.
  return peekNextDocumentNumber(prefix, (yp) =>
    prisma.member
      .findMany({ where: { tenantId, memberNumber: { startsWith: yp } }, select: { memberNumber: true } })
      .then((rows) => maxByNumericSuffix(rows.map((r) => r.memberNumber))),
  );
}
