import { Prisma } from "@prisma/client";

/**
 * B4 — collision-safe sequential document numbers (CASE/CLM/PA/LOU-YYYY-NNNNN).
 *
 * The historic pattern `PREFIX-YEAR-{count()+1}` has two failure modes:
 *
 *   1. Non-contiguous numbering. After ANY row deletion (test teardown, a data
 *      purge) `count()` falls below the max existing number, so `count()+1`
 *      names a row that already exists → UniqueConstraintViolation (P2002) on the
 *      very next insert, with no concurrency involved. Prod hits this after every
 *      purge.
 *   2. Concurrency. N simultaneous creates read the same `count()`, generate the
 *      same number, and all but one fail the unique index (surfaced as TPA-DEF-01
 *      on the B2B route).
 *
 * This helper seeds from `max(existing suffix) + 1` (fixes #1 directly) and wraps
 * the insert in a bounded reservation-retry that advances past any candidate a
 * concurrent writer grabbed first (fixes #2), degrading to a retry-able error
 * after MAX_ATTEMPTS rather than a raw duplicate-key 500.
 */

const MAX_ATTEMPTS = 50;

/** Numeric tail of a `PREFIX-YEAR-NNNNN` number (0 if unparseable). */
function extractSuffix(documentNumber: string): number {
  const parsed = Number.parseInt(documentNumber.slice(documentNumber.lastIndexOf("-") + 1), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Connector-agnostic P2002 detection (Prisma or a raw driver error shape). */
function isUniqueViolation(e: unknown): boolean {
  const code =
    e instanceof Prisma.PrismaClientKnownRequestError ? e.code : (e as { code?: string })?.code;
  return code === "P2002";
}

/** `${prefix}-${year}-{max(existing suffix)+1}` for this tenant+prefix+year. */
async function seedNextNumber(
  prefix: string,
  findLatestNumber: (yearPrefix: string) => Promise<string | null>,
): Promise<{ yearPrefix: string; base: number }> {
  const yearPrefix = `${prefix}-${new Date().getFullYear()}-`;
  const latest = await findLatestNumber(yearPrefix);
  return { yearPrefix, base: latest ? extractSuffix(latest) + 1 : 1 };
}

/**
 * Next sequential number (max+1) WITHOUT the reservation-retry. For callers that
 * create inside a transaction they cannot cheaply retry (a P2002 aborts the
 * whole tx). Fixes the post-purge non-contiguous collision (the dominant, prod
 * failure mode); it does NOT add the concurrency backstop, so reserve it for
 * low-concurrency, operator-driven paths (e.g. cutting an interim slice or
 * closing a case). High-throughput paths must use `createWithDocumentNumber`.
 */
export async function peekNextDocumentNumber(
  prefix: string,
  findLatestNumber: (yearPrefix: string) => Promise<string | null>,
): Promise<string> {
  const { yearPrefix, base } = await seedNextNumber(prefix, findLatestNumber);
  return `${yearPrefix}${String(base).padStart(5, "0")}`;
}

/**
 * Allocate the next sequential document number and create its row.
 *
 * SAFETY: only use this where the document number is the ONLY unique constraint
 * `create` can violate — otherwise a P2002 on a different index would be
 * mis-read as a number collision and retried in a loop. Every current call site
 * satisfies this. The B2B intake route additionally carries an `externalRef`
 * idempotency index, so it keeps its own externalRef-aware loop rather than
 * using this helper.
 *
 * @param prefix            document prefix without the year, e.g. "CLM"
 * @param findLatestNumber  returns the highest existing number string for the
 *                          supplied `${prefix}-${year}-` (the caller provides the
 *                          model-specific, tenant-scoped query), or null when none
 * @param create            inserts the row with the supplied number; may throw P2002
 */
export async function createWithDocumentNumber<T>(
  prefix: string,
  findLatestNumber: (yearPrefix: string) => Promise<string | null>,
  create: (documentNumber: string) => Promise<T>,
): Promise<T> {
  const { yearPrefix, base } = await seedNextNumber(prefix, findLatestNumber);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const documentNumber = `${yearPrefix}${String(base + attempt).padStart(5, "0")}`;
    try {
      return await create(documentNumber);
    } catch (e) {
      if (isUniqueViolation(e)) continue; // a concurrent writer took this number — advance
      throw e;
    }
  }
  throw new Error(
    `Could not allocate a unique ${prefix} number after ${MAX_ATTEMPTS} attempts — please retry.`,
  );
}
