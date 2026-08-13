import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT-HF P07.02 — the lifecycle transition executes atomically.
 *
 * Acceptance: "injected failure at each write boundary rolls back the entire
 * command."
 *
 * Three faults were in the previous shape, and the middle one is a money bug.
 *
 *   1. `findFirst` then `update`, with no precondition — two operators reading
 *      the same ACTIVE member both passed the check and both wrote.
 *   2. The status write and the coverage-period write were in **separate**
 *      transactions. A failure in between left a SUSPENDED member with an OPEN
 *      coverage period, and the claim rails read the period — so the member
 *      stayed eligible while the roster said suspended.
 *   3. The coverage boundary was `new Date()` rather than the operator's
 *      effective date, so a back-dated suspension closed cover at whenever the
 *      button happened to be clicked.
 *
 * `coverageService` already accepted a transaction client. The caller passed
 * the global one, which is why the guarantee it was built for never held.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  closeOpenPeriods: vi.fn(),
  openPeriod: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    member: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/server/services/coverage.service", () => ({
  coverageService: { closeOpenPeriods: mocks.closeOpenPeriods, openPeriod: mocks.openPeriod },
}));

import { MembersService, StaleMemberTransitionError } from "@/server/services/members.service";

/** The client handed to the transaction callback — distinct from the global one. */
const TX = { marker: "TX" } as unknown as Record<string, unknown>;

beforeEach(() => {
  // `clearAllMocks` clears CALLS but not implementations, so the rejection the
  // roll-back test installs would leak into every test after it.
  vi.resetAllMocks();
  mocks.closeOpenPeriods.mockResolvedValue(undefined);
  mocks.openPeriod.mockResolvedValue(undefined);
  mocks.findFirst.mockResolvedValue({ id: "m1", status: "ACTIVE", version: 7 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      ...TX,
      member: { updateMany: mocks.updateMany },
    }),
  );
});

describe("P07.02 the whole command is one transaction", () => {
  it("runs the status change inside $transaction", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("passes the SAME transaction client to the coverage write", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    // The bug in one assertion: coverageService took a tx client all along and
    // the caller handed it the global prisma, so a failure after the status
    // write left the coverage period open and the member still claimable.
    const passedClient = mocks.closeOpenPeriods.mock.calls[0][0];
    expect(passedClient).toMatchObject({ marker: "TX" });
  });

  it("opens a period through the same client on reinstatement", async () => {
    mocks.findFirst.mockResolvedValue({ id: "m1", status: "SUSPENDED", version: 7 });
    await MembersService.changeStatus("t1", "m1", "ACTIVE");
    expect(mocks.openPeriod.mock.calls[0][0]).toMatchObject({ marker: "TX" });
  });

  it("a failing coverage write aborts the command", async () => {
    mocks.closeOpenPeriods.mockRejectedValue(new Error("coverage write failed"));
    await expect(MembersService.changeStatus("t1", "m1", "SUSPENDED")).rejects.toThrow(
      /coverage write failed/,
    );
    // The status update was issued inside the transaction, so the rejection
    // propagating out of the callback is what rolls it back.
    expect(mocks.updateMany).toHaveBeenCalled();
  });
});

describe("P07.02 the update is conditional, not read-then-write", () => {
  it("preconditions on the status it read", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    expect(mocks.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "m1",
      tenantId: "t1",
      status: "ACTIVE",
    });
  });

  it("adds the version when the caller supplies one", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED", { expectedVersion: 7 });
    expect(mocks.updateMany.mock.calls[0][0].where.version).toBe(7);
  });

  it("omits the version when the caller does not, rather than sending undefined", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    expect("version" in mocks.updateMany.mock.calls[0][0].where).toBe(false);
  });

  it("bumps the version so a concurrent reader is caught next time", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    expect(mocks.updateMany.mock.calls[0][0].data.version).toEqual({ increment: 1 });
  });

  it("raises a typed staleness error when it loses the race", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(MembersService.changeStatus("t1", "m1", "SUSPENDED")).rejects.toBeInstanceOf(
      StaleMemberTransitionError,
    );
  });

  it("does not touch coverage after losing the race", async () => {
    // Silently succeeding here is the lost update: two operators, one write,
    // and a coverage period closed on behalf of a change that did not happen.
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await MembersService.changeStatus("t1", "m1", "SUSPENDED").catch(() => {});
    expect(mocks.closeOpenPeriods).not.toHaveBeenCalled();
  });

  it("the staleness message tells the operator what to do", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const err = await MembersService.changeStatus("t1", "m1", "SUSPENDED").catch((e) => e);
    expect(err.message).toMatch(/no longer active/i);
    expect(err.message).toMatch(/reload/i);
  });
});

describe("P07.02 DEC-12 — the coverage boundary is the operator's date", () => {
  it("closes the period at the supplied effective date", async () => {
    const effectiveAt = new Date("2026-08-31T00:00:00Z");
    await MembersService.changeStatus("t1", "m1", "SUSPENDED", { effectiveAt });
    expect(mocks.closeOpenPeriods.mock.calls[0][2]).toBe(effectiveAt);
  });

  it("falls back to now for a live change", async () => {
    await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    expect(mocks.closeOpenPeriods.mock.calls[0][2]).toBeInstanceOf(Date);
  });

  it("a back-dated suspension does not close cover at click time", async () => {
    // The previous code used new Date() unconditionally, so back-dating was
    // accepted by the form and then ignored by the write — wrong by however
    // many days it was back-dated.
    const backDated = new Date("2026-07-01T00:00:00Z");
    await MembersService.changeStatus("t1", "m1", "SUSPENDED", { effectiveAt: backDated });
    const used = mocks.closeOpenPeriods.mock.calls[0][2] as Date;
    expect(used.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
