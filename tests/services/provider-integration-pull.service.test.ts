/**
 * F9.7 — outbound pull adapter (opt-in DB; injected transport, no network).
 *
 * A polled page flows through the same durable rail (receipt → processor); the
 * cursor advances only past the durable accepted+processed boundary; a same-page
 * re-poll replays (no duplicate); a DNS-rebind fetch is blocked and counted; and a
 * failing endpoint trips the circuit after the threshold. GATED: no real endpoint
 * is polled — the transport is injected.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SafeFetchResponse } from "@/lib/http-safe";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const httpRes = (status: number, body: string): SafeFetchResponse => ({ status, headers: { get: () => null }, text: async () => body });

describe.skipIf(!URL_SET)("F9.7 pull adapter (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Pull: typeof import("@/server/services/provider-integration/pull-adapter.service").CaseServicePullAdapter;
  let world: import("../factories/provider-network").ProviderWorld;

  const NOW = new Date("2026-07-28T12:00:00.000Z");
  const CASE_NO = "CASE-F97-1";
  const testCaseIds: string[] = [];
  let seq = 0;

  const publicResolver = async () => ["8.8.8.8"];
  // A transport whose fetcher returns a fixed page (a CASE_SERVICE batch).
  const pageTransport = (page: unknown) => ({ resolver: publicResolver, fetcher: async () => httpRes(200, JSON.stringify(page)) });

  const entriesForDelivery = (deliveryId: string) => prisma.caseServiceEntry.count({ where: { hmsBatchRef: { startsWith: `${deliveryId}#` } } });

  async function mkPullConnection(over: Record<string, unknown> = {}) {
    return prisma.providerIntegrationConnection.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, providerBranchId: "", label: `pull-${++seq}`, connectorType: `PULL_${seq}`,
        mode: "PULL", status: "ACTIVE", scopes: ["CASE_SERVICE"], apiBaseUrl: "https://hms.example.com/pull", ...over,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Pull = (await import("@/server/services/provider-integration/pull-adapter.service")).CaseServicePullAdapter;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    const c = await prisma.clinicalCase.create({
      data: {
        tenantId: world.tenants.alpha.id, caseNumber: CASE_NO, memberId: world.members.alpha.id, providerId: world.providers.a.id,
        caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT", status: "OPEN", admissionDate: new Date("2026-07-01T00:00:00Z"),
        openedById: world.users.a.admin.id, currency: "UGX",
      },
    });
    testCaseIds.push(c.id);
  });
  afterAll(async () => {
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: { in: testCaseIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: testCaseIds } } });
    if (world) await world.teardown();
  });

  it("pulls a page through the durable rail and advances the cursor only after accept+process", async () => {
    const conn = await mkPullConnection();
    const page = { entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "Pulled svc", unitAmount: 2500 }], nextCursor: "cursor-2" };
    const out = await Pull.pollOnce(conn.id, { now: NOW, transport: pageTransport(page) });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.applied).toBe(1);
    expect(out.reconciled).toBe(true);
    expect(out.cursor).toBe("cursor-2");
    expect(await entriesForDelivery(out.deliveryId)).toBe(1);
    // cursor persisted only after the boundary
    expect((await prisma.providerIntegrationConnection.findUniqueOrThrow({ where: { id: conn.id } })).cursor).toBe("cursor-2");
  });

  it("replays a re-polled page without duplicating (idempotent)", async () => {
    const conn = await mkPullConnection();
    const page = { entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "Once", unitAmount: 1000 }], nextCursor: "n2" };
    const first = await Pull.pollOnce(conn.id, { now: NOW, transport: pageTransport(page) });
    if (first.status !== "ok") throw new Error("expected ok");
    const before = await entriesForDelivery(first.deliveryId);
    expect(before).toBe(1);

    // Rewind the cursor (as a crash-before-advance would leave it) and re-poll the same page.
    await prisma.providerIntegrationConnection.update({ where: { id: conn.id }, data: { cursor: null } });
    const second = await Pull.pollOnce(conn.id, { now: NOW, transport: pageTransport(page) });
    if (second.status !== "ok") throw new Error("expected ok");
    expect(second.replayed).toBe(true);
    expect(second.deliveryId).toBe(first.deliveryId);
    expect(await entriesForDelivery(first.deliveryId)).toBe(1); // no duplicate
  });

  it("blocks a DNS-rebind endpoint and counts the failure without advancing the cursor", async () => {
    const conn = await mkPullConnection();
    const out = await Pull.pollOnce(conn.id, { now: NOW, transport: { resolver: async () => ["10.0.0.9"], fetcher: async () => httpRes(200, "{}") } });
    expect(out.status).toBe("error");
    const row = await prisma.providerIntegrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.consecutiveFailures).toBe(1);
    expect(row.cursor).toBeNull(); // never advanced
  });

  it("opens the circuit after the failure threshold, then short-circuits", async () => {
    const conn = await mkPullConnection();
    const failing = { resolver: publicResolver, fetcher: async () => httpRes(503, "upstream down") };
    for (let i = 0; i < 3; i++) {
      const out = await Pull.pollOnce(conn.id, { now: NOW, transport: failing, failureThreshold: 3 });
      expect(out.status).toBe("error");
    }
    const row = await prisma.providerIntegrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.circuitState).toBe("OPEN");
    // With the circuit open and no cool-down elapsed, the next poll short-circuits.
    const blocked = await Pull.pollOnce(conn.id, { now: NOW, transport: failing, failureThreshold: 3 });
    expect(blocked.status).toBe("circuit-open");
  });

  it("recovers the circuit on a successful poll after cool-down", async () => {
    const conn = await mkPullConnection({ circuitState: "OPEN", circuitOpenedAt: new Date(NOW.getTime() - 10 * 60 * 1000), consecutiveFailures: 5 });
    const page = { entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "Recovered", unitAmount: 700 }], nextCursor: "r2" };
    const out = await Pull.pollOnce(conn.id, { now: NOW, transport: pageTransport(page), cooldownMs: 5 * 60 * 1000 });
    expect(out.status).toBe("ok");
    const row = await prisma.providerIntegrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.circuitState).toBe("CLOSED");
    expect(row.consecutiveFailures).toBe(0);
  });
});
