// @vitest-environment node
/**
 * Claims Autopilot F5.4 — CSV import rail REAL-DB proof.
 * (node env: undici's request.formData() file parsing breaks under jsdom —
 * the parser builds files with the jsdom global File and then fails its own
 * webidl File brand check.)
 *
 * The import route submits every valid row through the canonical intake with the
 * durable key csv:<fileSha₁₆>:<sheet>:<row>:<providerId>. Proves: mixed file
 * (valid + malformed + duplicate-invoice + future-date rows) with per-row
 * isolation and explicit partial success; total conservation (file = imported +
 * replayed + linked + skipped); full-file replay ⇒ zero new claims; preview ⇒
 * zero writes; large-file bound.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL. Run sequentially.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/lib/auth", () => ({ auth: async () => sessionHolder.session }));

import { POST } from "@/app/api/claims/import/route";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { resetClaimProcessor } from "@/server/jobs/claim-autopilot.job";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.4 integration — CSV import converges on canonical intake", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, memberNumber: string, providerName: string, systemActorId: string;
  const RUN = Date.now().toString(36);
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  async function buildXlsx(rows: (string | number)[][]): Promise<Buffer> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Claims");
    ws.addRow(["MemberNumber", "ProviderName", "DateOfService", "Diagnosis", "CPT", "BilledAmount", "Invoice"]);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  // Hand-rolled multipart: the jsdom FormData and undici Request classes don't
  // interoperate in this test environment; a raw body parses server-side into
  // undici's own File exactly like a real browser upload.
  const post = async (file: Buffer, extra: Record<string, string> = {}) => {
    const boundary = `----vitest${Math.random().toString(36).slice(2)}`;
    const chunks: Buffer[] = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="import.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
      ),
      file,
      Buffer.from("\r\n"),
    ];
    for (const [k, v] of Object.entries({ format: "json", ...extra })) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const res = await POST(
      new Request("https://x/api/claims/import", {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        body: Buffer.concat(chunks),
      }),
    );
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const claimCount = () => prisma.claim.count({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { startsWith: "csv:" } } } } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    tenantId = (await prisma.tenant.findFirstOrThrow()).id;
    systemActorId = await getSystemActorId(tenantId);
    sessionHolder.session = { user: { id: systemActorId, role: "CLAIMS_OFFICER", tenantId } };
    memberNumber = (await prisma.member.findFirstOrThrow({ where: { tenantId, status: "ACTIVE" }, select: { memberNumber: true } })).memberNumber;
    providerName = (await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" }, select: { name: true } })).name;
  });

  afterAll(async () => {
    if (!prisma) return;
    const claims = await prisma.claim.findMany({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { startsWith: "csv:" } } } }, select: { id: true } });
    const ids = claims.map((c) => c.id);
    await prisma.claimProcessingStage.deleteMany({ where: { run: { claimId: { in: ids } } } }).catch(() => undefined);
    await prisma.claimProcessingRun.deleteMany({ where: { claimId: { in: ids } } }).catch(() => undefined);
    await prisma.claimIntakeReceipt.deleteMany({ where: { tenantId, idempotencyKey: { startsWith: "csv:" } } }).catch(() => undefined);
    await prisma.claim.updateMany({ where: { id: { in: ids }, status: { notIn: ["APPROVED", "PARTIALLY_APPROVED", "VOID"] } }, data: { status: "VOID" } }).catch(() => undefined);
    resetClaimProcessor();
    await prisma.$disconnect();
  });

  // Built ONCE and reused: ExcelJS stamps creation dates into the workbook, so
  // two builds of identical rows are different BYTES (different fileSha ⇒
  // different keys). Replay must be byte-identical, as a real re-upload is.
  let mixedFile: Buffer;
  const mixedRows = () => [
    [memberNumber, providerName, "2026-06-05", "J06.9", "99213", 3000, `INV-CSV-${RUN}-A`], // valid + invoice
    [memberNumber, providerName, "2026-06-06", "J06.9", "99213", 3000, `INV-CSV-${RUN}-A`], // SAME invoice ⇒ links to the row above
    [memberNumber, providerName, "2026-06-07", "I10", "", 4500, ""], // valid, no invoice
    [memberNumber, providerName, future, "I10", "", 2000, ""], // future date ⇒ canonical structural reject (per-row isolation)
    ["", providerName, "2026-06-08", "I10", "", 1000, ""], // missing member
    [memberNumber, "No Such Facility Ltd", "2026-06-09", "I10", "", 1500, ""], // unknown provider
    [memberNumber, providerName, "2026-06-10", "I10", "", -50, ""], // bad amount
  ];

  it("mixed file: per-row canonical receipts, duplicate-invoice links, partial success explicit, totals conserved", async () => {
    const before = await claimCount();
    mixedFile = await buildXlsx(mixedRows());
    const { status, json } = await post(mixedFile);
    expect(status).toBe(200);

    const outcomes = json.results.map((r: { row: number; outcome: string }) => [r.row, r.outcome]);
    expect(outcomes).toContainEqual([2, "IMPORTED"]);
    expect(outcomes).toContainEqual([3, "LINKED"]); // same invoice namespace ⇒ linked, no second claim
    expect(outcomes).toContainEqual([4, "IMPORTED"]);
    expect(json.errors.map((e: { row: number }) => e.row).sort()).toEqual([5, 6, 7, 8]); // future date + 3 malformed
    expect(JSON.stringify(json.errors)).toMatch(/future/i);

    // conservation: file total = imported + replayed + linked + skipped
    const c = json.conservation;
    expect(c.fileTotal).toBeCloseTo(3000 + 3000 + 4500 + 2000 + 1000 + 1500 + 50 * 0, 2); // -50 row contributes 0
    expect(c.importedTotal + c.replayedTotal + c.linkedTotal + c.skippedTotal).toBeCloseTo(c.fileTotal, 2);

    expect((await claimCount()) - before).toBe(2); // rows 2+4 created; row 3 linked

    // receipts carry the CSV channel + durable key shape
    const receipt = await prisma.claimIntakeReceipt.findFirstOrThrow({
      where: { tenantId, idempotencyKey: { startsWith: "csv:" } },
      select: { channel: true, scopeKey: true },
    });
    expect(receipt.channel).toBe("CSV_IMPORT");
    expect(receipt.scopeKey).toBe(`user:${systemActorId}`);
    const claim = await prisma.claim.findFirstOrThrow({ where: { tenantId, intakeReceipts: { some: { idempotencyKey: { startsWith: "csv:" } } } }, select: { source: true } });
    expect(claim.source).toBe("BATCH");
  });

  it("re-uploading the SAME file replays every row — zero additional claims", async () => {
    const before = await claimCount();
    const { status, json } = await post(mixedFile); // byte-identical re-upload
    expect(status).toBe(200);
    const outcomes = json.results.map((r: { outcome: string }) => r.outcome);
    expect(outcomes.filter((o: string) => o === "REPLAYED").length).toBe(3); // rows 2,3,4 all replay their receipts
    expect(outcomes).not.toContain("IMPORTED");
    expect(await claimCount()).toBe(before); // conservation under replay
  });

  it("preview validates everything and creates NOTHING", async () => {
    const before = await claimCount();
    const rows = [[memberNumber, providerName, "2026-06-11", "J06.9", "", 7500, `INV-CSV-${RUN}-P`]];
    const { status, json } = await post(await buildXlsx(rows), { mode: "preview" });
    expect(status).toBe(200);
    expect(json.preview).toBe(true);
    expect(json.results[0].outcome).toBe("VALID");
    expect(json.results[0].claimNumber).toBeNull();
    expect(await claimCount()).toBe(before);
    expect(await prisma.claimIntakeReceipt.count({ where: { tenantId, idempotencyKey: { contains: `INV-CSV-${RUN}-P` } } })).toBe(0);
  });

  it("bounds the row count (large-file limit)", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [memberNumber, providerName, "2026-06-05", "I10", "", 100 + i, ""]);
    const { status, json } = await post(await buildXlsx(rows));
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toMatch(/limit is 2000/);
  }, 30_000);
});
