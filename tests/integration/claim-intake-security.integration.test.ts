/**
 * Claims Autopilot F7.3 — security/abuse probes not covered elsewhere.
 * (The full matrix is mapped in docs/claims-autopilot/SECURITY_EVIDENCE.md.)
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/v1/claims/route";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F7.3 integration — key lifecycle + abuse bounds", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, keyId: string, plaintext: string, memberNumber: string;

  const post = (apiKey: string, body: unknown, headers: Record<string, string> = {}) =>
    POST(new Request("https://x/api/v1/claims", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": `f73-${Date.now()}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
  const validBody = () => ({
    memberNumber, serviceType: "OUTPATIENT", dateOfService: "2026-06-15",
    diagnoses: ["J06.9"], lineItems: [{ description: "X", quantity: 1, unitCost: 100 }],
  });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    providerId = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true } })).id;
    memberNumber = (await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { memberNumber: true } })).memberNumber;
    const k = await ProviderApiKeyService.generate(tenantId, providerId, "F7.3 revocation probe");
    keyId = k.id;
    plaintext = k.plaintext;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.providerApiKey.deleteMany({ where: { id: keyId } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { startsWith: "f73-" } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("missing and bogus keys are 401 without existence leakage", async () => {
    const missing = await POST(new Request("https://x/api/v1/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody()) }));
    expect(missing.status).toBe(401);
    const bogus = await post("mvxk_not_a_real_key_0000000000000000", validBody());
    expect(bogus.status).toBe(401);
  });

  it("oversized bodies are refused up front (413) before any parsing", async () => {
    const huge = "x".repeat(1_100_000);
    const res = await post(plaintext, huge, { "content-length": String(huge.length) });
    expect(res.status).toBe(413);
  });
  it("a REVOKED key stops working immediately (401)", async () => {
    await ProviderApiKeyService.revoke(tenantId, providerId, keyId);
    const res = await post(plaintext, validBody());
    expect(res.status).toBe(401);
  });

});
