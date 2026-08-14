import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * UAT-HF P10.07 — the per-source-IP sign-in throttle.
 *
 * The per-account throttle (DEF-002) stops five guesses against one account and
 * does nothing about one source working through a list. An attacker with 10,000
 * addresses gets four free guesses at each, for ever, and every account's
 * counter looks innocent the whole time. Password spraying is designed around a
 * per-account limit.
 *
 * Two properties have to hold at once, and they pull in opposite directions:
 * the control must actually bite, and it must not lock out a mobile carrier's
 * subscribers or a hospital behind one office NAT. Most of what follows is
 * about the second.
 */

/** Prune argument shape, so tsc checks the assertion about it. */
type PruneArgs = { where: { updatedAt: { lt: Date }; blockedUntil: Date | null } };

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(
    async (_args: unknown) => null as { blockedUntil: Date | null } | null,
  ),
  // Parameters declared so `mock.calls` is not an empty tuple — otherwise every
  // assertion about the SQL below is a type error rather than a check.
  queryRaw: vi.fn(async (..._args: unknown[]) => [] as { blocked: boolean; armed: boolean }[]),
  update: vi.fn(async (_args: unknown) => ({})),
  deleteMany: vi.fn(async (_args: PruneArgs) => ({ count: 0 })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signInIpThrottle: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      deleteMany: mocks.deleteMany,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  checkIpGate,
  registerIpFailure,
  rateLimitKey,
  releaseIp,
  pruneQuietIps,
  IP_FAILURE_LIMIT,
} from "@/server/services/sign-in-rate-limit.service";

const OLD_ENV = process.env;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.queryRaw.mockResolvedValue([]);
  process.env = { ...OLD_ENV, VERCEL: "1", SIGN_IN_IP_ALLOWLIST: "" };
});
afterEach(() => {
  process.env = OLD_ENV;
});

describe("the key", () => {
  it("is null when the header cannot be trusted, which disables the control", () => {
    process.env = { ...OLD_ENV, VERCEL: undefined, VERCEL_ENV: undefined };
    expect(rateLimitKey({ get: () => "1.2.3.4" })).toBeNull();
  });

  it("is the address when it can be", () => {
    expect(rateLimitKey({ get: (n) => (n === "x-forwarded-for" ? "41.210.0.9" : null) })).toBe(
      "41.210.0.9",
    );
  });
});

describe("the gate", () => {
  it("lets a request through when the address is unknown", async () => {
    expect(await checkIpGate("41.210.0.9")).toEqual({ blocked: false, ip: "41.210.0.9" });
  });

  it("blocks while the block is live, and says for how long", async () => {
    mocks.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 600_000) });
    const gate = await checkIpGate("41.210.0.9");
    expect(gate.blocked).toBe(true);
    if (gate.blocked) expect(gate.retryAfterSeconds).toBeGreaterThan(500);
  });

  it("lets a request through once the block has expired", async () => {
    // Self-expiring, like the account lock. A permanent IP ban from an
    // automated counter is an outage waiting to happen.
    mocks.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() - 1_000) });
    expect((await checkIpGate("41.210.0.9")).blocked).toBe(false);
  });

  it("does nothing at all when there is no key", async () => {
    expect(await checkIpGate(null)).toEqual({ blocked: false, ip: null });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("FAILS OPEN when the database is unreachable", async () => {
    // A limiter that fails closed converts a database blip into "nobody can log
    // in", which is a bigger incident than the one it prevents. The per-account
    // throttle is still in force underneath.
    mocks.findUnique.mockRejectedValue(new Error("db down"));
    expect((await checkIpGate("41.210.0.9")).blocked).toBe(false);
  });
});

describe("the allowlist — the shared-egress escape hatch", () => {
  it("never blocks an allowlisted address", async () => {
    // A hospital reaches this from one office IP. Without this, one member of
    // staff repeatedly mistyping can take the whole facility offline.
    process.env = { ...OLD_ENV, VERCEL: "1", SIGN_IN_IP_ALLOWLIST: "41.210.0.9, 10.0.0.1" };
    mocks.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 600_000) });
    expect((await checkIpGate("41.210.0.9")).blocked).toBe(false);
    // Not even looked up — the entry is a decision, not a hint.
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("still blocks an address that is not on it", async () => {
    process.env = { ...OLD_ENV, VERCEL: "1", SIGN_IN_IP_ALLOWLIST: "10.0.0.1" };
    mocks.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 600_000) });
    expect((await checkIpGate("41.210.0.9")).blocked).toBe(true);
  });

  it("tolerates whitespace and an empty setting", async () => {
    process.env = { ...OLD_ENV, VERCEL: "1", SIGN_IN_IP_ALLOWLIST: " , 41.210.0.9 ,, " };
    mocks.findUnique.mockResolvedValue({ blockedUntil: new Date(Date.now() + 600_000) });
    expect((await checkIpGate("41.210.0.9")).blocked).toBe(false);
  });
});

