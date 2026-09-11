/**
 * Family Hospital UAT plan P02.03 / P02.04 — the provider service catalogue and
 * submit-time canonicalisation, edge by edge. Parity with the engine is proven
 * separately in tariff-parity.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

const FROM = new Date("2026-08-28T00:00:00Z");
const row = (id: string, serviceName: string, rate: string, categoryId: string, over: Record<string, unknown> = {}) => ({
  id, providerId: "p", contractId: "con", versionId: "v", branchId: null, clientId: null, cptCode: null, providerServiceCode: null,
  serviceName, standardDescription: null, providerDescription: serviceName, agreedRate: new Prisma.Decimal(rate), currency: "UGX",
  tariffType: "NEGOTIATED", requiresPreauth: false, maxQuantityPerVisit: null, serviceCategoryId: categoryId, rateType: "FIXED",
  discountPct: null, markupPct: null, maxPayableAmount: null, minPayableAmount: null, unitOfMeasure: "PER_ITEM", quantityLimit: null,
  requiresReferral: false, rateMissing: false, externalScheme: null, externalRebateAmount: null, notes: null, effectiveFrom: FROM,
  effectiveTo: null, isActive: true, ...over,
});

let ROWS: ReturnType<typeof row>[] = [];
const db = vi.hoisted(() => ({
  providerTariff: { findMany: vi.fn() },
  serviceCategory: { findMany: vi.fn() },
  auditLog: { create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<object>>(async () => ({})) },
  cPTCode: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const events = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock("@/server/services/capture-telemetry", () => events);

import { ProviderServiceCatalogService, resetCatalogueCache } from "@/server/services/provider-service-catalog.service";
import type { TrustedCaseContext } from "@/server/services/provider-case-context.service";
import { resetRateLimiter } from "@/lib/rate-limit";

const CATEGORIES = [
  { id: "c-lab", code: "LABORATORY", name: "Laboratory", tier: "LABORATORY", parentId: null },
  { id: "c-ph", code: "PHARMACY", name: "Pharmacy", tier: "PHARMACY", parentId: null },
  { id: "c-drugs", code: "PHARMACY_DRUGS", name: "Drugs / Medication", tier: null, parentId: "c-ph" },
  { id: "c-dental", code: "DENTAL", name: "Dental", tier: "OTHER", parentId: null },
];

const ctx = (over: Partial<TrustedCaseContext> = {}): TrustedCaseContext => ({
  tenantId: "t", providerId: "p", actorId: "u", purpose: "CLAIM", memberId: "m", clientId: null, branchId: "b",
  serviceDate: new Date("2026-09-11T00:00:00Z"), serviceDateIso: "2026-09-11", benefitCategory: "OUTPATIENT", eligible: true,
  contractId: "con", contractVersionId: "v", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null,
  catalogueEnabled: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetCatalogueCache();
  resetRateLimiter();
  ROWS = [
    row("a-fbc", "Full Blood Count", "25000", "c-lab"),
    row("b-malaria", "Malaria Rapid Diagnostic Test", "10000", "c-lab"),
    row("c-azi", "Azithromycin 500Mg", "70000", "c-drugs", { notes: "Unit: Vial" }),
    row("d-azi", "Azithromycin 500Mg", "4807", "c-drugs", { notes: "Unit: Tab" }),
    row("e-ext", "Surgical Extraction", "150000", "c-dental"),
    row("f-kes", "Imported Kit", "500", "c-lab", { currency: "KES" }),
    row("g-disc", "Discounted Scan", "0", "c-lab", { rateType: "DISCOUNT_OFF_BILLED", discountPct: new Prisma.Decimal("10") }),
  ];
  db.providerTariff.findMany.mockImplementation(async () => [...ROWS].sort((x, y) => (x.id < y.id ? -1 : 1)));
  db.serviceCategory.findMany.mockResolvedValue(CATEGORIES);
});

describe("search — gates", () => {
  it("needs a resolved context, the facility flag, a category and two characters", async () => {
    expect(await ProviderServiceCatalogService.search(null, { category: "LABORATORY", query: "blood" })).toMatchObject({ ok: false, code: "CONTEXT_INVALID" });
    expect(await ProviderServiceCatalogService.search(ctx({ catalogueEnabled: false }), { category: "LABORATORY", query: "blood" })).toMatchObject({ ok: false, code: "CATALOGUE_DISABLED" });
    expect(await ProviderServiceCatalogService.search(ctx(), { category: "NOPE", query: "blood" })).toMatchObject({ ok: false, code: "CONTEXT_INVALID" });
    expect(await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "b " })).toMatchObject({ ok: false, code: "TOO_SHORT" });
    expect(db.providerTariff.findMany).not.toHaveBeenCalled();
  });

  it("never reads the global CPT reference table", async () => {
    await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "blood" });
    expect(db.cPTCode.findMany).not.toHaveBeenCalled();
  });
});

describe("search — category is a real filter (FH-06)", () => {
  it("finds by partial description inside the chosen category only", async () => {
    const r = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "blood cou" });
    expect(r.ok && r.rows.map((x) => x.tariffId)).toEqual(["a-fbc"]);
  });

  it("matches every word anywhere, ranked by leading match", async () => {
    const r = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "test malaria" });
    expect(r.ok && r.rows[0].tariffId).toBe("b-malaria");
  });

  it("says where the text matched when nothing matched in the chosen category", async () => {
    const r = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "extraction" });
    expect(r).toMatchObject({ ok: true, rows: [], total: 0, otherCategoryMatches: [{ category: "OTHER", count: 1 }] });
  });

  it("returns the facility's own grouping, the unit and the rate as decimal text", async () => {
    const r = await ProviderServiceCatalogService.search(ctx(), { category: "PHARMACY", query: "azith" });
    expect(r.ok && r.rows.find((x) => x.tariffId === "d-azi")).toMatchObject({ taxonomyName: "Drugs / Medication", unitLabel: "per item · Tab", unitRate: "4807", currency: "UGX" });
  });
});

describe("search — never the first row of an ambiguity (P02.03 step 5)", () => {
  it("shows both same-name rows at different prices as not selectable, with a reason", async () => {
    const r = await ProviderServiceCatalogService.search(ctx(), { category: "PHARMACY", query: "azith" });
    expect(r.ok && r.rows.map((x) => [x.tariffId, x.selectable])).toEqual([["c-azi", false], ["d-azi", false]]);
    expect(r.ok && r.rows[0].unavailableReason).toMatch(/different prices/);
    expect(events.captureEvent).toHaveBeenCalledWith("catalogue_ambiguity", expect.objectContaining({ count: 2 }));
  });

  it("marks another-currency and rule-priced rows as not selectable", async () => {
    const r = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "i" + "m" });
    const kit = r.ok && r.rows.find((x) => x.tariffId === "f-kes");
    expect(kit).toMatchObject({ selectable: false, unavailableReason: expect.stringMatching(/currency/) });
    const scan = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "scan" });
    expect(scan.ok && scan.rows[0]).toMatchObject({ tariffId: "g-disc", selectable: false });
  });
});

describe("search — abnormal enumeration is throttled and audited once", () => {
  it("throttles past 120 searches a minute and writes one audit row", async () => {
    for (let i = 0; i < 120; i += 1) await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "blood" });
    const r1 = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "blood" });
    const r2 = await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "blood" });
    expect(r1).toMatchObject({ ok: false, code: "THROTTLED" });
    expect(r2).toMatchObject({ ok: false, code: "THROTTLED" });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "PROVIDER_CATALOGUE_SEARCH_THROTTLED", tenantId: "t", userId: "u" });
  });

  it("normal searches write nothing to the audit log", async () => {
    await ProviderServiceCatalogService.search(ctx(), { category: "LABORATORY", query: "blood" });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("canonicalizeLines — P02.04 tampering and staleness", () => {
  const line = (over: Record<string, unknown> = {}) => ({ selectedProviderTariffId: "a-fbc", serviceCategory: "LABORATORY", quantity: 1, billedUnitPrice: "25000", ...over }) as never;

  it("takes name, category, codes, rate and currency from the row — not the browser", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [
      { ...(line() as object), description: "Something the browser invented", tariffRate: "1", currency: "KES" } as never,
    ]);
    expect(r).toMatchObject({ ok: true, lines: [{ description: "Full Blood Count", serviceCategory: "LABORATORY", tariffRate: "25000", currency: "UGX", cptCode: null, unlisted: false }] });
  });

  it("rejects a tariff id that is not in the engine's candidate set (stale/expired/foreign)", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [line({ selectedProviderTariffId: "not-here" })]);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "lines.0.service": expect.stringMatching(/select the service again/i) } });
    expect(events.captureEvent).toHaveBeenCalledWith("stale_tariff_rejected", expect.objectContaining({ tariffId: "not-here", code: "NOT_IN_SCOPE" }));
  });

  it("rejects a category that does not match the selected row", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [line({ serviceCategory: "PHARMACY" })]);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "lines.0.service": expect.stringMatching(/listed under Laboratory/) } });
  });

  it("rejects an ambiguous row, a foreign-currency row and a disabled catalogue", async () => {
    expect(await ProviderServiceCatalogService.canonicalizeLines(ctx(), [line({ selectedProviderTariffId: "d-azi", serviceCategory: "PHARMACY" })])).toMatchObject({ ok: false });
    expect(await ProviderServiceCatalogService.canonicalizeLines(ctx(), [line({ selectedProviderTariffId: "f-kes" })])).toMatchObject({ ok: false });
    expect(await ProviderServiceCatalogService.canonicalizeLines(ctx({ catalogueEnabled: false }), [line()])).toMatchObject({ ok: false });
  });

  it("accepts '600,000' and keeps billed and contracted apart", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [line({ billedUnitPrice: "600,000", quantity: "2" })]);
    expect(r).toMatchObject({ ok: true, totalBilled: "1200000", lines: [{ unitCost: "600000", billedAmount: "1200000", tariffRate: "25000" }] });
  });

  it("validates quantity and price at field level", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [line({ quantity: "1.5", billedUnitPrice: "abc" })]);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "lines.0.quantity": expect.any(String), "lines.0.billedUnitPrice": expect.any(String) } });
  });
});

describe("canonicalizeLines — unlisted services (DEC-FH-01)", () => {
  const unlisted = (over: Record<string, unknown> = {}) => ({ selectedProviderTariffId: null, serviceCategory: "OTHER", description: "Special dressing", quantity: 1, billedUnitPrice: "15000", ...over }) as never;

  it("REFER_FOR_REVIEW: accepted with no tariff id and no contracted rate", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [unlisted()]);
    expect(r).toMatchObject({ ok: true, lines: [{ selectedProviderTariffId: null, tariffRate: null, description: "Special dressing", unlisted: true }] });
  });

  it("REJECT: refused", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx({ unlistedServiceRule: "REJECT" }), [unlisted()]);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "lines.0.service": expect.stringMatching(/does not pay/) } });
  });

  it("a typed name that IS on the price list must be selected from the list", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx(), [unlisted({ description: "full blood count", serviceCategory: "LABORATORY" })]);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "lines.0.service": expect.stringMatching(/on your price list/) } });
  });

  it("with the catalogue off, a typed listed name is allowed (the engine matches it)", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(ctx({ catalogueEnabled: false }), [unlisted({ description: "Full Blood Count", serviceCategory: "LABORATORY" })]);
    expect(r).toMatchObject({ ok: true });
  });

  it("requires a description and refuses markup", async () => {
    expect(await ProviderServiceCatalogService.canonicalizeLines(ctx(), [unlisted({ description: " " })])).toMatchObject({ ok: false, fieldErrors: { "lines.0.description": expect.any(String) } });
    expect(await ProviderServiceCatalogService.canonicalizeLines(ctx(), [unlisted({ description: "<b>x</b>" })])).toMatchObject({ ok: false });
  });
});
