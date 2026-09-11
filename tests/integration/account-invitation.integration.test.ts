/**
 * Family Hospital UAT plan P05 / §8.3 (invitation oracle) — against a REAL
 * database: transactions, the unique token hash, conditional single use.
 *
 * OPT-IN like the other real-DB suites: runs only when AUTOPILOT_TEST_DB is set
 * and equals DATABASE_URL (a disposable database with every migration applied).
 * Only the mail sender is replaced, so what "was emailed" can be inspected.
 *
 * §8.3: 1 account/persona/branch/invitation are atomic · 2 an SMTP failure
 * leaves one pending account and one failed delivery — not zero accounts and
 * not a false "sent" · 3 resend creates one new token and revokes old unused
 * ones · 4 setup consumes the token once, applies the password policy, clears
 * the pending state and bumps the session version · 5 administrators never see
 * or choose the password · 6 no secret in audit payloads, results or stored
 * plaintext.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const mail = vi.hoisted(() => ({
  outcome: { delivered: true } as { delivered: true } | { delivered: false; failureClass: string },
  sent: [] as Array<{ to: string; subject: string; body: string }>,
}));
vi.mock("@/lib/queue", () => ({
  sendEmailBounded: vi.fn(async (payload: { to: string; subject: string; body: string }) => {
    mail.sent.push(payload);
    return mail.outcome;
  }),
}));

describe.skipIf(!URL_SET)("P05 AccountInvitationService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/server/services/account-invitation.service").AccountInvitationService;
  let hashSetupToken: typeof import("@/server/services/account-invitation.service").hashSetupToken;
  let AccessSvc: typeof import("@/server/services/provider-access.service").ProviderAccessService;
  let world: import("../factories/provider-network").ProviderWorld;
  let adminCtx: import("@/server/services/provider-access.service").ProviderAccessContext;
  let facilityAdminCtx: import("@/server/services/provider-access.service").ProviderAccessContext;
  let tenantId: string;
  const createdEmails: string[] = [];
  const email = (tag: string) => {
    const e = `${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@invitee.test`;
    createdEmails.push(e);
    return e;
  };
  const tokenFrom = (body: string) => /#token=([A-Za-z0-9_-]{43})/.exec(body)?.[1] ?? null;
  // AuditLog carries a BigInt column; JSON.stringify needs telling what to do with it.
  const text = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://portal.example.test";
    prisma = (await import("@/lib/prisma")).prisma;
    ({ AccountInvitationService: svc, hashSetupToken } = await import("@/server/services/account-invitation.service"));
    AccessSvc = (await import("@/server/services/provider-access.service")).ProviderAccessService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    const { seedRbac } = await import("@/../prisma/seeds/rbac");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
    await seedRbac(prisma, tenantId);
    const grant = async (userId: string, code: string) => {
      const role = await prisma.role.findFirstOrThrow({ where: { tenantId, code } });
      await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id, tenantId, isActive: true, status: "ACTIVE", makerId: userId, checkerId: userId } });
    };
    await grant(world.users.a.admin.id, "PROVIDER_ADMIN");
    await grant(world.users.a.finance.id, "PROVIDER_FACILITY_ADMIN");
    // The administrators can act at branch A1 only.
    for (const u of [world.users.a.admin.id, world.users.a.finance.id]) {
      await prisma.providerUserBranchAssignment.create({ data: { tenantId, providerId: world.providers.a.id, userId: u, providerBranchId: world.branches.a1.id, createdBy: u } });
    }
    adminCtx = await AccessSvc.buildUserContext({ userId: world.users.a.admin.id, tenantId, providerId: world.providers.a.id });
    facilityAdminCtx = await AccessSvc.buildUserContext({ userId: world.users.a.finance.id, tenantId, providerId: world.providers.a.id });
  });

  afterAll(async () => {
    if (!world) return;
    const tIds = [world.tenants.alpha.id, world.tenants.beta.id];
    const created = await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } });
    const ids = created.map((u) => u.id);
    await prisma.accountSetupInvitation.deleteMany({ where: { tenantId: { in: tIds } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.providerUserBranchAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId: { in: tIds } } } });
    await prisma.role.deleteMany({ where: { tenantId: { in: tIds } } });
    await world.teardown();
  });

  beforeEach(() => {
    mail.outcome = { delivered: true };
    mail.sent = [];
  });

  it("creates account, persona, branch and invitation together; mails a fragment link; stores only a hash", async () => {
    const to = email("biller");
    const res = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to, firstName: "Grace", lastName: "Akello", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id], providerId: world.providers.b.id });
    expect(res).toMatchObject({ ok: true, delivery: "SENT" });
    if (!res.ok) return;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId }, select: { providerId: true, role: true, mustChangePassword: true, isActive: true, passwordHash: true } });
    expect(user).toMatchObject({ providerId: world.providers.a.id, role: "PROVIDER_USER", mustChangePassword: true, isActive: true }); // the actor's provider, not the posted one
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const roles = await prisma.userRoleAssignment.findMany({ where: { userId: res.userId, status: "ACTIVE" }, select: { role: { select: { code: true } } } });
    expect(roles.map((r) => r.role.code)).toEqual(["PROVIDER_BILLER"]);
    const branches = await prisma.providerUserBranchAssignment.findMany({ where: { userId: res.userId, activeTo: null }, select: { providerBranchId: true } });
    expect(branches.map((b) => b.providerBranchId)).toEqual([world.branches.a1.id]);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(to);
    const token = tokenFrom(mail.sent[0].body);
    expect(mail.sent[0].body).toContain(`https://portal.example.test/account-setup#token=${token}`);
    expect(mail.sent[0].body).not.toMatch(/password:|temporary/i);
    const inv = await prisma.accountSetupInvitation.findUniqueOrThrow({ where: { id: res.invitationId } });
    expect(inv.tokenHash).toBe(hashSetupToken(token!));
    expect(inv.tokenHash).not.toContain(token!);
    expect(inv).toMatchObject({ deliveryStatus: "SENT", deliveryAttempts: 1, issuedVia: "INVITE", invitedById: adminCtx.actorId, providerId: world.providers.a.id });
    expect(inv.expiresAt.getTime() - inv.createdAt.getTime()).toBeGreaterThan(23.9 * 3600_000);

    // No secret anywhere in the audit trail or the result.
    const audit = await prisma.auditLog.findMany({ where: { entityId: res.userId } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["USER_INVITED", "ACCOUNT_SETUP_LINK_SENT"]));
    const auditText = text(audit);
    expect(auditText).not.toContain(token!);
    expect(auditText).not.toContain(to);
    expect(JSON.stringify(res)).not.toContain(token!);
  });

  it("an SMTP failure leaves one pending account and one FAILED delivery — reported as such", async () => {
    mail.outcome = { delivered: false, failureClass: "CONFIG" };
    const to = email("frontdesk");
    const res = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to, firstName: "Linet", lastName: "Akampa", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_FRONT_DESK", providerBranchIds: [world.branches.a1.id] });
    expect(res).toMatchObject({ ok: true, delivery: "FAILED", failureClass: "CONFIG", message: "User created; invitation delivery failed — resend." });
    expect(await prisma.user.count({ where: { email: to, tenantId } })).toBe(1);
    const invs = await prisma.accountSetupInvitation.findMany({ where: { user: { email: to } } });
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({ deliveryStatus: "FAILED", failureClass: "CONFIG", deliveredAt: null });
  });

  it("resend: one new token, every older unused one revoked, the account's secret replaced", async () => {
    const to = email("resend");
    const first = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to, firstName: "A", lastName: "B", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_CLINICIAN", providerBranchIds: [world.branches.a1.id] });
    if (!first.ok) throw new Error(first.message);
    const oldToken = tokenFrom(mail.sent[0].body)!;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: first.userId }, select: { passwordHash: true, sessionVersion: true } });

    const again = await svc.resend({ kind: "PROVIDER", ctx: adminCtx }, first.userId);
    expect(again).toMatchObject({ ok: true, delivery: "SENT" });
    const newToken = tokenFrom(mail.sent[1].body)!;
    expect(newToken).not.toBe(oldToken);

    const invs = await prisma.accountSetupInvitation.findMany({ where: { userId: first.userId }, orderBy: { createdAt: "asc" } });
    expect(invs).toHaveLength(2);
    expect(invs[0]).toMatchObject({ revokedReason: "SUPERSEDED" });
    expect(invs[1]).toMatchObject({ revokedAt: null, issuedVia: "RESEND" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: first.userId }, select: { passwordHash: true, sessionVersion: true } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await svc.checkToken(oldToken)).toBe(false);
    expect(await svc.checkToken(newToken)).toBe(true);
  });

  it("setup consumes the token once, applies the policy, clears the pending state and bumps the session", async () => {
    const to = email("setup");
    const res = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to, firstName: "S", lastName: "U", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    if (!res.ok) throw new Error(res.message);
    const token = tokenFrom(mail.sent[0].body)!;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: res.userId }, select: { sessionVersion: true } });

    expect(await svc.completeSetup(token, "short", "short")).toMatchObject({ ok: false, code: "PASSWORD" });
    expect(await svc.completeSetup(token, "Correct-Horse-7", "Correct-Horse-8")).toMatchObject({ ok: false, code: "PASSWORD" });
    expect(await svc.completeSetup(token, "Correct-Horse-7", "Correct-Horse-7")).toEqual({ ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId }, select: { mustChangePassword: true, sessionVersion: true, passwordHash: true } });
    expect(user.mustChangePassword).toBe(false);
    expect(user.sessionVersion).toBe(before.sessionVersion + 1);
    const bcrypt = (await import("bcryptjs")).default;
    expect(await bcrypt.compare("Correct-Horse-7", user.passwordHash)).toBe(true);

    // Replay: the same safe answer.
    expect(await svc.completeSetup(token, "Another-Pass-9", "Another-Pass-9")).toMatchObject({ ok: false, code: "INVALID_LINK" });
    expect(await svc.checkToken(token)).toBe(false);
    const audit = await prisma.auditLog.findMany({ where: { entityId: res.userId, action: "ACCOUNT_SETUP_COMPLETED" } });
    expect(audit).toHaveLength(1);
    expect(text(audit)).not.toMatch(/Correct-Horse|Another-Pass/);
  });

  it("expired, altered and suspended-account links all get the same safe answer", async () => {
    const to = email("expired");
    const res = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to, firstName: "E", lastName: "X", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    if (!res.ok) throw new Error(res.message);
    const token = tokenFrom(mail.sent[0].body)!;
    const altered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(await svc.completeSetup(altered, "Correct-Horse-7", "Correct-Horse-7")).toMatchObject({ ok: false, code: "INVALID_LINK" });

    await prisma.user.update({ where: { id: res.userId }, data: { isActive: false } });
    expect(await svc.checkToken(token)).toBe(false);
    await prisma.user.update({ where: { id: res.userId }, data: { isActive: true } });
    expect(await svc.checkToken(token)).toBe(true);

    await prisma.accountSetupInvitation.update({ where: { id: res.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await svc.completeSetup(token, "Correct-Horse-7", "Correct-Horse-7")).toMatchObject({ ok: false, code: "INVALID_LINK" });
  });

  it("a provider administrator cannot grant a stronger persona, another facility's branch or a branch they lack", async () => {
    const base = { firstName: "N", lastName: "O", role: "PROVIDER_USER" as const };
    expect(await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { ...base, email: email("fa"), providerRoleCode: "PROVIDER_FACILITY_ADMIN", providerBranchIds: [world.branches.a1.id] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { ...base, email: email("ia"), providerRoleCode: "PROVIDER_INTEGRATION_ADMIN", providerBranchIds: [world.branches.a1.id] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { ...base, email: email("a2"), providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a2.id] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { ...base, email: email("b1"), providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.b1.id] })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { ...base, email: email("tpa"), role: "CLAIMS_OFFICER" as never, providerRoleCode: null })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    // Another Admin (same administrative access) is allowed; a Facility Admin may grant Facility Admin.
    expect(await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { ...base, email: email("adm"), providerRoleCode: "PROVIDER_ADMIN", providerBranchIds: [world.branches.a1.id] })).toMatchObject({ ok: true });
    expect(await svc.invite({ kind: "PROVIDER", ctx: facilityAdminCtx }, { ...base, email: email("fa2"), providerRoleCode: "PROVIDER_FACILITY_ADMIN", providerBranchIds: [world.branches.a1.id] })).toMatchObject({ ok: true });
  });

  it("an address already in use: useful inside the provider, silent about anyone else", async () => {
    const to = email("dupe");
    const first = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to, firstName: "D", lastName: "U", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    if (!first.ok) throw new Error(first.message);
    const again = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: to.toUpperCase(), firstName: "D", lastName: "U", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    expect(again).toMatchObject({ ok: false, code: "EXISTS", existing: { userId: first.userId, canResend: true } });
    // Provider B's biller exists in this tenant — provider A learns nothing about it.
    const other = await svc.invite({ kind: "PROVIDER", ctx: adminCtx }, { email: world.users.b.email, firstName: "X", lastName: "Y", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    expect(other).toMatchObject({ ok: false, code: "EXISTS" });
    expect(other).not.toHaveProperty("existing");
    // …and cannot resend to it.
    expect(await svc.resend({ kind: "PROVIDER", ctx: adminCtx }, world.users.b.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("resends are limited per account", async () => {
    const to = email("limit");
    const first = await svc.invite({ kind: "PROVIDER", ctx: facilityAdminCtx }, { email: to, firstName: "L", lastName: "M", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    if (!first.ok) throw new Error(first.message);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await svc.resend({ kind: "PROVIDER", ctx: facilityAdminCtx }, first.userId));
    expect(results.filter((r) => r.ok)).toHaveLength(4); // 1 invite + 4 resends = 5 per hour
    expect(results.at(-1)).toMatchObject({ ok: false, code: "THROTTLED" });
  });

  it("self-service: a new link only for an invited, not-yet-set-up account — and the same silence otherwise", async () => {
    const to = email("self");
    const res = await svc.invite({ kind: "PROVIDER", ctx: facilityAdminCtx }, { email: to, firstName: "Q", lastName: "R", role: "PROVIDER_USER", providerRoleCode: "PROVIDER_BILLER", providerBranchIds: [world.branches.a1.id] });
    if (!res.ok) throw new Error(res.message);
    mail.sent = [];
    await expect(svc.requestNewLink(to)).resolves.toBeUndefined();
    expect(mail.sent).toHaveLength(1);
    const latest = await prisma.accountSetupInvitation.findFirstOrThrow({ where: { userId: res.userId }, orderBy: { createdAt: "desc" } });
    expect(latest).toMatchObject({ issuedVia: "SELF_SERVICE", invitedById: null });

    mail.sent = [];
    // An account from the old temporary-password process (never set up, no invitation) is
    // re-invited only by an administrator, deliberately.
    await prisma.user.update({ where: { id: world.users.a.biller.id }, data: { mustChangePassword: true } });
    await expect(svc.requestNewLink(world.users.a.biller.email)).resolves.toBeUndefined();
    await expect(svc.requestNewLink("nobody@nowhere.test")).resolves.toBeUndefined();
    expect(mail.sent).toHaveLength(0);
  });
});
