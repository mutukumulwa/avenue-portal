/**
 * F6.2 — ProviderRemittanceService (opt-in DB).
 *
 * Runs only when DATABASE_URL === AUTOPILOT_TEST_DB (throwaway PG). Covers the
 * package's acceptance tests: cross-provider denial, the worked examples, a
 * provider-safe snapshot, no live rate recomputation, and pagination totals that
 * still reconcile. Fixtures build FROZEN settled batches directly (the throwaway
 * has no chart of accounts, so the GL-posting settlement service is not run —
 * F6.2 is a read model over stored facts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F6.2 ProviderRemittanceService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-remittance/service").ProviderRemittanceService;
  let RemittanceError: typeof import("@/server/services/provider-remittance/service").ProviderRemittanceError;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;

  /** provider A finance user, settlement.read perm. */
  function ctxA(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER", actorId: world.users.a.finance.id,
      tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.settlement.read"], apiScopes: [], requestId: "test-req",
      ...over,
    };
  }
  const ctxB = (): Ctx => ctxA({ actorId: world.users.b.id, providerId: world.providers.b.id });
  const ctxC = (): Ctx => ctxA({ actorId: world.users.c.id, tenantId: world.tenants.beta.id, providerId: world.providers.c.id });

  // Fixtures built once.
  let e4: Awaited<ReturnType<import("../factories/provider-network").ProviderWorld["createSettlementBatch"]>>;
  let pageBatch: typeof e4;
  let divergeBatch: typeof e4;
  let bBatch: typeof e4; // provider B (same tenant) — operator cross-provider visibility
  let cBatch: typeof e4; // provider C (Beta tenant) — operator cross-tenant denial

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-remittance/service");
    Svc = mod.ProviderRemittanceService;
    RemittanceError = mod.ProviderRemittanceError;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);

    // E4: billed 10000, approved 7500 (member share 750). Lines reconcile to header.
    // Line 2 sets a diverging engine payable (payerLiability 9999) to prove the
    // service reads the FROZEN approvedAmount, not the engine value.
    e4 = await world.createSettlementBatch({
      providerId: world.providers.a.id,
      withJournal: true,
      notes: "operator batch note",
      claims: [
        {
          billed: 10000, approved: 7500, memberShare: 750,
          lines: [
            { description: "Consult", billed: 5000, contractedAllowed: 5000, approved: 5000 },
            { description: "Procedure", billed: 3000, contractedAllowed: 2500, writeoff: 500, approved: 2500, payerLiability: 9999, reasonCode: { code: "PRC-001", providerDescription: "Billed above the contracted rate; paid to the contracted amount.", defaultSeverity: "SHORTFALL", internalDescription: "INTERNAL do-not-show" } },
            { description: "Excluded item", billed: 2000, contractedAllowed: null, disallowed: 2000, approved: 0, reasonCode: { code: "EXC-001", providerDescription: "This service is excluded by your agreement.", defaultSeverity: "REJECT" } },
          ],
        },
      ],
    });

    // 3 simple claims for pagination (each approved 1000, one line each).
    pageBatch = await world.createSettlementBatch({
      providerId: world.providers.a.id,
      claims: [1, 2, 3].map(() => ({ billed: 1000, approved: 1000, lines: [{ billed: 1000, approved: 1000 }] })),
    });

    // D-1: line approved (600) < claim approved (1000) ⇒ header authoritative, residual surfaced.
    divergeBatch = await world.createSettlementBatch({
      providerId: world.providers.a.id,
      claims: [{ billed: 1000, approved: 1000, lines: [{ billed: 1000, approved: 600 }] }],
    });

    bBatch = await world.createSettlementBatch({ providerId: world.providers.b.id, claims: [{ billed: 500, approved: 500, lines: [{ billed: 500, approved: 500 }] }] });
    cBatch = await world.createSettlementBatch({ providerId: world.providers.c.id, claims: [{ billed: 700, approved: 700, lines: [{ billed: 700, approved: 700 }] }] });
  });
  afterAll(async () => { if (world) await world.teardown(); });

  // ── worked example E4 + conservation ───────────────────────────────────────
  it("E4: projects batch/claim/line/reason/voucher and conserves (I5 & I6)", async () => {
    const r = await Svc.getBatchRemittance(ctxA(), e4.batch.id);

    expect(r.batch.totalAmount).toBe("7500.00");
    expect(r.batch.voucher!.voucherNumber).toBe(e4.voucher!.voucherNumber);
    expect(r.conservation.i5Holds).toBe(true);
    expect(r.conservation.i6Holds).toBe(true);
    expect(r.conservation.disbursementLeg).toBe("MISSING"); // D-7

    expect(r.claims).toHaveLength(1);
    const c = r.claims[0];
    expect(c.approved).toBe("7500.00");
    expect(c.paid).toBe("7500.00");
    expect(c.memberShare).toBe("750.00");
    expect(c.linesReconciled).toBe(true);
    expect(c.lines).toHaveLength(3);

    const writeoffLine = c.lines.find((l) => l.description === "Procedure")!;
    expect(writeoffLine.providerWriteoff).toBe("500.00");
    expect(writeoffLine.reason!.code).toBe("PRC-001");
    expect(writeoffLine.reason!.text).toMatch(/contracted amount/i);

    const excludedLine = c.lines.find((l) => l.description === "Excluded item")!;
    expect(excludedLine.disallowed).toBe("2000.00");
    expect(excludedLine.reason!.code).toBe("EXC-001");
  });

  it("no live recomputation: shows the FROZEN approvedAmount, not the engine payerLiability", async () => {
    const r = await Svc.getBatchRemittance(ctxA(), e4.batch.id);
    const line = r.claims[0].lines.find((l) => l.description === "Procedure")!;
    expect(line.approvedPayable).toBe("2500.00"); // stored Track A — the frozen fact
    expect(line.enginePayable).toBe("9999.00"); // Track B provenance, shown but NOT used as payable
  });

  // ── cross-provider / cross-tenant denial (non-enumerating) ─────────────────
  it("cross-provider: provider B cannot read provider A's batch (NOT_FOUND, non-enumerating)", async () => {
    await expect(Svc.getBatchRemittance(ctxB(), e4.batch.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("cross-tenant: provider C (Beta) cannot read Alpha's batch (NOT_FOUND)", async () => {
    await expect(Svc.getBatchRemittance(ctxC(), e4.batch.id)).rejects.toBeInstanceOf(RemittanceError);
  });
  it("permission: without provider.settlement.read ⇒ FORBIDDEN_PERMISSION", async () => {
    await expect(Svc.getBatchRemittance(ctxA({ permissions: [] }), e4.batch.id)).rejects.toBeInstanceOf(ProviderAccessError);
  });
  it("unknown batch id ⇒ NOT_FOUND (same as out-of-scope)", async () => {
    await expect(Svc.getBatchRemittance(ctxA(), "does-not-exist")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── provider-safe snapshot (no internal fields) ────────────────────────────
  it("provider-safe: excludes maker/checker/notes/journalEntryId/disbursement internals", async () => {
    const r = await Svc.getBatchRemittance(ctxA(), e4.batch.id);
    const batchKeys = Object.keys(r.batch);
    expect(batchKeys).not.toContain("makerId");
    expect(batchKeys).not.toContain("checkerId");
    expect(batchKeys).not.toContain("notes");
    expect(r.batch.disbursement).toBeNull();
    expect(r.batch.paymentFactsRecorded).toBe(false);
    expect(Object.keys(r.batch.voucher!)).not.toContain("journalEntryId");
    // claim/line internal fields never projected
    const c = r.claims[0] as unknown as Record<string, unknown>;
    expect(c.declineNotes).toBeUndefined();
    expect(c.contractedRate).toBeUndefined();
    const l = r.claims[0].lines[0] as unknown as Record<string, unknown>;
    expect(l.ruleTrace).toBeUndefined();
    expect(l.declineReason).toBeUndefined(); // free-text internal reason
    expect(l.matchedRuleType).toBeUndefined();
  });

  // ── pagination totals still reconcile ──────────────────────────────────────
  it("pagination: page slices differ but conservation totals are invariant", async () => {
    const p1 = await Svc.getBatchRemittance(ctxA(), pageBatch.batch.id, { page: 1, pageSize: 2 });
    const p2 = await Svc.getBatchRemittance(ctxA(), pageBatch.batch.id, { page: 2, pageSize: 2 });

    expect(p1.claims).toHaveLength(2);
    expect(p2.claims).toHaveLength(1);
    expect(p1.page.totalClaims).toBe(3);
    expect(p1.page.totalPages).toBe(2);

    // conservation is computed over the WHOLE batch, so it is identical on every page
    expect(p1.conservation.sumClaimPayable).toBe("3000.00");
    expect(p2.conservation.sumClaimPayable).toBe("3000.00");
    expect(p1.conservation.batchTotal).toBe("3000.00");
    expect(p1.conservation.i5Holds).toBe(true);
    // no claim appears on two pages
    const ids1 = new Set(p1.claims.map((c) => c.id));
    expect(p2.claims.every((c) => !ids1.has(c.id))).toBe(true);
  });

  // ── D-1 at the service level (R-1) ─────────────────────────────────────────
  it("D-1: a claim whose lines don't sum to its header is flagged, header stays authoritative", async () => {
    const r = await Svc.getBatchRemittance(ctxA(), divergeBatch.batch.id);
    expect(r.claims[0].approved).toBe("1000.00"); // header authoritative (R-1)
    expect(r.claims[0].lineResidual).toBe("400.00");
    expect(r.claims[0].linesReconciled).toBe(false);
    expect(r.conservation.legs.lineToHeader).toBe(false);
    expect(r.conservation.i5Holds).toBe(false);
    expect(r.conservation.notes.join(" ")).toMatch(/D-1/);
  });

  // ── listBatches provider isolation ─────────────────────────────────────────
  it("listBatches: a provider sees only its own batches", async () => {
    const a = await Svc.listBatches(ctxA());
    const aIds = new Set(a.batches.map((b) => b.id));
    expect(aIds.has(e4.batch.id)).toBe(true);
    expect(aIds.has(pageBatch.batch.id)).toBe(true);

    const b = await Svc.listBatches(ctxB());
    expect(b.batches.every((x) => !aIds.has(x.id))).toBe(true);
  });

  // ── F6.3: operator entry + admin extension + parity ────────────────────────
  describe("F6.3 getBatchRemittanceForOperator (admin extension + parity)", () => {
    const opAlpha = () => ({ tenantId: world.tenants.alpha.id });

    it("returns the SAME provider-safe model + the admin extension", async () => {
      const r = (await Svc.getBatchRemittanceForOperator(opAlpha(), e4.batch.id))!;
      // provider-safe model is identical to the provider entry's shape
      expect(r.batch.totalAmount).toBe("7500.00");
      expect(r.claims).toHaveLength(1);
      expect(r.conservation.i5Holds).toBe(true);
      // admin extension — the Safe? = N fields
      expect(r.admin.maker!.id).toBe(world.users.a.finance.id);
      expect(r.admin.checker!.id).toBe(world.users.a.admin.id);
      expect(r.admin.notes).toBe("operator batch note");
      expect(r.admin.provider.name).toBe(world.providers.a.name);
      expect(r.admin.journalEntry!.entryNumber).toMatch(/^JE-/);
    });

    it("parity: operator claim/voucher/total match a direct query (no lost fields)", async () => {
      const r = (await Svc.getBatchRemittanceForOperator(opAlpha(), e4.batch.id))!;
      const raw = await prisma.claim.findMany({ where: { settlementBatchId: e4.batch.id }, select: { claimNumber: true, billedAmount: true, approvedAmount: true }, orderBy: { claimNumber: "asc" } });
      expect(r.claims.map((c) => c.claimNumber)).toEqual(raw.map((c) => c.claimNumber));
      expect(r.claims[0].billed).toBe(Number(raw[0].billedAmount).toFixed(2));
      expect(r.claims[0].approved).toBe(Number(raw[0].approvedAmount).toFixed(2));
      const rawBatch = await prisma.providerSettlementBatch.findUnique({ where: { id: e4.batch.id }, select: { totalAmount: true } });
      expect(r.batch.totalAmount).toBe(Number(rawBatch!.totalAmount).toFixed(2));
      expect(r.batch.voucher!.voucherNumber).toBe(e4.voucher!.voucherNumber);
    });

    it("operator sees ANY provider's batch in the tenant (not provider-scoped)", async () => {
      const a = await Svc.getBatchRemittanceForOperator(opAlpha(), e4.batch.id);
      const b = await Svc.getBatchRemittanceForOperator(opAlpha(), bBatch.batch.id);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull(); // provider B's batch, same operator tenant
      expect(b!.admin.provider.name).toBe(world.providers.b.name);
    });

    it("operator cannot cross tenants (Alpha operator, Beta batch ⇒ null)", async () => {
      const res = await Svc.getBatchRemittanceForOperator(opAlpha(), cBatch.batch.id);
      expect(res).toBeNull();
    });

    it("unknown id ⇒ null (operator entry returns null, not throw)", async () => {
      expect(await Svc.getBatchRemittanceForOperator(opAlpha(), "nope")).toBeNull();
    });

    it("the provider entry never carries the admin extension", async () => {
      const p = await Svc.getBatchRemittance(ctxA(), e4.batch.id);
      expect((p as unknown as Record<string, unknown>).admin).toBeUndefined();
    });
  });

  // ── F6.5: authorized CSV export ────────────────────────────────────────────
  describe("F6.5 exportBatchCsv", () => {
    const ctxExport = (over: Partial<Ctx> = {}) => ctxA({ permissions: ["provider.settlement.read", "provider.settlement.export"], ...over });

    it("requires provider.settlement.export (read alone ⇒ FORBIDDEN)", async () => {
      await expect(Svc.exportBatchCsv(ctxA(), e4.batch.id)).rejects.toBeInstanceOf(ProviderAccessError);
    });

    it("exports the batch and its totals match the read model", async () => {
      const { filename, csv, evidence } = await Svc.exportBatchCsv(ctxExport(), e4.batch.id);
      expect(filename).toMatch(/^remittance-2026-07-.*\.csv$/);
      expect(csv.startsWith("﻿")).toBe(true);
      const read = await Svc.getBatchRemittance(ctxExport(), e4.batch.id);
      expect(evidence.totals.approved).toBe(read.conservation.sumLinePayable); // page/export totals match
      expect(evidence.rowCount).toBe(3); // E4 has 3 lines
      expect(evidence.checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it("pagination omits no rows: a tiny pageSize still exports every claim", async () => {
      // pageBatch has 3 claims × 1 line; page the read model 2-at-a-time.
      const { evidence } = await Svc.exportBatchCsv(ctxExport(), pageBatch.batch.id, { pageSize: 2 });
      expect(evidence.rowCount).toBe(3);
    });

    it("cross-provider: export of another provider's batch ⇒ NOT_FOUND", async () => {
      await expect(Svc.exportBatchCsv(ctxExport({ actorId: world.users.b.id, providerId: world.providers.b.id }), e4.batch.id))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("unknown id ⇒ NOT_FOUND", async () => {
      await expect(Svc.exportBatchCsv(ctxExport(), "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
