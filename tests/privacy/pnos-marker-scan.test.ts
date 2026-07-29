/**
 * F11.4 — privacy/log/export marker scan (opt-in DB).
 *
 * Seed distinctive prohibited markers (a live secret, a raw-body PHI marker) into
 * the F9/F10 data, then SCAN every provider/finance-facing read model + receipt and
 * assert none of the markers — nor any structural secret/hash/lease field — ever
 * appears. A leak would surface the marker string; its absence is the proof.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

// BigInt/Decimal/Date-safe deep stringify for scanning.
const scan = (o: unknown) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

describe.skipIf(!URL_SET)("F11.4 privacy marker scan (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let Inbound: typeof import("@/server/services/provider-integration/inbound-delivery.service").InboundDeliveryService;
  let Ops: typeof import("@/server/services/provider-integration/ops-read.service").ProviderIntegrationOpsRead;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Stmt: typeof import("@/server/services/capitation/statement.service").CapitationStatementService;
  let world: import("../factories/provider-network").ProviderWorld;

  const NOW = new Date("2026-07-28T12:00:00.000Z");
  const PHI_MARKER = "PHI-MARKER-CONFIDENTIAL-DIAGNOSIS-ZZZ";
  const STRUCTURAL = ["secretRef", "keyHash", "secretHash", "normalizedPayloadHash", "leaseOwner", "presentedSecret", "rawBody"];
  let seq = 0;
  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctx = (): Ctx => ({ actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "r" });
  const capActor = () => ({ userId: "fin", tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN" });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Admin = (await import("@/server/services/provider-integration/connection-admin.service")).ProviderIntegrationConnectionAdmin;
    Inbound = (await import("@/server/services/provider-integration/inbound-delivery.service")).InboundDeliveryService;
    Ops = (await import("@/server/services/provider-integration/ops-read.service")).ProviderIntegrationOpsRead;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Stmt = (await import("@/server/services/capitation/statement.service")).CapitationStatementService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("no integration read model / receipt leaks the secret, the raw body, or a structural handle", async () => {
    const conn = await Admin.create(ctx(), { label: "scan", connectorType: "SCAN_1", mode: "PUSH", scopes: ["CASE_SERVICE"] });
    const { plaintext: SECRET } = await Admin.rotateSecret(ctx(), conn.id);
    await Admin.test(ctx(), conn.id);
    await Admin.activate(ctx(), conn.id);
    // a delivery whose raw body carries a PHI marker — only its hash is stored
    const rawBody = JSON.stringify({ entries: [{ caseNumber: "X", entryDate: "2026-07-03", description: PHI_MARKER, unitAmount: 1 }] });
    const receipt = await Inbound.receive({ connectionId: conn.id, presentedSecret: SECRET, timestamp: NOW.toISOString(), idempotencyKey: `s-${++seq}`, businessObjectType: "CASE_SERVICE", rawBody, contentType: "application/json" }, { now: NOW });

    const views = [
      await Admin.list(ctx()),
      await Admin.get(ctx(), conn.id),
      await Ops.listConnectionHealth(ctx()),
      await Ops.listDeliveries(ctx(), { take: 50 }),
      await Ops.getDeliveryDetail(ctx(), receipt.deliveryId),
      await Inbound.getReceipt(conn.id, receipt.deliveryId),
    ];
    for (const v of views) {
      const s = scan(v);
      expect(s).not.toContain(SECRET); // the live secret never appears
      expect(s).not.toContain(PHI_MARKER); // the raw clinical body never appears
      for (const marker of STRUCTURAL) expect(s).not.toContain(marker);
    }
  });

  it("no capitation statement leaks internal finance ids or member clinical detail", async () => {
    const y = 2060 + seq++;
    const a = await Arr.createArrangement(capActor(), { providerId: world.providers.a.id, label: "scan-cap", rate: "1000.00", eligibilityDefinitionVersion: "CAP-1.0", effectiveFrom: new Date(`${y}-01-01Z`), effectiveTo: new Date(`${y}-12-31Z`) });
    const p = await Arr.openPeriod(capActor(), a.id, `${y}-01`, { periodStart: new Date(`${y}-01-01Z`), periodEnd: new Date(`${y}-01-28Z`) });
    // seed a marker into an adjustment reason + a voucher id on the period
    await prisma.capitationPeriod.update({ where: { id: p.id }, data: { voucherId: "VOUCHER-SECRET-123", journalEntryId: "GL-SECRET-456", disbursementId: "DISB-SECRET-789" } });
    await Arr.recordAdjustment(capActor(), p.id, { category: "RECONCILIATION", amount: "10.00", reason: "safe reason" });

    const s = scan(await Stmt.getStatement(capActor(), p.id));
    // the provider-safe statement must not carry the internal finance ids
    for (const leak of ["VOUCHER-SECRET-123", "GL-SECRET-456", "DISB-SECRET-789", "voucherId", "journalEntryId", "disbursementId"]) {
      expect(s).not.toContain(leak);
    }
  });
});
