import { Prisma, PrismaClient } from "@prisma/client";

/**
 * P1.2/P1.3 (TPA_PRIORITY_SIX): run a money-mutating closure in a SERIALIZABLE
 * interactive transaction with bounded retry on serialization conflicts.
 *
 * Two concurrent decisions reading the same benefit availability cannot both
 * commit: Postgres aborts one with a serialization failure (Prisma P2034), and
 * we retry it a small bounded number of times. Exhaustion surfaces
 * BENEFIT_CONCURRENCY_RETRY — an operator-facing "try again" condition, never a
 * claim denial (P1.5). Nothing is persisted from an aborted attempt, so the
 * closure must keep ALL writes inside the transaction (decide() does).
 */
export async function inSerializableTx<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (err) {
      const conflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (conflict && attempt < attempts) {
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 50)));
        continue;
      }
      if (conflict) {
        throw new Error(
          `[BENEFIT_CONCURRENCY_RETRY] Another decision for this member was being processed at the same moment` +
            `${opts.label ? ` (${opts.label})` : ""} — nothing was changed. Retry the decision; if it recurs, decide the two items one after the other.`,
        );
      }
      throw err;
    }
  }
}
