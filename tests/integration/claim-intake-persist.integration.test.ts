/**
 * Claims Autopilot F3.3 — canonical persistence REAL-DB proof.
 * Totals, source mapping, initial run, receipt linkage, transaction rollback,
 * strong-fingerprint concurrency link, and suspected-content separation — all
 * against a seeded Postgres.
 *
 * OPT-IN gate: AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { computeRequestHash, computeStrongEventFingerprint, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { persistClaimWithinTransaction, persistClaim, type PersistInput } from "@/server/services/claim-intake/persist";
import type { IntakeContext } from "@/server/services/claim-intake/context";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F3.3 integration — canonical persistence", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string, providerId: string, memberId: string, clientId: string | null;
  const receiptIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const t = await prisma.tenant.findFirstOrThrow();
    tenantId = t.id;
    const p = await prisma.provider.findFirstOrThrow({ where: { tenantId, contractStatus: "ACTIVE" } });
    providerId = p.id;
    const m = await prisma.member.findFirstOrThrow({ where: { tenantId }, include: { group: { select: { clientId: true } } } });
    memberId = m.id;
    clientId = m.group?.clientId ?? null;
  });

  afterAll(async () => {
    if (!prisma) return;
    const claimIds = (await prisma.claimIntakeReceipt.findMany({ where: { id: { in: receiptIds }, claimId: { not: null } }, select: { claimId: true } })).map((r) => r.claimId!) as string[];
    await prisma.claimProcessingRun.deleteMany({ where: { receiptId: { in: receiptIds } } });
    await prisma.claimIntakeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await prisma.claimLine.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    await prisma.$disconnect();
  });

  function ctx(): IntakeContext {
    return { tenantId, channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:f33", actorId: "f33", isSystemActor: false, providerId, providerBranchId: null, clientId, memberId, currency: "UGX", providerOwnsInvoiceNamespace: true, integrationKeyId: null };
  }

  async function setup(opts: { invoice?: string; contextOver?: Partial<IntakeContext> } = {}): Promise<PersistInput> {
    seq += 1;
    const raw = {
      schemaVersion: "1", idempotencyKey: `f33-${Date.now()}-${seq}`,
      member: { memberId }, provider: { providerId },
      encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
      diagnoses: [{ code: "J06.9", isPrimary: true }],
      lines: [
        { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" },
        { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "J06.9", description: "FBC", quantity: 1, unitCost: "2000.00", billedAmount: "2000.00" },
      ],
      currency: "UGX",
      ...(opts.invoice ? { invoiceNumber: opts.invoice, externalClaimRef: opts.invoice } : {}),
    };
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw new Error("bad fixture: " + JSON.stringify(parsed.error.issues));
    const n = normalizeSubmission(parsed.data);
    const context = { ...ctx(), ...opts.contextOver };
    const strong = opts.invoice ? computeStrongEventFingerprint({ tenantId, providerId, providerOwnsInvoiceNamespace: true, invoiceNumber: opts.invoice }) : null;
    const suspect = computeSuspectedDuplicateFingerprint({ tenantId, providerId, memberKey: memberId, normalized: n });
    const requestHash = computeRequestHash(n);
    const res = await reserveReceipt(prisma, { tenantId, scopeKey: context.scopeKey, channel: "ADMIN_PORTAL", idempotencyKey: raw.idempotencyKey, schemaVersion: "1", requestHash, strongEventFingerprint: strong, suspectedDuplicateFingerprint: suspect, correlationId: `corr-${seq}` });
    receiptIds.push(res.receipt.id);
    return { context, normalized: n, receiptId: res.receipt.id, requestHash, strongEventFingerprint: strong, suspectedDuplicateFingerprint: suspect };
  }

  it("CREATED: claim + lines + run persisted; receipt linked; totals correct; no post-effects", async () => {
    const inp = await setup();
    const r = await persistClaim(prisma, inp);
    expect(r.kind).toBe("CREATED");
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: r.kind === "CREATED" ? r.claimId : "" }, include: { claimLines: true, processingRuns: true, adjudicationLogs: true, fraudAlerts: true } });
    expect(Number(claim.billedAmount)).toBe(3500);
    expect(claim.source).toBe("MANUAL");
    expect(claim.status).toBe("RECEIVED");
    expect(claim.processingState).toBe("PENDING");
    expect(claim.claimRevision).toBe(1);
    expect(claim.strongEventFingerprint).toBeNull();
    expect(claim.suspectedDuplicateFingerprint).toMatch(/^suspect:v1:/);
    expect(claim.claimLines).toHaveLength(2);
    expect(claim.claimLines.reduce((s, l) => s + Number(l.billedAmount), 0)).toBe(3500);
    // one initial run, PENDING
    expect(claim.processingRuns).toHaveLength(1);
    expect(claim.processingRuns[0]).toMatchObject({ sequence: 1, trigger: "INITIAL", state: "PENDING", claimRevision: 1 });
    // NO post-effects: persist never adjudicates or raises fraud
    expect(claim.adjudicationLogs).toHaveLength(0);
    expect(claim.fraudAlerts).toHaveLength(0);
    // receipt SUCCEEDED + linked
    const rec = await prisma.claimIntakeReceipt.findUniqueOrThrow({ where: { id: inp.receiptId } });
    expect(rec.state).toBe("SUCCEEDED");
    expect(rec.claimId).toBe(claim.id);
  });

  it("STRONG_LINK (sequential): a second submission of the same authoritative invoice links to the first claim", async () => {
    const invoice = `INV-F33-${Date.now()}`;
    const a = await persistClaim(prisma, await setup({ invoice }));
    expect(a.kind).toBe("CREATED");
    const b = await persistClaim(prisma, await setup({ invoice }));
    expect(b.kind).toBe("STRONG_LINK");
    expect(b.kind === "STRONG_LINK" && b.claimId).toBe(a.kind === "CREATED" && a.claimId);
    // exactly one claim carries that strong fingerprint
    const strong = computeStrongEventFingerprint({ tenantId, providerId, providerOwnsInvoiceNamespace: true, invoiceNumber: invoice });
    expect(await prisma.claim.count({ where: { tenantId, strongEventFingerprint: strong } })).toBe(1);
  });

  it("STRONG_LINK (concurrent): two simultaneous submissions of one invoice ⇒ one claim, one link", async () => {
    const invoice = `INV-F33C-${Date.now()}`;
    const [x, y] = await Promise.all([persistClaim(prisma, await setup({ invoice })), persistClaim(prisma, await setup({ invoice }))]);
    const kinds = [x.kind, y.kind].sort();
    expect(kinds).toEqual(["CREATED", "STRONG_LINK"]);
    const strong = computeStrongEventFingerprint({ tenantId, providerId, providerOwnsInvoiceNamespace: true, invoiceNumber: invoice });
    expect(await prisma.claim.count({ where: { tenantId, strongEventFingerprint: strong } })).toBe(1);
  });

  it("SUSPECTED-only content match creates SEPARATE claims (never auto-linked)", async () => {
    const a = await persistClaim(prisma, await setup()); // no invoice ⇒ no strong id
    const b = await persistClaim(prisma, await setup()); // identical content, different key
    expect(a.kind).toBe("CREATED");
    expect(b.kind).toBe("CREATED");
    expect(a.kind === "CREATED" && a.claimId).not.toBe(b.kind === "CREATED" && b.claimId);
  });

  it("rolls back fully on a failure mid-transaction (no claim, receipt stays PROCESSING)", async () => {
    const inp = await setup({ contextOver: { memberId: "nonexistent-member-id-f33" } });
    await expect(persistClaimWithinTransaction as never).toBeDefined();
    await expect(prisma.$transaction((tx) => persistClaimWithinTransaction(tx, inp))).rejects.toBeTruthy();
    const rec = await prisma.claimIntakeReceipt.findUniqueOrThrow({ where: { id: inp.receiptId } });
    expect(rec.state).toBe("PROCESSING"); // never marked succeeded
    expect(rec.claimId).toBeNull();
    expect(await prisma.claimProcessingRun.count({ where: { receiptId: inp.receiptId } })).toBe(0);
  });
});
