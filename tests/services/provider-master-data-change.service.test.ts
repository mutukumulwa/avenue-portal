/**
 * F7.4 — ProviderMasterDataChangeService (opt-in DB).
 *
 * Covers the package acceptance: a disallowed field / cross-provider scope is
 * refused; evidence + the state transitions; an approved safe change is applied
 * to the canonical record EXACTLY once (and the original is unchanged before
 * approval); a sensitive (bank) change needs maker ≠ checker and is NOT activated
 * here; INTERNAL vs SHARED events are separated (the provider never sees the
 * maker step or the internal note).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F7.4 ProviderMasterDataChangeService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-master-data-change/service").ProviderMasterDataChangeService;
  let MDErr: typeof import("@/server/services/provider-master-data-change/service").MasterDataChangeError;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  type Reviewer = import("@/server/services/provider-master-data-change/service").MasterDataReviewer;

  function ctxA(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id], permissions: ["provider.profile.change_request"], apiScopes: [], requestId: "t",
      ...over,
    };
  }
  const ctxB = (): Ctx => ctxA({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
  // Reviewers reuse two DISTINCT world users; the service trusts the passed role (the page gates it).
  const maker = (): Reviewer => ({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN" });
  const checker = (): Reviewer => ({ userId: world.users.a.finance.id, tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN" });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-master-data-change/service");
    Svc = mod.ProviderMasterDataChangeService;
    MDErr = mod.MasterDataChangeError;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    world = await buildWorld();
  });
  async function buildWorld() {
    const { buildProviderWorld } = await import("../factories/provider-network");
    return buildProviderWorld(prisma);
  }
  afterAll(async () => { if (world) await world.teardown(); });

  // ── submit validation + scope ──────────────────────────────────────────────
  it("rejects a field that is not allow-listed for the category", async () => {
    await expect(Svc.submit(ctxA(), { category: "CONTACT", proposed: { phone: "0700", tier: "GOLD" } })).rejects.toMatchObject({ code: "INVALID" });
  });
  it("requires provider.profile.change_request", async () => {
    await expect(Svc.submit(ctxA({ permissions: [] }), { category: "CONTACT", proposed: { phone: "0700" } })).rejects.toBeInstanceOf(ProviderAccessError);
  });
  it("BANK requires evidence and is HIGH risk", async () => {
    await expect(Svc.submit(ctxA(), { category: "BANK", proposed: { bankName: "KCB", accountNumber: "12345678" } })).rejects.toMatchObject({ code: "INVALID" });
    const r = await Svc.submit(ctxA(), { category: "BANK", proposed: { bankName: "KCB", accountNumber: "12345678" }, evidenceDocumentIds: ["doc-1"] });
    expect(r.riskLevel).toBe("HIGH");
    expect(r.status).toBe("SUBMITTED");
  });
  it("stores the MASKED proposed value (full account never persists)", async () => {
    const r = await Svc.submit(ctxA(), { category: "BANK", proposed: { bankName: "Equity", accountNumber: "99998888" }, evidenceDocumentIds: ["doc-9"], idempotencyKey: "mask-1" });
    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id: r.id }, select: { proposedValues: true } });
    expect(JSON.stringify(row.proposedValues)).not.toContain("99998888");
    expect((row.proposedValues as Record<string, string>).accountNumber).toBe("••••8888");
  });
  it("is idempotent on idempotencyKey", async () => {
    const a = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { email: "a@b.co" }, idempotencyKey: "idem-1" });
    const b = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { email: "a@b.co" }, idempotencyKey: "idem-1" });
    expect(b.id).toBe(a.id);
    expect(b.replayed).toBe(true);
  });
  it("a branch change is scoped to the caller's provider (another provider's branch ⇒ NOT_FOUND)", async () => {
    await expect(Svc.submit(ctxA(), { category: "BRANCH", proposed: { name: "New Wing" }, providerBranchId: world.branches.b1.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── approve applies once; original unchanged before approval ────────────────
  it("a safe CONTACT change is applied to the provider EXACTLY once, and not before approval", async () => {
    const before = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { phone: true } });
    const sub = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { phone: "0700999111" }, idempotencyKey: "apply-1" });

    // original unchanged while the request is open
    const during = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { phone: true } });
    expect(during.phone).toBe(before.phone);

    const rev1 = await Svc.startReview(maker(), sub.id, sub.version);
    const approved = await Svc.approve(maker(), sub.id, rev1.version);
    expect(approved.status).toBe("APPROVED");

    const after = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { phone: true } });
    expect(after.phone).toBe("0700999111");

    // a second approval at the stale version cannot re-apply
    await expect(Svc.approve(maker(), sub.id, rev1.version)).rejects.toMatchObject({ code: expect.stringMatching(/STALE|INVALID_STATE/) });
    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id: sub.id }, select: { activatedAt: true } });
    expect(row.activatedAt).not.toBeNull();
  });

  it("full lifecycle: request info → provider responds → approve", async () => {
    const sub = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { email: "ops@aku.test" }, idempotencyKey: "life-1" });
    const info = await Svc.requestInformation(maker(), sub.id, sub.version, "Please confirm the new inbox owner.");
    expect(info.status).toBe("INFORMATION_REQUIRED");
    const resp = await Svc.respondToInformation(ctxA(), sub.id, info.version, "Confirmed — finance@aku.test.");
    expect(resp.status).toBe("PROVIDER_RESPONDED");
    const done = await Svc.approve(maker(), sub.id, resp.version);
    expect(done.status).toBe("APPROVED");
  });

  it("reject leaves the master data unchanged", async () => {
    const before = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { email: true } });
    const sub = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { email: "should-not-apply@x.test" }, idempotencyKey: "rej-1" });
    const rev1 = await Svc.startReview(maker(), sub.id, sub.version);
    const rej = await Svc.reject(maker(), sub.id, rev1.version, { explanation: "Use the official domain." });
    expect(rej.status).toBe("REJECTED");
    const after = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { email: true } });
    expect(after.email).toBe(before.email);
  });

  // ── maker ≠ checker for a sensitive (bank) change; not activated here ────────
  it("a bank change needs a distinct maker + checker and is NOT activated in F7.4", async () => {
    const bankBefore = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { bankDetailsRef: true } });
    const sub = await Svc.submit(ctxA(), { category: "BANK", proposed: { bankName: "DTB", accountNumber: "44443333" }, evidenceDocumentIds: ["doc-b"], idempotencyKey: "bank-1" });
    const rev1 = await Svc.startReview(maker(), sub.id, sub.version);

    const makerStep = await Svc.approve(maker(), sub.id, rev1.version);
    expect(makerStep.status).toBe("PENDING_CHECKER");

    // the same reviewer cannot also be the checker
    await expect(Svc.approve(maker(), sub.id, makerStep.version)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const checkerStep = await Svc.approve(checker(), sub.id, makerStep.version, { explanation: "Verified letterhead." });
    expect(checkerStep.status).toBe("APPROVED");

    // NOT activated — the bank reference is unchanged and activation/verification are null (F7.5).
    const bankAfter = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { bankDetailsRef: true } });
    expect(bankAfter.bankDetailsRef).toBe(bankBefore.bankDetailsRef);
    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id: sub.id }, select: { activatedAt: true, verifiedAt: true, makerId: true, checkerId: true } });
    expect(row.activatedAt).toBeNull();
    expect(row.verifiedAt).toBeNull();
    expect(row.makerId).toBe(world.users.a.admin.id);
    expect(row.checkerId).toBe(world.users.a.finance.id);
  });

  // ── INTERNAL vs SHARED separation ───────────────────────────────────────────
  it("the maker step is INTERNAL; the provider view never shows it or the internal note", async () => {
    const sub = await Svc.submit(ctxA(), { category: "BANK", proposed: { bankName: "NCBA", accountNumber: "77776666" }, evidenceDocumentIds: ["doc-i"], idempotencyKey: "sep-1" });
    const rev1 = await Svc.startReview(maker(), sub.id, sub.version);
    const makerStep = await Svc.approve(maker(), sub.id, rev1.version);
    await Svc.approve(checker(), sub.id, makerStep.version, { explanation: "OK", internalNote: "cross-checked against the bank letter #55" });

    // reviewer sees every event incl. the INTERNAL maker approval
    const forReviewer = await Svc.getForReviewer(maker(), sub.id);
    const evTypes = forReviewer!.events.map((e) => e.eventType);
    expect(evTypes).toContain("MAKER_APPROVED");
    expect(forReviewer!.events.find((e) => e.eventType === "MAKER_APPROVED")!.audience).toBe("INTERNAL");

    // provider sees SHARED events only — never the maker step or the internal note
    const forProvider = await Svc.getForProvider(ctxA(), sub.id);
    const provEvTypes = forProvider!.request.timeline.map((t) => t.eventType);
    expect(provEvTypes).not.toContain("MAKER_APPROVED");
    expect(JSON.stringify(forProvider)).not.toContain("cross-checked against the bank letter");
  });

  // ── scope + role gates ──────────────────────────────────────────────────────
  it("provider cannot read another provider's change request (non-enumerating)", async () => {
    const sub = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { phone: "0711000000" }, idempotencyKey: "scope-1" });
    expect(await Svc.getForProvider(ctxB(), sub.id)).toBeNull();
  });
  it("review requires an operator role", async () => {
    const sub = await Svc.submit(ctxA(), { category: "CONTACT", proposed: { phone: "0722000000" }, idempotencyKey: "role-1" });
    await expect(Svc.startReview({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role: "PROVIDER_USER" }, sub.id, sub.version)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
