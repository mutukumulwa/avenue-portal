/**
 * Claims Autopilot F5.1 — direct-entry rail convergence REAL-DB proof.
 *
 * The admin wizard AND the provider portal now route through the canonical
 * `ClaimIntakeService` via `runClaimIntake`. Proves: admin+provider normalize
 * identically (distinct channels, one canonical shape); the form draft UUID makes
 * a double-click / refresh replay one claim; a provider cannot spoof another
 * facility (D12); a business-gate failure is accepted-and-routed while a
 * structural one is rejected at the door (D6); and an accepted claim is processed
 * in-request (D9). Also empirically de-risks provider member-entitlement scoping.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runClaimIntake, type ClaimIntakeInput, type DirectEntryCaller } from "@/server/services/claim-intake";
import { ClaimDecisionService } from "@/server/services/claim-decision.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.1 integration — admin & provider direct-entry converge on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, otherProviderId: string, memberId: string, systemActorId: string;
  const createdClaimIds: string[] = [];
  let seq = 0;

  const key = () => `f51-${Date.now()}-${(seq += 1)}`;
  const claimInput = (over: Partial<ClaimIntakeInput> = {}): ClaimIntakeInput => ({
    memberId,
    providerId,
    serviceType: "OUTPATIENT",
    benefitCategory: "OUTPATIENT",
    dateOfService: "2026-06-10",
    diagnoses: [{ code: "J06.9", description: "Acute URI", standardCharge: null, isPrimary: true }],
    lineItems: [{ serviceCategory: "CONSULTATION", cptCode: "99213", description: "GP consult", icdCode: "J06.9", quantity: 1, unitCost: 3000, billedAmount: 3000 }],
    ...over,
  });
  const operator = (): DirectEntryCaller => ({ kind: "operatorUser", tenantId, userId: systemActorId });
  const provider = (pid = providerId): DirectEntryCaller => ({ kind: "providerUser", tenantId, userId: systemActorId, providerId: pid });

  async function claimOf(id: string) {
    return prisma.claim.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, source: true, billedAmount: true, benefitCategory: true, dateOfService: true, processingState: true, approvedAmount: true, claimLines: { select: { id: true } } },
    });
  }
  async function receiptChannelFor(claimId: string): Promise<string | null> {
    const r = await prisma.claimIntakeReceipt.findFirst({ where: { claimId }, select: { channel: true } });
    return r?.channel ?? null;
  }
  const track = (o: Awaited<ReturnType<typeof runClaimIntake>>) => { if (o.ok && o.claimId) createdClaimIds.push(o.claimId); return o; };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    systemActorId = await getSystemActorId(tenantId);
    // The provider PORTAL resolves members tenant-wide (F5.1 decoupled member
    // entitlement from provider derivation), so any ACTIVE provider + member pair
    // exercises the rail — no ContractApplicability seeding required.
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true } })).id;
    otherProviderId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE", id: { not: providerId } }, select: { id: true } })).id;
    memberId = (await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Money-decided claims void through the decision service (reverses postings);
    // undecided ones just flip to VOID (nothing to reverse) so no fixture pool or
    // duplicate scan ever sees them again.
    for (const id of createdClaimIds) await ClaimDecisionService.voidClaim(tenantId, id, { actorId: systemActorId, reason: "F5.1 cleanup" }).catch(() => undefined);
    await prisma.claim.updateMany({ where: { id: { in: createdClaimIds }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    // Remove this file's processing artifacts (stages → runs → receipts, FK order)
    // so later fixture pools never see canonical-intake leftovers.
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: createdClaimIds } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: createdClaimIds } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { startsWith: "f51-" } } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("admin and provider submissions of the same claim normalize identically but record distinct channels", async () => {
    const adminOut = track(await runClaimIntake(operator(), claimInput(), { idempotencyKey: key() }));
    const providerOut = track(await runClaimIntake(provider(), claimInput(), { idempotencyKey: key() }));
    expect(adminOut.ok).toBe(true);
    expect(providerOut.ok).toBe(true); // ← proves the provider is entitled to the member

    const a = await claimOf((adminOut as { claimId: string }).claimId);
    const b = await claimOf((providerOut as { claimId: string }).claimId);
    expect(a.id).not.toBe(b.id); // two distinct claims
    expect(String(a.billedAmount)).toBe(String(b.billedAmount)); // identical canonical money
    expect(a.billedAmount).toEqual(b.billedAmount);
    expect(a.claimLines.length).toBe(b.claimLines.length);
    expect(a.dateOfService.toISOString()).toBe(b.dateOfService.toISOString());
    expect(a.benefitCategory).toBe(b.benefitCategory);
    expect(a.source).toBe("MANUAL");
    expect(b.source).toBe("MANUAL");
    expect(await receiptChannelFor(a.id)).toBe("ADMIN_PORTAL");
    expect(await receiptChannelFor(b.id)).toBe("PROVIDER_PORTAL");
  });

  it("processes an accepted claim in-request (D9) — not left stuck in PENDING", async () => {
    const out = track(await runClaimIntake(operator(), claimInput(), { idempotencyKey: key() }));
    expect(out.ok).toBe(true);
    const claim = await claimOf((out as { claimId: string }).claimId);
    // Inline processing ran → the run reached a terminal processingState.
    expect(claim.processingState).not.toBeNull();
    const run = await prisma.claimProcessingRun.findFirstOrThrow({ where: { claimId: claim.id }, select: { state: true } });
    expect(["ROUTED", "SHADOW_COMPLETE", "AUTO_DECIDED", "FAILED"]).toContain(run.state);
  });

  it("the form draft UUID makes a double-click / refresh replay ONE claim", async () => {
    const k = key();
    const data = claimInput();
    const first = track(await runClaimIntake(operator(), data, { idempotencyKey: k }));
    const second = await runClaimIntake(operator(), data, { idempotencyKey: k }); // same key + content
    expect(first.ok && second.ok).toBe(true);
    expect((second as { claimId: string }).claimId).toBe((first as { claimId: string }).claimId);
    expect((second as { replayed: boolean }).replayed).toBe(true);
    // Exactly one receipt reserved for the key, bound to the one claim (no duplicate).
    const receipts = await prisma.claimIntakeReceipt.findMany({ where: { tenantId, idempotencyKey: k }, select: { claimId: true } });
    expect(receipts.length).toBe(1);
    expect(receipts[0].claimId).toBe((first as { claimId: string }).claimId);
  });

  it("a provider cannot file against another facility (D12 spoof guard)", async () => {
    // providerUser authenticated as `providerId`, but the submission names `otherProviderId`.
    const out = await runClaimIntake(provider(providerId), claimInput({ providerId: otherProviderId }), { idempotencyKey: key() });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/does not match the authenticated provider|not permitted/i);
  });

  it("a business-gate failure is ACCEPTED and ROUTED, moving no money (D6)", async () => {
    // Inpatient with no pre-authorization: previously thrown; now recorded + routed.
    const out = track(await runClaimIntake(operator(), claimInput({ serviceType: "INPATIENT", benefitCategory: "INPATIENT" }), { idempotencyKey: key() }));
    expect(out.ok).toBe(true); // a claim exists — proof of receipt (D6)
    const claim = await claimOf((out as { claimId: string }).claimId);
    expect(["APPROVED", "PARTIALLY_APPROVED"]).not.toContain(claim.status); // no money moved
    expect(Number(claim.approvedAmount ?? 0)).toBe(0);
    expect(claim.processingState).not.toBeNull(); // it was routed, not thrown away
  });

  it("a structural failure (future service date) is rejected at the door", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const out = await runClaimIntake(operator(), claimInput({ dateOfService: future }), { idempotencyKey: key() });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/future/i);
  });
});
