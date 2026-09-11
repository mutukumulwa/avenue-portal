/**
 * Family Hospital UAT plan §9 / P06 — reportNavigationRenderErrorAction writes one
 * structured, secret-free event with the session's ids; it accepts nothing from
 * the browser but an opaque digest in its known shape, and does nothing for a
 * caller who is not a provider user.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const access = vi.hoisted(() => ({ resolveUserContext: vi.fn() }));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: access,
  isProviderAccessError: (e: unknown) => (e as { name?: string })?.name === "ProviderAccessError",
}));
vi.mock("@/server/services/provider-case-context.service", () => ({ ProviderCaseContextService: {} }));
vi.mock("@/server/services/provider-service-catalog.service", () => ({ ProviderServiceCatalogService: {} }));
vi.mock("@/server/services/provider-diagnosis-search.service", () => ({ ProviderDiagnosisSearchService: {} }));

import { reportNavigationRenderErrorAction } from "@/app/provider/capture-actions";

const CTX = { actorType: "USER", actorId: "u-1", tenantId: "t-1", providerId: "p-1", allowedProviderBranchIds: ["b-1"], permissions: [], apiScopes: [], requestId: "r" };

let lines: string[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  lines = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => { lines.push(String(line)); });
});

describe("reportNavigationRenderErrorAction", () => {
  it("logs one navigation_render_error event with session ids and a well-formed digest", async () => {
    access.resolveUserContext.mockResolvedValue({ ctx: CTX });
    await reportNavigationRenderErrorAction({ digest: "4105377829" });
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event).toMatchObject({ event: "navigation_render_error", tenantId: "t-1", providerId: "p-1", actorId: "u-1", outcome: "FALLBACK_RENDERED", code: "4105377829" });
    expect(Object.keys(event).sort()).toEqual(["actorId", "at", "code", "correlationId", "event", "outcome", "providerId", "tenantId"]);
  });

  it("drops anything that is not an opaque digest", async () => {
    access.resolveUserContext.mockResolvedValue({ ctx: CTX });
    await reportNavigationRenderErrorAction({ digest: "Cannot read 'name' of Amani Testmember <script>" });
    await reportNavigationRenderErrorAction({ digest: { nested: true } } as never);
    await reportNavigationRenderErrorAction(null as never);
    expect(lines.map((l) => JSON.parse(l).code)).toEqual([null, null, null]);
    expect(lines.join("\n")).not.toContain("Amani");
  });

  it("writes nothing for a caller who is not a provider user", async () => {
    access.resolveUserContext.mockRejectedValue(Object.assign(new Error("no"), { name: "ProviderAccessError" }));
    await reportNavigationRenderErrorAction({ digest: "123" });
    expect(lines).toEqual([]);
  });
});
