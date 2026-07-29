/**
 * F9.5 — route inbound CASE_SERVICE records through the canonical CaseService.
 *
 * Golden mapping fixtures (pure) + processor behavior (opt-in DB): a clean batch
 * applies every record through the canonical service; reprocessing is idempotent
 * (effects once); a mixed batch produces a partial outcome (applied/unmatched/
 * rejected/quarantined) without a poison record aborting the good rows; row +
 * amount totals conserve; and provider scope is server-derived (no cross-provider
 * case is touched). Stop: one object type.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  parseCaseServiceBatchV1,
  mapCaseServiceRecordV1,
  recordHashV1,
  CASE_SERVICE_MAPPING_VERSION,
  CaseServiceMappingError,
} from "@/server/services/provider-integration/mappers/case-service-v1";

// ── Golden mapping fixtures (pure — runs in the no-DB suite) ───────────────────
describe("F9.5 CASE_SERVICE.v1 mapper (golden fixtures)", () => {
  const GOLDEN = {
    mappingVersion: "CASE_SERVICE.v1",
    entries: [
      { caseNumber: "CASE-2026-1", entryDate: "2026-07-03", category: "PHARMACY", serviceCode: "SER1", description: "IV antibiotics", quantity: 2, unitAmount: 5000 },
      { memberNumber: "MVX-1", entryDate: "2026-07-03", description: "Consult", unitAmount: 3000 },
    ],
  };

  it("parses the versioned envelope and rejects a wrong version", () => {
    expect(parseCaseServiceBatchV1(GOLDEN)).toHaveLength(2);
    expect(() => parseCaseServiceBatchV1({ mappingVersion: "CASE_SERVICE.v2", entries: [] })).toThrow(CaseServiceMappingError);
    expect(() => parseCaseServiceBatchV1({ entries: [] })).toThrow(CaseServiceMappingError);
    expect(CASE_SERVICE_MAPPING_VERSION).toBe("CASE_SERVICE.v1");
  });

  it("maps a record to the canonical command with defaults + control amount", () => {
    const m = mapCaseServiceRecordV1(GOLDEN.entries[0]);
    expect("error" in m).toBe(false);
    if ("error" in m) return;
    expect(m.canonical.category).toBe("PHARMACY");
    expect(m.canonical.quantity).toBe(2);
    expect(m.amount).toBe(10000); // 2 × 5000
    expect(m.match.caseNumber).toBe("CASE-2026-1");

    const d = mapCaseServiceRecordV1(GOLDEN.entries[1]);
    if ("error" in d) throw new Error("should map");
    expect(d.canonical.category).toBe("OTHER"); // unknown/absent category defaults to OTHER
    expect(d.canonical.quantity).toBe(1);
    expect(d.match.memberNumber).toBe("MVX-1");
  });

  it("returns a safe error (not a throw) for a structurally-bad record", () => {
    expect(mapCaseServiceRecordV1({ entryDate: "2026-07-03", description: "", unitAmount: 1 } as never)).toEqual({ error: "description is required" });
    expect(mapCaseServiceRecordV1({ entryDate: "2026-07-03", description: "x", unitAmount: -1 } as never)).toEqual({ error: "unitAmount must be a non-negative number" });
    expect(mapCaseServiceRecordV1({ entryDate: "bad", description: "x", unitAmount: 1 } as never)).toEqual({ error: "valid entryDate is required" });
    expect(mapCaseServiceRecordV1({ entryDate: "2026-07-03", description: "x", unitAmount: 1 } as never)).toEqual({ error: "caseNumber or memberNumber is required" });
  });

  it("hashes a record deterministically (stable, 32-char)", () => {
    const h1 = recordHashV1(GOLDEN.entries[0]);
    const h2 = recordHashV1({ ...GOLDEN.entries[0] });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(32);
    expect(recordHashV1(GOLDEN.entries[1])).not.toBe(h1);
  });
});

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.5 delivery processor (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let Inbound: typeof import("@/server/services/provider-integration/inbound-delivery.service").InboundDeliveryService;
  let Processor: typeof import("@/server/services/provider-integration/delivery-processor.service").CaseServiceDeliveryProcessor;
  let world: import("../factories/provider-network").ProviderWorld;

  const NOW = new Date("2026-07-28T12:00:00.000Z");
  const CASE_NO = "CASE-F95-1";
  let memberNo = "";
  const testCaseIds: string[] = [];
  let keySeq = 0;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctx = (): Ctx => ({
    actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "req",
  });

  async function activeConnection() {
    const c = await Admin.create(ctx(), { label: `p${++keySeq}`, connectorType: `PROC_${keySeq}`, mode: "PUSH", scopes: ["CASE_SERVICE"] });
    const { plaintext } = await Admin.rotateSecret(ctx(), c.id);
    await Admin.test(ctx(), c.id);
    await Admin.activate(ctx(), c.id);
    return { connectionId: c.id, secret: plaintext };
  }

  async function receiveBatch(batch: unknown) {
    const { connectionId, secret } = await activeConnection();
    const rawBody = JSON.stringify(batch);
    const receipt = await Inbound.receive(
      { connectionId, presentedSecret: secret, timestamp: NOW.toISOString(), idempotencyKey: `k-${++keySeq}`, businessObjectType: "CASE_SERVICE", rawBody, contentType: "application/json" },
      { now: NOW },
    );
    return { deliveryId: receipt.deliveryId, rawBody };
  }

  const entriesForDelivery = (deliveryId: string) => prisma.caseServiceEntry.count({ where: { hmsBatchRef: { startsWith: `${deliveryId}#` } } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Admin = (await import("@/server/services/provider-integration/connection-admin.service")).ProviderIntegrationConnectionAdmin;
    Inbound = (await import("@/server/services/provider-integration/inbound-delivery.service")).InboundDeliveryService;
    Processor = (await import("@/server/services/provider-integration/delivery-processor.service")).CaseServiceDeliveryProcessor;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    memberNo = world.members.alpha.memberNumber;
    const c = await prisma.clinicalCase.create({
      data: {
        tenantId: world.tenants.alpha.id, caseNumber: CASE_NO, memberId: world.members.alpha.id, providerId: world.providers.a.id,
        caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT", status: "OPEN",
        admissionDate: new Date("2026-07-01T00:00:00Z"), openedById: world.users.a.admin.id, currency: "UGX",
      },
    });
    testCaseIds.push(c.id);
  });
  afterAll(async () => {
    // test-created entries + cases go before world.teardown (FK to member/provider/tenant).
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: { in: testCaseIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: testCaseIds } } });
    if (world) await world.teardown();
  });

  it("applies every record of a clean batch through the canonical CaseService", async () => {
    const { deliveryId, rawBody } = await receiveBatch({
      entries: [
        { caseNumber: CASE_NO, entryDate: "2026-07-03", category: "PHARMACY", description: "IV fluids", quantity: 2, unitAmount: 5000 },
        { memberNumber: memberNo, entryDate: "2026-07-04", description: "Consult", unitAmount: 3000 },
      ],
    });
    const report = await Processor.process(deliveryId, rawBody);
    expect(report).toMatchObject({ applied: 2, replayed: 0, unmatched: 0, rejected: 0, quarantined: 0, status: "COMPLETED" });
    expect(report.appliedAmount).toBe("13000.00"); // 2×5000 + 3000
    expect(await entriesForDelivery(deliveryId)).toBe(2);
    const results = await prisma.providerIntegrationRecordResult.findMany({ where: { deliveryId } });
    expect(results.every((r) => r.outcome === "APPLIED" && r.canonicalEntityType === "CaseServiceEntry")).toBe(true);
  });

  it("reprocesses idempotently — canonical effects exactly once", async () => {
    const { deliveryId, rawBody } = await receiveBatch({ entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "X-ray", unitAmount: 4000 }] });
    const first = await Processor.process(deliveryId, rawBody);
    expect(first.applied).toBe(1);
    expect(await entriesForDelivery(deliveryId)).toBe(1);

    // Simulate a re-drive (what the F9.6 sweeper does to a RETRYING delivery).
    await prisma.providerIntegrationDelivery.update({ where: { id: deliveryId }, data: { status: "ACCEPTED" } });
    const second = await Processor.process(deliveryId, rawBody);
    expect(second).toMatchObject({ applied: 0, replayed: 1, status: "COMPLETED" });
    expect(await entriesForDelivery(deliveryId)).toBe(1); // no duplicate canonical effect
  });

  it("produces a partial outcome for a mixed batch and conserves totals", async () => {
    const { deliveryId, rawBody } = await receiveBatch({
      entries: [
        { caseNumber: CASE_NO, entryDate: "2026-07-05", description: "Consult", unitAmount: 5000 }, // APPLIED
        { caseNumber: "NOPE-999", entryDate: "2026-07-05", description: "Ghost", unitAmount: 100 }, // UNMATCHED
        { caseNumber: CASE_NO, entryDate: "2026-12-01", description: "Future service", unitAmount: 200 }, // matches but QUARANTINED (future date)
        { caseNumber: CASE_NO, entryDate: "2026-07-05", description: "", unitAmount: 300 }, // REJECTED (bad record)
      ],
    });
    const report = await Processor.process(deliveryId, rawBody);
    expect(report).toMatchObject({ total: 4, applied: 1, unmatched: 1, quarantined: 1, rejected: 1, status: "PARTIAL" });
    // Row conservation: every record reached exactly one outcome.
    expect(report.applied + report.replayed + report.unmatched + report.rejected + report.quarantined + report.retrying).toBe(report.total);
    // Amount conservation: applied total = the one good record; the created entries sum to the same.
    expect(report.appliedAmount).toBe("5000.00");
    const created = await prisma.caseServiceEntry.aggregate({ where: { hmsBatchRef: { startsWith: `${deliveryId}#` } }, _sum: { totalAmount: true } });
    expect(Number(created._sum.totalAmount ?? 0)).toBe(5000);
    expect(await entriesForDelivery(deliveryId)).toBe(1); // only the good row applied

    // The delivery aggregate reflects the outcome (unmatched folds into rejected count).
    const d = await prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(d.appliedCount).toBe(1);
    expect(d.rejectedCount).toBe(2); // 1 unmatched + 1 rejected
    expect(d.quarantinedCount).toBe(1);
    expect(d.status).toBe("PARTIAL");
  });

  it("never touches another provider's case (server-derived scope)", async () => {
    // A case that exists at provider B, referenced from a provider-A connection's delivery.
    const bCase = await prisma.clinicalCase.create({
      data: {
        tenantId: world.tenants.alpha.id, caseNumber: "CASE-B-1", memberId: world.members.alpha.id, providerId: world.providers.b.id,
        caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT", status: "OPEN", admissionDate: new Date("2026-07-01T00:00:00Z"),
        openedById: world.users.a.admin.id, currency: "UGX",
      },
    });
    testCaseIds.push(bCase.id);
    const { deliveryId, rawBody } = await receiveBatch({ entries: [{ caseNumber: "CASE-B-1", entryDate: "2026-07-05", description: "Cross", unitAmount: 900 }] });
    const report = await Processor.process(deliveryId, rawBody);
    expect(report).toMatchObject({ applied: 0, unmatched: 1, status: "PARTIAL" }); // provider-A delivery cannot reach provider-B's case
    expect(await prisma.caseServiceEntry.count({ where: { caseId: bCase.id } })).toBe(0);
  });

  it("rejects a body that does not match the receipt hash", async () => {
    const { deliveryId } = await receiveBatch({ entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "A", unitAmount: 1 }] });
    await expect(Processor.process(deliveryId, JSON.stringify({ entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "TAMPERED", unitAmount: 1 }] })))
      .rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });

  it("refuses to process a delivery that is not in a processable state", async () => {
    const { deliveryId, rawBody } = await receiveBatch({ entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "B", unitAmount: 1 }] });
    await Processor.process(deliveryId, rawBody); // → COMPLETED
    await expect(Processor.process(deliveryId, rawBody)).rejects.toMatchObject({ code: "NOT_PROCESSABLE" });
  });
});
