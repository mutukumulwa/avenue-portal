/**
 * F9.3 — connection + credential administration (opt-in DB).
 *
 * Covers the package tests: role/provider/branch scoping; SSRF URL forms; the
 * secret is never returned/logged; rotation revokes the predecessor; and an
 * inactive connection rejects delivery. Plus the full lifecycle state machine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.3 connection admin (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let IntegrationAdminError: typeof import("@/server/services/provider-integration/connection-admin.service").IntegrationAdminError;
  let Store: typeof import("@/server/services/provider-integration/secret-store").IntegrationSecretStore;
  let world: import("../factories/provider-network").ProviderWorld;

  const tId = () => world.tenants.alpha.id;
  const pAId = () => world.providers.a.id;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER",
      actorId: world.users.a.admin.id,
      tenantId: tId(),
      providerId: pAId(),
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.integrations.manage"],
      apiScopes: [],
      requestId: "req-test",
      ...over,
    };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-integration/connection-admin.service");
    Admin = mod.ProviderIntegrationConnectionAdmin;
    IntegrationAdminError = mod.IntegrationAdminError;
    Store = (await import("@/server/services/provider-integration/secret-store")).IntegrationSecretStore;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  // ── role / provider / branch ───────────────────────────────────────────────
  it("requires the permission, pins the provider to the context, and guards branch scope", async () => {
    // No permission → forbidden.
    await expect(Admin.create(ctx({ permissions: [] }), { label: "x", connectorType: "HMS_BATCH_V1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });

    // Created connection is pinned to the context's provider (input can't set one).
    const conn = await Admin.create(ctx(), { label: "Aga HMS", connectorType: "HMS_BATCH_V1", mode: "PUSH" });
    expect(conn.providerId).toBe(pAId());
    expect(conn.providerBranchId).toBe("");
    expect(conn.status).toBe("DRAFT");
    expect(conn.hasActiveSecret).toBe(false);

    // A branch the actor does NOT hold → forbidden (anti-widening).
    await expect(Admin.create(ctx({ allowedProviderBranchIds: [] }), { label: "b", connectorType: "C", providerBranchId: world.branches.a1.id }))
      .rejects.toMatchObject({ code: "FORBIDDEN_BRANCH" });

    // A branch-scoped connection is invisible to an actor without that branch.
    const branchConn = await Admin.create(ctx(), { label: "branchy", connectorType: "BR", providerBranchId: world.branches.a2.id });
    await expect(Admin.get(ctx({ allowedProviderBranchIds: [world.branches.a1.id] }), branchConn.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not expose another provider's connection", async () => {
    // Provider B's own connection, created with a B-scoped context.
    const bCtx = ctx({ providerId: world.providers.b.id, actorId: world.users.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
    const bConn = await Admin.create(bCtx, { label: "B conn", connectorType: "HMS_BATCH_V1" });
    // Provider A cannot read it — safe not-found.
    await expect(Admin.get(ctx(), bConn.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── SSRF URL forms ─────────────────────────────────────────────────────────
  it("rejects an unsafe outbound endpoint on a PULL connection", async () => {
    await expect(Admin.create(ctx(), { label: "pull", connectorType: "PULL_C", mode: "PULL", apiBaseUrl: "http://hms.example/api" }))
      .rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(Admin.create(ctx(), { label: "pull2", connectorType: "PULL_C2", mode: "PULL", apiBaseUrl: "https://127.0.0.1/api" }))
      .rejects.toMatchObject({ code: "INVALID_CONFIG" });
    // A public https endpoint is accepted.
    const ok = await Admin.create(ctx(), { label: "pull-ok", connectorType: "PULL_OK", mode: "PULL", apiBaseUrl: "https://hms.aku.edu/api" });
    expect(ok.apiBaseUrl).toBe("https://hms.aku.edu/api");
  });

  // ── secret not returned / logged + rotation/revoke ─────────────────────────
  it("reveals a rotated secret once, never returns/logs it, and revokes the predecessor", async () => {
    const conn = await Admin.create(ctx(), { label: "sec", connectorType: "SEC_C" });

    const r1 = await Admin.rotateSecret(ctx(), conn.id);
    expect(r1.plaintext).toMatch(/^mvxi_/);
    expect(r1.version).toBe(1);
    expect(r1.connection.credentialVersion).toBe(1);
    expect(r1.connection.hasActiveSecret).toBe(true);
    // The view carries NO secret material.
    for (const forbidden of ["plaintext", "secret", "secretHash", "secretRef"]) {
      expect(r1.connection).not.toHaveProperty(forbidden);
    }

    const r2 = await Admin.rotateSecret(ctx(), conn.id);
    expect(r2.version).toBe(2);
    // Rotation revokes the predecessor: the new secret verifies, the old does not.
    expect(await Store.verify(prisma, conn.id, r2.plaintext)).toBe(true);
    expect(await Store.verify(prisma, conn.id, r1.plaintext)).toBe(false);
    // Exactly one ACTIVE secret remains.
    const active = await prisma.providerIntegrationSecret.count({ where: { connectionId: conn.id, status: "ACTIVE" } });
    expect(active).toBe(1);

    // get() never surfaces the material.
    const got = await Admin.get(ctx(), conn.id);
    for (const forbidden of ["plaintext", "secret", "secretHash", "secretRef"]) {
      expect(got).not.toHaveProperty(forbidden);
    }
    expect(got.hasActiveSecret).toBe(true);
    expect(got.credentialVersion).toBe(2);

    // The audit log records the version, never the plaintext.
    const audits = await prisma.auditLog.findMany({ where: { entityId: conn.id, action: "INTEGRATION_CONNECTION:SECRET_ROTATE" } });
    expect(audits.length).toBe(2);
    const safeStringify = (o: unknown) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    for (const a of audits) {
      expect(safeStringify(a)).not.toContain(r1.plaintext);
      expect(safeStringify(a)).not.toContain(r2.plaintext);
    }
  });

  // ── lifecycle + inactive connection rejects delivery ───────────────────────
  it("walks the lifecycle and gates delivery on ACTIVE only", async () => {
    const conn = await Admin.create(ctx(), { label: "life", connectorType: "LIFE_C" });

    // Cannot activate a DRAFT connection (must test first) or one with no secret.
    await expect(Admin.activate(ctx(), conn.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(Admin.test(ctx(), conn.id)).rejects.toMatchObject({ code: "INVALID_CONFIG" }); // no secret yet

    await Admin.rotateSecret(ctx(), conn.id);
    const tested = await Admin.test(ctx(), conn.id);
    expect(tested.status).toBe("TESTING");
    expect(tested.lastSuccessAt).toBeTruthy();

    const active = await Admin.activate(ctx(), conn.id);
    expect(active.status).toBe("ACTIVE");
    expect(() => Admin.assertAcceptsDelivery({ status: "ACTIVE" })).not.toThrow();

    const paused = await Admin.pause(ctx(), conn.id);
    expect(paused.status).toBe("PAUSED");
    // An inactive connection rejects delivery.
    expect(() => Admin.assertAcceptsDelivery(paused)).toThrow(IntegrationAdminError);

    const disabled = await Admin.disable(ctx(), conn.id);
    expect(disabled.status).toBe("DISABLED");
    // DISABLED is terminal.
    await expect(Admin.resume(ctx(), conn.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(() => Admin.assertAcceptsDelivery(disabled)).toThrow();
  });
});
