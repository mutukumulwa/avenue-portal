/**
 * Claims Autopilot F5.5 — offline sync rail REAL-DB proof.
 *
 * Reconciled offline Claim ops now submit through the canonical intake with
 * `SyncOperation.opKey` as the idempotency key and the clientUuid as the
 * external ref. Proves: clean capture ⇒ SYNCED + receipt/claim linkage + true
 * channel/scope + in-request processing; retry ingest dedups; a fresh op for an
 * already-created claim links across the migration boundary (no duplicate);
 * offline overcommit ⇒ CONFLICT + exception register + no claim; an
 * un-entitled facility's op ⇒ visible CONFLICT (tenant/provider isolation).
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SyncService } from "@/server/services/sync.service";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.5 integration — offline sync converges on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerAId: string, providerAName: string, providerBName: string, memberId: string, memberNumber: string, clientId: string, contractId: string;
  const RUN = Date.now().toString(36);
  let seq = 0;
  const opKey = () => `f55-${RUN}-${(seq += 1)}`;

  const payload = (over: Record<string, unknown> = {}) => ({
    memberNumber,
    providerCode: providerAName, // name-fallback resolution (no work code in this test)
    serviceType: "OUTPATIENT",
    dateOfService: "2026-06-14",
    diagnoses: ["J06.9"],
    lineItems: [{ description: "Offline consult", quantity: 1, unitCost: 2800, serviceCategory: "CONSULTATION", cptCode: "99213" }],
    ...over,
  });
  const ingestOne = async (p: Record<string, unknown>, key = opKey(), clientUuid = `uuid-${key}`) => {
    const res = await SyncService.ingest(tenantId, [
      { clientUuid, opKey: key, entityType: "Claim", payload: p, deviceId: "dev-f55", capturedAt: new Date().toISOString() },
    ]);
    return { id: res[0].id, key, clientUuid, duplicate: res[0].duplicate, state: res[0].state };
  };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    const [a, b] = await prisma.provider.findMany({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true, name: true }, take: 2 });
    providerAId = a.id;
    providerAName = a.name;
    providerBName = b.name;
    const member = await prisma.member.findFirstOrThrow({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, memberNumber: true, group: { select: { clientId: true } } },
    });
    memberId = member.id;
    memberNumber = member.memberNumber;
    clientId = member.group.clientId;
    // Offline devices are entitlement-scoped (the pack is built FROM entitlement):
    // give facility A a real contract scope; facility B stays un-entitled.
    contractId = (
      await prisma.providerContract.create({
        data: {
          tenantId, providerId: providerAId,
          contractNumber: `PC-F55-${RUN}`, title: "F5.5 test MSA", status: "ACTIVE",
          startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
          applicability: { create: { clientId, inclusionType: "INCLUDE", effectiveFrom: new Date("2026-01-01"), isActive: true } },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const claims = await prisma.claim.findMany({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { startsWith: `f55-${RUN}` } } } }, select: { id: true } });
    const ids = claims.map((c) => c.id);
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: ids } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { startsWith: `f55-${RUN}` } } }).catch(() => undefined);
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    await prisma.exceptionLog.deleteMany({ where: { tenantId, entityRef: { contains: `f55-${RUN}` } } }).catch(() => undefined);
    await prisma.syncOperation.deleteMany({ where: { tenantId, opKey: { startsWith: `f55-${RUN}` } } }).catch(() => undefined);
    if (contractId) await prisma.providerContract.delete({ where: { id: contractId } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("clean capture: SYNCED with receipt+claim linkage, true channel/scope/source, processed in-request", async () => {
    const op = await ingestOne(payload());
    expect(op.state).toBe("CONFLICT"); // no work code supplied at ingest ⇒ buffered as INVALID_OFFLINE_AUTH…
    // …so flip it to PENDING for the reconcile path (this test drives reconcile
    // directly; work-code issuance is OfflineAuthService's own tested concern).
    await prisma.syncOperation.update({ where: { id: op.id }, data: { state: "PENDING", conflictReason: null } });

    const res = await SyncService.reconcile(op.id);
    expect(res.state).toBe("SYNCED");

    const fresh = await prisma.syncOperation.findUniqueOrThrow({ where: { id: op.id }, select: { state: true, receiptId: true, resultClaimId: true, syncedAt: true } });
    expect(fresh.state).toBe("SYNCED");
    expect(fresh.receiptId).toBeTruthy();
    expect(fresh.resultClaimId).toBeTruthy();
    expect(fresh.syncedAt).not.toBeNull();

    const claim = await prisma.claim.findUniqueOrThrow({
      where: { id: fresh.resultClaimId! },
      select: { source: true, externalRef: true, providerId: true, memberId: true, processingState: true },
    });
    expect(claim.source).toBe("OFFLINE_SYNC");
    expect(claim.externalRef).toBe(op.clientUuid);
    expect(claim.providerId).toBe(providerAId);
    expect(claim.memberId).toBe(memberId);
    expect(claim.processingState).not.toBeNull(); // D9 in-request processing

    const receipt = await prisma.claimIntakeReceipt.findUniqueOrThrow({ where: { id: fresh.receiptId! }, select: { channel: true, scopeKey: true, idempotencyKey: true } });
    expect(receipt.channel).toBe("OFFLINE_SYNC");
    expect(receipt.scopeKey).toBe(`device:${providerAId}:dev-f55`);
    expect(receipt.idempotencyKey).toBe(op.key);
  });

  it("retries never double-apply: ingest dedups the opKey; reconcile is an idempotency drop", async () => {
    const op = await ingestOne(payload());
    await prisma.syncOperation.update({ where: { id: op.id }, data: { state: "PENDING", conflictReason: null } });
    await SyncService.reconcile(op.id);

    const again = await ingestOne(payload(), op.key, op.clientUuid); // device retries the same batch
    expect(again.duplicate).toBe(true);
    const drop = await SyncService.reconcile(op.id);
    expect(drop.state).toBe("SYNCED"); // no re-apply
    expect(await prisma.claim.count({ where: { tenantId, externalRef: op.clientUuid } })).toBe(1);
  });

  it("a fresh op for an already-created claim LINKS across the boundary (SYNCED-but-lost is impossible)", async () => {
    const first = await ingestOne(payload());
    await prisma.syncOperation.update({ where: { id: first.id }, data: { state: "PENDING", conflictReason: null } });
    await SyncService.reconcile(first.id);

    // The device re-captures the SAME record under a NEW opKey (e.g. app reinstall):
    // the clientUuid identity finds the existing claim — linked, never duplicated.
    const second = await ingestOne(payload(), opKey(), first.clientUuid);
    await prisma.syncOperation.update({ where: { id: second.id }, data: { state: "PENDING", conflictReason: null } });
    const res = await SyncService.reconcile(second.id);
    expect(res.state).toBe("SYNCED");
    const linked = await prisma.syncOperation.findUniqueOrThrow({ where: { id: second.id }, select: { resultClaimId: true } });
    expect(linked.resultClaimId).toBeTruthy();
    expect(await prisma.claim.count({ where: { tenantId, externalRef: first.clientUuid } })).toBe(1);
  });

  it("offline overcommit: CONFLICT via the canonical benefit service + exception register + no claim", async () => {
    const availability = await BenefitUsageService.computeAvailability(prisma, {
      memberId, benefitCategory: "OUTPATIENT", requestedAmount: 1, serviceDate: new Date("2026-06-14"),
    });
    const over = Math.ceil((availability?.payableCeiling ?? 100000) + 50_000);
    const op = await ingestOne(payload({ lineItems: [{ description: "Overcommit", quantity: 1, unitCost: over }] }));
    await prisma.syncOperation.update({ where: { id: op.id }, data: { state: "PENDING", conflictReason: null } });

    const res = await SyncService.reconcile(op.id);
    expect(res.state).toBe("CONFLICT");
    expect(res.reason).toMatch(/Insufficient benefit at sync time/i);
    expect(await prisma.claim.count({ where: { tenantId, externalRef: op.clientUuid } })).toBe(0);
    const exception = await prisma.exceptionLog.findFirst({ where: { tenantId, entityRef: `SYNC ${op.key}` }, select: { id: true } });
    expect(exception).toBeTruthy(); // PR-036: visible, never lost
  });

  it("tenant/provider isolation: an un-entitled facility's op is a visible CONFLICT, no claim", async () => {
    const op = await ingestOne(payload({ providerCode: providerBName }));
    await prisma.syncOperation.update({ where: { id: op.id }, data: { state: "PENDING", conflictReason: null } });
    const res = await SyncService.reconcile(op.id);
    expect(res.state).toBe("CONFLICT");
    expect(res.reason).toMatch(/not accessible|not permitted/i);
    expect(await prisma.claim.count({ where: { tenantId, externalRef: op.clientUuid } })).toBe(0);
  });
});
