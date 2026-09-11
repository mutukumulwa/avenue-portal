/**
 * Family Hospital UAT plan P08.01 — the provider capture lookups as Server
 * Actions (src/app/provider/capture-actions.ts), at the action layer: an
 * unauthenticated caller gets the framework's sign-in redirect; a signed-in
 * account that is not a provider user gets FORBIDDEN with no lookup; scope
 * always comes from the session, and only the named, typed fields of the body
 * reach the services — a providerId or tenantId in the body goes nowhere. The
 * services' own rules (entitlement, minimal DTOs) are tested with the services.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SESSION_CTX = { actorType: "USER", actorId: "u1", tenantId: "t1", providerId: "prov-1", allowedProviderBranchIds: ["br-1"], permissions: ["provider.claim.create"], apiScopes: [] as string[], requestId: "r" };
const access = vi.hoisted(() => ({ resolveUserContext: vi.fn() }));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: access,
  isProviderAccessError: (e: unknown) => (e as { name?: string } | null)?.name === "ProviderAccessError",
}));
const caseSvc = vi.hoisted(() => ({ resolve: vi.fn(), reconstruct: vi.fn() }));
vi.mock("@/server/services/provider-case-context.service", () => ({ ProviderCaseContextService: caseSvc }));
const catalogue = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/server/services/provider-service-catalog.service", () => ({ ProviderServiceCatalogService: catalogue }));
const dx = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/server/services/provider-diagnosis-search.service", () => ({ ProviderDiagnosisSearchService: dx }));

import { resolveCaseContextAction, searchServiceCatalogAction, searchDiagnosesAction } from "@/app/provider/capture-actions";

const REDIRECT = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
const NOT_PROVIDER = () => Object.assign(new Error("not a provider user"), { name: "ProviderAccessError" });

beforeEach(() => {
  vi.resetAllMocks();
  access.resolveUserContext.mockResolvedValue({ ctx: SESSION_CTX });
  caseSvc.resolve.mockResolvedValue({ result: { outcome: "RESOLVED", context: { memberRef: "mem-1" }, correlationId: "c" }, trusted: {} });
  caseSvc.reconstruct.mockResolvedValue({ trusted: true });
  catalogue.search.mockResolvedValue({ ok: true, rows: [], total: 0, hasMore: false, otherCategoryMatches: [] });
  dx.search.mockResolvedValue({ ok: true, options: [] });
});

describe("capture lookups — who may call them", () => {
  it("an unauthenticated caller gets the sign-in redirect from every lookup, and no service runs", async () => {
    access.resolveUserContext.mockRejectedValue(REDIRECT());
    await expect(resolveCaseContextAction({ purpose: "CLAIM", memberNumber: "TST-2026-00001", branchId: "br-1", serviceDate: "2026-09-11" } as never)).rejects.toThrow("NEXT_REDIRECT");
    await expect(searchServiceCatalogAction({ context: {}, category: "LABORATORY", query: "blood" } as never)).rejects.toThrow("NEXT_REDIRECT");
    await expect(searchDiagnosesAction({ purpose: "CLAIM", query: "mal" })).rejects.toThrow("NEXT_REDIRECT");
    expect(caseSvc.resolve).not.toHaveBeenCalled();
    expect(catalogue.search).not.toHaveBeenCalled();
    expect(dx.search).not.toHaveBeenCalled();
  });

  it("a signed-in account that is not a provider user is refused by every lookup, and no service runs", async () => {
    access.resolveUserContext.mockRejectedValue(NOT_PROVIDER());
    expect(await resolveCaseContextAction({ purpose: "CLAIM", memberNumber: "TST-2026-00001" } as never)).toMatchObject({ outcome: "FORBIDDEN" });
    expect(await searchServiceCatalogAction({ context: {}, query: "blood" } as never)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await searchDiagnosesAction({ purpose: "CLAIM", query: "mal" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(caseSvc.resolve).not.toHaveBeenCalled();
    expect(catalogue.search).not.toHaveBeenCalled();
    expect(dx.search).not.toHaveBeenCalled();
  });
});

describe("capture lookups — what reaches the services", () => {
  it("member resolution: the session's scope, only the named fields, typed; malformed values are dropped", async () => {
    const res = await resolveCaseContextAction({
      purpose: "CLAIM", memberNumber: "TST-2026-00001", branchId: "br-1", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT",
      providerId: "prov-OTHER", tenantId: "t-OTHER", memberRef: 42,
    } as never);
    expect(caseSvc.resolve).toHaveBeenCalledTimes(1);
    const [ctx, req] = caseSvc.resolve.mock.calls[0];
    expect(ctx).toBe(SESSION_CTX);
    expect(req).toEqual({ purpose: "CLAIM", memberNumber: "TST-2026-00001", memberRef: undefined, branchId: "br-1", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" });
    expect(res).toEqual({ outcome: "RESOLVED", context: { memberRef: "mem-1" }, correlationId: "c" }); // the service's DTO, nothing added

    await resolveCaseContextAction({ purpose: "CLAIM", memberNumber: { $ne: null }, branchId: ["br-1"], serviceDate: 20260911 } as never);
    expect(caseSvc.resolve.mock.calls[1][1]).toEqual({ purpose: "CLAIM", memberNumber: undefined, memberRef: undefined, branchId: null, serviceDate: "", benefitCategory: undefined });
    await resolveCaseContextAction(null as never); // no body at all
    expect(caseSvc.resolve.mock.calls[2][1]).toMatchObject({ memberNumber: undefined, serviceDate: "" });
  });

  it("service search: the case is rebuilt from the session, and only category/query/limit/offset travel", async () => {
    await searchServiceCatalogAction({ context: { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-1", serviceDate: "2026-09-11" }, category: "LABORATORY", query: "blood", limit: 20, offset: 0, providerId: "prov-OTHER", unitRate: "1" } as never);
    expect(caseSvc.reconstruct).toHaveBeenCalledWith(SESSION_CTX, { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-1", serviceDate: "2026-09-11" });
    const [trusted, query, correlationId] = catalogue.search.mock.calls[0];
    expect(trusted).toEqual({ trusted: true });
    expect(query).toEqual({ category: "LABORATORY", query: "blood", limit: 20, offset: 0 });
    expect(typeof correlationId).toBe("string");
  });

  it("diagnosis search: the session's scope and only purpose/query", async () => {
    await searchDiagnosesAction({ purpose: "PREAUTH", query: "L72", providerId: "prov-OTHER" } as never);
    expect(dx.search).toHaveBeenCalledWith(SESSION_CTX, { purpose: "PREAUTH", query: "L72" });
  });
});
