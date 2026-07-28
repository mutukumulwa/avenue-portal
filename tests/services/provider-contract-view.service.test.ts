/**
 * F7.2 — ProviderContractViewService (opt-in DB).
 *
 * Runs only when DATABASE_URL === AUTOPILOT_TEST_DB (throwaway PG). Covers the
 * package acceptance: provider scoping (a provider sees only its own contracts,
 * non-enumerating), negotiation/future states hidden, effective-date boundaries
 * for rate lines (current / future / historical service dates), code + name
 * search, stable pagination, and the field allow-list (no sourceRef / notes /
 * creditLimit / ownership / poolId ever reaches the caller).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const DAY = 24 * 60 * 60 * 1000;
const T = Date.now();
const at = (days: number) => new Date(T + days * DAY);

describe.skipIf(!URL_SET)("F7.2 ProviderContractViewService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-contract-view/service").ProviderContractViewService;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;

  /** provider A user with provider.contract.read. */
  function ctxA(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER", actorId: world.users.a.finance.id,
      tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.contract.read"], apiScopes: [], requestId: "test-req",
      ...over,
    };
  }
  const ctxB = (): Ctx => ctxA({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/provider-contract-view/service")).ProviderContractViewService;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);

    // Attach provider-visible detail (+ sensitive header fields as leak probes) to
    // provider A's ACTIVE contract.
    await world.seedContractDetail({
      contractId: world.contracts.aActive.id,
      providerId: world.providers.a.id,
      header: {
        externalContractRef: "CN-9001", paymentTermType: "BUSINESS",
        submissionWindowDays: 7, submissionWindowBasis: "SERVICE_DATE",
        balanceBillingPolicy: "PROHIBITED", taxInclusive: "INCLUSIVE", reconciliationCadence: "MONTHLY",
        unlistedServiceRule: "DISCOUNT_OFF_BILLED", unlistedDiscountPct: 10, earlySettlementDiscountPct: 2, earlySettlementWindowDays: 30, invoiceDiscountPct: 1.5,
        // sensitive — must never surface:
        creditLimit: 5_000_000, notes: "INTERNAL: renegotiate labs in Q4", documentUrl: "https://vault/scan-secret.pdf",
        signatories: [{ party: "PROVIDER", name: "Jane Signer" }],
      },
      versions: [
        { versionNumber: 1, status: "SUPERSEDED", effectiveFrom: at(-365), effectiveTo: at(-90), changeSummary: "Initial" },
        { versionNumber: 2, status: "ACTIVE", effectiveFrom: at(-90), effectiveTo: null, changeSummary: "Repriced labs" },
      ],
      branchIds: [world.branches.a1.id],
      rates: [
        { serviceName: "Consultation", standardDescription: "General Consultation", cptCode: "99213", providerServiceCode: "SER001", codingSystem: "CPT", agreedRate: 1500, effectiveFrom: at(-90), effectiveTo: null },
        { serviceName: "FBC", standardDescription: "Complete Blood Count", cptCode: "85025", providerServiceCode: "LAB010", codingSystem: "CPT", agreedRate: 400, requiresPreauth: true, effectiveFrom: at(-90), effectiveTo: null, sourceRef: { documentId: "d1", page: 3, rawText: "scan raw text", confidence: 0.4 }, notes: "INTERNAL fbc note" },
        { serviceName: "Malaria RDT", providerServiceCode: "LAB020", agreedRate: 0, rateMissing: true, effectiveFrom: at(-90), effectiveTo: null },
        { serviceName: "Legacy Xray", cptCode: "71045", providerServiceCode: "RAD001", agreedRate: 900, effectiveFrom: at(-800), effectiveTo: at(-400) },
        { serviceName: "Future MRI", cptCode: "70551", providerServiceCode: "RAD010", agreedRate: 12000, effectiveFrom: at(30), effectiveTo: null },
      ],
      preauthRules: [{ triggerType: "AMOUNT_THRESHOLD", thresholdAmount: 50000, approvalSlaHours: 72, requiredDocumentTypes: ["PREAUTH_APPROVAL"], consequenceIfMissing: "REJECT" }],
      docRules: [{ documentType: "INVOICE", mandatory: true, consequenceIfMissing: "REJECT" }],
      exclusions: [{ cptCode: "70450", serviceName: "CT Head", reason: "Indication limit", level: "DIAGNOSIS", icdCodes: ["R51"] }],
      pricingRules: [{ ruleKind: "CAPITATION", params: { rate: 800, payBasis: "PMPM", carveOutCodes: ["99285"], poolId: "pool-secret-xyz" } }],
    });
  });
  afterAll(async () => { if (world) await world.teardown(); });

  // ── list ───────────────────────────────────────────────────────────────────
  it("list: a provider sees its in-force + historical contracts, never negotiation/future states", async () => {
    const rows = await Svc.list(ctxA(), { now: at(0) });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.has(world.contracts.aActive.id)).toBe(true);
    expect(byId.has(world.contracts.aExpired.id)).toBe(true);
    expect(byId.has(world.contracts.aFuture.id)).toBe(false); // APPROVED (future) — hidden
    expect(byId.get(world.contracts.aActive.id)!.effectiveLabel).toBe("CURRENT");
    expect(byId.get(world.contracts.aExpired.id)!.effectiveLabel).toBe("EXPIRED");
  });

  it("list: header carries no internal field", async () => {
    const row = (await Svc.list(ctxA(), { now: at(0) })).find((r) => r.id === world.contracts.aActive.id)!;
    const flat = JSON.stringify(row);
    for (const s of ["creditLimit", "documentUrl", "signatories", "renegotiate labs", "scan-secret"]) {
      expect(flat).not.toContain(s);
    }
    expect(Object.keys(row)).not.toContain("notes");
  });

  it("list: provider B cannot see provider A's contracts (scoped, non-enumerating)", async () => {
    const rows = await Svc.list(ctxB());
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has(world.contracts.bActive.id)).toBe(true);
    expect(ids.has(world.contracts.aActive.id)).toBe(false);
  });

  // ── getById ──────────────────────────────────────────────────────────────
  it("getById: full detail — header, versions, served scope, branches, rules, exclusions, capitation", async () => {
    const r = (await Svc.getById(ctxA(), world.contracts.aActive.id, { now: at(0) }))!;
    expect(r).not.toBeNull();
    expect(r.header.externalContractRef).toBe("CN-9001");
    expect(r.header.effectiveLabel).toBe("CURRENT");
    expect(r.header.conditional.unlistedServiceRule).toBe("DISCOUNT_OFF_BILLED");

    // versions: v2 current, v1 historical
    expect(r.versions).toHaveLength(2);
    expect(r.versions.find((v) => v.versionNumber === 2)!.label).toBe("CURRENT");
    expect(r.versions.find((v) => v.versionNumber === 1)!.label).toBe("EXPIRED");

    // served scope: only the active INCLUDE row (the EXCLUDE on group 2 is hidden)
    expect(r.servedScope).toHaveLength(1);
    expect(r.servedScope[0].clientId).toBe(world.clients.alpha.id);
    expect(r.servedScope[0].groupId).toBeNull();

    expect(r.branches).toHaveLength(1);
    expect(r.branches[0].name).toContain("A1");

    expect(r.preauthRules).toHaveLength(1);
    expect(r.preauthRules[0].thresholdAmount).toBe("50000");
    expect(r.documentRules).toHaveLength(1);
    expect(r.documentRules[0].documentType).toBe("INVOICE");
    expect(r.exclusions).toHaveLength(1);
    expect(r.exclusions[0].service).toBe("CT Head");

    expect(r.capitation).toHaveLength(1);
    expect(r.capitation[0].rate).toBe("800");
    expect(r.capitation[0].carveOutCodes).toEqual(["99285"]);
  });

  it("getById: no internal field leaks anywhere in the detail payload", async () => {
    const r = (await Svc.getById(ctxA(), world.contracts.aActive.id, { now: at(0) }))!;
    const flat = JSON.stringify(r);
    for (const s of ["creditLimit", "documentUrl", "signatories", "poolId", "pool-secret", "sourceRef", "snapshot", "validationReport", "renegotiate labs"]) {
      expect(flat).not.toContain(s);
    }
  });

  it("getById: a future/negotiation contract (APPROVED) is not visible", async () => {
    expect(await Svc.getById(ctxA(), world.contracts.aFuture.id, { now: at(0) })).toBeNull();
  });
  it("getById: another provider's contract ⇒ null (non-enumerating)", async () => {
    expect(await Svc.getById(ctxA(), world.contracts.bActive.id, { now: at(0) })).toBeNull();
    expect(await Svc.getById(ctxB(), world.contracts.aActive.id, { now: at(0) })).toBeNull();
  });
  it("getById: unknown id ⇒ null (same as out-of-scope)", async () => {
    expect(await Svc.getById(ctxA(), "does-not-exist")).toBeNull();
  });
  it("getById: without provider.contract.read ⇒ FORBIDDEN_PERMISSION", async () => {
    await expect(Svc.getById(ctxA({ permissions: [] }), world.contracts.aActive.id)).rejects.toBeInstanceOf(ProviderAccessError);
  });

  // ── getRates: effective boundaries ─────────────────────────────────────────
  it("getRates: at today, only lines effective now (3) — no legacy or future-dated line", async () => {
    const res = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0) }))!;
    expect(res.page.total).toBe(3);
    const names = res.rates.map((r) => r.service);
    expect(names).toContain("General Consultation");
    expect(names).toContain("Complete Blood Count");
    expect(names).toContain("Malaria RDT");
    expect(names).not.toContain("Legacy Xray");
    expect(names).not.toContain("Future MRI");
  });

  it("getRates: rateMissing surfaces as rateUnderConfirmation, never a price", async () => {
    const res = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0) }))!;
    const malaria = res.rates.find((r) => r.service === "Malaria RDT")!;
    expect(malaria.rate).toBeNull();
    expect(malaria.rateUnderConfirmation).toBe(true);
    const fbc = res.rates.find((r) => r.service === "Complete Blood Count")!;
    expect(Number(fbc.rate)).toBe(400);
    expect(fbc.requiresPreauth).toBe(true);
  });

  it("getRates: never leaks sourceRef / notes / the raw extraction text", async () => {
    const res = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0) }))!;
    const flat = JSON.stringify(res.rates);
    for (const s of ["sourceRef", "confidence", "rawText", "scan raw text", "fbc note", "versionId", "clientId", "branchId"]) {
      expect(flat).not.toContain(s);
    }
  });

  it("getRates: a future service date brings the future-dated line into effect", async () => {
    const res = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(60) }))!;
    expect(res.rates.map((r) => r.service)).toContain("Future MRI");
    expect(res.rates.map((r) => r.service)).not.toContain("Legacy Xray");
  });
  it("getRates: a historical service date brings the expired line back and drops later ones", async () => {
    const res = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(-600) }))!;
    const names = res.rates.map((r) => r.service);
    expect(names).toContain("Legacy Xray");
    expect(names).not.toContain("General Consultation");
  });

  // ── getRates: search + pagination ──────────────────────────────────────────
  it("getRates: code search matches CPT or provider code", async () => {
    const byCpt = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0), code: "85025" }))!;
    expect(byCpt.page.total).toBe(1);
    expect(byCpt.rates[0].service).toBe("Complete Blood Count");
    const byProviderCode = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0), code: "LAB" }))!;
    expect(byProviderCode.page.total).toBe(2); // LAB010 + LAB020
  });
  it("getRates: name search matches service or standard description (case-insensitive)", async () => {
    const res = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0), name: "consult" }))!;
    expect(res.page.total).toBe(1);
    expect(res.rates[0].service).toBe("General Consultation");
  });
  it("getRates: pagination slices are stable and omit no row", async () => {
    const p1 = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0), page: 1, pageSize: 2 }))!;
    const p2 = (await Svc.getRates(ctxA(), world.contracts.aActive.id, { serviceDate: at(0), page: 2, pageSize: 2 }))!;
    expect(p1.rates).toHaveLength(2);
    expect(p2.rates).toHaveLength(1);
    expect(p1.page.total).toBe(3);
    expect(p1.page.totalPages).toBe(2);
    const ids1 = new Set(p1.rates.map((r) => r.id));
    expect(p2.rates.every((r) => !ids1.has(r.id))).toBe(true);
  });

  it("getRates: another provider's contract ⇒ null", async () => {
    expect(await Svc.getRates(ctxA(), world.contracts.bActive.id, { serviceDate: at(0) })).toBeNull();
  });
  it("getRates: without provider.contract.read ⇒ FORBIDDEN_PERMISSION", async () => {
    await expect(Svc.getRates(ctxA({ permissions: [] }), world.contracts.aActive.id)).rejects.toBeInstanceOf(ProviderAccessError);
  });
});
