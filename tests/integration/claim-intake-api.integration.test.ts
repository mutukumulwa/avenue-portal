/**
 * Claims Autopilot F5.2 — B2B API rail convergence REAL-DB proof.
 *
 * POST /api/v1/claims now adapts onto the canonical ClaimIntakeService, driven
 * here through REAL ProviderApiKey auth (minted keys, bcrypt verify) against the
 * seeded disposable DB, with real provider entitlement (ProviderContract +
 * ContractApplicability) created for the test facility. Proves: 201 accept with
 * receipt + true channel/source; same-key replay (= timeout-after-commit
 * recovery); changed-payload 409; legacy externalRef replay without a header;
 * cross-provider key isolation (entitlement + D12 spoof); PA linkage attached
 * atomically; 20-way identical ⇒ ONE claim; 20-way distinct ⇒ no loss, no dup.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/v1/claims/route";
import { GET as GET_RECEIPT } from "@/app/api/v1/claims/receipts/[receiptId]/route";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { ClaimDecisionService } from "@/server/services/claim-decision.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.2 integration — B2B API converges on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerAId: string, providerBId: string, memberNumber: string, memberId: string, clientId: string;
  let keyA: string, keyB: string, keyAId: string, keyBId: string, contractId: string, systemActorId: string;
  let slladeA: string;
  const createdClaimIds: string[] = [];
  const RUN = Date.now().toString(36);
  let seq = 0;
  const key = () => `f52-${RUN}-${(seq += 1)}`;

  const body = (over: Record<string, unknown> = {}) => ({
    memberNumber,
    serviceType: "OUTPATIENT",
    dateOfService: "2026-06-12",
    diagnoses: ["J06.9"],
    lineItems: [{ description: "Consultation", quantity: 1, unitCost: 3200, cptCode: "99213" }],
    ...over,
  });
  const post = (b: unknown, apiKey: string, idem?: string) =>
    POST(
      new Request("https://x/api/v1/claims", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          ...(idem ? { "idempotency-key": idem } : {}),
        },
        body: JSON.stringify(b),
      }),
    );
  const getReceipt = (receiptId: string, apiKey: string) =>
    GET_RECEIPT(
      new Request(`https://x/api/v1/claims/receipts/${receiptId}`, { headers: { authorization: `Bearer ${apiKey}` } }),
      { params: Promise.resolve({ receiptId }) },
    );
  const track = (json: { claimNumber?: string | null }) => json.claimNumber ?? null;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    systemActorId = await getSystemActorId(tenantId);

    const [a, b] = await prisma.provider.findMany({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true, slade360ProviderId: true }, take: 2 });
    providerAId = a.id;
    providerBId = b.id;
    // Ensure provider A has a providerCode for the D12 mismatch test.
    slladeA = a.slade360ProviderId ?? `F52A-${RUN}`;
    if (!a.slade360ProviderId) await prisma.provider.update({ where: { id: a.id }, data: { slade360ProviderId: slladeA } });

    const member = await prisma.member.findFirstOrThrow({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, memberNumber: true, group: { select: { clientId: true } } },
    });
    memberId = member.id;
    memberNumber = member.memberNumber;
    clientId = member.group.clientId;

    // Real entitlement for provider A only (provider B stays un-entitled).
    const contract = await prisma.providerContract.create({
      data: {
        tenantId, providerId: providerAId,
        contractNumber: `PC-F52-${RUN}`, title: "F5.2 test MSA", status: "ACTIVE",
        startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
        applicability: { create: { clientId, inclusionType: "INCLUDE", effectiveFrom: new Date("2026-01-01"), isActive: true } },
      },
      select: { id: true },
    });
    contractId = contract.id;

    const a1 = await ProviderApiKeyService.generate(tenantId, providerAId, "F5.2 test A");
    const b1 = await ProviderApiKeyService.generate(tenantId, providerBId, "F5.2 test B");
    keyA = a1.plaintext; keyAId = a1.id;
    keyB = b1.plaintext; keyBId = b1.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const claims = await prisma.claim.findMany({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { startsWith: "f52-" } } } }, select: { id: true } });
    const ids = [...new Set([...claims.map((x) => x.id), ...createdClaimIds])];
    // Money-decided claims void through the decision service (reverses postings);
    // undecided ones have nothing to reverse — flip to VOID so no fixture pool or
    // duplicate scan ever sees them again.
    for (const c of ids) {
      await ClaimDecisionService.voidClaim(tenantId, c, { actorId: systemActorId, reason: "F5.2 cleanup" }).catch(() => undefined);
    }
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    // FK order: stages → runs → receipts. Sweep by the stable "f52-" prefix so
    // artifacts from ANY prior execution (including crashed ones) are removed.
    await prisma.claimProcessingStage.deleteMany({ where: { run: { receipt: { idempotencyKey: { startsWith: "f52-" } } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { receipt: { idempotencyKey: { startsWith: "f52-" } } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { startsWith: "f52-" } } }).catch(() => undefined);
    await prisma.providerApiKey.deleteMany({ where: { id: { in: [keyAId, keyBId] } } }).catch(() => undefined);
    await prisma.preAuthorization.deleteMany({ where: { tenantId, preauthNumber: { startsWith: `PA-F52-${RUN}` } } }).catch(() => undefined);
    if (contractId) await prisma.providerContract.delete({ where: { id: contractId } }).catch(() => undefined); // applicability cascades
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("accepts via a facility key: 201 + receipt, true channel/source, externalRef stored, processed in-request", async () => {
    const idem = key();
    const res = await post(body({ externalRef: `HMS-${RUN}-1` }), keyA, idem);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ success: true });
    expect(json.receiptId).toBeTruthy();
    expect(json.claimNumber).toMatch(/^CLM-/);
    track(json);

    const claim = await prisma.claim.findFirstOrThrow({
      where: { claimNumber: json.claimNumber, tenantId },
      select: { id: true, source: true, providerId: true, memberId: true, externalRef: true, benefitCategory: true, processingState: true },
    });
    createdClaimIds.push(claim.id);
    expect(claim.source).toBe("HMS"); // no longer hardcoded SMART
    expect(claim.providerId).toBe(providerAId); // derived from the credential
    expect(claim.memberId).toBe(memberId);
    expect(claim.externalRef).toBe(`HMS-${RUN}-1`); // continuity for legacy replay
    expect(claim.benefitCategory).toBe("OUTPATIENT"); // legacy default preserved
    expect(claim.processingState).not.toBeNull(); // D9: decided/routed in-request

    const receipt = await prisma.claimIntakeReceipt.findFirstOrThrow({ where: { idempotencyKey: idem }, select: { id: true, channel: true, scopeKey: true, state: true } });
    expect(receipt.channel).toBe("API_V1");
    expect(receipt.scopeKey).toBe(`provider:${providerAId}`);
    expect(receipt.state).toBe("SUCCEEDED");

    // Receipt status route: the owning facility reads it; another facility gets 404.
    const mine = await getReceipt(receipt.id, keyA);
    expect(mine.status).toBe(200);
    expect((await mine.json()).claimNumber).toBe(json.claimNumber);
    const theirs = await getReceipt(receipt.id, keyB);
    expect(theirs.status).toBe(404);
  });

  it("same key + same payload replays (timeout-after-commit recovery): 200, one claim", async () => {
    const idem = key();
    const b = body();
    const first = await post(b, keyA, idem);
    expect(first.status).toBe(201);
    const fj = await first.json();
    const second = await post(b, keyA, idem);
    expect(second.status).toBe(200);
    const sj = await second.json();
    expect(sj.replayed).toBe(true);
    expect(sj.claimNumber).toBe(fj.claimNumber);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: idem } } } })).toBe(1);
  });

  it("same key + CHANGED payload conflicts: 409 IDEMPOTENCY_KEY_REUSED, no mutation", async () => {
    const idem = key();
    expect((await post(body(), keyA, idem)).status).toBe(201);
    const changed = await post(body({ lineItems: [{ description: "Consultation", quantity: 2, unitCost: 3200 }] }), keyA, idem);
    expect(changed.status).toBe(409);
    const json = await changed.json();
    expect(json.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: idem } } } })).toBe(1);
  });

  it("legacy replay retained: resending a known externalRef WITHOUT a header returns the original", async () => {
    const res = await post(body({ externalRef: `HMS-${RUN}-1` }), keyA); // no Idempotency-Key
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(json.replayed).toBe(true);
    expect(json.claimNumber).toMatch(/^CLM-/);
  });

  it("cross-provider key isolation: an un-entitled facility cannot file for the member, nor spoof facility A (D12)", async () => {
    // Provider B has no contract applicability → the member is not accessible to it.
    const notEntitled = await post(body(), keyB, key());
    expect(notEntitled.status).toBe(403);
    expect((await notEntitled.json()).error).toMatch(/not accessible|not permitted/i);

    // Provider B's key naming facility A's providerCode is rejected, never re-attributed.
    const spoof = await post(body({ providerCode: slladeA }), keyB, key());
    expect(spoof.status).toBe(403);
    expect((await spoof.json()).error).toMatch(/does not match the authenticated provider/i);
    // (status filter: VOIDed leftovers from other suites' cleanup are not live claims)
    expect(await prisma.claim.count({ where: { tenantId, providerId: providerBId, memberId, status: { not: "VOID" } } })).toBe(0);
  });

  it("attaches an APPROVED pre-auth atomically via the canonical origin", async () => {
    const pa = await prisma.preAuthorization.create({
      data: {
        tenantId, preauthNumber: `PA-F52-${RUN}`, memberId, providerId: providerAId,
        benefitCategory: "OUTPATIENT", serviceType: "OUTPATIENT", submittedBy: "PROVIDER",
        status: "APPROVED", estimatedCost: 10000, approvedAmount: 10000,
        diagnoses: [{ code: "J06.9", description: "Acute URI" }], procedures: [],
        validUntil: new Date(Date.now() + 7 * 86_400_000),
      },
      select: { id: true },
    });
    const res = await post(body({ preauthReference: `PA-F52-${RUN}` }), keyA, key());
    expect(res.status).toBe(201);
    const json = await res.json();
    const claim = await prisma.claim.findFirstOrThrow({ where: { claimNumber: json.claimNumber, tenantId }, select: { id: true, preauths: { select: { id: true } } } });
    createdClaimIds.push(claim.id);
    expect(claim.preauths.map((p) => p.id)).toContain(pa.id);
    const fresh = await prisma.preAuthorization.findUniqueOrThrow({ where: { id: pa.id }, select: { status: true } });
    expect(fresh.status).toBe("ATTACHED");
  });

  it("20-way IDENTICAL concurrency (same key) yields exactly ONE claim", async () => {
    const idem = key();
    const b = body();
    const results = await Promise.all(Array.from({ length: 20 }, () => post(b, keyA, idem)));
    const statuses = results.map((r) => r.status).sort((x, y) => x - y);
    for (const s of statuses) expect([200, 201, 202]).toContain(s);
    expect(await prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: idem } } } })).toBe(1);
  });

  it("20-way DISTINCT concurrency: no loss among accepted, no duplicate claim numbers, failures only clean 503s", async () => {
    const keys = Array.from({ length: 20 }, () => key());
    const results = await Promise.all(keys.map((k) => post(body(), keyA, k)));
    const codes = results.map((r) => r.status);
    for (const s of codes) expect([201, 503]).toContain(s);
    const created = codes.filter((s) => s === 201).length;
    expect(created).toBeGreaterThanOrEqual(15); // bounded persist retries under hot contention

    const claims = await prisma.claim.findMany({
      where: { tenantId, intakeReceipts: { some: { idempotencyKey: { in: keys } } } },
      select: { id: true, claimNumber: true },
    });
    expect(claims.length).toBe(created); // every 201 has exactly one claim; no orphans
    expect(new Set(claims.map((c) => c.claimNumber)).size).toBe(claims.length); // no duplicate numbers
    // A 503'd key left its receipt PROCESSING with NO claim — retryable, not lost.
    const failedKeys = keys.filter((_, i) => codes[i] === 503);
    if (failedKeys.length) {
      const failedReceipts = await prisma.claimIntakeReceipt.findMany({ where: { idempotencyKey: { in: failedKeys } }, select: { state: true, claimId: true } });
      for (const r of failedReceipts) { expect(r.state).toBe("PROCESSING"); expect(r.claimId).toBeNull(); }
    }
  });
});
