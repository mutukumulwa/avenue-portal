/**
 * Family Hospital UAT plan P03.02 / FH-05 — diagnosis search by partial code,
 * description or category, with no price of any kind (the ICD table's
 * standardCharge is a KES reference charge and must never be read).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ iCD10Code: { findMany: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ProviderDiagnosisSearchService } from "@/server/services/provider-diagnosis-search.service";
import { resetRateLimiter } from "@/lib/rate-limit";
import type { ProviderAccessContext } from "@/server/services/provider-access.service";

const ctx = (permissions = ["provider.claim.create"]): ProviderAccessContext => ({
  actorType: "USER", actorId: "u", tenantId: "t", providerId: "p", allowedProviderBranchIds: ["b"], permissions, apiScopes: [], requestId: "r",
});

const MALARIA = [
  { code: "B50.0", description: "Plasmodium falciparum malaria with cerebral complications", category: "Certain infectious and parasitic diseases" },
  { code: "B50.9", description: "Plasmodium falciparum malaria, unspecified", category: "Certain infectious and parasitic diseases" },
  { code: "B54", description: "Malaria, unspecified", category: "Certain infectious and parasitic diseases" },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  db.iCD10Code.findMany.mockResolvedValue(MALARIA);
});

describe("ProviderDiagnosisSearchService.search", () => {
  it("finds B54 by the word 'malaria' — and ranks the leading description first", async () => {
    const r = await ProviderDiagnosisSearchService.search(ctx(), { purpose: "CLAIM", query: "malaria" });
    expect(r.ok && r.options[0].code).toBe("B54");
    expect(r.ok && r.options.map((o) => o.code)).toEqual(["B54", "B50.0", "B50.9"]);
  });

  it("finds by a code fragment, exact code first", async () => {
    db.iCD10Code.findMany.mockResolvedValue([MALARIA[1], MALARIA[2]]);
    const r = await ProviderDiagnosisSearchService.search(ctx(), { purpose: "CLAIM", query: "B54" });
    expect(r.ok && r.options[0].code).toBe("B54");
  });

  it("ANDs every word across code, description and category, and never selects a charge", async () => {
    await ProviderDiagnosisSearchService.search(ctx(), { purpose: "CLAIM", query: "falciparum cerebral" });
    const args = db.iCD10Code.findMany.mock.calls[0][0];
    expect(args.where.AND).toHaveLength(2);
    expect(args.where.AND[0].OR.map((c: Record<string, unknown>) => Object.keys(c)[0])).toEqual(["code", "description", "category"]);
    expect(args.select).toEqual({ code: true, description: true, category: true });
    expect(JSON.stringify(args)).not.toContain("standardCharge");
  });

  it("returns options with exactly code, description and category", async () => {
    const r = await ProviderDiagnosisSearchService.search(ctx(), { purpose: "CLAIM", query: "malaria" });
    expect(r.ok && Object.keys(r.options[0]).sort()).toEqual(["category", "code", "description"]);
  });

  it("needs two meaningful characters", async () => {
    expect(await ProviderDiagnosisSearchService.search(ctx(), { purpose: "CLAIM", query: "b" })).toMatchObject({ ok: false, code: "TOO_SHORT" });
    expect(await ProviderDiagnosisSearchService.search(ctx(), { purpose: "CLAIM", query: " -." })).toMatchObject({ ok: false, code: "TOO_SHORT" });
    expect(db.iCD10Code.findMany).not.toHaveBeenCalled();
  });

  it("requires the permission of the stated purpose; eligibility is not a diagnosis purpose", async () => {
    expect(await ProviderDiagnosisSearchService.search(ctx(["provider.eligibility.read"]), { purpose: "CLAIM", query: "malaria" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await ProviderDiagnosisSearchService.search(ctx(["provider.eligibility.read"]), { purpose: "ELIGIBILITY", query: "malaria" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await ProviderDiagnosisSearchService.search(ctx(["provider.preauth.create"]), { purpose: "PREAUTH", query: "malaria" })).toMatchObject({ ok: true });
  });
});

describe("ProviderDiagnosisSearchService.canonical — submit-time validation", () => {
  it("returns the catalogue's own description for a real code", async () => {
    db.iCD10Code.findUnique.mockResolvedValue({ code: "B54", description: "Malaria, unspecified" });
    expect(await ProviderDiagnosisSearchService.canonical(" b54 ")).toEqual({ code: "B54", description: "Malaria, unspecified" });
    expect(db.iCD10Code.findUnique).toHaveBeenCalledWith({ where: { code: "B54" }, select: { code: true, description: true } });
  });

  it("refuses an unknown or malformed code", async () => {
    db.iCD10Code.findUnique.mockResolvedValue(null);
    expect(await ProviderDiagnosisSearchService.canonical("ZZZ.9")).toBeNull();
    expect(await ProviderDiagnosisSearchService.canonical("<x>")).toBeNull();
    expect(await ProviderDiagnosisSearchService.canonical(42)).toBeNull();
  });
});
