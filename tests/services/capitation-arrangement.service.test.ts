/**
 * F10.2 — capitation arrangement/period/adjustment schema + structural invariants
 * (opt-in DB). Role gate, currency, effective non-overlap per scope, period scope
 * consistency, frozen-period immutability, and append-only audited adjustments. No
 * calculation (F10.4).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F10.2 capitation arrangement (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let CapErr: typeof import("@/server/services/capitation/arrangement.service").CapitationError;
  let world: import("../factories/provider-network").ProviderWorld;

  let seq = 0;
  const actor = (role = "SUPER_ADMIN") => ({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role });
  const pid = () => world.providers.a.id;

  const baseInput = (over: Record<string, unknown> = {}) => ({
    providerId: pid(), label: `arr-${++seq}`, rate: "12000.00", currency: "UGX", eligibilityDefinitionVersion: "CAP-1.0",
    effectiveFrom: new Date("2026-07-01T00:00:00Z"), effectiveTo: new Date("2026-12-31T00:00:00Z"), ...over,
  });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/capitation/arrangement.service");
    Svc = mod.CapitationArrangementService;
    CapErr = mod.CapitationError;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("requires a finance role and a valid currency", async () => {
    await expect(Svc.createArrangement(actor("PROVIDER_USER"), baseInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(Svc.createArrangement(actor(), baseInput({ currency: "shilling" }))).rejects.toMatchObject({ code: "INVALID_CURRENCY" });
  });

  it("rejects an overlapping live arrangement for the same scope, allows non-overlap + a different scope", async () => {
    const a = await Svc.createArrangement(actor(), baseInput({ effectiveFrom: new Date("2026-07-01Z"), effectiveTo: new Date("2026-12-31Z") }));
    expect(a.status).toBe("DRAFT");
    // overlapping same scope → OVERLAP
    await expect(Svc.createArrangement(actor(), baseInput({ effectiveFrom: new Date("2026-10-01Z"), effectiveTo: new Date("2027-03-31Z") }))).rejects.toMatchObject({ code: "OVERLAP" });
    // non-overlapping same scope → OK
    const b = await Svc.createArrangement(actor(), baseInput({ effectiveFrom: new Date("2027-01-01Z"), effectiveTo: new Date("2027-06-30Z") }));
    expect(b.id).toBeTruthy();
    // overlapping but a DIFFERENT scope (branch) → OK
    const c = await Svc.createArrangement(actor(), baseInput({ providerBranchId: world.branches.a1.id, effectiveFrom: new Date("2026-10-01Z"), effectiveTo: new Date("2027-03-31Z") }));
    expect(c.providerBranchId).toBe(world.branches.a1.id);
  });

  it("opens a period that inherits the arrangement rate + definition version (consistency), idempotently", async () => {
    const a = await Svc.createArrangement(actor(), baseInput({ rate: "9500.00", effectiveFrom: new Date("2028-01-01Z"), effectiveTo: new Date("2028-12-31Z") }));
    const p1 = await Svc.openPeriod(actor(), a.id, "2028-01", { periodStart: new Date("2028-01-01Z"), periodEnd: new Date("2028-01-31Z") });
    expect(String(p1.rate)).toBe("9500");
    expect(p1.definitionVersion).toBe("CAP-1.0");
    expect(p1.status).toBe("DRAFT");
    // idempotent: same (arrangement, period) returns the same row
    const p2 = await Svc.openPeriod(actor(), a.id, "2028-01", { periodStart: new Date("2028-01-01Z"), periodEnd: new Date("2028-01-31Z") });
    expect(p2.id).toBe(p1.id);
  });

  it("treats a FROZEN period as immutable and a CLOSED period as adjustment-closed", async () => {
    const a = await Svc.createArrangement(actor(), baseInput({ effectiveFrom: new Date("2029-01-01Z"), effectiveTo: new Date("2029-12-31Z") }));
    const p = await Svc.openPeriod(actor(), a.id, "2029-01", { periodStart: new Date("2029-01-01Z"), periodEnd: new Date("2029-01-31Z") });

    expect(() => Svc.assertPeriodMutable({ status: "DRAFT" })).not.toThrow();
    expect(() => Svc.assertPeriodMutable({ status: "FROZEN" })).toThrow(CapErr);
    expect(() => Svc.assertPeriodMutable({ status: "PAID" })).toThrow();

    // An adjustment is allowed on a FROZEN period (a correction, not a rewrite)...
    await prisma.capitationPeriod.update({ where: { id: p.id }, data: { status: "FROZEN" } });
    const adj = await Svc.recordAdjustment(actor(), p.id, { category: "RETRO_ELIGIBILITY", amount: "12000.00", reason: "late join", approvedById: world.users.a.admin.id });
    expect(adj.category).toBe("RETRO_ELIGIBILITY");
    expect(adj.actorId).toBe(world.users.a.admin.id);
    expect(adj.approvedAt).toBeTruthy();
    // ...but NOT on a CLOSED period.
    await prisma.capitationPeriod.update({ where: { id: p.id }, data: { status: "CLOSED" } });
    await expect(Svc.recordAdjustment(actor(), p.id, { category: "CLAWBACK", amount: "-100.00" })).rejects.toMatchObject({ code: "PERIOD_IMMUTABLE" });
  });
});
