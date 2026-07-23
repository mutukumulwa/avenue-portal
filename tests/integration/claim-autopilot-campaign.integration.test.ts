// @vitest-environment node
/**
 * Claims Autopilot F7.4 — the concurrency/failure-campaign scenarios NOT already
 * proven by earlier suites (the full 14-scenario map lives in
 * docs/claims-autopilot/CONCURRENCY_CAMPAIGN.md).
 *
 * S4  — EXACT cross-rail event race: the same provider invoice submitted through
 *       the B2B API and the CSV import CONCURRENTLY resolves to ONE claim (the
 *       strong invoice-namespace fingerprint links the loser, §8.3.1).
 * S5  — two legitimate similar visits (same content, different days, no
 *       authoritative id) BOTH persist — never silently merged (D7).
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST as API_POST } from "@/app/api/v1/claims/route";
import { POST as CSV_POST } from "@/app/api/claims/import/route";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";
import { vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/lib/auth", () => ({ auth: async () => sessionHolder.session }));

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F7.4 integration — remaining campaign scenarios", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, providerName: string, memberNumber: string, keyId: string, apiKey: string, contractId: string, clientId: string;
  const RUN = Date.now().toString(36);
  let seq = 0;
  const idem = () => `f74-${RUN}-${(seq += 1)}`;

  const apiSubmit = (invoice: string) =>
    API_POST(
      new Request("https://x/api/v1/claims", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": idem() },
        body: JSON.stringify({
          memberNumber, serviceType: "OUTPATIENT", dateOfService: "2026-06-16",
          diagnoses: ["J06.9"], lineItems: [{ description: "Race consult", quantity: 1, unitCost: 4000, cptCode: "99213" }],
          invoiceNumber: invoice,
        }),
      }),
    );
  const csvSubmit = async (invoice: string) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Claims");
    ws.addRow(["MemberNumber", "ProviderName", "DateOfService", "Diagnosis", "CPT", "BilledAmount", "Invoice"]);
    ws.addRow([memberNumber, providerName, "2026-06-16", "J06.9", "99213", 4000, invoice]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const boundary = `----f74${Math.random().toString(36).slice(2)}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="race.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="format"\r\n\r\njson\r\n--${boundary}--\r\n`),
    ]);
    return CSV_POST(new Request("https://x/api/claims/import", { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body }));
  };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    const systemActorId = await (await import("@/server/services/system-actor.service")).getSystemActorId(tenantId);
    sessionHolder.session = { user: { id: systemActorId, role: "CLAIMS_OFFICER", tenantId } };
    const provider = await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" }, select: { id: true, name: true } });
    providerId = provider.id;
    providerName = provider.name;
    const member = await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { memberNumber: true, group: { select: { clientId: true } } } });
    memberNumber = member.memberNumber;
    clientId = member.group.clientId;
    contractId = (
      await prisma.providerContract.create({
        data: {
          tenantId, providerId, contractNumber: `PC-F74-${RUN}`, title: "F7.4 campaign", status: "ACTIVE",
          startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
          applicability: { create: { clientId, inclusionType: "INCLUDE", effectiveFrom: new Date("2026-01-01"), isActive: true } },
        },
        select: { id: true },
      })
    ).id;
    const k = await ProviderApiKeyService.generate(tenantId, providerId, "F7.4 campaign");
    keyId = k.id;
    apiKey = k.plaintext;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Claims minted this run: S4 carries the invoice, S5's are only reachable
    // through their receipts — collect BOTH, or the receipt delete below hits
    // the ClaimProcessingRun.receiptId FK of an uncollected claim's run and
    // strands an orphan (receipt without runs), which the integrity gate
    // rightly flags as CRITICAL.
    const claims = await prisma.claim.findMany({ where: { tenantId, invoiceNumber: { startsWith: `INV-F74-${RUN}` } }, select: { id: true } });
    const receipts = await prisma.claimIntakeReceipt.findMany({
      where: { tenantId, idempotencyKey: { startsWith: `f74-${RUN}` }, claimId: { not: null } },
      select: { claimId: true },
    });
    const ids = [...new Set([...claims.map((c) => c.id), ...receipts.map((r) => r.claimId as string)])];
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: ids } } } });
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: ids } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, OR: [{ idempotencyKey: { startsWith: `f74-${RUN}` } }, { claimId: { in: ids } }] } });
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    await prisma.providerApiKey.deleteMany({ where: { id: keyId } }).catch(() => undefined);
    if (contractId) await prisma.providerContract.delete({ where: { id: contractId } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  it("S4 — the SAME invoice raced through API and CSV concurrently yields exactly ONE claim", async () => {
    const invoice = `INV-F74-${RUN}-RACE`;
    const [apiRes, csvRes] = await Promise.all([apiSubmit(invoice), csvSubmit(invoice)]);
    expect([200, 201]).toContain(apiRes.status);
    expect(csvRes.status).toBe(200);
    const csvJson = await csvRes.json();
    // whichever rail lost the race reports linked/replayed, never a second claim
    const claims = await prisma.claim.findMany({ where: { tenantId, invoiceNumber: invoice, status: { not: "VOID" } }, select: { id: true } });
    expect(claims.length).toBe(1);
    // Response truthfulness: EXACTLY ONE rail may report fresh creation — the
    // other must confess the link (CSV "LINKED" / API `duplicate: true`).
    const apiFresh = !(await apiRes.json()).duplicate;
    const csvOutcome = csvJson.results?.[0]?.outcome as string | undefined;
    expect(["IMPORTED", "LINKED", "REPLAYED"]).toContain(csvOutcome);
    const csvFresh = csvOutcome === "IMPORTED";
    expect(Number(apiFresh) + Number(csvFresh), `api fresh=${apiFresh}, csv=${csvOutcome}`).toBe(1);
  });

  it("S5 — two legitimate similar visits (no authoritative id) BOTH persist, never merged", async () => {
    const first = await API_POST(
      new Request("https://x/api/v1/claims", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": idem() },
        body: JSON.stringify({ memberNumber, serviceType: "OUTPATIENT", dateOfService: "2026-06-17", diagnoses: ["J06.9"], lineItems: [{ description: "Visit A", quantity: 1, unitCost: 2500 }] }),
      }),
    );
    const second = await API_POST(
      new Request("https://x/api/v1/claims", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": idem() },
        body: JSON.stringify({ memberNumber, serviceType: "OUTPATIENT", dateOfService: "2026-06-18", diagnoses: ["J06.9"], lineItems: [{ description: "Visit A", quantity: 1, unitCost: 2500 }] }),
      }),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201); // a legitimate repeat visit is NEVER silently linked (D7)
    const a = await first.json();
    const b = await second.json();
    expect(a.claimNumber).not.toBe(b.claimNumber);
    // track for cleanup via receipts (f74 prefix already covers)
  });
});
