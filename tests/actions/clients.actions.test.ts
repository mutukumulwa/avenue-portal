import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockService = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  getById: vi.fn(),
  hasFinancialActivity: vi.fn(),
}));
vi.mock("@/server/services/clients.service", () => ({ ClientsService: mockService }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "u1", tenantId: "t1" } }),
  ROLES: { ADMIN_ONLY: "ADMIN_ONLY" },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// p2002.ts looks up the existing client for the duplicate link.
const mockPrisma = vi.hoisted(() => ({ client: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { createClientAction } from "@/app/(admin)/clients/new/actions";
import { updateClientAction } from "@/app/(admin)/clients/[id]/edit/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}
const P2002 = (target: string[]) => ({ code: "P2002", meta: { target } });

beforeEach(() => {
  vi.clearAllMocks();
  mockService.create.mockResolvedValue({ id: "c-new" });
  mockService.update.mockResolvedValue({ id: "c1" });
  writeAudit.mockResolvedValue(undefined);
});

// ─── createClientAction ───────────────────────────────────────────────────

describe("createClientAction — DEF-013/014/015/017", () => {
  it("blank submit creates nothing and returns accessible field errors (C-002)", async () => {
    const res = await createClientAction(null, fd({}));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.name?.length).toBeGreaterThan(0);
      expect(res.fieldErrors?.type?.length).toBeGreaterThan(0);
      expect(res.fieldErrors?.currency?.length).toBeGreaterThan(0);
    }
    expect(mockService.create).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("name-only submit creates nothing (currency + type still required) (C-002)", async () => {
    const res = await createClientAction(null, fd({ name: "Lakeview" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.currency?.length).toBeGreaterThan(0);
      expect(res.fieldErrors?.type?.length).toBeGreaterThan(0);
      // Input echoed back so the form preserves it.
      expect(res.values?.name).toBe("Lakeview");
    }
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("creates and redirects to the new client on a valid submit", async () => {
    const res = await createClientAction(
      null,
      fd({ name: "Lakeview", type: "INSURER", currency: "UGX" }),
    );
    expect(mockService.create).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/clients/c-new");
    // audit carries before(null)/after
    const audit = writeAudit.mock.calls[0][0];
    expect(audit.action).toBe("CLIENT_CREATED");
    expect(JSON.parse(audit.metadata.before)).toBeNull();
    expect(JSON.parse(audit.metadata.after).currency).toBe("UGX");
    // res is undefined on the redirect (success) path
    expect(res).toBeUndefined();
  });

  it("accepts a clean lowercase prefix and stores it uppercase (D3 courtesy)", async () => {
    await createClientAction(null, fd({ name: "Lakeview", type: "INSURER", currency: "UGX", memberNumberPrefix: "lmu" }));
    // ClientsService.create(tenantId, data) → data is arg [1]
    expect(mockService.create.mock.calls[0][1].memberNumberPrefix).toBe("LMU");
  });

  it.each([
    ["lowercase-with-space", "l m u"],
    ["whitespace", "L M U"],
    ["slash", "LM/U"],
    ["apostrophe", "LM'U"],
    ["emoji", "LM😀"],
    ["formula-like", "=SUM("],
  ])("rejects unsafe prefix (%s) with a field error and no write (C-004)", async (_l, value) => {
    const res = await createClientAction(
      null,
      fd({ name: "Lakeview", type: "INSURER", currency: "UGX", memberNumberPrefix: value }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.memberNumberPrefix?.length).toBeGreaterThan(0);
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate-name P2002 to a name field error WITH a link to the existing client (C-003/DEF-014)", async () => {
    mockService.create.mockRejectedValue(P2002(["operatorTenantId", "nameNormalized"]));
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c-existing", name: "Lakeview" });

    const res = await createClientAction(null, fd({ name: "  LAKEVIEW ", type: "INSURER", currency: "UGX" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.name?.length).toBeGreaterThan(0);
      expect(res.duplicate).toEqual({ id: "c-existing", name: "Lakeview" });
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it("maps a duplicate-prefix P2002 to a prefix field error (DEF-015 — LMU on a second client)", async () => {
    mockService.create.mockRejectedValue(P2002(["operatorTenantId", "memberNumberPrefix"]));
    const res = await createClientAction(
      null,
      fd({ name: "Second Co", type: "INSURER", currency: "UGX", memberNumberPrefix: "LMU" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.memberNumberPrefix?.length).toBeGreaterThan(0);
      expect(res.duplicate).toBeUndefined();
    }
  });

  it("maps a duplicate-slug P2002 to a slug field error", async () => {
    mockService.create.mockRejectedValue(P2002(["operatorTenantId", "slug"]));
    const res = await createClientAction(null, fd({ name: "X", type: "INSURER", currency: "UGX", slug: "taken-code" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.slug?.length).toBeGreaterThan(0);
  });
});

// ─── updateClientAction ───────────────────────────────────────────────────

const currentClient = {
  id: "c1",
  name: "Old Name",
  type: "INSURER",
  currency: "UGX",
  slug: "old-name",
  memberNumberPrefix: "MVX",
  status: "ACTIVE",
  parentClientId: null,
  parentClient: null,
};

describe("updateClientAction — DEF-013/014 + D8", () => {
  it("omitting currency does NOT mutate the client (schema requires it) — kills the omission-rewrite bug", async () => {
    const res = await updateClientAction("c1", null, fd({ name: "New", type: "INSURER", status: "ACTIVE" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.currency?.length).toBeGreaterThan(0);
    expect(mockService.getById).not.toHaveBeenCalled();
    expect(mockService.update).not.toHaveBeenCalled();
  });

  it("updates and redirects when currency is unchanged", async () => {
    mockService.getById.mockResolvedValue(currentClient);
    const res = await updateClientAction(
      "c1",
      null,
      fd({ name: "New Name", type: "INSURER", currency: "UGX", status: "ACTIVE" }),
    );
    expect(mockService.hasFinancialActivity).not.toHaveBeenCalled(); // no change → no need to check
    expect(mockService.update).toHaveBeenCalledOnce();
    expect(writeAudit).toHaveBeenCalledOnce();
    const audit = writeAudit.mock.calls[0][0];
    expect(JSON.parse(audit.metadata.before).currency).toBe("UGX");
    expect(JSON.parse(audit.metadata.after).slug).toBe("old-name"); // slug immutable, echoed
    expect(redirect).toHaveBeenCalledWith("/clients/c1");
    expect(res).toBeUndefined();
  });

  it("BLOCKS a currency change once the client has activity (C-005/D8)", async () => {
    mockService.getById.mockResolvedValue(currentClient);
    mockService.hasFinancialActivity.mockResolvedValue(true);
    const res = await updateClientAction(
      "c1",
      null,
      fd({ name: "Old Name", type: "INSURER", currency: "KES", status: "ACTIVE" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.currency?.[0]).toMatch(/cannot be changed/i);
    expect(mockService.update).not.toHaveBeenCalled();
  });

  it("ALLOWS a currency change while the client has no activity", async () => {
    mockService.getById.mockResolvedValue(currentClient);
    mockService.hasFinancialActivity.mockResolvedValue(false);
    await updateClientAction(
      "c1",
      null,
      fd({ name: "Old Name", type: "INSURER", currency: "KES", status: "ACTIVE" }),
    );
    expect(mockService.update).toHaveBeenCalledOnce();
    expect(mockService.update.mock.calls[0][1]).toBe("c1"); // (tenantId, clientId, data)
    expect(mockService.update.mock.calls[0][2].currency).toBe("KES");
    expect(redirect).toHaveBeenCalledWith("/clients/c1");
  });

  it("maps a rename-collision P2002 to a name field error with a link", async () => {
    mockService.getById.mockResolvedValue(currentClient);
    mockService.update.mockRejectedValue(P2002(["operatorTenantId", "nameNormalized"]));
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c-dupe", name: "Taken" });
    const res = await updateClientAction(
      "c1",
      null,
      fd({ name: "Taken", type: "INSURER", currency: "UGX", status: "ACTIVE" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.name?.length).toBeGreaterThan(0);
      expect(res.duplicate).toEqual({ id: "c-dupe", name: "Taken" });
    }
    expect(redirect).not.toHaveBeenCalled();
  });
});
