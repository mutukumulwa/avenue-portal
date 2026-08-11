/**
 * DEF-020 — client-confinement enforcement for a confined operator (User.clientId set,
 * e.g. a Lakeview-confined Underwriter). The confinement was applied on scheme
 * create/edit/status and the member LIST, but leaked on the scheme LIST, the scheme
 * VIEW (raw findUnique), the member VIEW, and the clients list/detail. This suite pins
 * the service-level confinement + a static tripwire on the page query scoping so a
 * confined operator can never see or open another client's data.
 *
 * Runs with no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockPrisma = vi.hoisted(() => ({
  client: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { ClientsService } from "@/server/services/clients.service";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.client.findMany.mockResolvedValue([]);
  mockPrisma.client.findFirst.mockResolvedValue({ id: "c-lakeview" });
});

describe("ClientsService client-confinement (DEF-020)", () => {
  it("list is tenant-wide for an unconfined operator (no id filter)", async () => {
    await ClientsService.list("t1");
    expect(mockPrisma.client.findMany.mock.calls[0][0].where).toEqual({ operatorTenantId: "t1" });
  });

  it("list is scoped to the confined client's id", async () => {
    await ClientsService.list("t1", "c-lakeview");
    expect(mockPrisma.client.findMany.mock.calls[0][0].where).toEqual({
      operatorTenantId: "t1",
      id: "c-lakeview",
    });
  });

  it("getById returns null when a confined operator requests a FOREIGN client id (no DB read)", async () => {
    const res = await ClientsService.getById("t1", "c-other", "c-lakeview");
    expect(res).toBeNull();
    expect(mockPrisma.client.findFirst).not.toHaveBeenCalled();
  });

  it("getById reads the client when the confined id matches the requested id", async () => {
    await ClientsService.getById("t1", "c-lakeview", "c-lakeview");
    expect(mockPrisma.client.findFirst).toHaveBeenCalledOnce();
  });

  it("getById is unconstrained for an unconfined operator", async () => {
    await ClientsService.getById("t1", "c-any");
    expect(mockPrisma.client.findFirst).toHaveBeenCalledOnce();
  });
});

// Static tripwire: the confinement leaks were pages issuing tenant-only queries. Pin that
// each scoping surface consults session.user.clientId so a refactor can't silently reopen
// the cross-client hole (the pages are server components, exercised for real in UAT).
describe("DEF-020 page query scoping references session.user.clientId", () => {
  const root = join(__dirname, "..", "..", "src", "app", "(admin)");
  const surfaces: Array<[string, string]> = [
    ["scheme list", "groups/page.tsx"],
    ["scheme view (copied-id)", "groups/[id]/page.tsx"],
    ["member view (copied-id)", "members/[id]/page.tsx"],
    ["member list", "members/page.tsx"],
    ["clients list", "clients/page.tsx"],
    ["client view (copied-id)", "clients/[id]/page.tsx"],
  ];
  it.each(surfaces)("%s scopes by clientId", (_name, rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src).toMatch(/session\.user\.clientId/);
  });
});
