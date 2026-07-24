/**
 * F5.7 — atomic claim replacement (correction) service (opt-in DB).
 *
 * Proves the spec §13 F5.7 + Gate D invariants against a real Postgres:
 *  - a valid correction creates ONE canonical linked child through the intake and
 *    atomically supersedes the predecessor (chain lineage, original immutable);
 *  - a structural failure leaves the predecessor active (no partial write);
 *  - two concurrent corrections produce exactly ONE current child;
 *  - a same-key replay returns the same child; a same-key/changed-payload conflicts;
 *  - the child is NOT exempted from duplicate detection (sanctioned lineage, no bypass);
 *  - zero money mutation on the predecessor;
 *  - authorization is server-derived (permission / provider ownership / branch).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!URL_SET)("F5.7 ClaimReplacementService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-replacement/service").ClaimReplacementService;
  let ClaimReplacementError: typeof import("@/server/services/claim-replacement/service").ClaimReplacementError;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let ChainSvc: typeof import("@/server/services/claim-submission-chain/service").ClaimSubmissionChainService;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;

  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER",
      actorId: world.users.a.biller.id,
      tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.claim.correct"],
      apiScopes: [],
      requestId: "test-req",
      ...over,
    };
  }

  let keySeq = 0;
  function cmd(predecessorClaimId: string, over: Partial<import("@/server/services/claim-replacement/service").ReplaceClaimCommand> = {}) {
    keySeq += 1;
    return {
      tenantId: world.tenants.alpha.id,
      predecessorClaimId,
      idempotencyKey: `corr-${keySeq}-${predecessorClaimId.slice(0, 8)}`,
      reason: "Corrected the billed amount",
      serviceType: "OUTPATIENT" as const,
      benefitCategory: "OUTPATIENT" as const,
      dateOfService: isoDaysAgo(3),
      diagnoses: [{ code: "E11.9", description: "Type 2 diabetes", standardCharge: null, isPrimary: true }],
      lineItems: [{ serviceCategory: "CONSULTATION" as const, cptCode: "99213", icdCode: "E11.9", description: "Office visit (corrected)", quantity: 1, unitCost: 1500, billedAmount: 1500 }],
      ...over,
    };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/claim-replacement/service");
    Svc = mod.ClaimReplacementService;
    ClaimReplacementError = mod.ClaimReplacementError;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    ChainSvc = (await import("@/server/services/claim-submission-chain/service")).ClaimSubmissionChainService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  const mkPredecessor = (over = {}) => world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status: "RECEIVED", ...over });

  it("creates one linked child, supersedes the predecessor, and leaves the original immutable", async () => {
    const pred = await mkPredecessor();
    const res = await Svc.replace(ctx(), cmd(pred.id));

    expect(res.replayed).toBe(false);
    expect(res.claimId).not.toBe(pred.id);
    expect(res.chainRootClaimId).toBe(pred.id);

    const p = await prisma.claim.findUnique({ where: { id: pred.id } });
    expect(p!.status).toBe("SUPERSEDED");
    expect(p!.supersededByClaimId).toBe(res.claimId);
    expect(p!.supersededAt).not.toBeNull();
    expect(Number(p!.billedAmount)).toBe(1000); // original content untouched (immutable)
    expect(Number(p!.approvedAmount)).toBe(0);

    const child = await prisma.claim.findUnique({ where: { id: res.claimId }, include: { claimLines: true } });
    expect(child!.status).toBe("RECEIVED");
    expect(child!.submissionType).toBe("CORRECTION");
    expect(child!.supersedesClaimId).toBe(pred.id);
    expect(child!.chainRootClaimId).toBe(pred.id);
    expect(Number(child!.billedAmount)).toBe(1500); // the corrected amount
    expect(child!.claimLines.length).toBe(1);

    // the chain resolves both versions, oldest first, from the child
    const chain = await ChainSvc.getChain({ tenantId: world.tenants.alpha.id, providerId: world.providers.a.id }, res.claimId);
    expect(chain.map((c) => c.id)).toEqual([pred.id, res.claimId]);

    // predecessor's SUPERSEDED lifecycle log written
    expect(await prisma.adjudicationLog.count({ where: { claimId: pred.id, action: "SUPERSEDED" } })).toBe(1);
  });

  it("a structural failure leaves the predecessor active (no partial write)", async () => {
    const pred = await mkPredecessor();
    // billed != quantity × unit cost ⇒ the canonical schema rejects it.
    const bad = cmd(pred.id, { lineItems: [{ serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "E11.9", description: "bad", quantity: 2, unitCost: 1500, billedAmount: 1500 }] });
    const err = await Svc.replace(ctx(), bad).catch((e) => e);
    expect(err).toBeInstanceOf(ClaimReplacementError);
    expect(err.code).toBe("INVALID_CORRECTION");

    const p = await prisma.claim.findUnique({ where: { id: pred.id }, select: { status: true, supersededByClaimId: true } });
    expect(p!.status).toBe("RECEIVED");
    expect(p!.supersededByClaimId).toBeNull();
    expect(await prisma.claim.count({ where: { supersedesClaimId: pred.id } })).toBe(0);
  });

  it("refuses to correct a decided/terminal predecessor (NOT_CORRECTABLE)", async () => {
    for (const status of ["APPROVED", "PAID", "DECLINED", "SUPERSEDED"] as const) {
      const pred = await mkPredecessor({ status });
      const err = await Svc.replace(ctx(), cmd(pred.id)).catch((e) => e);
      expect(err, status).toBeInstanceOf(ClaimReplacementError);
      expect(err.code, status).toBe("NOT_CORRECTABLE");
      expect(await prisma.claim.count({ where: { supersedesClaimId: pred.id } })).toBe(0);
    }
  });

  it("two concurrent corrections produce exactly one current child", async () => {
    const pred = await mkPredecessor();
    const results = await Promise.allSettled([
      Svc.replace(ctx(), cmd(pred.id)),
      Svc.replace(ctx(), cmd(pred.id)),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].reason).toBeInstanceOf(ClaimReplacementError);
    expect(failed[0].reason.code).toBe("NOT_CORRECTABLE");

    // exactly one child supersedes the predecessor, and it is the winner's
    const children = await prisma.claim.findMany({ where: { supersedesClaimId: pred.id } });
    expect(children.length).toBe(1);
    const p = await prisma.claim.findUnique({ where: { id: pred.id }, select: { status: true, supersededByClaimId: true } });
    expect(p!.status).toBe("SUPERSEDED");
    expect(p!.supersededByClaimId).toBe((ok[0] as PromiseFulfilledResult<{ claimId: string }>).value.claimId);
  });

  it("a same-key replay returns the same child (idempotent); a changed payload conflicts", async () => {
    const pred = await mkPredecessor();
    const key = `replay-${keySeq}-${pred.id.slice(0, 6)}`;
    const first = await Svc.replace(ctx(), cmd(pred.id, { idempotencyKey: key }));
    const replay = await Svc.replace(ctx(), cmd(pred.id, { idempotencyKey: key })); // same key + same content
    expect(replay.replayed).toBe(true);
    expect(replay.claimId).toBe(first.claimId);
    expect(await prisma.claim.count({ where: { supersedesClaimId: pred.id } })).toBe(1);

    // same key, CHANGED payload ⇒ conflict (never a second claim)
    const conflict = await Svc.replace(ctx(), cmd(pred.id, { idempotencyKey: key, reason: "different", lineItems: [{ serviceCategory: "LABORATORY", cptCode: "80050", icdCode: "E11.9", description: "labs", quantity: 1, unitCost: 999, billedAmount: 999 }] })).catch((e) => e);
    expect(conflict).toBeInstanceOf(ClaimReplacementError);
    expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await prisma.claim.count({ where: { supersedesClaimId: pred.id } })).toBe(1);
  });

  it("does not exempt the child from duplicate detection (sanctioned lineage, no blanket bypass)", async () => {
    const pred = await mkPredecessor();
    const res = await Svc.replace(ctx(), cmd(pred.id));
    const child = await prisma.claim.findUnique({ where: { id: res.claimId }, select: { suspectedDuplicateFingerprint: true, strongEventFingerprint: true } });
    // subject to normal candidate review (a real content signature, not a bypass sentinel)…
    expect(child!.suspectedDuplicateFingerprint).toMatch(/^suspect:/);
    // …but no false authoritative link to the predecessor (a new claim, not a strong-link).
    expect(child!.strongEventFingerprint).toBeNull();
    // the predecessor is removed from the candidate set by being SUPERSEDED (F5.3), not by exempting the child.
    const p = await prisma.claim.findUnique({ where: { id: pred.id }, select: { status: true } });
    expect(p!.status).toBe("SUPERSEDED");
  });

  it("mutates zero money on the predecessor", async () => {
    const pred = await mkPredecessor();
    const usageBefore = await prisma.benefitUsage.count({ where: { memberId: world.members.alpha.id } });
    await Svc.replace(ctx(), cmd(pred.id));

    const p = await prisma.claim.findUnique({ where: { id: pred.id }, select: { approvedAmount: true, paidAmount: true, paymentVoucherId: true, settlementBatchId: true, benefitUsageId: true } });
    expect(Number(p!.approvedAmount)).toBe(0);
    expect(Number(p!.paidAmount)).toBe(0);
    expect(p!.paymentVoucherId).toBeNull();
    expect(p!.settlementBatchId).toBeNull();
    expect(p!.benefitUsageId).toBeNull();
    expect(await prisma.fundTransaction.count({ where: { claimId: pred.id } })).toBe(0);
    expect(await prisma.benefitUsage.count({ where: { memberId: world.members.alpha.id } })).toBe(usageBefore);
  });

  it("authorizes by permission, provider ownership, and branch", async () => {
    const pred = await mkPredecessor({ branchId: world.branches.a1.id });

    // missing permission
    const noPerm = await Svc.replace(ctx({ permissions: ["provider.claim.read"] }), cmd(pred.id)).catch((e) => e);
    expect(noPerm).toBeInstanceOf(ProviderAccessError);
    expect(noPerm.code).toBe("FORBIDDEN_PERMISSION");

    // another provider cannot see it (non-enumerating NOT_FOUND)
    const other = await Svc.replace(ctx({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] }), cmd(pred.id)).catch((e) => e);
    expect(other).toBeInstanceOf(ClaimReplacementError);
    expect(other.code).toBe("NOT_FOUND");

    // branch-stamped claim requires the branch
    const noBranch = await Svc.replace(ctx({ allowedProviderBranchIds: [world.branches.a2.id] }), cmd(pred.id)).catch((e) => e);
    expect(noBranch).toBeInstanceOf(ProviderAccessError);
    expect(noBranch.code).toBe("FORBIDDEN_BRANCH");

    // predecessor untouched by any of the rejected attempts
    expect((await prisma.claim.findUnique({ where: { id: pred.id }, select: { status: true } }))!.status).toBe("RECEIVED");
  });
});
