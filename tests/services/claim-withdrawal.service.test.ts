/**
 * F5.5 — simple provider claim-withdrawal service (opt-in DB).
 *
 * Proves the spec §13 F5.5 + Gate D invariants against a real Postgres:
 *  - an entitled provider withdraws an UNDECIDED claim it owns → terminal WITHDRAWN;
 *  - allowed only from pre-decision states (INCURRED/RECEIVED/CAPTURED/UNDER_REVIEW);
 *  - decided / settled / superseded / financial claims are refused;
 *  - authorization is server-derived (permission, provider ownership, branch);
 *  - a decision and a withdrawal can NEVER both take effect (status-guarded CAS),
 *    in either commit order, and under true concurrency;
 *  - replay is idempotent (one log / one outbox / one audit row);
 *  - ZERO money/hold mutation.
 *
 * Opt-in: runs only when DATABASE_URL === AUTOPILOT_TEST_DB (throwaway PG).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.5 ClaimWithdrawalService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-withdrawal/service").ClaimWithdrawalService;
  let ClaimWithdrawalError: typeof import("@/server/services/claim-withdrawal/service").ClaimWithdrawalError;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let ClaimDecisionService: typeof import("@/server/services/claim-decision.service").ClaimDecisionService;
  let inSerializableTx: typeof import("@/lib/serializable-tx").inSerializableTx;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;

  /** Build a server-derived provider context. Defaults: provider A, biller user, both A branches, withdraw perm. */
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER",
      actorId: world.users.a.biller.id,
      tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.claim.withdraw"],
      apiScopes: [],
      requestId: "test-req",
      ...over,
    };
  }

  const cmd = (claimId: string, over: Partial<import("@/server/services/claim-withdrawal/service").WithdrawClaimCommand> = {}) => ({
    tenantId: world.tenants.alpha.id,
    claimId,
    reasonCode: "SUBMITTED_IN_ERROR",
    ...over,
  });

  async function logCount(claimId: string) {
    return prisma.adjudicationLog.count({ where: { claimId, action: "WITHDRAWN" } });
  }
  async function auditCount(claimId: string) {
    return prisma.auditLog.count({ where: { tenantId: world.tenants.alpha.id, entityId: claimId, action: "CLAIM:WITHDRAW" } });
  }
  async function outboxCount(claimId: string) {
    return prisma.notificationOutbox.count({ where: { tenantId: world.tenants.alpha.id, dedupeKey: `claim-withdrawn:${claimId}` } });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/claim-withdrawal/service");
    Svc = mod.ClaimWithdrawalService;
    ClaimWithdrawalError = mod.ClaimWithdrawalError;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    ClaimDecisionService = (await import("@/server/services/claim-decision.service")).ClaimDecisionService;
    inSerializableTx = (await import("@/lib/serializable-tx")).inSerializableTx;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  // ── allowed pre-decision states ────────────────────────────────────────────
  describe("withdraws an undecided claim → terminal WITHDRAWN", () => {
    for (const status of ["RECEIVED", "CAPTURED", "UNDER_REVIEW", "INCURRED"] as const) {
      it(`allows a ${status} claim`, async () => {
        const claim = await world.createClaim({ providerId: world.providers.a.id, status });
        const res = await Svc.withdraw(ctx(), cmd(claim.id, { reasonCode: "duplicate_submission" }));

        expect(res.status).toBe("WITHDRAWN");
        expect(res.alreadyWithdrawn).toBe(false);
        expect(res.reasonCode).toBe("DUPLICATE_SUBMISSION"); // normalized from lower-case

        const row = await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } });
        expect(row!.status).toBe("WITHDRAWN");

        // exactly one lifecycle log (from the real predecision status) + one audit + one outbox
        expect(await logCount(claim.id)).toBe(1);
        const log = await prisma.adjudicationLog.findFirst({ where: { claimId: claim.id, action: "WITHDRAWN" } });
        expect(log!.fromStatus).toBe(status);
        expect(log!.toStatus).toBe("WITHDRAWN");
        expect(Number(log!.amount)).toBe(0);
        expect(await auditCount(claim.id)).toBe(1);
        expect(await outboxCount(claim.id)).toBe(1);
      });
    }
  });

  // ── refusals: decided / terminal / financial ───────────────────────────────
  describe("refuses claims that are not simply withdrawable", () => {
    for (const status of ["APPROVED", "PARTIALLY_APPROVED", "PAID", "DECLINED", "VOID", "SUPERSEDED"] as const) {
      it(`refuses a ${status} claim (NOT_WITHDRAWABLE) and writes nothing`, async () => {
        const claim = await world.createClaim({ providerId: world.providers.a.id, status });
        const err = await Svc.withdraw(ctx(), cmd(claim.id)).catch((e) => e);
        expect(err).toBeInstanceOf(ClaimWithdrawalError);
        expect(err.code).toBe("NOT_WITHDRAWABLE");

        const row = await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } });
        expect(row!.status).toBe(status); // unchanged
        expect(await logCount(claim.id)).toBe(0);
        expect(await auditCount(claim.id)).toBe(0);
        expect(await outboxCount(claim.id)).toBe(0);
      });
    }

    it("refuses a pre-decision claim that already carries a money fact (HAS_FINANCIAL_EFFECT)", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      // A money record on an otherwise-receivable claim (defensive guard).
      await prisma.claim.update({ where: { id: claim.id }, data: { decidedAt: new Date() } });
      const err = await Svc.withdraw(ctx(), cmd(claim.id)).catch((e) => e);
      expect(err).toBeInstanceOf(ClaimWithdrawalError);
      expect(err.code).toBe("HAS_FINANCIAL_EFFECT");
      const row = await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } });
      expect(row!.status).toBe("RECEIVED");
    });
  });

  // ── authorization (server-derived) + reason validation ─────────────────────
  describe("authorization & validation", () => {
    it("rejects an actor missing provider.claim.withdraw (FORBIDDEN_PERMISSION)", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      const err = await Svc.withdraw(ctx({ permissions: ["provider.claim.read"] }), cmd(claim.id)).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderAccessError);
      expect(err.code).toBe("FORBIDDEN_PERMISSION");
      expect(await logCount(claim.id)).toBe(0);
    });

    it("hides another provider's claim as NOT_FOUND (non-enumerating)", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      // provider B context (its own user + provider id) must not see provider A's claim.
      const bCtx = ctx({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
      const err = await Svc.withdraw(bCtx, cmd(claim.id)).catch((e) => e);
      expect(err).toBeInstanceOf(ClaimWithdrawalError);
      expect(err.code).toBe("NOT_FOUND");
      const row = await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } });
      expect(row!.status).toBe("RECEIVED"); // untouched
    });

    it("enforces branch scope on a branch-stamped claim (FORBIDDEN_BRANCH), and allows when held", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, branchId: world.branches.a1.id, status: "RECEIVED" });
      // actor holds only branch A2 → denied
      const denied = await Svc.withdraw(ctx({ allowedProviderBranchIds: [world.branches.a2.id] }), cmd(claim.id)).catch((e) => e);
      expect(denied).toBeInstanceOf(ProviderAccessError);
      expect(denied.code).toBe("FORBIDDEN_BRANCH");
      expect((await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } }))!.status).toBe("RECEIVED");

      // actor holds branch A1 → allowed
      const ok = await Svc.withdraw(ctx({ allowedProviderBranchIds: [world.branches.a1.id] }), cmd(claim.id));
      expect(ok.status).toBe("WITHDRAWN");
    });

    it("rejects an unknown withdrawal reason (INVALID_REASON) before any read/write", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      const err = await Svc.withdraw(ctx(), cmd(claim.id, { reasonCode: "because" })).catch((e) => e);
      expect(err).toBeInstanceOf(ClaimWithdrawalError);
      expect(err.code).toBe("INVALID_REASON");
      expect((await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } }))!.status).toBe("RECEIVED");
    });
  });

  // ── idempotent replay ──────────────────────────────────────────────────────
  it("same-key replay is idempotent — one effect only", async () => {
    const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
    const first = await Svc.withdraw(ctx(), cmd(claim.id));
    const second = await Svc.withdraw(ctx(), cmd(claim.id));
    expect(first.alreadyWithdrawn).toBe(false);
    expect(second.alreadyWithdrawn).toBe(true);
    expect(second.status).toBe("WITHDRAWN");
    // no duplicate log / audit / outbox
    expect(await logCount(claim.id)).toBe(1);
    expect(await auditCount(claim.id)).toBe(1);
    expect(await outboxCount(claim.id)).toBe(1);
  });

  // ── concurrency: a decision and a withdrawal can never both take effect ─────
  describe("concurrent decision vs withdrawal", () => {
    it("decision committed first → withdrawal refuses (no double effect)", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      // A decision lands (simulated at the persistence layer: RECEIVED → APPROVED).
      await prisma.claim.update({ where: { id: claim.id }, data: { status: "APPROVED", approvedAmount: 1000, decidedAt: new Date() } });
      const err = await Svc.withdraw(ctx(), cmd(claim.id)).catch((e) => e);
      expect(err).toBeInstanceOf(ClaimWithdrawalError);
      expect(err.code).toBe("NOT_WITHDRAWABLE");
      expect((await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } }))!.status).toBe("APPROVED");
    });

    it("withdrawal committed first → the real decision engine refuses it (stays WITHDRAWN, zero money)", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      await Svc.withdraw(ctx(), cmd(claim.id));
      // The canonical decision owner must refuse a withdrawn claim (its status guard).
      const err = await ClaimDecisionService.decide(world.tenants.alpha.id, claim.id, {
        action: "APPROVED", approvedAmount: 1000, reviewerId: world.users.a.finance.id, systemDecision: true,
      }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      const row = await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true, approvedAmount: true, paidAmount: true } });
      expect(row!.status).toBe("WITHDRAWN");
      expect(Number(row!.approvedAmount)).toBe(0); // no money written by the refused decision
      expect(Number(row!.paidAmount)).toBe(0);
    });

    it("two concurrent withdrawals → exactly one transition (CAS is atomic)", async () => {
      const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
      const [a, b] = await Promise.all([Svc.withdraw(ctx(), cmd(claim.id)), Svc.withdraw(ctx(), cmd(claim.id))]);
      // one did the work, one replayed — never two effects
      expect([a.alreadyWithdrawn, b.alreadyWithdrawn].sort()).toEqual([false, true]);
      expect(await logCount(claim.id)).toBe(1);
      expect(await outboxCount(claim.id)).toBe(1);
      expect((await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } }))!.status).toBe("WITHDRAWN");
    });

    it("withdrawal racing a concurrent decision → exactly one wins, state stays consistent", async () => {
      // Repeat a few times so the scheduler samples both interleavings.
      for (let i = 0; i < 6; i++) {
        const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
        // A competing decision as a status-guarded serializable flip (RECEIVED → APPROVED).
        const decide = () =>
          inSerializableTx(prisma, async (tx) => {
            const r = await tx.claim.updateMany({
              where: { id: claim.id, status: { in: ["RECEIVED", "CAPTURED", "UNDER_REVIEW"] } },
              data: { status: "APPROVED", approvedAmount: 1000, decidedAt: new Date() },
            });
            return r.count; // 1 = decision won, 0 = withdrawal won
          }, { label: "race decide" }).catch(() => -1);

        const [decideCount, wRes] = await Promise.all([decide(), Svc.withdraw(ctx(), cmd(claim.id)).catch((e) => e)]);
        const finalStatus = (await prisma.claim.findUnique({ where: { id: claim.id }, select: { status: true } }))!.status;
        const wSucceeded = !(wRes instanceof Error) && (wRes as { status?: string }).status === "WITHDRAWN" && (wRes as { alreadyWithdrawn?: boolean }).alreadyWithdrawn === false;

        // Exactly one of {decision, withdrawal} took effect — never both, never neither.
        if (finalStatus === "WITHDRAWN") {
          expect(wSucceeded).toBe(true);
          expect(decideCount).toBe(0); // decision saw the claim already gone from the receivable set
          expect(await logCount(claim.id)).toBe(1);
        } else {
          expect(finalStatus).toBe("APPROVED");
          expect(decideCount).toBe(1);
          expect(wRes).toBeInstanceOf(ClaimWithdrawalError);
          expect((wRes as { code?: string }).code).toBe("NOT_WITHDRAWABLE");
          expect(await logCount(claim.id)).toBe(0); // no withdrawal effect
        }
      }
    });
  });

  // ── zero money / hold mutation ─────────────────────────────────────────────
  it("mutates zero money/hold — no usage, holds, vouchers, fund movements or amounts", async () => {
    const claim = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED", memberId: world.members.alpha.id });
    const usageBefore = await prisma.benefitUsage.count({ where: { memberId: world.members.alpha.id } });

    await Svc.withdraw(ctx(), cmd(claim.id));

    const row = await prisma.claim.findUnique({
      where: { id: claim.id },
      select: { status: true, approvedAmount: true, paidAmount: true, paymentVoucherId: true, settlementBatchId: true, benefitUsageId: true },
    });
    expect(row!.status).toBe("WITHDRAWN");
    expect(Number(row!.approvedAmount)).toBe(0);
    expect(Number(row!.paidAmount)).toBe(0);
    expect(row!.paymentVoucherId).toBeNull();
    expect(row!.settlementBatchId).toBeNull();
    expect(row!.benefitUsageId).toBeNull();

    // no money child rows introduced
    expect(await prisma.fundTransaction.count({ where: { claimId: claim.id } })).toBe(0);
    expect(await prisma.benefitHold.count({ where: { convertedToClaimId: claim.id } })).toBe(0);
    expect(await prisma.benefitUsage.count({ where: { memberId: world.members.alpha.id } })).toBe(usageBefore);
  });
});