describe("counting a failure", () => {
  it("reports true only on the failure that armed the block", async () => {
    // So one audit line is emitted per block, however many attempts race.
    mocks.queryRaw.mockResolvedValue([{ blocked: true, armed: true }]);
    expect(await registerIpFailure("41.210.0.9")).toBe(true);
  });

  it("reports false for a failure that merely increments", async () => {
    mocks.queryRaw.mockResolvedValue([{ blocked: false, armed: false }]);
    expect(await registerIpFailure("41.210.0.9")).toBe(false);
  });

  it("reports false for a later failure against an ALREADY blocked address", async () => {
    // blocked=true but armed=false: the counter did not wrap on this attempt,
    // so this is not the one that armed it. Reporting true here would emit a
    // log line per refused attempt — volume the attacker controls.
    mocks.queryRaw.mockResolvedValue([{ blocked: true, armed: false }]);
    expect(await registerIpFailure("41.210.0.9")).toBe(false);
  });

  it("does nothing when there is no key", async () => {
    expect(await registerIpFailure(null)).toBe(false);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("FAILS OPEN when the statement errors", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("db down"));
    await expect(registerIpFailure("41.210.0.9")).resolves.toBe(false);
  });

  it("is one atomic statement, not read-then-write", async () => {
    // The account counter shipped as read-then-write and lost increments under
    // parallel attempts — precisely what an attacker parallelises past. This
    // one is a single upsert from the start rather than after the same lesson.
    await registerIpFailure("41.210.0.9");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    // Prisma's tagged-template call arrives as (templateStrings, ...values),
    // so the SQL text is the first argument's array of literal chunks.
    const call = mocks.queryRaw.mock.calls[0];
    if (!call) throw new Error("expected the counter statement to have run");
    const first = call[0] as unknown as string[];
    const raw = Array.isArray(first) ? first.join(" ") : String(first);
    // Strip `--` comments first. The statement CONTAINS the word
    // CURRENT_TIMESTAMP, in a comment warning against using it, and the
    // assertion below is about what executes — not about what is written.
    const sql = raw.replace(/--[^\n]*/g, "");
    expect(sql).toMatch(/ON CONFLICT/);
    // UTC, never CURRENT_TIMESTAMP: these are timestamp-without-time-zone
    // columns holding UTC, and CURRENT_TIMESTAMP returns the server's LOCAL
    // time. That combination put a measured three-hour hole in the account
    // throttle on a +03 host.
    expect(sql).toMatch(/now\(\) AT TIME ZONE 'UTC'/);
    expect(sql).not.toMatch(/CURRENT_TIMESTAMP/);
  });
});

describe("the limit is set for carrier-grade NAT, not for a lab", () => {
  it("is high enough that a shared connection is not casually blocked", () => {
    // In Uganda most users arrive over mobile data behind CGNAT — thousands of
    // unrelated people on one address. A tight limit does not slow an attacker
    // (they have addresses) but does take out a carrier's subscribers.
    expect(IP_FAILURE_LIMIT).toBeGreaterThanOrEqual(50);
  });

  it("is tunable without a deploy", async () => {
    vi.resetModules();
    process.env = { ...OLD_ENV, VERCEL: "1", SIGN_IN_IP_FAILURE_LIMIT: "200" };
    const fresh = await import("@/server/services/sign-in-rate-limit.service");
    expect(fresh.IP_FAILURE_LIMIT).toBe(200);
  });
});

describe("operator recovery", () => {
  it("releasing an address clears the block and the streak", async () => {
    await releaseIp("41.210.0.9");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { ipAddress: "41.210.0.9" },
      data: { failureCount: 0, blockedUntil: null },
    });
  });

  it("pruning never removes an address that is currently blocked", async () => {
    await pruneQuietIps();
    const call = mocks.deleteMany.mock.calls[0];
    if (!call) throw new Error("expected a prune query");
    expect(call[0].where.blockedUntil).toBeNull();
  });
});
