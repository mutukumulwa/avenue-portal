import { prisma } from "@/lib/prisma";
import { clientIpFrom, type ClientIp } from "@/lib/request-ip";
import { ATTEMPT_WINDOW_MS, LOCK_DURATION_MS } from "@/lib/session-policy";

/**
 * UAT-HF P10.07 — per-source-IP sign-in rate limiting.
 *
 * The per-account throttle (DEF-002) stops five guesses against ONE account. It
 * does nothing about one source working through a list: an attacker with 10,000
 * addresses gets four free guesses at each, for ever, and every account's
 * counter looks innocent. Password spraying is built precisely around a
 * per-account limit.
 *
 * ## Database-backed, like DEF-002 and for the same reason
 *
 * `lib/rate-limit.ts` exists and is in-process by design — its own header says
 * "not a distributed quota". For sign-in that would give an attacker
 * `limit × instance count`, and the instance count is Vercel's to decide. The
 * account throttle went to the database for exactly this reason; a second,
 * weaker mechanism sitting beside it would be a hole with a control's name on
 * it.
 *
 * ## The limit is deliberately generous, and this is the important part
 *
 * In Uganda most users reach this over mobile data, behind carrier-grade NAT.
 * Thousands of unrelated people share one address; a hospital reaches it from a
 * single office IP. A tight limit does not slow an attacker meaningfully — they
 * have addresses — but it does lock out an entire carrier's subscribers, and it
 * would do it silently at exactly the moment the system looked busiest.
 *
 * So: only FAILURES count (a working clinic never approaches the limit), the
 * default is high, it is env-tunable without a deploy, an allowlist exists for
 * known shared egress, and every block writes an audit row so a false positive
 * is visible rather than inferred from complaints.
 *
 * The residual trade-off is real and cannot be engineered away at this layer:
 * when an address IS blocked, legitimate users behind it are blocked too. That
 * is inherent to rate limiting by source, and the reason the number is set where
 * it is.
 *
 * ## Fails open
 *
 * If the database is unreachable, sign-in proceeds. A limiter that fails closed
 * turns a database blip into "nobody in the country can log in", which is a
 * larger incident than the one it prevents — and the per-account throttle is
 * still in force underneath.
 */

/** Failures from one address within the window before it is blocked. */
export const IP_FAILURE_LIMIT = Number(process.env.SIGN_IN_IP_FAILURE_LIMIT ?? 50);

/** How long a blocked address stays blocked. Same as an account lock. */
export const IP_BLOCK_MS = LOCK_DURATION_MS;

/** Rolling window over which failures accumulate. Same as an account streak. */
export const IP_WINDOW_MS = ATTEMPT_WINDOW_MS;

/**
 * Addresses this never blocks — known shared egress: a hospital's office NAT, a
 * partner integration, the office itself.
 *
 * An allowlisted address is still counted and still audited, so the entry does
 * not blind anyone to what is coming from it. It only withholds the block.
 */
function allowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.SIGN_IN_IP_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export type IpGate =
  /** Proceed. Either not blocked, allowlisted, or the IP is unusable as a key. */
  | { blocked: false; ip: string | null }
  /** Refuse before doing any work. */
  | { blocked: true; ip: string; retryAfterSeconds: number };

/**
 * Resolve the client IP for use as a rate-limit key.
 *
 * Returns null when the address cannot be trusted, which disables the control
 * rather than keying it on a value the caller chooses — see `request-ip.ts` for
 * why a spoofable key is worse than no key.
 */
export function rateLimitKey(
  headers: { get(name: string): string | null } | null | undefined,
): string | null {
  const resolved: ClientIp = clientIpFrom(headers);
  return resolved.trusted ? resolved.ip : null;
}

/**
 * Is this address currently blocked? One indexed read, on the primary key.
 *
 * Called BEFORE the password comparison — refusing after the bcrypt has run
 * would cost exactly what it was meant to save.
 */
export async function checkIpGate(ip: string | null): Promise<IpGate> {
  if (!ip) return { blocked: false, ip: null };
  if (allowlist().has(ip)) return { blocked: false, ip };

  try {
    const row = await prisma.signInIpThrottle.findUnique({
      where: { ipAddress: ip },
      select: { blockedUntil: true },
    });
    const until = row?.blockedUntil;
    if (until && until > new Date()) {
      return {
        blocked: true,
        ip,
        retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)),
      };
    }
    return { blocked: false, ip };
  } catch {
    // Fails open, deliberately. See the header.
    return { blocked: false, ip };
  }
}

