/**
 * F7.5 — sensitive bank-change verification + activation (opt-in DB).
 *
 * Builds on the F7.4 bank flow (maker → checker → APPROVED). Covers the package
 * acceptance: the requester/maker cannot self-verify (independent verify), an
 * unverified or near-payment change cannot activate (blocked/escalated), the full
 * account never appears anywhere, and effective-date + concurrent activation are
 * controlled. The full account is masked at F7.4 submit, so it never reaches this
 * layer — verification stores a method + a safe out-of-band reference only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const FULL_ACCOUNT = "44443333"; // the "full" number a provider would submit — must never persist/leak

describe.skipIf(!URL_SET)("F7.5 bank-change verification + activation (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-master-data-change/service").ProviderMasterDataChangeService;
  let VERIFY_CAP: string;
  let ACTIVATE_CAP: string;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  type Reviewer = import("@/server/services/provider-master-data-change/service").MasterDataReviewer;
  type BankActor = import("@/server/services/provider-master-data-change/service").BankChangeActor;

  const ctxA = (over: Partial<Ctx> = {}): Ctx => ({
    actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id], permissions: ["provider.profile.change_request"], apiScopes: [], requestId: "t", ...over,
  });
  const rev = (userId: string): Reviewer => ({ userId, tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN" });
  const bankActor = (userId: string, caps: string[]): BankActor => ({ userId, tenantId: world.tenants.alpha.id, permissions: caps });

  let requesterId: string, makerId: string, checkerId: string, verifierId: string, activatorId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-master-data-change/service");
    Svc = mod.ProviderMasterDataChangeService;
    VERIFY_CAP = mod.BANK_CHANGE_VERIFY_CAP;
    ACTIVATE_CAP = mod.BANK_CHANGE_ACTIVATE_CAP;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    requesterId = world.users.a.admin.id;
    makerId = world.users.a.finance.id;
    checkerId = world.users.a.clinician.id;
    verifierId = world.users.a.biller.id;
    activatorId = world.users.a.integration.id;
  });
  afterAll(async () => { if (world) await world.teardown(); });

  /** Submit a bank change and drive it through the F7.4 maker/checker to APPROVED. */
  async function reachApproved(key: string): Promise<{ id: string; version: number }> {
    const sub = await Svc.submit(ctxA(), { category: "BANK", proposed: { bankName: "DTB", accountNumber: FULL_ACCOUNT }, evidenceDocumentIds: ["doc-b"], idempotencyKey: key });
    const r1 = await Svc.startReview(rev(makerId), sub.id, sub.version);
    const r2 = await Svc.approve(rev(makerId), sub.id, r1.version); // maker → PENDING_CHECKER
    const r3 = await Svc.approve(rev(checkerId), sub.id, r2.version); // checker → APPROVED
    return { id: sub.id, version: r3.version };
  }

  it("independent verify: without the cap, or as the maker/requester, verify is FORBIDDEN; a distinct capable verifier succeeds", async () => {
    const { id, version } = await reachApproved("bk-verify-1");
    // no cap
    await expect(Svc.verifyBankChange(bankActor(verifierId, []), id, version, { method: "PHONE_CALLBACK", reference: "CALL-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // the maker cannot self-verify (even holding the cap)
    await expect(Svc.verifyBankChange(bankActor(makerId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "CALL-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // the requester cannot verify their own change
    await expect(Svc.verifyBankChange(bankActor(requesterId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "CALL-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // an independent capable verifier succeeds
    const v = await Svc.verifyBankChange(bankActor(verifierId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "CALL-1" });
    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id }, select: { verifiedAt: true, verifiedById: true, verificationMethod: true } });
    expect(row.verifiedAt).not.toBeNull();
    expect(row.verifiedById).toBe(verifierId);
    expect(row.verificationMethod).toBe("PHONE_CALLBACK");
    expect(v.version).toBeGreaterThan(version);
  });

  it("an UNVERIFIED approved change cannot be activated", async () => {
    const { id, version } = await reachApproved("bk-unverified-1");
    await expect(Svc.activateBankChange(bankActor(activatorId, [ACTIVATE_CAP]), id, version)).rejects.toMatchObject({ code: "UNVERIFIED" });
  });

  it("a near-payment change is FROZEN + escalated and does not activate", async () => {
    const { id, version } = await reachApproved("bk-frozen-1");
    const v = await Svc.verifyBankChange(bankActor(verifierId, [VERIFY_CAP]), id, version, { method: "BANK_LETTER", reference: "REF-F" });
    // inject a frozen payment window
    await expect(Svc.activateBankChange(bankActor(activatorId, [ACTIVATE_CAP]), id, v.version, {}, { paymentWindow: async () => true })).rejects.toMatchObject({ code: "FROZEN" });
    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id }, select: { activatedAt: true } });
    expect(row.activatedAt).toBeNull();
    const frozenEvent = await prisma.providerMasterDataChangeEvent.findFirst({ where: { changeRequestId: id, eventType: "ACTIVATION_FROZEN" } });
    expect(frozenEvent).not.toBeNull();
    expect(frozenEvent!.audience).toBe("INTERNAL");
  });

  it("the DEFAULT payment-window check freezes when a settlement batch is about to pay", async () => {
    // an imminent (MAKER_SUBMITTED) batch for provider A
    await world.createSettlementBatch({ providerId: world.providers.a.id, status: "MAKER_SUBMITTED", claims: [{ billed: 100, approved: 100, lines: [{ billed: 100, approved: 100 }] }] });
    const { id, version } = await reachApproved("bk-default-freeze-1");
    const v = await Svc.verifyBankChange(bankActor(verifierId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "REF-D" });
    await expect(Svc.activateBankChange(bankActor(activatorId, [ACTIVATE_CAP]), id, v.version)).rejects.toMatchObject({ code: "FROZEN" });
  });

  it("verified + clear window: activates via the destination owner, sets the effective date, and never exposes the full account", async () => {
    const before = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { bankDetailsRef: true } });
    const { id, version } = await reachApproved("bk-activate-1");
    const v = await Svc.verifyBankChange(bankActor(verifierId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "VERIFIED-REF-9" });
    const eff = new Date("2026-09-01T00:00:00.000Z");
    const act = await Svc.activateBankChange(bankActor(activatorId, [ACTIVATE_CAP]), id, v.version, { effectiveAt: eff }, { paymentWindow: async () => false });
    expect(act.status).toBe("APPROVED");

    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id }, include: { events: true } });
    expect(row.activatedAt).not.toBeNull();
    expect(row.activatedById).toBe(activatorId);
    expect(row.effectiveAt?.toISOString()).toBe(eff.toISOString());
    // canonical destination now points at the verified reference (no account plaintext)
    const provider = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { bankDetailsRef: true } });
    expect(provider.bankDetailsRef).toBe("VERIFIED-REF-9");
    expect(provider.bankDetailsRef).not.toBe(before.bankDetailsRef);
    // the full account appears NOWHERE on the request or its events
    expect(JSON.stringify(row)).not.toContain(FULL_ACCOUNT);
  });

  it("activate requires the activate capability", async () => {
    const { id, version } = await reachApproved("bk-cap-1");
    const v = await Svc.verifyBankChange(bankActor(verifierId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "REF-C" });
    await expect(Svc.activateBankChange(bankActor(activatorId, [VERIFY_CAP]), id, v.version, {}, { paymentWindow: async () => false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("concurrent activation of the same change ⇒ exactly one succeeds", async () => {
    const { id, version } = await reachApproved("bk-concurrent-1");
    const v = await Svc.verifyBankChange(bankActor(verifierId, [VERIFY_CAP]), id, version, { method: "PHONE_CALLBACK", reference: "REF-CC" });
    const deps = { paymentWindow: async () => false };
    const results = await Promise.allSettled([
      Svc.activateBankChange(bankActor(activatorId, [ACTIVATE_CAP]), id, v.version, {}, deps),
      Svc.activateBankChange(bankActor(activatorId, [ACTIVATE_CAP]), id, v.version, {}, deps),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1);
    const row = await prisma.providerMasterDataChangeRequest.findUniqueOrThrow({ where: { id }, select: { activatedAt: true } });
    expect(row.activatedAt).not.toBeNull();
  });
});
