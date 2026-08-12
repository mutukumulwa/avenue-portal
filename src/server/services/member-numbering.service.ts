import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
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

/**
 * UAT-HF P05.02 — allocate the next member number atomically.
 *
 * The previous implementation was max-plus-one: read the highest number, add
 * one, then write. Two enrolments running at once read the SAME maximum, mint
 * the same number, and `@@unique([tenantId, memberNumber])` turns the race into
 * a P2002 in the operator's face. The constraint was holding the line; it was
 * not preventing the bug. This is the race the plan names as "adjacent to
 * DEF-034" — the double-click that produced nothing.
 *
 * Allocation is now ONE statement: `INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING`. Postgres serialises concurrent writers on the unique index, so N
 * callers get N distinct consecutive values with no transaction, no advisory
 * lock, and no retry loop.
 *
 * Pass `tx` to allocate inside the enrolment transaction (P05.03), so a rolled
 * back enrolment does not consume a number.
 *
 * ## On gaps
 *
 * A number allocated inside a transaction that later rolls back IS consumed —
 * the counter does not go backwards. That is deliberate and normal for a
 * sequence: reusing a rolled-back number risks handing a live identifier to a
 * second person if the first transaction's outcome was ever in doubt. Member
 * numbers are identifiers, not a count of members.
 */
export async function nextMemberNumber(
  tenantId: string,
  clientId?: string | null,
  tx: Pick<PrismaClient, "$queryRaw"> = prisma,
): Promise<string> {
  const prefix = await resolveMemberPrefix(tenantId, clientId);
  // Series is per-prefix AND per-year, so each client/payer gets its own clean
  // run (NWSC-2026-00001) that restarts in January, independent of every other
  // client's member count.
  const year = new Date().getFullYear();

  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "MemberNumberSequence" ("id", "tenantId", "prefix", "year", "lastValue", "updatedAt")
    VALUES (gen_random_uuid()::text, ${tenantId}, ${prefix}, ${year}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("tenantId", "prefix", "year")
    DO UPDATE SET "lastValue" = "MemberNumberSequence"."lastValue" + 1,
                  "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"
  `;

  const value = rows[0]?.lastValue;
  if (!value || value < 1) {
    // Never fall back to max-plus-one here: a silent downgrade to the racy path
    // is worse than a loud failure, because it only shows up under load.
    throw new Error(
      `Member number allocation returned no value for ${prefix}-${year}. No member was created.`,
    );
  }

  return `${prefix}-${year}-${String(value).padStart(5, "0")}`;
}

/**
 * What `nextMemberNumber` WOULD return, without consuming it.
 *
 * For previews only. Anything that actually creates a member must call
 * `nextMemberNumber`, because a peek carries no reservation and two peeks
 * return the same value.
 */
export async function peekMemberNumber(
  tenantId: string,
  clientId?: string | null,
): Promise<string> {
  const prefix = await resolveMemberPrefix(tenantId, clientId);
  return peekNextDocumentNumber(prefix, (yp) =>
    prisma.member
      .findMany({ where: { tenantId, memberNumber: { startsWith: yp } }, select: { memberNumber: true } })
      .then((rows) => maxByNumericSuffix(rows.map((r) => r.memberNumber))),
  );
}