/**
 * Record one failed sign-in from this address, and arm the block on the
 * threshold. Returns true when THIS failure armed it.
 *
 * One statement, evaluated in the database. The account counter was originally
 * read-then-write and lost increments under parallel attempts — the exact shape
 * an attacker parallelises past — so this one is atomic from the start rather
 * than after the same lesson.
 */
export async function registerIpFailure(ip: string | null): Promise<boolean> {
  if (!ip) return false;

  const windowStart = new Date(Date.now() - IP_WINDOW_MS);
  const blockUntil = new Date(Date.now() + IP_BLOCK_MS);

  try {
    const rows = await prisma.$queryRaw<{ blocked: boolean; armed: boolean }[]>`
      INSERT INTO "SignInIpThrottle" (
        "ipAddress", "failureCount", "lastFailureAt", "blockedUntil",
        "totalFailures", "totalBlocks", "updatedAt"
      )
      VALUES (
        ${ip}, 1, (now() AT TIME ZONE 'UTC'), NULL,
        1, 0, (now() AT TIME ZONE 'UTC')
      )
      ON CONFLICT ("ipAddress") DO UPDATE SET
        -- Rolling window: a stale last-failure restarts the count at 1 rather
        -- than extending a streak from hours ago. Wraps to 0 on the failure
        -- that arms the block, so the next window starts clean.
        "failureCount" = CASE
          WHEN "SignInIpThrottle"."lastFailureAt" IS NOT NULL
               AND "SignInIpThrottle"."lastFailureAt" > ${windowStart}
            THEN CASE
              WHEN "SignInIpThrottle"."failureCount" + 1 >= ${IP_FAILURE_LIMIT} THEN 0
              ELSE "SignInIpThrottle"."failureCount" + 1
            END
          ELSE CASE WHEN 1 >= ${IP_FAILURE_LIMIT} THEN 0 ELSE 1 END
        END,
        -- UTC, never CURRENT_TIMESTAMP. These are timestamp-without-time-zone
        -- columns holding UTC (what Prisma writes); CURRENT_TIMESTAMP returns
        -- the server's LOCAL time. On a +03 host that made a fresh lock read as
        -- already expired — a three-hour hole, measured, in the account
        -- throttle. Same columns, same trap.
        "lastFailureAt" = (now() AT TIME ZONE 'UTC'),
        "blockedUntil" = CASE
          WHEN (CASE
                  WHEN "SignInIpThrottle"."lastFailureAt" IS NOT NULL
                       AND "SignInIpThrottle"."lastFailureAt" > ${windowStart}
                    THEN "SignInIpThrottle"."failureCount" + 1
                  ELSE 1
                END) >= ${IP_FAILURE_LIMIT}
            THEN ${blockUntil}
          ELSE "SignInIpThrottle"."blockedUntil"
        END,
        "totalFailures" = "SignInIpThrottle"."totalFailures" + 1,
        "totalBlocks" = "SignInIpThrottle"."totalBlocks" + CASE
          WHEN (CASE
                  WHEN "SignInIpThrottle"."lastFailureAt" IS NOT NULL
                       AND "SignInIpThrottle"."lastFailureAt" > ${windowStart}
                    THEN "SignInIpThrottle"."failureCount" + 1
                  ELSE 1
                END) >= ${IP_FAILURE_LIMIT}
            THEN 1 ELSE 0
          END,
        "updatedAt" = (now() AT TIME ZONE 'UTC')
      RETURNING
        ("blockedUntil" IS NOT NULL AND "blockedUntil" > (now() AT TIME ZONE 'UTC')) AS blocked,
        ("failureCount" = 0) AS armed
    `;
    // Exactly the row that wrapped the counter reports armed, so however many
    // attempts race, one of them announces the block.
    return rows[0]?.blocked === true && rows[0]?.armed === true;
  } catch {
    // Fails open. The account throttle still applies.
    return false;
  }
}

/**
 * Clear an address's counters. For an operator releasing a false positive —
 * a clinic behind a NAT that tripped the limit during a bad afternoon.
 */
export async function releaseIp(ip: string): Promise<void> {
  await prisma.signInIpThrottle.update({
    where: { ipAddress: ip },
    data: { failureCount: 0, blockedUntil: null },
  });
}

/**
 * Drop addresses that have gone quiet.
 *
 * The table is bounded by distinct addresses seen, not attempts made, so it
 * grows slowly — but a year of CGNAT churn is still a lot of rows for a table
 * whose entire purpose is the last fifteen minutes.
 */
export async function pruneQuietIps(olderThanMs = 30 * 24 * 60 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { count } = await prisma.signInIpThrottle.deleteMany({
    where: { updatedAt: { lt: cutoff }, blockedUntil: null },
  });
  return count;
}
