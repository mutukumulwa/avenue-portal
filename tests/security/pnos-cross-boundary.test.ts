/**
 * F11.1 — cross-boundary security suite (opt-in DB).
 *
 * A consolidated matrix over the F9 (integration) + F10 (capitation) surfaces that
 * proves isolation on every access dimension: cross-PROVIDER (A vs B, same tenant),
 * cross-TENANT (alpha vs beta), and ROLE/permission denial. Every foreign access is
 * a SAFE not-found (non-enumerating) or a forbidden — never data. Build-gating.
 *
 * (The F1–F8 provider surfaces are covered by their own per-package scope suites —
 * see PROGRESS.md / SECURITY_MATRIX.md; this adds the cross-cutting F9/F10 matrix,
 * especially the cross-tenant dimension.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F11.1 cross-boundary security (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let Ops: typeof import("@/server/services/provider-integration/ops-read.service").ProviderIntegrationOpsRead;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Stmt: typeof import("@/server/services/capitation/statement.service").CapitationStatementService;
  let Accr: typeof import("@/server/services/capitation/accrual.service").CapitationAccrualService;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const provCtx = (over: Partial<Ctx>): Ctx => ({
    actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "r", ...over,
  });
  const capActor = (over: { tenantId?: string; role?: string } = {}) => ({ userId: "fin", tenantId: over.tenantId ?? world.tenants.alpha.id, role: over.role ?? "SUPER_ADMIN" });

  let connB = "";
  let betaPeriodId = "";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Admin = (await import("@/server/services/provider-integration/connection-admin.service")).ProviderIntegrationConnectionAdmin;
    Ops = (await import("@/server/services/provider-integration/ops-read.service")).ProviderIntegrationOpsRead;
    const cap = await import("@/server/services/capitation/arrangement.service");
    Arr = cap.CapitationArrangementService;
    Stmt = (await import("@/server/services/capitation/statement.service")).CapitationStatementService;
    Accr = (await import("@/server/services/capitation/accrual.service")).CapitationAccrualService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);

    // Provider B (same tenant) integration connection + a delivery.
    const bConn = await Admin.create(provCtx({ providerId: world.providers.b.id }), { label: "B", connectorType: "SEC_B" });
    connB = bConn.id;
    await prisma.providerIntegrationDelivery.create({ data: { tenantId: world.tenants.alpha.id, connectionId: connB, providerId: world.providers.b.id, providerBranchId: "", direction: "INBOUND", businessObjectType: "CASE_SERVICE", idempotencyKey: "b-1", normalizedPayloadHash: "h", status: "ACCEPTED" } });

    // A capitation period in tenant BETA (provider C).
    const betaArr = await Arr.createArrangement(capActor({ tenantId: world.tenants.beta.id }), {
      providerId: world.providers.c.id, label: "beta", rate: "5000.00", currency: "KES", eligibilityDefinitionVersion: "CAP-1.0", effectiveFrom: new Date("2033-01-01Z"), effectiveTo: new Date("2033-12-31Z"),
    });
    const bp = await Arr.openPeriod(capActor({ tenantId: world.tenants.beta.id }), betaArr.id, "2033-01", { periodStart: new Date("2033-01-01Z"), periodEnd: new Date("2033-01-28Z") });
    betaPeriodId = bp.id;
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  // ── cross-provider (same tenant): A cannot reach B's integration resources ──
  it("integration: provider A cannot read or manage provider B's connection/deliveries", async () => {
    const a = provCtx({ providerId: world.providers.a.id });
    await expect(Admin.get(a, connB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(Admin.pause(a, connB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // ops list is provider-scoped — B's connection/deliveries never appear for A
    const health = await Ops.listConnectionHealth(a);
    expect(health.some((h) => h.id === connB)).toBe(false);
    const bDelivery = await prisma.providerIntegrationDelivery.findFirstOrThrow({ where: { connectionId: connB } });
    expect(await Ops.getDeliveryDetail(a, bDelivery.id)).toBeNull();
  });

  // ── cross-tenant: an alpha finance actor cannot reach a beta capitation period ──
  it("capitation: a tenant-alpha actor cannot read/mutate a tenant-beta period (non-enumerating)", async () => {
    const alpha = capActor({ tenantId: world.tenants.alpha.id });
    await expect(Stmt.getStatement(alpha, betaPeriodId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(Accr.calculateAccrual(alpha, betaPeriodId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(Arr.recordAdjustment(alpha, betaPeriodId, { category: "X", amount: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── role denial across both rails ──────────────────────────────────────────
  it("role: an unauthorized role is denied on integration + capitation mutations", async () => {
    await expect(Admin.create(provCtx({ permissions: [] }), { label: "x", connectorType: "c" })).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
    await expect(Ops.listDeliveries(provCtx({ permissions: [] }))).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
    await expect(Arr.createArrangement(capActor({ role: "PROVIDER_USER" }), { providerId: world.providers.a.id, label: "x", rate: "1", eligibilityDefinitionVersion: "CAP-1.0", effectiveFrom: new Date("2034-01-01Z") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(Stmt.approvePayable(capActor({ role: "CLAIMS_OFFICER" }), betaPeriodId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
